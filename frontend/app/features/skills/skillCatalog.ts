/**
 * Skill presets — frontend types + offline fallback.
 * Prefer backend `/api/v1/skills` as SSOT; this catalog is the bootstrap/fallback.
 */

export type SkillBadge = "new" | "core" | "soon";

export interface SkillPreset {
	id: string;
	title: string;
	description: string;
	/** Accent token for card stripe */
	accent: "primary" | "secondary" | "accent" | "info";
	badge?: SkillBadge;
	/** Prefill values applied when user picks this skill */
	prefill: {
		style?: string;
		creationMode?: "review" | "quick";
		placeholder?: string;
		storyHint?: string;
		targetShotCount?: number;
	};
	directives?: string;
	available: boolean;
}

const ACCENT_CYCLE: SkillPreset["accent"][] = [
	"primary",
	"secondary",
	"accent",
	"info",
];

/** Map API skill row → UI preset */
export function skillFromApi(
	row: {
		id: string;
		title: string;
		description: string;
		badge?: string | null;
		prefer_auto_mode?: boolean;
		default_style?: string | null;
		default_creation_mode?: string | null;
		default_target_shot_count?: number | null;
		story_prefix?: string;
		directives?: string;
		placeholder?: string;
		available?: boolean;
	},
	index = 0,
): SkillPreset {
	const badge =
		row.badge === "core" || row.badge === "new" || row.badge === "soon"
			? row.badge
			: undefined;
	const creationMode =
		row.default_creation_mode === "quick" || row.prefer_auto_mode
			? "quick"
			: row.default_creation_mode === "review"
				? "review"
				: undefined;
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		accent: ACCENT_CYCLE[index % ACCENT_CYCLE.length],
		badge,
		prefill: {
			style: row.default_style ?? undefined,
			creationMode,
			placeholder: row.placeholder || row.description,
			storyHint: row.story_prefix || "",
			targetShotCount: row.default_target_shot_count ?? undefined,
		},
		directives: row.directives,
		available: row.available !== false,
	};
}

/** Offline fallback when API is unavailable */
export const SKILL_CATALOG: SkillPreset[] = [
	{
		id: "story-anime",
		title: "剧情故事创作",
		description: "一句话 → 大纲、角色、分镜、视频的完整漫剧链路。",
		accent: "primary",
		badge: "core",
		prefill: {
			style: "anime",
			creationMode: "review",
			placeholder: "主角是谁？冲突是什么？最想看到的三帧画面？",
			storyHint: "",
		},
		available: true,
	},
	{
		id: "character-design",
		title: "角色设计",
		description: "先锁定人设与形象，再进入分镜生产。",
		accent: "secondary",
		badge: "core",
		prefill: {
			style: "anime",
			creationMode: "review",
			placeholder: "描述角色外貌、性格、标志性道具与出场情绪。",
			storyHint: "【角色设计优先】\n",
			targetShotCount: 4,
		},
		available: true,
	},
	{
		id: "script-breakdown",
		title: "剧本智能拆分",
		description: "把已有剧本拆成镜头清单与场次结构。",
		accent: "accent",
		badge: "core",
		prefill: {
			style: "cinematic",
			creationMode: "review",
			placeholder: "粘贴剧本或分场大纲，系统会拆成可审阅分镜。",
			storyHint: "【剧本拆分】\n",
		},
		available: true,
	},
	{
		id: "quick-short",
		title: "快速成片",
		description: "少打断、托管式跑通整条流水线，适合草稿验证。",
		accent: "info",
		badge: "core",
		prefill: {
			style: "anime",
			creationMode: "quick",
			placeholder: "用一句话描述短片点子，系统将自动推进各阶段。",
			targetShotCount: 5,
		},
		available: true,
	},
	{
		id: "video-reimagine",
		title: "拉片复刻",
		description: "结构化拆解参考片要点 → 换元素再生成。",
		accent: "secondary",
		badge: "core",
		prefill: {
			style: "cinematic",
			creationMode: "review",
			placeholder: "用文字描述想复刻的镜头结构与替换元素。",
			storyHint: "【拉片复刻】\n",
			targetShotCount: 6,
		},
		available: true,
	},
	{
		id: "product-ad",
		title: "商品展示广告",
		description: "卖点 + 产品参考 → 广告分镜短片工作流。",
		accent: "accent",
		badge: "core",
		prefill: {
			style: "cinematic",
			creationMode: "review",
			placeholder: "产品是什么？核心卖点？目标受众与口播语气？",
			storyHint: "【商品广告】\n",
			targetShotCount: 5,
		},
		available: true,
	},
	{
		id: "scene-design",
		title: "场景设计",
		description: "先铺场景资产，再挂角色与镜头。",
		accent: "primary",
		prefill: {
			style: "donghua",
			creationMode: "review",
			placeholder: "描述时代、地点、天气、光线与关键道具。",
			storyHint: "【场景优先】\n",
			targetShotCount: 6,
		},
		available: true,
	},
	{
		id: "comedy-pet",
		title: "萌宠 / 搞笑短片",
		description: "轻松题材模板：节奏更快、分镜更短。",
		accent: "info",
		prefill: {
			style: "pixar",
			creationMode: "quick",
			placeholder: "宠物/搞笑桥段一句话，最好带反转。",
			targetShotCount: 5,
		},
		available: true,
	},
];

export function getSkillById(
	id: string,
	catalog: SkillPreset[] = SKILL_CATALOG,
): SkillPreset | undefined {
	return catalog.find((skill) => skill.id === id);
}
