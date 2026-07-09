import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { universesApi } from "~/services/api";
import { SharedCharacterCard } from "~/components/universe/SharedCharacterCard";
import { Card } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { Modal } from "~/components/ui/Modal";
import {
	PlusIcon,
	BookOpenIcon,
	TrashIcon,
	GlobeAltIcon,
	PaintBrushIcon,
	UserGroupIcon,
	PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { toast } from "~/utils/toast";
import type { SharedCharacterRead, UniverseDetail } from "~/types";
import { PageBody, PageShell } from "~/components/layout/PageShell";

export function UniverseDetailPage() {
	const { universeId } = useParams<{ universeId: string }>();
	const queryClient = useQueryClient();
	const id = Number(universeId);
	const [editOpen, setEditOpen] = useState(false);
	const [createCharOpen, setCreateCharOpen] = useState(false);
	const [importProjectId, setImportProjectId] = useState("");
	const [editForm, setEditForm] = useState({
		name: "",
		description: "",
		world_setting: "",
		style_rules: "",
	});
	const [charForm, setCharForm] = useState({
		name: "",
		description: "",
		visual_notes: "",
		character_tags: "",
	});

	const { data: universe, isLoading } = useQuery({
		queryKey: ["universe", id],
		queryFn: () => universesApi.get(id),
		enabled: !isNaN(id),
	});

	const removeProjectMutation = useMutation({
		mutationFn: (projectId: number) =>
			universesApi.removeProject(id, projectId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["universe", id] });
			queryClient.invalidateQueries({ queryKey: ["universes"] });
			toast.success({ title: "已移除", message: "项目已从宇宙移除" });
		},
	});

	const updateMutation = useMutation({
		mutationFn: () =>
			universesApi.update(id, {
				name: editForm.name.trim() || null,
				description: editForm.description || null,
				world_setting: editForm.world_setting || null,
				style_rules: editForm.style_rules || null,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["universe", id] });
			queryClient.invalidateQueries({ queryKey: ["universes"] });
			setEditOpen(false);
			toast.success({ title: "已保存", message: "宇宙设定已更新" });
		},
		onError: (error: Error) => {
			toast.error({ title: "保存失败", message: error.message });
		},
	});

	const createCharMutation = useMutation({
		mutationFn: () =>
			universesApi.createSharedCharacter(id, {
				name: charForm.name.trim(),
				description: charForm.description || null,
				visual_notes: charForm.visual_notes || null,
				character_tags: charForm.character_tags || null,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["universe", id] });
			setCreateCharOpen(false);
			setCharForm({
				name: "",
				description: "",
				visual_notes: "",
				character_tags: "",
			});
			toast.success({ title: "已创建", message: "共享角色已加入宇宙库" });
		},
		onError: (error: Error) => {
			toast.error({ title: "创建失败", message: error.message });
		},
	});

	const importMutation = useMutation({
		mutationFn: ({
			projectId,
			sharedId,
		}: {
			projectId: number;
			sharedId: number;
		}) => universesApi.importCharacter(projectId, sharedId),
		onSuccess: (char) => {
			toast.success({
				title: "已导入章节",
				message: `角色「${char.name}」已写入项目 #${char.project_id}`,
			});
			queryClient.invalidateQueries({
				queryKey: ["characters", char.project_id],
			});
		},
		onError: (error: Error) => {
			toast.error({ title: "导入失败", message: error.message });
		},
	});

	if (isLoading) {
		return (
			<PageShell className="items-center justify-center">
				<span className="loading loading-spinner loading-lg text-primary" />
			</PageShell>
		);
	}

	if (!universe) {
		return (
			<PageShell className="items-center justify-center">
				<p className="text-base-content/50">宇宙不存在</p>
			</PageShell>
		);
	}

	const u = universe as UniverseDetail;
	const nextChapterNumber =
		u.chapters.length > 0
			? Math.max(...u.chapters.map((chapter) => chapter.chapter_number ?? 0)) + 1
			: 1;
	const createChapterHref = `/?universeId=${u.id}&chapterNumber=${nextChapterNumber}`;
	const defaultImportProjectId =
		u.chapters[0]?.project_id != null ? String(u.chapters[0].project_id) : "";

	const openEdit = () => {
		setEditForm({
			name: u.name,
			description: u.description || "",
			world_setting: u.world_setting || "",
			style_rules: u.style_rules || "",
		});
		setEditOpen(true);
	};

	const handleImport = (character: SharedCharacterRead) => {
		const projectId = Number(importProjectId || defaultImportProjectId);
		if (!Number.isFinite(projectId) || projectId <= 0) {
			toast.error({
				title: "请选择章节",
				message: "先填写要导入到的项目 ID（章节列表中的项目）",
			});
			return;
		}
		importMutation.mutate({ projectId, sharedId: character.id });
	};

	return (
		<PageShell data-shell="universe-detail">
			<header className="chrome-row z-[var(--z-fixed)] gap-2 border-b border-base-content/12 bg-base-200 px-2 sm:px-3">
				<div className="flex flex-1 items-center gap-1">
					<Link
						to="/universes"
						className="btn btn-ghost btn-sm touch-target-dense h-8 min-h-8"
					>
						← 返回宇宙列表
					</Link>
					<button
						type="button"
						className="btn btn-ghost btn-sm touch-target-dense h-8 min-h-8 gap-1"
						onClick={openEdit}
					>
						<PencilSquareIcon className="h-3.5 w-3.5" />
						编辑设定
					</button>
				</div>
				<div className="flex flex-1 justify-end">
					<Link
						to={createChapterHref}
						className="btn-doodle touch-target-dense inline-flex h-8 min-h-8 items-center gap-1 bg-primary px-2 text-[length:var(--text-2xs)] font-heading text-primary-content"
					>
						<PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
						新建章节
					</Link>
				</div>
			</header>

			<PageBody className="mx-auto w-full max-w-6xl space-y-[var(--space-3)] px-[var(--space-3)] py-[var(--space-3)] sm:px-[var(--space-4)]">
				<div>
					<h1 className="m-0 font-heading text-[length:var(--text-xl)] font-bold leading-tight text-pretty">
						{u.name}
					</h1>
					{u.description ? (
						<p className="m-0 mt-1 text-[length:var(--text-sm)] text-base-content/60">
							{u.description}
						</p>
					) : (
						<p className="m-0 mt-1 text-[length:var(--text-2xs)] text-base-content/40">
							尚未填写简介 · 点击顶栏「编辑设定」
						</p>
					)}
				</div>

				{u.world_setting ? (
					<Card className="!p-3" variant="primary">
						<h2 className="mb-1 flex items-center gap-1.5 font-heading text-[length:var(--text-md)] font-bold">
							<GlobeAltIcon className="h-4 w-4" aria-hidden="true" />
							世界观设定
						</h2>
						<p className="m-0 whitespace-pre-wrap text-[length:var(--text-sm)] text-base-content/70">
							{u.world_setting}
						</p>
					</Card>
				) : null}

				{u.style_rules ? (
					<Card className="!p-3" variant="accent">
						<h2 className="mb-1 flex items-center gap-1.5 font-heading text-[length:var(--text-md)] font-bold">
							<PaintBrushIcon className="h-4 w-4" aria-hidden="true" />
							统一风格规则
						</h2>
						<p className="m-0 whitespace-pre-wrap text-[length:var(--text-sm)] text-base-content/70">
							{u.style_rules}
						</p>
					</Card>
				) : null}

				<Card className="!p-3">
					<div className="mb-2 flex items-center justify-between gap-2">
						<h2 className="m-0 flex items-center gap-1.5 font-heading text-[length:var(--text-md)] font-bold">
							<BookOpenIcon className="h-4 w-4" aria-hidden="true" />
							章节列表
						</h2>
						<span className="font-mono text-[length:var(--text-2xs)] tabular-nums text-base-content/40">
							{u.chapters.length} 章
						</span>
					</div>

					{u.chapters.length === 0 ? (
						<p className="py-6 text-center text-[length:var(--text-sm)] text-base-content/40">
							还没有章节，从顶栏新建第一个工作区
						</p>
					) : (
						<div className="space-y-1">
							{[...u.chapters]
								.sort(
									(a, b) =>
										(a.chapter_number ?? 999) - (b.chapter_number ?? 999),
								)
								.map((ch) => (
									<div
										key={ch.id}
										className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-base-200/50 px-2 py-1.5 transition-colors duration-[var(--duration-fast)] hover:bg-base-200"
									>
										<div className="flex min-w-0 items-center gap-2">
											<span className="badge badge-primary badge-sm shrink-0 font-bold tabular-nums">
												第{ch.chapter_number ?? "?"}章
											</span>
											<Link
												to={`/project/${ch.project_id}`}
												className="truncate font-heading text-[length:var(--text-sm)] font-bold transition-colors hover:text-primary"
											>
												{ch.chapter_title || ch.project_title || "未命名"}
											</Link>
											<span className="font-mono text-[length:var(--text-2xs)] text-base-content/35">
												#{ch.project_id}
											</span>
											{!ch.is_main_story ? (
												<span className="badge badge-ghost badge-xs shrink-0">
													外传
												</span>
											) : null}
										</div>
										<button
											type="button"
											className="btn btn-ghost btn-xs text-error/50 hover:text-error"
											aria-label={`从宇宙移除${ch.chapter_title || ch.project_title || "未命名项目"}`}
											title="从宇宙移除"
											onClick={() =>
												removeProjectMutation.mutate(ch.project_id)
											}
										>
											<TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
										</button>
									</div>
								))}
						</div>
					)}
				</Card>

				<Card className="!p-3">
					<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
						<h2 className="m-0 flex items-center gap-1.5 font-heading text-[length:var(--text-md)] font-bold">
							<UserGroupIcon className="h-4 w-4" aria-hidden="true" />
							共享角色库
						</h2>
						<div className="flex flex-wrap items-center gap-2">
							<label className="flex items-center gap-1 text-[length:var(--text-2xs)] text-base-content/55">
								导入到项目
								<input
									className="input input-bordered input-xs h-7 w-20 font-mono"
									placeholder={defaultImportProjectId || "ID"}
									value={importProjectId}
									onChange={(e) => setImportProjectId(e.target.value)}
									inputMode="numeric"
								/>
							</label>
							<Button
								size="sm"
								className="h-8 min-h-8"
								onClick={() => setCreateCharOpen(true)}
							>
								+ 手动创建
							</Button>
						</div>
					</div>

					{u.shared_characters.length === 0 ? (
						<p className="py-6 text-center text-[length:var(--text-sm)] text-base-content/40">
							还没有共享角色。可在章节工作台把角色「提升到宇宙」，或在此手动创建。
						</p>
					) : (
						<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
							{u.shared_characters.map((sc) => (
								<SharedCharacterCard
									key={sc.id}
									character={sc}
									showImport={u.chapters.length > 0}
									onImport={handleImport}
								/>
							))}
						</div>
					)}
				</Card>
			</PageBody>

			<Modal
				isOpen={editOpen}
				onClose={() => setEditOpen(false)}
				title="编辑宇宙设定"
				actions={
					<>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setEditOpen(false)}
						>
							取消
						</Button>
						<Button
							size="sm"
							loading={updateMutation.isPending}
							onClick={() => updateMutation.mutate()}
							disabled={!editForm.name.trim()}
						>
							保存
						</Button>
					</>
				}
			>
				<div className="space-y-3">
					<Input
						label="名称"
						value={editForm.name}
						onChange={(e) =>
							setEditForm((s) => ({ ...s, name: e.target.value }))
						}
					/>
					<label className="form-control">
						<span className="label-text text-xs font-medium">简介</span>
						<textarea
							className="textarea textarea-bordered textarea-sm min-h-16"
							value={editForm.description}
							onChange={(e) =>
								setEditForm((s) => ({ ...s, description: e.target.value }))
							}
						/>
					</label>
					<label className="form-control">
						<span className="label-text text-xs font-medium">世界观</span>
						<textarea
							className="textarea textarea-bordered textarea-sm min-h-20"
							value={editForm.world_setting}
							onChange={(e) =>
								setEditForm((s) => ({ ...s, world_setting: e.target.value }))
							}
						/>
					</label>
					<label className="form-control">
						<span className="label-text text-xs font-medium">风格规则</span>
						<textarea
							className="textarea textarea-bordered textarea-sm min-h-16"
							value={editForm.style_rules}
							onChange={(e) =>
								setEditForm((s) => ({ ...s, style_rules: e.target.value }))
							}
						/>
					</label>
				</div>
			</Modal>

			<Modal
				isOpen={createCharOpen}
				onClose={() => setCreateCharOpen(false)}
				title="手动创建共享角色"
				actions={
					<>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setCreateCharOpen(false)}
						>
							取消
						</Button>
						<Button
							size="sm"
							loading={createCharMutation.isPending}
							disabled={!charForm.name.trim()}
							onClick={() => createCharMutation.mutate()}
						>
							创建
						</Button>
					</>
				}
			>
				<div className="space-y-3">
					<Input
						label="名称"
						value={charForm.name}
						onChange={(e) =>
							setCharForm((s) => ({ ...s, name: e.target.value }))
						}
					/>
					<label className="form-control">
						<span className="label-text text-xs font-medium">描述</span>
						<textarea
							className="textarea textarea-bordered textarea-sm min-h-16"
							value={charForm.description}
							onChange={(e) =>
								setCharForm((s) => ({ ...s, description: e.target.value }))
							}
						/>
					</label>
					<label className="form-control">
						<span className="label-text text-xs font-medium">视觉笔记</span>
						<textarea
							className="textarea textarea-bordered textarea-sm min-h-16"
							value={charForm.visual_notes}
							onChange={(e) =>
								setCharForm((s) => ({ ...s, visual_notes: e.target.value }))
							}
						/>
					</label>
					<Input
						label="标签（逗号分隔）"
						value={charForm.character_tags}
						onChange={(e) =>
							setCharForm((s) => ({ ...s, character_tags: e.target.value }))
						}
					/>
				</div>
			</Modal>
		</PageShell>
	);
}
