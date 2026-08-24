/**
 * UIManager.js
 * Owns every HTML/CSS overlay element:
 *  – Screen transitions (menu → playing → …)
 *  – Boss HP bar
 *  – Score & timer
 *  – Combo meter
 *  – Floating damage numbers (object-pooled)
 *  – Achievement toast
 *  – Boss taunt bubbles
 *  – Leaderboard population
 *  – Victory / defeat / game-over modals
 */
import { gsap } from 'gsap';

export class UIManager {
  constructor(gameState, progression, audio) {
    this.gameState   = gameState;
    this.progression = progression;
    this.audio       = audio;

    this._dmgPool     = [];
    this._POOL_SZ     = 24;
    this._tauntBubble = null;

    this._buildDamagePool();
    this._wireGameStateListeners();
  }

  // ── Damage number pool ────────────────────────────────

  _buildDamagePool() {
    const container = document.getElementById('damage-numbers');
    for (let i = 0; i < this._POOL_SZ; i++) {
      const el = document.createElement('div');
      el.className    = 'damage-number';
      el.style.display = 'none';
      container.appendChild(el);
      this._dmgPool.push({ el, active: false });
    }
  }

  _getDmgEl() {
    return this._dmgPool.find(p => !p.active) ?? this._dmgPool[0];
  }

  // ── GameState listeners ───────────────────────────────

  _wireGameStateListeners() {
    this.gameState.on('bossDamaged',       e => this.updateBossHP(e.hp, e.maxHp));
    this.gameState.on('bossSpawned',       e => this._onBossSpawned(e));
    this.gameState.on('comboUpdate',       e => this.updateCombo(e));
    this.gameState.on('scoreUpdate',       e => this.updateScore(e.score));
    this.gameState.on('achievementUnlocked', e => this.showAchievementToast(e));
    this.gameState.on('bossTaunt',         e => this._showTaunt(e.text));
  }

  // ── Screen management ─────────────────────────────────

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    gsap.fromTo(el,
      { opacity: 0, scale: 0.94 },
      { opacity: 1, scale: 1, duration: 0.32, ease: 'power2.out' }
    );
  }

  hideAllScreens() {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  }

  showHUD(show) {
    const hud = document.getElementById('hud');
    if (!hud) return;
    if (show) {
      hud.classList.remove('hidden');
      gsap.fromTo(hud, { opacity: 0 }, { opacity: 1, duration: 0.45 });
    } else {
      hud.classList.add('hidden');
    }
  }

  // ── Boss info ─────────────────────────────────────────

  _onBossSpawned(e) {
    const nameEl  = document.getElementById('boss-name-display');
    const levelEl = document.getElementById('boss-level-display');
    if (nameEl)  nameEl.textContent  = `💀 ${e.name}`;
    if (levelEl) levelEl.textContent = `LEVEL ${e.index + 1} — ${e.subtitle}`;
    this.updateBossHP(e.hp, e.maxHp);

    // Animate HP bar entrance
    const bar = document.getElementById('boss-hp-bar');
    if (bar) gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'power3.out' });
  }

  updateBossHP(hp, maxHp) {
    const bar  = document.getElementById('boss-hp-bar');
    const text = document.getElementById('boss-hp-text');
    const pct  = Math.max(0, (hp / maxHp) * 100);

    if (bar) {
      gsap.to(bar, { width: pct + '%', duration: 0.28, ease: 'power2.out' });
      // Colour shifts: green → amber → red
      if (pct > 60)      bar.style.background = 'linear-gradient(90deg,#00ff88,#00cc55)';
      else if (pct > 25) bar.style.background = 'linear-gradient(90deg,#ffcc00,#ff8800)';
      else               bar.style.background = 'linear-gradient(90deg,#ff2244,#cc0011)';
    }
    if (text) text.textContent = `${Math.ceil(hp)} / ${maxHp}`;
  }

  // ── Score ─────────────────────────────────────────────

  updateScore(score) {
    const el = document.getElementById('score-display');
    if (!el) return;
    el.textContent = score.toLocaleString();
    gsap.fromTo(el, { scale: 1.22 }, { scale: 1, duration: 0.22, ease: 'back.out(2)' });
  }

  updateHighScore(score) {
    const el = document.getElementById('high-score-display');
    if (el) el.textContent = score.toLocaleString();
  }

  // ── Timer ─────────────────────────────────────────────

  updateTimer(seconds) {
    const el = document.getElementById('timer-display');
    if (!el) return;
    el.textContent = Math.ceil(seconds);
    if (seconds <= 10) {
      el.style.color = '#ff2244';
      gsap.fromTo(el, { scale: 1.18 }, { scale: 1, duration: 0.18 });
    } else {
      el.style.color = '';
    }
  }

  // ── Combo ─────────────────────────────────────────────

  updateCombo(data) {
    const valEl = document.getElementById('combo-display');
    const barEl = document.getElementById('combo-bar');

    if (valEl) {
      valEl.textContent = data.label ?? '×1';
      const colours = ['#ffffff', '#00ff88', '#ffcc00', '#ff6600', '#ff00aa'];
      valEl.style.color = colours[Math.min(data.level ?? 0, colours.length - 1)];
      if ((data.combo ?? 0) > 1) {
        gsap.fromTo(valEl, { scale: 1.55 }, { scale: 1, duration: 0.32, ease: 'back.out(2.5)' });
      }
    }
    if (barEl) {
      const lv = data.level ?? 0;
      barEl.style.background = lv >= 3
        ? 'linear-gradient(90deg,#ff00aa,#ff6600)'
        : lv >= 1
          ? 'linear-gradient(90deg,#ffcc00,#00ff88)'
          : 'linear-gradient(90deg,#00e5ff,#0066ff)';
    }
  }

  /** Call every frame with combo.getProgress() (0–1). */
  updateComboBar(progress) {
    const bar = document.getElementById('combo-bar');
    if (bar) bar.style.width = (progress * 100) + '%';
  }

  // ── Floating damage numbers ───────────────────────────

  /**
   * @param {string} text   e.g. "+50" or "CRITICAL! 500"
   * @param {number} screenX
   * @param {number} screenY
   * @param {string} type   'weak'|'normal'|'strong'|'critical'|'combo'
   */
  showDamageNumber(text, screenX, screenY, type = 'normal') {
    const item = this._getDmgEl();
    const el   = item.el;
    item.active = true;

    const cols = {
      weak:     '#ffff55',
      normal:   '#ff9900',
      strong:   '#ff3366',
      critical: '#00ffff',
      combo:    '#00ff88',
    };

    el.textContent = text;
    el.style.cssText = `
      display: block;
      left: ${screenX}px;
      top:  ${screenY}px;
      color: ${cols[type] ?? '#ffffff'};
      font-size: ${type === 'critical' ? '3.5rem' : type === 'combo' ? '2.2rem' : '2.6rem'};
      text-shadow: 0 0 18px ${cols[type] ?? '#ffffff'}, 0 2px 4px rgba(0,0,0,.8);
      font-family: 'Bangers', cursive;
      font-weight: 400;
      letter-spacing: 2px;
      pointer-events: none;
      position: absolute;
      z-index: 200;
      white-space: nowrap;
    `;

    gsap.killTweensOf(el);
    gsap.fromTo(el,
      { y: 0, opacity: 1, scale: 0.4 },
      {
        y: -130, opacity: 0, scale: 1.25,
        duration: 1.5, ease: 'power2.out',
        onComplete: () => { el.style.display = 'none'; item.active = false; },
      }
    );
  }

  // ── Achievement toast ─────────────────────────────────

  showAchievementToast(achievement) {
    const toast  = document.getElementById('achievement-toast');
    const nameEl = document.getElementById('achievement-name');
    if (!toast || !nameEl) return;

    nameEl.textContent = `${achievement.icon}  ${achievement.name}`;
    toast.classList.remove('hidden');

    gsap.killTweensOf(toast);
    gsap.timeline()
      .fromTo(toast,
        { x: 120, opacity: 0 },
        { x: 0,   opacity: 1, duration: 0.42, ease: 'back.out(1.6)' }
      )
      .to(toast,
        { x: 120, opacity: 0, duration: 0.38, delay: 2.8,
          onComplete: () => toast.classList.add('hidden') }
      );
  }

  // ── Boss taunt bubble ─────────────────────────────────

  _showTaunt(text) {
    if (!this._tauntBubble) {
      this._tauntBubble = document.createElement('div');
      this._tauntBubble.id = 'boss-taunt';
      document.body.appendChild(this._tauntBubble);
    }

    const b = this._tauntBubble;
    b.textContent = text;
    b.style.cssText = `
      position:fixed; top:33%; left:50%; transform:translateX(-50%) scale(0);
      background:#fff; color:#1a1a1a; padding:10px 24px;
      border-radius:22px; font-family:'Bangers',cursive; font-size:2rem;
      z-index:88; border:3px solid #333; box-shadow:5px 5px 0 #333;
      pointer-events:none; white-space:nowrap;
    `;
    gsap.killTweensOf(b, 'transform,scale');
    gsap.timeline()
      .to(b, { scale: 1,   duration: 0.28, ease: 'back.out(1.8)', transformOrigin: 'center bottom' })
      .to(b, { scale: 0,   duration: 0.25, delay: 2.1, ease: 'power2.in' });
  }

  // ── Leaderboard ───────────────────────────────────────

  populateLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;

    const scores = this.progression.getLeaderboard();
    if (!scores.length) {
      list.innerHTML = '<div class="lb-empty">No scores yet — start playing!</div>';
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    list.innerHTML = scores.map((entry, i) => `
      <div class="lb-entry ${i < 3 ? 'lb-top' : ''}">
        <span class="lb-rank">${medals[i] ?? `#${i + 1}`}</span>
        <span class="lb-score">${entry.score.toLocaleString()}</span>
        <span class="lb-date">${entry.date}</span>
      </div>
    `).join('');
  }

  // ── Compound screens ──────────────────────────────────

  showBossDefeatScreen(bossName, coins, xp, hasNext) {
    const titleEl   = document.getElementById('defeat-title');
    const rewardEl  = document.getElementById('defeat-rewards');
    const nextBtn   = document.getElementById('btn-next-boss');

    if (titleEl)  titleEl.textContent  = `💥 ${bossName} DEFEATED!`;
    if (rewardEl) rewardEl.innerHTML   = `
      <div class="reward-row">🪙 +${coins} Coins</div>
      <div class="reward-row">⭐ +${xp} XP</div>
    `;
    if (nextBtn) {
      nextBtn.textContent = hasNext ? 'NEXT BOSS →' : '👑 CLAIM VICTORY →';
      nextBtn.style.display = '';
    }

    this.showScreen('boss-defeat-screen');
  }

  showVictoryScreen(score) {
    const el = document.getElementById('victory-score');
    if (el) el.textContent = score.toLocaleString();
    this.showScreen('victory-screen');
  }

  showGameOverScreen(score, reason) {
    const sEl = document.getElementById('game-over-score');
    const rEl = document.getElementById('game-over-reason');
    if (sEl) sEl.textContent = score.toLocaleString();
    if (rEl) rEl.textContent = reason;
    this.showScreen('game-over-screen');
  }
}
