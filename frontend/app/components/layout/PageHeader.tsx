import type { ReactNode } from "react";
import { clsx } from "clsx";

/**
 * Shared dense page header for list/detail desks (projects, universes, home sections).
 * Keep eyebrow/title/description + actions density consistent across routes.
 */
export function PageHeader({
	eyebrow,
	title,
	description,
	meta,
	actions,
	className,
}: {
	eyebrow?: string;
	title: string;
	description?: string;
	meta?: ReactNode;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<header
			className={clsx(
				"flex flex-col gap-2 border-b border-base-content/10 pb-3",
				"lg:flex-row lg:items-end lg:justify-between",
				className,
			)}
			data-shell="page-header"
		>
			<div className="min-w-0">
				{eyebrow ? (
					<p className="m-0 font-mono text-[length:var(--text-2xs)] uppercase tracking-wide text-base-content/55">
						{eyebrow}
					</p>
				) : null}
				<div className="mt-0.5 flex flex-wrap items-end gap-2">
					<h1 className="m-0 font-heading text-[length:var(--text-xl)] font-bold leading-tight text-pretty">
						{title}
					</h1>
					{meta ? (
						<div className="pb-0.5 font-mono text-[length:var(--text-2xs)] tabular-nums text-base-content/45">
							{meta}
						</div>
					) : null}
				</div>
				{description ? (
					<p className="m-0 mt-1 max-w-2xl text-[length:var(--text-sm)] text-base-content/65 text-pretty">
						{description}
					</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>
			) : null}
		</header>
	);
}

/** Content column used by list/detail pages. */
export function PageContent({
	children,
	className,
	width = "default",
}: {
	children: ReactNode;
	className?: string;
	width?: "default" | "wide" | "narrow";
}) {
	const max =
		width === "wide"
			? "max-w-7xl"
			: width === "narrow"
				? "max-w-3xl"
				: "max-w-6xl";
	return (
		<div
			className={clsx(
				"mx-auto flex w-full flex-col gap-[var(--space-3)] px-[var(--space-3)] py-[var(--space-3)] sm:px-[var(--space-4)]",
				max,
				className,
			)}
			data-shell="page-content"
		>
			{children}
		</div>
	);
}
