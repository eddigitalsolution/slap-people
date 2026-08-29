/**
 * SlapDetector.js
 * Analyses per-frame hand velocity and fires a 'slap' event when the
 * movement speed exceeds a threshold.
 *
 * Slap levels → base damage (thresholds are RAW palm-centre delta/sec):
 *   weak     > 0.08 /s → 5
 *   normal   > 0.20 /s → 10
 *   strong   > 0.40 /s → 20
 *   critical > 0.80 /s → 50
 */

export class SlapDetector {
  constructor(gameState, handTracker) {
    this.gameState   = gameState;
    this.handTracker = handTracker;

    this.cooldown     = 0.4;  // minimum seconds between slaps
    this.lastSlapTime = -999;
    this.sensitivity  = 1.0;  // divisor applied to raw thresholds
    this.enabled      = true;
    this.detectionFrames = 0; // consecutive tracked frames count

    // Thresholds in RAW normalised-screen-space units per second.
    // (velocity is now measured from unsmoothed palmCenter delta)
    this._thresholds = {
      weak:     0.20,
      normal:   0.45,
      strong:   0.80,
      critical: 1.40,
    };

    this._damage = {
      weak:     5,
      normal:   10,
      strong:   20,
      critical: 50,
    };
  }

  setSensitivity(value) {
    // value 1-5 from settings slider; lower = more sensitive
    this.sensitivity = value / 3.0;
  }

  /**
   * Call once per frame.
   * @param {number} currentTime – performance.now() / 1000
   * @returns {object|null} slapEvent or null
   */
  update(currentTime) {
    if (!this.enabled) return null;
    
    if (!this.handTracker.handDetected) {
      this.detectionFrames = 0;
      return null;
    }

    this.detectionFrames++;
    // Ignore initial detection frames to prevent entrance noise or velocity jumps
    if (this.detectionFrames < 10) return null;

    if (currentTime - this.lastSlapTime < this.cooldown) return null;

    const speed     = this.handTracker.velocity.speed;
    const adjSpeed  = speed / this.sensitivity;

    let level = null;
    if      (adjSpeed >= this._thresholds.critical) level = 'critical';
    else if (adjSpeed >= this._thresholds.strong)   level = 'strong';
    else if (adjSpeed >= this._thresholds.normal)   level = 'normal';
    else if (adjSpeed >= this._thresholds.weak)     level = 'weak';

    if (!level) return null;

    // Determine slap direction based on velocity ratios
    const vx = this.handTracker.velocity.x;
    const vy = this.handTracker.velocity.y;
    const absX = Math.abs(vx);
    const absY = Math.abs(vy);
    
    let direction = 'horizontal';
    if (absY > absX * 1.5) {
      direction = vy < 0 ? 'smash' : 'uppercut';
    } else if (absX > absY * 1.5) {
      direction = 'horizontal';
    } else {
      direction = 'diagonal';
    }

    const isSwing = direction === 'horizontal' || direction === 'diagonal';
    const swingBonus = isSwing ? Math.floor(adjSpeed * 30) : (direction === 'smash' ? Math.floor(adjSpeed * 40) : 10);

    this.lastSlapTime = currentTime;
    const slapEvent = {
      level,
      speed:    adjSpeed,
      velocity: { ...this.handTracker.velocity },
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
