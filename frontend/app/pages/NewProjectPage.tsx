import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { projectsApi } from "~/services/api";
import { ProviderSelectionFields } from "~/components/project/ProviderSelectionFields";
import { StyleTemplateGrid } from "~/components/project/StyleTemplateGrid";
import { CreateStyleModal } from "~/components/project/CreateStyleModal";
import { UniverseSelector } from "~/components/universe/UniverseSelector";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { Card } from "~/components/ui/Card";
import {
  AdjustmentsHorizontalIcon,
  BoltIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  PaintBrushIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { toast } from "~/utils/toast";
import { ApiError } from "~/types/errors";

export function NewProjectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [showCreateStyle, setShowCreateStyle] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    story: "",
    style: "cinematic",
    text_provider_override: null as string | null,
    image_provider_override: null as string | null,
    video_provider_override: null as string | null,
    universe_id: null as number | null,
    target_shot_count: 6 as number | null,
    character_hints: [""],
    creation_mode: "review" as "review" | "quick",
  });

  const buildCreatePayload = () => {
    const characterHints = formData.character_hints
      .map((hint) => hint.trim())
      .filter(Boolean);

    return {
      title: formData.title,
      story: formData.story,
      style: formData.style,
      text_provider_override: formData.text_provider_override,
      image_provider_override: formData.image_provider_override,
      video_provider_override: formData.video_provider_override,
      universe_id: formData.universe_id,
      target_shot_count: formData.target_shot_count ?? undefined,
      creation_mode: formData.creation_mode,
      ...(characterHints.length > 0 ? { character_hints: characterHints } : {}),
    };
  };

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success({
        title: "创建成功",
        message: "项目已创建，正在跳转...",
      });
      navigate(`/project/${project.id}?autoStart=true`);
    },
    onError: (error: Error | ApiError) => {
      const apiError = error instanceof ApiError ? error : null;
      toast.error({
        title: "创建失败",
        message: apiError?.message || error.message || "未知错误",
        actions: [
          {
            label: "重试",
            onClick: () => createMutation.mutate(buildCreatePayload()),
          },
        ],
      });
    },
  });

  const handleSubmit = () => {
    if (!formData.title.trim()) return;
    createMutation.mutate(buildCreatePayload());
  };

  const updateCharacterHint = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      character_hints: prev.character_hints.map((hint, i) =>
        i === index ? value : hint,
      ),
    }));
  };

  const addCharacterHint = () => {
    setFormData((prev) => ({
      ...prev,
      character_hints: [...prev.character_hints, ""],
    }));
  };

  const removeCharacterHint = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      character_hints: prev.character_hints.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="min-h-screen bg-base-100">
      {/* Header */}
      <header className="navbar bg-base-200 border-b border-base-300">
        <div className="flex-1">
          <Link to="/" className="btn btn-ghost">
            ← 返回
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Progress steps */}
        <ul className="steps steps-horizontal w-full mb-8">
          <li className={`step ${step >= 1 ? "step-primary" : ""}`}>故事</li>
          <li className={`step ${step >= 2 ? "step-primary" : ""}`}>风格</li>
          <li className={`step ${step >= 3 ? "step-primary" : ""}`}>确认</li>
        </ul>

        {/* Step 1: Story */}
        {step === 1 && (
          <Card
            title={
              <span className="inline-flex items-center gap-2">
                <DocumentTextIcon className="w-5 h-5" aria-hidden="true" />
                <span className="underline-sketch">讲述你的故事</span>
              </span>
            }
          >
            <div className="space-y-4">
              <Input
                label="项目标题"
                placeholder="我的精彩故事"
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
              />
              <div className="form-control">
                <label className="label" htmlFor="project-story">
                  <span className="label-text">故事内容</span>
                </label>
                <textarea
                  id="project-story"
                  className="textarea textarea-bordered bg-base-200 h-48"
                  placeholder="很久很久以前..."
                  value={formData.story}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, story: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset className="rounded-lg border border-base-300 bg-base-200/60 p-3">
                  <legend className="px-1 text-sm font-semibold text-base-content">
                    创作模式
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`btn btn-sm gap-1 ${
                        formData.creation_mode === "review"
                          ? "btn-primary"
                          : "btn-outline btn-ghost"
                      }`}
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          creation_mode: "review",
                        }))
                      }
                      aria-pressed={formData.creation_mode === "review"}
                    >
                      <AdjustmentsHorizontalIcon className="w-4 h-4" />
                      精细审阅
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm gap-1 ${
                        formData.creation_mode === "quick"
                          ? "btn-primary"
                          : "btn-outline btn-ghost"
                      }`}
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          creation_mode: "quick",
                        }))
                      }
                      aria-pressed={formData.creation_mode === "quick"}
                    >
                      <BoltIcon className="w-4 h-4" />
                      快速生成
                    </button>
                  </div>
                </fieldset>
                <div className="form-control rounded-lg border border-base-300 bg-base-200/60 p-3">
                  <label className="label py-1" htmlFor="target-shot-count">
                    <span className="label-text text-sm font-semibold">
                      目标镜头数 {formData.target_shot_count ?? "自动"}
                    </span>
                  </label>
                  <input
                    id="target-shot-count"
                    type="range"
                    min={1}
                    max={20}
                    value={formData.target_shot_count ?? 6}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        target_shot_count: Number(e.target.value),
                      }))
                    }
                    className="range range-xs range-primary"
                  />
                </div>
              </div>
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-sm font-bold">角色提示</span>
                </label>
                <div className="space-y-2">
                  {formData.character_hints.map((hint, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        className="input input-sm input-bordered bg-base-200 flex-1"
                        placeholder={`角色 ${index + 1}`}
                        value={hint}
                        onChange={(e) => updateCharacterHint(index, e.target.value)}
                      />
                      {formData.character_hints.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-square"
                          onClick={() => removeCharacterHint(index)}
                          aria-label={`删除角色 ${index + 1}`}
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {formData.character_hints.length < 6 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm gap-1 text-primary"
                      onClick={addCharacterHint}
                    >
                      <PlusIcon className="w-4 h-4" />
                      添加角色
                    </button>
                  )}
                </div>
              </div>
              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm font-bold">所属宇宙（可选）</span>
                </label>
                <UniverseSelector
                  value={formData.universe_id}
                  onChange={(id) =>
                    setFormData((prev) => ({ ...prev, universe_id: id }))
                  }
                />
                <label className="label">
                  <span className="label-text-alt text-xs text-base-content/40">
                    选择宇宙后，角色会自动从共享角色库导入
                  </span>
                </label>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!formData.title.trim()}
                >
                  下一步 →
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Step 2: Style */}
        {step === 2 && (
          <Card
            title={
              <span className="inline-flex items-center gap-2">
                <PaintBrushIcon className="w-5 h-5" aria-hidden="true" />
                <span className="underline-sketch">选择风格</span>
              </span>
            }
          >
            <div className="mb-6">
              <StyleTemplateGrid
                selectedSlug={formData.style}
                onSelect={(slug) =>
                  setFormData((prev) => ({ ...prev, style: slug }))
                }
                onCreateNew={() => setShowCreateStyle(true)}
              />
            </div>
            <div className="mb-6 border-t border-base-300 pt-6">
              <div className="mb-4">
                <h4 className="text-base font-semibold text-base-content">
                  Provider 选择
                </h4>
                <p className="mt-1 text-sm text-base-content/70">
                  为当前项目单独设置 text / image / video provider；不设置时继承系统默认。
                </p>
              </div>
              <ProviderSelectionFields
                value={{
                  text_provider_override: formData.text_provider_override,
                  image_provider_override: formData.image_provider_override,
                  video_provider_override: formData.video_provider_override,
                }}
                onChange={(providers) =>
                  setFormData((prev) => ({ ...prev, ...providers }))
                }
              />
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                ← 返回
              </Button>
              <Button onClick={() => setStep(3)}>下一步 →</Button>
            </div>
          </Card>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <Card
            title={
              <span className="inline-flex items-center gap-2">
                <CheckCircleIcon className="w-5 h-5" aria-hidden="true" />
                <span className="underline-sketch">确认项目</span>
              </span>
            }
          >
            <div className="space-y-4">
              <div className="bg-base-300 rounded-lg p-4">
                <h3 className="font-semibold text-lg">{formData.title}</h3>
                <div className="badge badge-outline mt-2 flex items-center gap-2 text-base-content">
                  <PaintBrushIcon className="w-5 h-5" aria-hidden="true" />
                  {formData.style}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="badge badge-ghost gap-1">
                    {formData.creation_mode === "quick" ? (
                      <BoltIcon className="w-3 h-3" aria-hidden="true" />
                    ) : (
                      <AdjustmentsHorizontalIcon className="w-3 h-3" aria-hidden="true" />
                    )}
                    {formData.creation_mode === "quick" ? "快速生成" : "精细审阅"}
                  </span>
                  <span className="badge badge-ghost">
                    {formData.target_shot_count ?? "自动"} 镜头
                  </span>
                </div>
                {formData.character_hints.some((hint) => hint.trim()) && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {formData.character_hints
                      .map((hint) => hint.trim())
                      .filter(Boolean)
                      .map((hint) => (
                        <span key={hint} className="badge badge-outline badge-sm">
                          {hint}
                        </span>
                      ))}
                  </div>
                )}
                {formData.universe_id && (
                  <div className="badge badge-primary mt-2 ml-2 inline-flex items-center gap-1">
                    <GlobeAltIcon className="w-3 h-3" aria-hidden="true" />
                    属于宇宙
                  </div>
                )}
                {formData.story && (
                  <p className="text-sm text-base-content/70 mt-3 line-clamp-4">
                    {formData.story}
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-base-300 bg-base-200/60 p-4">
                <h4 className="text-sm font-semibold text-base-content">
                  Provider 选择
                </h4>
                <dl className="mt-3 space-y-2 text-sm text-base-content/80">
                  <div className="flex items-center justify-between gap-4">
                    <dt>文本</dt>
                    <dd>{formData.text_provider_override ?? "继承默认"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt>图像</dt>
                    <dd>{formData.image_provider_override ?? "继承默认"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt>视频</dt>
                    <dd>{formData.video_provider_override ?? "继承默认"}</dd>
                  </div>
                </dl>
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  ← 返回
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  loading={createMutation.isPending}
                >
                  创建项目
                </Button>
              </div>
            </div>
          </Card>
        )}

        {createMutation.isError && (
          <div className="alert alert-error mt-4">
            <span>创建项目失败，请重试。</span>
          </div>
        )}
      </main>

      {/* Create Style Modal */}
      <CreateStyleModal
        isOpen={showCreateStyle}
        onClose={() => setShowCreateStyle(false)}
        onCreated={(slug) => {
          setFormData((prev) => ({ ...prev, style: slug }));
          setShowCreateStyle(false);
        }}
      />
    </div>
  );
}
