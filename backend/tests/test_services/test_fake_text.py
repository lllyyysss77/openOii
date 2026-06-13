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
