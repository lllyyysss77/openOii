from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import TargetIds
from app.models.agent_run import AgentRun
from app.models.project import Character, Project, Shot
from app.services.file_cleaner import delete_file


def _sanitize_ids(values: Any) -> list[int]:
    if not isinstance(values, list):
        return []
    cleaned: list[int] = []
    for value in values:
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            cleaned.append(value)
        elif isinstance(value, float) and value.is_integer():
            cleaned.append(int(value))
    return list(dict.fromkeys(cleaned))


def _blocking_clip_reason(status: str) -> str:
    return {
        "missing": "当前分镜视频尚未生成",
        "generating": "当前分镜视频仍在生成中",
        "failed": "当前分镜视频生成失败",
    }.get(status, "当前分镜视频不可用于最终拼接")


async def collect_project_blocking_clips(
    session: AsyncSession, project: Project
) -> list[dict[str, Any]]:
    if project.id is None:
        return []

    shot_res = await session.execute(
        select(Shot).where(Shot.project_id == project.id).order_by(Shot.order.asc())
    )
    shots = list(shot_res.scalars().all())

    run_res = await session.execute(
        select(AgentRun)
        .where(AgentRun.project_id == project.id)
        .where(AgentRun.resource_type == "shot")
        .where(AgentRun.resource_id.isnot(None))
        .order_by(AgentRun.updated_at.desc())
    )
    runs = list(run_res.scalars().all())

    latest_status_by_shot: dict[int, str] = {}
    for run in runs:
        if run.resource_id is None:
            continue
        if run.resource_id in latest_status_by_shot:
            continue
        latest_status_by_shot[run.resource_id] = run.status

    blocking_clips: list[dict[str, Any]] = []
    for shot in shots:
        if shot.id is None:
            continue

        run_status = latest_status_by_shot.get(shot.id)
        clip_status = "complete"
        if run_status in {"queued", "running"}:
            clip_status = "generating"
        elif run_status == "failed" and not shot.video_url:
            clip_status = "failed"
        elif not shot.video_url:
            clip_status = "missing"

        if clip_status == "complete":
            continue

        blocking_clips.append(
            {
                "shot_id": shot.id,
                "order": shot.order,
                "status": clip_status,
                "reason": _blocking_clip_reason(clip_status),
            }
        )

    return blocking_clips


def infer_feedback_targets(data: dict[str, Any], state: dict[str, Any]) -> TargetIds | None:
    raw_target_ids = data.get("target_ids") if isinstance(data, dict) else None
    if isinstance(raw_target_ids, dict):
        character_ids = _sanitize_ids(raw_target_ids.get("character_ids"))
        shot_ids = _sanitize_ids(raw_target_ids.get("shot_ids"))
        if character_ids or shot_ids:
            return TargetIds(character_ids=character_ids, shot_ids=shot_ids)

    analysis = data.get("analysis") if isinstance(data, dict) else None
    target_items: list[str] = []
    if isinstance(analysis, dict):
        raw_items = analysis.get("target_items")
        if isinstance(raw_items, list):
            target_items = [
                item.strip() for item in raw_items if isinstance(item, str) and item.strip()
            ]

    if not target_items:
        return None

    parsed_character_ids: list[int] = []
    parsed_shot_ids: list[int] = []
    characters = state.get("characters") if isinstance(state, dict) else []
    shots = state.get("shots") if isinstance(state, dict) else []

    for item in target_items:
        for character in characters if isinstance(characters, list) else []:
            name = character.get("name") if isinstance(character, dict) else None
            character_id = character.get("id") if isinstance(character, dict) else None
            if isinstance(name, str) and isinstance(character_id, int) and name and name in item:
                parsed_character_ids.append(character_id)
        for shot in shots if isinstance(shots, list) else []:
            shot_id = shot.get("id") if isinstance(shot, dict) else None
            order = shot.get("order") if isinstance(shot, dict) else None
            if isinstance(shot_id, int) and isinstance(order, int) and f"镜头{order}" in item:
                parsed_shot_ids.append(shot_id)
            elif isinstance(shot_id, int) and isinstance(order, int) and f"分镜{order}" in item:
                parsed_shot_ids.append(shot_id)

    character_ids = list(dict.fromkeys(parsed_character_ids))
    shot_ids = list(dict.fromkeys(parsed_shot_ids))
    if character_ids or shot_ids:
        return TargetIds(character_ids=character_ids, shot_ids=shot_ids)
    return None


async def apply_character_rerun_edits(
    session: AsyncSession,
    character: Character,
    *,
    description: str | None = None,
    image_url: str | None = None,
) -> Character:
    if description is not None:
        character.description = description
    if image_url is not None:
        delete_file(character.image_url)
        character.image_url = image_url
    session.add(character)
    await session.flush()
    return character


async def invalidate_character_downstream_outputs(
    session: AsyncSession,
    project: Project,
    character_id: int,
) -> None:
    res = await session.execute(select(Shot).where(Shot.project_id == project.id))
    shots = list(res.scalars().all())
    for shot in shots:
        if character_id not in list(shot.character_ids):
            continue
        delete_file(shot.image_url)
        delete_file(shot.video_url)
        shot.image_url = None
        shot.video_url = None
        session.add(shot)

    if project.video_url:
        project.status = "superseded"
    session.add(project)
    await session.flush()


async def invalidate_shot_storyboard_outputs(
    session: AsyncSession,
    project: Project,
    shot: Shot,
) -> None:
    delete_file(shot.image_url)
    delete_file(shot.video_url)
    shot.image_url = None
    shot.video_url = None
    if project.video_url:
        project.status = "superseded"
    session.add(shot)
    session.add(project)
    await session.flush()


async def invalidate_shot_clip_output(
    session: AsyncSession,
    project: Project,
) -> None:
    if project.video_url:
        project.status = "superseded"
    session.add(project)
    await session.flush()
