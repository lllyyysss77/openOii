# Component Guidelines

> Patterns, props, composition, and styling for React components.

---

## Stack

- **React 18** with `react-jsx` (no `import React`).
- **TypeScript strict mode** + `noUnusedLocals` + `noUnusedParameters`.
- **Tailwind CSS v3** via `@tailwind` directives in `app/styles/globals.css` and `tailwind.config.ts` (DaisyUI theme on top, "doodle" / "brutal" custom utility classes).
- **`clsx`** for conditional class composition.
- **`@heroicons/react`** for page-level icons (nav, settings).
- **`SvgIcon`** (`components/ui/SvgIcon.tsx`) for canvas card and inline icons — 8 Lucide paths embedded as named `name` prop, zero external deps, `currentColor` + `size` prop. Add new icons by appending path to `LUCIDE_PATHS` in SvgIcon.tsx.
- **`react-router-dom`** for routing.
- **TanStack Query** for server state, **Zustand** for UI state (with `useShallow` for precise subscriptions + `devtools` middleware).

---

## File Layout

- One default-or-named component per file.
- File name = component name in `PascalCase.tsx`.
- Always export as a **named export** (`export function Button(...)`). Lazy imports re-map to `default` at the call site (see `App.tsx`).
- Co-located test: `<Component>.test.tsx`.

---

## Component Anatomy

### Functional, never class

```tsx
import { clsx } from "clsx";
import { type ButtonHTMLAttributes, type ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "btn-doodle",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
```

The only class component allowed is `ErrorBoundary` (React requires it).

### Props are typed with an `interface`

- Named `<Component>Props`.
- Extend native HTML attributes when wrapping a native element (`extends ButtonHTMLAttributes<HTMLButtonElement>`).
- Default values via destructuring, never `defaultProps`.
- `children: ReactNode` when accepting children explicitly.

### Variants as object lookup, not nested ternaries

```tsx
const variantStyles = {
  primary: "bg-primary text-primary-content hover:bg-primary/90",
  ghost: "bg-transparent border-transparent shadow-none",
};
```

Pattern used across `Button.tsx`, `ConfirmModal.tsx`. Don't inline `clsx` ternaries that duplicate what a lookup table already does.

### Forwarding `className`

Always spread `className` last via `clsx`, so callers can override:

```tsx
className={clsx(baseStyles, variantStyles[variant], className)}
```

### Forwarding extra HTML props

Spread the rest with `{...props}` after destructuring the controlled keys. Callers can attach `aria-*`, `data-*`, `id`, `onClick` without the component needing to know.

---

## Composition Patterns

### Children, not "render slots"

Prefer `<Card><Card.Header>...</Card.Header></Card>` or simple `children`. Don't invent `renderHeader={() => ...}` props unless real demand exists.

### Controlled by default

Modals, inputs, and overlays accept `isOpen`, `onClose`, `value`, `onChange`. State is owned by the parent; the component is dumb. See `ConfirmModal.tsx`:

```tsx
interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  ...
}
```

### Early returns

When a state means "render nothing," return `null` early:

```tsx
if (!isOpen) return null;
```

### Loading states inside the component

Buttons own their `loading` UI. Pages own their page-level `LoadingOverlay`. Don't push a global spinner for component-local async.

---

## Styling

### Tailwind v3

- Use utility classes directly. No CSS modules, no `styled-components`.
- Theme tokens: `bg-primary`, `text-primary-content`, `bg-base-100`, `border-base-content/30`.
- Comic/manga visual language: `halftone-bg` (light dots), `halftone-bg-dense` (dense dots), `card-comic` (CMYK offset shadow + thick border), `speech-bubble` / `speech-bubble-user` (dialog balloons with CSS triangles).
- Project-specific utilities: `btn-doodle`, `shadow-brutal`, `shadow-brutal-sm`, `font-heading`, `font-comic`, `card-comic`, `halftone-bg` / `halftone-bg-accent` / `halftone-bg-dense`, `speech-bubble` / `speech-bubble-user`, `touch-target` come from `globals.css`.
- **`@layer components` limitation**: Cannot use `@apply` with Tailwind `fontFamily` utilities (e.g., `font-comic`) inside `@layer components` blocks. Use direct CSS `font-family` declarations instead.
- Use `clsx` for conditional classes; never string-concatenate Tailwind classes manually (purger may miss them).
- Don't hardcode hex colors when a theme token exists.

### Responsive

- Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`).
- Touch targets must include the `touch-target` utility (see `Button.tsx`) so they meet the 44×44 minimum.
- For horizontal cards or header rows, put `min-w-0` on the flex container and the truncating child. A `truncate` span without a `min-w-0` ancestor can force mobile overflow.
- Fixed or absolute toolbars must be constrained to the viewport (`max-w-[calc(100vw-...)]`) and either wrap or scroll on narrow screens. Verify at 390px and 768px widths after changes.

### Dark / light theme

Theme is controlled by `app/stores/themeStore.ts` and toggled at the `<html>` element. Components should rely on theme tokens, not hardcoded `text-white` / `text-black`. Dark mode uses a 5-level elevation system (`base-100` → `base-200` → `base-300` → `base-content/5` → `base-content/10`) with muted brand colors (`primary/80`, etc.) to prevent "glow" on dark backgrounds.

---

## Behavioral Patterns

### Re-click protection on async buttons

`Button.tsx` debounces clicks itself: it sets `isProcessing` while `await onClick?.(e)` runs and re-enables after a 300ms cool-down. Don't re-implement this in a wrapper — wire your async handler into `onClick` and let the button do it.

### Disabled vs loading

- `disabled` = action genuinely unavailable (no permission, missing input).
- `loading` = action in progress (shows spinner, blocks click).
- Both should result in `aria-disabled` and visually muted state.

### Modals and dialogs

Use the project's DaisyUI-flavored `<dialog className="modal modal-open" open>` pattern (see `ConfirmModal.tsx`). New modals should:

- Compose on top of the existing `Modal` primitive when possible.
- Accept `isOpen`/`onClose`.
- Trap focus and close on backdrop click + ESC (the `<dialog>` element handles this in modern browsers; verify in tests).

### Infinite Canvas Storyboard Layout

The project storyboard canvas is a single tldraw custom shape, not four independently positioned stage shapes.

- Source files: `frontend/app/components/canvas/InfiniteCanvas.tsx`, `frontend/app/hooks/useCanvasLayout.ts`, `frontend/app/components/canvas/shapes/StoryboardBoardShape.tsx`, `frontend/app/hooks/useDomSize.ts`.
- Shape contract: `useCanvasLayout()` returns one `TLShapePartial` with `id: "shape:storyboard-board"`, `type: "storyboard-board"`, and props `{ projectId, story, summary, characters, shots, videoUrl, videoTitle, visibleSections, sectionStates, placeholders, statusLabels, placeholderTexts, downloadUrl }`.
- Layout rule: the four stages (`plan`, `character`, `shot`, `compose`) are rendered inside `StoryboardBoardShape` as normal React DOM sections using `flex flex-col gap-8`. Browser flow owns vertical spacing, so card height changes naturally reflow without collisions.
- tldraw rule: tldraw owns infinite-canvas navigation, selection, zoom, and pan only. Do not reintroduce multiple section shapes, arrow bindings, collision systems, or manual `y` recalculation for stage spacing.
- Dynamic size rule: `StoryboardBoardShape.getGeometry()` reads measured DOM size through `getShapeSize(editor, shape.id)` from `useDomSize`; `h` is only a fallback for initial geometry.
- Backend data flow: `InfiniteCanvas` reads project query data plus Zustand `characters`, `shots`, `projectVideoUrl`, `currentStage`, `isGenerating`, `awaitingConfirm`, `recoverySummary`, `currentRunId`; all backend fields are projected into the single board shape unchanged.
- Action flow: card buttons emit `canvasEvents.emit("shape-action", { shapeId: "shape:storyboard-board", action, entityType, entityId, feedbackType, shotPatch?, feedbackContent? })`. `InfiniteCanvas` must route structured commands to entity APIs: `charactersApi.approve/regenerate`, `shotsApi.approve/regenerate/update`, and `assetsApi.createFromCharacter`. Only free-form natural-language edits use `projectsApi.feedback(...)`; approvals must never be modeled as feedback.
- Stale persistence: when replacing shape types, bump `persistenceKey` in `InfiniteCanvas.tsx` and delete stale tldraw shape types in `handleMount` so old IndexedDB records do not crash shape validation.

Good case: add a new visual field to character cards by extending `ReviewedCharacter`, passing it through the board props, and rendering inside `CharacterCard`; spacing stays DOM-driven.

Base case: a new shot arrives over WebSocket, Zustand updates `shots`, `useCanvasLayout` updates the board props, and the board's shot grid grows without changing shape positions.

Bad case: creating `shape:plan`, `shape:character`, `shape:shot`, and `shape:compose` as separate tldraw shapes and then trying to prevent overlap with ResizeObserver, collision handlers, or store listeners.

Required tests: `pnpm exec vitest run app/hooks/useCanvasLayout.test.ts app/components/canvas/InfiniteCanvas.test.tsx` must assert that only the `storyboard-board` shape is projected and that visible sections/state props match the backend/Zustand inputs.

---

## Forms and Inputs

- `<Input>` (in `components/ui/Input.tsx`) wraps native input with project styling.
- Validation: lift state up to the parent or feature module. Components shouldn't own server-side error messages.
- Display server errors with `<ErrorMessage>` from `components/ui/ErrorMessage.tsx`.

---

## Tests for Components

- Every UI primitive in `components/ui/` ships with a `<Component>.test.tsx`.
- Use `@testing-library/react`, query by accessible role / text, never by classname.
- For interaction tests use `@testing-library/user-event`, not `fireEvent`.
- Mock external dependencies (axios, websocket) at the import boundary, not deep inside.

---

## Forbidden Patterns

| Pattern                                                                                  | Why                                                                                                                                                   |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `React.FC` / `React.FunctionComponent`                                                   | Adds implicit `children`; the team uses explicit prop types.                                                                                          |
| `defaultProps`                                                                           | Use destructuring defaults.                                                                                                                           |
| `useEffect` to derive state from props                                                   | Compute during render; cache with `useMemo` if expensive.                                                                                             |
| Inline `style={{ color: "#fff" }}`                                                       | Use Tailwind classes / theme tokens.                                                                                                                  |
| Direct DOM manipulation (`document.querySelector`, raw `addEventListener`) inside render | Use refs + `useEffect` cleanup; for canvas events use the existing `canvasEvents.ts` helper.                                                          |
| `dangerouslySetInnerHTML` without sanitization                                           | Don't accept HTML from users; if unavoidable, sanitize with DOMPurify.                                                                                |
| Calling axios / fetch directly                                                           | Go through `services/api.ts`.                                                                                                                         |
| Storing base64 data URIs in project fields                                               | Use `projectsApi.uploadReference(projectId, file)` → backend stores file in `static/references/` → returns URL path. DB only stores path, not base64. |
| Reading from a Zustand store inside a deep ref / class                                   | Use the hook in a function component.                                                                                                                 |
| Passing entire store objects as props                                                    | Pass the slice you need or use a selector.                                                                                                            |
| Full-subscription Zustand calls (`useStore()` without selector)                          | Use `useStore(useShallow(s => ({ field1, field2 })))` for precise subscriptions.                                                                      |
| Using emoji characters (↻✎✓★▸💡🔊⚠️) as UI icons                                         | Use `SvgIcon` component — emoji render inconsistently across OS, fail accessibility, can't be styled.                                                 |

---

## Accessibility

- Buttons and links use semantic elements (`<button>`, `<a>`), never `<div onClick>`.
- Iconic-only buttons need `aria-label`.
- Buttons that hide their text label on mobile with responsive utilities also need an `aria-label`; do not rely on text that is `hidden sm:inline` for the mobile accessible name.
- Modals announce themselves via `<dialog>`.
- Color is never the only signal of state — pair it with text or icon (e.g., `<ErrorMessage>` includes both icon and copy).

---

## Common Mistakes

1. **Forgetting to forward `className`** — callers can't override layout.
2. **Hardcoding strings inside variants** when the variant set already lives in a sibling component (e.g., redefining `"primary" | "secondary"` everywhere).
3. **Calling `onClick` synchronously and bypassing the Button's debounce** — the wrapper should `await onClick?.(e)`; if it returns `void`, that's still fine.
4. **Importing `react`'s `useState` from a wildcard** — use named imports.
5. **Using `useState(initial)` where `useRef` would do** — re-renders with no purpose.
6. **Using emoji in JSX** — use `SvgIcon` component instead (see `LUCIDE_PATHS` in SvgIcon.tsx). Zero emoji in production code.
7. **Full-subscription Zustand** — always use `useShallow` selector to prevent unnecessary re-renders on unrelated state changes.

---

## Panel Drawers

- **AssetDrawer** (`components/panels/AssetDrawer.tsx`): Global asset library. Grid display, supports delete. API: `assetsApi` service.
- **HistoryDrawer** (`components/panels/HistoryDrawer.tsx`): Conversation history per run. Groups by run, shows agent/user messages.
- **ChatDrawer** (`components/chat/ChatDrawer.tsx`): Active conversation during generation. Opens automatically on `awaitingConfirm` in manual mode.
- TopBar has icon+text tab buttons for 资产库 and 历史记录 that toggle these drawers.

---

## Examples

- Button with variants + async-click debounce + native HTML props: `app/components/ui/Button.tsx`.
- Variant-styled modal: `app/components/ui/ConfirmModal.tsx`.
- Top-level error boundary: `app/components/ui/ErrorBoundary.tsx`.
- Canvas section composite: `app/components/canvas/InfiniteCanvas.tsx` (+ tests).
- Sensitive input with reveal flow: `app/components/settings/ConfigInput.tsx`.
- Page wiring lazy-loaded routes: `app/App.tsx`.

---

## Sensitive Input Reveal Flow (ConfigInput)

`ConfigInput.tsx` handles sensitive config fields (API keys, tokens) with a reveal/hide toggle.

### Contract

1. **Initial state**: `isRevealed=false`, input shows masked value (e.g., `sk-a******key`) from `formState`.
2. **Reveal click**: calls `configApi.revealValue(key)` → gets real value → sets `isRevealed=true` → **syncs real value to `formState` via `onChange` synthetic event**.
3. **After reveal**: input shows `value` prop (from `formState`, now the real value). User can edit.
4. **Hide click**: sets `isRevealed=false`. Input still shows `value` prop (the edited value, not the original masked value).
5. **Save**: `formState` contains the edited real value → sent to `configApi.update()`.

### Critical: Reveal must sync to formState

When revealing, the component must call `onChange` with a synthetic event to update `formState[key]`:

```tsx
const result = await configApi.revealValue(item.key);
setIsRevealed(true);
// MUST sync to formState so editing works
if (result.value !== null) {
  onChange({
    target: { name: item.key, value: result.value },
  } as React.ChangeEvent<HTMLInputElement>);
}
```

**Why**: Without this sync, `formState[key]` remains the masked value. The input displays `revealedValue` (local state) but edits go to `formState` — a desync that makes editing invisible.

### Display value logic

```tsx
// Correct: always use value prop (formState), not local revealedValue
const displayValue = isRevealed ? value : isMasked ? value : "••••••••";
```

**Wrong**: `const displayValue = isRevealed ? revealedValue : ...` — this decouples display from formState, breaking controlled input behavior.

### Test pattern

Tests must simulate the controlled component flow:

```tsx
let currentValue = "sk-a******key";
const onChange = vi.fn((e) => {
  currentValue = e.target.value;
});
const { rerender } = render(
  <ConfigInput value={currentValue} onChange={onChange} />,
);

// Reveal
await user.click(eyeButton);
await waitFor(() => expect(onChange).toHaveBeenCalled());

// Simulate parent re-render with updated value
rerender(<ConfigInput value={currentValue} onChange={onChange} />);

// Now editing works
await user.clear(screen.getByDisplayValue("sk-actual-key"));
```
