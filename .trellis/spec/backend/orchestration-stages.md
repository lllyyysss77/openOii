# Orchestration Sub-Stage Architecture

> Contracts for the LangGraph-based Phase2 pipeline with per-sub-stage approval gates,
> critic-reflection loops, and audio generation.

---

## 1. Scope / Trigger

- Any change to the orchestration graph structure (adding/removing nodes, edges)
- Any change to agent sub-step methods (`run_outline`, `run_characters`, `run_shots`, etc.)
- Any change to approval gate logic
- Any change to `PHASE2_STAGE_ORDER`, `STAGE_AGENT_MAP`, or `PRODUCTION_STAGE_SEQUENCE`
- Any change to critic-reflection or audio generation stages

---

## 2. Architecture

### Graph Topology (17 nodes)

```
plan_outline → outline_approval → plan_characters → characters_approval → plan_shots → shots_approval
  → render_characters → character_images_approval → critique_character_images → render_shots
  → shot_images_approval → critique_shot_images → compose_videos → compose_merge
  → add_audio → compose_approval → END

         ↓ (any approval with feedback)
      review → routes back to production stage
```

### Stage Categories

| Category        | Stages                                                                                                                           | Behavior                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Production**  | `plan_outline`, `plan_characters`, `plan_shots`, `render_characters`, `render_shots`, `compose_videos`, `compose_merge`, `add_audio` | Runs agent sub-method                              |
| **Approval**    | `outline_approval`, `characters_approval`, `shots_approval`, `character_images_approval`, `shot_images_approval`, `compose_approval` | Interrupts for user confirmation                   |
| **Critic**      | `critique_character_images`, `critique_shot_images`                                                                              | VLM-based quality review; routes back on low score |
| **Review**      | `review`                                                                                                                        | Routes feedback to appropriate production stage    |

### Agent → Stage Mapping

| Agent            | Sub-Step Methods                                    | Stages Handled                                              |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| **OutlineAgent** | `run_outline`                                       | `plan_outline`, `outline_approval`                          |
| **PlanAgent**    | `run_characters`, `run_shots`                       | `plan_characters`, `plan_shots` (+ their approvals)        |
| **RenderAgent**  | `run_characters`, `run_shots`                       | `render_characters`, `render_shots` (+ their approvals)    |
| **CriticAgent**  | `run_character_review`, `run_shot_review`           | `critique_character_images`, `critique_shot_images`        |
| **ComposeAgent** | `run_videos`, `run_merge`, `run_add_audio`          | `compose_videos`, `compose_merge`, `add_audio` (+ approval)|
| **ReviewEngine** | (rule-based, no LLM)                               | `review`                                                    |

> **Note**: CriticAgent is invoked via LangGraph nodes only — it is NOT in `GenerationOrchestrator.agents` list.

### Key Mappings (Single Source of Truth)

```python
# app/orchestration/state.py — 17 stages
Phase2Stage = Literal[
    "plan_outline", "outline_approval",
    "plan_characters", "characters_approval",
    "plan_shots", "shots_approval",
    "render_characters", "character_images_approval",
    "critique_character_images",
    "render_shots", "shot_images_approval",
    "critique_shot_images",
    "compose_videos", "compose_merge", "add_audio",
    "compose_approval",
    "review",
]

PRODUCTION_STAGE_SEQUENCE = (
    "plan_outline", "plan_characters", "plan_shots",
    "render_characters", "render_shots",
    "compose_videos", "compose_merge", "add_audio",
)

# app/services/run_recovery.py — 17 stages (same order)
PHASE2_STAGE_ORDER = (
    "plan_outline", "outline_approval",
    "plan_characters", "characters_approval",
    "plan_shots", "shots_approval",
    "render_characters", "character_images_approval",
    "critique_character_images",
    "render_shots", "shot_images_approval",
    "critique_shot_images",
    "compose_videos", "compose_merge", "add_audio",
    "compose_approval", "review",
)

# app/agents/orchestrator.py — 17 stage→agent mappings
STAGE_AGENT_MAP = {
    "plan_outline": "outline", "outline_approval": "outline",
    "plan_characters": "plan", "characters_approval": "plan",
    "plan_shots": "plan", "shots_approval": "plan",
    "render_characters": "render", "character_images_approval": "render",
    "critique_character_images": "critic",
    "render_shots": "render", "shot_images_approval": "render",
    "critique_shot_images": "critic",
    "compose_videos": "compose", "compose_merge": "compose",
    "add_audio": "compose", "compose_approval": "compose",
    "review": "review",
}

GRAPH_STAGE_FOR_AGENT = {
    "outline": "plan_outline",
    "plan": "plan_characters",
    "render": "render_characters",
    "compose": "compose_videos",
    "review": "review",
}

# Completion messages for approval-awaiting UI
AGENT_COMPLETION_INFO = {
    "outline": { "completed": "已完成故事大纲", ... },
    "plan": { "completed": "已完成创作方案规划", ... },
    "render": { "completed": "已完成角色形象和分镜画面渲染", ... },
    "critic": { "completed": "已完成质量审查", ... },
    "compose": { "completed": "已完成视频合成", ... },
}
```

---

## 3. Signatures

### Agent Sub-Step Methods

```python
# OutlineAgent
async def run_outline(self, ctx: AgentContext) -> None: ...

# PlanAgent
async def run_characters(self, ctx: AgentContext) -> None: ...
async def run_shots(self, ctx: AgentContext) -> None: ...

# RenderAgent
async def run_characters(self, ctx: AgentContext) -> None: ...  # renders character images
async def run_shots(self, ctx: AgentContext) -> None: ...      # renders shot images

# CriticAgent
async def run_character_review(self, ctx: AgentContext) -> dict[str, Any]: ...
async def run_shot_review(self, ctx: AgentContext) -> dict[str, Any]: ...

# ComposeAgent
async def run_videos(self, ctx: AgentContext) -> int: ...   # returns video count
async def run_merge(self, ctx: AgentContext) -> None: ...
async def run_add_audio(self, ctx: AgentContext) -> None: ...
```

### Graph Node Function Signature

```python
async def plan_outline_node(
    state: Phase2State,
    runtime: Runtime[Phase2RuntimeContext],
) -> dict[str, Any]: ...
```

### Approval Node Signature

```python
async def outline_approval_node(
    state: Phase2State,
    runtime: Runtime[Phase2RuntimeContext],
) -> dict[str, Any]: ...
```

---

## 4. Contracts

### Critic-Reflection Loop

After `character_images_approval` and `shot_images_approval`, the graph routes to critic nodes:

```
character_images_approval → critique_character_images
  → if score < threshold AND rounds < max: render_characters (regenerate)
  → else: render_shots (continue)

shot_images_approval → critique_shot_images
  → if score < threshold AND rounds < max: render_shots (regenerate)
  → else: compose_videos (continue)
```

**Configuration**:

| Setting                    | Default | Purpose                                         |
| -------------------------- | ------- | ----------------------------------------------- |
| `critique_enabled`         | `True`  | Enable/disable critic loop                      |
| `critique_score_threshold` | `6.0`   | Below this score, images are regenerated        |
| `critique_max_rounds`      | `2`     | Maximum critique rounds before forced continue   |

**State fields**:

```python
# Phase2State additions
critique_scores: dict[str, Any] = {}
critique_round: int = 0
```

### Audio Generation Stage

After `compose_merge`, the graph routes to `add_audio` (when video generation is not skipped):

```
compose_merge → add_audio → compose_approval
```

`add_audio_node` delegates to `_run_sub_stage` with `method_name='run_add_audio'`.
AudioService generates per-shot TTS (Edge TTS, free) + BGM matching (keyword-based) and mixes via FFmpeg.

**Fault tolerance**: TTS failure → skip TTS, add BGM only. BGM failure → skip BGM. Mix failure → preserve original video. Entire stage failure → does not block workflow.

### `_resolve_base_stage` — Maps any stage to its production stage

```python
def _resolve_base_stage(stage: str) -> str | None:
    """Maps production stages (identity) and approval gates to their production stage."""
    if stage in PRODUCTION_STAGE_SEQUENCE:
        return stage
    return _APPROVAL_TO_PRODUCED_STAGE.get(stage)
```

**Mapping**:

- `"plan_outline"` → `"plan_outline"` (identity)
- `"outline_approval"` → `"plan_outline"` (via `_APPROVAL_TO_PRODUCED_STAGE`)
- `"plan_characters"` → `"plan_characters"` (identity)
- `"characters_approval"` → `"plan_characters"`
- `"character_images_approval"` → `"render_characters"`
- `"critique_character_images"` → `"render_characters"`
- `"shot_images_approval"` → `"render_shots"`
- `"critique_shot_images"` → `"render_shots"`
- `"add_audio"` → `"add_audio"` (identity)
- `"compose_approval"` → `"compose_merge"`

### `_run_sub_stage` — Generic production node runner

```python
async def _run_sub_stage(state, runtime, *, stage: str, method_name: str) -> dict:
    # 1. Check video provider validity (compose_videos only)
    # 2. Check artifact_lineage for skip
    # 3. Emit run_progress event
    # 4. Call agent.method_name(ctx)
    # 5. Return state update with artifact_lineage
```

### `_manual_approval_node` — Generic approval gate

```python
async def _manual_approval_node(runtime, *, approval_stage, history_key, gate, message, next_stage) -> dict:
    # 1. If auto_mode → return auto_approval_result
    # 2. Else → interrupt() and wait for user
    # 3. Return approval_result with route_stage
```

### Agent Context Data Caching

```python
# Plan agent caches LLM response for sub-step consumption
ctx.plan_data: dict | None = None  # Set by run_characters(), read by run_shots()
```

### Plan sub-step source of truth

`PlanAgent.run_characters()` and `PlanAgent.run_shots()` are split stages, so
their response payloads have different meanings:

- Character planning counts and persists characters from the LLM
  `characters` field.
- Shot planning must treat the already-persisted `Character` rows for the
  project as the source of truth for character count, shot bindings, summaries,
  and progress/thinking messages.
- Do not count `data["characters"]` inside `run_shots()`. In the common
  split-stage path, the shot response only contains `shots`, so counting
  `data["characters"]` reports `0` even when the project has approved
  characters.

Add a regression test whenever a plan-stage summary or progress message changes:
seed persisted characters, run `run_shots()` with a shots-only response, and
assert the emitted message still reports the persisted character count.

### Thinking Chain

All agents emit `agent_thinking` WS events during execution via `send_thinking()` on `BaseAgent`:

```python
async def send_thinking(self, ctx, phase: str, content: str) -> None:
    """Emit thinking-chain WS event. Non-blocking — failures never interrupt agent flow."""
```

**Phases**: `reasoning`, `decision`, `planning`, `reviewing`

**Filtering by detail level** (`thinking_chain_detail_level`):
- `minimal`: decision phase only
- `normal`: decision + reviewing
- `verbose`: all four phases

**Dual emission**: Both `agent_thinking` (structured) and `run_message` with `role=thinking` (backward-compatible).

---

## 5. Validation & Error Matrix

| Scenario                                               | Result                                              |
| ------------------------------------------------------ | --------------------------------------------------- |
| `run_shots()` called without `ctx.plan_data`           | `RuntimeError` raised                               |
| Video provider invalid at `compose_videos`              | Node skips work, adds to `artifact_lineage`          |
| Approval with feedback                                  | Routes to `review` node                             |
| Approval without feedback                               | Routes to next production stage                     |
| `auto_mode=True`                                        | Approval returns immediately without interrupt      |
| Stage in `artifact_lineage`                             | Production node skips (already done)                 |
| Critique enabled + score < threshold + rounds < max    | Routes back to render stage for regeneration         |
| Critique enabled + score >= threshold                   | Routes forward to next stage                         |
| Critique rounds >= max                                  | Forced continue regardless of score                  |
| Critique disabled                                       | critique nodes skip, route directly to next stage    |
| TTS service unavailable                                 | Skip TTS, add BGM only; non-blocking                |
| BGM file missing                                        | Skip BGM; non-blocking                              |
| FFmpeg mix failure                                      | Preserve original video; non-blocking                |
| VLM (multimodal) not available for critic              | Graceful degradation to text-only review             |
| Text-only review also fails                             | Fallback score 5.0, continue workflow                |

---

## 6. Good / Bad Cases

### Good: Adding a new sub-stage

```python
# 1. Add to PRODUCTION_STAGE_SEQUENCE in state.py
PRODUCTION_STAGE_SEQUENCE = ("plan_outline", "plan_characters", "plan_shots", "new_stage", ...)

# 2. Add to Phase2Stage Literal in state.py
Phase2Stage = Literal[..., "new_stage", "new_stage_approval", ...]

# 3. Add to PHASE2_STAGE_ORDER in run_recovery.py (with approval gate)
PHASE2_STAGE_ORDER = (..., "new_stage", "new_stage_approval", ...)

# 4. Add to STAGE_AGENT_MAP in orchestrator.py
STAGE_AGENT_MAP["new_stage"] = "agent_name"
STAGE_AGENT_MAP["new_stage_approval"] = "agent_name"

# 5. Add approval gate mapping in state.py and run_recovery.py
_APPROVAL_TO_PRODUCED_STAGE["new_stage_approval"] = "new_stage"

# 6. Add graph nodes and edges in graph.py
graph.add_node("new_stage", new_stage_node)
graph.add_node("new_stage_approval", new_stage_approval_node)

# 7. Add to frontend GRANULAR_TO_SIMPLIFIED in workflowStage.ts
new_stage: "plan" | "render" | "compose"

# 8. Add to AGENT_COMPLETION_INFO if it's a new agent type
```

### Bad: Adding stage without updating all mappings

```python
# Add to PRODUCTION_STAGE_SEQUENCE but forget PHASE2_STAGE_ORDER
# → _stage_index returns 0 for unknown stages
# → _next_stage returns wrong stage
# → recovery summary breaks

# Add to Phase2Stage but forget STAGE_AGENT_MAP
# → approval UI cannot identify which agent handles the stage
# → AGENT_COMPLETION_INFO returns generic fallback message

# Add to backend but forget frontend GRANULAR_TO_SIMPLIFIED
# → toSimplifiedStage() returns undefined
# → progress bar / stage display breaks
```

---

## 7. Tests Required

### Graph Routing Test

```python
async def test_graph_interrupts_at_each_approval(start_stage, expected_agent, expected_gate):
    """Verify graph pauses at approval gate, not mid-agent."""
    result = await compiled.ainvoke(initial_state, config, context=runtime_context)
    interrupts = result.get("__interrupt__") or []
    assert interrupts
    assert interrupts[0].value["gate"] == expected_gate
```

### Skip Logic Test

```python
def test_should_skip_stage_with_lineage():
    state = {"artifact_lineage": ["stage:plan_characters"]}
    assert _should_skip_stage(state, "plan_characters") is True
    assert _should_skip_stage(state, "plan_shots") is False
```

### Stage Resolution Test

```python
def test_resolve_base_stage():
    assert _resolve_base_stage("plan_outline") == "plan_outline"
    assert _resolve_base_stage("outline_approval") == "plan_outline"
    assert _resolve_base_stage("critique_character_images") == "render_characters"
    assert _resolve_base_stage("add_audio") == "add_audio"
    assert _resolve_base_stage("unknown") is None
```

### Critic Loop Test

```python
def test_critic_routes_back_on_low_score():
    """When score < threshold and rounds < max, routes back to render."""
    state = {"critique_round": 0, "critique_scores": {"score": 4.0}}
    result = route_after_critique_character_images(state)
    assert result == "render_characters"

def test_critic_forced_continue_after_max_rounds():
    """When rounds >= max, routes forward regardless of score."""
    state = {"critique_round": 2, "critique_scores": {"score": 3.0}}
    result = route_after_critique_character_images(state)
    assert result == "render_shots"
```

### Progress Calculation Test

```python
def test_workflow_progress_for_all_production_stages():
    """Each production stage has a correct progress value in [0, 1]."""
    for i, stage in enumerate(PRODUCTION_STAGE_SEQUENCE):
        progress = workflow_progress_for_stage(stage)
        assert 0 <= progress <= 1
        if i > 0:
            assert progress > workflow_progress_for_stage(PRODUCTION_STAGE_SEQUENCE[i-1])
```

---

## 8. Wrong vs Correct

### Wrong: Using old stage names

```python
# Old (3-agent, 6-stage model)
GRAPH_STAGE_FOR_AGENT = {"plan": "plan", "render": "render"}
PHASE2_STAGE_ORDER = ("plan", "plan_approval", "render", ...)
PRODUCTION_STAGE_SEQUENCE = ("plan_characters", "plan_shots", ...)
```

### Correct: Keeping all 7+ mapping locations in sync

When adding/modifying stages, update ALL of:

1. `Phase2Stage` Literal type in `state.py`
2. `PRODUCTION_STAGE_SEQUENCE` in `state.py`
3. `_APPROVAL_TO_PRODUCED_STAGE` in `state.py`
4. `PHASE2_STAGE_ORDER` in `run_recovery.py`
5. `AGENT_TO_STAGE` in `run_recovery.py`
6. `STAGE_AGENT_MAP` in `orchestrator.py`
7. `GRAPH_STAGE_FOR_AGENT` in `orchestrator.py`
8. `AGENT_COMPLETION_INFO` in `orchestrator.py`
9. Graph nodes and edges in `graph.py`
10. Frontend `GRANULAR_TO_SIMPLIFIED` in `workflowStage.ts`
11. Frontend `AGENT_NAME_MAP` in `types/index.ts`

---

## Design Decisions

### DD: Sub-stage approval instead of per-item approval

**Context**: User wanted "manual mode confirms every small step."

**Options**:

1. Per-character/per-shot approval (extremely granular, many interrupts)
2. Per-sub-stage approval (one interrupt per agent phase)
3. Per-agent approval (original 2-gate design)

**Decision**: Option 2 — per-sub-stage. Each agent is split into 2-3 logical phases (characters → shots, character images → shot images, videos → merge → audio). Manual mode pauses between phases. Yolo mode skips all pauses.

**Tradeoff**: Less granular than per-item, but avoids interrupt fatigue and keeps the graph manageable.

### DD: `ctx.plan_data` for cross-sub-step data sharing

**Context**: Plan agent's LLM returns both characters and shots in one response, but they're now consumed in separate sub-steps.

**Options**:

1. Call LLM twice (once per sub-step) — wastes tokens, may get inconsistent results
2. Cache response on `AgentContext` — simple, shared mutable state
3. Store in LangGraph state — requires state schema changes

**Decision**: Option 2 — `ctx.plan_data`. Set by `run_characters()`, read by `run_shots()`. Simple and effective since sub-steps always run sequentially within a single agent context.

### DD: Critic agent as LangGraph node (not orchestrator list member)

**Context**: CriticAgent needs to be invoked conditionally after image approvals.

**Options**:

1. Add CriticAgent to orchestrator.agents list — requires major orchestrator refactoring
2. Invoke CriticAgent via dedicated LangGraph nodes — simpler, graph controls routing

**Decision**: Option 2 — CriticAgent is invoked via `critique_character_images` and `critique_shot_images` LangGraph nodes only. It is NOT in `GenerationOrchestrator.agents` list. The orchestrator's `_agent_index()` and `ALLOWED_START_AGENTS` do not include 'critic'.

**Tradeoff**: CriticAgent cannot be used as a start agent or resumed independently, but this matches its purpose (always triggered after image approval).

### DD: `add_audio` mapped to 'compose' agent in STAGE_AGENT_MAP

**Context**: The `add_audio` stage is handled by ComposeAgent's `run_add_audio` method.

**Options**:

1. Map to 'compose' in STAGE_AGENT_MAP — reuses existing agent
2. Create separate 'audio' agent — cleaner separation but more complexity

**Decision**: Option 1 — `add_audio` maps to 'compose' agent since ComposeAgent already handles audio mixing and the audio stage is an extension of the compose pipeline. This avoids introducing a new agent type.

### DD: `outline_updated` WS event kept in data model but removed from event type Literal

**Context**: OutlineAgent sends `project_updated` instead of `outline_updated` when the outline changes.

**Decision**: Removed `outline_updated` from `WsEventType` Literal (no code emits it), but kept `OutlineUpdatedEventData` in `_EVENT_DATA_MODELS` for backward compatibility so stale WS messages don't cause validation errors.

**Tradeoff**: The frontend has a `case` handler for `outline_updated` that will never fire, but TypeScript's union type doesn't include it, so it's dead code rather than a runtime risk.

### DD: `batch_alter_table` for SQLite migration compatibility

**Context**: Alembic migration 0019 used `op.add_column("project", Column(ForeignKey(...)))` which fails on SQLite (no ALTER TABLE constraint support).

**Decision**: Use `with op.batch_alter_table("project") as batch_op:` for all `add_column` + `ForeignKey` combinations in migrations. The FK constraint is enforced at the application level; batch mode uses copy-and-move strategy for SQLite.

**Rule**: Any migration that adds a column with `ForeignKey` to an existing table MUST use `batch_alter_table`.
