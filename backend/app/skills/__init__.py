"""Skill registry — configurable workflow entry points (OiiOii-style)."""

from .catalog import SKILL_CATALOG, SkillDefinition, get_skill, list_skills, resolve_skill_entry
from .context import (
    apply_skill_defaults_to_create,
    resolve_project_skill_id,
    skill_payload,
    skill_system_appendix,
)

__all__ = [
    "SKILL_CATALOG",
    "SkillDefinition",
    "apply_skill_defaults_to_create",
    "get_skill",
    "list_skills",
    "resolve_project_skill_id",
    "resolve_skill_entry",
    "skill_payload",
    "skill_system_appendix",
]
