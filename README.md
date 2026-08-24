# Slap King AI 👋

An interactive 3D physics-based arcade game where you slap cartoon bosses using real-time webcam hand tracking (powered by MediaPipe tasks-vision) or mouse/touch control.

## 🚀 Live Demo & Deployment

This project is built using a modern Vite bundler stack and is ready for one-click deployment to **Vercel**.

## 🛠️ Technology Stack

- **Graphics**: Vanilla Three.js (WebGL rendering, dynamic lighting, custom shader materials, particle effects)
- **Physics**: Custom Euler integration and boundary collision solvers
- **Computer Vision**: Google MediaPipe Hand Landmarker (loaded dynamically via CDN falls back to Mouse/Touch mode)
- **Animations**: GSAP (GreenSock Animation Platform) for smooth transitions and menus
- **Bundler**: Vite (fully optimized production assets)

## 🎮 How to Play

1. **Webcam Mode**:
   - Grant camera permissions when prompted.
   - Hold your open palm facing the webcam.
   - Swing your hand sideways quickly to deliver a slap.
   - Land multiple hits in a row to multiply your **COMBO** score!
2. **Mouse Mode**:
   - Click and drag quickly across the canvas, or click directly to trigger a slap.

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
