# Database Guidelines

> ORM patterns, queries, sessions, and migrations for the backend.

---

## Overview

- **ORM**: SQLModel (Pydantic + SQLAlchemy 2.x).
- **Driver**: async — `asyncpg` for PostgreSQL (default), `aiosqlite` for tests.
- **Default URL**: `postgresql+asyncpg://openoii:openoii_dev@localhost:5432/openoii` (overridable via `DATABASE_URL`).
- **Session entry**: `app/db/session.py` — `engine`, `async_session_maker`, `get_session`, `init_db`.
- **DI dep**: `from app.api.deps import SessionDep` → `AsyncSession = SessionDep`.
- **Migrations**: Alembic at `backend/alembic/versions/`. `init_db()` also runs `SQLModel.metadata.create_all` for dev/test bootstrapping.

---

## Models (SQLModel)

Defined per resource in `app/models/<resource>.py`. Every new model file must be imported in `app/db/session.py`'s `init_db` import block (the `# noqa: F401` line) so `create_all` registers it.

### Current Model Inventory (18 tables)

| Model                  | File                        | Key Columns / Notes                                      |
| ---------------------- | --------------------------- | -------------------------------------------------------- |
| `AgentRun`             | `agent_run.py`              | thread_id, status, provider_snapshot                     |
| `AgentMessage`         | `agent_run.py`              | role, content, agent_name, run_id FK                    |
| `Artifact`             | `artifact.py`              | file_path, artifact_type, run_id FK                     |
| `ArtifactVersion`      | `artifact_version.py`      | entity_type, entity_id, version, snapshot (JSON), trigger |
| `Asset`                | `asset.py`                 | asset_type, image_url, metadata_json, tags              |
| `Character`            | `project.py`               | reference_images (JSON), face_embedding (Text), visual_notes, project_id FK |
| `ConfigItem`           | `config_item.py`           | key (unique), value, source, is_sensitive               |
| `ConsistencyReport`    | `consistency_report.py`    | project_id FK, overall_score, grade, character_reports (JSON) |
| `Message`              | `message.py`               | role, content, project_id FK                             |
| `Project`              | `project.py`               | story_outline (JSON), visual_bible, outline_approved, exports (JSON), universe_id FK |
| `Run`                  | `run.py`                   | project_id FK, status                                    |
| `Shot`                 | `project.py`               | tts_url, bgm_type, character_ids (JSON), project_id FK   |
| `ShotCharacterBinding` | `project.py`               | shot_id FK, character_id FK                              |
| `Stage`                | `stage.py`                 | run_id FK, stage_name, status                            |
| `StyleTemplate`        | `style_template.py`        | slug (unique), category, style_prompt, negative_prompt   |
| `Universe`             | `universe.py`              | name, world_setting, style_rules                         |
| `SharedCharacter`      | `universe.py`              | universe_id FK, visual_notes, face_embedding (Text), canonical_image_url |
| `UniverseProjectLink`  | `universe.py`              | universe_id FK, project_id FK, chapter_number           |

### Pattern

```python
# app/models/project.py
from datetime import datetime, timezone
from typing import List, Optional
from sqlmodel import Field, Relationship, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Project(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    style: str = Field(default="anime")
    status: str = Field(default="draft")
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    shots: List["Shot"] = Relationship(
        back_populates="project",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
```

Conventions:

- Primary key: `id: Optional[int] = Field(default=None, primary_key=True)`.
- Timestamps: store **naive UTC** (`datetime.now(timezone.utc).replace(tzinfo=None)`). Do not store local time. The `utcnow()` helper exists per file — reuse it within the file rather than importing across models.
- Foreign keys: `Field(foreign_key="<table>.id", index=True)`.
- JSON columns: `Field(default_factory=list, sa_column=Column(JSON, nullable=False))`.
- Cascading relationships: `sa_relationship_kwargs={"cascade": "all, delete-orphan"}` for owned children (see `Project.shots`, `Project.characters`).

---

## Sessions

### In API routes

Always use the `SessionDep` injection — never instantiate `async_session_maker()` in a route.

```python
from app.api.deps import SessionDep
from sqlalchemy.ext.asyncio import AsyncSession

@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(project_id: int, session: AsyncSession = SessionDep):
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project
```

### In services

Services receive an `AsyncSession` as a parameter — they do not create their own session unless they need a separate transaction (e.g., the WebSocket handler in `main.py` opens a fresh `async_session_maker()` because it lives outside the request scope).

```python
async def delete_project_by_id(session: AsyncSession, project_id: int) -> None:
    ...
    await session.commit()
```

### Outside requests (background tasks, WS, init)

Use `async_session_maker()` directly:

```python
from app.db.session import async_session_maker

async with async_session_maker() as session:
    run = await session.get(AgentRun, run_id)
    await session.commit()
```

Examples: `app/main.py` (WebSocket confirm flow), `app/db/session.py:init_db()`.

---

## Queries

### Prefer `session.get()` for primary-key lookups

```python
project = await session.get(Project, project_id)
if not project:
    raise HTTPException(status_code=404, detail="Project not found")
```

### Use `select()` for filters and ordering

```python
from sqlalchemy import select
from sqlalchemy.orm import InstrumentedAttribute
from typing import cast

shot_project_id_col = cast(InstrumentedAttribute[int], cast(object, Shot.project_id))
shot_order_col = cast(InstrumentedAttribute[int], cast(object, Shot.order))

res = await session.execute(
    select(Shot)
    .where(shot_project_id_col == project_id)
    .order_by(shot_order_col.asc())
)
shots = res.scalars().all()
```

The double-cast is a project-wide pattern for satisfying the type checker around SQLModel's `Field` descriptors. See `app/api/v1/routes/projects.py` for canonical usage.

### Bulk updates

```python
from sqlalchemy import update

await session.execute(
    update(AgentRun)
    .where(AgentRun.status.in_(["queued", "running"]))
    .values(status="cancelled", error="Service restarted")
)
await session.commit()
```

---

## Commit Discipline

- **Always `await session.commit()` after writes**. SQLAlchemy async sessions do not auto-commit.
- **`refresh()` after commit** only when you need server-generated values (auto-id, default timestamps) for the response.
- **Do not commit inside services unless the service owns the unit of work**. Routes in this codebase do call `commit()` on the injected session — that's accepted because each request is one unit of work.
- **Background-task pattern**: open a fresh session, do all work, commit, exit `async with`. Do not pass request-scoped sessions across `await` boundaries that outlive the request.

---

## Migrations (Alembic)

- Versions live in `backend/alembic/versions/`.
- `backend/alembic.ini` defaults to a local SQLite URL — **export `DATABASE_URL` before running migrations** in any non-trivial environment, or pass `-x dburl=<url>`.
- `init_db()` calls `SQLModel.metadata.create_all` on startup. This is intentional for dev bootstrap and tests, but **does not replace migrations** — schema-changing PRs must include a new Alembic revision.
- After model changes:
  1. Update the model file.
  2. Generate a revision: `uv run alembic revision --autogenerate -m "<message>"`.
  3. Inspect the generated file (autogenerate misses constraint-only changes).
  4. `uv run alembic upgrade head`.
  5. Add a migration test in `backend/tests/test_migrations.py` if the change is non-trivial.

### Migration Gotcha: SQLite `batch_alter_table`

SQLite does not support `ALTER TABLE ... ADD COLUMN ... REFERENCES` (FK constraints in ALTER). Any migration that adds a column with `ForeignKey` to an **existing** table **must** use `batch_alter_table`:

```python
# Wrong — fails on SQLite
op.add_column("project", sa.Column("universe_id", sa.Integer(), sa.ForeignKey("universe.id"), nullable=True))

# Correct — works on both SQLite and PostgreSQL
with op.batch_alter_table("project", schema=None) as batch_op:
    batch_op.add_column(sa.Column("universe_id", sa.Integer(), nullable=True))
    # FK enforced at app level; batch mode uses copy-and-move strategy for SQLite
    # batch_op.create_foreign_key("fk_project_universe_id", "universe", ["universe_id"], ["id"])
```

**Rule**: `create_table` with FK is fine on SQLite. `add_column` with FK on existing table requires `batch_alter_table`.

### Migration Test Maintenance

`tests/test_migrations.py` has `expected_tables` and column assertions that must be updated when adding new tables or columns:

1. Add new table names to `expected_tables` set.
2. Add new column names to `project_columns` / `run_columns` assertions.
3. Import new models at the top of the test file.

---

## Startup Side Effects

`init_db()` (in `app/db/session.py`) does several things at app start — keep them in mind when changing models or persistence:

1. `SQLModel.metadata.create_all` — creates any missing tables.
2. `ConfigService.ensure_initialized()` + `apply_settings_overrides()` — boots the runtime config.
3. **Cleans stale runs**: any `AgentRun` left in `queued` or `running` is forced to `cancelled` with `error="Service restarted"`. If you add a new active-state value, update this query.
4. **Backfills empty `Project.style`** to `"anime"` (legacy data compat).
5. `ensure_postgres_checkpointer_setup()` — installs LangGraph's Postgres checkpointer schema.

Step 3 is a single-instance assumption. Do not deploy multiple backend instances against one DB without changing this.

---

## Forbidden Patterns

- **Sync engines / sync sessions** — the entire stack is async.
- **`session = async_session_maker()` without `async with`** — leaks connections.
- **`session.execute(...)` without `await`** — silently returns a coroutine.
- **Storing tz-aware `datetime`** in DB columns — breaks comparisons with existing rows. Always use the `utcnow()` helper that strips tz.
- **Raising `HTTPException` from a service** — services raise `AppException` subclasses; only routes (or `app/main.py` exception handlers) deal with HTTP status codes.
- **Importing models inside `app/db/session.py:init_db` lazily and forgetting the top-level `# noqa: F401` import** — `create_all` won't see the table.

---

## Examples

- Read + 404: `app/api/v1/routes/projects.py:get_project`.
- Filtered list with order: `app/api/v1/routes/projects.py:list_shots`.
- Cascading delete with multi-table cleanup: `app/services/project_deletion.py`.
- Bulk update on startup: `app/db/session.py:init_db`.
- Background-task session usage: `app/main.py` WebSocket `confirm` branch.
