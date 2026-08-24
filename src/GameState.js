/**
 * GameState.js
 * Central event bus + finite state machine for Slap King AI.
 *
 * States: LOADING → MENU → TUTORIAL → PLAYING → BOSS_DEFEAT → VICTORY → GAME_OVER
 */

export class GameState {
  constructor() {
    this.current = 'LOADING';
    this._listeners = {};

    // Shared runtime data
    this.score        = 0;
    this.currentBoss  = 0;
    this.totalBosses  = 5;
    this.coins        = 0;
    this.xp           = 0;
  }

  // ── State ──────────────────────────────────────────────

  setState(newState) {
    const prev = this.current;
    this.current = newState;
    console.log(`[GameState] ${prev} → ${newState}`);
    this.emit('stateChange', { from: prev, to: newState });
  }

  is(state) {
    return this.current === state;
  }

  // ── Events ─────────────────────────────────────────────

  /**
   * Subscribe to an event.
   * @returns unsubscribe function
   */
  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
    return () => this.off(event, cb);
  }

  off(event, cb) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(l => l !== cb);
    }
  }

  emit(event, data) {
    const handlers = this._listeners[event] || [];
    handlers.forEach(cb => {
      try { cb(data); }
      catch (e) { console.error(`[GameState] Error in handler for "${event}":`, e); }
    });
  }

  // ── Score / Progress ───────────────────────────────────

  addScore(points) {
    this.score += Math.round(points);
    this.emit('scoreUpdate', { score: this.score });
  }

  reset() {
    this.score       = 0;
    this.currentBoss = 0;
    this.coins       = 0;
    this.xp          = 0;
    this.emit('reset', {});
  }
}
