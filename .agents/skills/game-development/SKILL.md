---
name: game-development
description: >-
  Use this skill when designing general game architectures, systems, state machines,
  save/load states, audio managers, or delta-time loops.
---

# Game Development Core Guidelines

Use this skill when structuring high-level game logic or patterns. This document focuses on engine-agnostic game development patterns: loops, design architectures, audio management, and state serialization.

## Game Loop & Delta Time

Never tie gameplay speed directly to frame rate. Always factor in **Delta Time** (the elapsed time since the last frame, in seconds) to ensure matching speed on 30Hz, 60Hz, or 144Hz monitors.

```javascript
let lastTime = 0;

function gameLoop(currentTime) {
  // Convert milliseconds to seconds
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  update(deltaTime);
  render();

  requestAnimationFrame(gameLoop);
}

function update(dt) {
  // Speed is 200 pixels per second
  player.x += speed * dt;
}
```

---

## Architectural Patterns

### 1. State Machines (FSM)
Manage complex agent states (e.g., Idle, Walk, Jump, Slap, Hit) via Finite State Machines. This keeps state transitions clean and prevents massive if-else statement blocks.

```javascript
class State {
  enter() {}
  update(dt) {}
  exit() {}
}

class IdleState extends State {
  constructor(player) {
    super();
    this.player = player;
  }
  update(dt) {
    if (this.player.keys.left.isDown || this.player.keys.right.isDown) {
      this.player.changeState('walk');
    }
  }
}

class PlayerController {
  constructor() {
    this.states = {
      idle: new IdleState(this),
      // other states...
    };
    this.currentState = this.states.idle;
    this.currentState.enter();
  }

  changeState(stateName) {
    this.currentState.exit();
    this.currentState = this.states[stateName];
    this.currentState.enter();
  }

  update(dt) {
    this.currentState.update(dt);
  }
}
```

### 2. Entity Component System (ECS)
For data-oriented games containing thousands of independent entities (bullets, particles, pickups):
- **Entity**: A simple, unique ID.
- **Component**: Pure data container representing an aspect (Position, Velocity, Renderable).
- **System**: Logic that queries entities containing specific combinations of components and modifies them.

---

## Audio Management & Asset Loading

Implement an `AudioManager` that handles:
- **Audio Context States**: Unlocking the browser AudioContext after user interaction.
- **Sound Pools**: Pre-loading and reusing Web Audio buffers to prevent click/pop lag when playing sounds.
- **Channel Volume**: Splitting background music (BGM) and sound effects (SFX) volumes.

```javascript
class AudioManager {
  constructor() {
    this.ctx = null;
    this.sounds = {};
    this.bgmVolume = 0.5;
    this.sfxVolume = 1.0;
  }

  init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  playSFX(key) {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    
    const buffer = this.sounds[key];
    if (buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = this.ctx.createGain();
      gainNode.gain.value = this.sfxVolume;

      source.connect(gainNode);
      gainNode.connect(this.ctx.destination);
      source.start(0);
    }
  }
}
```
