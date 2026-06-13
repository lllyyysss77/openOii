# Quality Guidelines (Frontend)

> Code standards and forbidden patterns for the openOii frontend.

---

## Source of Truth

- **Compiler**: TypeScript strict mode (`frontend/tsconfig.json`).
- **Build check**: `pnpm build` runs `tsc && vite build` — `tsc --noEmit` of the whole graph happens here.
- **Tests**: `vitest` (unit/component), `playwright` (E2E in `frontend/tests/e2e/`).
- **No ESLint / Prettier** is configured today. Discipline comes from review + the rules in this file. Don't introduce ESLint silently — discuss first.

---

## Required Before Pushing

For any frontend change:

```bash
cd frontend
pnpm exec tsc --noEmit   # type check
pnpm test                 # related vitest, ideally targeted file: pnpm exec vitest run path/...
pnpm build                # tsc + vite build (final gate)
```

If you touched anything in `tests/e2e/`:

```bash
pnpm e2e
```

CI today only builds Docker images — it does **not** run frontend tests. The local gate is the only gate.

---

## Project-Wide Rules

These apply on top of the global agent defaults.

1. **No `any`, `as any`, `// @ts-ignore`, `// @ts-expect-error`**. Solve the type, don't hide it.
2. **No empty `catch` blocks**. At a minimum, log via the project's toast or console.error guarded by `import.meta.env.DEV`.
3. **No bypassing the API layer**. Components and hooks must not import `axios` directly — go through `app/services/api.ts`.
4. **No new global state without a store**. Use Zustand or TanStack Query, not module-level mutable variables.
5. **No drive-by refactors.** Only modify what the current task requires. Spotted issues become a follow-up todo.
6. **No commented-out code in committed files**. Delete it; git remembers.
7. **No `console.log` in committed code outside `import.meta.env.DEV` guards.** WS reducer and the WS hook show the pattern. Toasts replace user-facing logs.
8. **No `import React from "react"`**. JSX runtime is `react-jsx` — only import the hooks/types you use.

---

## Naming

- **Components / classes**: `PascalCase` (`ProjectCard.tsx`).
- **Hooks**: `useThing` (`useWebSocket.ts`).
- **Stores**: `useThingStore`, file `thingStore.ts` or `<thing>.store.ts`.
- **Utils / helpers**: `camelCase` (`runtimeBase.ts`, `clearLoadingStates.ts`).
- **Types**: `PascalCase` (`Project`, `WsEvent`, `RunProgressEventData`).
- **Constants**: `SCREAMING_SNAKE_CASE` (`MAX_RECONNECT_ATTEMPTS = 5`).
- **CSS**: kebab-case in classnames; tokens in `app/styles/tokens.css`; component classes via Tailwind utilities + DaisyUI.

---

## Imports

- Use the alias `~/` (configured in `tsconfig.json` and `vite.config.ts`) for anything outside the current feature folder:
  ```ts
  import type { Project } from "~/types";
  import { api } from "~/services/api";
  ```
- Use **relative imports** (`./Foo`) only inside the same feature directory.
- Group imports: external packages → `~/` aliases → relative. Within a group, order doesn't matter — be consistent.
- Always `import type` for type-only imports.

---

## Functions and Components

- **Function components only.** No class components.
- Default to **named exports**. The only place `default` exports are accepted is route component modules consumed by the router config.
- Keep components under ~250 LOC. Beyond that, extract subcomponents or hooks.
- A component does **one thing**. If it manages WS, fetches, and renders a tree of charts, split it.
- Hooks calling hooks: fine, as long as the rules of hooks hold.

---

## Side Effects

- All side-effect cleanup (timers, listeners, observers, WS) must be cleaned up in the `useEffect` return.
- Module-level singletons (e.g., `globalConnections` in `useWebSocket.ts`) are allowed only when documented and necessary to survive React 18 StrictMode double-invoke.
- No top-level network calls in modules. Wrap in a hook.

---

## Errors and Toasts

- Use `~/utils/toast` (`toast.error/info/warning/success`) for user-facing failures.
- For developer-only diagnostics: `if (import.meta.env.DEV) console.warn(...)`.
- Don't swallow exceptions. Either rethrow or surface them to the user.

---

## Styling

- Tailwind utilities first; DaisyUI components for buttons/inputs that look standard.
- Custom CSS lives in `app/styles/` (tokens, globals, doodle theme) — not next to components.
- Google Fonts are loaded via `<link rel="stylesheet" media="print" onload="this.media='all'">` in `index.html` to avoid render-blocking. Never add `@import url(...)` for fonts in CSS files.
- Theme switching uses the `data-theme` attribute (see `themeStore`).
- Don't inline `style={{...}}` for layout. Use Tailwind classes; reserve inline styles for dynamic values that can't be expressed as utilities.

---

## Tests

- Co-locate component tests with components. Co-locate hook/store tests with their source.
- E2E tests live in `frontend/tests/e2e/`.
- Use **MSW** for HTTP mocking when component tests need it. Don't mock `axios` ad-hoc with `vi.mock("axios")`.
- Don't write tests that rely on real timers or real network. Use `vi.useFakeTimers()` and MSW.
- When changing project bootstrap fields (`creation_mode`, `target_shot_count`,
  `character_hints`, provider overrides, reference images), add a payload
  assertion test for the creation form and manually verify the browser request
  if the field changes generation behavior.
- For changes that affect first-load performance or lazy-loaded surfaces,
  verify in a production preview with browser resource timing. Home must not
  load project-only chunks such as `tldraw-vendor`, `InfiniteCanvas`, or drawer
  modules before those surfaces are opened.

---

## Forbidden Patterns

| Pattern | Why |
|---|---|
| `any`, `as any`, `// @ts-ignore` | Strict mode bypass. |
| `import React from "react"` | jsx-runtime handles it. |
| Direct `axios` calls in components/hooks | Goes through `services/api.ts`. |
| `console.log(...)` not guarded by `import.meta.env.DEV` | Noisy in prod. |
| Default exports for non-route components | Inconsistent with rest of codebase. |
| Naming a hook without `use` prefix | Breaks rules-of-hooks lint expectations and reader intuition. |
| `useEffect` to mirror props into state | Compute during render. |
| Mutating Zustand state directly | Always use `set`. |
| Adding a new ESLint/Prettier config without alignment | Style-only diffs explode. |
| Hardcoding `http://localhost:18765` | Use `app/utils/runtimeBase.ts` (`getApiBase`, `getWsBase`). |
| Adding a one-off helper next to a feature when an existing util fits | Search `app/utils/` first. |

---

## Pre-Modification Checklist (for any change > 5 minutes)

1. **Search before adding.** `grep -r` the constant or pattern you intend to add — chances are it exists.
2. **Read the existing module first**, especially if it has a co-located test (the test usually shows the intended public surface).
3. **Identify cross-layer impact**:
   - Type added/changed → check `app/types/index.ts` and any consumer.
   - WS event added → update `WsEvent` and `applyWsEvent`.
   - API endpoint added → update `services/api.ts`, then call sites.
4. **Decide where state lives** (component / Zustand / TanStack Query) up front.
5. **Plan the test**: which existing test patterns can you imitate?

---

## Common Mistakes

1. **Forgetting `pnpm exec tsc --noEmit`** before pushing — local CI catches type errors only at `pnpm build`, which is slower.
2. **Pushing without re-running affected tests.** Build doesn't run tests.
3. **Adding a feature without checking for an existing utility** — `app/utils/runtimeBase.ts`, `app/utils/clearLoadingStates.ts`, `app/utils/workflowStage.ts` already cover several common cases.
4. **Mocking too deep.** Mock at module boundaries (`services/api.ts`), not at `axios` call level.
5. **Letting `editorStore` accumulate everything.** Split when a domain emerges (e.g., recovery state could be its own store).
6. **Testing multi-step forms only with slow user clicks.** Rapid sequential
   updates can expose stale React closure bugs; include at least one test or
   browser pass that changes mode, range/input values, and step navigation in
   the same flow.

---

## Code Review Checklist

When reviewing a frontend PR:

- [ ] No `any` / `as any` / `@ts-ignore`.
- [ ] All HTTP through `services/api.ts`.
- [ ] WS event handling extended in both type union and reducer.
- [ ] Tests added or updated for behavioral changes.
- [ ] `pnpm build` passes locally.
- [ ] Toast messages user-friendly; no raw stack traces shown to users.
- [ ] No new commented-out code.
- [ ] No new ESLint/Prettier config (unless explicitly approved).
- [ ] Imports use `~/` alias for cross-feature paths.
- [ ] No new module-level mutable state (or it has a documented reason like `globalConnections`).

---

## Examples

- **Strict-typed hook with cleanup**: `app/hooks/useWebSocket.ts`.
- **Pure reducer extracted from a hook for testability**: `applyWsEvent` in the same file.
- **Centralized toast helper**: `app/utils/toast.ts`.
- **Runtime URL discovery**: `app/utils/runtimeBase.ts`.
- **Component test setup**: `app/setupTests.ts`.
- **MSW worker**: `app/mocks/`.
