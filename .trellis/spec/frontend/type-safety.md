# Type Safety

> TypeScript patterns: shared types, narrowing, validation at IO boundaries.

---

## Compiler Configuration

`frontend/tsconfig.json` is **strict**:

- `"strict": true`
- `"noUnusedLocals": true`
- `"noUnusedParameters": true`
- `"noFallthroughCasesInSwitch": true`
- `"isolatedModules": true`
- `"jsx": "react-jsx"` (no `import React`)
- `"baseUrl": "."` + path alias `"~/*": ["./app/*"]`

`tsc --noEmit` runs as part of `pnpm build`. Do not weaken these flags. If the compiler complains, fix the code, not the config.

---

## Shared Types Live in `app/types/`

- All cross-module types are in `app/types/index.ts` (and split files re-exported from `index.ts` when the file gets large, e.g., `app/types/errors.ts`).
- Import from the alias: `import type { Project, Shot, WsEvent } from "~/types"`.
- Always use `import type` for type-only imports — keeps Vite from emitting unused runtime modules.

### Naming

- Domain entities: `Project`, `Character`, `Shot` — match server schema names.
- Payloads / DTOs: `CreateProjectPayload`, `UpdateProjectPayload`, `ProjectProviderOverridesPayload`.
- Server-pushed event data: `RunProgressEventData`, `RunAwaitingConfirmEventData`, `RunConfirmedEventData`.
- WebSocket envelope: `WsEvent`.
- API helpers may compose: `Partial<Pick<Project, "title" | "story" | "style"> & ProjectProviderOverridesPayload>`.

### Don't duplicate types

If a backend route returns `Project`, the frontend type is a single `Project` in `app/types`. Do not have a parallel `ProjectListItem` that drifts.

---

## Narrowing and Type Guards

The codebase uses small, named guards rather than inline assertions:

```ts
import { isWorkflowStage } from "~/utils/workflowStage";

const stage = data.stage ?? data.current_stage;
if (isWorkflowStage(stage)) {
  store.setCurrentStage(stage);
}
```

When you receive untyped data (`event.data`, `JSON.parse`, `localStorage`), narrow it explicitly. Don't `as` your way out.

### Discriminated unions for events

`WsEvent` is a discriminated union on `type`. The `applyWsEvent` switch in `useWebSocket.ts` lets TypeScript narrow `event.data` per case. Always extend the union when adding a new event:

```ts
type WsEvent =
  | { type: "run_started"; data: RunStartedEventData }
  | { type: "run_progress"; data: RunProgressEventData }
  | ...
```

### Switch exhaustiveness

`noFallthroughCasesInSwitch` is on. Default cases that re-throw or assert never can be added when you want exhaustiveness checking:

```ts
default: {
  const _exhaustive: never = event;
  throw new Error(`Unknown event: ${JSON.stringify(_exhaustive)}`);
}
```

The current `applyWsEvent` switch doesn't add `default` because it intentionally ignores unknown event types (forward-compat with newer servers). If you add a critical control event, prefer exhaustiveness.

### WS event executable contract

Backend and frontend WS event type unions must match. The backend test
`backend/tests/test_schemas/test_ws_events.py::TestWsEventSchemaRegistry::test_backend_and_frontend_ws_event_type_unions_match`
parses `frontend/app/types/index.ts` and fails on drift.

When adding a user-visible WS event:

1. Add/adjust backend schema and `_EVENT_DATA_MODELS`.
2. Add/adjust frontend `WsEventType` and event data interface in `app/types/index.ts`.
3. Add a `case` in `applyWsEvent`.
4. Add a consumer test in `app/hooks/useWebSocket.test.ts` proving the UI/store/toast effect.

Existing extended-event consumer coverage includes `agent_thinking`,
`critique_result`, `version_created`, `version_rollback`, `audio_generated`,
`bible_updated`, `export_completed`, and `consistency_eval_completed`.

---

## API Boundary Typing

`app/services/api.ts` is the only module allowed to call the backend HTTP API.
Each function declares request and response types explicitly, e.g.:

```ts
export const projectsApi = {
  get: (id: number) => fetchApi<Project>(`/api/v1/projects/${id}`),
};
```

Rules:

- Return concrete entity types (`Promise<Project>`), never `Promise<any>` or `Promise<unknown>`.
- Validate at the boundary if the server's contract is fragile. Today the project trusts the backend's Pydantic response models. If we add Zod or similar, it goes here.
- Keep frontend DTOs aligned with backend Pydantic schemas. `UpdateProjectPayload`
  must cover exactly the fields accepted by `backend/app/schemas/project.py::ProjectUpdate`
  plus provider override fields via `ProjectProviderOverridesPayload`.
- When a backend response identifies a child resource through a parent-scoped route,
  model the parent id in the frontend type too. Example: `ExportResponse` includes
  `project_id` because status is read from
  `/api/v1/projects/{project_id}/export/{export_id}/status`.

### API executable contract tests

Backend owns executable cross-layer guards for contracts that are easy to drift:

- `backend/tests/test_schemas/test_project_contract.py` parses
  `frontend/app/types/index.ts` and compares `UpdateProjectPayload` against
  `ProjectUpdate.model_fields`.
- `backend/tests/test_schemas/test_ws_events.py` compares backend/frontend
  WebSocket event type unions.

If you add or remove backend DTO fields, update the frontend type and the
contract test together. Do not leave a narrower frontend payload type just
because no current component uses the new field.

---

## WebSocket Boundary

`event.data` is typed as `Record<string, unknown>` for some legacy events. The reducer uses targeted casts only after a guard:

```ts
const progressEvent = event.data as unknown as RunProgressEventData;
```

This is acceptable **only** because the surrounding case has already discriminated `event.type`. If you add a new event, prefer modeling its `data` as a typed property of the union variant from the start, so casts disappear.

---

## Generics

Use generics on:

- Reusable hooks that wrap something (`useQuery<TData>`).
- Utility functions like `clearLoadingStates(store, agentFilter?)` — keep them concrete unless they're truly polymorphic.
- API helpers when the response shape varies by argument.

Avoid one-off generics; concrete types read more clearly and refactor faster.

---

## Forbidden

| Pattern | Why |
|---|---|
| `any` | Strict mode permits it but project rule forbids it. Use `unknown` and narrow. |
| `as any` | Same as above. |
| `// @ts-ignore`, `// @ts-expect-error` | Forbidden. Solve the type issue. |
| Empty `catch (e) {}` | At minimum log the error. |
| `Function` type | Use a concrete signature `(...args: T[]) => R`. |
| `Object` / `{}` types | Use `Record<string, unknown>` or model the shape. |
| Untyped `JSON.parse` in production code | Wrap with a guard or schema. |
| Importing types without `import type` for type-only usage | Bundler emits dead runtime imports. |
| Type assertions to "fix" missing fields (`{ ... } as Foo`) | Make the data legitimately match `Foo` or extend the type. |

---

## Patterns That Work Well Here

### `Record<string, unknown>` for opaque server payloads

Carry untrusted JSON as `Record<string, unknown>` until it's narrowed.

### Optional chaining + nullish coalescing for server defaults

```ts
const stage = data.stage ?? data.current_stage;
```

Both fields may be present in different versions of the server payload — read defensively at the boundary.

### Function types for store actions

Action signatures live in the store interface so consumers see typed selectors:

```ts
interface ToastStore {
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}
```

### Compose with utility types

```ts
export type UpdateProjectPayload = Partial<
  Pick<
    Project,
    | "title"
    | "story"
    | "style"
    | "status"
    | "target_shot_count"
    | "character_hints"
    | "creation_mode"
    | "reference_images"
    | "exports"
    | "universe_id"
    | "chapter_number"
    | "chapter_title"
  > &
    ProjectProviderOverridesPayload
>;
```

`Partial`, `Pick`, `Omit`, `ReturnType<typeof setTimeout>` are preferred over hand-written shapes.

---

## Common Mistakes

1. **Adding optional `?` to silence the compiler** when the field is actually required. Make the call site provide it instead.
2. **`as Foo` to bypass missing fields** — leads to runtime undefined. Either widen `Foo` or fix the data.
3. **Importing types from `~/types` without `import type`** — Vite tree-shakes less aggressively.
4. **Defining the same DTO type in two places** (component + store + API) and watching them drift.
5. **Casting `event.target`** in event handlers without checking the element kind. Use `e.currentTarget` or check `instanceof HTMLInputElement` first.
6. **Including backend-removed event types in frontend `WsEventType` union** — creates dead code paths. If backend removes an event type from its `WsEventType` Literal, remove it from the frontend union too, unless backward compatibility with older backend versions is needed.
7. **Not adding new store methods to test mocks** — when editorStore gains new methods (e.g., `setProjectStoryOutline`), all test files that mock the store must include them, otherwise `TypeError: store.method is not a function` at render time.
8. **Leaving `<button>` without an explicit `type`** — inside forms it defaults to submit. The shared `Button` component defaults to `type="button"`; only pass `type="submit"` when the button should submit a form. Native buttons in forms or dialog backdrops must also set `type="button"` unless they intentionally submit.

---

## Review Checklist

Before opening a PR with type changes:

- [ ] No new `any` / `as any` / `@ts-ignore`.
- [ ] All cross-boundary data types live in `app/types/`.
- [ ] Frontend DTOs match backend Pydantic request/response schemas or have an explicit compatibility reason.
- [ ] New event types are added to `WsEvent` and handled in `applyWsEvent`.
- [ ] New user-visible WS events have an `applyWsEvent` consumer test.
- [ ] `pnpm exec tsc --noEmit` passes.
- [ ] `pnpm build` passes (it includes the type check).

---

## Examples

- Domain types: `app/types/index.ts`.
- Discriminated WS events: `WsEvent` definition in `app/types`, dispatched in `app/hooks/useWebSocket.ts`.
- Type-narrowing utility: `app/utils/workflowStage.ts`.
- Backend-base resolver with typed options: `app/utils/runtimeBase.ts`.
- API surface with typed responses: `app/services/api.ts`.
