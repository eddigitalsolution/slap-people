---
name: react
description: >-
  Use this skill when developing components, managing state, handling side effects,
  or optimizing rendering performance in React applications.
---

# React Reference & Guidelines

Use this skill when building user interfaces or state hooks in React. This guide establishes standards for React component lifecycle management, hook patterns, state structure, and render optimization.

## Component Design Rules

1. **Keep Components Small and Focused**: A component should ideally do one thing. If it spans beyond 150-200 lines, extract sub-components.
2. **Prefer Composition Over Complex Props**: Use `children` or render props instead of passing down deep configuration flags or boolean switches.
3. **Keep State Local When Possible**: Lift state up only when multiple components need to share it. Do not pollute global contexts with transient local states (e.g., input values, toggle states).
4. **Use Declared Custom Hooks for Business Logic**: Separate UI markup from complex state management or external subscription logic.

---

## State Management Patterns

### Local State vs Context vs Zustand
- **Local State (`useState`, `useReducer`)**: For isolated interactive logic (e.g., drop-downs, tabs, form inputs).
- **React Context**: For static or low-frequency global settings (e.g., themes, currentUser profiles). Avoid for high-frequency updates as it triggers renders of all consumers.
- **External Stores (Zustand/Redux)**: For complex, high-frequency, or shared game states (e.g., scores, inventory, multiplayer states).

```typescript
import { create } from 'zustand';

interface GameStore {
  score: number;
  lives: number;
  incrementScore: (amount: number) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  score: 0,
  lives: 3,
  incrementScore: (amount) => set((state) => ({ score: state.score + amount })),
  resetGame: () => set({ score: 0, lives: 3 }),
}));
```

---

## Performance Tuning Guidelines

1. **Avoid Inline Objects & Functions in Props**:
   - Wrap functions passed to children in `useCallback`.
   - Wrap calculated values in `useMemo` if computation is intensive or if the value is a dependency in arrays or components.
2. **Avoid Unnecessary Renders with `React.memo`**:
   - Memoize leaf components that render expensive visual elements (e.g., large lists or 3D viewports).
3. **Use Windowing/Virtualization**:
   - For lists of 100+ items, use virtual lists (e.g., `react-window` or `react-virtualized`) to keep DOM nodes minimal.

```typescript
import React, { useState, useCallback, useMemo } from 'react';

interface RowProps {
  id: string;
  label: string;
  onSelect: (id: string) => void;
}

const HeavyRow = React.memo(({ id, label, onSelect }: RowProps) => {
  console.log(`Render HeavyRow: ${label}`);
  return <div onClick={() => onSelect(id)} className="p-4 border-b">{label}</div>;
});
HeavyRow.displayName = 'HeavyRow';

export const RowList = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const items = useMemo(() => [
    { id: '1', label: 'Item A' },
    { id: '2', label: 'Item B' },
  ], []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  return (
    <div>
      <p>Selected ID: {selectedId}</p>
      {items.map(item => (
        <HeavyRow key={item.id} id={item.id} label={item.label} onSelect={handleSelect} />
      ))}
    </div>
  );
};
```
