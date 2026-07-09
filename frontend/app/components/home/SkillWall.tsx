import { clsx } from "clsx";
import { useQuery } from "@tanstack/react-query";
import { skillsApi } from "~/services/api";
import {
	SKILL_CATALOG,
	skillFromApi,
	type SkillPreset,
	type SkillBadge,
} from "~/features/skills/skillCatalog";

interface SkillWallProps {
	activeSkillId: string | null;
	onSelect: (skill: SkillPreset) => void;
	/** Optional externally-resolved catalog (Home may pass shared list) */
	skills?: SkillPreset[];
}

const ACCENT_BAR: Record<SkillPreset["accent"], string> = {
	primary: "bg-primary",
	secondary: "bg-secondary",
	accent: "bg-accent",
	info: "bg-info",
};

const ACCENT_RING: Record<SkillPreset["accent"], string> = {
	primary: "border-primary/50 bg-primary/5",
	secondary: "border-secondary/50 bg-secondary/5",
	accent: "border-accent/50 bg-accent/5",
	info: "border-info/50 bg-info/5",
};

function badgeLabel(badge: SkillBadge): string {
	if (badge === "new") return "NEW";
	if (badge === "core") return "核心";
	return "预览";
}

export function SkillWall({ activeSkillId, onSelect, skills }: SkillWallProps) {
	const { data: apiSkills } = useQuery({
		queryKey: ["skills"],
		queryFn: () => skillsApi.list(),
		staleTime: 60_000,
		enabled: !skills,
	});

	const catalog: SkillPreset[] =
		skills ??
		(apiSkills?.length
			? apiSkills.map((row, i) => skillFromApi(row, i))
			: SKILL_CATALOG);

	return (
		<section
			aria-labelledby="skill-wall-heading"
			className="w-full"
			data-shell="skill-wall"
		>
			<div className="mb-[var(--space-2)] flex items-baseline justify-between gap-2">
				<h2
					id="skill-wall-heading"
					className="m-0 font-heading text-[length:var(--text-md)] font-bold leading-[var(--leading-tight)] tracking-tight text-pretty"
				>
					Skill · 点选开工
				</h2>
				<span className="font-mono text-[length:var(--text-2xs)] tabular-nums text-base-content/40">
					{catalog.length} 项
				</span>
			</div>

			<ul className="m-0 grid list-none grid-cols-2 gap-[var(--space-2)] p-0 sm:grid-cols-3 lg:grid-cols-4">
				{catalog.map((skill) => {
					const active = activeSkillId === skill.id;
					return (
						<li key={skill.id}>
							<button
								type="button"
								onClick={() => onSelect(skill)}
								aria-pressed={active}
								className={clsx(
									"group flex h-full min-h-[var(--touch-target-dense)] w-full flex-col rounded-[var(--radius-md)] border-2 bg-base-100 p-[var(--space-2)] text-left",
									"transition-[border-color,box-shadow,transform] duration-[var(--duration-fast)]",
									"hover:-translate-y-px hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
									active
										? clsx(ACCENT_RING[skill.accent], "shadow-brutal-sm")
										: "border-base-content/10",
								)}
							>
								<span
									className={clsx(
										"mb-1 block h-0.5 w-6 rounded-full",
										ACCENT_BAR[skill.accent],
									)}
									aria-hidden="true"
								/>
								<div className="flex items-start justify-between gap-1">
									<h3 className="m-0 font-heading text-[length:var(--text-sm)] font-bold leading-snug">
										{skill.title}
									</h3>
									{skill.badge ? (
										<span
											className={clsx(
												"shrink-0 rounded px-1 font-mono text-[length:var(--text-2xs)] font-bold uppercase leading-4",
												skill.badge === "soon"
													? "bg-base-200 text-base-content/50"
													: "bg-primary/15 text-primary",
											)}
										>
											{badgeLabel(skill.badge)}
										</span>
									) : null}
								</div>
								<p className="m-0 mt-1 line-clamp-2 text-[length:var(--text-2xs)] leading-snug text-base-content/55">
									{skill.description}
								</p>
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
