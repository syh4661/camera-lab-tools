# TypeGPU depth-aware light injection demo


## v3 안정화 변경

이 버전의 브라우저 체크포인트는 **metric/absolute depth가 아니라 relative depth**입니다. 영상 안정화를 위해 프레임별 min-max 정규화를 제거하고 다음 처리를 추가했습니다.

- 추론 입력 RGB와 relighting RGB를 동일한 `VideoFrame`으로 동기화
- 2/98 percentile 기반 8-frame range calibration 후 잠금
- 이전 프레임에 대한 affine scale/shift alignment
- edge-aware spatial smoothing + motion-adaptive temporal smoothing
- 깊이 텍스처 `rgba8unorm` → `rgba16float` 변경
- normal derivative 간격 확대 및 연속적인 soft self-shadow
- depth preview를 안정성 확인용 grayscale로 변경
- 장면이 크게 바뀌면 **깊이 기준 재보정** 버튼 사용

절대 거리(m)가 필요하면 metric checkpoint를 서버/네이티브 런타임에서 사용하거나 RGB-D 센서를 사용해야 합니다. 단일 이미지 metric model도 비디오 temporal consistency를 자동으로 보장하지는 않습니다.

LinkedIn 영상의 핵심 아이디어를 학습·실험하기 위한 브라우저 예제입니다.

- **GPU-only proxy 모드(기본):** 카메라 RGB → depth-like texture → relighting을 TypeGPU의 한 command encoder에 넣고 한 번 제출합니다. 진짜 ML 깊이는 아니지만, 게시물의 GPU 데이터 흐름을 바로 실행해 볼 수 있습니다.
- **Depth Anything V2 모드:** `onnx-community/depth-anything-v2-small`을 Transformers.js WebGPU backend로 448×448 추론한 뒤, TypeGPU 조명 패스에서 사용합니다.
- 깊이맵의 중앙차분으로 화면 공간 표면 법선을 복원하고, point light·Lambert diffuse·Blinn–Phong specular·간단한 screen-space self-shadow를 합성합니다.

## 실행

### Windows PowerShell

처음 받는 경우:

```powershell
git clone -b feature/typegpu-depth-light-demo https://github.com/syh4661/camera-lab-tools.git
cd camera-lab-tools\typegpu-depth-light-demo
.\run.ps1
```

이미 레포를 받은 경우:

```powershell
cd camera-lab-tools
git fetch origin
git switch feature/typegpu-depth-light-demo
git pull origin feature/typegpu-depth-light-demo
cd typegpu-depth-light-demo
.\run.ps1
```

의존성이 없을 때 자동 설치하는 실행 스크립트도 포함합니다.

```powershell
.\run.ps1
```

PowerShell 실행 정책으로 차단되면:

```powershell
.\run.cmd
```

브라우저에서 Vite가 표시한 `http://localhost:5173/`을 열고 **카메라 시작**을 누르세요. 카메라 API 때문에 `localhost` 또는 HTTPS가 필요합니다. 최신 Chrome/Edge의 WebGPU 환경을 권장합니다.

AI 모드로 전환한 직후에는 첫 8프레임 동안 카메라를 약 1초간 고정해 기준 범위를 잡으세요. 카메라 위치나 장면을 크게 바꿨다면 **깊이 기준 재보정**을 누르면 됩니다.

### 빌드 확인

```powershell
npm run build
```

Node.js `22.12+` 또는 최신 LTS/Current 버전을 권장합니다.

## 조작

- 영상 위 드래그: 광원 X/Y 이동
- `빛의 Z`: 카메라 앞/뒤 방향 광원 이동
- `법선 강도`: 깊이 경사에서 복원한 표면 굴곡 강조
- `깊이 스케일`: 깊이맵을 3D 높이장으로 해석하는 크기
- `깊이맵 보기`: 현재 GPU가 사용하는 깊이 텍스처 확인
- `Depth Anything V2 불러오기`: 최초 한 번 모델 파일을 내려받아 실제 단안 깊이로 전환

## 처리 흐름

### 1. 기본 GPU-only 모드

```text
GPUExternalTexture(video)
        │
        ├─ render pass 1: RGB → proxy depth texture (448×448)
        │
        └─ render pass 2: RGB + depth → normal → lighting → canvas

두 패스는 root['~unstable'].createCommandEncoder() 하나에 기록한 뒤 submit() 1회
```

### 2. 실제 AI 깊이 모드

```text
video → 448×448 canvas capture
      → Transformers.js / Depth Anything V2 (WebGPU)
      → stabilized relative depth (rgba16float)
      → TypeGPU depth texture
      → normal reconstruction + lighting
```

## 원 게시물과의 차이

원 게시물은 단안 깊이 네트워크 자체를 TypeGPU로 구현해 추론 결과가 GPU를 떠나지 않고, 추론·조명·draw가 같은 command encoder를 공유한다고 설명합니다. 공개된 원본 모델 그래프·가중치 배치·TypeGPU 추론 코드는 확인되지 않아 이 저장본은 다음처럼 나눴습니다.

1. **동일한 command-encoder 데이터 흐름을 보여 주는 완전 GPU 예제:** proxy depth 모드
2. **실제 단안 깊이 결과를 보여 주는 재현 예제:** Transformers.js 모드

Transformers.js 고수준 API 예제는 프레임 전처리에 `getImageData()`를 쓰고 `predicted_depth.data`를 JavaScript에서 읽기 때문에, 두 번째 모드는 원 게시물의 완전한 zero-copy 구현은 아닙니다.

## 완전 zero-copy 구현으로 바꾸는 지점

`DepthAnythingEstimator` 대신 TypeGPU로 모델 연산을 인코딩하는 객체를 만들고, 현재 `render()`의 encoder에 추론 패스를 먼저 기록하면 됩니다.

```ts
const encoder = root['~unstable'].createCommandEncoder();

// 1) custom TypeGPU depth network
model.encode({ frame, output: depthTexture, encoder });

// 2) lighting pass reads the same GPU texture
const lightingPass = encoder.beginRenderPass({
  colorAttachments: { view: context },
});
relightPipeline.with(lightingPass).with(frameGroup).draw(3);
lightingPass.end();

// 3) one queue submission
encoder.submit();
```

실제 구현에서는 ONNX 연산자를 TypeGPU compute pipeline으로 변환하고, 중간 feature tensor를 storage buffer/texture에 배치해야 합니다. 모델별 weight packing, fp16 지원, bind-group 수명, workgroup 설계가 핵심 작업입니다.

## 주요 파일

- `src/main.ts`: TypeGPU shader, typed command encoder, Depth Anything 추론, UI
- `examples/minimal-gpu-only.ts`: 핵심 두 패스·단일 encoder 구조만 남긴 최소 예제
- `src/style.css`: 데모 UI
- `vite.config.ts`: `unplugin-typegpu` 설정

## 참고 사항

- 단안 깊이는 절대 거리 센서가 아니라 프레임 내부의 상대적 깊이입니다. 광원의 Z와 깊이 스케일은 시각적 파라미터입니다.
- AI 모드의 처리 속도는 GPU, 브라우저, fp16 지원 여부에 따라 크게 달라집니다.
- TypeGPU typed command encoder는 현재 unstable API이므로 버전 변경 시 호출 방식이 바뀔 수 있습니다.


## 카메라가 보이지 않을 때

1. 먼저 `http://localhost:5173/camera-test.html`을 열어 브라우저와 Windows 카메라 권한만 확인합니다.
2. 메인 화면의 상태 칸에 `카메라 시작 실패`, `WebGPU 초기화 실패`, `WebGPU 렌더 실패` 중 무엇이 표시되는지 확인합니다.
3. 브라우저 런타임 오류는 PowerShell이 아니라 `F12 → Console`에 표시됩니다.
4. 이 수정판은 원본 비디오를 캔버스 뒤에 fallback으로 표시하므로 WebGPU 패스가 실패해도 카메라 자체는 보여야 합니다.
