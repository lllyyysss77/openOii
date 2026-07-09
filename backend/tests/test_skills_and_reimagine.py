"""Skill catalog + reimagine + graph driver unit tests."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.orchestration.driver import gate_name_from_interrupt, drive_graph_until_idle
from app.services.reimagine import ReimagineRequest, analyze_reimagine
from app.skills.catalog import get_skill, resolve_skill_entry
from app.skills.context import (
    apply_skill_defaults_to_create,
    resolve_project_skill_id,
    skill_payload,
)


def test_skill_catalog_has_core_entries():
    assert get_skill("story-anime") is not None
    assert get_skill("quick-short") is not None
    assert get_skill("video-reimagine") is not None
    assert get_skill("character-design") is not None
    # Every skill must ship creative directives (not a hollow catalog)
    for skill_id in (
        "story-anime",
        "character-design",
        "script-breakdown",
        "quick-short",
        "video-reimagine",
        "product-ad",
        "scene-design",
        "comedy-pet",
    ):
        skill = get_skill(skill_id)
        assert skill is not None
        assert skill.directives.strip()


def test_resolve_skill_quick_prefers_auto_mode():
    res = resolve_skill_entry("quick-short", auto_mode=False, outline_enabled=True)
    assert res.auto_mode is True
    assert res.start_stage == "plan_outline"
    assert res.default_target_shot_count == 5


def test_resolve_skill_character_design_entry():
    res = resolve_skill_entry("character-design", outline_enabled=True)
    assert res.start_agent == "plan"
    assert res.start_stage == "plan_characters"
    assert "角色" in res.directives or "visual" in res.directives.lower()


def test_resolve_skill_outline_disabled_fallback():
    res = resolve_skill_entry("story-anime", outline_enabled=False)
    assert res.start_agent == "plan"
    assert res.start_stage == "plan_characters"


def test_resolve_unknown_skill_defaults():
    res = resolve_skill_entry(None, outline_enabled=True)
    assert res.skill is None
    assert res.start_agent == "outline"


def test_skill_payload_and_create_defaults():
    payload = skill_payload("product-ad")
    assert payload is not None
    assert payload["id"] == "product-ad"
    assert "directives" in payload
    assert payload["pipeline_hints"]["prioritize"] == "product"

    defaults = apply_skill_defaults_to_create(
        skill_id="quick-short",
        story=None,
        style=None,
        target_shot_count=None,
        creation_mode=None,
    )
    assert defaults["skill_id"] == "quick-short"
    assert defaults["style"] == "anime"
    assert defaults["target_shot_count"] == 5
    assert defaults["creation_mode"] == "quick"


def test_resolve_project_skill_id_prefers_request():
    assert (
        resolve_project_skill_id(
            request_skill_id="quick-short",
            project_skill_id="story-anime",
        )
        == "quick-short"
    )
    assert (
        resolve_project_skill_id(
            request_skill_id=None,
            project_skill_id="character-design",
        )
        == "character-design"
    )


@pytest.mark.asyncio
async def test_reimagine_heuristic_analysis():
    analysis = await analyze_reimagine(
        ReimagineRequest(
            source_brief="末日办公室，员工一拳打向老板，搞笑反转，漫画特效",
            replacements={"characters": "穿青蛙帽的实习生"},
        ),
        llm=None,
    )
    assert len(analysis.dimensions) == 18
    assert analysis.slots
    assert "拉片复刻" in analysis.reconstructed_prompt
    assert any(d.key == "characters" and "青蛙" in d.value for d in analysis.dimensions)


@pytest.mark.asyncio
async def test_reimagine_llm_keyword_generate():
    """LLM path must use keyword-only generate(prompt=..., system=...)."""

    class FakeLLM:
        def __init__(self):
            self.called_with = None

        async def generate(self, *, prompt=None, system=None, max_tokens=1024, **kwargs):
            self.called_with = {"prompt": prompt, "system": system, "max_tokens": max_tokens}
            return SimpleNamespace(
                text='{"narrative_arc":"办公室反叛","characters":"实习生","emotion":"荒诞幽默",'
                '"scenes":"末日办公室","shot_types":"特写+中景","camera_moves":"手持",'
                '"framing":"中心构图","pacing":"快","color_grade":"冷灰","lighting":"日光灯",'
                '"sound_design":" thrash","music":"电子","dialogue_tone":"吐槽",'
                '"visual_style":"漫画","effects":"冲击线","hooks":"一拳","time_structure":"线性",'
                '"props":"咖啡杯"}'
            )

    llm = FakeLLM()
    analysis = await analyze_reimagine(
        ReimagineRequest(source_brief="办公室一拳"),
        llm=llm,
    )
    assert llm.called_with is not None
    assert llm.called_with["prompt"]
    assert llm.called_with["system"]
    assert any(d.key == "narrative_arc" and "反叛" in d.value for d in analysis.dimensions)


def test_gate_name_from_interrupt():
    class FakeInterrupt:
        value = {"gate": "outline_approval", "message": "ok"}

    assert gate_name_from_interrupt(FakeInterrupt()) == "outline_approval"


@pytest.mark.asyncio
async def test_drive_graph_until_idle_interrupt_loop():
    calls = {"n": 0}

    class FakeGraph:
        async def ainvoke(self, payload, config, context=None):
            calls["n"] += 1
            if calls["n"] == 1:
                class Interrupt:
                    value = {"gate": "characters_approval"}

                return {
                    "current_stage": "characters_approval",
                    "__interrupt__": [Interrupt()],
                }
            return {"current_stage": "compose_merge", "video_generation_skipped": False}

    async def on_interrupt(item):
        return {"action": "approve", "feedback": ""}

    result = await drive_graph_until_idle(
        FakeGraph(),
        initial_payload={"route_stage": "plan_characters"},
        graph_config={"configurable": {"thread_id": "t1"}},
        runtime_context=None,
        on_interrupt=on_interrupt,
        run_id=1,
    )
    assert result.final_stage == "compose_merge"
    assert result.interrupt_count == 1
    assert calls["n"] == 2
