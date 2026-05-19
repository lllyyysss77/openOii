"""Fake video service for local development and tests.

This provider never calls external video APIs. It returns a configured local fixture
URL/path for shot clips and delegates final stitching to VideoMergerService.
"""

from __future__ import annotations

import logging
import shutil
import uuid
from pathlib import Path
from typing import Any

from app.config import Settings
from app.services.file_cleaner import get_local_path
from app.services.video_merger import get_video_merger_service

logger = logging.getLogger(__name__)

STATIC_VIDEO_DIR = Path(__file__).parent.parent / "static" / "videos"


class FakeVideoService:
    """Video provider used only for explicit local development/test configuration."""

    def __init__(self, settings: Settings):
        self.settings = settings

    async def generate_url(
        self,
        *,
        prompt: str,
        image_bytes: bytes | None = None,
        image_url: str | None = None,
        **kwargs: Any,
    ) -> str:
        """Return configured fixture URL, copying local fixture files into static output."""
        fixture_url = (self.settings.fake_video_fixture_url or "").strip()
        if fixture_url:
            logger.info("Fake video provider returning fixture URL: %s", fixture_url)
            return fixture_url

        fixture_path = (self.settings.fake_video_fixture_path or "").strip()
        if fixture_path:
            source = Path(fixture_path).expanduser().resolve()
            if not source.is_file():
                raise RuntimeError(f"Fake video fixture file not found: {source}")

            STATIC_VIDEO_DIR.mkdir(parents=True, exist_ok=True)
            suffix = source.suffix or ".mp4"
            filename = f"fake_clip_{uuid.uuid4().hex[:8]}{suffix}"
            destination = STATIC_VIDEO_DIR / filename
            shutil.copyfile(source, destination)
            logger.info("Fake video provider copied fixture to %s", destination)
            return f"/static/videos/{filename}"

        raise RuntimeError(
            "Fake video provider requires FAKE_VIDEO_FIXTURE_URL or FAKE_VIDEO_FIXTURE_PATH"
        )

    async def merge_urls(self, video_urls: list[str]) -> str:
        """Merge generated fixture clips through the real ffmpeg merger."""
        if not video_urls:
            raise RuntimeError("No video URLs provided for merging")

        merger = get_video_merger_service()
        return await merger.merge_videos(video_urls)

    @staticmethod
    def is_local_static_url(url: str) -> bool:
        """Return whether URL points to a backend static file."""
        return get_local_path(url) is not None
