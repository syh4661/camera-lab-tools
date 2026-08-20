/**
 * 핵심 구조만 남긴 TypeGPU 예제.
 * HTML에 <video id="camera" autoplay playsinline muted></video>
 *       <canvas id="output" width="720" height="720"></canvas> 가 있다고 가정합니다.
 *
 * 실제 ML 깊이망 대신 RGB 밝기를 proxy depth로 사용하지만,
 * 두 render pass가 같은 command encoder와 submit을 공유합니다.
 */
import { common, d, std, tgpu } from 'typegpu';

const SIZE = 448;
const video = document.querySelector('#camera') as HTMLVideoElement;
const canvas = document.querySelector('#output') as HTMLCanvasElement;

video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
await video.play();

const root = await tgpu.init();
const device = root.device;
const context = root.configureContext({ canvas });
const format = navigator.gpu.getPreferredCanvasFormat();

const frameLayout = tgpu.bindGroupLayout({
  frame: { externalTexture: d.textureExternal() },
});
const sampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });

const depthTexture = root
  .createTexture({ size: [SIZE, SIZE], format: 'rgba8unorm' })
  .$usage('sampled', 'render');
const depthRenderView = depthTexture.createView('render');
const depthSampleView = depthTexture.createView(d.texture2d(d.f32));

const Params = d.struct({
  lightUv: d.vec2f,
  lightZ: d.f32,
  depthTexel: d.vec2f,
  normalStrength: d.f32,
});
const params = root.createUniform(Params, {
  lightUv: d.vec2f(0.5, 0.35),
  lightZ: -0.4,
  depthTexel: d.vec2f(1 / SIZE, 1 / SIZE),
  normalStrength: 4,
});

// Pass 1: RGB → depth-like texture.
// 실제 구현에서는 이 부분이 TypeGPU compute 기반 단안 깊이 네트워크가 됩니다.
const makeDepth = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const rgb = std.textureSampleBaseClampToEdge(frameLayout.$.frame, sampler.$, uv).rgb;
  const luma = std.dot(rgb, d.vec3f(0.2126, 0.7152, 0.0722));
  const depth = std.saturate(0.15 + luma * 0.75 + uv.y * 0.1);
  return d.vec4f(d.vec3f(depth), 1);
});

const readDepth = tgpu.fn([d.vec2f], d.f32)((uv) =>
  std.textureSampleLevel(depthSampleView.$, sampler.$, uv, 0).x,
);

// Pass 2: depth gradient → normal → point-light shading.
const injectLight = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const base = std.textureSampleBaseClampToEdge(frameLayout.$.frame, sampler.$, uv);
  const t = params.$.depthTexel;
  const z = readDepth(uv);
  const zL = readDepth(uv.sub(d.vec2f(t.x, 0)));
  const zR = readDepth(uv.add(d.vec2f(t.x, 0)));
  const zU = readDepth(uv.sub(d.vec2f(0, t.y)));
  const zD = readDepth(uv.add(d.vec2f(0, t.y)));

  const tx = d.vec3f(2 * t.x, 0, (zR - zL) * params.$.normalStrength);
  const ty = d.vec3f(0, -2 * t.y, (zD - zU) * params.$.normalStrength);
  const normal = std.normalize(std.cross(tx, ty));

  const position = d.vec3f(uv.x - 0.5, 0.5 - uv.y, z * 0.8);
  const light = d.vec3f(
    params.$.lightUv.x - 0.5,
    0.5 - params.$.lightUv.y,
    params.$.lightZ,
  );
  const toLight = light.sub(position);
  const distance = std.max(std.length(toLight), 0.001);
  const diffuse = std.max(std.dot(normal, toLight.div(distance)), 0);
  const attenuation = std.max(1 - distance / 1.2, 0);
  const color = base.rgb.mul(0.25 + diffuse * attenuation * attenuation * 2.5);
  return d.vec4f(std.saturate(color), 1);
});

const depthPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: makeDepth,
  targets: { format: 'rgba8unorm' },
});
const lightingPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: injectLight,
  targets: { format },
});

function frame(): void {
  const group = root.createBindGroup(frameLayout, {
    frame: device.importExternalTexture({ source: video }),
  });

  const encoder = root['~unstable'].createCommandEncoder();

  const depthPass = encoder.beginRenderPass({
    colorAttachments: { view: depthRenderView },
  });
  depthPipeline.with(depthPass).with(group).draw(3);
  depthPass.end();

  const lightingPass = encoder.beginRenderPass({
    colorAttachments: { view: context },
  });
  lightingPipeline.with(lightingPass).with(group).draw(3);
  lightingPass.end();

  encoder.submit(); // depth + lighting + draw: submission 1회
  requestAnimationFrame(frame);
}
frame();
