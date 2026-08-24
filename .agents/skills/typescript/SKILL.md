---
name: typescript
description: >-
  Use this skill when writing, refactoring, or troubleshooting TypeScript code,
  including type definitions, interfaces, generics, and compiler configurations.
---

# TypeScript Reference & Guidelines

Use this skill when developing TypeScript features or refactoring JavaScript files to TypeScript. This guide defines typing rules, design patterns, and tsconfig configurations to ensure type safety and high performance.

## Core Guidelines

1. **Avoid `any`**: Never use `any` unless absolutely necessary (e.g., legacy code integration). Prefer `unknown` if the type is truly dynamic, and use type guards or assertions to refine it.
2. **Prefer Interfaces for APIs, Types for Unions/Utilities**:
   - Use `interface` for object structures that represent components, models, or configurations (allows declaration merging).
   - Use `type` for union types, intersection types, tuples, or complex mapped types.
3. **Use Readonly**: Mark properties as `readonly` or arrays as `ReadonlyArray<T>` for immutable structures like game configurations or state definitions.
4. **Strive for Strict Mode**: Keep `"strict": true` in `tsconfig.json` to enable strict null checks, strict function types, and no-implicit-any.

---

## Typing Patterns & Examples

### Generic Component / State Manager
```typescript
interface Stateful<T> {
  getState(): T;
  setState(newState: Partial<T> | ((prev: T) => Partial<T>)): void;
}

class GameStateManager<T extends object> implements Stateful<T> {
  private state: T;

  constructor(initialState: T) {
    this.state = Object.freeze({ ...initialState });
  }

  public getState(): T {
    return this.state;
  }

  public setState(newState: Partial<T> | ((prev: T) => Partial<T>)): void {
    const update = typeof newState === 'function' ? newState(this.state) : newState;
    this.state = Object.freeze({ ...this.state, ...update });
  }
}
```

### Type Guards and Assertions
```typescript
interface Player {
  type: 'player';
  health: number;
  score: number;
}

interface Enemy {
  type: 'enemy';
  health: number;
  damage: number;
}

type Entity = Player | Enemy;

// User-defined Type Guard
function isPlayer(entity: Entity): entity is Player {
  return entity.type === 'player';
}

function processEntity(entity: Entity) {
  if (isPlayer(entity)) {
    console.log(`Player health: ${entity.health}, score: ${entity.score}`);
  } else {
    console.log(`Enemy health: ${entity.health}, damage: ${entity.damage}`);
  }
}
```

### Advanced Utility Types
```typescript
// extract specific keys from a config type
type GameConfig = {
  width: number;
  height: number;
  debug: boolean;
  maxPlayers: number;
  physicsEngine: 'arcade' | 'matter';
};

// Exclude debug and physicsEngine from a simplified config
type DisplayConfig = Omit<GameConfig, 'debug' | 'physicsEngine'>;

// Make all properties optional and deep-partial if needed
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
```

---

## TSConfig Best Practices

Ensure your `tsconfig.json` contains:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```
