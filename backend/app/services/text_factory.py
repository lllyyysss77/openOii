from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any, Protocol

from app.config import Settings
from app.services.llm import LLMResponse, LLMService
from app.services.text import TextService


class TextServiceProtocol(Protocol):
    """文本生成服务协议（LLM 或 OpenAI 兼容）"""

    async def generate(
        self,
        *,
        messages: list[dict[str, Any]] | None = None,
        prompt: str | None = None,
        system: str | None = None,
        max_tokens: int = 1024,
        temperature: float | None = None,
        **kwargs: Any,
    ) -> LLMResponse:
        ...

    def stream(
        self,
        *,
        messages: list[dict[str, Any]],
        system: str | None = None,
        tools: list[dict[str, Any]] | None = None,
        max_tokens: int = 1024,
        **kwargs: Any,
    ) -> AsyncIterator[dict[str, Any]]:
        ...


def create_text_service(settings: Settings) -> TextServiceProtocol:
    """根据配置创建文本生成服务

    Args:
        settings: 应用配置

    Returns:
        LLMService（Anthropic）或 TextService（OpenAI 兼容）
    """
    if settings.text_provider == "fake":
        from app.services.fake_text import FakeTextService

        return FakeTextService(settings)
    if settings.text_provider == "openai":
        return TextService(settings)
    if settings.text_provider == "anthropic":
        return LLMService(settings)
    raise ValueError(f"Unsupported text provider: {settings.text_provider}")
