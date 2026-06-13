import {
	HTMLContainer,
	Rectangle2d,
	ShapeUtil,
	T,
	type Geometry2d,
	type RecordProps,
} from "tldraw";
import { SvgIcon } from "~/components/ui/SvgIcon";
import { getStaticUrl } from "~/services/api";
import { getShapeSize, useDomSize } from "~/hooks/useDomSize";
import { canvasEvents } from "../canvasEvents";
import {
	getWorkspaceSectionPlaceholderText,
	getWorkspaceSectionStatusLabel,
} from "~/utils/workspaceStatus";
import { SectionShell } from "./SectionShell";
import type { ComposeSectionShape } from "./types";

const VIDEO_PLACEHOLDER_ICON = (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="currentColor"
		className="w-8 h-8 opacity-40"
	>
		<path d="M4.5 4.5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h8.25a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3H4.5ZM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06Z" />
	</svg>
);

function stopCanvasDrag(e: React.PointerEvent<HTMLElement>) {
	e.stopPropagation();
}

export class ComposeSectionShapeUtil extends ShapeUtil<ComposeSectionShape> {
	static override type = "compose-section" as const;

	static override props: RecordProps<ComposeSectionShape> = {
		w: T.number,
		h: T.number,
		projectId: T.number,
		videoUrl: T.string,
		videoTitle: T.string,
		downloadUrl: T.string,
		sectionState: T.string,
		placeholder: T.boolean,
		statusLabel: T.string,
		placeholderText: T.string,
	};

	getDefaultProps(): ComposeSectionShape["props"] {
		return {
			w: 920,
			h: 300,
			projectId: 0,
			videoUrl: "",
			videoTitle: "最终视频",
			downloadUrl: "",
			sectionState: "draft",
			placeholder: true,
			statusLabel: getWorkspaceSectionStatusLabel("draft"),
			placeholderText: getWorkspaceSectionPlaceholderText("compose"),
		};
	}

	override canEdit() {
		return true;
	}
	override canResize() {
		return false;
	}
	override canCull() {
		return false;
	}

	getGeometry(shape: ComposeSectionShape): Geometry2d {
		const size = this.editor ? getShapeSize(this.editor, shape.id) : undefined;
		return new Rectangle2d({
			width: shape.props.w,
			height: size?.height ?? shape.props.h,
			isFilled: true,
		});
	}

	component(shape: ComposeSectionShape) {
		const {
			w,
			videoUrl,
			videoTitle,
			downloadUrl,
			placeholder,
			placeholderText,
			statusLabel,
			sectionState,
		} = shape.props;
		const ref = useDomSize(shape, this.editor ?? null);

		return (
			<HTMLContainer
				style={{ width: w, pointerEvents: "all", overflow: "visible" }}
			>
				<div ref={ref} style={{ width: w }}>
					<SectionShell
						sectionKey="compose"
						sectionTitle="最终输出"
						statusLabel={statusLabel}
						placeholder={!videoUrl && placeholder}
						placeholderText={placeholderText}
						placeholderIcon={VIDEO_PLACEHOLDER_ICON}
					>
						{sectionState === "blocked" && placeholderText ? (
							<p className="mb-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-content">
								{placeholderText}
							</p>
						) : null}
						{videoUrl ? (
							<div className="space-y-3">
								<div
									className="relative w-full aspect-video rounded-xl bg-gradient-to-br from-base-300 to-base-200 cursor-pointer group"
									onClick={() => canvasEvents.emit("preview-video", { src: videoUrl, title: videoTitle })}
									onPointerDown={stopCanvasDrag}
								>
									<div className="absolute inset-0 flex items-center justify-center">
										<div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-primary transition-all">
											<svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-primary-content ml-1">
												<path d="M8 5.14v14l11-7-11-7Z" />
											</svg>
										</div>
									</div>
									<div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-base-content/40 to-transparent rounded-b-xl">
										<p className="text-sm font-medium text-base-100 truncate">{videoTitle}</p>
									</div>
								</div>
								<div className="flex justify-end">
									<a
										href={getStaticUrl(downloadUrl || videoUrl) ?? undefined}
										download
										className="btn btn-sm btn-doodle gap-1 text-xs"
										onPointerDown={stopCanvasDrag}
									>
										<SvgIcon name="download" size={12} />
										下载
									</a>
								</div>
							</div>
						) : null}
					</SectionShell>
				</div>
			</HTMLContainer>
		);
	}

	indicator(shape: ComposeSectionShape) {
		const size = this.editor ? getShapeSize(this.editor, shape.id) : undefined;
		return (
			<rect
				width={shape.props.w}
				height={size?.height ?? shape.props.h}
				rx={24}
			/>
		);
	}
}
