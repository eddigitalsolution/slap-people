---
name: game-ai
description: >-
  Use this skill when designing artificial intelligence for non-player characters (NPCs),
  behavior trees, state planning, steering behaviors, or A* pathfinding.
---

# Game AI Reference & Guidelines

Use this skill when implementing decision-making models, navigation algorithms, or sensory systems for NPCs.

## Decision Making Architectures

### 1. Behavior Trees (BT)
Recommended for complex, hierarchical behaviors (e.g. boss battles or stealth NPCs).
- **Selector Node**: Evaluates children until one succeeds (OR logic).
- **Sequence Node**: Evaluates children until one fails (AND logic).
- **Condition / Action Nodes**: Leaf nodes that check states or execute actions (e.g., `isPlayerInSight`, `chasePlayer`).

```javascript
class BehaviorTree {
  constructor(rootNode) {
    this.root = rootNode;
  }
  tick(blackboard) {
    this.root.execute(blackboard);
  }
}

class SequenceNode {
  constructor(children) {
    this.children = children;
  }
  execute(blackboard) {
    for (let child of this.children) {
      const status = child.execute(blackboard);
      if (status === 'FAILURE') return 'FAILURE';
      if (status === 'RUNNING') return 'RUNNING';
    }
    return 'SUCCESS';
  }
}
```

### 2. Utility AI
Use Utility AI when you want entities to make choices dynamically based on scoring metrics (e.g., sims choosing actions based on Hunger, Energy, and Boredom curves).
- Assign scores (utility curves) to actions.
- The action with the highest total score is selected.

---

## Pathfinding & Steering

### 1. A* Pathfinding (Grid-based)
Used to find optimal paths around grid obstacles.
- **G-Cost**: Distance from starting node.
- **H-Cost**: Heuristic distance estimate to target node.
- **F-Cost**: `G + H`. Always expand the node with the lowest F-Cost.

### 2. Autonomous Steering Behaviors
For natural, physics-driven NPC movement (Craig Reynolds' model):

- **Seek**: Calculate force toward a target.
  ```javascript
  function seek(actor, targetPos) {
    const desiredVelocity = targetPos.clone().sub(actor.position).normalize().multiplyScalar(actor.maxSpeed);
    const steerForce = desiredVelocity.sub(actor.velocity).limit(actor.maxForce);
    return steerForce;
  }
  ```
- **Flee**: Opposite vector direction of Seek.
- **Wander**: Add small random vectors to a forward-projected target circle to simulate continuous wandering.

---

## Sensory Systems

Implement senses to prevent NPCs from having "cheating" knowledge of the player's coordinate vectors.
- **Sight (FOV Cone)**: Check distance and angle offset from forward vector. Cast a ray to verify if view is blocked by wall obstacles.
  ```javascript
  function canSeeTarget(npc, target, fovAngle, range, obstacles) {
    const toTarget = target.position.clone().sub(npc.position);
    const dist = toTarget.length();
    if (dist > range) return false;

    const angle = npc.forward.angleTo(toTarget);
    if (angle > fovAngle / 2) return false;

    // Line of sight raycast
    const hit = castRay(npc.position, target.position, obstacles);
    return hit === target;
  }
  ```
- **Hearing**: Detect noise emitters within radius thresholds.
