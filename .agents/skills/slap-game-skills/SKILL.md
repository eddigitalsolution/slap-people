---
name: slap-game-skills
description: >-
  Core skill reference for Slap King AI game mechanics, architecture, and systems.
  Use when implementing or modifying: hand tracking, slap detection, boss systems,
  combo logic, effects, audio, or progression in this specific game.
---

# Slap King AI — Game Skills Reference

This skill documents all major game systems in the **Slap King AI** browser game.
Always read this before modifying any core game logic.

---

## Project Architecture

```
main.js               ← Bootstrap, game loop, event orchestration
src/
  HandTracker.js      ← MediaPipe hand tracking, depth, skeleton overlay
  SlapDetector.js     ← Velocity threshold → slap level + direction
  SceneBuilder.js     ← Three.js scene, virtual hand 3D model, camera
  BossManager.js      ← 5 cartoon bosses: spawn, HP, animations, taunts
  EffectsManager.js   ← Particles, shockwave, flash, slow-mo, stars
  AudioManager.js     ← Web Audio API SFX pool
  UIManager.js        ← HUD, damage numbers, screens, combo display
  ComboSystem.js      ← Combo hit tracking and multiplier decay
  ProgressionSystem.js← Score, high score, achievements
  GameState.js        ← Lightweight event emitter + FSM state
```

---

## Hand Tracking System

**File:** `src/HandTracker.js`

| Property | Type | Description |
|---|---|---|
| `palmCenter` | `{x, y}` | Raw normalized [0-1] palm XY (updated at detection rate, ~30fps) |
| `smoothedPalm` | `{x, y}` | Lerped XY for visual rendering |
| `velocity` | `{x, y, speed}` | Calculated using physical detection timeDelta, NOT render delta |
| `handDepth` | `[0..1]` | 0 = far from camera, 1 = close |
| `smoothedHandDepth` | `[0..1]` | Lerped depth for rendering |
| `handDetected` | `bool` | True when MediaPipe finds landmarks in current frame |
| `handOpen` | `bool` | True when ≥3 fingertips above their base knuckles |
| `handedness` | `'Left'\|'Right'` | Detected hand side |
| `mouseMode` | `bool` | Fallback when webcam unavailable |

### Key Rules
- **Velocity is decoupled from render framerate.** It uses `(now - lastDetectionMs) / 1000` as `timeDelta`.
- **Noise deadzone is 0.12 units/sec.** Sub-threshold jitter is zeroed out to prevent phantom slaps.
- **On hand re-detection**, previous position is immediately overridden and velocity is zeroed to prevent entrance spikes.
- `getWorldPosition(baseZ)` maps `smoothedPalm` + `smoothedHandDepth` to Three.js world XYZ.

---

## Slap Detector

**File:** `src/SlapDetector.js`

Slaps fire when `velocity.speed` exceeds a threshold AND:
- `handDetected = true` 
- `detectionFrames >= 10` (avoids entrance noise)
- `elapsed - lastSlapTime >= cooldown` (0.4s default)

| Level | Speed Threshold | Base Damage |
|---|---|---|
| weak | 0.20 /s | 5 |
| normal | 0.45 /s | 10 |
| strong | 0.80 /s | 20 |
| critical | 1.40 /s | 50 |

**Slap Event Fields:**
```js
{
  level: 'weak' | 'normal' | 'strong' | 'critical',
  speed: number,
  velocity: { x, y, speed },
  position: { x, y },
  direction: 'horizontal' | 'diagonal' | 'smash' | 'uppercut',
  isSwing: bool,
  swingBonus: number,
}
```

---

## Game State Machine

**File:** `src/GameState.js`

States: `LOADING` → `MENU` → `PLAYING` → `BOSS_DEFEAT` → `VICTORY` | `GAME_OVER`

Use `gameState.is('PLAYING')` to guard updates. Use `gameState.emit('slap', e)` to fire events.

---

## Virtual Hand Model

**File:** `src/SceneBuilder.js` — `_buildVirtualHand()`

The 3D hand group contains:
- **Palm**: `BoxGeometry(2.4, 0.38, 2.0)`
- **Forearm / Limb**: `CylinderGeometry(0.7, 0.9, 8.0)` behind the palm
- **5 Fingers**: Cylinder + knuckle sphere + fingertip sphere per finger
- **Outlines**: BackSide mesh clones for cartoon outline effect

### `updateVirtualHand(pos, slapActive, slapProgress, isWebcam, direction, vx)`

| Param | Description |
|---|---|
| `pos` | `{x,y,z,tiltZ,handedness}` — world position |
| `slapActive` | Bool — slap animation running |
| `slapProgress` | `[0..1]` — eased progress of slap |
| `isWebcam` | Skip Z-lunge override, use tracked depth instead |
| `direction` | `'horizontal'\|'smash'\|'uppercut'\|'diagonal'` |
| `vx` | Horizontal velocity for Y-axis yaw |

- Left hand: **scale.x is negated** to mirror fingers correctly.
- Slap rotations: yaw/pitch/roll are applied per direction.

---

## Boss Roster

**File:** `src/BossManager.js`

| Index | Name | HP |
|---|---|---|
| 0 | Mr. Stress | 100 |
| 1 | Chairman Meow | 250 |
| 2 | Colonel Cluck | 500 |
| 3 | Zorgoth | 1000 |
| 4 | The Slapper | 2000 |

Bosses use **spring-damper wobble physics** when hit. Slap events emit `bossDefeated` when HP ≤ 0.

---

## Damage Formula

```
totalDamage = (baseDamage + swingBonus) × comboMultiplier
```

`swingBonus` = `Math.floor(adjSpeed × 30)` for horizontal, `× 40` for smash.

---

## Adding a New Feature — Checklist

1. Check `GameState` for the correct state guard.
2. If it uses hand input → extend `HandTracker` and expose a property.
3. If it triggers on movement → modify `SlapDetector.update()`.
4. If it is a 3D visual → add to `SceneBuilder`.
5. If it emits events → use `gameState.emit(eventName, data)`.
6. Wire event listeners in `main.js`.
