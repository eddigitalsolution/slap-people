/**
 * ComboSystem.js
 * Tracks consecutive successful slaps within a time window
 * and exposes a damage multiplier.
 *
 * Levels:
 *   1 hit  → ×1
 *   2-3    → ×2
 *   4-6    → ×3
 *   7-12   → ×5
 *   13+    → ×10
 */

export class ComboSystem {
  constructor(gameState) {
    this.gameState   = gameState;
    this.combo       = 0;
    this.maxCombo    = 0;
    this.comboWindow = 3.0;   // seconds before combo resets
    this.lastHitTime = 0;

    this._tiers = [
      { min: 1,  max: 1,        mult: 1,  label: '×1',  level: 0 },
      { min: 2,  max: 3,        mult: 2,  label: '×2',  level: 1 },
      { min: 4,  max: 6,        mult: 3,  label: '×3',  level: 2 },
      { min: 7,  max: 12,       mult: 5,  label: '×5',  level: 3 },
      { min: 13, max: Infinity,  mult: 10, label: '×10', level: 4 },
    ];
  }

  // ── Called on every confirmed slap ─────────────────────

  hit() {
    this.combo++;
    this.maxCombo    = Math.max(this.maxCombo, this.combo);
    this.lastHitTime = performance.now() / 1000;

    const tier = this.getTier();
    this.gameState.emit('comboUpdate', {
      combo:      this.combo,
      multiplier: tier.mult,
      label:      tier.label,
      level:      tier.level,
    });
    return tier;
  }

  // ── Reset ──────────────────────────────────────────────

  reset() {
    if (this.combo === 0) return;
    this.combo = 0;
    this.gameState.emit('comboUpdate', { combo: 0, multiplier: 1, label: '×1', level: 0 });
  }

  // ── Per-frame update ───────────────────────────────────

  update(currentTimeSecs) {
    if (this.combo > 0 && (currentTimeSecs - this.lastHitTime) > this.comboWindow) {
      this.reset();
    }
  }

  // ── Helpers ────────────────────────────────────────────

  getTier() {
    for (const t of this._tiers) {
      if (this.combo >= t.min && this.combo <= t.max) return t;
    }
    return this._tiers[this._tiers.length - 1];
  }

  /** 0→1 progress through the current combo window (for UI bar). */
  getProgress() {
    if (this.combo === 0) return 0;
    const elapsed = performance.now() / 1000 - this.lastHitTime;
    return Math.max(0, 1 - elapsed / this.comboWindow);
  }
}
