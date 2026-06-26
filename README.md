# Camera Lab Tools

Browser-based tools for quick camera field-of-view checks and lens sanity tests.

## Tools

- `index.html` / REAL-METER: a monitor-based FOV checker for table-top measurements.
- `camera-test.html`: a camera preview page with grid, center cross, rings, corner marks, and snapshots.

## Quick FOV Check

Measure the distance from the lens front to the screen as `D`, and the visible real-world width as `W`.

```text
FOV = 2 * atan(W / (2 * D))
```

For a 32-inch 16:9 monitor, the active screen size is approximately:

```text
Width:    70.8 cm
Height:   39.8 cm
Diagonal: 81.3 cm
```

If the full 32-inch monitor width fits at about 30 cm from the lens, the horizontal FOV is roughly 99 degrees.

To verify 140 degrees with a 32-inch 16:9 monitor:

```text
Horizontal 140 deg: lens about 12.9 cm from the screen
Diagonal   140 deg: lens about 14.8 cm from the screen
```

At 30 cm distance, a true 140-degree horizontal lens would see roughly 165 cm of width, which is far wider than a single 32-inch monitor.

## Lens Marking Notes

An example marking such as `1080P f3.6mm 1/2.7A` usually means:

- `1080P`: lens intended for FHD / 2 MP class camera modules.
- `f3.6mm`: focal length is 3.6 mm. This is usually normal-wide, not an extreme 140-degree fisheye lens.
- `1/2.7`: sensor format coverage, commonly a 1/2.7-inch class sensor.
- `A`: manufacturer revision or internal variant marker.

For a 1/2.7-inch sensor, a 3.6 mm lens commonly lands closer to roughly 90-105 degrees diagonal depending on the exact sensor and lens design.

## Usage

Open `index.html` in a browser, choose the monitor preset, and use `Target Only` to fill the screen. Place the camera at the calculated distance and check whether the target edges or corners are visible.

For camera preview testing, open `camera-test.html`. Camera access requires a secure context in most browsers; GitHub Pages over HTTPS should work.

## License

MIT
