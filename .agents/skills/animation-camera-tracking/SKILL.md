---
name: animation-camera-tracking
description: >-
  Use this skill when implementing or modifying: the virtual 3D hand animation,
  hand-to-world coordinate mapping, depth-based Z tracking, slap lunge animations,
  direction-based hand rotations, forearm limb, left/right hand mirroring,
  camera shake, camera zoom, or the Three.js scene rendering pipeline in Slap King AI.
---

# Animation & Camera Tracking Skill

This skill covers the 3D animation and camera systems for Slap King AI, including
the virtual hand model, hand tracking coordinate conversion, slap animations, and
camera effects.

---

## Coordinate Mapping: Camera → 3D World

**File:** `src/HandTracker.js` — `getWorldPosition(baseZ = 8.8)`

Converts the normalized palm position `[0..1]` into Three.js world XYZ:

```js
getWorldPosition(baseZ = 8.8) {
  let zPos = baseZ;
  if (!this.mouseMode) {
    // Close hand → lower Z (closer to camera → closer to boss)
    zPos = baseZ - this.smoothedHandDepth * 7.8; // range: [8.8 ... 1.0]
  }
  return {
    x: (1 - this.smoothedPalm.x) * 8 - 4,  // mirror: left→right, range ≈ [-4, 4]
    y: (1 - this.smoothedPalm.y) * 5 - 0.5, // flip: up→up, range ≈ [-0.5, 4.5]
    z: zPos,
  };
}
```

> **Note:** The X axis is mirrored (`1 - x`) so the user's physical left movement
> moves the virtual hand to the right naturally (front-facing mirror feel).

### World Space Enrichment in `main.js`
```js
const wPos = hand.getWorldPosition(8.8);
wPos.tiltZ     = -hand.velocity.x * 2.8; // roll based on swing speed
wPos.handedness = hand.handedness;        // 'Left' | 'Right'
```

---

## Virtual Hand Model

**File:** `src/SceneBuilder.js` — `_buildVirtualHand()`

The hand is a `THREE.Group` built from primitive meshes with `MeshToonMaterial`:

```
Group (virtualHand)
├── Palm        BoxGeometry(2.4, 0.38, 2.0)
├── Forearm     CylinderGeometry(0.7, 0.9, 8.0)  ← z+ (behind palm)
├── 5× Finger   CylinderGeometry (tapered)
├── 5× Knuckle  SphereGeometry
├── 5× Fingertip SphereGeometry
└── Outlines    BackSide clone meshes (cartoon style)
```

**Initial placement:**
```js
group.position.set(0, 0, 7.5);
group.rotation.y = Math.PI;   // faces toward camera
group.scale.setScalar(1.15);
```

---

## `updateVirtualHand()` — Full Signature

**File:** `src/SceneBuilder.js`

```js
updateVirtualHand(pos, slapActive, slapProgress, isWebcam, direction, vx)
```

| Param | Type | Description |
|---|---|---|
| `pos` | `{x,y,z,tiltZ,handedness}` | World position + tilt + which hand |
| `slapActive` | `bool` | Is slap animation in progress |
| `slapProgress` | `[0..1]` | Eased progress (0=start, 1=peak) |
| `isWebcam` | `bool` | `true` = follow tracked Z; `false` = canned lunge |
| `direction` | `string` | `'horizontal'|'smash'|'uppercut'|'diagonal'` |
| `vx` | `number` | Raw X velocity used for yaw pivot |

### Position Lerp
```js
this._handTarget.set(pos.x, pos.y, pos.z);
this.virtualHand.position.lerp(this._handTarget, 0.14); // smooth follow
```

### Roll (Tilt on Z) — Always Applied
```js
this.virtualHand.rotation.z += (-(pos.tiltZ || 0) - this.virtualHand.rotation.z) * 0.12;
```

---

## Slap Animation Logic

**File:** `main.js` — `slapAnim` state object

```js
const slapAnim = { active: false, timer: 0, duration: 0.55, direction: 'horizontal', vx: 0 };
```

**Triggered** on `gameState.on('slap', ...)`:
```js
slapAnim.active    = true;
slapAnim.timer     = 0;
slapAnim.direction = slapEvent.direction || 'horizontal';
slapAnim.vx        = slapEvent.velocity?.x ?? 0;
```

**Progress curve** (eased triangle):
```js
const t = slapAnim.timer / slapAnim.duration;
const progress = t < 0.28
  ? t / 0.28              // fast ramp in (0 → 1)
  : 1 - (t - 0.28) / 0.72; // slow ease back (1 → 0)
```

---

## Direction-Based Slap Rotations

**File:** `src/SceneBuilder.js` — inside `updateVirtualHand()`

Each slap type pivots the hand differently:

| Direction | Rotation Applied |
|---|---|
| `smash` | Pitch forward (rotation.x +) |
| `uppercut` | Pitch backward (rotation.x −) |
| `horizontal` | Yaw (rotation.y) based on `vx`, roll left/right |
| `diagonal` | Combined yaw + lesser roll |

```js
// Example: smash rotates the hand forward at peak progress
if (direction === 'smash') {
  const targetPitch = Math.PI * 0.35 * slapProgress;
  this.virtualHand.rotation.x += (targetPitch - this.virtualHand.rotation.x) * 0.25;
}
```

---

## Webcam Mode vs Mouse Mode: Z Depth

| Mode | Z Behaviour |
|---|---|
| **Mouse Mode** | Canned Z-lunge: `lungeZ = pos.z - progress × 8.1` |
| **Webcam Mode** | Follows tracked `smoothedHandDepth` → no Z override during slap |

The `isWebcam` flag passed to `updateVirtualHand` selects which path runs:
```js
if (isWebcam) {
  // Only apply scale-up juice, Z is already correct from getWorldPosition()
  this.virtualHand.scale.set(isLeft ? -sc : sc, sc, sc);
} else {
  this.virtualHand.position.z = pos.z - progress * 8.1; // mouse lunge
}
```

---

## Left / Right Hand Mirroring

Detected from MediaPipe handedness. Scale.x is **negated** for Left hand:
```js
const isLeft = (pos.handedness === 'Left');
const targetX = isLeft ? -baseSc : baseSc;
this.virtualHand.scale.x += (targetX - this.virtualHand.scale.x) * 0.12;
```

This mirrors the finger and thumb geometry so the on-screen hand matches
the user's physical hand orientation exactly.

---

## Camera Shake

**File:** `src/SceneBuilder.js`

```js
shakeCamera(intensity, duration) {
  this._shakeI   = intensity;
  this._shakeDur = duration;
  this._shakeT   = duration;
}
```

**`updateCamera(dt)`** applies the shake each frame:
```js
if (this._shakeT > 0) {
  const t = this._shakeT / this._shakeDur; // decay
  const a = this._shakeI * t;
  camera.position.x += (Math.random() - 0.5) * a;
  camera.position.y += (Math.random() - 0.5) * a;
  camera.rotation.z  = (Math.random() - 0.5) * a * 0.45; // rotational shake
}
```

**Intensities by slap level:**
```js
{ weak: 0.12, normal: 0.22, strong: 0.42, critical: 0.85 }
```

---

## Camera Zoom (Boss Hit Focus)

**File:** `src/SceneBuilder.js`

```js
triggerCameraZoom(zoomAmount) {
  this._camBase.set(0, 2.5 - zoomAmount * 0.5, 10 - zoomAmount);
  this._camTarget.set(0, 2.5, 10); // recovery target
}
```

**Triggered by slap level in `main.js`:**
```js
if (slapEvent.level === 'critical') scene3d.triggerCameraZoom(1.8);
else if (slapEvent.level === 'strong')  scene3d.triggerCameraZoom(0.95);
```

The camera lerps back to `_camTarget` at `0.08` per frame via `_camBase.lerp(...)`.

---

## Full Per-Frame Rendering Pipeline

```
requestAnimationFrame(loop)
  │
  ├── hand.update(dt)              ← update palm position, velocity, depth
  │     └── _detectHand()         ← MediaPipe, skeleton draw (throttled 30fps)
  │
  ├── slapDetect.update(elapsed)  ← check velocity → emit 'slap' event
  │
  ├── combo.update(elapsed)       ← decay combo timer
  │
  ├── boss.update(dt)             ← wobble spring, taunts
  │
  ├── wPos = hand.getWorldPosition(8.8)   ← camera → world coords
  │   wPos.tiltZ = -velocity.x * 2.8
  │   wPos.handedness = hand.handedness
  │
  ├── scene3d.updateVirtualHand(wPos, ...) ← position lerp + slap anim
  │
  ├── scene3d.updateCamera(dt)    ← shake + zoom recovery
  ├── effects.update(dt)          ← particles, shockwaves
  └── scene3d.render()            ← renderer.render(scene, camera)
```

---

## Tips & Common Mistakes

| Problem | Solution |
|---|---|
| Hand feels laggy/slow | Raise `_lerpFactor` (0.30 is default; 0.50 = snappier) |
| Z-depth not responding | Verify `handDepth` is updating; check wrist-to-knuckle distance range [0.09, 0.26] |
| Slap anim clashes with tracked position | Ensure `isWebcam=true` so Z-lunge branch is skipped |
| Left hand mirrored wrong | Check `handedness` from MediaPipe; negate `scale.x` only for 'Left' |
| Camera shake too strong | Lower intensity values in `{ weak, normal, strong, critical }` map |
