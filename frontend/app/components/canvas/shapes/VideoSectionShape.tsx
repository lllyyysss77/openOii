import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  type Geometry2d,
  type RecordProps,
} from "tldraw";
import type { VideoSectionShape } from "./types";
import { SectionShell } from "./SectionShell";
import {
  getWorkspaceSectionPlaceholderText,
  getWorkspaceSectionStatusLabel,
} from "~/utils/workspaceStatus";
import { getStaticUrl } from "~/services/api";
import { SvgIcon } from "~/components/ui/SvgIcon";
import { useDomSize, getShapeSize } from "~/hooks/useDomSize";
import { canvasEvents } from "../canvasEvents";

const PLACEHOLDER_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 opacity-40">
    <path d="M4.5 4.5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h8.25a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3H4.5ZM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06Z" />
  </svg>
);

export class VideoSectionShapeUtil extends ShapeUtil<VideoSectionShape> {
  static override type = "video-section" as const;

  static override props: RecordProps<VideoSectionShape> = {
    w: T.number,
    h: T.number,
    projectId: T.number,
    videoUrl: T.string,
    title: T.string,
    downloadUrl: T.string,
    previewLabel: T.string,
    downloadLabel: T.string,
    retryLabel: T.string,
    provenanceText: T.string,
    blockingText: T.string,
    retryFeedback: T.string,
    retryRunId: T.any,
    retryThreadId: T.any,
    sectionState: T.string,
    placeholder: T.boolean,
    statusLabel: T.string,
    placeholderText: T.string,
  };

  getDefaultProps(): VideoSectionShape["props"] {
    return {
      w: 600,
      h: 300,
      projectId: 0,
      videoUrl: "",
      title: "最终视频",
      downloadUrl: "",
      previewLabel: "预览最终视频",
      downloadLabel: "下载最终视频",
      retryLabel: "重试合成",
      provenanceText: "来源：等待分镜片段完成后生成最终视频",
      blockingText: "",
      retryFeedback: "请基于当前最终视频重新合成。",
      retryRunId: null,
      retryThreadId: null,
      sectionState: "blocked",
      placeholder: true,
      statusLabel: getWorkspaceSectionStatusLabel("blocked"),
      placeholderText: getWorkspaceSectionPlaceholderText("compose"),
    };
  }

  override canEdit() { return true; }
  override canResize() { return false; }
  override canCull() { return false; }

  getGeometry(shape: VideoSectionShape): Geometry2d {
    const size = this.editor ? getShapeSize(this.editor, shape.id) : undefined;
    return new Rectangle2d({
      width: shape.props.w,
      height: size?.height ?? shape.props.h,
      isFilled: true,
    });
  }

  component(shape: VideoSectionShape) {
    const {
      videoUrl, title, blockingText,
      placeholder, placeholderText, statusLabel,
      w,
    } = shape.props;
    const ref = useDomSize(shape, this.editor ?? null);

    return (
      <HTMLContainer style={{ width: w, pointerEvents: "all", overflow: "visible" }}>
        <div ref={ref} style={{ width: w }}>
        <SectionShell
          sectionKey="compose"
          sectionTitle="最终输出"
          statusLabel={statusLabel}
          placeholder={!videoUrl && placeholder}
          placeholderText={placeholderText}
          placeholderIcon={PLACEHOLDER_ICON}
        >
          {videoUrl ? (
            <div className="space-y-2">
              <div
                className="relative w-full aspect-video rounded-xl bg-gradient-to-br from-base-300 to-base-200 cursor-pointer group"
                onClick={() => canvasEvents.emit("preview-video", { src: videoUrl, title })}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-primary transition-all">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-primary-content ml-1">
                      <path d="M8 5.14v14l11-7-11-7Z" />
                    </svg>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-base-content/40 to-transparent rounded-b-xl">
                  <p className="text-sm font-medium text-base-100 truncate">{title}</p>
                </div>
              </div>
              <div className="flex gap-1.5 justify-end items-center">
                <SvgIcon name="volume-2" size={12} className="text-base-content/40" />
                <a
                  href={getStaticUrl(videoUrl) ?? undefined}
                  download
                  className="btn btn-sm btn-ghost border-2 border-base-content/15 text-xs gap-1 hover:border-primary/40 hover:-translate-y-0.5 transition-all"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <SvgIcon name="download" size={12} />
                  下载
                </a>
              </div>
              {blockingText && <p className="text-xs text-warning">{blockingText}</p>}
            </div>
          ) : null}
        </SectionShell>
        </div>
      </HTMLContainer>
    );
  }

  indicator() { return null; }
}
