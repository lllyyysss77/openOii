/**
 * Simple production skills — fallback when /api/v1/skills is offline.
 * Keep in sync with backend app/skills/catalog.py (only 3 common workflows).
 */

export type SkillBadge = "new" | "core";

export interface SkillPreset {
	id: string;
	title: string;
	description: string;
	accent: "primary" | "secondary" | "accent" | "info";
	badge?: SkillBadge;
	prefill: {
		style?: string;
		creationMode?: "review" | "quick";
		placeholder?: string;
		storyHint?: string;
		storyTemplate?: string;
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
		story_template?: string;
		directives?: string;
		placeholder?: string;
		available?: boolean;
	},
	index = 0,
): SkillPreset {
	const badge = row.badge === "core" || row.badge === "new" ? row.badge : undefined;
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
			storyTemplate: row.story_template || "",
			targetShotCount: row.default_target_shot_count ?? undefined,
		},
		directives: row.directives,
		available: row.available !== false,
	};
}

export const SKILL_CATALOG: SkillPreset[] = [
	{
		id: "story-anime",
		title: "剧情故事",
		description: "一句话开故事：大纲 → 角色 → 分镜 → 成片。",
		accent: "primary",
		badge: "core",
		prefill: {
			style: "anime",
			creationMode: "review",
			placeholder: "主角是谁？想要什么？最大阻碍是什么？结尾情绪？",
			storyTemplate:
				"主角：\n目标：\n冲突：\n关键画面（3 帧）：\n1. \n2. \n3. \n风格/情绪：\n",
			targetShotCount: 8,
		},
		available: true,
	},
	{
		id: "character-design",
		title: "角色设计",
		description: "先做稳人设与形象，再用少量镜头验收。",
		accent: "secondary",
		badge: "core",
		prefill: {
			style: "anime",
			creationMode: "review",
			placeholder: "外貌、性格、标志道具、出场情绪、和谁互动？",
			storyHint: "【角色设计】\n",
			storyTemplate:
				"【角色设计】\n角色名：\n年龄/身份：\n外貌（发型发色、瞳色、体型、服装、标志物）：\n性格与说话方式：\n关系（对手/同伴）：\n想用 2–4 个镜头展示的瞬间：\n",
			targetShotCount: 4,
		},
		available: true,
	},
	{
		id: "quick-short",
		title: "快速成片",
		description: "少打断自动跑通，适合草稿验证。",
		accent: "info",
		badge: "core",
		prefill: {
			style: "anime",
			creationMode: "quick",
			placeholder: "一句话短片点子（角色 + 冲突 + 结局）。",
			storyTemplate: "一句话点子：\n主角：\n冲突/反转：\n结局：\n",
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

/**
 * 工作流旅程：把「选这条路意味着什么」显性化。
 * 这是老用户才知道的默会知识——审阅模式会在规划与渲染后各停一次等确认，
 * 快速模式一路跑到成片不打断。新用户在选择时就该看到这个差异。
 */
export interface SkillJourney {
	/** 用户视角的阶段链（不是内部 stage 名） */
	stages: string[];
	/** 审阅停点次数；0 = 全自动 */
	reviewStops: number;
	/** 一句话节奏说明 */
	pace: string;
}

const SKILL_JOURNEYS: Record<string, SkillJourney> = {
	"story-anime": {
		stages: ["大纲", "角色", "分镜", "成片"],
		reviewStops: 2,
		pace: "停 2 次审阅",
	},
	"character-design": {
		stages: ["人设", "形象图", "验收镜头"],
		reviewStops: 2,
		pace: "人设定稿再出镜头",
	},
	"quick-short": {
		stages: ["大纲", "分镜", "成片"],
		reviewStops: 0,
		pace: "全自动不打断",
	},
};

export function journeyForSkill(skill: SkillPreset): SkillJourney {
	const known = SKILL_JOURNEYS[skill.id];
	if (known) return known;
	// API 新增的未知工作流：按生成方式推导，保证旅程线永远有内容
	return skill.prefill.creationMode === "quick"
		? { stages: ["大纲", "分镜", "成片"], reviewStops: 0, pace: "全自动不打断" }
		: { stages: ["大纲", "分镜", "成片"], reviewStops: 2, pace: "停 2 次审阅" };
}
