# Slap King AI 👋

An interactive 3D physics-based arcade game where you slap cartoon bosses using real-time webcam hand tracking (powered by MediaPipe tasks-vision) or mouse/touch control.

---

## 🎮 Game Features

- **5 Cartoon Bosses**: Face off against increasingly difficult opponents (from *Mr. Stress* to the final boss *The Slapper*).
- **Webcam Hand Tracking**: Mirrors your palm position in 3D using computer vision.
- **Physical Slap Mechanics**: Measures your hand swing velocity to trigger four tiers of slaps (Weak, Normal, Strong, and Critical).
- **Combo Multipliers**: Land hits in quick succession to fill up your combo meter and deal massive damage.
- **Screen Juice**: Realistic impact flashes, slow-motion effects on critical slaps, screen shake, and object-pooled 3D particle bursts.
- **Robust End-Game Flow**: Defeat the final boss to unlock the `👑 CLAIM VICTORY` screen, submit your score, or head back to the Main Menu.

---

## 🛠️ Technology Stack

- **Graphics**: Vanilla **Three.js** (WebGL renderer, dynamic ambient & directional lights, custom GLSL shader materials, dynamic camera rigs, shadow mapping)
- **Physics**: Custom Euler integration and boundary collision solvers
- **Computer Vision**: **Google MediaPipe Hand Landmarker** (loaded dynamically via CDN)
- **Animations**: **GSAP (GreenSock)** for screen transitions, HUD animations, and menu slide-ins
- **Bundler**: **Vite** (fully optimized chunking and minification)

---

## 🔒 Security & Camera Fallbacks

Modern browsers enforce strict security policies regarding device cameras:
- **Secure Contexts (HTTPS)**: Camera APIs (`getUserMedia`) require secure connections. When run on standard HTTP pages, browsers block webcam access.
- **Vercel Automatic HTTPS**: When deployed to Vercel, an **HTTPS SSL certificate is provisioned automatically**. Hand-tracking will function seamlessly on all supported browsers and devices.
- **Local Dev Whitelist**: Desktop browsers treat `http://localhost` as a safe origin for local testing.
- **Graceful Fallback**: If no camera hardware is detected or HTTPS is unavailable, the engine automatically falls back to **Mouse/Touch Mode** (clicking and dragging to slap) to ensure a crash-free experience.

---

## 🎮 How to Play

1. **Webcam Mode**:
   - Grant camera permissions when prompted.
   - Hold your open palm facing the webcam.
   - Swing your hand sideways quickly to deliver a slap.
2. **Mouse/Touch Mode**:
   - Move the cursor quickly across the 3D canvas, or click directly to trigger a slap instantly.

---

## 📦 Local Installation

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Build for production:
   ```bash
   npm run build
   ```

---

## 🚀 Deploying to Vercel

Since the project uses a standard Vite configuration, it is ready for zero-config Vercel deployments:

1. Push this repository to **GitHub**.
2. Log in to your [Vercel Dashboard](https://vercel.com).
3. Click **Add New** > **Project** and import this repository.
4. Vercel will automatically detect **Vite**, set the build command to `npm run build`, and serve the compiled assets from the `dist` directory.
