# State Management

> Local, global (UI), and server state in the frontend.

---

## Three Layers

| Layer | Tool | Location | Use For |
|---|---|---|---|
| **Component-local** | `useState`, `useReducer`, `useRef` | Inside the component | Transient UI state nobody else needs (open/closed dropdowns, hover, controlled-input draft). |
| **Global UI / app** | **Zustand** | `app/stores/` | Cross-component state that is *not* a copy of server data (selection, modal open, theme, toast queue, editor session state). |
| **Server data** | **TanStack Query** | Anywhere via `useQuery` / `useMutation`, sourced from `app/services/api.ts` | Anything that lives on the backend (projects, characters, shots, runs). |

> **Rule of thumb**: if the data has an authoritative source on the server, it belongs in TanStack Query. If it only exists in the browser, it goes in Zustand or local state.

---

## Component-Local State

Use `useState` for short-lived, single-component data. Don't reach for a store just because two children share state — lift it to the parent first.

When local state grows complex (multiple related fields, transitions), use `useReducer` before adding a new store.

---

## Zustand (`app/stores/`)

### Conventions

- One file per store: `<purpose>Store.ts`. Hook: `useXxxStore`.
- All current stores use the **functional** create signature:
  ```ts
  export const useFooStore = create<FooState>((set, get) => ({ ... }));
  ```
- Persisted store uses the `persist` middleware (see `themeStore.ts`).
- Co-located test: `<store>.test.ts` (see `editorStore.test.ts`).

### Store shape

State and actions live in the same store. Actions take primitive args, return nothing, and call `set` / `get`:

```ts
interface SettingsState {
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  isModalOpen: false,
  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
}));
```

### Selectors

Subscribe to the slice you need, not the whole store:

```ts
const isOpen = useSettingsStore((s) => s.isModalOpen);
const openModal = useSettingsStore((s) => s.openModal);
```

Reading the whole state (`useSettingsStore()`) is allowed for tiny stores but causes re-renders on every change. Don't do it inside a hot list.

### Actions outside React

`useEditorStore.getState()` is fine for reading inside non-React code (utilities, WebSocket reducer, tests). Avoid using it inside a component — the component won't re-render on changes.

### Persistence

Use the `persist` middleware (`zustand/middleware`) only when state must survive reload (theme, accepted-cookie banner). Don't persist transient UI state.

`themeStore.ts` shows the full pattern: `name` is the localStorage key, `onRehydrateStorage` re-applies side-effects (e.g., setting `data-theme` on `<html>`) after hydration.

### Inventory of existing stores

| Store | Purpose |
|---|---|
| `editorStore.ts` | Project editor session: selection, generation flags, recovery, characters, shots, current run, projectVideoUrl, projectStatus, projectStoryOutline, projectVisualBible, projectOutlineApproved. The single biggest store; treat as the source of truth for the canvas page. |
| `settingsStore.ts` | Whether the settings modal is open. |
| `sidebarStore.ts` | Sidebar collapse state. |
| `themeStore.ts` | Theme name, persisted, syncs `data-theme`. |
| `toast.store.ts` | Toast queue with a 5-message cap. |

Before creating a new store, check whether existing ones already cover the concern. If `editorStore` is becoming a kitchen sink, split by domain (e.g., `recoveryStore`) rather than by component.

### Tests

`editorStore.test.ts` shows the pattern: import the hook, call `getState()`, drive actions, assert on state. No React render needed.

---

## TanStack Query

Provider lives in `App.tsx`. Defaults:

```ts
defaultOptions: {
  queries: { staleTime: 1000 * 60 * 5, retry: 1, refetchOnWindowFocus: false },
  mutations: { retry: 0 },
}
```

### Query keys

Hierarchical arrays:

- `["projects"]`
- `["projects", projectId]`
- `["projects", projectId, "shots"]`

This makes `invalidateQueries({ queryKey: ["projects"] })` cleanly drop everything underneath.

### Where to define queries

For now, queries live close to the component that uses them. If the same query is consumed in 3+ places, extract to `app/features/<domain>/queries.ts` and export a `useXxxQuery` hook.

### Mutations

```ts
const qc = useQueryClient();
const mutation = useMutation({
  mutationFn: api.deleteProject,
  onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
});
```

Use the existing `app/features/projects/deleteProject.ts` style for grouping a mutation + helpers.

### Don't mirror server data into Zustand

If `editorStore` already contains `characters: Character[]` because we're driving the canvas off WebSocket events, that's fine — it's session state derived from a stream. **Don't also keep them in TanStack Query and try to sync.** Pick one source per kind of data.

---

## State Sync via WebSocket

The WS hook (`useProjectWebSocket`) receives events and calls store setters via the pure `applyWsEvent(event, store)` reducer. This means:

- **Server-pushed updates flow into Zustand**, not into the React Query cache.
- **Initial loads** still come from the API (`services/api.ts`) and may live in either Zustand (when the canvas page imperatively bootstraps) or React Query.
- When adding a new server-pushed entity, decide which store it belongs to and add a `setX` action to it. Then add a `case` in `applyWsEvent`.

---

## Patterns to Follow

### Selection state stays in editor store

`selectedShotId`, `selectedCharacterId`, `highlightedMessageIndex` are in `editorStore`. New cross-component selection state should land here, not in route state or context.

### Modals controlled by their own store

If a modal needs to open from anywhere, give it its own store (`settingsStore`). Don't pass `isOpen` through 4 levels of props.

### Toast notifications

```ts
import { toast } from "~/utils/toast";

toast.error({ title: "Generation failed", message: err.message, duration: 5000 });
```

`utils/toast.ts` is a thin wrapper around `toast.store.ts`. Components and hooks should call `toast.success` / `error` / `warning` / `info` — never poke `useToastStore.setState` directly.

---

## Forbidden Patterns

| Pattern | Why |
|---|---|
| Storing API response in `useState` and refetching manually | Use TanStack Query. |
| Duplicating server data into Zustand and trying to keep them in sync | Pick one home per kind of data. |
| `useEffect` to sync store A → store B | Compute on read, or merge into one store. |
| Mutating Zustand state directly (`store.foo.push(...)`) | Always go through `set`, return a new array/object. |
| Subscribing to the entire `useEditorStore()` in a deep child | Use a selector. |
| Reading from a store via `getState()` inside a component | Use the hook so React subscribes. |
| Calling axios inside a component instead of `services/api.ts` | Centralize HTTP. |

---

## Common Mistakes

1. **Adding a `useEffect` to seed Zustand from props** — pass the data through the store directly or compute during render.
2. **Forgetting to invalidate the right query key after a mutation** — list shows stale data.
3. **Storing derived state** (`fullName = first + last`) in the store — derive it where you read it.
4. **Persisting too much** — `persist` middleware on heavy state inflates localStorage.
5. **Calling `set` with a function that returns the same object reference** — Zustand will still notify subscribers; check whether you mean `set(...)` or `set((s) => ({...s, x: y}))`.

---

## Examples

- Tiny modal store: `app/stores/settingsStore.ts`.
- Persisted theme store + DOM side-effects: `app/stores/themeStore.ts`.
- Capped queue store: `app/stores/toast.store.ts`.
- Big domain store + tests: `app/stores/editorStore.ts` + `editorStore.test.ts`.
- WebSocket → store reducer: `app/hooks/useWebSocket.ts` (`applyWsEvent`).
- Mutation pattern (TanStack Query candidate): `app/features/projects/deleteProject.ts`.
- QueryClient setup: `app/App.tsx`.
