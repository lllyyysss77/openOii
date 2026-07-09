"""Shared helpers to inject IP universe context into agent LLM payloads."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.universe import Universe
from app.services.universe_service import UniverseService


async def build_universe_context(
    session: AsyncSession,
    project: Project,
    *,
    include_siblings: bool = True,
) -> dict[str, Any] | None:
    """Build universe payload for outline/plan (and style appendix for render)."""
    universe_id = getattr(project, "universe_id", None)
    if not universe_id:
        return None

    universe = await session.get(Universe, universe_id)
    if not universe or not getattr(universe, "is_active", True):
        return None

    svc = UniverseService(session)
    shared_chars = await svc.get_universe_shared_characters(universe.id)

    result: dict[str, Any] = {
        "universe_name": universe.name,
        "universe_id": universe.id,
        "chapter_number": getattr(project, "chapter_number", None),
        "chapter_title": getattr(project, "chapter_title", None),
    }
    if universe.description:
        result["description"] = universe.description
    if universe.world_setting:
        result["world_setting"] = universe.world_setting
    if universe.style_rules:
        result["style_rules"] = universe.style_rules
    if shared_chars:
        result["shared_characters"] = [
            {
                "id": sc.id,
                "name": sc.name,
                "description": sc.description,
                "visual_notes": sc.visual_notes,
                "canonical_image_url": sc.canonical_image_url,
                "tags": sc.character_tags,
                "version": sc.version,
            }
            for sc in shared_chars
        ]
    if include_siblings:
        siblings = await svc.get_sibling_chapter_summaries(
            universe.id,
            exclude_project_id=project.id,
            limit=8,
        )
        if siblings:
            result["sibling_chapters"] = siblings
    return result


def universe_style_appendix(universe_context: dict[str, Any] | None) -> str:
    """Compact style lock string for image/video prompts."""
    if not universe_context:
        return ""
    parts: list[str] = []
    name = universe_context.get("universe_name")
    if name:
        parts.append(f"IP universe: {name}")
    style_rules = universe_context.get("style_rules")
    if isinstance(style_rules, str) and style_rules.strip():
        parts.append(f"Universe style rules: {style_rules.strip()[:400]}")
    return "; ".join(parts)
