---
name: threejs
description: >-
  Use this skill when developing 3D graphics, scenes, camera systems, animations,
  shaders, or custom geometries using Vanilla Three.js.
---

# Vanilla Three.js Graphics Guidelines

Use this skill when initializing or updating Vanilla Three.js rendering pipelines. This guide provides templates and instructions for performance, rendering, lighting, materials, and canvas management.

## Canvas & Boilerplate Setup

Always resize the renderer and camera dynamically on window changes. Properly dispose of geometries, materials, and textures when scenes change to prevent GPU memory leaks.

```javascript
import * as THREE from 'three';

class ThreeScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.init();
  }

  init() {
    // 1. Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 5, 10);

    // 2. Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 3. Simple Object
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x4f46e5, roughness: 0.2 });
    this.box = new THREE.Mesh(geometry, this.material);
    this.box.castShadow = true;
    this.scene.add(this.box);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    this.scene.add(dirLight);

    // 5. Events
    window.addEventListener('resize', this.onResize.bind(this));
    
    // Start loop
    this.tick();
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  tick() {
    requestAnimationFrame(this.tick.bind(this));
    
    // Rotate box
    this.box.rotation.y += 0.01;
    this.box.rotation.x += 0.005;

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.scene.traverse((object) => {
      if (!object.isMesh) return;
      
      object.geometry.dispose();

      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material.dispose();
      }
    });
    this.renderer.dispose();
  }
}
```

---

## Shaders & Custom Materials

Use `THREE.ShaderMaterial` for custom visual effects. Place shader logic in distinct strings or assets.

```javascript
const customMaterial = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      // Create a gradient that animates over time
      vec3 color = 0.5 + 0.5 * cos(uTime + vUv.xyx + vec3(0.0, 2.0, 4.0));
      gl_FragColor = vec4(color, 1.0);
    }
  `,
  uniforms: {
    uTime: { value: 0 },
  },
});
```

---

## Memory & Performance Optimizations

1. **Object Pooling**: Avoid creating new `THREE.Vector3` or `THREE.Matrix4` instances inside the `tick` frame loop. Instantiate them once globally or in class scopes as helper variables.
2. **InstancedMesh**: If drawing 100+ identical meshes (e.g. foliage, debris, crates), use `THREE.InstancedMesh` to execute a single GPU draw call.
3. **Texture Compressing & Level of Detail (LOD)**: Use smaller textures or lower polygon versions of distant objects using `THREE.LOD`.
