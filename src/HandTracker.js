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
    } else {
      this._detectHand();
    }

    // ---------- smooth position for rendering ----------
    const lf = this._lerpFactor;
    this.smoothedPalm.x += (this.palmCenter.x - this.smoothedPalm.x) * lf;
    this.smoothedPalm.y += (this.palmCenter.y - this.smoothedPalm.y) * lf;

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

        this._updateBadge('✋ DETECTED');
      } else {
        this.handDetected = false;
        this._updateBadge('🔍 SCANNING…');
      }
    } catch (e) {
      // silently skip bad frames
    }
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
  getWorldPosition(z = 7) {
    return {
      x: (1 - this.smoothedPalm.x) * 8 - 4,   // mirror → [-4, 4]
      y: (1 - this.smoothedPalm.y) * 5 - 0.5,  // flip   → [4.5, -0.5]
      z,
    };
  }
}
