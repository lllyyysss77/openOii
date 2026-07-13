from __future__ import annotations

import json
import re
from typing import Any, AsyncIterator

from app.config import Settings
from app.services.llm import LLMResponse
from app.services.text_capabilities import TextProviderCapability


class FakeTextService:
    """Local/dev text provider that never calls external APIs.

    The fake provider is intentionally schema-aware for the built-in agents so
    a complete local generation flow can be exercised without paid API calls.
    """

    def __init__(self, settings: Settings):
        self.settings = settings

    def _configured_response(self) -> str | None:
        configured = self.settings.fake_text_response
        if configured and configured.strip():
            return configured.strip()
        return None

    @staticmethod
    def _message_text(messages: list[dict[str, Any]] | None) -> str:
        parts: list[str] = []
        for message in messages or []:
            content = message.get("content")
            if isinstance(content, str):
                parts.append(content)
            elif isinstance(content, list):
                for block in content:
                    if isinstance(block, dict):
                        text = block.get("text")
                        if isinstance(text, str):
                            parts.append(text)
        return "\n".join(parts)

    @staticmethod
    def _payload_from_text(text: str) -> dict[str, Any]:
        stripped = text.strip()
        candidates = [stripped]

        # In normal agent calls the user prompt is exactly JSON, but some test
        # harnesses/proxies wrap it with extra text. Keep fake mode resilient so
        # local E2E testing does not collapse to empty characters/shots.
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start != -1 and end > start:
            candidates.append(stripped[start : end + 1])

        for candidate in candidates:
            try:
                data = json.loads(candidate)
                return data if isinstance(data, dict) else {}
            except json.JSONDecodeError:
                continue
        return {}

    @staticmethod
    def _project_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
        project = payload.get("project")
        return project if isinstance(project, dict) else {}

    @staticmethod
    def _json_text(payload: dict[str, Any]) -> str:
        return json.dumps(payload, ensure_ascii=False)

    def _outline_response(self, payload: dict[str, Any]) -> str:
        project = self._project_from_payload(payload)
        title = str(project.get("title") or "本地测试故事")
        story = str(project.get("story") or "一个角色在测试环境中完成冒险。")
        style = str(project.get("style") or "清爽漫画风")
        short_story = story[:80]
        data = {
            "agent": "outline",
            "user_message": f"Fake 大纲已生成：{short_story}",
            "story_outline": {
                "logline": f"{title}：主角在低成本本地测试中验证完整生成链路。",
                "genre": ["本地测试", "轻冒险"],
                "themes": ["验证", "协作", "成长"],
                "setting": "一间充满便签和屏幕的创作工作室",
                "tone": "轻快、明确、适合快速预览",
                "acts": [
                    {"act": 1, "title": "起", "summary": "主角提出故事想法，系统开始拆解核心冲突。"},
                    {"act": 2, "title": "承转", "summary": "角色进入测试场景，发现每个生成环节都需要稳定衔接。"},
                    {"act": 3, "title": "合", "summary": "所有 Fake 素材顺利汇合，形成可预览的漫剧片段。"},
                ],
                "emotional_arc": "从好奇到紧张排查，再到确认流程跑通后的安心。",
            },
            "visual_bible": f"{style}；明亮背景，高对比线条，角色表情清晰，构图简洁，适合本地 Fake 占位素材。",
            "project_update": {
                "title": title if title != "Untitled" else "Fake 本地测试短片",
                "summary": f"{short_story}（Fake 文本生成，本地测试不扣费）",
            },
        }
        return self._json_text(data)

    def _plan_base(self, payload: dict[str, Any]) -> dict[str, Any]:
        project = self._project_from_payload(payload)
        title = str(project.get("title") or "Fake 本地测试短片")
        style = str(project.get("style") or "清爽漫画风")
        summary = str(project.get("story") or project.get("summary") or "本地测试生成链路")[:120]
        return {
            "agent": "plan",
            "user_message": "Fake 规划已生成，可用于本地端到端测试，不会调用外部文本 API。",
            "project_update": {
                "title": title,
                "style": style,
                "status": "planning",
                "summary": summary,
            },
            "visual_bible": (
                f"{style}；稳定角色轮廓，干净背景，蓝紫色测试工作室与暖黄色想象世界形成对比；"
                "所有占位素材都应清晰标注 Fake、本地、无外部 API。"
            ),
            "story_breakdown": {
                "logline": summary,
                "genre": ["本地测试"],
                "themes": ["可靠性", "低成本验证"],
                "setting": "创作工作台与想象世界交叠的空间",
                "tone": "轻快、清晰",
            },
            "preserve_ids": {"characters": [], "shots": []},
            "characters": [],
            "shots": [],
        }

    def _default_characters(self, project: dict[str, Any]) -> list[dict[str, Any]]:
        hints = project.get("character_hints")
        characters: list[dict[str, Any]] = []
        if isinstance(hints, list) and hints:
            for idx, hint in enumerate(hints, start=1):
                text = str(hint).strip() or f"测试角色{idx}"
                name, _, desc = text.partition("：")
                characters.append(
                    {
                        "id": None,
                        "name": name.strip() or f"测试角色{idx}",
                        "description": desc.strip() or f"来自用户提示“{text}”的主要角色。",
                        "role": "protagonist" if idx == 1 else "supporting",
                        "personality_traits": ["主动", "清晰"],
                        "goals": "帮助验证本地 Fake 生成流程",
                        "costume_notes": "简洁现代服装，便于占位图呈现",
                        "visual_notes": "轮廓明确，表情友好，佩戴小型创作徽章",
                    }
                )
            return characters
        return [
            {
                "id": None,
                "name": "小欧",
                "description": "负责把故事想法推进成漫剧片段的测试主角。",
                "role": "protagonist",
                "personality_traits": ["好奇", "果断"],
                "goals": "验证生成流程是否闭环",
                "costume_notes": "蓝白色外套，胸前有播放按钮徽章",
                "visual_notes": "黑色短发，琥珀色眼睛，中等身高，蓝白外套，胸前有黄色播放按钮徽章，表情明亮。",
            },
            {
                "id": None,
                "name": "调试精灵",
                "description": "提醒主角检查配置、素材和进度状态的辅助角色。",
                "role": "supporting",
                "personality_traits": ["细致", "可靠"],
                "goals": "帮助发现流程中的断点",
                "costume_notes": "小披风和工具腰包",
                "visual_notes": "小体型悬浮角色，青绿色发光眼睛，半透明小披风，工具腰包，手持扳手形光标。",
            },
            {
                "id": None,
                "name": "时间线猫",
                "description": "守在视频时间线旁，负责把首帧、视频片段和最终拼接结果串起来的吉祥物。",
                "role": "supporting",
                "personality_traits": ["机灵", "爱整理"],
                "goals": "确保每个分镜都有占位图片、占位视频和拼接结果",
                "costume_notes": "深灰色小披肩，尾巴末端像播放进度条",
                "visual_notes": "圆脸橘猫，绿色眼睛，小体型，深灰披肩，尾巴带黄色进度条纹，脖子挂迷你场记板。",
            },
        ]

    @staticmethod
    def _existing_characters(payload: dict[str, Any]) -> list[dict[str, Any]]:
        existing = payload.get("existing_state")
        if not isinstance(existing, dict):
            return []
        characters = existing.get("characters")
        if not isinstance(characters, list):
            return []
        out: list[dict[str, Any]] = []
        for item in characters:
            if not isinstance(item, dict):
                continue
            out.append(
                {
                    "id": item.get("id"),
                    "name": str(item.get("name") or "角色"),
                    "description": str(item.get("description") or "已有角色设定"),
                    "role": item.get("role") or "supporting",
                    "personality_traits": item.get("personality_traits") or ["稳定"],
                    "goals": item.get("goals") or "继续本地 Fake 流程",
                    "costume_notes": item.get("costume_notes") or "保持现有服装",
                    "visual_notes": item.get("visual_notes") or "保持现有视觉特征",
                }
            )
        return out

    @staticmethod
    def _existing_shots(payload: dict[str, Any]) -> list[dict[str, Any]]:
        existing = payload.get("existing_state")
        if not isinstance(existing, dict):
            return []
        shots = existing.get("shots")
        if not isinstance(shots, list):
            return []
        out: list[dict[str, Any]] = []
        for item in shots:
            if not isinstance(item, dict):
                continue
            order = item.get("order") if isinstance(item.get("order"), int) else len(out) + 1
            out.append(
                {
                    "id": item.get("id"),
                    "order": order,
                    "scene": item.get("scene") or f"场景{order}",
                    "action": item.get("action") or "继续推进",
                    "expression": item.get("expression") or "专注",
                    "camera": item.get("camera") or "中景",
                    "lighting": item.get("lighting") or "柔和光线",
                    "dialogue": item.get("dialogue") or "",
                    "sfx": item.get("sfx") or "",
                    "duration": item.get("duration") if item.get("duration") is not None else 2.0,
                    "description": item.get("description") or f"分镜 {order}",
                    "image_prompt": item.get("image_prompt") or f"分镜 {order} 占位图",
                    "video_prompt": item.get("video_prompt") or f"分镜 {order} 占位视频",
                }
            )
        return out

    def _character_response(self, payload: dict[str, Any]) -> str:
        data = self._plan_base(payload)
        project = self._project_from_payload(payload)
        mode = str(payload.get("mode") or "full").strip().lower()
        feedback = str(payload.get("user_feedback") or "").strip()

        existing = self._existing_characters(payload)
        if mode == "incremental" and existing:
            characters = existing
            focus = payload.get("focus_entity") if isinstance(payload.get("focus_entity"), dict) else {}
            focus_id = focus.get("id") if focus.get("type") == "character" else None
            for char in characters:
                if focus_id is not None and char.get("id") == focus_id and feedback:
                    char["description"] = f"{char.get('description') or ''}（按反馈调整：{feedback[:60]}）".strip()
                    char["visual_notes"] = f"{char.get('visual_notes') or ''}；反馈：{feedback[:40]}".strip("；")
                elif feedback and focus_id is None:
                    char["description"] = f"{char.get('description') or ''}（增量微调）".strip()
            data["preserve_ids"] = {
                "characters": [c["id"] for c in characters if isinstance(c.get("id"), int)],
                "shots": [
                    s.get("id")
                    for s in self._existing_shots(payload)
                    if isinstance(s.get("id"), int)
                ],
            }
            data["user_message"] = f"已增量更新 {len(characters)} 个 Fake 角色设定。"
        else:
            characters = self._default_characters(project)
            data["user_message"] = f"已生成 {len(characters)} 个 Fake 角色设定。"

        data["characters"] = characters
        return self._json_text(data)

    def _default_shots(self, project: dict[str, Any]) -> list[dict[str, Any]]:
        target = project.get("target_shot_count")
        try:
            shot_count = int(target) if target is not None else 6
        except (TypeError, ValueError):
            shot_count = 6
        shot_count = max(1, min(shot_count, 8))
        shot_templates = [
            ("创作工作室", "小欧按下开始生成按钮，屏幕上亮起 Fake 三个字", "期待而专注", "中景缓慢推近", "柔和蓝色屏幕光", "开始本地测试。", "键盘轻响"),
            ("分镜白板前", "调试精灵用发光光标圈出文本、图片、视频三个开关", "认真提醒", "近景横移", "明亮顶光", "Fake 模式已开启。", "提示音"),
            ("角色展示台", "小欧、调试精灵、时间线猫依次站上旋转台", "自信亮相", "三连中景切换", "黄色轮廓光", "角色齐了！", "相机快门声"),
            ("想象世界入口", "占位图片像卡片一样从门内飞出并贴到分镜板", "惊喜", "全景拉开", "彩色轮廓光", "首帧画面出来了。", "轻快转场"),
            ("视频时间线", "时间线猫把多个 Fake 视频片段拖入轨道并自动吸附", "机灵得意", "俯拍推进", "蓝紫色工作灯", "片段开始拼接。", "轨道吸附声"),
            ("预览屏幕前", "三位角色一起观看最终合成视频，屏幕角落显示本地占位", "满意微笑", "特写定格", "温暖背光", "完整流程跑通。", "完成提示音"),
            ("设置面板", "开关状态被逐项确认，外部扣费项全部关闭", "笃定", "静态正面镜头", "清晰白光", "没有外部扣费调用。", "勾选声"),
            ("素材库", "占位图、分镜视频和最终拼接视频被归档成三排卡片", "放松", "侧向跟拍", "柔和环境光", "素材已就绪。", "文件落位声"),
        ]
        shots: list[dict[str, Any]] = []
        for idx in range(shot_count):
            scene, action, expression, camera, lighting, dialogue, sfx = shot_templates[idx]
            shots.append(
                {
                    "id": None,
                    "order": idx + 1,
                    "scene": scene,
                    "action": action,
                    "expression": expression,
                    "camera": camera,
                    "lighting": lighting,
                    "dialogue": dialogue,
                    "sfx": sfx,
                    "duration": 2.0,
                    "description": f"{scene}中，{action}，{expression}。",
                    "image_prompt": (
                        f"分镜 {idx + 1} 占位图：{scene}，{action}，{expression}，{camera}，"
                        f"{lighting}，漫画风，清晰标注 Fake Image，本地测试不调用外部图片 API。"
                    ),
                    "video_prompt": (
                        f"分镜 {idx + 1} 占位视频：{camera}展示{action}，节奏轻快，"
                        "2 秒本地 Fake Video，占位片段用于最终拼接。"
                    ),
                }
            )
        return shots

    def _shot_response(self, payload: dict[str, Any]) -> str:
        data = self._plan_base(payload)
        project = self._project_from_payload(payload)
        mode = str(payload.get("mode") or "full").strip().lower()
        feedback = str(payload.get("user_feedback") or "").strip()

        existing = self._existing_shots(payload)
        if mode == "incremental" and existing:
            shots = existing
            focus = payload.get("focus_entity") if isinstance(payload.get("focus_entity"), dict) else {}
            focus_id = focus.get("id") if focus.get("type") in {"shot", "video"} else None
            for shot in shots:
                if focus_id is not None and shot.get("id") == focus_id and feedback:
                    shot["dialogue"] = feedback[:40] if any(k in feedback for k in ("对白", "台词", "dialogue")) else shot.get("dialogue")
                    shot["description"] = f"{shot.get('description') or ''}（按反馈调整：{feedback[:60]}）".strip()
                    shot["image_prompt"] = f"{shot.get('image_prompt') or ''}；反馈：{feedback[:40]}".strip("；")
                    shot["video_prompt"] = f"{shot.get('video_prompt') or ''}；反馈：{feedback[:40]}".strip("；")
            data["preserve_ids"] = {
                "characters": [
                    c.get("id")
                    for c in self._existing_characters(payload)
                    if isinstance(c.get("id"), int)
                ],
                "shots": [s["id"] for s in shots if isinstance(s.get("id"), int)],
            }
            data["user_message"] = f"已增量更新 {len(shots)} 个 Fake 分镜。"
        else:
            shots = self._default_shots(project)
            data["user_message"] = f"已生成 {len(shots)} 个 Fake 分镜。"

        data["shots"] = shots
        return self._json_text(data)

    def _full_plan_response(self, payload: dict[str, Any]) -> str:
        data = json.loads(self._character_response(payload))
        shots_data = json.loads(self._shot_response(payload))
        data["shots"] = shots_data["shots"]
        if isinstance(shots_data.get("preserve_ids"), dict):
            data["preserve_ids"] = shots_data["preserve_ids"]
        data["user_message"] = (
            f"Fake 完整规划已生成：{len(data['characters'])} 个角色、"
            f"{len(data['shots'])} 个分镜，可继续渲染占位图片和占位视频。"
        )
        return self._json_text(data)

    def _visual_notes_response(self, prompt_text: str) -> str:
        name_match = re.search(r"Character name:\s*(.+)", prompt_text)
        desc_match = re.search(r"Description:\s*(.+)", prompt_text, re.S)
        name = name_match.group(1).strip() if name_match else "角色"
        description = desc_match.group(1).strip() if desc_match else "本地 Fake 角色"
        description = description.split("\n\nExtract", 1)[0].strip()
        short = description[:80]
        return (
            f"{name}：轮廓清晰，主体居中，服装与配色便于识别；"
            f"基于描述提炼的视觉特征——{short}；"
            "表情明确，适合 Fake 占位图与本地一致性检查。"
        )

    def _reimagine_response(self, prompt_text: str) -> str:
        brief_match = re.search(r"参考内容：\s*(.+?)\n\n只输出", prompt_text, re.S)
        brief = brief_match.group(1).strip() if brief_match else prompt_text[:200]
        first_line = brief.splitlines()[0][:120] if brief else "本地 Fake 拉片"
        data = {
            "narrative_arc": first_line or "本地 Fake 叙事弧",
            "time_structure": "线性短片",
            "characters": "小欧、调试精灵",
            "scenes": "创作工作室 / 预览屏幕",
            "props": "播放按钮徽章、场记板",
            "shot_types": "中景/特写交替",
            "camera_moves": "推拉 + 跟随",
            "framing": "主体居中，适度负空间",
            "pacing": "均匀推进",
            "color_grade": "中性偏暖",
            "lighting": "柔和屏幕光",
            "sound_design": "环境音 + 轻提示音",
            "music": "轻快 ambient",
            "dialogue_tone": "口语简洁",
            "visual_style": "清爽漫画风",
            "effects": "少量高亮转场",
            "emotion": "好奇到安心",
            "hooks": "开场按下生成按钮",
        }
        return self._json_text(data)

    def _onboarding_response(self, payload: dict[str, Any]) -> str:
        project = self._project_from_payload(payload)
        title = str(project.get("title") or "Fake 本地测试短片")
        story = str(project.get("story") or "一个角色完成本地生成验证")
        style = str(project.get("style") or "清爽漫画风")
        return self._json_text(
            {
                "agent": "onboarding",
                "project_update": {
                    "title": title,
                    "story": story,
                    "style": style,
                    "status": "planning",
                },
                "story_breakdown": {
                    "logline": f"{title}：{story[:60]}",
                    "genre": ["本地测试"],
                    "themes": ["验证", "协作"],
                    "setting": "创作工作室",
                    "time_period": "当代",
                    "tone": "轻快",
                    "target_audience": "开发者与演示观众",
                },
                "style_recommendation": {
                    "primary": style,
                    "alternatives": ["赛博扁平", "水彩手绘"],
                    "rationale": "Fake 本地占位图最容易辨认的风格。",
                    "keywords": ["清晰轮廓", "高对比", "占位标注"],
                },
                "questions": [],
            }
        )

    def _director_response(self, payload: dict[str, Any]) -> str:
        project = self._project_from_payload(payload)
        story = str(project.get("story") or "本地 Fake 故事")
        style = str(project.get("style") or "清爽漫画风")
        return self._json_text(
            {
                "agent": "director",
                "project_update": {"style": style, "status": "writing"},
                "analysis": {
                    "summary": story[:120],
                    "structure": {
                        "setup": "提出想法并开启 Fake 流程",
                        "confrontation": "逐段验证文本、图片、视频衔接",
                        "resolution": "完整素材汇合，确认本地链路",
                    },
                    "themes": ["可靠性", "低成本验证"],
                    "stakes": "链路任一环节失败都会阻断成片预览",
                    "tone_notes": "轻快、明确",
                    "conflicts": [
                        {
                            "type": "external",
                            "description": "外部 API 成本与本地可跑性冲突",
                        }
                    ],
                },
            }
        )

    def _scriptwriter_response(self, payload: dict[str, Any]) -> str:
        data = json.loads(self._full_plan_response(payload))
        data["agent"] = "scriptwriter"
        data["project_update"] = {"status": "scripting"}
        return self._json_text(data)

    def _critic_response(self) -> str:
        return self._json_text(
            {
                "score": 10,
                "dimensions": {"consistency": 10, "quality": 10, "composition": 10},
                "issues": [],
                "suggestions": [],
            }
        )

    def _review_response(self, payload: dict[str, Any], prompt_text: str) -> str:
        """Schema-aware local routing for ReviewAgent without external LLM."""
        feedback = str(payload.get("feedback") or "").strip()
        if not feedback:
            # Some wrappers put free text outside JSON; keep a weak fallback.
            feedback = prompt_text.strip()

        entity_type = str(payload.get("entity_type") or "").strip().lower()
        entity_ids_raw = payload.get("entity_ids") or []
        entity_ids: list[int] = []
        for value in entity_ids_raw if isinstance(entity_ids_raw, list) else []:
            if isinstance(value, int):
                entity_ids.append(value)
            elif isinstance(value, str) and value.isdigit():
                entity_ids.append(int(value))
        entity_id = payload.get("entity_id")
        if isinstance(entity_id, int) and entity_id not in entity_ids:
            entity_ids = [entity_id, *entity_ids]
        elif isinstance(entity_id, str) and entity_id.isdigit():
            value = int(entity_id)
            if value not in entity_ids:
                entity_ids = [value, *entity_ids]

        feedback_type = str(payload.get("feedback_type") or "").strip().lower()
        text = feedback.lower()

        full_markers = (
            "推倒重来",
            "全部重新",
            "从头开始",
            "完全重新",
            "全部推翻",
            "redo all",
            "restart from scratch",
            "regenerate all",
            "full restart",
            "换一个故事",
        )
        merge_markers = (
            "retry merge",
            "重试合成",
            "重新合成",
            "重新拼接最终视频",
            "重新合并最终视频",
            "final-output",
        )
        plan_markers = (
            "对白",
            "台词",
            "旁白",
            "改描述",
            "改场景",
            "改动作",
            "改剧情",
            "改设定",
            "改人设",
            "改名字",
            "重写",
            "dialogue",
            "rewrite",
            "story",
            "script",
        )
        compose_markers = (
            "重做视频",
            "重新生成视频",
            "视频太",
            "运镜",
            "时长",
            "动起来",
            "redo video",
            "regenerate video",
            "camera move",
            "motion",
            "duration",
            "video",
            "merge",
            "合成",
        )
        render_markers = (
            "重画",
            "重做图",
            "画面",
            "首帧",
            "换色",
            "颜色",
            "光影",
            "灯光",
            "夜景",
            "风格",
            "脸",
            "发型",
            "服装",
            "redraw",
            "image",
            "render",
            "character",
            "shot",
        )

        mode = "full" if any(marker in text for marker in full_markers) else "incremental"
        if any(marker in text for marker in merge_markers):
            start_agent = "compose"
            mode = "incremental"
        elif any(marker in text for marker in plan_markers):
            start_agent = "plan"
        elif any(marker in text for marker in compose_markers):
            start_agent = "compose"
        elif any(marker in text for marker in render_markers):
            start_agent = "render"
        elif feedback_type in {"outline", "story_outline"}:
            start_agent = "outline"
        elif feedback_type in {"plan", "story", "script", "global"}:
            start_agent = "plan"
        elif feedback_type in {"render", "character", "shot", "storyboard"}:
            start_agent = "render"
        elif feedback_type in {"compose", "video", "merge"}:
            start_agent = "compose"
        elif entity_type == "video":
            start_agent = "compose"
        elif entity_type in {"character", "shot"}:
            start_agent = "render"
        else:
            start_agent = "plan"

        character_ids: list[int] = []
        shot_ids: list[int] = []
        if entity_type == "character":
            character_ids = list(entity_ids)
        elif entity_type in {"shot", "video"}:
            shot_ids = list(entity_ids)

        state = payload.get("state") if isinstance(payload.get("state"), dict) else {}
        characters = state.get("characters") if isinstance(state.get("characters"), list) else []
        shots = state.get("shots") if isinstance(state.get("shots"), list) else []
        if not character_ids and not shot_ids:
            for character in characters:
                if not isinstance(character, dict):
                    continue
                name = str(character.get("name") or "").strip()
                cid = character.get("id")
                if name and name in feedback and isinstance(cid, int):
                    character_ids.append(cid)
            for shot in shots:
                if not isinstance(shot, dict):
                    continue
                order = shot.get("order")
                sid = shot.get("id")
                if not isinstance(order, int) or not isinstance(sid, int):
                    continue
                if f"分镜{order}" in feedback or f"镜头{order}" in feedback or f"格{order}" in feedback:
                    shot_ids.append(sid)

        summary = feedback[:80] if feedback else "本地 Fake 反馈路由"
        return self._json_text(
            {
                "agent": "review",
                "analysis": {
                    "feedback_type": feedback_type or entity_type or "general",
                    "summary": summary,
                    "target_items": [],
                    "suggested_changes": "按 Fake 本地规则完成路由，不调用外部 LLM。",
                },
                "routing": {
                    "start_agent": start_agent,
                    "mode": mode,
                    "reason": f"fake_route:{start_agent}:{mode}",
                },
                "target_ids": {
                    "character_ids": character_ids,
                    "shot_ids": shot_ids,
                },
            }
        )

    def _response_text(
        self,
        *,
        messages: list[dict[str, Any]] | None,
        prompt: str | None,
        system: str | None,
    ) -> str:
        prompt_text = "\n".join(part for part in [prompt, self._message_text(messages)] if part)
        payload = self._payload_from_text(prompt_text)
        system_text = system or ""
        combined = f"{system_text}\n{prompt_text}".lower()

        task = payload.get("task")
        if task is None:
            task_match = re.search(r'"task"\s*:\s*"(characters|shots)"', prompt_text)
            task = task_match.group(1) if task_match else None

        if task == "characters":
            return self._character_response(payload)
        if task == "shots":
            return self._shot_response(payload)
        if (
            "reviewagent" in combined
            or "routing regeneration" in combined
            or '"agent": "review"' in combined
            or "responsible for understanding user feedback" in combined
        ):
            return self._review_response(payload, prompt_text)
        if (
            "character visual design assistant" in combined
            or "extract the key visual traits" in combined
            or "extract key visual traits" in combined
        ):
            return self._visual_notes_response(prompt_text)
        if (
            "动画导演助理" in combined
            or "拉片" in combined
            or "schema keys" in combined
            or "参考内容：" in prompt_text
        ):
            return self._reimagine_response(prompt_text)
        if (
            "criticagent" in combined
            or "you evaluate visual" in combined
            or "visual quality reviewer" in combined
            or "character_review" in combined
            or "shot_review" in combined
            or ("critic" in combined and "score" in combined)
            or ("dimensions" in combined and "consistency" in combined)
        ):
            return self._critic_response()
        if "outlineagent" in combined or "story_outline" in combined:
            return self._outline_response(payload)
        if "planagent" in combined:
            return self._full_plan_response(payload)
        if "onboardingagent" in combined:
            return self._onboarding_response(payload)
        if "directoragent" in combined:
            return self._director_response(payload)
        if "scriptwriteragent" in combined:
            return self._scriptwriter_response(payload)

        configured = self._configured_response()
        if configured is not None:
            return configured
        # Unknown structured agent call: still return parseable JSON so local flows don't crash.
        project = self._project_from_payload(payload)
        return self._json_text(
            {
                "agent": "fake",
                "user_message": "Fake 文本 Provider 默认响应，未调用外部文本生成 API。",
                "project_update": {
                    "title": project.get("title"),
                    "style": project.get("style"),
                    "status": project.get("status") or "planning",
                },
                "text": "这是 Fake 文本 Provider 的本地测试响应，未调用外部文本生成 API。",
            }
        )

    async def probe(self) -> TextProviderCapability:
        return TextProviderCapability(status="valid", generate=True, stream=True)

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
        text = self._response_text(messages=messages, prompt=prompt, system=system)
        return LLMResponse(text=text, tool_calls=[], raw={"provider": "fake"})

    async def stream(
        self,
        *,
        messages: list[dict[str, Any]] | None = None,
        prompt: str | None = None,
        system: str | None = None,
        max_tokens: int = 1024,
        temperature: float | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[dict[str, Any]]:
        response = await self.generate(
            messages=messages,
            prompt=prompt,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
            **kwargs,
        )
        if response.text:
            yield {"type": "text", "text": response.text}
        yield {"type": "final", "response": response}
