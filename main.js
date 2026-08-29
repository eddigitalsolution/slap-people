/**
 * main.js
 * Bootstrap, game loop, and event orchestration for Slap King AI.
 *
 * Dependency graph (no circular deps):
 *   GameState ← AudioManager, ProgressionSystem, ComboSystem
 *   HandTracker ← SlapDetector
 *   SceneBuilder (Three.js scene)
 *   BossManager  (scene)
 *   EffectsManager (scene, camera)
 *   UIManager (gameState, progression, audio)
 */

import * as THREE from 'three';
import { gsap }              from 'gsap';
import { GameState }         from './src/GameState.js';
import { AudioManager }      from './src/AudioManager.js';
import { HandTracker }       from './src/HandTracker.js';
import { SlapDetector }      from './src/SlapDetector.js';
import { ComboSystem }       from './src/ComboSystem.js';
import { ProgressionSystem } from './src/ProgressionSystem.js';
import { SceneBuilder }      from './src/SceneBuilder.js';
import { BossManager }       from './src/BossManager.js';
import { EffectsManager }    from './src/EffectsManager.js';
import { UIManager }         from './src/UIManager.js';

// ═══════════════════════════════════════════════════════
// Instantiate systems
// ═══════════════════════════════════════════════════════

const gameState   = new GameState();
const audio       = new AudioManager();
const progression = new ProgressionSystem(gameState);
const combo       = new ComboSystem(gameState);
const scene3d     = new SceneBuilder();
const hand        = new HandTracker();
const slapDetect  = new SlapDetector(gameState, hand);

// Boss + effects require scene references — set after scene3d.init()
let boss, effects, ui;

// ═══════════════════════════════════════════════════════
// Settings (mirrors HTML toggles)
// ═══════════════════════════════════════════════════════

const settings = { sfx: true, shake: true, particles: true, sensitivity: 3 };

// ═══════════════════════════════════════════════════════
// Timer
// ═══════════════════════════════════════════════════════

let timerSecs    = 60;
let timerRunning = false;

// ═══════════════════════════════════════════════════════
// Slap animation state (virtual hand lunges toward boss)
// ═══════════════════════════════════════════════════════

const slapAnim = { active: false, timer: 0, duration: 0.55 };

// ═══════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════

async function bootstrap() {
  setLoading(0.08, 'Starting 3D engine…');

  scene3d.init();
  setLoading(0.30, 'Building arena…');

  // Boss + effects can now access the live scene
  boss    = new BossManager(scene3d.scene, gameState);
  effects = new EffectsManager(scene3d.scene, scene3d.camera, gameState, settings);
  effects.init();
  ui      = new UIManager(gameState, progression, audio);

  audio.init();

  setLoading(0.55, 'Loading hand-tracking model…');
  await hand.init(msg => setLoading(0.75, msg));

  // ── Click / tap = instant strong slap (works in both mouse and webcam mode) ──
  hand.onForceSlap = () => {
    if (!gameState.is('PLAYING')) return;
    if (performance.now() / 1000 - slapDetect.lastSlapTime < slapDetect.cooldown) return;
    slapDetect.lastSlapTime = performance.now() / 1000;
    const slapEvent = { level: 'strong', speed: 0.5, velocity: { x: 0.5, y: 0, speed: 0.5 }, position: { ...hand.smoothedPalm } };
    gameState.emit('slap', slapEvent);
  };

  setLoading(1.0, 'Ready!');

  // Small delay so user sees 100%
  setTimeout(() => {
    hideLoading();
    showMainMenu();
    startLoop();
  }, 600);
}

// ── Loading helpers ───────────────────────────────────

function setLoading(pct, text) {
  const bar = document.getElementById('loading-bar');
  const txt = document.getElementById('loading-text');
  if (bar) bar.style.width = (pct * 100) + '%';
  if (txt) txt.textContent = text;
}

function hideLoading() {
  const ls = document.getElementById('loading-screen');
  if (ls) gsap.to(ls, { opacity: 0, duration: 0.7, onComplete: () => { ls.style.display = 'none'; } });
}

// ═══════════════════════════════════════════════════════
// Menu flow
// ═══════════════════════════════════════════════════════

function showMainMenu() {
  gameState.setState('MENU');
  ui.showScreen('main-menu');
  ui.showHUD(false);
  scene3d.showMenuHands();
  scene3d.hideVirtualHand();
  ui.updateHighScore(progression.getHighScore());
  wireButtons();
}

let _buttonsWired = false;
function wireButtons() {
  if (_buttonsWired) return;
  _buttonsWired = true;

  const btn = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => { audio.playMenuClick(); fn(); });
  };

  btn('btn-start',        startFlow);
  btn('btn-tutorial',     showTutorial);
  btn('btn-settings',     () => ui.showScreen('settings-screen'));
  btn('btn-leaderboard',  showLeaderboard);
  btn('btn-settings-back',showMainMenu);
  btn('btn-lb-back',      showMainMenu);
  btn('btn-grant-webcam', grantWebcam);
  btn('btn-skip-webcam',  skipWebcam);
  btn('btn-next-boss',    nextBoss);
  btn('btn-defeat-quit',  showMainMenu);
  btn('btn-play-again',   restartGame);
  btn('btn-retry',        restartGame);
  btn('btn-go-menu',      showMainMenu);
  btn('btn-victory-menu', showMainMenu);

  // Settings toggles
  _wire('toggle-sfx',      'change', e => { settings.sfx      = e.target.checked; audio.setEnabled(e.target.checked); });
  _wire('toggle-shake',    'change', e => { settings.shake     = e.target.checked; });
  _wire('toggle-particles','change', e => { settings.particles = e.target.checked; effects.settings.particles = e.target.checked; });
  _wire('toggle-mouse-mode','change',e => { if (e.target.checked) hand.enableMouseMode(); });
  _wire('slap-sensitivity','input',  e => { settings.sensitivity = +e.target.value; slapDetect.setSensitivity(settings.sensitivity); });

  // Tutorial nav
  setupTutorial();
}

function _wire(id, evt, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(evt, fn);
}

// ── Tutorial ──────────────────────────────────────────

let tutStep = 1;
function setupTutorial() {
  document.getElementById('tut-prev')?.addEventListener('click', () => {
    audio.playMenuClick();
    tutStep > 1 ? goTutStep(tutStep - 1) : showMainMenu();
  });
  document.getElementById('tut-next')?.addEventListener('click', () => {
    audio.playMenuClick();
    tutStep < 5 ? goTutStep(tutStep + 1) : startFlow();
  });
}

function showTutorial() {
  tutStep = 1;
  goTutStep(1);
  ui.showScreen('tutorial-screen');
}

function goTutStep(step) {
  tutStep = step;
  document.querySelectorAll('.tutorial-step').forEach((el, i) =>
    el.classList.toggle('active', i + 1 === step)
  );
  document.querySelectorAll('.dot').forEach((d, i) =>
    d.classList.toggle('active', i + 1 === step)
  );
  const nextBtn = document.getElementById('tut-next');
  if (nextBtn) nextBtn.textContent = step === 5 ? '🎮 Start Game' : 'Next →';
}

function showLeaderboard() {
  ui.populateLeaderboard();
  ui.showScreen('leaderboard-screen');
}

// ═══════════════════════════════════════════════════════
// Game start flow
// ═══════════════════════════════════════════════════════

async function startFlow() {
  // If hand already running (mouse mode or already granted), skip prompt
  if (hand.isRunning) { startGame(); return; }
  ui.showScreen('webcam-prompt');
}

async function grantWebcam() {
  await hand.startWebcam();   // internally falls back to mouse mode on denial
  startGame();
}

function skipWebcam() {
  hand.enableMouseMode();
  startGame();
}

function startGame() {
  gameState.reset();
  gameState.setState('PLAYING');
  ui.hideAllScreens();
  ui.showHUD(true);
  scene3d.hideMenuHands();
  scene3d.showVirtualHand();
  slapDetect.lastSlapTime = elapsed + 0.8; // cooldown grace period
  spawnBoss(0);
}

function restartGame() { startGame(); }

function nextBoss() {
  const next = gameState.currentBoss + 1;
  if (next >= gameState.totalBosses) { triggerVictory(); return; }
  gameState.setState('PLAYING');
  ui.hideAllScreens();
  ui.showHUD(true);
  slapDetect.lastSlapTime = elapsed + 0.8; // cooldown grace period
  spawnBoss(next);
}

function spawnBoss(index) {
  gameState.currentBoss = index;
  timerSecs    = 60 + index * 15;
  timerRunning = true;
  combo.reset();

  const data = boss.spawnBoss(index);
  progression.unlockBossAchievement(index);

  // Brief countdown
  setTimeout(() => audio.playCountdownGo(), 500);
}

// ═══════════════════════════════════════════════════════
// Slap event
// ═══════════════════════════════════════════════════════

gameState.on('slap', slapEvent => {
  if (!gameState.is('PLAYING')) return;

  const baseDmg  = slapDetect.getDamage(slapEvent.level);
  const swingBonus = slapEvent.swingBonus ?? 0;
  const comboTier = combo.hit();
  const totalDmg  = (baseDmg + swingBonus) * comboTier.mult;

  boss.takeDamage(totalDmg, slapEvent.velocity);
  gameState.addScore(totalDmg * 10);

  // World position of boss (approx centre)
  const bossWorldPos = new THREE.Vector3(0, 1.5, 0);

  // Particle burst
  effects.spawnBurst(bossWorldPos, { weak: 12, normal: 22, strong: 38, critical: 65 }[slapEvent.level], slapEvent.level);
  effects.spawnImpactLines(bossWorldPos, slapEvent.level);
  effects.spawnShockwave(bossWorldPos, slapEvent.level);
  if (slapEvent.level === 'critical' || slapEvent.level === 'strong') {
    effects.spawnStars(bossWorldPos, slapEvent.level === 'critical' ? 14 : 7);
  }

  // Impact flash
  effects.triggerImpactFlash(slapEvent.level);

  // Slow-mo on critical
  if (slapEvent.level === 'critical') effects.triggerSlowMotion(0.75);

  // Camera zoom focus
  if (slapEvent.level === 'critical') {
    scene3d.triggerCameraZoom(1.8);
  } else if (slapEvent.level === 'strong') {
    scene3d.triggerCameraZoom(0.95);
  }

  // Camera shake
  if (settings.shake) {
    const intensities = { weak: 0.12, normal: 0.22, strong: 0.42, critical: 0.85 };
    scene3d.shakeCamera(intensities[slapEvent.level] ?? 0.22, 0.45);
  }

  // Virtual hand lunge animation
  slapAnim.active = true;
  slapAnim.timer  = 0;

  // Audio
  ({ weak: audio.playWeakSlap,   normal: audio.playNormalSlap,
     strong: audio.playStrongSlap, critical: audio.playCriticalSlap }
  )[slapEvent.level]?.call(audio);

  if (comboTier.mult > 1) setTimeout(() => audio.playComboSound(comboTier.level + 1), 200);

  // Floating damage text
  const sp = _worldToScreen(bossWorldPos);
  
  const comicWords = {
    weak:     ['TAP!', 'SLAP!', 'BOOP!'],
    normal:   ['WHACK!', 'SLAP!', 'CLOBBER!'],
    strong:   ['BAM!', 'POW!', 'SMASH!'],
    critical: ['MEGA SLAP!', 'CRITICAL!', 'HOLY MOLY!', 'KABOOM!']
  };
  const words = comicWords[slapEvent.level] ?? ['SLAP!'];
  const chosenWord = words[Math.floor(Math.random() * words.length)];
  const txt = `${chosenWord} +${Math.round(totalDmg)}`;
  ui.showDamageNumber(txt, sp.x, sp.y - 40, slapEvent.level);

  if (slapEvent.isSwing && swingBonus > 0) {
    setTimeout(() => ui.showDamageNumber(`SWING BONUS! +${swingBonus * comboTier.mult}`, sp.x - 40, sp.y - 120, 'critical'), 100);
  }

  if (comboTier.mult > 1) {
    setTimeout(() => ui.showDamageNumber(`${comboTier.label} COMBO!`, sp.x + 30, sp.y - 95, 'combo'), 160);
  }
});

// ═══════════════════════════════════════════════════════
// Boss events
// ═══════════════════════════════════════════════════════

gameState.on('bossDefeated', e => {
  audio.playBossDefeated();
  timerRunning = false;
  combo.reset();

  const data    = boss.getCurrentData();
  const coins   = 50 * (e.index + 1);
  const xp      = 100 * (e.index + 1);
  progression.saveScore(gameState.score);

  gameState.setState('BOSS_DEFEAT');

  setTimeout(() => {
    const hasNext = (e.index + 1) < gameState.totalBosses;
    ui.showBossDefeatScreen(data?.name ?? 'Boss', coins, xp, hasNext);
  }, 1400);
});

function triggerVictory() {
  gameState.setState('VICTORY');
  timerRunning = false;
  audio.playVictory();
  progression.saveScore(gameState.score);
  ui.showVictoryScreen(gameState.score);
}

function triggerGameOver(reason = "Time's up!") {
  gameState.setState('GAME_OVER');
  timerRunning = false;
  audio.playGameOver();
  progression.saveScore(gameState.score);
  ui.showGameOverScreen(gameState.score, reason);
}

// ═══════════════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════════════

function _worldToScreen(worldPos) {
  const v = worldPos.clone().project(scene3d.camera);
  return {
    x: ((v.x + 1) / 2) * scene3d.renderer.domElement.clientWidth,
    y: ((-v.y + 1) / 2) * scene3d.renderer.domElement.clientHeight,
  };
}

// ═══════════════════════════════════════════════════════
// Game loop
// ═══════════════════════════════════════════════════════

const clock = new THREE.Clock();
let elapsed = 0;

function startLoop() { clock.start(); requestAnimationFrame(loop); }

function loop() {
  requestAnimationFrame(loop);

  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  // ── Hand tracking ──────────────────────────────────
  hand.update(dt);

  // ── Live debug pill ────────────────────────────────
  const _pill = document.getElementById('track-mode-pill');
  if (_pill) {
    const _velEl  = document.getElementById('track-vel');
    const _modeEl = document.getElementById('track-mode-text');
    const _iconEl = document.getElementById('track-mode-icon');
    if (_velEl)  _velEl.textContent  = `spd: ${hand.velocity.speed.toFixed(2)}`;
    if (_iconEl) _iconEl.textContent  = hand.mouseMode ? '🖱️' : (hand.handDetected ? '✋' : '❌');
    if (_modeEl) _modeEl.textContent  = hand.mouseMode
      ? 'MOUSE — move fast or CLICK canvas to slap'
      : (hand.handDetected ? 'HAND DETECTED — swing fast to slap' : 'NO HAND — show palm to camera');
  }

  if (gameState.is('PLAYING')) {
    // Slap detection
    slapDetect.update(elapsed);

    // Combo decay
    combo.update(elapsed);
    ui.updateComboBar(combo.getProgress());

    // Timer
    if (timerRunning) {
      timerSecs -= dt;
      ui.updateTimer(timerSecs);

      // Beep each second in last 10 s
      if (timerSecs > 0 && timerSecs <= 10) {
        const prev = timerSecs + dt;
        if (Math.floor(prev) > Math.floor(timerSecs)) audio.playTimerWarning();
      }

      if (timerSecs <= 0) { timerRunning = false; triggerGameOver("Time's up!"); }
    }

    // Boss idle / taunt
    boss.update(dt, elapsed);

    // ── Virtual hand position & slap lunge ──────────
    const wPos = hand.getWorldPosition(8.8);
    wPos.tiltZ = -hand.velocity.x * 2.8;

    if (slapAnim.active) {
      slapAnim.timer += dt;
      const t = slapAnim.timer / slapAnim.duration;
      // Ease: quick forward (0→0.3 of duration) then ease back
      const progress = t < 0.28 ? t / 0.28 : 1 - (t - 0.28) / 0.72;
      scene3d.updateVirtualHand(wPos, true, Math.max(0, progress), !hand.mouseMode);
      if (slapAnim.timer >= slapAnim.duration) slapAnim.active = false;
    } else {
      scene3d.updateVirtualHand(wPos, false, 0, !hand.mouseMode);
    }
  }

  if (gameState.is('MENU') || gameState.is('LOADING')) {
    scene3d.updateMenuAnimation(elapsed);
  }

  // Camera shake recovery
  scene3d.updateCamera(dt);

  // Particles
  effects.update(dt);

  // Render
  scene3d.render();
}

// ═══════════════════════════════════════════════════════
// Fire!
// ═══════════════════════════════════════════════════════

bootstrap().catch(err => {
  console.error('[main] Bootstrap failed:', err);
  // Fallback: skip loading, go straight to menu without hand tracking
  hideLoading();
  hand.enableMouseMode();
  showMainMenu();
  startLoop();
});
