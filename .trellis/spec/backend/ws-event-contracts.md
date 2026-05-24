# WS Event Contracts

> Executable contracts for WebSocket event schema alignment between backend and frontend.

---

## 1. Scope / Trigger

- Any change to a WS event payload (new field, removed field, type change)
- Any new WS event type
- Any change to `_EVENT_DATA_MODELS` or `WsEventType` in `app/schemas/ws.py`
- Any new `send_event` call in orchestrator/agents

---

## 2. Architecture

### Cast Pipeline

```
orchestrator/agent calls send_event(project_id, dict)
  → ConnectionManager.send_event()
    → WsEvent.model_validate(dict)          # strips unknown top-level keys
    → if event_type in _EVENT_DATA_MODELS:
        data_model.model_validate(event.data)  # strips unknown data fields
        event.data = data_model.model_dump(mode="json")
    → broadcast to connected clients
```

**Key behavior**: Pydantic `model_validate` with default config (`extra="ignore"`) **silently drops** fields not defined in the model. This means:

- If orchestrator sends `{"project_id": 1, "stage": "plan", "run_id": 5}` but `RunStartedEventData` only defines `run_id`, then `project_id` and `stage` are **silently dropped** before reaching the frontend.
- If an event type is NOT in `_EVENT_DATA_MODELS`, the raw dict passes through **unvalidated** — all fields survive.

### Three-Way Contract

| Layer        | File                                                | Responsibility                 |
| ------------ | --------------------------------------------------- | ------------------------------ |
| **Producer** | `orchestrator.py`, `base.py`, `nodes.py`, agents    | Sends dict with correct fields |
| **Schema**   | `app/schemas/ws.py` `_EVENT_DATA_MODELS`            | Validates/strips fields        |
| **Consumer** | `frontend/app/hooks/useWebSocket.ts` `applyWsEvent` | Reads `event.data` fields      |

**All three must agree on field names and types.** A mismatch at any layer causes silent data loss.

---

## 3. Signatures

### Backend Schema (Pydantic)

```python
# app/schemas/ws.py
WsEventType = Literal[
    "connected", "pong", "echo", "error",
    "run_started", "run_progress", "run_message", "agent_thinking",
    "run_completed", "run_failed",
    "run_awaiting_confirm", "run_confirmed", "run_cancelled",
    "character_created", "character_updated", "character_deleted",
    "shot_created", "shot_updated", "shot_deleted",
    "outline_updated",
    "project_updated", "data_cleared",
    "critique_result", "bible_updated",
    "version_created", "version_rollback",
    "audio_generated", "export_completed",
    "consistency_eval_completed",
]

_EVENT_DATA_MODELS: dict[str, type[BaseModel]] = {
    "run_started": RunStartedEventData,
    "run_progress": RunProgressEventData,
    "run_message": RunMessageEventData,
    "agent_thinking": AgentThinkingEventData,
    "run_completed": RunCompletedEventData,
    "run_failed": RunFailedEventData,
    "run_awaiting_confirm": RunAwaitingConfirmEventData,
    "run_confirmed": RunConfirmedEventData,
    "run_cancelled": RunCancelledEventData,
    "character_created": CharacterCreatedEventData,
    "character_updated": CharacterUpdatedEventData,
    "character_deleted": CharacterDeletedEventData,
    "shot_created": ShotCreatedEventData,
    "shot_updated": ShotUpdatedEventData,
    "shot_deleted": ShotDeletedEventData,
    "outline_updated": OutlineUpdatedEventData,
    "project_updated": ProjectUpdatedEventData,
    "data_cleared": DataClearedEventData,
    "critique_result": CritiqueResultEventData,
    "bible_updated": BibleUpdatedEventData,
    "version_created": VersionCreatedEventData,
    "version_rollback": VersionRollbackEventData,
    "audio_generated": AudioGeneratedEventData,
    "export_completed": ExportCompletedEventData,
    "consistency_eval_completed": ConsistencyEvalCompletedEventData,
}
```

### Frontend Types (TypeScript)

```typescript
// frontend/app/types/index.ts
export type WsEventType =
    | "connected" | "pong" | "echo" | "error"
    | "run_started" | "run_progress" | "run_message" | "agent_thinking"
    | "run_completed" | "run_failed"
    | "run_awaiting_confirm" | "run_confirmed" | "run_cancelled"
    | "character_created" | "character_updated" | "character_deleted"
    | "shot_created" | "shot_updated" | "shot_deleted"
    | "outline_updated"
    | "project_updated" | "data_cleared"
    | "critique_result" | "bible_updated"
    | "version_created" | "version_rollback"
    | "audio_generated" | "export_completed"
    | "consistency_eval_completed";
```

> **Contract guard**: Backend and frontend `WsEventType` unions must stay identical.
> `backend/tests/test_schemas/test_ws_events.py::TestWsEventSchemaRegistry::test_backend_and_frontend_ws_event_type_unions_match`
> parses `frontend/app/types/index.ts` and fails if either side drifts.

---

## 4. New Event Types (from Feature Work)

### Critique Result (`critique_result`)

Emitted after CriticAgent reviews generated images.

```python
class CritiqueResultEventData(BaseModel):
    score: float                        # Overall score 0-10
    dimensions: dict[str, int]          # {"consistency": N, "quality": N, "composition": N}
    issues: list[str]                   # Described problems
    suggestions: list[str]              # Improvement suggestions
    entity_type: str                    # "character" or "shot"
    entity_id: int = 0                  # Specific entity reviewed
    will_regenerate: bool               # Whether images will be regenerated
```

**Frontend handler**: Shows critique scores and regeneration status in chat panel.

### Bible Updated (`bible_updated`)

Emitted when character bible (visual notes, reference images, embedding) is updated.

```python
class BibleUpdatedEventData(BaseModel):
    character_id: int
    visual_notes: bool = False          # Whether visual_notes changed
    reference_images_count: int = 0
    has_embedding: bool = False
```

**Frontend handler**: Shows info toast about character bible update.

### Version Created (`version_created`)

Emitted when an artifact version snapshot is created.

```python
class VersionCreatedEventData(BaseModel):
    entity_type: str    # "character" or "shot"
    entity_id: int
    version: int        # Incremental version number
    trigger: str        # "generation" | "feedback" | "manual" | "rollback"
```

### Version Rollback (`version_rollback`)

Emitted after a version rollback is applied.

```python
class VersionRollbackEventData(BaseModel):
    entity_type: str
    entity_id: int
    from_version: int
    to_version: int
```

### Audio Generated (`audio_generated`)

Emitted after TTS/BGM is generated for a shot.

```python
class AudioGeneratedEventData(BaseModel):
    shot_id: int
    tts_url: str | None = None
    bgm_type: str | None = None
    duration: float | None = None
```

### Export Completed (`export_completed`)

Emitted when an async PDF/Webtoon export finishes.

```python
class ExportCompletedEventData(BaseModel):
    export_id: str
    format: str            # "pdf" or "webtoon"
    download_url: str | None = None
    status: str            # "completed" or "failed"
    error: str | None = None
```

**Frontend handler**: Shows success toast with download link.

### Consistency Eval Completed (`consistency_eval_completed`)

Emitted after consistency evaluation is triggered (async).

```python
class ConsistencyEvalCompletedEventData(BaseModel):
    project_id: int
    overall_score: float
    character_count: int
```

**Frontend handler**: Shows info toast with overall score.

### Agent Thinking (`agent_thinking`)

Emitted during agent execution to show thinking chain steps.

```python
class AgentThinkingEventData(BaseModel):
    agent: str             # "outline" | "plan" | "render" | "compose" | "critic"
    phase: str             # "reasoning" | "decision" | "planning" | "reviewing"
    content: str
    details: str | None = None
```

**Also emitted as**: `run_message` with `role="thinking"` for backward compatibility.

---

## 5. Contracts

### Adding a New Field to an Existing Event

**Steps (order matters):**

1. Add field to Pydantic model in `app/schemas/ws.py` (with default for backward compat)
2. Add field to orchestrator/agent `send_event` call
3. Add field to frontend TypeScript interface in `frontend/app/types/index.ts`
4. Use field in frontend `applyWsEvent` handler

**Wrong**: Adding to orchestrator without updating schema → field silently dropped.
**Wrong**: Adding to schema without adding to orchestrator → field always None/default.

### Adding a New Event Type

**Steps:**

1. Add to `WsEventType` Literal in `app/schemas/ws.py`
2. Create Pydantic data model in `app/schemas/ws.py`
3. Register in `_EVENT_DATA_MODELS` dict
4. Add to frontend `WsEventType` union in `types/index.ts`
5. Add `case` in frontend `applyWsEvent` handler in `useWebSocket.ts`
6. Send from orchestrator/agent
7. Add/extend backend schema registry tests in `backend/tests/test_schemas/test_ws_events.py`
8. Add/extend frontend consumer tests in `frontend/app/hooks/useWebSocket.test.ts`

### Removing an Event Type (Dead Event)

**Steps:**

1. Remove from backend `WsEventType` Literal
2. Remove or intentionally keep the data model in `_EVENT_DATA_MODELS`
3. Update frontend `WsEventType` union to match backend
4. Remove or intentionally keep the frontend `case` handler
5. Update `test_backend_and_frontend_ws_event_type_unions_match`

**Important**: Do not leave a backend/frontend union mismatch as "harmless dead code";
the executable contract now rejects drift unless the test is intentionally updated with
an explicit compatibility exception.

---

## 6. Validation & Error Matrix

| Scenario                                          | Result                              | Detection                                 |
| ------------------------------------------------- | ----------------------------------- | ----------------------------------------- |
| Orchestrator sends field not in Pydantic model    | Field silently dropped              | Cast output ≠ input                       |
| Pydantic model has field orchestrator never sends | Field always None/default           | Frontend reads undefined                  |
| Event type not in `_EVENT_DATA_MODELS`            | Raw dict passes through unvalidated | All fields survive (may have wrong types) |
| Event type not in frontend `WsEventType`          | TypeScript compile error            | `tsc --noEmit`                            |
| Frontend reads field that was dropped by cast     | `undefined` at runtime              | No error, silent wrong behavior           |
| Frontend missing `case` handler for new event     | Event ignored silently              | No toast/update shown                     |
| Backend/frontend `WsEventType` unions drift       | Contract test failure               | `test_backend_and_frontend_ws_event_type_unions_match` |
| `_EVENT_DATA_MODELS` points to wrong schema       | Contract test failure               | `test_event_registry_points_to_expected_schema` |

---

## 7. Good / Bad Cases

### Good: Adding `project_id` to `RunStartedEventData`

```python
# Schema
class RunStartedEventData(BaseModel):
    run_id: int
    project_id: int | None = None  # ← add with default
    ...

# Orchestrator
await self.ws.send_event(project_id, {
    "type": "run_started",
    "data": {"run_id": run_id, "project_id": project_id, ...}
})

# Frontend
export interface RunStartedEventData {
    run_id: number;
    project_id?: number;  // ← add optional
    ...
}
```

### Bad: Adding field only to orchestrator

```python
# Orchestrator sends it
{"type": "run_started", "data": {"run_id": 1, "project_id": 1}}

# But schema doesn't have it → silently dropped
class RunStartedEventData(BaseModel):
    run_id: int
    # project_id missing!

# Frontend reads it → always undefined
event.data.project_id  // undefined
```

### Bad: Adding event type without frontend handler

```python
# Backend emits critique_result
await ws.send_event(pid, {"type": "critique_result", "data": {...}})

# Frontend WsEventType includes it but applyWsEvent has no case
# → event received but no UI update shown
# → user sees "completed" status but no critique feedback
```

---

## 8. Tests Required

### Schema Roundtrip Test

```python
def test_run_started_event_data_preserves_all_fields():
    data = {"run_id": 1, "project_id": 5, "stage": "plan", "current_agent": "plan"}
    result = RunStartedEventData.model_validate(data)
    dumped = result.model_dump(mode="json")
    assert dumped["project_id"] == 5
    assert dumped["stage"] == "plan"
```

### Cast Pipeline Test

```python
def test_cast_event_data_preserves_registered_fields():
    event = {"type": "run_started", "data": {"run_id": 1, "project_id": 5}}
    cast = _cast_event_data(event)
    assert cast["data"]["project_id"] == 5
```

### New Event Type Registration Test

```python
def test_all_ws_event_types_have_data_models():
    """Every WsEventType value must have a corresponding _EVENT_DATA_MODELS entry."""
    event_types = get_args(WsEventType)
    for et in event_types:
        assert et in _EVENT_DATA_MODELS, f"Missing data model for event type: {et}"
```

### Backend / Frontend Union Sync Test

`backend/tests/test_schemas/test_ws_events.py` reads `frontend/app/types/index.ts`
and compares the frontend `WsEventType` union with backend `WsEventType`.
When adding/removing an event, update both sides in the same change.

```python
def test_backend_and_frontend_ws_event_type_unions_match():
    frontend_types = _frontend_ws_event_types()
    backend_types = set(get_args(WsEventType))
    assert frontend_types == backend_types
```

### Registry Schema Test

Each registered event type must point to the expected Pydantic data model.
This catches accidental copy/paste mappings such as `character_updated`
using `CharacterCreatedEventData`.

```python
@pytest.mark.parametrize(("event_type", "model"), [...])
def test_event_registry_points_to_expected_schema(event_type, model):
    assert _EVENT_DATA_MODELS[event_type] is model
```

### Frontend Handler Coverage Test

```python
# For every new user-visible event type, add a frontend applyWsEvent test.
# Current coverage includes agent_thinking, critique_result, version_created,
# version_rollback, audio_generated, bible_updated, export_completed, and
# consistency_eval_completed.
```

---

## 9. Wrong vs Correct

### Wrong: Assuming extra fields survive cast

```python
# Developer adds "metadata" to event data
await ws.send_event(pid, {"type": "run_completed", "data": {
    "run_id": 1, "metadata": {"key": "value"}
}})
# RunCompletedEventData doesn't have "metadata"
# → silently dropped, frontend never sees it
```

### Correct: Add to schema first

```python
class RunCompletedEventData(BaseModel):
    run_id: int | None = None
    metadata: dict[str, Any] | None = None  # ← add here first
```

### Wrong: Exposing sensitive data via WS events

```python
# SharedCharacterRead exposes full face_embedding (512 floats)
class SharedCharacterRead(BaseModel):
    face_embedding: list[float]  # ← data leak, useless for frontend
```

### Correct: Use computed boolean flag

```python
class SharedCharacterRead(BaseModel):
    has_embedding: bool = False  # ← computed via model_validator

    @model_validator(mode="before")
    @classmethod
    def _compute_has_embedding(cls, values):
        emb = values.get("face_embedding")
        values["has_embedding"] = emb is not None and len(emb) > 0
        return values
```

---

## Anti-Patterns

### Don't: Send fields without schema registration

```python
# Don't add fields to send_event without updating the Pydantic model
await ws.send_event(pid, {"type": "run_started", "data": {"new_field": "value"}})
# If RunStartedEventData doesn't have new_field → silently lost
```

### Don't: Use `event.data` as raw dict without type narrowing

```typescript
// Don't cast blindly
const data = event.data as any; // no type safety

// Do use typed interface
const data = event.data as RunProgressEventData;
```

### Don't: Forget to add frontend handler for new events

```typescript
// Adding a new event type to WsEventType union without a case handler
// means the event is received but never displayed or acted upon.
// Always add a case in applyWsEvent for every new event type.
```

---

## Common Mistakes

1. **Adding WS event type but no data model in `_EVENT_DATA_MODELS`** — raw dict passes through unvalidated; field names/shape may drift.
2. **Adding data model but forgetting frontend `applyWsEvent` handler** — event received but no UI update.
3. **Exposing large internal data structures** (e.g., 512-dim face_embedding vectors) through WS events — bandwidth waste and potential security leak. Use computed boolean flags instead.
4. **Removing event type from Literal but not from `_EVENT_DATA_MODELS`** — stale messages from older backend versions cause validation errors. Keep the data model for backward compat.
