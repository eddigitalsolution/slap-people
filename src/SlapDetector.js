/**
 * SlapDetector.js  (v3 — Gesture-Intent Slap Detection)
 *
 * Real slap detection requires:
 *  1. Hand must be OPEN (palm facing camera)
 *  2. Hand must ACCELERATE fast — a quick burst, not constant drift
 *  3. After the burst, velocity must DROP (follow-through + stop)
 *     — this filters sustained movement / drift vs. a real swing
 *  4. Cooldown prevents repeat triggers
 *  5. At least 10 stable detection frames before any slap can fire
 *
 * Gesture phases tracked per swing:
 *   IDLE → WINDUP (slow or backward) → SWING (fast burst) → RECOIL (slow)
 *   A slap fires exactly once at the SWING→RECOIL transition.
 */

export class SlapDetector {
  constructor(gameState, handTracker) {
    this.gameState   = gameState;
    this.handTracker = handTracker;

    this.cooldown        = 0.35;  // min seconds between slaps
    this.lastSlapTime    = -999;
    this.sensitivity     = 1.0;
    this.enabled         = true;
    this.detectionFrames = 0;

    // ── Gesture state machine ──────────────────────────────
    // Tracks the speed history to detect a genuine slap gesture
    this._phase          = 'IDLE';    // IDLE | SWING | RECOIL
    this._peakSpeed      = 0;
    this._peakVelX       = 0;
    this._peakVelY       = 0;
    this._swingFrames    = 0;
    this._recoilFrames   = 0;

    // Speed threshold to enter SWING phase — must be a real fast movement
    this._swingEnter     = 0.28;
    // Speed threshold to exit SWING → RECOIL (hand deceleration detected)
    this._recoilEnter    = 0.18;
    // Minimum frames at speed to count as intentional swing (not a twitch)
    this._minSwingFrames = 2;
    // Frames of deceleration needed to confirm the slap landed
    this._minRecoilFrames = 1;

    // Slap level thresholds based on PEAK speed during the swing
    this._thresholds = {
      weak:     0.28,
      normal:   0.55,
      strong:   1.00,
      critical: 1.70,
    };

    this._damage = {
      weak:     5,
      normal:   10,
      strong:   20,
      critical: 50,
    };

    this.isStable     = false;
    this.stableFrames = 0;
  }

  setSensitivity(value) {
    // value 1-5 from slider
    this.sensitivity = value / 3.0;
  }

  reset() {
    this._phase       = 'IDLE';
    this._peakSpeed   = 0;
    this._swingFrames = 0;
    this._recoilFrames = 0;
    this.detectionFrames = 0;
    this.lastSlapTime = -999;
    this.isStable     = false;
    this.stableFrames = 0;
  }

  /**
   * Call once per frame.
   * @param {number} currentTime – elapsed seconds
   */
  update(currentTime) {
    if (!this.enabled) return null;

    // Reset gesture on hand loss
    if (!this.handTracker.handDetected) {
      this.detectionFrames = 0;
      this.isStable        = false;
      this.stableFrames    = 0;
      this._phase          = 'IDLE';
      this._peakSpeed      = 0;
      this._swingFrames    = 0;
      return null;
    }

    this.detectionFrames++;
    // Need stable tracking before we trust velocity
    if (this.detectionFrames < 10) return null;

    // Respect post-slap cooldown
    if (currentTime - this.lastSlapTime < this.cooldown) {
      // Reset phase during cooldown so we don't carry over stale state
      this._phase = 'IDLE';
      this._peakSpeed = 0;
      return null;
    }

    const speed  = this.handTracker.velocity.speed / this.sensitivity;
    const vx     = this.handTracker.velocity.x / this.sensitivity;
    const vy     = this.handTracker.velocity.y / this.sensitivity;

    // Wait until hand becomes stable (stationary) once or has been tracked for 1s
    if (!this.isStable) {
      if (speed < 0.15) {
        this.stableFrames++;
        if (this.stableFrames >= 5) {
          this.isStable = true;
        }
      } else {
        this.stableFrames = 0; // reset stable count if hand is moving
      }
      
      // Fallback: if tracked for 35 frames (~1 second), force stable to avoid getting stuck
      if (this.detectionFrames >= 35) {
        this.isStable = true;
      }

      if (!this.isStable) {
        return null; // Ignore all velocity until stable
      }
    }

    // ── Phase machine ──────────────────────────────────────
    switch (this._phase) {

      case 'IDLE':
        if (speed >= this._swingEnter) {
          this._phase       = 'SWING';
          this._peakSpeed   = speed;
          this._peakVelX    = vx;
          this._peakVelY    = vy;
          this._swingFrames = 1;
        }
        break;

      case 'SWING':
        if (speed >= this._recoilEnter) {
          // Still moving fast — track peak
          this._swingFrames++;
          if (speed > this._peakSpeed) {
            this._peakSpeed = speed;
            this._peakVelX  = vx;
            this._peakVelY  = vy;
          }
        } else {
          // Deceleration detected — this is the natural follow-through
          if (this._swingFrames >= this._minSwingFrames) {
            this._phase = 'RECOIL';
            this._recoilFrames = 1;
          } else {
            // Too brief — was just jitter, discard
            this._phase = 'IDLE';
            this._peakSpeed = 0;
          }
        }
        break;

      case 'RECOIL':
        this._recoilFrames++;
        if (this._recoilFrames >= this._minRecoilFrames) {
          // ✅ Confirmed real slap — fire the event
          const result = this._fireSlap(currentTime);
          this._phase = 'IDLE';
          this._peakSpeed = 0;
          this._swingFrames = 0;
          return result;
        }
        // If speed suddenly rises again during recoil, it's a new swing starting
        if (speed >= this._swingEnter) {
          this._phase       = 'SWING';
          this._peakSpeed   = speed;
          this._peakVelX    = vx;
          this._peakVelY    = vy;
          this._swingFrames = 1;
        }
        break;
    }

    return null;
  }

  _fireSlap(currentTime) {
    const peak   = this._peakSpeed;
    const pvx    = this._peakVelX;
    const pvy    = this._peakVelY;
    const absX   = Math.abs(pvx);
    const absY   = Math.abs(pvy);

    // Determine slap level from peak swing speed
    let level;
    if      (peak >= this._thresholds.critical) level = 'critical';
    else if (peak >= this._thresholds.strong)   level = 'strong';
    else if (peak >= this._thresholds.normal)   level = 'normal';
    else                                         level = 'weak';

    // Determine direction from dominant axis at peak
    let direction;
    if (absY > absX * 1.5) {
      direction = pvy < 0 ? 'smash' : 'uppercut';
    } else if (absX > absY * 1.5) {
      direction = 'horizontal';
    } else {
      direction = 'diagonal';
    }

    const isSwing = direction === 'horizontal' || direction === 'diagonal';
    const swingBonus = isSwing
      ? Math.floor(peak * 30)
      : (direction === 'smash' ? Math.floor(peak * 40) : 10);

    this.lastSlapTime = currentTime;

    const slapEvent = {
      level,
      speed:    peak,
      velocity: { x: pvx, y: pvy, speed: peak },
      position: { ...this.handTracker.smoothedPalm },
      isSwing,
      swingBonus,
      direction,
    };

    this.gameState.emit('slap', slapEvent);
    return slapEvent;
  }

  getDamage(level) {
    return this._damage[level] ?? 0;
  }
}
