---
name: react-three-fiber
description: >-
  Use this skill when developing 3D scenes in React using React Three Fiber (R3F)
  and @react-three/drei, including animations, canvas setups, and event hooks.
---

# React Three Fiber (R3F) Guidelines

Use this skill when writing React Three Fiber (R3F) code. R3F integrates Three.js into React's component model. Follow these guidelines to build reactive, robust, and fast 3D graphics in React.

## Canvas Setup and Basic Component

Create the canvas outside components containing 3D hooks. Any component using hooks like `useFrame` or `useThree` must reside *inside* the `<Canvas>` tag.

```tsx
import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import * as THREE from 'three';

const AnimatedBox = () => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Hook into R3F frame loop (runs 60+ times per second)
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
      meshRef.current.rotation.x += delta * 0.2;
    }
  });

  return (
    <mesh ref={meshRef} castShadow receiveShadow position={[0, 0, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="hotpink" roughness={0.3} />
    </mesh>
  );
};

export const GameCanvas = () => {
  return (
    <div className="w-full h-screen">
      <Canvas shadows camera={{ position: [3, 3, 5], fov: 50 }}>
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[5, 10, 5]}
          intensity={1.0}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <AnimatedBox />
        <OrbitControls enableDamping />
        <Stats />
      </Canvas>
    </div>
  );
};
```

---

## Interactivity & Event Handling

React Three Fiber translates 3D raycasting events into declarative React events. You can attach pointer events directly to meshes.

```tsx
import React, { useState } from 'react';

export const InteractiveSphere = () => {
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);

  return (
    <mesh
      scale={clicked ? 1.5 : 1}
      onClick={() => setClicked(!clicked)}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial color={hovered ? 'red' : 'royalblue'} />
    </mesh>
  );
};
```

---

## Performance Optimizations in R3F

1. **Avoid State Re-renders in `useFrame`**: Do not use React state (`useState`) to update variables dynamically inside `useFrame`. This will trigger full component re-renders 60 times a second. Instead, mutate the refs directly:
   ```tsx
   // BAD: const [pos, setPos] = useState(0); useFrame(() => setPos(p => p + 0.1))
   // GOOD:
   const meshRef = useRef<THREE.Mesh>(null);
   useFrame(() => {
     if (meshRef.current) meshRef.current.position.y += 0.05;
   });
   ```
2. **Preload Assets**: Use `useGLTF.preload('/path/to/model.glb')` at module scope to pre-cache models before rendering, preventing frame drops when components mount.
3. **Control Draw Calls**: Use `<Instances>` and `<Instance>` from `@react-three/drei` when rendering many identical meshes.
