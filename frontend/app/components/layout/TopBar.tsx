import {
	Cog6ToothIcon,
	FilmIcon,
	PlusIcon,
	ChevronDownIcon,
	MoonIcon,
	SunIcon,
	SparklesIcon,
	GlobeAltIcon,
	HomeIcon,
	RectangleStackIcon,
} from "@heroicons/react/24/outline";
import { useState, useRef, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { projectsApi, universesApi } from "~/services/api";
import { useThemeStore } from "~/stores/themeStore";
import { useSettingsStore } from "~/stores/settingsStore";
import { useEditorStore, useShallow } from "~/stores/editorStore";
import type { Project } from "~/types";
import { Button } from "~/components/ui/Button";
import { clsx } from "clsx";

interface TopBarProps {
	projectId?: number;
}

function ProjectDropdown({ currentId }: { currentId?: number }) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	const { data: projects } = useQuery({
		queryKey: ["projects"],
		queryFn: () => projectsApi.list(),
	});

	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		}
		if (open) document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open]);

	const list = (projects ?? []) as Project[];
	const currentTitle = list.find((p) => p.id === currentId)?.title || "项目";

	return (
		<div className="relative min-w-0" ref={ref}>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="touch-target-dense flex max-w-[10rem] items-center gap-1 rounded-[var(--radius-md)] px-1.5 text-sm font-heading font-bold transition-colors duration-[var(--duration-fast)] hover:bg-base-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:max-w-[14rem]"
				aria-expanded={open}
				aria-haspopup="listbox"
			>
				<FilmIcon
					className="h-3.5 w-3.5 flex-shrink-0 text-primary"
					aria-hidden="true"
				/>
				<span className="min-w-0 truncate">{currentTitle}</span>
				<ChevronDownIcon
					className={`h-3 w-3 flex-shrink-0 transition-transform duration-[var(--duration-fast)] ${open ? "rotate-180" : ""}`}
					aria-hidden="true"
				/>
			</button>

			{open && (
				<div
					className="absolute left-0 top-full z-[var(--z-dropdown)] mt-1 max-h-80 w-64 overflow-y-auto overscroll-contain rounded-[var(--radius-lg)] border-2 border-base-content/15 bg-base-200 py-1 shadow-comic"
					role="listbox"
					aria-label="项目列表"
				>
					<Link
						to="/projects"
						onClick={() => setOpen(false)}
						className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-base-content/60 transition-colors duration-[var(--duration-fast)] hover:bg-base-300"
					>
						<RectangleStackIcon className="h-3 w-3" aria-hidden="true" />
						全部项目
					</Link>
					<div className="my-1 border-t border-base-content/10" />
					{list.map((p) => {
						const statusMap: Record<string, { label: string; cls: string }> = {
							draft: { label: "草稿", cls: "text-base-content/70" },
							planning: { label: "规划中", cls: "text-base-content" },
							ready: { label: "完成", cls: "text-base-content" },
							superseded: { label: "已覆盖", cls: "text-base-content/70" },
						};
						const st = statusMap[p.status] ?? {
							label: p.status,
							cls: "text-base-content/70",
						};
						return (
							<Link
								key={p.id}
								to={`/project/${p.id}`}
								onClick={() => setOpen(false)}
								role="option"
								aria-selected={p.id === currentId}
								className={`flex items-center justify-between px-3 py-1.5 text-xs transition-colors duration-[var(--duration-fast)] hover:bg-base-300 ${
									p.id === currentId
										? "bg-primary/10 font-bold text-primary"
										: ""
								}`}
							>
								<span className="min-w-0 flex-1 truncate">{p.title}</span>
								<span
									className={`ml-1.5 flex-shrink-0 font-mono text-[length:var(--text-2xs)] tabular-nums ${st.cls}`}
								>
									{st.label}
								</span>
							</Link>
						);
					})}
					<div className="my-1 border-t border-base-content/10" />
					<Link
						to="/"
						onClick={() => setOpen(false)}
						className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary transition-colors duration-[var(--duration-fast)] hover:bg-base-300"
					>
						<PlusIcon className="h-3 w-3" aria-hidden="true" />
						新建项目
					</Link>
				</div>
			)}
		</div>
	);
}

function UniverseChip() {
	const { universeId, chapterNumber, chapterTitle } = useEditorStore(
		useShallow((s) => ({
			universeId: s.projectUniverseId,
			chapterNumber: s.projectChapterNumber,
			chapterTitle: s.projectChapterTitle,
		})),
	);

	const { data: universe } = useQuery({
		queryKey: ["universe-chip", universeId],
		queryFn: () => universesApi.get(universeId!),
		enabled: Boolean(universeId),
		staleTime: 60_000,
	});

	if (!universeId) return null;

	const label =
		chapterNumber != null
			? `${universe?.name ?? "宇宙"} · 第${chapterNumber}章`
			: (universe?.name ?? "宇宙");

	return (
		<Link
			to={`/universes/${universeId}`}
			className="touch-target-dense hidden max-w-[11rem] items-center gap-1 truncate rounded-full border border-primary/25 bg-primary/10 px-2 text-[length:var(--text-2xs)] font-bold text-primary transition-colors hover:bg-primary/15 sm:inline-flex"
			title={chapterTitle || universe?.name || "IP 宇宙"}
		>
			<SparklesIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
			<span className="truncate">{label}</span>
		</Link>
	);
}

function NavLink({
	to,
	label,
	icon,
	active,
}: {
	to: string;
	label: string;
	icon: ReactNode;
	active: boolean;
}) {
	return (
		<Link
			to={to}
			aria-current={active ? "page" : undefined}
			className={clsx(
				"touch-target-dense inline-flex h-8 min-h-8 items-center gap-1 rounded-[var(--radius-md)] px-2 text-[length:var(--text-xs)] font-bold transition-colors duration-[var(--duration-fast)]",
				active
					? "bg-primary/12 text-primary"
					: "text-base-content/65 hover:bg-base-200 hover:text-base-content",
			)}
		>
			{icon}
			<span className="hidden sm:inline">{label}</span>
		</Link>
	);
}

export function TopBar({ projectId }: TopBarProps) {
	const { theme, toggleTheme } = useThemeStore();
	const isDark = theme.endsWith("dark");
	const { openModal: openSettingsModal } = useSettingsStore();
	const { pathname } = useLocation();

	const chromeBtn =
		"touch-target-dense !h-8 !min-h-8 gap-1 !px-2 transition-colors duration-[var(--duration-fast)]";

	const homeActive = pathname === "/";
	const projectsActive =
		pathname.startsWith("/projects") || pathname.startsWith("/project/");
	const universesActive = pathname.startsWith("/universes");

	return (
		<header
			className="chrome-row z-[var(--z-fixed)] gap-1.5 border-b border-base-content/12 bg-base-100 px-2 sm:gap-2 sm:px-3"
			data-shell="topbar"
		>
			<div className="flex min-w-0 items-center gap-1.5">
				<Link
					to="/"
					className="touch-target-dense inline-flex items-center rounded-[var(--radius-md)] px-1.5 font-comic text-base tracking-wide text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:text-lg sm:font-bold sm:tracking-wider"
					aria-label="openOii 首页"
				>
					openOii
				</Link>

				{projectId ? (
					<>
						<span className="text-base-content/25" aria-hidden="true">
							/
						</span>
						<ProjectDropdown currentId={projectId} />
						<UniverseChip />
					</>
				) : null}

				<nav
					className="ml-1 flex items-center gap-0.5 border-l border-base-content/10 pl-1.5"
					aria-label="主导航"
				>
					<NavLink
						to="/"
						label="创作"
						active={homeActive}
						icon={<HomeIcon className="h-3.5 w-3.5" aria-hidden="true" />}
					/>
					<NavLink
						to="/projects"
						label="项目"
						active={projectsActive && !homeActive}
						icon={
							<RectangleStackIcon className="h-3.5 w-3.5" aria-hidden="true" />
						}
					/>
					<NavLink
						to="/universes"
						label="宇宙"
						active={universesActive}
						icon={<GlobeAltIcon className="h-3.5 w-3.5" aria-hidden="true" />}
					/>
				</nav>
			</div>

			<div className="min-w-0 flex-1" />

			<div className="flex shrink-0 items-center gap-0.5">
				<Button
					variant="ghost"
					size="sm"
					className={chromeBtn}
					onClick={toggleTheme}
					aria-label={isDark ? "切换亮色主题" : "切换暗色主题"}
					title={isDark ? "切换亮色" : "切换暗色"}
				>
					{isDark ? (
						<SunIcon className="h-4 w-4" aria-hidden="true" />
					) : (
						<MoonIcon className="h-4 w-4" aria-hidden="true" />
					)}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className={chromeBtn}
					onClick={openSettingsModal}
					title="设置"
					aria-label="设置"
				>
					<Cog6ToothIcon className="h-4 w-4" aria-hidden="true" />
				</Button>
			</div>
		</header>
	);
}
