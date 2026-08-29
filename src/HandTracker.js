/**
 * HandTracker.js  (v2 – fixed CDN, raw velocity, click-to-slap)
 *
 * Changes vs v1:
 *  • MediaPipe loaded from esm.sh (reliable ESM CDN) + unpkg fallback
 *  • velocity calculated from RAW palmCenter delta (not the lerped position)
 *    → slap thresholds are now reachable with normal hand movement
 *  • lerpFactor raised to 0.30 for snappier visual tracking
 *  • Time-based detection throttle (33 ms) instead of currentTime compare
 *  • Mouse-click / tap fires an instant "strong" slap event via gameState
 *  • Visible status text in the webcam badge
 */

export class HandTracker {
  constructor() {
    this._landmarker       = null;
    this.video             = document.getElementById('webcam-video');
    this._lastDetectionMs  = 0;   // time-based throttle (ms)

    this.isReady      = false;
    this.isRunning    = false;
    this.mouseMode    = false;

    // Raw landmark-average position (0-1, updated every detected frame)
    this.palmCenter   = { x: 0.5, y: 0.5 };
    // Smoothed position used for rendering the virtual hand
    this.smoothedPalm = { x: 0.5, y: 0.5 };

    // Hand depth (0 = far away, 1 = close to camera)
    this.handDepth    = 0.5;
    this.smoothedHandDepth = 0.5;

    this.canvas = document.getElementById('webcam-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    // Velocity is calculated from RAW palmCenter so lerp does NOT dampen it
    this._rawPrevX = 0.5;
    this._rawPrevY = 0.5;

    this.velocity     = { x: 0, y: 0, speed: 0 };
    this.handOpen     = false;
    this.handDetected = false;

    this._lerpFactor = 0.30;   // higher = snappier visual tracking

    // Mouse / touch tracking
    this._mousePos    = { x: 0.5, y: 0.5 };
    this._prevMouseX  = 0.5;
    this._prevMouseY  = 0.5;

    // External callback so main.js can inject a "force slap" (click/tap)
    this.onForceSlap  = null;

    // Cache object to prevent frame-rate allocation overhead
    this._cachedWorldPos = { x: 0, y: 0, z: 0, tiltZ: 0 };
  }

  // ── Initialisation ─────────────────────────────────────

  async init(onProgress) {
    onProgress?.('Loading MediaPipe…');

    let loaded = false;

    // Try ESM CDNs in order until one works
    const candidates = [
      // esm.sh always serves proper ESM with correct MIME
      'https://esm.sh/@mediapipe/tasks-vision@0.10.14',
      // jsDelivr +esm wrapper (auto-converts to ESM)
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/+esm',
      // unpkg direct bundle
      'https://unpkg.com/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
    ];

    const wasmBases = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm',
      'https://unpkg.com/@mediapipe/tasks-vision@0.10.14/wasm',
    ];

    const MODEL =
      'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

    for (const cdnUrl of candidates) {
      if (loaded) break;
      try {
        onProgress?.(`Trying MediaPipe CDN…`);
        const mp = await import(/* @vite-ignore */ cdnUrl);
        const { HandLandmarker, FilesetResolver } = mp;

        if (!HandLandmarker || !FilesetResolver) {
          throw new Error('Expected exports missing');
        }

        for (const wasmBase of wasmBases) {
          try {
            onProgress?.('Resolving WASM…');
            const vision = await FilesetResolver.forVisionTasks(wasmBase);

            onProgress?.('Creating landmarker…');

            // Try GPU first, fall back to CPU
            for (const delegate of ['GPU', 'CPU']) {
              try {
                this._landmarker = await HandLandmarker.createFromOptions(vision, {
                  baseOptions: { modelAssetPath: MODEL, delegate },
                  runningMode: 'VIDEO',
                  numHands:    1,
                });
                onProgress?.(`Hand tracking ready (${delegate})`);
                console.log(`[HandTracker] ✅ ${cdnUrl} + delegate=${delegate}`);
                loaded = true;
                this.isReady = true;
                break;
              } catch (delegateErr) {
                console.warn(`[HandTracker] delegate ${delegate} failed:`, delegateErr);
              }
            }
            if (loaded) break;
          } catch (wasmErr) {
            console.warn('[HandTracker] WASM base failed:', wasmBase, wasmErr);
          }
        }
      } catch (cdnErr) {
        console.warn('[HandTracker] CDN failed:', cdnUrl, cdnErr);
      }
    }

    if (!loaded) {
      console.warn('[HandTracker] All CDNs failed — switching to mouse mode');
      onProgress?.('Hand tracking unavailable — using mouse mode');
      this.enableMouseMode();
    }

    this._attachInputListeners();
  }

  // ── Webcam ─────────────────────────────────────────────

  async startWebcam() {
    if (this.mouseMode) return true;
    if (!this.isReady) {
      console.warn('[HandTracker] Not ready — mouse mode');
      this.enableMouseMode();
      return false;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[HandTracker] mediaDevices API not supported — mouse mode fallback');
      this.enableMouseMode();
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      this.video.srcObject = stream;
      await new Promise(res => { this.video.onloadedmetadata = res; });
      await this.video.play();
      this.isRunning = true;

      // Re-grab canvas and context in case DOM reloaded
      this.canvas = document.getElementById('webcam-canvas');
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

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
    if (this.video?.srcObject) {
      this.video.srcObject.getTracks().forEach(t => t.stop());
      this.video.srcObject = null;
    }
    this.isRunning = false;
  }

  // ── Mouse / touch fallback ─────────────────────────────

  enableMouseMode() {
    this.mouseMode    = true;
    this.isReady      = true;
    this.isRunning    = true;
    this.handDetected = true;
    this.handOpen     = true;

    const wc = document.getElementById('webcam-container');
    if (wc) wc.style.display = 'none';
    console.log('[HandTracker] 🖱️  Mouse mode active — click canvas to slap');
  }

  _attachInputListeners() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    // Track mouse position
    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      this._mousePos.x = (e.clientX - r.left) / r.width;
      this._mousePos.y = (e.clientY - r.top)  / r.height;
    });

    // Touch position
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const r     = canvas.getBoundingClientRect();
      const t     = e.touches[0];
      this._mousePos.x = (t.clientX - r.left) / r.width;
      this._mousePos.y = (t.clientY - r.top)  / r.height;
    }, { passive: false });

    // Click / tap → force slap
    canvas.addEventListener('pointerdown', () => {
      if (this.onForceSlap) this.onForceSlap();
    });
  }

  // ── Per-frame update ───────────────────────────────────

  update(deltaTime) {
    if (!this.isReady || !this.isRunning) return;

    // ---------- save previous RAW position for velocity ----------
    this._rawPrevX = this.palmCenter.x;
    this._rawPrevY = this.palmCenter.y;

    // ---------- update raw palm center ----------
    if (this.mouseMode) {
      this.palmCenter.x = this._mousePos.x;
      this.palmCenter.y = this._mousePos.y;
      this.handDetected = true;
      this.handOpen     = true;
      this.handDepth    = 0.5;
    } else {
      this._detectHand();
    }

    // ---------- smooth position for rendering ----------
    const lf = this._lerpFactor;
    this.smoothedPalm.x += (this.palmCenter.x - this.smoothedPalm.x) * lf;
    this.smoothedPalm.y += (this.palmCenter.y - this.smoothedPalm.y) * lf;
    this.smoothedHandDepth += (this.handDepth - this.smoothedHandDepth) * lf;

    // ---------- velocity from RAW delta (not smoothed) ----------
    if (deltaTime > 0) {
      this.velocity.x     = (this.palmCenter.x - this._rawPrevX) / deltaTime;
      this.velocity.y     = (this.palmCenter.y - this._rawPrevY) / deltaTime;
      this.velocity.speed = Math.hypot(this.velocity.x, this.velocity.y);
    }

    // ---------- update webcam badge ----------
    const ind = document.getElementById('hand-indicator');
    if (ind) {
      if (this.mouseMode) {
        ind.textContent = '🖱️';
      } else if (this.handDetected) {
        ind.textContent = '✋';
        ind.style.opacity = '1';
      } else {
        ind.textContent = '❌';
        ind.style.opacity = '0.5';
      }
    }
  }

  // ── MediaPipe detection (webcam mode only) ─────────────

  _detectHand() {
    if (!this._landmarker || !this.video || this.video.readyState < 2) return;

    // Throttle to ~30 fps to reduce CPU load
    const now = performance.now();
    if (now - this._lastDetectionMs < 33) return;
    this._lastDetectionMs = now;

    try {
      const results = this._landmarker.detectForVideo(this.video, now);

      if (results.landmarks?.length > 0) {
        this.handDetected = true;
        const lm = results.landmarks[0];

        // Palm centre: wrist + 4 knuckle bases
        const palmIdx = [0, 5, 9, 13, 17];
        let px = 0, py = 0;
        palmIdx.forEach(i => { px += lm[i].x; py += lm[i].y; });
        this.palmCenter.x = px / palmIdx.length;
        this.palmCenter.y = py / palmIdx.length;

        // Open-hand detection: majority of fingertips above their base knuckle
        const tips  = [8, 12, 16, 20];
        const bases = [5,  9, 13, 17];
        let openCount = 0;
        tips.forEach((t, i) => { if (lm[t].y < lm[bases[i]].y) openCount++; });
        this.handOpen = openCount >= 3;

        // Calculate Hand Depth (distance between wrist landmark 0 and middle finger base landmark 9)
        const dx = lm[0].x - lm[9].x;
        const dy = lm[0].y - lm[9].y;
        const dz = lm[0].z - lm[9].z;
        const currentDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        // Map normal palm distance [0.09, 0.26] to depth [0.0, 1.0]
        const rawDepth = Math.max(0, Math.min(1, (currentDist - 0.09) / 0.17));
        this.handDepth = rawDepth;

        // Draw overlay skeleton representation
        this._drawSkeleton(lm);

        this._updateBadge('✋ DETECTED');
      } else {
        this.handDetected = false;
        // Clear skeleton canvas
        if (this.ctx && this.canvas) {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this._updateBadge('🔍 SCANNING…');
      }
    } catch (e) {
      // silently skip bad frames
    }
  }

  _drawSkeleton(landmarks) {
    if (!this.canvas || !this.ctx) return;
    
    // Set canvas dimensions to match actual video source size
    this.canvas.width = this.video.videoWidth || 640;
    this.canvas.height = this.video.videoHeight || 480;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Finger connections pairs
    const connections = [
      // Thumb
      [0, 1], [1, 2], [2, 3], [3, 4],
      // Index
      [0, 5], [5, 6], [6, 7], [7, 8],
      // Middle
      [0, 9], [9, 10], [10, 11], [11, 12],
      // Ring
      [0, 13], [13, 14], [14, 15], [15, 16],
      // Pinky
      [0, 17], [17, 18], [18, 19], [19, 20],
      // Palm base
      [5, 9], [9, 13], [13, 17]
    ];

    // Connection lines (neon cyan)
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    connections.forEach(([start, end]) => {
      const p1 = landmarks[start];
      const p2 = landmarks[end];
      if (p1 && p2) {
        ctx.beginPath();
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
        ctx.stroke();
      }
    });

    // Landmark joints (neon pink + white core)
    landmarks.forEach(lm => {
      ctx.fillStyle = '#ff0099';
      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, 7, 0, 2 * Math.PI);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(lm.x * w, lm.y * h, 7, 0, 2 * Math.PI);
      ctx.stroke();
    });
  }

  _updateBadge(text) {
    const lbl = document.getElementById('webcam-label');
    if (lbl) lbl.textContent = text;
  }

  // ── World-space conversion ────────────────────────────

  /**
   * Map normalised palm position to Three.js world XY at given Z depth.
   * Mirrors X axis so movement feels natural.
   */
  getWorldPosition(baseZ = 8.8) {
    let zPos = baseZ;
    if (!this.mouseMode) {
      // Map smoothedHandDepth [0.0, 1.0] to dynamic Z range [8.8, 1.0]
      zPos = baseZ - this.smoothedHandDepth * 7.8;
    }
    this._cachedWorldPos.x = (1 - this.smoothedPalm.x) * 8 - 4;
    this._cachedWorldPos.y = (1 - this.smoothedPalm.y) * 5 - 0.5;
    this._cachedWorldPos.z = zPos;
    return this._cachedWorldPos;
  }
}
