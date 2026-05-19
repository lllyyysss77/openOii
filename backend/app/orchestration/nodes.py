from __future__ import annotations

from typing import Any

from langgraph.runtime import Runtime
from langgraph.types import interrupt

from app.agents.review_rules import ALLOWED_START_AGENTS
from .state import (
    Phase2RuntimeContext,
    Phase2State,
    next_production_stage,
    workflow_progress_for_stage,
)


_STAGE_ARTIFACT_KEYS: dict[str, str] = {
    "plan_characters": "stage:plan_characters",
    "plan_shots": "stage:plan_shots",
    "render_characters": "stage:render_characters",
    "render_shots": "stage:render_shots",
    "compose_videos": "stage:compose_videos",
    "compose_merge": "stage:compose_merge",
}

# Approval gate → the production stage it guards
_APPROVAL_FOR: dict[str, str] = {
    "characters_approval": "plan_characters",
    "shots_approval": "plan_shots",
    "character_images_approval": "render_characters",
    "shot_images_approval": "render_shots",
    "compose_approval": "compose_merge",
}

_START_AGENT_TO_STAGE: dict[str, str] = {
    "plan": "plan_characters",
    "render": "render_characters",
    "compose": "compose_videos",
}


def _stage_key(stage: str) -> str:
    return _STAGE_ARTIFACT_KEYS.get(stage, f"stage:{stage}")


def _should_skip_stage(state: Phase2State, stage: str) -> bool:
    artifact_lineage = state.get("artifact_lineage") or []
    return _stage_key(stage) in artifact_lineage


def _is_video_provider_invalid(run_snapshot: dict[str, Any] | None) -> bool:
    if not isinstance(run_snapshot, dict):
        return False
    video_snapshot = run_snapshot.get("video")
    if not isinstance(video_snapshot, dict):
        return False
    return video_snapshot.get("valid") is False


def _get_run_provider_snapshot(agent_ctx: Any) -> dict[str, Any] | None:
    if not hasattr(agent_ctx, "run"):
        return None
    run = getattr(agent_ctx, "run")
    return getattr(run, "provider_snapshot", None)


async def _run_sub_stage(
    state: Phase2State,
    runtime: Runtime[Phase2RuntimeContext],
    *,
    stage: str,
    method_name: str,
) -> dict[str, Any]:
    """Run a sub-stage of an agent and emit progress."""
    agent_ctx = runtime.context.agent_context
    if stage == "compose_videos" and _is_video_provider_invalid(
        _get_run_provider_snapshot(agent_ctx)
    ):
        return {
            "current_stage": stage,
            "stage_history": [stage],
            "artifact_lineage": [_stage_key(stage), _stage_key("compose_merge")],
            "video_generation_skipped": True,
            "route_stage": "__end__",
        }

    if stage == "compose_merge" and state.get("video_generation_skipped"):
        return {
            "current_stage": stage,
            "stage_history": [stage],
            "artifact_lineage": [_stage_key(stage)],
            "video_generation_skipped": True,
            "route_stage": "__end__",
        }

    if _should_skip_stage(state, stage):
        return {"current_stage": stage}

    orchestrator = runtime.context.orchestrator
    progress = workflow_progress_for_stage(stage, within_stage=0.0)
    await orchestrator._set_run(  # noqa: SLF001
        agent_ctx.run,
        current_agent=stage.split("_")[0],
        progress=progress,
    )
    await orchestrator.ws.send_event(
        agent_ctx.project.id,
        {
            "type": "run_progress",
            "data": {
                "run_id": agent_ctx.run.id,
                "current_agent": stage.split("_")[0],
                "current_stage": stage,
                "stage": stage,
                "next_stage": next_production_stage(stage),
                "progress": progress,
            },
        },
    )

    agent = orchestrator.agents[orchestrator._agent_index(stage.split("_")[0])]  # noqa: SLF001
    method = getattr(agent, method_name)
    await method(agent_ctx)

    return {
        "current_stage": stage,
        "stage_history": [stage],
        "artifact_lineage": [_stage_key(stage)],
    }


# ---------------------------------------------------------------------------
# Approval helpers
# ---------------------------------------------------------------------------


def _approval_result(
    *,
    approval_stage: str,
    history_key: str,
    next_stage: str,
    feedback: str,
) -> dict[str, Any]:
    review_requested = bool(feedback)
    return {
        "current_stage": approval_stage,
        "approval_history": [history_key],
        "approval_feedback": feedback,
        "review_requested": review_requested,
        "route_stage": "review" if review_requested else next_stage,
    }


def _auto_approval_result(
    *, approval_stage: str, history_key: str, next_stage: str
) -> dict[str, Any]:
    return {
        "current_stage": approval_stage,
        "approval_history": [history_key],
        "approval_feedback": "",
        "review_requested": False,
        "route_stage": next_stage,
    }


async def _manual_approval_node(
    runtime: Runtime[Phase2RuntimeContext],
    *,
    approval_stage: str,
    history_key: str,
    gate: str,
    message: str,
    next_stage: str,
) -> dict[str, Any]:
    agent_ctx = runtime.context.agent_context
    orchestrator = runtime.context.orchestrator

    approval_progress = workflow_progress_for_stage(approval_stage)

    await orchestrator._set_run(  # noqa: SLF001
        agent_ctx.run,
        current_agent=gate,
        progress=approval_progress,
    )
    await orchestrator.ws.send_event(
        agent_ctx.project.id,
        {
            "type": "run_progress",
            "data": {
                "run_id": agent_ctx.run.id,
                "current_agent": gate,
                "current_stage": approval_stage,
                "stage": approval_stage,
                "next_stage": next_stage,
                "progress": approval_progress,
            },
        },
    )

    if runtime.context.auto_mode:
        return _auto_approval_result(
            approval_stage=approval_stage,
            history_key=history_key,
            next_stage=next_stage,
        )

    resume_value = interrupt({"gate": gate, "message": message})
    feedback = _normalize_resume_value(resume_value)
    return _approval_result(
        approval_stage=approval_stage,
        history_key=history_key,
        next_stage=next_stage,
        feedback=feedback,
    )


def _build_approval_message(agent_ctx: Any, fallback: str) -> str:
    ci = agent_ctx.completion_info
    if ci:
        parts = [ci.completed]
        if ci.details:
            parts.append(ci.details)
        if ci.next:
            parts.append(ci.next)
        if ci.question:
            parts.append(ci.question)
        return "\n".join(parts)
    return fallback


# ---------------------------------------------------------------------------
# Production nodes
# ---------------------------------------------------------------------------


async def plan_characters_node(
    state: Phase2State, runtime: Runtime[Phase2RuntimeContext]
) -> dict[str, Any]:
    return await _run_sub_stage(
        state, runtime, stage="plan_characters", method_name="run_characters"
    )


async def plan_shots_node(
    state: Phase2State, runtime: Runtime[Phase2RuntimeContext]
) -> dict[str, Any]:
    return await _run_sub_stage(state, runtime, stage="plan_shots", method_name="run_shots")


async def render_characters_node(
    state: Phase2State, runtime: Runtime[Phase2RuntimeContext]
) -> dict[str, Any]:
    return await _run_sub_stage(
        state, runtime, stage="render_characters", method_name="run_characters"
    )


async def render_shots_node(
    state: Phase2State, runtime: Runtime[Phase2RuntimeContext]
) -> dict[str, Any]:
    return await _run_sub_stage(state, runtime, stage="render_shots", method_name="run_shots")


async def compose_videos_node(
    state: Phase2State, runtime: Runtime[Phase2RuntimeContext]
) -> dict[str, Any]:
    return await _run_sub_stage(state, runtime, stage="compose_videos", method_name="run_videos")


async def compose_merge_node(
    state: Phase2State, runtime: Runtime[Phase2RuntimeContext]
) -> dict[str, Any]:
    return await _run_sub_stage(state, runtime, stage="compose_merge", method_name="run_merge")


# ---------------------------------------------------------------------------
# Approval nodes
# ---------------------------------------------------------------------------


async def characters_approval_node(
    state: Phase2State, runtime: Runtime[Phase2RuntimeContext]
) -> dict[str, Any]:
    agent_ctx = runtime.context.agent_context
    message = _build_approval_message(agent_ctx, "角色设定已生成，请确认是否继续创建分镜。")
    return await _manual_approval_node(
        runtime,
        approval_stage="characters_approval",
        history_key="plan_characters",
        gate="plan",
        message=message,
        next_stage="plan_shots",
    )


async def shots_approval_node(
    state: Phase2State, runtime: Runtime[Phase2RuntimeContext]
) -> dict[str, Any]:
    agent_ctx = runtime.context.agent_context
    message = _build_approval_message(agent_ctx, "分镜脚本已生成，请确认是否继续进入渲染阶段。")
    return await _manual_approval_node(
        runtime,
        approval_stage="shots_approval",
        history_key="plan_shots",
        gate="plan",
        message=message,
        next_stage="render_characters",
    )


async def character_images_approval_node(
    state: Phase2State, runtime: Runtime[Phase2RuntimeContext]
) -> dict[str, Any]:
    agent_ctx = runtime.context.agent_context
    message = _build_approval_message(
        agent_ctx, "角色形象图已渲染完成，请确认是否继续渲染分镜画面。"
    )
    return await _manual_approval_node(
        runtime,
        approval_stage="character_images_approval",
        history_key="render_characters",
        gate="render",
        message=message,
        next_stage="render_shots",
    )


async def shot_images_approval_node(
    state: Phase2State, runtime: Runtime[Phase2RuntimeContext]
) -> dict[str, Any]:
    agent_ctx = runtime.context.agent_context
    if _is_video_provider_invalid(_get_run_provider_snapshot(agent_ctx)):
        return _auto_approval_result(
            approval_stage="shot_images_approval",
            history_key="render_shots",
            next_stage="compose_videos",
        )

    message = _build_approval_message(
        agent_ctx, "分镜画面已渲染完成，请确认是否继续进入视频合成阶段。"
    )
    return await _manual_approval_node(
        runtime,
        approval_stage="shot_images_approval",
        history_key="render_shots",
        gate="render",
        message=message,
        next_stage="compose_videos",
    )


async def compose_approval_node(
    state: Phase2State, runtime: Runtime[Phase2RuntimeContext]
) -> dict[str, Any]:
    agent_ctx = runtime.context.agent_context
    message = _build_approval_message(agent_ctx, "视频合成已完成，请确认最终效果。")
    return await _manual_approval_node(
        runtime,
        approval_stage="compose_approval",
        history_key="compose_merge",
        gate="compose",
        message=message,
        next_stage="__end__",
    )


# ---------------------------------------------------------------------------
# Review node
# ---------------------------------------------------------------------------


async def review_node(state: Phase2State, runtime: Runtime[Phase2RuntimeContext]) -> dict[str, Any]:
    orchestrator = runtime.context.orchestrator
    agent_ctx = runtime.context.agent_context

    review_agent = orchestrator.agents[orchestrator._agent_index("review")]  # noqa: SLF001

    approval_feedback = state.get("approval_feedback", "")
    if approval_feedback:
        agent_ctx.user_feedback = approval_feedback

    routing = await review_agent.run(agent_ctx)
    start_agent = routing.get("start_agent") if isinstance(routing, dict) else None
    mode = "full"
    target_ids = None
    if isinstance(routing, dict):
        maybe_mode = routing.get("mode")
        if isinstance(maybe_mode, str) and maybe_mode.strip() in {"incremental", "full"}:
            mode = maybe_mode.strip()
        target_ids = routing.get("target_ids")

    if not (isinstance(start_agent, str) and start_agent.strip()):
        start_agent = "plan"
    start_agent = start_agent.strip()
    if start_agent not in ALLOWED_START_AGENTS:
        start_agent = "plan"

    agent_ctx.rerun_mode = mode
    if target_ids is not None:
        agent_ctx.target_ids = target_ids

    await orchestrator._cleanup_for_rerun(  # noqa: SLF001
        agent_ctx.project.id,
        start_agent,
        mode=mode,
    )
    await orchestrator.session.refresh(agent_ctx.project)

    return {
        "current_stage": "review",
        "route_stage": _START_AGENT_TO_STAGE.get(start_agent, "plan_characters"),
        "route_mode": mode,
        "review_requested": False,
        "approval_history": [f"review:{start_agent}:{mode}"],
    }


# ---------------------------------------------------------------------------
# Routing functions
# ---------------------------------------------------------------------------


def route_from_start(state: Phase2State) -> str:
    return state.get("current_stage") or "plan_characters"


def _route_after_approval(state: Phase2State, *, default_next: str) -> str:
    route = state.get("route_stage")
    if route:
        return route
    if state.get("review_requested"):
        return "review"
    return default_next


def route_after_characters_approval(state: Phase2State) -> str:
    return _route_after_approval(state, default_next="plan_shots")


def route_after_shots_approval(state: Phase2State) -> str:
    return _route_after_approval(state, default_next="render_characters")


def route_after_character_images_approval(state: Phase2State) -> str:
    return _route_after_approval(state, default_next="render_shots")


def route_after_shot_images_approval(state: Phase2State) -> str:
    return _route_after_approval(state, default_next="compose_videos")


def route_after_compose_videos(state: Phase2State) -> str:
    if state.get("video_generation_skipped") or state.get("route_stage") == "__end__":
        return "__end__"
    return "compose_merge"


def route_after_compose_merge(state: Phase2State) -> str:
    if state.get("video_generation_skipped") or state.get("route_stage") == "__end__":
        return "__end__"
    return "compose_approval"


def route_after_compose_approval(state: Phase2State) -> str:
    return _route_after_approval(state, default_next="__end__")


def route_after_review(state: Phase2State) -> str:
    return state.get("route_stage") or "plan_characters"


def _normalize_resume_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        maybe_action = value.get("action")
        maybe_feedback = value.get("feedback")
        if isinstance(maybe_feedback, str) and maybe_feedback.strip():
            return maybe_feedback.strip()
        if isinstance(maybe_action, str) and maybe_action == "approve":
            return ""
        if isinstance(maybe_action, str) and maybe_action == "reject":
            return value.get("reason", "") if isinstance(value.get("reason"), str) else ""
        maybe_text = value.get("text")
        if isinstance(maybe_text, str):
            return maybe_text.strip()
    return str(value).strip()
