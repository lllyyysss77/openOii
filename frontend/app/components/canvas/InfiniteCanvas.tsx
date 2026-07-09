import { ComicWorkflowCanvas } from "~/features/comic-workflow/canvas/ComicWorkflowCanvas";

interface InfiniteCanvasProps {
	projectId: number;
	onSelectedNodeIdChange?: (nodeId: string | null) => void;
	onSelectedNodeIdsChange?: (nodeIds: string[]) => void;
}

export function InfiniteCanvas({
	projectId,
	onSelectedNodeIdChange,
	onSelectedNodeIdsChange,
}: InfiniteCanvasProps) {
	return (
		<ComicWorkflowCanvas
			projectId={projectId}
			onSelectedNodeIdChange={onSelectedNodeIdChange}
			onSelectedNodeIdsChange={onSelectedNodeIdsChange}
		/>
	);
}
