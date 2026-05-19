from __future__ import annotations

from dataclasses import dataclass
from operator import add
from typing import Annotated, Any, Literal, TypedDict


Phase2Stage = Literal[
    "plan_characters",
    "characters_approval",
    "plan_shots",
    "shots_approval",
    "render_characters",
    "character_images_approval",
    "render_shots",
    "shot_images_approval",
    "compose_videos",
    "compose_merge",
    "compose_approval",
    "review",
]

# Ordered sequence of production stages (excludes approval gates).
PRODUCTION_STAGE_SEQUENCE: tuple[str, ...] = (
    "plan_characters",
    "plan_shots",
    "render_characters",
    "render_shots",
    "compose_videos",
    "compose_merge",
)


# Approval gate → the production stage it comes right after
_APPROVAL_TO_PRODUCED_STAGE: dict[str, str] = {
    "characters_approval": "plan_characters",
    "shots_approval": "plan_shots",
    "character_images_approval": "render_characters",
    "shot_images_approval": "render_shots",
    "compose_approval": "compose_merge",
}


def _resolve_base_stage(stage: str) -> str | None:
    """Map any stage (production or approval) to its production stage."""
    if stage in PRODUCTION_STAGE_SEQUENCE:
        return stage
    return _APPROVAL_TO_PRODUCED_STAGE.get(stage)


def next_production_stage(stage: str | None) -> str | None:
    if not isinstance(stage, str):
        return None
    base = _resolve_base_stage(stage)
    if base is None:
        return None
    next_index = PRODUCTION_STAGE_SEQUENCE.index(base) + 1
    if next_index >= len(PRODUCTION_STAGE_SEQUENCE):
        return None
    return PRODUCTION_STAGE_SEQUENCE[next_index]


def workflow_progress_for_stage(stage: str, *, within_stage: float = 0.0) -> float:
    base = _resolve_base_stage(stage)
    if base is None:
        return 0.0

    clamped_within = max(0.0, min(within_stage, 1.0))
    stage_index = PRODUCTION_STAGE_SEQUENCE.index(base)
    total = len(PRODUCTION_STAGE_SEQUENCE)
    return min((stage_index + clamped_within) / total, 1.0)


class Phase2State(TypedDict, total=False):
    project_id: int
    run_id: int
    thread_id: str
    current_stage: str
    next_stage: str
    stage_history: Annotated[list[str], add]
    approval_history: Annotated[list[str], add]
    artifact_lineage: Annotated[list[str], add]
    approval_feedback: str
    review_requested: bool
    route_stage: str
    route_mode: str
    video_generation_skipped: bool


@dataclass(slots=True)
class Phase2RuntimeContext:
    orchestrator: Any
    agent_context: Any
    start_stage: Phase2Stage = "plan_characters"
    auto_mode: bool = False
