---
name: game-physics
description: >-
  Use this skill when implementing 2D or 3D collision detection, rigid body dynamics,
  custom movement equations, or using physics libraries (Rapier, Arcade, Matter.js).
---

# Game Physics Guidelines

Use this skill when developing custom physics calculations or configuring built-in physics engines for collisions, constraints, forces, and movements.

## Core Concepts & Equations

Keep coordinate calculations consistent. The basic movement equations (Euler Integration):
```javascript
// Frame update
velocity.x += acceleration.x * dt;
velocity.y += (acceleration.y + gravity) * dt;

position.x += velocity.x * dt;
position.y += velocity.y * dt;

// Reset acceleration
acceleration.set(0, 0);
```

---

## Collision Detection (Manual Integrations)

### 1. AABB vs AABB (Axis-Aligned Bounding Box)
Used for 2D bounding boxes without rotation:
```javascript
function rectIntersect(rect1, rect2) {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
}
```

### 2. Circle vs Circle
Used for radial boundaries:
```javascript
function circleIntersect(c1, c2) {
  const dx = c1.x - c2.x;
  const dy = c1.y - c2.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < c1.radius + c2.radius;
}
```

### 3. Raycasting
Projecting a line from an origin to see if it intersects with colliders. Crucial for custom line of sight, lasers, or weapon hitscan mechanisms.

---

## 3. Using Rapier Physics (3D Web Assembly)

When building games in React Three Fiber (R3F) or Three.js, Rapier is the industry standard. Use `@react-three/rapier` for easy declarative setup.

```tsx
import React from 'react';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';

export const PhysicsScene = () => {
  return (
    <Physics gravity={[0, -9.81, 0]}>
      {/* Dynamic sphere */}
      <RigidBody colliders="ball" position={[0, 5, 0]} restitution={0.8}>
        <mesh>
          <sphereGeometry args={[1, 32, 32]} />
          <meshStandardMaterial color="red" />
        </mesh>
      </RigidBody>

      {/* Static ground */}
      <RigidBody type="fixed" position={[0, -1, 0]}>
        <mesh>
          <boxGeometry args={[10, 1, 10]} />
          <meshStandardMaterial color="green" />
        </mesh>
      </RigidBody>
    </Physics>
  );
};
```

---

## Physics Performance Best Practices

1. **Keep Collider Geometries Simple**: Prefer primitive colliders (Box, Sphere, Capsule) over complex Mesh/Trimesh colliders. Mesh colliders are expensive to evaluate.
2. **Limit Physics Step Frequency**: Separate rendering frame rate from physics update step. Run physics loops at fixed intervals (e.g. `1/60` seconds) using accumulator variables:
   ```javascript
   let accumulator = 0;
   const fixedStep = 1 / 60;

   function update(dt) {
     accumulator += dt;
     while (accumulator >= fixedStep) {
       physicsWorld.step(fixedStep);
       accumulator -= fixedStep;
     }
   }
   ```
3. **Use Collision Groups / Layers**: Configure filters so entities do not perform collision checks against matching team members (e.g., enemy bullets colliding with other enemies).
