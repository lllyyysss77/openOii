from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import select

from app.agents.base import AgentContext, BaseAgent, TargetIds
from app.agents.prompts.review import SYSTEM_PROMPT
from app.agents.utils import extract_json
from app.models.project import Character, Shot
from app.services.creative_control import infer_feedback_targets

logger = logging.getLogger(__name__)

ALLOWED_START_AGENTS = {"outline", "plan", "render", "compose"}

# Legacy / verbose names that older prompts or models may still emit.
_START_AGENT_ALIASES = {
    "outline": "outline",
    "outline_agent": "outline",
    "plan": "plan",
    "scriptwriter": "plan",
    "story": "plan",
    "render": "render",
    "character_artist": "render",
    "storyboard_artist": "render",
    "compose": "compose",
    "video_generator": "compose",
    "video_merger": "compose",
    "video": "compose",
}


def normalize_start_agent(value: Any) -> str:
    if not isinstance(value, str):
        return "plan"
    key = value.strip().lower()
    if not key:
        return "plan"
    mapped = _START_AGENT_ALIASES.get(key, key)
    if mapped in ALLOWED_START_AGENTS:
        return mapped
    return "plan"


def normalize_mode(value: Any, *, default: str = "incremental") -> str:
    if isinstance(value, str) and value.strip().lower() in {"incremental", "full"}:
        return value.strip().lower()
    return default


def _entity_target_ids(entity_type: str, entity_ids: list[int]) -> TargetIds:
    if entity_type == "character":
        return TargetIds(character_ids=list(entity_ids), shot_ids=[])
    if entity_type in {"shot", "video"}:
        return TargetIds(character_ids=[], shot_ids=list(entity_ids))
    return TargetIds()


def _selected_entity_ids(ctx: AgentContext) -> list[int]:
    multi_ids = [
        int(i)
        for i in (getattr(ctx, "entity_ids", None) or [])
        if isinstance(i, int) or (isinstance(i, str) and str(i).isdigit())
    ]
    if ctx.entity_id is not None and ctx.entity_id not in multi_ids:
        multi_ids = [ctx.entity_id, *multi_ids]
    return list(dict.fromkeys(multi_ids))


def _target_ids_from_data(data: dict[str, Any]) -> TargetIds | None:
    raw = data.get("target_ids")
    if not isinstance(raw, dict):
        return None
    character_ids = [
        int(v)
        for v in (raw.get("character_ids") or [])
        if isinstance(v, int) or (isinstance(v, str) and str(v).isdigit())
    ]
    shot_ids = [
        int(v)
        for v in (raw.get("shot_ids") or [])
        if isinstance(v, int) or (isinstance(v, str) and str(v).isdigit())
    ]
    if not character_ids and not shot_ids:
        return None
    return TargetIds(character_ids=character_ids, shot_ids=shot_ids)


async def _project_entity_state(ctx: AgentContext) -> dict[str, Any]:
    project_id = getattr(ctx.project, "id", None)
    if project_id is None:
        return {"project_id": None, "characters": [], "shots": []}

    char_res = await ctx.session.execute(
        select(Character).where(Character.project_id == project_id)
    )
    shot_res = await ctx.session.execute(
        select(Shot).where(Shot.project_id == project_id).order_by(Shot.order.asc())
    )
    characters = [
        {
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "image_url": c.image_url,
        }
        for c in char_res.scalars().all()
        if c.id is not None
    ]
    shots = [
        {
            "id": s.id,
            "order": s.order,
            "description": s.description,
            "prompt": s.prompt,
            "image_prompt": s.image_prompt,
            "image_url": s.image_url,
            "video_url": s.video_url,
            "duration": s.duration,
        }
        for s in shot_res.scalars().all()
        if s.id is not None
    ]
    return {"project_id": project_id, "characters": characters, "shots": shots}


def _apply_focus_prefix(ctx: AgentContext, entity_type: str | None, entity_ids: list[int]) -> None:
    feedback = (ctx.user_feedback or "").strip()
    if not feedback or not entity_type or not entity_ids:
        return
    if feedback.startswith("[focus:"):
        return
    focus_ids = ",".join(str(i) for i in entity_ids)
    ctx.user_feedback = f"[focus:{entity_type}:{focus_ids}] {feedback}"
    if ctx.entity_id is None:
        ctx.entity_id = entity_ids[0]


class ReviewAgent(BaseAgent):
    """Route user feedback to the correct regeneration stage via LLM."""

    name = "review"

    async def run(self, ctx: AgentContext) -> Any:
        feedback = ""
        if hasattr(ctx, "user_feedback") and ctx.user_feedback:
            feedback = ctx.user_feedback.strip()

        if not feedback:
            await self.send_message(ctx, "未找到用户反馈内容，将从规划阶段重新开始。")
            return {
                "start_agent": "plan",
                "mode": "full",
                "reason": "未提供具体反馈",
                "target_ids": None,
            }

        multi_ids = _selected_entity_ids(ctx)
        entity_state = await _project_entity_state(ctx)

        payload: dict[str, Any] = {
            "feedback": feedback,
            "feedback_type": ctx.feedback_type,
            "entity_type": ctx.entity_type,
            "entity_id": ctx.entity_id,
            "entity_ids": multi_ids,
            "state": {
                "project": {
                    "id": ctx.project.id,
                    "title": ctx.project.title,
                    "story": ctx.project.story,
                    "style": ctx.project.style,
                    "status": ctx.project.status,
                    "video_url": getattr(ctx.project, "video_url", None),
                },
                "characters": entity_state["characters"],
                "shots": entity_state["shots"],
            },
        }

        await self.send_message(ctx, "正在分析反馈并决定重跑阶段...", is_loading=True)
        try:
            resp = await self.call_llm(
                ctx,
                system_prompt=SYSTEM_PROMPT,
                user_prompt=json.dumps(payload, ensure_ascii=False),
                max_tokens=1024,
            )
            data = extract_json(resp.text)
        except Exception as exc:
            logger.warning("ReviewAgent LLM routing failed, falling back to plan: %s", exc)
            data = {}

        routing = data.get("routing") if isinstance(data.get("routing"), dict) else {}
        start_agent = normalize_start_agent(
            routing.get("start_agent") if routing else data.get("start_agent")
        )
        mode = normalize_mode(
            routing.get("mode") if routing else data.get("mode"),
            default="incremental",
        )
        reason = ""
        if isinstance(routing.get("reason"), str):
            reason = routing["reason"].strip()
        elif isinstance(data.get("reason"), str):
            reason = data["reason"].strip()

        target_ids = _target_ids_from_data(data)
        if target_ids is None:
            target_ids = infer_feedback_targets(
                {
                    "routing": {"start_agent": start_agent, "mode": mode},
                    "feedback": feedback,
                    "analysis": data.get("analysis"),
                    "target_ids": data.get("target_ids"),
                },
                entity_state,
            )

        # Canvas selection is authoritative when LLM omitted targets.
        if ctx.entity_type and multi_ids:
            selected = _entity_target_ids(ctx.entity_type, multi_ids)
            if target_ids is None or not target_ids.has_targets():
                target_ids = selected
            _apply_focus_prefix(ctx, ctx.entity_type, multi_ids)
        elif target_ids and target_ids.has_targets() and not ctx.entity_type:
            if target_ids.shot_ids and not target_ids.character_ids:
                ctx.entity_type = "shot"
                ctx.entity_id = target_ids.shot_ids[0]
                ctx.entity_ids = list(target_ids.shot_ids)
            elif target_ids.character_ids and not target_ids.shot_ids:
                ctx.entity_type = "character"
                ctx.entity_id = target_ids.character_ids[0]
                ctx.entity_ids = list(target_ids.character_ids)

        mode_desc = "增量更新" if mode == "incremental" else "重新生成"
        target_info = ""
        if target_ids and target_ids.has_targets():
            parts = []
            if target_ids.character_ids:
                parts.append(f"{len(target_ids.character_ids)} 个角色")
            if target_ids.shot_ids:
                parts.append(f"{len(target_ids.shot_ids)} 个分镜")
            target_info = f"（仅处理 {', '.join(parts)}）"

        await self.send_message(
            ctx,
            f"已收到反馈。将从 {start_agent} 阶段开始{mode_desc}{target_info}。",
            summary="已收到反馈",
        )

        return {
            "start_agent": start_agent,
            "mode": mode,
            "reason": reason or f"llm_route:{start_agent}:{mode}",
            "target_ids": target_ids,
        }


# Backward-compatible alias used by older imports/tests.
ReviewRuleEngine = ReviewAgent
