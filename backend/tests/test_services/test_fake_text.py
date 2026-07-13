from __future__ import annotations

import json

import pytest

from app.config import Settings
from app.services.fake_text import FakeTextService


@pytest.mark.asyncio
async def test_fake_text_honors_target_shot_count() -> None:
    service = FakeTextService(Settings(database_url="sqlite+aiosqlite:///:memory:"))
    payload = {
        "task": "shots",
        "project": {
            "title": "Local E2E",
            "story": "A tiny two-shot local test.",
            "style": "anime",
            "target_shot_count": 2,
        },
    }

    response = await service.generate(prompt=json.dumps(payload, ensure_ascii=False))
    data = json.loads(response.text)

    assert len(data["shots"]) == 2


@pytest.mark.asyncio
async def test_fake_text_review_routes_without_external_llm() -> None:
    from app.agents.prompts.review import SYSTEM_PROMPT

    service = FakeTextService(Settings(database_url="sqlite+aiosqlite:///:memory:"))
    payload = {
        "feedback": "重试合成",
        "feedback_type": "video",
        "state": {
            "characters": [{"id": 1, "name": "小欧"}],
            "shots": [{"id": 2, "order": 1}],
        },
    }

    response = await service.generate(
        system=SYSTEM_PROMPT,
        prompt=json.dumps(payload, ensure_ascii=False),
    )
    data = json.loads(response.text)

    assert data["agent"] == "review"
    assert data["routing"]["start_agent"] == "compose"
    assert data["routing"]["mode"] == "incremental"


@pytest.mark.asyncio
async def test_fake_text_visual_notes_response() -> None:
    service = FakeTextService(Settings(database_url="sqlite+aiosqlite:///:memory:"))
    response = await service.generate(
        system=(
            "You are a character visual design assistant. "
            "Extract key VISUAL traits from the character description."
        ),
        prompt=(
            "Character name: 小欧\n"
            "Description: 黑色短发，蓝白外套，胸前播放按钮徽章。\n\n"
            "Extract the key visual traits."
        ),
    )

    assert "小欧" in response.text
    assert "视觉特征" in response.text or "短发" in response.text


@pytest.mark.asyncio
async def test_fake_text_reimagine_response() -> None:
    service = FakeTextService(Settings(database_url="sqlite+aiosqlite:///:memory:"))
    response = await service.generate(
        system="你是动画导演助理。根据用户提供的参考片描述输出严格 JSON 对象。 schema keys: [\"narrative_arc\"]",
        prompt="参考内容：\n主角在工作室按下生成按钮\n\n只输出一个 JSON 对象，不要 Markdown 代码块，不要额外解释。",
    )
    data = json.loads(response.text)

    assert "narrative_arc" in data
    assert "characters" in data
    assert data["visual_style"]


@pytest.mark.asyncio
async def test_fake_text_incremental_plan_preserves_ids() -> None:
    service = FakeTextService(Settings(database_url="sqlite+aiosqlite:///:memory:"))
    payload = {
        "task": "characters",
        "mode": "incremental",
        "user_feedback": "把小欧的外套改成红色",
        "project": {"title": "Local", "story": "test", "style": "anime"},
        "existing_state": {
            "characters": [
                {"id": 11, "name": "小欧", "description": "主角", "visual_notes": "蓝外套"},
                {"id": 12, "name": "调试精灵", "description": "助手"},
            ],
            "shots": [{"id": 21, "order": 1, "description": "开场"}],
        },
        "focus_entity": {"type": "character", "id": 11},
    }

    response = await service.generate(
        system="You are PlanAgent for openOii",
        prompt=json.dumps(payload, ensure_ascii=False),
    )
    data = json.loads(response.text)

    assert [c["id"] for c in data["characters"]] == [11, 12]
    assert 11 in data["preserve_ids"]["characters"]
    assert "红色" in data["characters"][0]["description"] or "反馈" in data["characters"][0]["description"]


@pytest.mark.asyncio
async def test_fake_text_critic_response() -> None:
    service = FakeTextService(Settings(database_url="sqlite+aiosqlite:///:memory:"))
    response = await service.generate(
        system="You are CriticAgent for openOii, a visual quality reviewer.",
        prompt=json.dumps({"image_url": "/static/images/a.svg", "description": "test"}),
    )
    data = json.loads(response.text)

    assert data["score"] == 10
    assert data["dimensions"]["consistency"] == 10
