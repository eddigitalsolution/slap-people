---
name: phaser
description: >-
  Use this skill when developing 2D games, configuring scenes, sprite animations,
  keyboard/mouse inputs, and performance parameters within the Phaser game engine.
---

# Phaser Game Development Guidelines

Use this skill when configuring Phaser game configurations, scene setups, and gameplay loops. This guide outlines standard lifecycle practices, resource load mechanics, and sprite management.

## Game Configuration & Scene Setup

A typical Phaser project requires a config object to initialize the game canvas. Implement a scene hierarchy to decouple loading states, gameplay states, and UI displays.

```javascript
import Phaser from 'phaser';

class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // Load loading bar assets, fonts, etc.
    this.load.image('logo', 'assets/logo.png');
  }

  create() {
    this.scene.start('MainGameScene');
  }
}

class MainGameScene extends Phaser.Scene {
  constructor() {
    super('MainGameScene');
  }

  init(data) {
    // Initialize properties passed from another scene
    this.score = data.score || 0;
  }

  preload() {
    // Load game assets
    this.load.spritesheet('player', 'assets/player_spritesheet.png', {
      frameWidth: 64,
      frameHeight: 64,
    });
  }

  create() {
    // Initialize animations and sprites
    this.anims.create({
      key: 'walk',
      frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }),
      frameRate: 10,
      repeat: -1,
    });

    this.player = this.physics.add.sprite(100, 100, 'player');
    this.player.play('walk');

    // Input hooks
    this.cursors = this.input.keyboard.createCursorKeys();
  }

  update(time, delta) {
    // Game loop logic - updates run 60 times a second
    const speed = 160;
    this.player.setVelocity(0);

    if (this.cursors.left.isDown) {
      this.player.setVelocityX(-speed);
    } else if (this.cursors.right.isDown) {
      this.player.setVelocityX(speed);
    }

    if (this.cursors.up.isDown) {
      this.player.setVelocityY(-speed);
    } else if (this.cursors.down.isDown) {
      this.player.setVelocityY(speed);
    }
  }
}

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: '#1a1a2e',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 300 },
      debug: false,
    },
  },
  scene: [BootScene, MainGameScene],
};

const game = new Phaser.Game(config);
```

---

## Sprites & Texture Packing

1. **Use Texture Atlases**: Avoid loading individual `.png` files for each sprite animation. Use texture packers (e.g. TexturePacker) to pack multiple frames into one spreadsheet and load it in Phaser using `this.load.atlas('spritesheet', 'atlas.png', 'atlas.json')`.
2. **Object Pooling**: For bullets, particles, or repeating obstacles, use Phaser Groups. Reuse deactivated sprites rather than calling `destroy()` and creating new ones.
   ```javascript
   this.bullets = this.physics.add.group({
     defaultKey: 'bullet',
     maxSize: 30,
   });
   
   function fireBullet(x, y) {
     const bullet = this.bullets.get(x, y);
     if (bullet) {
       bullet.setActive(true).setVisible(true);
       bullet.setVelocityY(-300);
     }
   }
   ```

---

## Scene Interactions & Overlays

To create user interfaces or HUD overlays inside Phaser without mixing DOM markup, write an isolated scene (e.g., `UIScene`) and run it concurrently with `MainGameScene`.
```javascript
// Inside MainGameScene:
this.scene.launch('UIScene');

// Inside UIScene:
class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }
  create() {
    const mainGame = this.scene.get('MainGameScene');
    this.scoreText = this.add.text(10, 10, 'Score: 0', { fontSize: '24px' });
    
    // Listen for events emitted by the main game
    mainGame.events.on('scoreChanged', (newScore) => {
      this.scoreText.setText(`Score: ${newScore}`);
    });
  }
}
```
