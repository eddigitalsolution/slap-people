/**
 * EffectsManager.js
 * Object-pooled particle system, screen shake relay, impact flash,
 * and slow-motion visual effect.
 */

import * as THREE from 'three';
import { gsap } from 'gsap';

export class EffectsManager {
  constructor(scene, camera, gameState, settings) {
    this.scene     = scene;
    this.camera    = camera;
    this.gameState = gameState;
    this.settings  = settings;   // { particles, shake }

    this._pool     = [];
    this._POOL_SZ  = 320;
    this._flash    = document.getElementById('impact-flash');
  }

  // ── Boot ──────────────────────────────────────────────

  init() {
    this._buildPool();
  }

  _buildPool() {
    const geos = [
      new THREE.OctahedronGeometry(0.14),
      new THREE.BoxGeometry(0.12, 0.12, 0.12),
      new THREE.SphereGeometry(0.10, 6, 6),
      new THREE.TetrahedronGeometry(0.14),
    ];

    for (let i = 0; i < this._POOL_SZ; i++) {
      const mat  = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(geos[i % geos.length].clone(), mat);
      mesh.visible = false;
      this.scene.add(mesh);

      this._pool.push({
        mesh,
        vel:     new THREE.Vector3(),
        life:    0,
        maxLife: 1,
        active:  false,
        baseScale: 1,
      });
    }
  }

  _getFree() {
    return this._pool.find(p => !p.active) ?? null;
  }

  // ── Spawn helpers ─────────────────────────────────────

  /** Burst of colourful particles at a world position. */
  spawnBurst(position, count, slapLevel) {
    if (!this.settings.particles) return;

    const palettes = {
      weak:     [0xffff00, 0xffa500, 0xffcc00],
      normal:   [0xff6600, 0xff3300, 0xff9900],
      strong:   [0xff0066, 0xff00aa, 0xff6688],
      critical: [0x00ffff, 0xffffff, 0xff00ff, 0xffff00],
    };
    const speeds = { weak: 4, normal: 7, strong: 11, critical: 16 };
    const cols   = palettes[slapLevel] ?? palettes.normal;
    const spd    = speeds[slapLevel]   ?? 7;

    for (let i = 0; i < count; i++) {
      const p = this._getFree();
      if (!p) break;

      p.mesh.position.copy(position);
      p.mesh.position.x += (Math.random() - 0.5) * 0.6;
      p.mesh.position.y += (Math.random() - 0.5) * 0.6;

      const s    = spd * (0.45 + Math.random() * 0.85);
      const th   = Math.random() * Math.PI * 2;
      const ph   = Math.random() * Math.PI;
      p.vel.set(
        Math.sin(ph) * Math.cos(th) * s,
        Math.abs(Math.random() * s * 1.3) + 1.5,
        Math.sin(ph) * Math.sin(th) * s,
      );

      p.life      = 0;
      p.maxLife   = 0.55 + Math.random() * 0.9;
      p.baseScale = 0.25 + Math.random() * 0.85;
      p.active    = true;
      p.mesh.visible = true;
      p.mesh.scale.setScalar(p.baseScale);
      p.mesh.material.color.setHex(cols[Math.floor(Math.random() * cols.length)]);
      p.mesh.material.opacity = 1;
    }
  }

  /** Radial impact lines (like a cartoon POW). */
  spawnImpactLines(position, slapLevel) {
    if (!this.settings.particles) return;

    const count = slapLevel === 'critical' ? 14 : 8;
    for (let i = 0; i < count; i++) {
      const p = this._getFree();
      if (!p) break;

      const angle = (i / count) * Math.PI * 2;
      p.mesh.position.copy(position);
      p.vel.set(Math.cos(angle) * 6, Math.sin(angle) * 6, 0);

      // Reuse mesh with elongated scale to mimic lines
      p.mesh.scale.set(0.06, 0.06, 1.4 + Math.random() * 0.6);

      p.life      = 0;
      p.maxLife   = 0.28;
      p.baseScale = 1;
      p.active    = true;
      p.mesh.visible = true;
      p.mesh.material.color.setHex(0xffffff);
      p.mesh.material.opacity = 1;
    }
  }

  // ── Screen flash ──────────────────────────────────────

  triggerImpactFlash(slapLevel) {
    if (!this._flash) return;

    const cols = {
      weak:     'rgba(255,255,0,0.28)',
      normal:   'rgba(255,150,0,0.38)',
      strong:   'rgba(255,0,100,0.48)',
      critical: 'rgba(0,255,255,0.68)',
    };
    this._flash.style.backgroundColor = cols[slapLevel] ?? cols.normal;

    gsap.killTweensOf(this._flash);
    gsap.fromTo(this._flash, { opacity: 1 }, { opacity: 0, duration: 0.35, ease: 'power2.out' });
  }

  /** Vignette darkening + slight desaturation — no actual game-speed change. */
  triggerSlowMotion(duration = 0.7) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed; inset:0; z-index:145; pointer-events:none;
      background: radial-gradient(ellipse at center, transparent 35%, rgba(0,0,40,0.55) 100%);
    `;
    document.body.appendChild(overlay);
    gsap.to(overlay, { opacity: 0, duration, delay: 0.08, onComplete: () => overlay.remove() });
  }

  // ── Per-frame update ──────────────────────────────────

  update(dt) {
    const GRAVITY = -9;
    this._pool.forEach(p => {
      if (!p.active) return;

      p.life += dt;
      const t = p.life / p.maxLife;

      if (t >= 1) {
        p.active       = false;
        p.mesh.visible = false;
        return;
      }

      // Physics
      p.vel.y += GRAVITY * dt;
      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.y += p.vel.y * dt;
      p.mesh.position.z += p.vel.z * dt;

      // Shrink & fade
      const sc = p.baseScale * (1 - t * 0.6);
      if (p.baseScale === 1) {
        // impact line — just fade
        p.mesh.material.opacity = 1 - t;
      } else {
        p.mesh.scale.setScalar(Math.max(sc, 0.001));
        p.mesh.material.opacity = Math.max(1 - t * 1.4, 0);
      }

      // Tumble
      p.mesh.rotation.x += dt * 4.5;
      p.mesh.rotation.y += dt * 3.0;
    });
  }
}
