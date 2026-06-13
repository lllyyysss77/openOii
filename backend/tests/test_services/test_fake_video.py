from __future__ import annotations

from app.services.fake_video import _prompt_label


def test_prompt_label_uses_ascii_fallback_for_non_ascii_prompt() -> None:
    label = _prompt_label("一只猫在沙滩上奔跑，电影感镜头")

    assert label.startswith("local prompt ")
    assert label.isascii()


def test_prompt_label_does_not_use_leftover_numeric_suffix_as_label() -> None:
    label = _prompt_label("中文提示本地占位视频-修复验证-20260613")

    assert label.startswith("local prompt ")
    assert label.isascii()


def test_prompt_label_does_not_use_short_ascii_suffix_as_label() -> None:
    label = _prompt_label("中文提示本地占位视频-修复验证-v2")

    assert label.startswith("local prompt ")
    assert label.isascii()


def test_prompt_label_keeps_readable_ascii_prompt() -> None:
    assert _prompt_label("make a video with a cat") == "make a video with a cat"
