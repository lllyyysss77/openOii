# Orchestration Architecture Guide

> **Purpose**: Documents the multi-agent orchestration architecture, stage contracts, and cross-layer data flow.

---

## Architecture Overview

The generation pipeline uses **6 agents** with a **17-node** LangGraph state machine featuring per-sub-stage approval gates, critic-reflection loops, and audio generation:

```
plan_outline → outline_approval → plan_characters → characters_approval → plan_shots → shots_approval
  → render_characters → character_images_approval → critique_character_images → render_shots
  → shot_images_approval → critique_shot_images → compose_videos → compose_merge
  → add_audio → compose_approval → END
                                              ↘ review ↗
```

| Agent            | LLM Call | Purpose                                                      |
| ---------------- | -------- | ------------------------------------------------------------ |
| **OutlineAgent** | 1 call   | Generates three-act story outline from user idea             |
| **PlanAgent**    | 1 call   | Generates characters + shots (10-field) from story/outline   |
| **RenderAgent**  | N calls  | Generates character ref images + shot keyframes              |
| **CriticAgent**  | N calls  | VLM-based quality review with score threshold routing        |
| **ComposeAgent** | 0 calls  | I2V per shot + merge + TTS/BGM audio mixing                  |
| **ReviewEngine** | 0 calls  | Rule-based feedback routing (deterministic)                  |

**Key invariants**:
- `review` is only reachable via user feedback (`/feedback` API), never in the normal forward flow.
- `critique_*` nodes are only reachable after image approval gates, and route back on low score.
- `add_audio` is only reached when video generation is not skipped.
- CriticAgent is NOT in the orchestrator's `.agents` list — invoked via LangGraph nodes only.

---

## Stage Name Contract

Stage names are **shared across 7+ files** and must stay in sync:

| File                           | Purpose                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `app/orchestration/state.py`   | `Phase2Stage` Literal type + `PRODUCTION_STAGE_SEQUENCE` + `_APPROVAL_TO_PRODUCED_STAGE`                            |
| `app/orchestration/graph.py`   | Node names + edge routing (17 nodes)                                                                                |
| `app/orchestration/nodes.py`   | Node functions + route helpers                                                                                      |
| `app/agents/orchestrator.py`   | `STAGE_AGENT_MAP` (single source; `GRAPH_STAGE_FOR_AGENT`, `AGENT_STAGE_MAP`, `RESUME_AGENT_FOR_STAGE` are aliases) |
| `app/services/run_recovery.py` | `AGENT_TO_STAGE` + `PHASE2_STAGE_ORDER`                                                                             |
| `frontend/app/utils/workflowStage.ts` | `GRANULAR_TO_SIMPLIFIED` mapping (granular → 6 simplified UI stages)                                       |
| `frontend/app/types/index.ts`  | `AGENT_NAME_MAP` (Chinese labels for agent names)                                                                   |

**When adding/removing a stage**: update ALL files + corresponding test fixtures. See orchestration-stages.md for the complete checklist.

---

## Production Stage Sequence (8 stages)

| Index | Stage              | Agent            | Progress Value   |
| ----- | ------------------ | ---------------- | ---------------- |
| 0     | `plan_outline`     | OutlineAgent     | 0/8 = 0.0       |
| 1     | `plan_characters`  | PlanAgent        | 1/8 = 0.125     |
| 2     | `plan_shots`       | PlanAgent        | 2/8 = 0.25      |
| 3     | `render_characters`| RenderAgent      | 3/8 = 0.375     |
| 4     | `render_shots`     | RenderAgent      | 4/8 = 0.5       |
| 5     | `compose_videos`   | ComposeAgent     | 5/8 = 0.625     |
| 6     | `compose_merge`    | ComposeAgent     | 6/8 = 0.75      |
| 7     | `add_audio`        | ComposeAgent     | 7/8 = 0.875     |

Approval + critic stages are interpolated between production stages. Progress at approval = production stage progress. Progress at critic = production stage progress + 0.5 × within-stage fraction.

---

## Frontend Stage Simplification (6 UI stages)

Frontend maps 17 granular backend stages to 6 simplified UI stages:

| Simplified Stage | Granular Stages                                              |
| ---------------- | ------------------------------------------------------------ |
| `plan`           | plan_outline, plan_characters, plan_shots                    |
| `plan_approval`  | outline_approval, characters_approval, shots_approval        |
| `render`         | render_characters, render_shots, critique_character_images, critique_shot_images |
| `render_approval`| character_images_approval, shot_images_approval              |
| `compose`        | compose_videos, compose_merge, add_audio                     |
| `compose_approval`| compose_approval                                            |

**review** stage is handled separately (not shown in pipeline UI).

---

## Critic-Reflection Loop

After image approval gates, the graph routes to critic nodes for quality review:

```
character_images_approval → critique_character_images
  → score >= threshold OR rounds >= max: render_shots (continue)
  → score < threshold AND rounds < max: render_characters (regenerate)

shot_images_approval → critique_shot_images
  → score >= threshold OR rounds >= max: compose_videos (continue)
  → score < threshold AND rounds < max: render_shots (regenerate)
```

**CriticAgent** uses VLM (OpenAI-compatible multimodal) to review images on 3 dimensions (consistency, quality, composition) with 0-10 scoring. Falls back to text-only review if VLM unavailable, and score 5.0 if all review fails.

**Settings**: `critique_enabled` (default True), `critique_score_threshold` (6.0), `critique_max_rounds` (2).

---

## Audio Generation Flow

After video merge, the `add_audio` stage adds TTS and BGM:

1. Extract dialogue from shot fields
2. Generate TTS using Edge TTS (free, no API key) with character voice mapping
3. Match BGM by scene/expression keywords (6 categories: suspense/warm/action/sad/happy/ambient)
4. Mix audio into video using FFmpeg
5. Emit `audio_generated` WS event per shot

**Fault tolerance**: TTS/BGM/mix failures are all non-blocking — original video preserved on failure.

---

## Thinking Chain

All agents emit `agent_thinking` WS events during execution:

- **Phases**: reasoning, decision, planning, reviewing
- **Detail level**: `minimal` (decision only), `normal` (decision + reviewing), `verbose` (all)
- **Settings**: `thinking_chain_enabled` (default True), `thinking_chain_detail_level` (default "normal")
- **Non-blocking**: `send_thinking()` failures never interrupt agent flow
- **Dual emission**: Both `agent_thinking` (structured) and `run_message` with `role=thinking`

---

## Shot 10-Field Schema

The `Shot` model uses 10 content fields for structured prompts:

| Field         | Type            | Description                                |
| ------------- | --------------- | ------------------------------------------ |
| `description` | `str \| None`   | Overall shot description                   |
| `camera`      | `str \| None`   | Camera movement/type                       |
| `duration`    | `float \| None` | Planned duration (seconds)                 |
| `scene`       | `str \| None`   | Scene/environment setting                  |
| `action`      | `str \| None`   | Character action in shot                   |
| `expression`  | `str \| None`   | Character facial expression                |
| `lighting`    | `str \| None`   | Lighting description                       |
| `dialogue`    | `str \| None`   | Spoken dialogue text                       |
| `sfx`         | `str \| None`   | Sound effect notes                         |
| `motion_note` | `str \| None`   | Motion/animation direction                 |
| `seed`        | `int \| None`   | RNG seed for style-consistent regeneration |
| `tts_url`     | `str \| None`   | Generated TTS audio URL                    |
| `bgm_type`    | `str \| None`   | Matched BGM category                       |

Each has an `approved_` counterpart set during the approval gate.

**Cross-layer**: `backend/app/models/project.py` → `backend/app/schemas/project.py` → `frontend/app/types/index.ts` + canvas shape types.

---

## Style Locking

`project.style` (set at creation: anime/cinematic/manga/realistic etc.) must be enforced at every generation step:

| Step    | Where                             | How                                                                                |
| ------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| Plan    | `PlanAgent` system prompt         | "Style Locking" section forces `visual_bible` + `image_prompt` to match style      |
| Render  | `RenderAgent._style_descriptor_async()` | Queries StyleTemplate table; falls back to `_FALLBACK_STYLE_MAP`            |
| Compose | (video generation)                | Inherits `style` from project context                                              |

**StyleTemplate system**: 14 built-in templates (11 original + guofeng-manga, cyberpunk, fairy-tale) with preset style_prompt, negative_prompt, color_palette. Custom templates supported via API.

---

## Character Bible & Consistency

Character model extended with bible fields for cross-shot consistency:

| Field              | Type            | Purpose                                              |
| ------------------ | --------------- | ---------------------------------------------------- |
| `reference_images` | `JSON (list)`   | URLs of multi-angle reference images                 |
| `face_embedding`   | `Text (JSON)`   | 512-dim InsightFace embedding for similarity check   |
| `visual_notes`     | `Text`          | LLM-extracted visual features description            |

**CharacterBibleService**: `build_character_bible()`, `compute_face_embedding()`, `find_similar_characters()`, `auto_populate_visual_notes()`.

**RenderAgent integration**: `_build_character_prompt()` injects visual_notes; `_build_shot_prompt()` injects character bible text; `_render_characters()` auto-computes embedding and populates visual_notes after generation.

**Consistency evaluation**: `ConsistencyEvalService` computes per-character face similarity, presence rate, and overall score. Grading: A(≥90), B(≥75), C(≥60), D(≥40), F(<40). Triggered automatically after CriticAgent shot review.

---

## Version Compare & Rollback

ArtifactVersion model tracks all mutations to characters and shots:

| Field       | Type      | Purpose                                        |
| ----------- | --------- | ---------------------------------------------- |
| `version`   | `int`     | Incrementing version number                    |
| `snapshot`  | `JSON`    | Complete field snapshot at that point           |
| `trigger`   | `str`     | "generation" \| "feedback" \| "manual" \| "rollback" |

**Rollback strategy**: Append-only — restores text fields + image_url, creates a new "rollback" version without deleting history.

**Auto-snapshot**: `auto_snapshot_character()` / `auto_snapshot_shot()` called before plan/render mutations.

---

## Review Routing Rules

`ReviewRuleEngine` in `app/agents/review_rules.py` uses deterministic routing (no LLM):

| Feedback Type                    | Route To  | Mode                    |
| -------------------------------- | --------- | ----------------------- |
| plan/story/script/global         | `plan`    | `incremental` or `full` |
| render/character/shot/storyboard | `render`  | `incremental` or `full` |
| compose/video/merge              | `compose` | `incremental` or `full` |
| retry-compose keywords           | `compose` | `incremental`           |
| unknown                          | `plan`    | `incremental` or `full` |

**Mode decision**: `full` only when feedback contains explicit full-restart keywords ("推倒重来", "从头开始", "完全重新", "全部推翻", "redo all", "restart from scratch", etc.). All other feedback defaults to `incremental`.

---

## Validation & Error Matrix

| Error                           | Where                                 | Handling                                                        |
| ------------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| Video provider not configured   | `nodes.py:_is_video_provider_invalid` | Skip compose, return `video_generation_skipped`                 |
| Stage already completed (rerun) | `nodes.py:_should_skip_stage`         | Return early, advance stage                                     |
| User feedback empty             | `ReviewRuleEngine`                    | Default route to `plan` with "未提供具体反馈", mode=incremental |
| Auto mode                       | `orchestrator.py:_wait_for_confirm`   | Skip all approval gates                                         |
| Run recovery finds stale stage  | `run_recovery.py`                     | Fallback to `plan_outline` stage                                |
| Critic VLM unavailable          | `CriticAgent._run_review`             | Graceful degradation to text-only, then score 5.0 fallback     |
| TTS/BGM service failure         | `AudioService`                        | Skip failed component, preserve original video                  |

---

## Test Assertion Points

1. **Graph topology**: `test_phase2_graph.py` — route helpers return correct next stages
2. **Approval gates**: `test_phase2_graph.py` — interrupt fires at correct nodes
3. **Review routing**: `test_review.py` — each feedback type routes to correct agent
4. **Recovery**: `test_run_recovery.py` — `_resume_target_stage` returns correct stage
5. **Progress**: `test_nodes.py` — `workflow_progress_for_stage` returns correct 0-1 values
6. **Critic loop**: `test_critic.py` — score threshold and max rounds routing
7. **Audio**: `test_audio_service.py` — TTS generation, BGM matching, FFmpeg mixing
8. **Cross-layer**: frontend `workspaceStatus.test.ts` — stage names match backend enum values

---

## Cross-Project IP Universe

Universe/SharedCharacter/UniverseProjectLink models enable multi-project serialization:

- **Universe**: world_setting + style_rules + shared characters
- **SharedCharacter**: promoted from project Character with visual_notes + face_embedding + reference_images
- **PlanAgent integration**: `_get_universe_context()` injects world_setting + shared characters into LLM payload; `run_characters()` auto-imports matching shared characters

**API**: 11 endpoints under `/api/v1/universes` for CRUD, project linking, character promotion/import/sync.
