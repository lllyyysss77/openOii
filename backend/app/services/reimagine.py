"""拉片复刻 v0 — structured breakdown of a reference brief.

Full video upload + multi-modal frame analysis is Phase 5+.
v0 accepts a text brief (transcript / shot notes / free-form description)
and returns director-style dimensions + replaceable slots + a reconstructed
prompt ready to feed the story pipeline.
"""

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel, Field

# Canonical 18 director dimensions (aligned with public OiiOii 2.0 messaging).
REIMAGINE_DIMENSIONS: tuple[tuple[str, str], ...] = (
    ("narrative_arc", "叙事结构"),
    ("time_structure", "时间结构"),
    ("characters", "角色"),
    ("scenes", "场景"),
    ("props", "道具"),
    ("shot_types", "镜头类型"),
    ("camera_moves", "运镜"),
    ("framing", "构图/景别"),
    ("pacing", "节奏"),
    ("color_grade", "色彩"),
    ("lighting", "布光"),
    ("sound_design", "声音设计"),
    ("music", "音乐"),
    ("dialogue_tone", "对白语气"),
    ("visual_style", "画面风格"),
    ("effects", "特效"),
    ("emotion", "情绪基调"),
    ("hooks", "爆点/钩子"),
)


class ReimagineSlot(BaseModel):
    key: str
    label: str
    current_value: str
    replaceable: bool = True


class ReimagineDimension(BaseModel):
    key: str
    label: str
    value: str


class ReimagineAnalysis(BaseModel):
    dimensions: list[ReimagineDimension]
    slots: list[ReimagineSlot]
    reconstructed_prompt: str
    source_brief: str
    skill_id: str = "video-reimagine"


class ReimagineRequest(BaseModel):
    source_brief: str = Field(min_length=1, max_length=12000)
    replacements: dict[str, str] = Field(default_factory=dict)
    style_hint: str | None = None


def _heuristic_breakdown(brief: str) -> dict[str, str]:
    """Offline-safe structured guess when LLM is unavailable."""
    text = brief.strip()
    first_line = text.splitlines()[0][:120] if text else ""
    return {
        "narrative_arc": first_line or "未解析到明确叙事弧",
        "time_structure": "线性短片" if len(text) < 800 else "多段落短片",
        "characters": _guess_entities(text, ("主角", "角色", "人物")),
        "scenes": _guess_entities(text, ("场景", "地点", "城市", "房间")),
        "props": _guess_entities(text, ("道具", "物品", "武器")),
        "shot_types": "中景/特写交替",
        "camera_moves": "推拉 + 跟随",
        "framing": "主体居中，适度负空间",
        "pacing": "前缓后急" if "高潮" in text or "反转" in text else "均匀推进",
        "color_grade": "暖色" if any(w in text for w in ("阳光", "暖", "黄昏")) else "中性",
        "lighting": "自然光优先",
        "sound_design": "环境音 + 点缀 Foley",
        "music": "情绪匹配 BGM",
        "dialogue_tone": "口语" if "对话" in text or "说" in text else "旁白为主",
        "visual_style": "动画/漫剧",
        "effects": "少量冲击帧" if any(w in text for w in ("爆炸", "特效", "魔法")) else "写实过渡",
        "emotion": _guess_emotion(text),
        "hooks": "开场冲突 + 结尾反转" if "反转" in text else "角色目标驱动",
    }


def _guess_entities(text: str, keywords: tuple[str, ...]) -> str:
    for kw in keywords:
        if kw in text:
            # Grab a short window around first keyword hit
            idx = text.index(kw)
            snippet = text[max(0, idx - 8) : idx + 24].replace("\n", " ").strip()
            return snippet or kw
    return "待用户补充"


def _guess_emotion(text: str) -> str:
    mapping = (
        (("搞笑", "幽默", "沙雕"), "轻松搞笑"),
        (("恐怖", "惊悚", "悬疑"), "紧张悬疑"),
        (("治愈", "温馨", "感动"), "温暖治愈"),
        (("热血", "战斗", "燃"), "热血激昂"),
    )
    for keys, label in mapping:
        if any(k in text for k in keys):
            return label
    return "中性叙事"


def _apply_replacements(values: dict[str, str], replacements: dict[str, str]) -> dict[str, str]:
    out = dict(values)
    for key, new_val in replacements.items():
        if not new_val or not str(new_val).strip():
            continue
        k = key.strip()
        if k in out:
            out[k] = str(new_val).strip()
        else:
            # allow label-based override
            for dim_key, dim_label in REIMAGINE_DIMENSIONS:
                if k in (dim_key, dim_label) and dim_key in out:
                    out[dim_key] = str(new_val).strip()
    return out


def _reconstruct_prompt(
    values: dict[str, str],
    *,
    style_hint: str | None,
    replacements: dict[str, str],
) -> str:
    lines = [
        "【拉片复刻生成指令】",
        "请按下列导演维度生成可执行漫剧分镜与角色设定：",
    ]
    for key, label in REIMAGINE_DIMENSIONS:
        lines.append(f"- {label}（{key}）: {values.get(key, '未指定')}")
    if style_hint:
        lines.append(f"- 用户指定风格: {style_hint}")
    if replacements:
        lines.append("- 元素替换:")
        for k, v in replacements.items():
            lines.append(f"  · {k} → {v}")
    lines.append("要求：保持结构与节奏，替换元素后角色/场景一致，镜头可并行生成。")
    return "\n".join(lines)


async def analyze_reimagine(
    request: ReimagineRequest,
    *,
    llm: Any | None = None,
) -> ReimagineAnalysis:
    """Produce structured 拉片 analysis.

    If an LLM client with ``complete(prompt)`` / ``generate`` is provided,
    prefer model output; otherwise fall back to heuristics (always works offline).
    """
    values = _heuristic_breakdown(request.source_brief)

    if llm is not None:
        try:
            values = await _llm_breakdown(llm, request.source_brief, values)
        except Exception as exc:
            # Soft-fail: keep heuristic values, but log
            import logging

            logging.getLogger(__name__).warning("reimagine analyze LLM error: %s", exc)

    values = _apply_replacements(values, request.replacements)
    dimensions = [
        ReimagineDimension(key=key, label=label, value=values.get(key, ""))
        for key, label in REIMAGINE_DIMENSIONS
    ]
    # High-leverage replaceable slots for UI
    slot_keys = ("characters", "scenes", "props", "visual_style", "effects", "music")
    label_map = dict(REIMAGINE_DIMENSIONS)
    slots = [
        ReimagineSlot(
            key=k,
            label=label_map[k],
            current_value=values.get(k, ""),
            replaceable=True,
        )
        for k in slot_keys
    ]
    prompt = _reconstruct_prompt(
        values,
        style_hint=request.style_hint,
        replacements=request.replacements,
    )
    return ReimagineAnalysis(
        dimensions=dimensions,
        slots=slots,
        reconstructed_prompt=prompt,
        source_brief=request.source_brief,
    )


async def _llm_breakdown(llm: Any, brief: str, fallback: dict[str, str]) -> dict[str, str]:
    import logging

    logger = logging.getLogger(__name__)
    keys = [k for k, _ in REIMAGINE_DIMENSIONS]
    system = (
        "你是动画导演助理。根据用户提供的参考片描述/脚本/口播/分镜笔记，"
        "输出严格 JSON 对象，键必须完整覆盖下列 schema，值为简洁中文（每项 1 句内）。"
        "不要编造与原文完全无关的剧情；缺失信息用合理导演推断并标注「推断」。"
        f" schema keys: {json.dumps(keys, ensure_ascii=False)}"
    )
    user_prompt = (
        f"参考内容：\n{brief}\n\n"
        "只输出一个 JSON 对象，不要 Markdown 代码块，不要额外解释。"
    )

    raw: str | None = None
    try:
        if hasattr(llm, "generate"):
            # TextService / LLMService: keyword-only API
            resp = await llm.generate(
                prompt=user_prompt,
                system=system,
                max_tokens=2048,
                temperature=0.3,
            )
            raw = getattr(resp, "text", None) or getattr(resp, "content", None) or str(resp)
        elif callable(llm):
            raw = str(await llm(user_prompt))
    except TypeError:
        # Legacy positional adapters
        try:
            resp = await llm.generate(user_prompt)  # type: ignore[misc]
            raw = getattr(resp, "content", None) or str(resp)
        except Exception as exc:
            logger.warning("reimagine LLM positional fallback failed: %s", exc)
            return fallback
    except Exception as exc:
        logger.warning("reimagine LLM breakdown failed: %s", exc)
        return fallback

    if not raw:
        return fallback

    parsed = _extract_json_object(raw)
    if not parsed:
        logger.warning("reimagine LLM returned non-JSON; using heuristic")
        return fallback

    merged = dict(fallback)
    for key in keys:
        val = parsed.get(key)
        if isinstance(val, str) and val.strip():
            merged[key] = val.strip()
        elif isinstance(val, list):
            joined = "、".join(str(x).strip() for x in val if str(x).strip())
            if joined:
                merged[key] = joined
    return merged


def _extract_json_object(text: str) -> dict[str, Any] | None:
    text = text.strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None
