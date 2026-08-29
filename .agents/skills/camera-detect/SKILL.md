---
name: camera-detect
description: >-
  Use this skill when implementing or modifying webcam-based hand detection,
  MediaPipe HandLandmarker setup, skeleton overlay rendering, depth tracking,
  handedness detection, or webcam container UI in Slap King AI.
---

# Camera Detection Skill

This skill covers everything needed to work with the browser webcam and MediaPipe
hand-detection layer in Slap King AI.

---

## MediaPipe HandLandmarker Setup

**File:** `src/HandTracker.js` — `init(onProgress)`

### CDN Load Order
The tracker tries three ESM CDNs in sequence until one succeeds:
1. `https://esm.sh/@mediapipe/tasks-vision@0.10.14`
2. `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/+esm`
3. `https://unpkg.com/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs`

### WASM Bases
- `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm`
- `https://unpkg.com/@mediapipe/tasks-vision@0.10.14/wasm`

### Landmarker Options
```js
HandLandmarker.createFromOptions(vision, {
  baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' | 'CPU' },
  runningMode: 'VIDEO',
  numHands: 1,
});
```
GPU is tried first; falls back to CPU automatically.

---

## Webcam Stream

**File:** `src/HandTracker.js` — `startWebcam()`

```js
const stream = await navigator.mediaDevices.getUserMedia({
  video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
});
```

After the stream loads:
- Re-grab `#webcam-canvas` and its 2D context (DOM may have reloaded).
- Show `#webcam-container` (`display: block`).
- Update badge to "🔍 SCANNING…".

If denied → calls `enableMouseMode()` as fallback.

---

## Hand Detection Loop

**File:** `src/HandTracker.js` — `_detectHand()`

Called every rendering frame from `update(dt)`, but internally throttled to **30 fps**:

```js
const now = performance.now();
if (now - this._lastDetectionMs < 33) return;
const timeDelta = (now - this._lastDetectionMs) / 1000;
this._lastDetectionMs = now;
```

> ⚠️ **Critical Rule:** Always use `timeDelta` (physical detection interval) for velocity
> calculations — NEVER use the rendering `deltaTime`. Using the wrong delta amplifies
> velocity by 2–8× and causes phantom slaps.

### Landmark Indices Used

| Index | Joint |
|---|---|
| 0 | Wrist |
| 1–4 | Thumb (CMC→tip) |
| 5–8 | Index (MCP→tip) |
| 9–12 | Middle (MCP→tip) |
| 13–16 | Ring (MCP→tip) |
| 17–20 | Pinky (MCP→tip) |

### Palm Centre Calculation
```js
const palmIdx = [0, 5, 9, 13, 17]; // wrist + 4 knuckle bases
let px = 0, py = 0;
palmIdx.forEach(i => { px += lm[i].x; py += lm[i].y; });
palmCenter = { x: px / 5, y: py / 5 };
```

### Open-Hand Detection
```js
const tips  = [8, 12, 16, 20];
const bases = [5,  9, 13, 17];
let openCount = 0;
tips.forEach((t, i) => { if (lm[t].y < lm[bases[i]].y) openCount++; });
handOpen = openCount >= 3;
```

### Hand Depth Calculation
Distance between wrist (0) and middle-finger base (9) in normalized space:
```js
const dist = Math.sqrt(dx² + dy² + dz²);
// [0.09, 0.26] → [0.0, 1.0]
handDepth = Math.max(0, Math.min(1, (dist - 0.09) / 0.17));
```
Used in `getWorldPosition()` to map depth to Z: `z = baseZ - smoothedHandDepth × 7.8`

### Velocity Noise Deadzone
```js
const rawSpeed = Math.hypot(rawVx, rawVy);
if (rawSpeed < 0.12) {
  velocity = { x: 0, y: 0, speed: 0 }; // sub-threshold = camera jitter, ignore
}
```

### Handedness Detection
```js
this.handedness = results.handedness[0][0].categoryName; // 'Left' | 'Right'
```

---

## Skeleton Overlay Rendering

**File:** `src/HandTracker.js` — `_drawSkeleton(landmarks)`

**HTML Element:** `<canvas id="webcam-canvas">` inside `#webcam-container`

**CSS:** The canvas is positioned `absolute inset: 0`, matching the video size.
Both `#webcam-video` and `#webcam-canvas` use `transform: scaleX(-1)` to mirror.

### Canvas Size Sync
```js
this.canvas.width  = this.video.videoWidth  || 640;
this.canvas.height = this.video.videoHeight || 480;
```
Must be reset every detection frame as canvas is cleared on resize.

### Connection Pairs (Full 21 Landmarks)
```js
const connections = [
  [0,1],[1,2],[2,3],[3,4],           // Thumb
  [0,5],[5,6],[6,7],[7,8],           // Index
  [0,9],[9,10],[10,11],[11,12],      // Middle
  [0,13],[13,14],[14,15],[15,16],    // Ring
  [0,17],[17,18],[18,19],[19,20],    // Pinky
  [5,9],[9,13],[13,17],              // Palm base arch
];
```

### Draw Style
```js
// Lines
ctx.strokeStyle = '#00e5ff';  // Neon cyan
ctx.lineWidth   = 5;

// Joints — outer dot
ctx.fillStyle   = '#ff0099';  // Neon pink

// Joints — inner ring
ctx.strokeStyle = '#ffffff';
ctx.lineWidth   = 2;
```

---

## Webcam UI

**HTML:** `index.html`
```html
<div id="webcam-container">
  <video id="webcam-video" autoplay muted playsinline></video>
  <canvas id="webcam-canvas"></canvas>
  <div id="webcam-label">📷 HAND TRACKING</div>
  <div id="hand-indicator">✋</div>
</div>
```

**CSS:** `style.css`
- Container: `width: 280px`, `aspect-ratio: 4/3`, bottom-right fixed.
- Border: `2px solid var(--cyan)` with glow shadow.
- Both video and canvas are `scaleX(-1)` mirrored.
- Canvas is `position: absolute; inset: 0; pointer-events: none`.

---

## Mouse / Touch Fallback

When webcam is denied or all CDNs fail, `enableMouseMode()` is called:
- Sets `mouseMode = true`, hides webcam container.
- Mouse/touch position maps to `palmCenter`.
- Velocity uses rendering `deltaTime` in mouse mode (no throttling needed).
- Click/tap → `onForceSlap()` callback triggers a strong slap instantly.

---

## Common Mistakes to Avoid

| Mistake | Fix |
|---|---|
| Using `deltaTime` for velocity in webcam mode | Use `timeDelta` from detection timestamp |
| Missing detection frames reset | On `!wasDetected && handDetected`, zero velocity and snap positions |
| Canvas not matching video size | Reassign `canvas.width/height` from `video.videoWidth/Height` each frame |
| Skeleton not mirrored | Both `#webcam-video` and `#webcam-canvas` need `transform: scaleX(-1)` |
| Phantom slap on entrance | `detectionFrames < 10` guard in `SlapDetector.update()` |
