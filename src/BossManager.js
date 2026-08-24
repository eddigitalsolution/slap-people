/**
 * BossManager.js
 * Creates, animates and manages all five cartoon bosses.
 *
 * Boss roster:
 *  0 – Mr. Stress   (Office Manager,  HP  100)
 *  1 – Chairman Meow (Angry Cat,      HP  250)
 *  2 – Colonel Cluck (Giant Chicken,  HP  500)
 *  3 – Zorgoth       (Alien CEO,      HP 1000)
 *  4 – The Slapper   (Final Boss,     HP 2000)
 */

import * as THREE from 'three';
import { gsap } from 'gsap';

export class BossManager {
  constructor(scene, gameState) {
    this.scene     = scene;
    this.gameState = gameState;

    this.currentBossIndex = -1;
    this.currentBossGroup = null;
    this.bossState        = 'IDLE';   // IDLE | HIT | DEFEATED

    this.currentHp = 0;
    this._tauntTimer = 0;

    this._roster = [
      {
        name:     'Mr. Stress',
        subtitle: 'OFFICE MANAGER',
        maxHp:    100,
        taunts:   ["You're fired!", 'Deadline approaching!', 'Read the memo!', 'No slacking!'],
        create:   () => this._mkOfficeManager(),
      },
      {
        name:     'Chairman Meow',
        subtitle: 'ANGRY CAT BOSS',
        maxHp:    250,
        taunts:   ['HISSSSS!', 'No touch!', 'Bad human!', 'I own you!'],
        create:   () => this._mkAngryCat(),
      },
      {
        name:     'Colonel Cluck',
        subtitle: 'GIANT CHICKEN',
        maxHp:    500,
        taunts:   ['BWAAAAK!', 'The sky falls!', 'Cluck cluck!', 'Egg-cellent plan!'],
        create:   () => this._mkGiantChicken(),
      },
      {
        name:     'Zorgoth',
        subtitle: 'ALIEN CEO',
        maxHp:    1000,
        taunts:   ['Earthlings tremble!', 'Resistance futile!', 'Galactic merger!', 'Stocks rising!'],
        create:   () => this._mkAlienCEO(),
      },
      {
        name:     'The Slapper',
        subtitle: 'FINAL SLAP LORD',
        maxHp:    2000,
        taunts:   ['FEEL MY SLAP!', 'I am the king!', 'Unlimited power!', "You can't beat me!"],
        create:   () => this._mkFinalSlapLord(),
      },
    ];
  }

  // ── Spawn ─────────────────────────────────────────────

  spawnBoss(index) {
    this._removeCurrent();

    this.currentBossIndex = index;
    const data = this._roster[index];
    this.currentHp  = data.maxHp;
    this.bossState  = 'IDLE';
    this._tauntTimer = 0;

    this.currentBossGroup = data.create();
    this.currentBossGroup.position.y = -8;   // start below stage
    this.scene.add(this.currentBossGroup);

    // Rise animation
    gsap.to(this.currentBossGroup.position, {
      y: 0, duration: 1.1, ease: 'back.out(1.6)',
    });

    this.gameState.emit('bossSpawned', {
      name:    data.name,
      subtitle: data.subtitle,
      hp:      data.maxHp,
      maxHp:   data.maxHp,
      index,
    });

    return data;
  }

  // ── Damage ────────────────────────────────────────────

  takeDamage(amount) {
    if (this.bossState === 'DEFEATED' || !this.currentBossGroup) return;

    this.currentHp = Math.max(0, this.currentHp - amount);

    this.gameState.emit('bossDamaged', {
      hp:    this.currentHp,
      maxHp: this._roster[this.currentBossIndex].maxHp,
      damage: amount,
    });

    if (this.currentHp <= 0) {
      this._defeatBoss();
    } else {
      this._playHitAnim();
    }
  }

  _playHitAnim() {
    if (!this.currentBossGroup) return;
    this.bossState = 'HIT';

    // Flash red
    this.currentBossGroup.traverse(c => {
      if (!c.isMesh || !c.material) return;
      const orig = c.material.color.getHex();
      c.material.color.setHex(0xff3333);
      setTimeout(() => { if (c.material) c.material.color.setHex(orig); }, 120);
    });

    const dir = Math.random() > 0.5 ? 1 : -1;
    gsap.timeline()
      .to(this.currentBossGroup.position, { x: dir * 1.8, duration: 0.07, ease: 'power4.out' })
      .to(this.currentBossGroup.position, { x: 0, duration: 0.38, ease: 'elastic.out(1, 0.4)' });

    gsap.timeline()
      .to(this.currentBossGroup.scale, { x: 1.45, y: 0.75, z: 1.45, duration: 0.07 })
      .to(this.currentBossGroup.scale, { x: 1, y: 1, z: 1, duration: 0.45, ease: 'elastic.out(1, 0.4)' });

    setTimeout(() => { if (this.bossState !== 'DEFEATED') this.bossState = 'IDLE'; }, 500);
  }

  _defeatBoss() {
    this.bossState = 'DEFEATED';

    gsap.timeline()
      .to(this.currentBossGroup.rotation, { y: Math.PI * 10, duration: 1.0, ease: 'power2.in' })
      .to(this.currentBossGroup.scale,    { x: 2.2, y: 2.2, z: 2.2, duration: 0.25 }, '-=0.3')
      .to(this.currentBossGroup.scale,    { x: 0.01, y: 0.01, z: 0.01, duration: 0.25, ease: 'power4.in' })
      .call(() => {
        this.gameState.emit('bossDefeated', { index: this.currentBossIndex });
        this._removeCurrent();
      });
  }

  // ── Per-frame ─────────────────────────────────────────

  update(dt, time) {
    if (!this.currentBossGroup || this.bossState === 'DEFEATED') return;

    if (this.bossState === 'IDLE') {
      // Idle bob
      this.currentBossGroup.position.y = Math.sin(time * 1.4) * 0.22;
      this.currentBossGroup.rotation.y = Math.sin(time * 0.7) * 0.14;

      // Random taunts
      this._tauntTimer += dt;
      if (this._tauntTimer > 5 + Math.random() * 5) {
        this._tauntTimer = 0;
        const taunts = this._roster[this.currentBossIndex].taunts;
        const text   = taunts[Math.floor(Math.random() * taunts.length)];
        this.gameState.emit('bossTaunt', { text });
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────

  getCurrentData() {
    return this.currentBossIndex >= 0 ? this._roster[this.currentBossIndex] : null;
  }

  _removeCurrent() {
    if (this.currentBossGroup) {
      this.scene.remove(this.currentBossGroup);
      this.currentBossGroup = null;
    }
  }

  // ─────────────────────────────────────────────────────
  // Boss mesh factories
  // ─────────────────────────────────────────────────────

  _mat(color, emissive = null) {
    const m = new THREE.MeshToonMaterial({ color });
    if (emissive) m.emissive = new THREE.Color(emissive).multiplyScalar(0.3);
    return m;
  }

  // ── Boss 1: Office Manager ────────────────────────────

  _mkOfficeManager() {
    const g = new THREE.Group();
    const M = c => this._mat(c);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.3, 0.25, 1.9, 8);
    [[-0.42, -2.3], [0.42, -2.3]].forEach(([x, y]) => {
      const l = new THREE.Mesh(legGeo, M(0x252535)); l.position.set(x, y, 0); l.castShadow = true; g.add(l);
    });
    // Shoes
    const shoeGeo = new THREE.BoxGeometry(0.65, 0.3, 1.0);
    [[-0.42, -3.3, 0.12], [0.42, -3.3, 0.12]].forEach(([x, y, z]) => {
      g.add(new THREE.Mesh(shoeGeo, M(0x111111)).translateX(x).translateY(y).translateZ(z));
    });
    // Body suit
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.72, 2.4, 10), M(0x4a4a6e));
    body.position.y = -0.6; body.castShadow = true; g.add(body);
    // White shirt
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.0, 0.55), M(0xffffff));
    shirt.position.set(0, -0.6, 0.82); g.add(shirt);
    // Red tie
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.55, 0.1), M(0xff2020));
    tie.position.set(0, -0.7, 1.08); g.add(tie);
    // Arms
    const armGeo = new THREE.CylinderGeometry(0.23, 0.18, 1.9, 8);
    [[-1.25, -0.25, 0.3], [1.25, -0.25, -0.3]].forEach(([x, y, rz]) => {
      const a = new THREE.Mesh(armGeo, M(0x4a4a6e));
      a.position.set(x, y, 0); a.rotation.z = rz; g.add(a);
    });
    // Hands
    [[-1.7, -1.15], [1.7, -1.15]].forEach(([x, y]) => {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), M(0xf5c99a));
      h.position.set(x, y, 0); g.add(h);
    });
    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.55, 8), M(0xf5c99a));
    neck.position.y = 0.72; g.add(neck);
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.98, 16, 16), M(0xf5c99a));
    head.position.y = 1.95; head.castShadow = true; g.add(head);
    // Hair
    const hairGeo = new THREE.SphereGeometry(0.99, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.42);
    const hair = new THREE.Mesh(hairGeo, M(0x3a2010)); hair.position.y = 1.95; g.add(hair);
    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.16, 8, 8);
    [[-0.3, 2.08, 0.9], [0.3, 2.08, 0.9]].forEach(([x, y, z]) => {
      g.add(new THREE.Mesh(eyeGeo, M(0x111111)).translateX(x).translateY(y).translateZ(z));
    });
    // Glasses
    const glGeo = new THREE.TorusGeometry(0.23, 0.04, 6, 18);
    const glMat = M(0x222222);
    [[-0.3, 2.08], [0.3, 2.08]].forEach(([x, y]) => {
      const gl = new THREE.Mesh(glGeo, glMat);
      gl.position.set(x, y, 0.91); gl.rotation.y = Math.PI / 2; g.add(gl);
    });
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.04), glMat);
    bridge.position.set(0, 2.08, 1.02); g.add(bridge);
    // Mustache
    const must = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 6, 14, Math.PI), M(0x2a1008));
    must.position.set(0, 1.72, 0.92); must.rotation.x = Math.PI / 2; g.add(must);
    // Briefcase
    const bc = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.65, 0.28), M(0x5c3a1a));
    bc.position.set(1.7, -1.65, 0.35); g.add(bc);
    g.scale.setScalar(1.0);
    return g;
  }

  // ── Boss 2: Angry Cat ─────────────────────────────────

  _mkAngryCat() {
    const g = new THREE.Group();
    const catCol = 0xf08030;
    const M = c => this._mat(c);

    // Round body
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.55, 16, 16), M(catCol));
    body.scale.y = 1.12; body.castShadow = true; g.add(body);
    // Belly
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 12), M(0xfaecd0));
    belly.position.set(0, -0.22, 0.95); belly.scale.z = 0.55; g.add(belly);
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.18, 16, 16), M(catCol));
    head.position.y = 2.1; head.castShadow = true; g.add(head);
    // Ears
    const earGeo = new THREE.ConeGeometry(0.42, 0.75, 6);
    [[-0.7, 3.28, -0.3], [0.7, 3.28, 0.3]].forEach(([x, y, rz]) => {
      const e = new THREE.Mesh(earGeo, M(catCol)); e.position.set(x, y, 0); e.rotation.z = rz; g.add(e);
      const ie = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 6), M(0xff8888));
      ie.position.set(x, y, 0.12); ie.rotation.z = rz; g.add(ie);
    });
    // Angry eyes
    [[-0.42, 2.22, 1.02], [0.42, 2.22, 1.02]].forEach(([x, y, z]) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), M(0x00cc00));
      eye.position.set(x, y, z); g.add(eye);
      const pup = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.27, 0.08), M(0x111111));
      pup.position.set(x, y, z + 0.18); g.add(pup);
    });
    // Angry eyebrows
    [[-0.42, 2.52, 0.95, 0.42], [0.42, 2.52, 0.95, -0.42]].forEach(([x, y, z, rz]) => {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.1, 0.1), M(0x3a1a00));
      brow.position.set(x, y, z); brow.rotation.z = rz; g.add(brow);
    });
    // Nose
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), M(0xffaaaa));
    nose.position.set(0, 1.88, 1.12); g.add(nose);
    // Whiskers
    const wMat = M(0xffffff);
    [-0.12, 0, 0.12].forEach(dy => {
      [[-0.65, 2.0 + dy], [0.65, 2.0 + dy]].forEach(([sx, sy]) => {
        const w = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.04), wMat);
        w.position.set(sx, sy + 0.1, 1.08); w.rotation.z = sx < 0 ? dy * 0.8 : -dy * 0.8; g.add(w);
      });
    });
    // Paws
    const pawGeo = new THREE.SphereGeometry(0.55, 10, 10);
    [[-1.85, 0.22], [1.85, 0.22]].forEach(([x, y]) => {
      const p = new THREE.Mesh(pawGeo, M(catCol)); p.position.set(x, y, 0.35); p.scale.set(1, 0.7, 1); g.add(p);
    });
    // Tail
    const tCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, -1.4, -0.6),
      new THREE.Vector3(-2.2, -0.4, 0),
      new THREE.Vector3(-1.6, 1.8, 0.6)
    );
    g.add(new THREE.Mesh(new THREE.TubeGeometry(tCurve, 22, 0.22, 8, false), M(catCol)));
    // Legs
    const legGeo = new THREE.CylinderGeometry(0.38, 0.32, 0.9, 8);
    [[-0.78, -1.9], [0.78, -1.9]].forEach(([x, y]) => {
      g.add(new THREE.Mesh(legGeo, M(catCol)).translateX(x).translateY(y));
    });
    g.scale.setScalar(1.1);
    return g;
  }

  // ── Boss 3: Giant Chicken ─────────────────────────────

  _mkGiantChicken() {
    const g = new THREE.Group();
    const M = c => this._mat(c);
    const eggCol = 0xf5eedc;

    // Main body (egg)
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.75, 16, 16), M(eggCol));
    body.scale.y = 1.35; body.castShadow = true; g.add(body);
    // Wings
    const wGeo = new THREE.SphereGeometry(1.1, 12, 12);
    [[-2.3, 0.25], [2.3, 0.25]].forEach(([x, y]) => {
      const w = new THREE.Mesh(wGeo, M(eggCol));
      w.position.set(x, y, 0); w.scale.set(0.7, 1.15, 0.38); g.add(w);
    });
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 16), M(eggCol));
    head.position.set(0, 3.2, 0.35); head.castShadow = true; g.add(head);
    // Beak upper
    const bk = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 6), M(0xff8800));
    bk.position.set(0, 3.2, 1.45); bk.rotation.x = Math.PI / 2; g.add(bk);
    // Beak lower
    const bkL = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 6), M(0xff6600));
    bkL.position.set(0, 2.92, 1.22); bkL.rotation.x = Math.PI / 2; g.add(bkL);
    // Comb
    [[-0.22, 4.25], [0.1, 4.45], [0.35, 4.22]].forEach(([x, y]) => {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), M(0xff2020)).translateX(x).translateY(y).translateZ(0.22));
    });
    // Wattle
    const wattleG = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), M(0xff2020));
    wattleG.position.set(0, 2.88, 1.05); wattleG.scale.y = 1.6; g.add(wattleG);
    // Eyes
    [[-0.5, 3.4, 0.9], [0.5, 3.4, 0.9]].forEach(([x, y, z]) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), M(0xff8800)); e.position.set(x, y, z); g.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), M(0x111111)); p.position.set(x, y, z + 0.16); g.add(p);
    });
    // Legs
    const lGeo = new THREE.CylinderGeometry(0.22, 0.16, 1.4, 6);
    [[-0.78, -2.6], [0.78, -2.6]].forEach(([x, y]) => {
      g.add(new THREE.Mesh(lGeo, M(0xff8800)).translateX(x).translateY(y));
    });
    // Toes
    for (let side of [-1, 1]) {
      for (let toe = 0; toe < 3; toe++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.22), M(0xff8800));
        t.position.set(side * 0.78, -3.42, -0.28 + toe * 0.28);
        t.rotation.y = (toe - 1) * 0.38;
        g.add(t);
      }
    }
    g.scale.setScalar(1.3);
    return g;
  }

  // ── Boss 4: Alien CEO ─────────────────────────────────

  _mkAlienCEO() {
    const g = new THREE.Group();
    const alienCol = 0x44cc44;
    const M = c => this._mat(c);

    // Body (suit)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.95, 2.8, 10), M(0x1a1a8a));
    body.castShadow = true; g.add(body);
    // Shirt / chest
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.2, 0.5), M(0xffffff));
    chest.position.set(0, 0, 1.0); g.add(chest);
    // Tie (glowing green)
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.65, 0.12), this._mat(0x00ff88, 0x00ff88));
    tie.position.set(0, -0.22, 1.2); g.add(tie);
    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.65, 8), M(alienCol));
    neck.position.y = 1.65; g.add(neck);
    // HUGE head
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.35, 18, 18), M(alienCol));
    head.scale.y = 1.5; head.position.y = 3.55; head.castShadow = true; g.add(head);
    // Big alien eyes
    [[-0.55, 3.75, 1.05], [0.55, 3.75, 1.05]].forEach(([x, y, z]) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 12), M(0x111111)); eye.position.set(x, y, z); g.add(eye);
      const gleam = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), this._mat(0x4466ff, 0x4466ff)); gleam.position.set(x - 0.08, y + 0.12, z + 0.42); g.add(gleam);
    });
    // Slit mouth
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.1), M(0x002200));
    mouth.position.set(0, 3.0, 1.25); g.add(mouth);
    // Antennae
    const antGeo = new THREE.CylinderGeometry(0.055, 0.055, 1.1, 6);
    [[-1.35, 4.9, -0.28], [1.35, 4.9, 0.28]].forEach(([x, y, rz]) => {
      const a = new THREE.Mesh(antGeo, M(alienCol)); a.position.set(x, y, 0); a.rotation.z = rz; g.add(a);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), this._mat(0x00ff88, 0x00ff88));
      tip.position.set(x + rz * 0.5, y + 0.6, 0); g.add(tip);
    });
    // 4 arms
    const aGeo = new THREE.CylinderGeometry(0.22, 0.16, 2.2, 8);
    const aM = M(0x1a1a8a);
    [[-1.45, 0.6, 0.5], [1.45, 0.6, -0.5], [-1.6, -0.4, 0.38], [1.6, -0.4, -0.38]].forEach(([x, y, rz]) => {
      const a = new THREE.Mesh(aGeo, aM); a.position.set(x, y, 0); a.rotation.z = rz; g.add(a);
    });
    // Legs
    const lGeo = new THREE.CylinderGeometry(0.33, 0.28, 2.0, 8);
    [[-0.55, -2.4], [0.55, -2.4]].forEach(([x, y]) => {
      g.add(new THREE.Mesh(lGeo, M(0x1a1a8a)).translateX(x).translateY(y));
    });
    g.scale.setScalar(1.5);
    return g;
  }

  // ── Boss 5: Final Slap Lord ───────────────────────────

  _mkFinalSlapLord() {
    const g = new THREE.Group();
    const M  = (c, e) => this._mat(c, e);
    const purp = 0x1a0030, glow = 0x9900ff;

    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.3, 3.3, 12), M(purp, glow));
    body.castShadow = true; g.add(body);
    // Chest armour
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.65, 0.32), M(0x440066, 0x6600cc));
      p.position.set(0, 0.9 - i * 0.65, 1.4); g.add(p);
    }
    // Massive shoulders
    const shGeo = new THREE.SphereGeometry(0.88, 14, 14);
    [[-2.0, 1.1], [2.0, 1.1]].forEach(([x, y]) => {
      const sh = new THREE.Mesh(shGeo, M(0x330050, glow)); sh.position.set(x, y, 0); g.add(sh);
      // Spikes
      const spkGeo = new THREE.ConeGeometry(0.22, 0.9, 6);
      for (let s = 0; s < 3; s++) {
        const sp = new THREE.Mesh(spkGeo, M(glow, glow));
        sp.position.set(x + (x < 0 ? -s * 0.28 : s * 0.28), y + 0.55 - s * 0.2, 0);
        sp.rotation.z = (x < 0 ? 0.35 : -0.35) * (1 + s * 0.3); g.add(sp);
      }
    });
    // 4 arms
    const armGeo = new THREE.CylinderGeometry(0.32, 0.24, 2.8, 8);
    [[-2.2, 0.9, 0.6], [2.2, 0.9, -0.6], [-2.55, -0.25, 0.85], [2.55, -0.25, -0.85]].forEach(([x, y, rz]) => {
      const a = new THREE.Mesh(armGeo, M(0x220044, 0x6600cc)); a.position.set(x, y, 0); a.rotation.z = rz; g.add(a);
    });
    // Giant hands on primary arms
    const ghGeo = new THREE.BoxGeometry(0.9, 0.7, 1.1);
    [[-3.35, -0.65], [3.35, -0.65]].forEach(([x, y]) => {
      g.add(new THREE.Mesh(ghGeo, M(0x330050, glow)).translateX(x).translateY(y));
    });
    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.88, 8), M(purp, glow));
    neck.position.y = 2.2; g.add(neck);
    // Massive head
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.55, 18, 18), M(purp, glow));
    head.position.y = 4.15; head.castShadow = true; g.add(head);
    // Crown
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.35, 0.55, 8), M(0xffd700, 0xffaa00));
    crown.position.y = 5.7; g.add(crown);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spk = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.45, 0.95, 6), M(0xffd700, 0xffaa00));
      spk.position.set(Math.cos(a) * 1.2, 6.4, Math.sin(a) * 1.2); g.add(spk);
    }
    // Glowing eyes
    const eyeGeo = new THREE.SphereGeometry(0.34, 8, 8);
    [[-0.55, 4.35, 1.35], [0.55, 4.35, 1.35]].forEach(([x, y, z]) => {
      const e = new THREE.Mesh(eyeGeo, M(0xff0088, 0xff0088)); e.position.set(x, y, z); g.add(e);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.09, 6, 18), M(0xff0088, 0xff0088));
      ring.position.set(x, y, z); g.add(ring);
    });
    // Teeth
    const tGeo = new THREE.ConeGeometry(0.17, 0.45, 4);
    for (let i = 0; i < 6; i++) {
      const t = new THREE.Mesh(tGeo, M(0xffffff));
      t.position.set(-0.65 + i * 0.27, 3.72, 1.42); t.rotation.x = Math.PI; g.add(t);
    }
    // Cape
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), M(0x8800cc, 0x6600aa));
    cape.position.set(0, 0, -1.6); cape.rotation.y = Math.PI; g.add(cape);
    // Legs
    const lGeo = new THREE.CylinderGeometry(0.55, 0.44, 2.8, 8);
    [[-0.78, -3.1], [0.78, -3.1]].forEach(([x, y]) => {
      g.add(new THREE.Mesh(lGeo, M(purp)).translateX(x).translateY(y));
    });
    // Boots
    const bGeo = new THREE.BoxGeometry(1.0, 0.7, 1.35);
    [[-0.78, -4.7, 0.22], [0.78, -4.7, 0.22]].forEach(([x, y, z]) => {
      g.add(new THREE.Mesh(bGeo, M(0x0a0015)).translateX(x).translateY(y).translateZ(z));
    });

    g.scale.setScalar(1.8);
    return g;
  }
}
