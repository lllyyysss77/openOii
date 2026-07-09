"""Declarative skill presets that map UI entries onto graph start stages + creative policy."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from app.orchestration.state import Phase2Stage

AgentName = Literal["outline", "plan", "render", "compose", "review"]
CreationMode = Literal["review", "quick"]


@dataclass(frozen=True, slots=True)
class SkillDefinition:
    id: str
    title: str
    description: str
    badge: Literal["core", "new", "soon"] | None
    start_stage: Phase2Stage
    start_agent: AgentName
    prefer_auto_mode: bool = False
    story_prefix: str = ""
    default_style: str | None = None
    default_creation_mode: CreationMode | None = None
    default_target_shot_count: int | None = None
    """Creative policy injected into outline/plan LLM payloads."""
    directives: str = ""
    """Soft constraints (prioritize, tone, pacing, etc.)."""
    pipeline_hints: dict[str, Any] = field(default_factory=dict)
    """UI placeholder when skill is selected."""
    placeholder: str = ""
    available: bool = True


SKILL_CATALOG: tuple[SkillDefinition, ...] = (
    SkillDefinition(
        id="story-anime",
        title="剧情故事创作",
        description="一句话 → 大纲、角色、分镜、视频的完整漫剧链路。",
        badge="core",
        start_stage="plan_outline",
        start_agent="outline",
        default_style="anime",
        default_creation_mode="review",
        placeholder="主角是谁？冲突是什么？最想看到的三帧画面？",
        directives=(
            "按完整漫剧链路规划：清晰 logline、三幕结构、可拍摄短片节奏。"
            "角色与分镜服务叙事弧；保持日漫/动画可读的视觉语法。"
            "除非用户指定镜头数，控制在 6–10 镜，避免冗长过场。"
        ),
        pipeline_hints={
            "prioritize": "full",
            "tone": "narrative",
            "shot_bias": "balanced",
        },
    ),
    SkillDefinition(
        id="character-design",
        title="角色设计",
        description="先锁定人设与形象，再进入分镜生产。",
        badge="core",
        start_stage="plan_characters",
        start_agent="plan",
        story_prefix="【角色设计优先】\n",
        default_style="anime",
        default_creation_mode="review",
        default_target_shot_count=4,
        placeholder="描述角色外貌、性格、标志性道具与出场情绪。",
        directives=(
            "优先完成角色设定与 visual_notes：发型/发色、瞳色、体型、服装、标志物、配色。"
            "每位角色必须可被图像模型稳定复现；性格要能映射到表情与姿态。"
            "分镜从简：仅用少量镜头展示角色出场与关键互动，待人设稳定后再扩写。"
            "不要为了铺剧情稀释角色辨识度。"
        ),
        pipeline_hints={
            "prioritize": "characters",
            "tone": "character-bible",
            "shot_bias": "sparse",
        },
    ),
    SkillDefinition(
        id="script-breakdown",
        title="剧本智能拆分",
        description="把已有剧本拆成镜头清单与场次结构。",
        badge="core",
        start_stage="plan_outline",
        start_agent="outline",
        story_prefix="【剧本拆分】\n",
        default_style="cinematic",
        default_creation_mode="review",
        placeholder="粘贴剧本或分场大纲，系统会拆成可审阅分镜。",
        directives=(
            "将用户输入视为剧本/分场文本，优先拆解为场次、动作、对白、镜头。"
            "保留原文关键对白与情节节点，不要改写成无关新故事。"
            "大纲 acts 对应剧本场次节奏；shots 覆盖全部关键 beat，标注 camera/action/dialogue。"
            "若文本已含镜号，尊重原有结构并规范化。"
        ),
        pipeline_hints={
            "prioritize": "script",
            "tone": "breakdown",
            "shot_bias": "coverage",
        },
    ),
    SkillDefinition(
        id="quick-short",
        title="快速成片",
        description="少打断、托管式跑通整条流水线，适合草稿验证。",
        badge="core",
        start_stage="plan_outline",
        start_agent="outline",
        prefer_auto_mode=True,
        default_style="anime",
        default_creation_mode="quick",
        default_target_shot_count=5,
        placeholder="用一句话描述短片点子，系统将自动推进各阶段。",
        directives=(
            "追求最短可成片路径：简单冲突、少角色（1–2）、短三幕。"
            "默认约 5 个镜头；每镜信息密度高，避免复杂群戏与长对白。"
            "风格清晰、构图直白，便于一键渲染与合成。"
        ),
        pipeline_hints={
            "prioritize": "full",
            "tone": "draft-fast",
            "shot_bias": "short",
        },
    ),
    SkillDefinition(
        id="video-reimagine",
        title="拉片复刻",
        description="结构化拆解参考片要点 → 换元素再生成。",
        badge="core",
        start_stage="plan_outline",
        start_agent="outline",
        story_prefix="【拉片复刻】\n",
        default_style="cinematic",
        default_creation_mode="review",
        default_target_shot_count=6,
        placeholder="用文字描述想复刻的镜头结构与替换元素。",
        directives=(
            "用户 story 可能包含【拉片复刻生成指令】与 18 维导演维度。"
            "必须保留参考片的叙事结构、节奏、镜头类型与情绪曲线；"
            "仅替换角色/场景/道具/风格等指定槽位。"
            "分镜要体现原作运镜与景别逻辑，不要另起炉灶写成完全不同的故事。"
            "若存在 reimagine 维度列表，将其视为硬约束。"
        ),
        pipeline_hints={
            "prioritize": "structure-preserving",
            "tone": "reimagine",
            "shot_bias": "match-reference",
        },
    ),
    SkillDefinition(
        id="product-ad",
        title="商品展示广告",
        description="卖点 + 产品参考 → 广告分镜短片工作流。",
        badge="core",
        start_stage="plan_outline",
        start_agent="outline",
        story_prefix="【商品广告】\n",
        default_style="cinematic",
        default_creation_mode="review",
        default_target_shot_count=5,
        placeholder="产品是什么？核心卖点？目标受众与口播语气？",
        directives=(
            "广告结构：钩子开场 → 痛点/场景 → 产品展示 → 卖点证明 → CTA 收尾。"
            "镜头短而密（约 4–6 镜）；产品始终清晰可见；对白可作口播卖点。"
            "视觉偏商业广告：干净构图、产品光、品牌感色调。"
            "不要写成剧情长片；冲突服务转化，不是文学叙事。"
        ),
        pipeline_hints={
            "prioritize": "product",
            "tone": "commercial",
            "shot_bias": "short-ad",
        },
    ),
    SkillDefinition(
        id="scene-design",
        title="场景设计",
        description="先铺场景资产，再挂角色与镜头。",
        badge=None,
        start_stage="plan_shots",
        start_agent="plan",
        story_prefix="【场景优先】\n",
        default_style="donghua",
        default_creation_mode="review",
        default_target_shot_count=6,
        placeholder="描述时代、地点、天气、光线与关键道具。",
        directives=(
            "优先建立场景空间：时代、地点、天气、光线、材质、标志道具与氛围。"
            "角色可从简，但每镜 scene/lighting/camera 必须具体可绘。"
            "通过运镜游走同一或相邻空间，建立空间连贯性。"
            "visual_bible 侧重环境与光影语言。"
        ),
        pipeline_hints={
            "prioritize": "scenes",
            "tone": "environment",
            "shot_bias": "spatial",
        },
    ),
    SkillDefinition(
        id="comedy-pet",
        title="萌宠 / 搞笑短片",
        description="轻松题材模板：节奏更快、分镜更短。",
        badge=None,
        start_stage="plan_outline",
        start_agent="outline",
        prefer_auto_mode=True,
        default_style="pixar",
        default_creation_mode="quick",
        default_target_shot_count=5,
        placeholder="宠物/搞笑桥段一句话，最好带反转。",
        directives=(
            "轻松搞笑短片：快节奏、强反转、表情与肢体夸张可读。"
            "1–2 个萌宠/拟人角色即可；分镜偏短（约 5 镜），结尾必须有笑点或反转。"
            "允许轻微超现实，但保持角色造型稳定以便连戏。"
        ),
        pipeline_hints={
            "prioritize": "full",
            "tone": "comedy",
            "shot_bias": "short-punchy",
        },
    ),
)

_BY_ID: dict[str, SkillDefinition] = {skill.id: skill for skill in SKILL_CATALOG}


def list_skills() -> list[SkillDefinition]:
    return list(SKILL_CATALOG)


def get_skill(skill_id: str | None) -> SkillDefinition | None:
    if not skill_id or not skill_id.strip():
        return None
    return _BY_ID.get(skill_id.strip())


@dataclass(frozen=True, slots=True)
class SkillEntryResolution:
    skill: SkillDefinition | None
    start_stage: Phase2Stage
    start_agent: AgentName
    auto_mode: bool
    notes_suffix: str
    directives: str = ""
    default_target_shot_count: int | None = None


def resolve_skill_entry(
    skill_id: str | None,
    *,
    auto_mode: bool = False,
    outline_enabled: bool = True,
) -> SkillEntryResolution:
    """Map a skill id onto graph entry parameters + creative policy."""
    skill = get_skill(skill_id)
    if skill is None:
        start_stage: Phase2Stage = "plan_outline" if outline_enabled else "plan_characters"
        start_agent: AgentName = "outline" if outline_enabled else "plan"
        return SkillEntryResolution(
            skill=None,
            start_stage=start_stage,
            start_agent=start_agent,
            auto_mode=auto_mode,
            notes_suffix="",
        )

    start_stage = skill.start_stage
    start_agent = skill.start_agent
    if start_agent == "outline" and not outline_enabled:
        start_stage = "plan_characters"
        start_agent = "plan"

    notes = f"[skill:{skill.id}] {skill.title}"
    if skill.directives:
        notes = f"{notes}\n{skill.directives}"
    return SkillEntryResolution(
        skill=skill,
        start_stage=start_stage,
        start_agent=start_agent,
        auto_mode=auto_mode or skill.prefer_auto_mode,
        notes_suffix=notes,
        directives=skill.directives,
        default_target_shot_count=skill.default_target_shot_count,
    )
