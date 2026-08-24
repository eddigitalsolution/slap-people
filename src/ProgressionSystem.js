/**
 * ProgressionSystem.js
 * Manages coins, XP, achievements and the local leaderboard.
 * All data is persisted via localStorage under the key "slapKingAI".
 */

export class ProgressionSystem {
  constructor(gameState) {
    this.gameState   = gameState;
    this.data        = this._load();
    this.totalSlaps  = this.data.totalSlaps || 0;

    this.achievements = [
      { id: 'first_slap',   name: 'First Slap!',      desc: 'Land your first slap',      icon: '👋', unlocked: false },
      { id: 'slap_100',     name: 'Slapper',           desc: 'Land 100 slaps',            icon: '💪', unlocked: false },
      { id: 'slap_1000',    name: 'Slap Master',       desc: 'Land 1 000 slaps',          icon: '🤯', unlocked: false },
      { id: 'combo_master', name: 'Combo Master',      desc: 'Reach ×10 combo',           icon: '🔥', unlocked: false },
      { id: 'critical_hit', name: 'Critical!',         desc: 'Land a critical slap',      icon: '⚡', unlocked: false },
      { id: 'boss_1',       name: 'Office Crusher',    desc: 'Defeat the Office Manager', icon: '💼', unlocked: false },
      { id: 'boss_5',       name: 'Slap Legend',       desc: 'Defeat all 5 bosses',       icon: '👑', unlocked: false },
      { id: 'score_1000',   name: 'Point Hunter',      desc: 'Score 1 000 points',        icon: '🏆', unlocked: false },
    ];

    // Rehydrate unlocked state from saved data
    const saved = this.data.achievements || [];
    this.achievements.forEach(a => { a.unlocked = saved.includes(a.id); });

    this._setupListeners();
  }

  // ── Event wiring ───────────────────────────────────────

  _setupListeners() {
    this.gameState.on('slap', e => {
      this.totalSlaps++;
      this.data.totalSlaps = this.totalSlaps;
      this._check('first_slap',   this.totalSlaps >= 1);
      this._check('slap_100',     this.totalSlaps >= 100);
      this._check('slap_1000',    this.totalSlaps >= 1000);
      this._check('critical_hit', e.level === 'critical');
    });

    this.gameState.on('comboUpdate', e => {
      this._check('combo_master', e.multiplier >= 10);
    });

    this.gameState.on('scoreUpdate', e => {
      this._check('score_1000', e.score >= 1000);
    });
  }

  // ── Achievement helpers ────────────────────────────────

  _check(id, condition) {
    if (!condition) return;
    const a = this.achievements.find(x => x.id === id);
    if (!a || a.unlocked) return;
    a.unlocked = true;
    if (!this.data.achievements) this.data.achievements = [];
    this.data.achievements.push(id);
    this._save();
    this.gameState.emit('achievementUnlocked', a);
  }

  unlockBossAchievement(bossIndex) {
    if (bossIndex === 0) this._check('boss_1', true);
    if (bossIndex === 4) this._check('boss_5', true);
  }

  // ── Leaderboard ────────────────────────────────────────

  saveScore(score) {
    if (!this.data.leaderboard) this.data.leaderboard = [];
    this.data.leaderboard.push({
      score,
      date: new Date().toLocaleDateString(),
    });
    this.data.leaderboard.sort((a, b) => b.score - a.score);
    this.data.leaderboard = this.data.leaderboard.slice(0, 10);

    if (!this.data.highScore || score > this.data.highScore) {
      this.data.highScore = score;
    }
    this._save();
  }

  getHighScore()   { return this.data.highScore || 0; }
  getLeaderboard() { return this.data.leaderboard || []; }

  // ── Storage ────────────────────────────────────────────

  _save() {
    try { localStorage.setItem('slapKingAI', JSON.stringify(this.data)); }
    catch (e) { console.warn('[ProgressionSystem] localStorage write failed:', e); }
  }

  _load() {
    try {
      const raw = localStorage.getItem('slapKingAI');
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
}
