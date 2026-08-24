---
name: game-ui-ux
description: >-
  Use this skill when developing HUD overlays, menus, overlay panels, juice effects
  (screen shake, particle feedback), responsive scales, or controllers.
---

# Game UI/UX Guidelines

Use this skill when designing user interface components, HUD elements, menus, or feedback triggers in game projects. Follow these guidelines to ensure the layout remains responsive, immersive, and visually polished (contains "juice").

## Core Principles

1. **Keep Layouts Responsive**: Scale HUD elements relative to screen boundaries. Keep margins safe from notches, round screen edges, or variable aspect ratios.
2. **Minimize HUD Clutter**: Hide HUD elements when they are not relevant (e.g., fade out health bars when the player is fully healed).
3. **Use Premium Font Scales & Color Palettes**: Use modern game fonts (e.g., Outfit, Inter, Orbitron) instead of default system fonts. Use vibrant accent colors for interactions and dark shades for backgrounds (dark mode / glassmorphism).

---

## Screen Juice & Feedback

"Juice" is the visual and auditory feedback that makes simple game systems feel alive and satisfying to play.

### 1. Screen Shake
Apply temporary translation and rotation offsets to the camera rig during major gameplay events (e.g., explosion, heavy punch).
```javascript
class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.shakeIntensity = 0;
    this.shakeDecay = 0.9; // decay factor per update
  }

  triggerShake(intensity) {
    this.shakeIntensity = intensity;
  }

  update(dt) {
    if (this.shakeIntensity > 0.01) {
      // Calculate random offset
      const offsetX = (Math.random() - 0.5) * this.shakeIntensity;
      const offsetY = (Math.random() - 0.5) * this.shakeIntensity;
      
      this.camera.position.x += offsetX;
      this.camera.position.y += offsetY;

      // Decay shake
      this.shakeIntensity *= this.shakeDecay;
    }
  }
}
```

### 2. Hit Flash
Briefly tint a sprite or 3D mesh white when taking damage.
- For WebGL (Vanilla Canvas or Phaser), override the shader tint to `0xffffff`.
- For React Three Fiber, assign an emissive color programmatically:
  ```tsx
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const triggerHitFlash = () => {
    if (!materialRef.current) return;
    materialRef.current.emissive.setHex(0xffffff);
    setTimeout(() => {
      materialRef.current?.emissive.setHex(0x000000);
    }, 100);
  };
  ```

---

## UI Framework Strategies

Choose the right tool depending on layout complexity:
- **Canvas-rendered UI**: For highly unified styles or UI assets that require complex sorting behind game objects (e.g., name tags directly in 3D worlds, damage floating text numbers).
- **HTML DOM / React Overlays**: For standard menus, inventory, configuration screens, settings lists, and tables. Absolute-position these overlays over the canvas viewport:
  ```css
  .ui-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none; /* Let clicks pass through to canvas by default */
  }

  .interactive-btn {
    pointer-events: auto; /* Enable clicks back for buttons */
  }
  ```
- **Framer Motion Micro-animations**: Use animations for menu appearances and button hover states:
  ```tsx
  import { motion } from 'framer-motion';

  export const ClickButton = () => (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="px-6 py-3 bg-indigo-600 rounded-lg text-white font-bold pointer-events-auto"
    >
      Start Match
    </motion.button>
  );
  ```
