import { Link } from "react-router-dom";
import { Card } from "~/components/ui/Card";
import type { Universe } from "~/types";
import { SparklesIcon, UsersIcon, TrashIcon } from "@heroicons/react/24/outline";

interface UniverseCardProps {
	universe: Universe;
	onDelete: (universe: Universe) => void;
}

export function UniverseCard({ universe, onDelete }: UniverseCardProps) {
	return (
		<div className="group relative" data-shell="universe-card">
			<Link to={`/universes/${universe.id}`} className="block">
				<Card className="h-full !p-3 transition-[box-shadow,transform] duration-[var(--duration-fast)] hover:-translate-y-px hover:shadow-brutal">
					{universe.cover_image_url ? (
						<div className="-mx-1 -mt-1 mb-2 h-20 overflow-hidden rounded-[var(--radius-md)] border border-base-content/10">
							<img
								src={universe.cover_image_url}
								alt={universe.name}
								className="h-full w-full object-cover"
								width={320}
								height={80}
								loading="lazy"
							/>
						</div>
					) : (
						<div className="-mx-1 -mt-1 mb-2 flex h-14 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-base-content/15 bg-base-200/50">
							<span className="font-mono text-[length:var(--text-2xs)] uppercase tracking-wide text-base-content/35">
								universe
							</span>
						</div>
					)}

					<p className="m-0 font-mono text-[length:var(--text-2xs)] uppercase tracking-wide text-base-content/45">
						ip cosmos
					</p>
					<h2 className="m-0 mt-0.5 font-heading text-[length:var(--text-sm)] font-bold leading-snug">
						{universe.name}
					</h2>

					{universe.description ? (
						<p className="m-0 mt-1 line-clamp-2 text-[length:var(--text-xs)] text-base-content/65">
							{universe.description}
						</p>
					) : (
						<p className="m-0 mt-1 text-[length:var(--text-2xs)] text-base-content/40">
							尚未填写简介
						</p>
					)}

					<div className="mt-2 flex flex-wrap items-center gap-1.5 text-[length:var(--text-2xs)] font-semibold text-base-content/55">
						<span className="inline-flex items-center gap-1 rounded-full border border-base-content/12 bg-base-200 px-1.5 py-0.5 tabular-nums">
							<SparklesIcon className="h-3 w-3" aria-hidden="true" />
							{universe.projects_count} 章节
						</span>
						<span className="inline-flex items-center gap-1 rounded-full border border-base-content/12 bg-base-200 px-1.5 py-0.5 tabular-nums">
							<UsersIcon className="h-3 w-3" aria-hidden="true" />
							{universe.shared_characters_count} 角色
						</span>
					</div>
				</Card>
			</Link>

			<button
				type="button"
				className="absolute right-1.5 top-1.5 rounded-full border border-base-content/10 bg-base-100/95 p-1.5 text-base-content/40 opacity-0 transition-[opacity,color,background-color] duration-[var(--duration-fast)] hover:bg-error/15 hover:text-error group-hover:opacity-100 focus-visible:opacity-100"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onDelete(universe);
				}}
				title="删除宇宙"
				aria-label={`删除宇宙 ${universe.name}`}
			>
				<TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
			</button>
		</div>
	);
}
