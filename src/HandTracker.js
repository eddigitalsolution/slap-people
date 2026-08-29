/**
 * HandTracker.js  (v3 — Gesture-Grade Tracking)
 *
 * Key improvements:
 *  • Velocity uses a 3-frame rolling average to smooth detection jitter
 *    while still capturing genuine fast swings
 *  • `handOpen` now also exposes `handClosed` (fist) for future use
 *  • Depth (Z) tracking maps physical palm size to world Z
 *  • Entrance guard: zeroes velocity on first N detection frames
 *  • Noise deadzone 0.10 units/sec — sub-threshold = camera static
 *  • `getWorldPosition()` returns live depth-based Z in webcam mode
 *  • Skeleton overlay drawn per detection frame with connection lines + joints
 */

export class HandTracker {
  constructor() {
    this._landmarker      = null;
    this.video            = document.getElementById('webcam-video');
    this._lastDetectionMs = 0;

    this.isReady      = false;
    this.isRunning    = false;
    this.mouseMode    = false;

    // Normalised palm position [0-1] — raw (updated per detection) and smoothed (for rendering)
    this.palmCenter   = { x: 0.5, y: 0.5 };
    this.smoothedPalm = { x: 0.5, y: 0.5 };

    // Physical depth [0=far … 1=close]
    this.handDepth         = 0.5;
    this.smoothedHandDepth = 0.5;

    // Velocity — smoothed over last N detection frames
    this.velocity = { x: 0, y: 0, speed: 0 };
    this._velHistory = [];          // {vx, vy} ring buffer
    this._VEL_HISTORY_LEN = 3;     // frames to average

    // Hand state
    this.handOpen     = false;
    this.handClosed   = false;
    this.handDetected = false;
    this.handedness   = 'Right';

    this._lerpFactor  = 0.35;      // visual smoothing (higher = snappier)
    this._noiseFloor  = 0.10;      // units/sec below which velocity = 0

    // Overlay canvas
    this.canvas = document.getElementById('webcam-canvas');
    this.ctx    = this.canvas ? this.canvas.getContext('2d') : null;

    // Mouse / touch state
    this._mousePos = { x: 0.5, y: 0.5 };

    // Click / tap → external force-slap callback
    this.onForceSlap = null;

    // Reusable object — avoids per-frame GC allocation
    this._cachedWorldPos = { x: 0, y: 0, z: 0, tiltZ: 0, handedness: 'Right' };
  }

  // ── Init ───────────────────────────────────────────────

  async init(onProgress) {
    onProgress?.('Loading MediaPipe…');

    const candidates = [
      'https://esm.sh/@mediapipe/tasks-vision@0.10.14',
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/+esm',
      'https://unpkg.com/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
    ];
    const wasmBases = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm',
      'https://unpkg.com/@mediapipe/tasks-vision@0.10.14/wasm',
    ];
    const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

    let loaded = false;
    for (const cdnUrl of candidates) {
      if (loaded) break;
      try {
        onProgress?.('Trying MediaPipe CDN…');
        const mp = await import(/* @vite-ignore */ cdnUrl);
        const { HandLandmarker, FilesetResolver } = mp;
        if (!HandLandmarker || !FilesetResolver) throw new Error('Missing exports');

        for (const wasmBase of wasmBases) {
          if (loaded) break;
          try {
            onProgress?.('Resolving WASM…');
            const vision = await FilesetResolver.forVisionTasks(wasmBase);
            onProgress?.('Creating landmarker…');
            for (const delegate of ['GPU', 'CPU']) {
              try {
                this._landmarker = await HandLandmarker.createFromOptions(vision, {
                  baseOptions: { modelAssetPath: MODEL, delegate },
                  runningMode: 'VIDEO',
                  numHands: 1,
                });
                onProgress?.(`Hand tracking ready (${delegate})`);
                loaded = true;
                this.isReady = true;
                break;
              } catch { /* try next */ }
            }
          } catch { /* try next wasm base */ }
        }
      } catch { /* try next CDN */ }
    }

    if (!loaded) {
      onProgress?.('Hand tracking unavailable — mouse mode');
      this.enableMouseMode();
    }

    this._attachInputListeners();
  }

  // ── Webcam ─────────────────────────────────────────────

  async startWebcam() {
    if (this.mouseMode) return true;
    if (!this.isReady) { this.enableMouseMode(); return false; }
    if (!navigator.mediaDevices?.getUserMedia) { this.enableMouseMode(); return false; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      this.video.srcObject = stream;
      await new Promise(res => { this.video.onloadedmetadata = res; });
      await this.video.play();
      this.isRunning = true;

      this.canvas = document.getElementById('webcam-canvas');
      this.ctx    = this.canvas ? this.canvas.getContext('2d') : null;

      const wc = document.getElementById('webcam-container');
      if (wc) wc.style.display = 'block';
      this._updateBadge('🔍 SCANNING…');
      return true;
    } catch (err) {
      console.warn('[HandTracker] Webcam denied:', err);
      this.enableMouseMode();
      return false;
    }
  }

  stopWebcam() {
    this.video?.srcObject?.getTracks().forEach(t => t.stop());
    if (this.video) this.video.srcObject = null;
    this.isRunning = false;
  }

  // ── Mouse fallback ─────────────────────────────────────

  enableMouseMode() {
    this.mouseMode    = true;
    this.isReady      = true;
    this.isRunning    = true;
    this.handDetected = true;
    this.handOpen     = true;
    const wc = document.getElementById('webcam-container');
    if (wc) wc.style.display = 'none';
  }

  _attachInputListeners() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      this._mousePos.x = (e.clientX - r.left) / r.width;
      this._mousePos.y = (e.clientY - r.top)  / r.height;
    });

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const t = e.touches[0];
      this._mousePos.x = (t.clientX - r.left) / r.width;
      this._mousePos.y = (t.clientY - r.top)  / r.height;
    }, { passive: false });

    canvas.addEventListener('pointerdown', () => {
      if (this.onForceSlap) this.onForceSlap();
    });
  }

  // ── Per-frame update ───────────────────────────────────

  update(deltaTime) {
    if (!this.isReady || !this.isRunning) return;

    if (this.mouseMode) {
      const prevX = this.palmCenter.x;
      const prevY = this.palmCenter.y;
      this.palmCenter.x = this._mousePos.x;
      this.palmCenter.y = this._mousePos.y;
      this.handDetected = true;
      this.handOpen     = true;
      this.handClosed   = false;
      this.handDepth    = 0.5;

      if (deltaTime > 0) {
        const vx = (this.palmCenter.x - prevX) / deltaTime;
        const vy = (this.palmCenter.y - prevY) / deltaTime;
        this.velocity.x     = vx;
        this.velocity.y     = vy;
        this.velocity.speed = Math.hypot(vx, vy);
      }
    } else {
      this._detectHand();
    }

    // Smooth visual position
    const lf = this._lerpFactor;
    this.smoothedPalm.x += (this.palmCenter.x - this.smoothedPalm.x) * lf;
    this.smoothedPalm.y += (this.palmCenter.y - this.smoothedPalm.y) * lf;
    this.smoothedHandDepth += (this.handDepth - this.smoothedHandDepth) * lf;

    // Update HUD badge
    const ind = document.getElementById('hand-indicator');
    if (ind) {
      if (this.mouseMode)       ind.textContent = '🖱️';
      else if (this.handDetected) { ind.textContent = this.handOpen ? '✋' : '✊'; ind.style.opacity = '1'; }
      else                        { ind.textContent = '❌'; ind.style.opacity = '0.5'; }
    }
  }

  // ── MediaPipe detection ────────────────────────────────

  _detectHand() {
    if (!this._landmarker || !this.video || this.video.readyState < 2) return;

    const now = performance.now();
    if (now - this._lastDetectionMs < 33) return;         // throttle ~30 fps
    const timeDelta = (now - this._lastDetectionMs) / 1000;
    this._lastDetectionMs = now;

    try {
      const results = this._landmarker.detectForVideo(this.video, now);

      if (results.landmarks?.length > 0) {
        const wasDetected = this.handDetected;
        this.handDetected = true;
        const lm = results.landmarks[0];

        // Handedness
        if (results.handedness?.length > 0) {
          this.handedness = results.handedness[0][0].categoryName;
        }

        // Open / closed hand
        const tips  = [8, 12, 16, 20];
        const bases = [5,  9, 13, 17];
        let openCount = 0;
        tips.forEach((t, i) => { if (lm[t].y < lm[bases[i]].y) openCount++; });
        this.handOpen   = openCount >= 3;
        this.handClosed = openCount <= 1;

        // Palm centre (wrist + 4 knuckle bases)
        const palmIdx = [0, 5, 9, 13, 17];
        let px = 0, py = 0;
        palmIdx.forEach(i => { px += lm[i].x; py += lm[i].y; });
        const nextX = px / palmIdx.length;
        const nextY = py / palmIdx.length;

        // Depth: wrist(0) → middle-knuckle(9) distance
        const ddx = lm[0].x - lm[9].x;
        const ddy = lm[0].y - lm[9].y;
        const ddz = lm[0].z - lm[9].z;
        const dist = Math.sqrt(ddx*ddx + ddy*ddy + ddz*ddz);
        this.handDepth = Math.max(0, Math.min(1, (dist - 0.09) / 0.17));

        if (!wasDetected) {
          // Snap position immediately — no history from default (0.5, 0.5)
          this.palmCenter.x = nextX;
          this.palmCenter.y = nextY;
          this.smoothedPalm.x = nextX;
          this.smoothedPalm.y = nextY;
          this.smoothedHandDepth = this.handDepth;
          this._velHistory = [];
          this.velocity = { x: 0, y: 0, speed: 0 };
        } else {
          // Raw velocity for this detection frame
          if (timeDelta > 0) {
            const rawVx = (nextX - this.palmCenter.x) / timeDelta;
            const rawVy = (nextY - this.palmCenter.y) / timeDelta;
            const rawSpeed = Math.hypot(rawVx, rawVy);

            if (rawSpeed < this._noiseFloor) {
              // Below noise floor — this frame contributes zero to the buffer
              this._velHistory.push({ vx: 0, vy: 0 });
            } else {
              this._velHistory.push({ vx: rawVx, vy: rawVy });
            }

            // Keep buffer at fixed length
            if (this._velHistory.length > this._VEL_HISTORY_LEN) {
              this._velHistory.shift();
            }

            // Average the buffer → smooth but responsive velocity
            if (this._velHistory.length > 0) {
              let sumVx = 0, sumVy = 0;
              this._velHistory.forEach(v => { sumVx += v.vx; sumVy += v.vy; });
              const n = this._velHistory.length;
              this.velocity.x     = sumVx / n;
              this.velocity.y     = sumVy / n;
              this.velocity.speed = Math.hypot(this.velocity.x, this.velocity.y);
            }
          }
          this.palmCenter.x = nextX;
          this.palmCenter.y = nextY;
        }

        this._drawSkeleton(lm);
        this._updateBadge(this.handOpen ? '✋ OPEN' : '✊ FIST');

      } else {
        this.handDetected = false;
        this._velHistory  = [];
        this.velocity     = { x: 0, y: 0, speed: 0 };
        if (this.ctx && this.canvas) {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this._updateBadge('🔍 SCANNING…');
      }
    } catch (e) {
      // Skip bad frames silently
    }
  }

  // ── Skeleton overlay ───────────────────────────────────

  _drawSkeleton(landmarks) {
    if (!this.canvas || !this.ctx) return;

    this.canvas.width  = this.video.videoWidth  || 640;
    this.canvas.height = this.video.videoHeight || 480;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Speed colour — cyan when still, yellow→red when fast
    const spd = Math.min(1, this.velocity.speed / 1.5);
    const r = Math.round(spd * 255);
    const g = Math.round((1 - spd) * 229);
    const lineColor = `rgb(${r}, ${g}, 255)`;

    const connections = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],
      [0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],
      [5,9],[9,13],[13,17],
    ];

    ctx.strokeStyle = lineColor;
    ctx.lineWidth   = 4;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    connections.forEach(([a, b]) => {
      const p1 = landmarks[a], p2 = landmarks[b];
      if (!p1 || !p2) return;
      ctx.beginPath();
      ctx.moveTo(p1.x * w, p1.y * h);
      ctx.lineTo(p2.x * w, p2.y * h);
      ctx.stroke();
    });

    // Joints
    landmarks.forEach((lm, idx) => {
      const isTip = [4, 8, 12, 16, 20].includes(idx);
      const radius = isTip ? 9 : 6;
      const color  = isTip ? '#ff0099' : '#00e5ff';

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, radius, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Draw speed bar at top of canvas
    const barW = Math.min(1, this.velocity.speed / 1.5) * w;
    const barColor = spd > 0.7 ? '#ff4400' : spd > 0.4 ? '#ffaa00' : '#00ff88';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, 12);
    ctx.fillStyle = barColor;
    ctx.fillRect(0, 0, barW, 12);
  }

  _updateBadge(text) {
    const lbl = document.getElementById('webcam-label');
    if (lbl) lbl.textContent = text;
  }

  // ── World-space coordinate conversion ─────────────────

  getWorldPosition(baseZ = 8.8) {
    let zPos = baseZ;
    if (!this.mouseMode) {
      // Depth maps [0=far, 1=close] → Z [8.8 … 1.0]
      zPos = baseZ - this.smoothedHandDepth * 7.8;
    }
    this._cachedWorldPos.x          = (1 - this.smoothedPalm.x) * 8 - 4;
    this._cachedWorldPos.y          = (1 - this.smoothedPalm.y) * 5 - 0.5;
    this._cachedWorldPos.z          = zPos;
    this._cachedWorldPos.handedness = this.handedness;
    return this._cachedWorldPos;
  }
}
