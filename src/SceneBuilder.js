/**
 * SceneBuilder.js
 * Creates and owns the Three.js renderer, scene, camera, arena, and
 * the player's giant virtual hand mesh.
 *
 * Public API used by main.js:
 *   init()                  – call once at startup
 *   render()                – call every frame
 *   updateVirtualHand(pos, slapActive, slapProgress)
 *   shakeCamera(intensity, duration)
 *   updateCamera(dt)
 *   updateMenuAnimation(time)
 *   show/hide VirtualHand / MenuHands
 */

import * as THREE from 'three';

export class SceneBuilder {
  constructor() {
    this.scene      = null;
    this.camera     = null;
    this.renderer   = null;
    this.virtualHand = null;

    this._menuHands    = [];
    this._arenaStars   = [];
    this._ringMesh     = null;

    // Camera shake state
    this._camBase  = new THREE.Vector3(0, 2.5, 10);
    this._camTarget = this._camBase.clone();
    this._shakeI   = 0;   // intensity
    this._shakeDur = 0;
    this._shakeT   = 0;

    // Allocate reusable objects to avoid GC overhead in game loops
    this._handTarget = new THREE.Vector3();
    this._handScaleTarget = new THREE.Vector3(1.15, 1.15, 1.15);
  }

  // ── Boot ──────────────────────────────────────────────

  init() {
    this._createRenderer();
    this._createScene();
    this._createCamera();
    this._setupLighting();
    this._buildArena();
    this._buildStarField();
    this._buildVirtualHand();
    this._buildMenuHands();
    window.addEventListener('resize', () => this._onResize());
  }

  // ── Renderer ─────────────────────────────────────────

  _createRenderer() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.outputColorSpace  = THREE.SRGBColorSpace;
  }

  _createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07071a);
    this.scene.fog = new THREE.FogExp2(0x07071a, 0.035);
  }

  _createCamera() {
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.copy(this._camBase);
    this.camera.lookAt(0, 1, 0);
  }

  // ── Lighting ─────────────────────────────────────────

  _setupLighting() {
    const s = this.scene;

    // Soft ambient fill
    s.add(new THREE.AmbientLight(0x1a1a4a, 2.5));

    // Key directional (casts shadows)
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(6, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near   = 0.1;
    sun.shadow.camera.far    = 60;
    sun.shadow.camera.left   = -14;
    sun.shadow.camera.right  = 14;
    sun.shadow.camera.top    = 14;
    sun.shadow.camera.bottom = -14;
    s.add(sun);

    // Coloured fills for cartoon look
    const pinkL  = new THREE.PointLight(0xff0099, 4, 30);
    pinkL.position.set(-9, 7, 3);
    s.add(pinkL);

    const blueL  = new THREE.PointLight(0x00e5ff, 4, 30);
    blueL.position.set(9, 7, 3);
    s.add(blueL);

    const goldL  = new THREE.PointLight(0xffd700, 2.5, 20);
    goldL.position.set(0, 10, -6);
    s.add(goldL);

    // Boss spotlight
    const spot = new THREE.SpotLight(0xffffff, 8, 40, Math.PI / 7, 0.35);
    spot.position.set(0, 14, 4);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    s.add(spot);
    s.add(spot.target);
  }

  // ── Arena ─────────────────────────────────────────────

  _buildArena() {
    // Generate retro neon grid texture on canvas
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = 128;
    gridCanvas.height = 128;
    const ctx = gridCanvas.getContext('2d');
    ctx.fillStyle = '#08081c';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ff0099';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 128, 128);
    
    const gridTex = new THREE.CanvasTexture(gridCanvas);
    gridTex.wrapS = THREE.RepeatWrapping;
    gridTex.wrapT = THREE.RepeatWrapping;
    gridTex.repeat.set(24, 24);

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60, 1, 1),
      new THREE.MeshStandardMaterial({
        map: gridTex,
        roughness: 0.15,
        metalness: 0.85
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -4;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Central platform
    const plat = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 5.5, 0.7, 14),
      new THREE.MeshStandardMaterial({ color: 0x1c1c46, roughness: 0.4, metalness: 0.6 })
    );
    plat.position.y = -2.8;
    plat.receiveShadow = true;
    plat.castShadow    = true;
    this.scene.add(plat);

    // Glowing ring around platform
    this._ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(4.7, 0.12, 8, 80),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff })
    );
    this._ringMesh.rotation.x = Math.PI / 2;
    this._ringMesh.position.y = -2.4;
    this.scene.add(this._ringMesh);

    // Second glow ring
    const ring2 = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.07, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xff0099 })
    );
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = -2.4;
    this.scene.add(ring2);

    // Coloured pillars around arena
    const pillarColors = [0xff0099, 0x00e5ff, 0xffd700, 0x00ff88, 0x9d00ff, 0xff6600];
    pillarColors.forEach((col, i) => {
      const angle = (i / pillarColors.length) * Math.PI * 2;
      const px    = Math.cos(angle) * 9;
      const pz    = Math.sin(angle) * 9;

      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 14, 8),
        new THREE.MeshStandardMaterial({
          color:    col,
          emissive: new THREE.Color(col).multiplyScalar(0.25),
          roughness: 0.25,
          metalness: 0.75,
        })
      );
      pillar.position.set(px, 3, pz);
      pillar.castShadow = true;
      this.scene.add(pillar);

      // Orb on top
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 14, 14),
        new THREE.MeshBasicMaterial({ color: col })
      );
      orb.position.set(px, 10.4, pz);
      this.scene.add(orb);

      // Point light emanating from orb
      const pl = new THREE.PointLight(col, 2.5, 10);
      pl.position.set(px, 10, pz);
      this.scene.add(pl);
    });
  }

  // ── Star field ────────────────────────────────────────

  _buildStarField() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(3000 * 3);
    for (let i = 0; i < pos.length; i++) {
      pos[i] = (Math.random() - 0.5) * 300;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, sizeAttenuation: true })
    );
    this.scene.add(stars);

    // Floating decorative cartoon shapes
    const starGeos = [
      new THREE.TorusGeometry(0.24, 0.08, 8, 16),
      new THREE.ConeGeometry(0.2, 0.45, 6),
      new THREE.BoxGeometry(0.26, 0.26, 0.26),
      new THREE.OctahedronGeometry(0.28)
    ];

    for (let i = 0; i < 25; i++) {
      const g = starGeos[i % starGeos.length];
      const star = new THREE.Mesh(
        g,
        new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(Math.random(), 1, 0.7) })
      );
      star.position.set(
        (Math.random() - 0.5) * 24,
        1  + Math.random() * 10,
        -6 + (Math.random() - 0.5) * 16
      );
      star.userData.rotSpd  = Math.random() * 2 + 0.5;
      star.userData.floatF  = 0.4 + Math.random() * 0.8;
      star.userData.floatO  = Math.random() * Math.PI * 2;
      star.userData.baseY   = star.position.y;
      this.scene.add(star);
      this._arenaStars.push(star);
    }
  }

  // ── Virtual hand ─────────────────────────────────────

  _buildVirtualHand() {
    const group = new THREE.Group();
    group.name  = 'virtualHand';

    const skinCol = 0xf0b07a;
    const M = col => new THREE.MeshToonMaterial({ color: col });

    // Palm
    const palm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.38, 2.0), M(skinCol));
    palm.castShadow = true;
    group.add(palm);

    // Fingers: [offsetX, offsetZ, length, thickness, rotZ]
    const fingers = [
      [-0.90,  0.02, 0.88, 0.30, 0.55],   // thumb
      [-0.55, -1.12, 1.10, 0.28, 0.0 ],   // index
      [-0.08, -1.18, 1.22, 0.32, 0.0 ],   // middle
      [ 0.38, -1.12, 1.06, 0.27, 0.0 ],   // ring
      [ 0.83, -0.96, 0.88, 0.24, 0.0 ],   // pinky
    ];

    fingers.forEach(([fx, fz, len, thick, rz]) => {
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(thick / 2, thick / 2 * 0.85, len, 8),
        M(skinCol)
      );
      seg.position.set(fx, 0, fz - len / 2);
      seg.rotation.x = Math.PI / 2;
      seg.rotation.z = rz;
      seg.castShadow = true;
      group.add(seg);

      // Knuckle sphere
      const knuck = new THREE.Mesh(new THREE.SphereGeometry(thick / 2 + 0.03, 8, 8), M(skinCol));
      knuck.position.set(fx, 0, fz);
      group.add(knuck);

      // Fingertip
      const tip = new THREE.Mesh(new THREE.SphereGeometry(thick / 2 - 0.01, 8, 8), M(skinCol));
      tip.position.set(fx, 0, fz - len);
      group.add(tip);
    });

    group.position.set(0, 0, 7.5);
    group.rotation.y = Math.PI;
    group.scale.setScalar(1.15);

    // Add cartoon outlines to the hand
    this._addOutlines(group);

    this.virtualHand = group;
    this.scene.add(group);
  }

  _addOutlines(group) {
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x07071a,
      side: THREE.BackSide
    });
    const meshes = [];
    group.traverse(c => {
      if (c.isMesh && !c.userData.isOutline) {
        meshes.push(c);
      }
    });
    meshes.forEach(c => {
      const outline = new THREE.Mesh(c.geometry, outlineMat);
      outline.userData.isOutline = true;
      outline.scale.set(1.08, 1.08, 1.08);
      c.add(outline);
    });
  }

  // ── Menu background hands ─────────────────────────────

  _buildMenuHands() {
    const palette = [0xf0b07a, 0xb0b0b0, 0xffd700, 0xffffff, 0x44ee88, 0xaa66ff];
    for (let i = 0; i < 7; i++) {
      const h = this._makeSimpleHand(palette[i % palette.length]);
      h.position.set(
        (Math.random() - 0.5) * 22,
        (Math.random() - 0.5) * 12,
        -4 - Math.random() * 12
      );
      h.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      h.scale.setScalar(0.4 + Math.random() * 1.6);
      h.userData = {
        floatF: 0.3 + Math.random() * 0.7,
        floatO: Math.random() * Math.PI * 2,
        rotSpd: (Math.random() - 0.5) * 0.6,
        baseY:  h.position.y,
      };
      this._menuHands.push(h);
      this.scene.add(h);
    }
  }

  _makeSimpleHand(color) {
    const g   = new THREE.Group();
    const mat = new THREE.MeshToonMaterial({ color });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.22, 0.85), mat));
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.18), mat);
      f.position.set(-0.3 + i * 0.2, 0, -0.75);
      g.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.44, 0.18), mat);
    thumb.position.set(-0.65, 0, 0.08);
    thumb.rotation.z = 0.5;
    g.add(thumb);
    return g;
  }

  // ── Per-frame updates ─────────────────────────────────

  /**
   * Move and animate the virtual hand.
   * @param {object} pos        – {x,y,z,tiltZ,handedness}
   * @param {bool}   slapActive – slap animation running
   * @param {number} progress   – eased [0..1] progress of slap
   * @param {bool}   isWebcam   – true = use tracked Z depth, no Z lunge
   * @param {string} direction  – 'horizontal'|'smash'|'uppercut'|'diagonal'
   * @param {number} vx         – horizontal velocity for yaw direction
   */
  updateVirtualHand(pos, slapActive, progress, isWebcam = false, direction = 'horizontal', vx = 0) {
    if (!this.virtualHand) return;

    const h  = this.virtualHand;
    const lf = 0.16; // position lerp

    // ── Position ──────────────────────────────────────────
    this._handTarget.set(pos.x, pos.y, pos.z);
    h.position.lerp(this._handTarget, lf);

    if (slapActive) {
      // Both mouse and webcam mode get a Z lunge to make the slap feel punchy and connect with the boss
      h.position.z = Math.max(0.5, pos.z - progress * 8.1);
    }

    const isLeft = (pos.handedness === 'Left');
    const baseSc = 1.15;

    // ── Scale (with handedness mirroring) ─────────────────
    const sc = slapActive ? baseSc + progress * 0.5 : baseSc;
    const targetScX = isLeft ? -sc : sc;
    h.scale.x += (targetScX - h.scale.x) * 0.14;
    h.scale.y += (sc - h.scale.y) * 0.14;
    h.scale.z += (sc - h.scale.z) * 0.14;

    // ── Rotation ──────────────────────────────────────────
    // Base roll: lean in direction of horizontal movement
    const rollTarget = -(pos.tiltZ || 0);
    h.rotation.z += (rollTarget - h.rotation.z) * 0.12;

    if (slapActive) {
      // Direction-based pivot at slap peak
      const P = progress; // 0→1→0

      switch (direction) {
        case 'smash':
          // Pitch forward — hand swings DOWN onto boss
          h.rotation.x += (Math.PI * 0.40 * P - h.rotation.x) * 0.22;
          h.rotation.y += (0 - h.rotation.y) * 0.18;
          break;

        case 'uppercut':
          // Pitch backward — hand swings UP
          h.rotation.x += (-Math.PI * 0.35 * P - h.rotation.x) * 0.22;
          h.rotation.y += (0 - h.rotation.y) * 0.18;
          break;

        case 'horizontal':
        case 'diagonal': {
          // Yaw in swing direction + z-roll
          const yawDir = vx >= 0 ? 1 : -1;
          const yawAmt = (direction === 'diagonal' ? 0.22 : 0.38) * P;
          h.rotation.y += (yawDir * yawAmt - h.rotation.y) * 0.20;
          h.rotation.x += (0 - h.rotation.x) * 0.18;
          break;
        }
      }
    } else {
      // Smoothly return all rotations to neutral
      h.rotation.x += (0 - h.rotation.x) * 0.10;
      h.rotation.y += (0 - h.rotation.y) * 0.10;
    }
  }

  /** Animate floating decorations in the menu. */
  updateMenuAnimation(time) {
    this._menuHands.forEach(h => {
      h.position.y = h.userData.baseY + Math.sin(time * h.userData.floatF + h.userData.floatO) * 0.9;
      h.rotation.y += h.userData.rotSpd * 0.012;
    });

    this._arenaStars.forEach(s => {
      s.position.y = s.userData.baseY + Math.sin(time * s.userData.floatF + s.userData.floatO) * 0.45;
      s.rotation.x += s.userData.rotSpd * 0.012;
      s.rotation.z += s.userData.rotSpd * 0.008;
    });

    // Pulse glow ring colour
    if (this._ringMesh) {
      const h = (time * 0.3) % 1;
      this._ringMesh.material.color.setHSL(h, 1, 0.6);
    }
  }

  // ── Camera shake & zoom ──────────────────────────────────

  triggerCameraZoom(zoomAmount) {
    this._camBase.set(0, 2.5 - zoomAmount * 0.5, 10 - zoomAmount);
    gsap.killTweensOf(this._camTarget);
    this._camTarget.set(0, 2.5, 10);
  }

  shakeCamera(intensity, duration) {
    this._shakeI   = intensity;
    this._shakeDur = duration;
    this._shakeT   = duration;
  }

  updateCamera(dt) {
    // Lerp base position for zoom recovery
    this._camBase.lerp(this._camTarget, 0.08);

    if (this._shakeT > 0) {
      this._shakeT -= dt;
      const t = this._shakeT / this._shakeDur;
      const a = this._shakeI * t;
      this.camera.position.x = this._camBase.x + (Math.random() - 0.5) * a;
      this.camera.position.y = this._camBase.y + (Math.random() - 0.5) * a;
      this.camera.rotation.z = (Math.random() - 0.5) * a * 0.45; // Rotational camera shake
    } else {
      this.camera.position.x += (this._camBase.x - this.camera.position.x) * 0.15;
      this.camera.position.y += (this._camBase.y - this.camera.position.y) * 0.15;
      this.camera.rotation.z += (0 - this.camera.rotation.z) * 0.15;
    }
  }

  // ── Visibility toggles ────────────────────────────────

  showVirtualHand()  { if (this.virtualHand) this.virtualHand.visible = true; }
  hideVirtualHand()  { if (this.virtualHand) this.virtualHand.visible = false; }
  showMenuHands()    { this._menuHands.forEach(h => (h.visible = true)); }
  hideMenuHands()    { this._menuHands.forEach(h => (h.visible = false)); }

  // ── Hand skin ─────────────────────────────────────────

  setHandSkin(hexColor) {
    this.virtualHand?.traverse(c => {
      if (c.isMesh) c.material.color.setHex(hexColor);
    });
  }

  // ── Render ────────────────────────────────────────────

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  // ── Resize ────────────────────────────────────────────

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
