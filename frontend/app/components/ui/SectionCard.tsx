import type { ReactNode } from "react";
import { clsx } from "clsx";
import { Card } from "~/components/ui/Card";

/** Dense section shell for list/detail desks (universe, assets, etc.). */
export function SectionCard({
	title,
	icon,
	meta,
	actions,
	children,
	className,
	variant,
}: {
	title: string;
	icon?: ReactNode;
	meta?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
	variant?: "default" | "primary" | "accent" | "secondary";
}) {
	return (
		<Card className={clsx("!p-3", className)} variant={variant} data-shell="section-card">
			<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5">
					{icon ? (
						<span className="shrink-0 text-base-content/70" aria-hidden="true">
							{icon}
						</span>
					) : null}
					<h2 className="m-0 font-heading text-[length:var(--text-md)] font-bold leading-tight">
						{title}
					</h2>
					{meta ? (
						<span className="font-mono text-[length:var(--text-2xs)] tabular-nums text-base-content/40">
							{meta}
						</span>
					) : null}
				</div>
				{actions ? (
					<div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>
				) : null}
			</div>
			{children}
		</Card>
	);
}

/** Compact row used in chapter lists / dense indexes. */
export function DenseRow({
	leading,
	title,
	subtitle,
	trailing,
	href,
	className,
}: {
	leading?: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
	trailing?: ReactNode;
	href?: string;
	className?: string;
}) {
	const body = (
		<div
			className={clsx(
				"flex min-h-10 items-center justify-between gap-2 rounded-[var(--radius-md)] bg-base-200/50 px-2 py-1.5 transition-colors duration-[var(--duration-fast)] hover:bg-base-200",
				className,
			)}
			data-shell="dense-row"
		>
			<div className="flex min-w-0 items-center gap-2">
				{leading}
				<div className="min-w-0">
					<div className="truncate font-heading text-[length:var(--text-sm)] font-bold">
						{title}
					</div>
					{subtitle ? (
						<div className="truncate text-[length:var(--text-2xs)] text-base-content/50">
							{subtitle}
						</div>
					) : null}
				</div>
			</div>
			{trailing ? <div className="flex shrink-0 items-center gap-1">{trailing}</div> : null}
		</div>
	);

	if (!href) return body;
	// Caller supplies Link-wrapped title when needed; keep row non-anchor to avoid nested interactive.
	return body;
}
