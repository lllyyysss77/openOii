# Quality Guidelines

> Code standards, formatting, type-checking, and forbidden patterns for the backend.

---

## Tooling

- **Package manager**: `uv` (always — never `pip install`).
- **Linter / formatter**: `ruff` (`uv run ruff check app tests`).
- **Test runner**: `pytest` with `asyncio_mode = "auto"` (`uv run pytest`).
- **Python**: `>=3.10`, `target-version = "py310"`. Use `from __future__ import annotations` for forward refs in pre-3.10-compatible style.

Config lives in `backend/pyproject.toml`:

```toml
[tool.ruff]
line-length = 100
target-version = "py310"

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
pythonpath = ["."]
filterwarnings = [
  "error::pytest.PytestUnraisableExceptionWarning",
  "error:coroutine .* was never awaited:RuntimeWarning",
]
```

---

## Pre-commit Checklist

Before declaring backend work done, run from `backend/`:

```bash
uv run ruff check app tests
uv run pytest
```

Pytest is configured to fail on unraisable coroutine warnings and unawaited
coroutines. Treat these as real test failures, not harmless noise: they usually
mean a fixture leaked an async connection, hit a real global engine, or created a
coroutine without awaiting/closing it.

For a focused test run during iteration:

```bash
uv run pytest tests/test_api/test_<module>.py -q
```

If you change dependencies, regenerate the lockfile:

```bash
uv sync
```

The `Dockerfile` runs `uv sync --frozen --no-dev --extra agents`, so `uv.lock` must be in sync with `pyproject.toml`.

---

## Required Patterns

### Type hints everywhere

All public functions, route handlers, and service entry points must be typed. The codebase uses PEP 604 unions (`str | None`, not `Optional[str]`) consistently in new code.

```python
async def get_project(project_id: int, session: AsyncSession = SessionDep) -> ProjectRead:
    ...
```

### Async by default

I/O-bound code is async. Sync helpers exist only for CPU-bound utilities (e.g., path normalization in `services/file_cleaner.py`).

### Explicit imports

- `from app.<module> import <name>` — absolute imports, rooted at `app`.
- No `from app.module import *`.
- Within a model file, import from siblings via `from typing import TYPE_CHECKING` + string forward refs to avoid circular imports.

### Docstrings on public service entry points

Top-level service functions get a one-liner docstring. Routes and trivial helpers don't need one — the route decorator + Pydantic schema already document the contract.

### Settings access via DI

Use `SettingsDep` (from `app.api.deps`) inside routes. Inside `get_settings()`-aware code paths (workers, services), call `get_settings()` directly. **Do not** instantiate `Settings()` at module import time outside of tests.

---

## Forbidden Patterns

| Pattern                                                               | Why                                                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Bare `except:`                                                        | Hides KeyboardInterrupt / SystemExit. Catch specific exceptions.                                                   |
| Empty `except Exception: pass`                                        | Silent failure. The only acceptable case is a final-WS-send that we know may fail because the client disconnected. |
| `print(...)` for diagnostics                                          | Use `logger`. `print` ends up in stdout without level / context.                                                   |
| `# type: ignore` without a reason                                     | If you must use it, add a comment: `# type: ignore[...]  # reason`.                                                |
| `os.getenv("FOO")` inside business code                               | Add a field to `Settings` and access via `settings.foo`.                                                           |
| Sync HTTP calls in request path (`requests`, blocking `httpx.Client`) | Use `httpx.AsyncClient` or `aiohttp`.                                                                              |
| Sync DB calls in request path                                         | Async sessions only.                                                                                               |
| Importing `app.api.*` from `app/services/*`                           | Services must be HTTP-agnostic.                                                                                    |
| Top-level side effects in modules                                     | Modules should only declare; effects belong in `lifespan` / explicit init.                                         |
| Catching exception and re-raising as `HTTPException` from a service   | Use `AppException` subclasses; let routes / global handler do HTTP.                                                |
| Hardcoded magic strings repeated in 3+ places                         | Lift to a constant or enum.                                                                                        |
| Defining local `utcnow()` in any module                               | Use `from app.db.utils import utcnow` — single canonical source.                                                   |
| Using LLM for deterministic routing decisions                         | Use `app.agents.review_rules` — rule-based validation/routing; reserve LLM calls for creative tasks only.          |

---

## Mocking and Tests

- Tests live in `backend/tests/`, mirroring the source tree.
- Use the fixtures in `backend/tests/conftest.py`:
  - `test_settings` — pure `Settings(...)` instance with sqlite in-memory DB and stub provider keys.
  - `test_session` — ephemeral `AsyncSession` against in-memory sqlite, schema created via `SQLModel.metadata.create_all`.
  - `StubWsManager` — captures events to `self.events` for assertions.
- HTTP assertions use `httpx.AsyncClient` with `ASGITransport(app=...)`.
- Inject test deps by overriding FastAPI deps:

  ```python
  app.dependency_overrides[get_db_session] = lambda: session
  app.dependency_overrides[get_app_settings] = lambda: test_settings
  app.dependency_overrides[get_ws_manager] = lambda: stub_ws
  ```

- For async work, prefer `pytest_asyncio.fixture` over manual event-loop juggling. `asyncio_mode = "auto"` means test functions can be `async def` directly without `@pytest.mark.asyncio`.

### Cross-layer API contract tests

When a backend Pydantic schema is mirrored by a frontend DTO, add an executable
contract test instead of relying on manual review. Current examples:

- `backend/tests/test_schemas/test_project_contract.py` verifies
  `ProjectUpdate.model_fields` matches `frontend/app/types/index.ts`
  `UpdateProjectPayload` plus `ProjectProviderOverridesPayload`.
- `backend/tests/test_schemas/test_ws_events.py` verifies backend and frontend
  WebSocket event type unions stay identical.

If a backend schema intentionally has fields the frontend cannot send, document
that exception in the test with an explicit allowlist and reason.

### Parent-scoped resource ownership

Routes with parent ids in the path must verify child-resource ownership, even
when the child id looks unguessable.

```python
@router.get("/{project_id}/export/{export_id}/status")
async def get_export_status(project_id: int, export_id: str):
    export_resp = await _get_export_status(export_id)
    if not export_resp or export_resp.project_id != project_id:
        raise HTTPException(status_code=404, detail="Export task not found")
    return export_resp
```

For async/cache-backed workflows, include the parent id in the cached response
schema. `ExportResponse.project_id` is required so the status endpoint can
validate `/projects/{project_id}/...` instead of trusting `export_id` alone.
Add a regression test that the owning parent returns 200 and a different parent
returns 404.

---

## Coverage Configuration for Async Tests

**Critical**: ASGITransport runs request handlers in an anyio thread pool where the coverage tracer doesn't follow by default. Without the concurrency config, coverage for route closure paths (`generation.py` `_task()`, background tasks) shows 0% even though tests pass.

Add to `backend/pyproject.toml`:

```toml
[tool.coverage.run]
concurrency = ["thread", "greenlet"]
```

This is required for any test that exercises `httpx.AsyncClient(ASGITransport(app=...))` request paths.

---

## Testing Gotchas

### 1. WebSocket stub must throw `WebSocketDisconnect`, not `RuntimeError`

When writing test stubs for WebSocket `receive_json()`, the stub must throw `WebSocketDisconnect` when messages are exhausted — **not** `RuntimeError` or `StopAsyncIteration`.

**Why**: `app/main.py` WebSocket handler has `except Exception` as a catch-all that re-enters the `while True` loop. Only `WebSocketDisconnect` triggers the clean `break` path. A `RuntimeError` stub causes an infinite loop that consumes 7GB+ memory.

```python
# Wrong — causes infinite loop
async def fake_receive_json():
    if not messages:
        raise RuntimeError("no more messages")

# Correct — clean exit
from starlette.websockets import WebSocketDisconnect
async def fake_receive_json():
    if not messages:
        raise WebSocketDisconnect(code=1000)
```

### 2. `asyncio.sleep` stubs must return coroutines, not `None`

When monkeypatching `asyncio.sleep`, lambda stubs return `None` which is not awaitable:

```python
# Wrong — TypeError: object NoneType can't be used in 'await' expression
monkeypatch.setattr(asyncio, "sleep", lambda _: None)

# Correct — return an awaitable coroutine
async def immediate_sleep(_):
    pass
monkeypatch.setattr(asyncio, "sleep", immediate_sleep)
```

### 3. Monkeypatch target must be the import location, not the source

When patching functions called by the code under test, patch where they're **imported**, not where they're defined:

```python
# Wrong — patching the source module
monkeypatch.setattr("app.services.llm.probe_text_provider", fake_probe)

# Correct — patching where orchestrator.py actually imports it
monkeypatch.setattr("app.agents.orchestrator.probe_text_provider", fake_probe)
```

### 4. `AgentMessage` lives in `app.models.agent_run`, not `app.models.message`

The `AgentMessage` SQLModel is co-located with `AgentRun` in `app/models/agent_run.py`. Don't import from `app.models.message` — that module doesn't exist.

```python
# Wrong
from app.models.message import AgentMessage

# Correct
from app.models.agent_run import AgentMessage
```

### 5. `FakeSession` with multiple query results

When a test needs `session.execute()` to return different results for different queries, use a `scalars_result` parameter:

```python
class FakeSession:
    def __init__(self, ..., scalars_result=None):
        self.scalars_result = scalars_result

    async def execute(self, statement):
        return FakeResult(rows=self.scalars_result or self.rows)
```

This is needed for orchestrator tests where `_wait_for_confirm` queries `AgentMessage` after the main `Project`/`AgentRun` lookups.

### 6. Provider resolution probe cache causes test interference

`probe_text_provider()` caches results by `provider + base_url + model + endpoint`. When multiple tests use the same settings, the second test returns the cached result **without calling TextService**, so monkeypatched DummyTextService constructors are never invoked.

**Fix**: Use different `text_base_url` / `text_model` values for each test, or clear the cache between tests.

```python
# Wrong — same URL/model as previous test, cache hit
settings = Settings(text_base_url="https://text.example.com", text_model="gpt-test", ...)

# Correct — unique URL to avoid cache collision
settings = Settings(text_base_url="https://slow-proxy.example.com", text_model="gpt-slow-test", ...)
```

### 7. Don't call autouse fixtures directly

When a fixture is defined with `@pytest.fixture(autouse=True)`, it runs automatically for every test in the module. Calling it directly (e.g., `_stub_async_provider_resolution(monkeypatch)`) raises `FixtureCalledDirectlyError`.

```python
# Wrong — calling autouse fixture directly
@pytest.mark.asyncio
async def test_something(async_client, monkeypatch):
    _stub_async_provider_resolution(monkeypatch)  # FixtureCalledDirectlyError

# Correct — rely on autouse, or make it a non-autouse fixture and inject it
@pytest.mark.asyncio
async def test_something(async_client):
    # autouse fixture already applied
```

### 8. Mock stores must include all new methods

When mocking Zustand stores in frontend tests, the mock object must include **every method** the component under test calls. Missing methods cause `TypeError: store.method is not a function` at render time.

```typescript
// Wrong — missing setProjectStoryOutline
const storeState = {
  setRunMode: vi.fn(),
};

// Correct — include all new editorStore methods
const storeState = {
  setRunMode: vi.fn(),
  setProjectStoryOutline: vi.fn(),
  setProjectVisualBible: vi.fn(),
  setProjectOutlineApproved: vi.fn(),
};
```

This commonly happens after feature additions add new store methods — the test mock must be updated to match.

### 9. Isolate global async DB engine in `init_db()` tests

`app.db.session.init_db()` owns the real module-level `engine`. Tests that
exercise fallback paths must not accidentally call the real global engine after
patching only `async_session_maker`; that can produce unraisable async cleanup
warnings such as `coroutine Connection._cancel was never awaited`.

Patch the full init surface when the test is about init logic rather than the
database driver:

```python
with patch("app.db.session.get_settings", return_value=test_settings), \
     patch("app.db.session._run_alembic_upgrade"), \
     patch("app.db.session.engine", _NoopEngine()), \
     patch("app.db.session._sync_missing_metadata_columns"), \
     patch("app.db.session.async_session_maker", _mock_session_maker(test_session)), \
     patch("app.db.session.ensure_postgres_checkpointer_setup"):
    await init_db()
```

If a warning appears only in full-suite runs, rerun with:

```bash
uv run pytest -q -W error::RuntimeWarning -W error::pytest.PytestUnraisableExceptionWarning
```

---

## Refactoring Discipline

Bug fixes and feature work should be **surgical**:

- Touch only the files needed for the change.
- Don't rewrite unrelated comments / formatting / variable names.
- Don't introduce a new abstraction layer "for future flexibility" without a concrete second use case in this PR.
- Cleanups go in their own commit / PR (`chore:` or `refactor:`), not riding on a feature.

If you spot dead code, leave a `# TODO(<name>): unused, candidate for removal` rather than deleting in the same change.

---

## Common Mistakes

1. **Forgetting `# noqa: F401` after adding a new SQLModel** — breaks `init_db()` because the model isn't registered before `create_all`.
2. **Comparing tz-aware vs tz-naive datetimes** in queries. Use `from app.db.utils import utcnow` — never define a local `utcnow()`.
3. **Reading `.env` from a test by instantiating `Settings()`**. The `Settings` class is configured _not_ to auto-read `.env`; only `get_settings()` does. Tests should pass values explicitly.
4. **Importing models inside `app/db/session.py:init_db` lazily and not adding the top-level `noqa` import** — schema misses tables.
5. **Calling `await session.commit()` inside a service that the caller already commits**. Pick one layer to own the transaction; for routes the caller (route) owns it; for `delete_project_by_id` the service owns it because it does multi-step cascade.
6. **Saving empty string to DB instead of deleting the row** — `config_service.upsert_configs` treats `""` as "delete", not "set to empty". If you want to clear a config value, pass `""` and the service deletes the DB row (falling back to `.env` value). Don't save empty strings to `configitem`.

---

## Examples

- Clean route module: `app/api/v1/routes/projects.py`.
- Clean service module: `app/services/project_deletion.py`.
- CPU-bound service with lazy init: `app/services/face_cropper.py` (InsightFace singleton, graceful fallback on import failure).
- Test module shape: `backend/tests/test_api/test_projects.py` (look for fixture overrides).
- Conftest patterns: `backend/tests/conftest.py`.

---

## External ML Dependencies (InsightFace pattern)

When adding CPU-bound ML dependencies (e.g., `insightface`, `onnxruntime`):

1. **Lazy singleton init** — don't import at module level. Use a module-level `_APP = None` + `_INIT_ATTEMPTED = False` pattern:

   ```python
   _FACE_ANALYSIS_APP = None
   _INIT_ATTEMPTED = False

   def _get_face_analysis():
       global _FACE_ANALYSIS_APP, _INIT_ATTEMPTED
       if _FACE_ANALYSIS_APP is not None:
           return _FACE_ANALYSIS_APP
       if _INIT_ATTEMPTED:
           return None
       _INIT_ATTEMPTED = True
       try:
           from insightface.app import FaceAnalysis
           app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
           app.prepare(ctx_id=-1, det_size=(640, 640))
           _FACE_ANALYSIS_APP = app
           return app
       except Exception as e:
           logger.warning("Failed to init InsightFace: %s", e)
           return None
   ```

2. **Graceful fallback** — if the ML dependency fails to load, the calling code must fall back to a simpler approach (e.g., full-body image concatenation instead of face cropping).
3. **Docker pre-download** — add a `RUN` step in Dockerfile to pre-download models at build time:
   ```dockerfile
   RUN uv run python -c "from app.services.face_cropper import _get_face_analysis; _get_face_analysis()" || true
   ```
4. **System deps** — opencv-python-headless needs `libgl1` and `libglib2.0-0` in the Dockerfile.
5. **`uv sync` picks them up** — add to `pyproject.toml` dependencies, not a separate requirements file.

---

## Config Service: Empty Value Delete Contract

`config_service.upsert_configs()` has specific behavior for empty values:

| Input            | DB State                     | Behavior                                |
| ---------------- | ---------------------------- | --------------------------------------- |
| `"actual_value"` | exists                       | Update value                            |
| `"actual_value"` | not exists                   | Create new row                          |
| `""`             | exists                       | **Delete DB row** (fall back to `.env`) |
| `""`             | not exists                   | Skip (don't create empty row)           |
| `"******"`       | exists with value `"secret"` | Skip (masked input detected)            |
| `None`           | any                          | Skip                                    |

This enables the frontend "clear sensitive field" flow: user empties input → saves `""` → backend deletes DB row → next `list_effective` shows `.env` value (or nothing if not in `.env`).
