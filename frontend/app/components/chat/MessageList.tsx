import { useCallback, useRef, useEffect, useState } from "react";
import type { AgentMessage } from "~/types";
import { AGENT_NAME_MAP } from "~/types";
import { TypewriterText } from "~/components/ui/TypewriterText";
import {
  CogIcon,
  CpuChipIcon,
  HandRaisedIcon,
  LightBulbIcon,
  PaintBrushIcon,
  UserIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";

interface MessageListProps {
  messages: AgentMessage[];
}

const agentColors: Record<string, string> = {
  plan: "text-primary",
  render: "text-info",
  compose: "text-warning",
  review: "text-accent",
  system: "text-base-content/30",
  user: "text-primary",
};

const agentIcons: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  plan: LightBulbIcon,
  render: PaintBrushIcon,
  compose: VideoCameraIcon,
  review: CogIcon,
  system: CogIcon,
  user: UserIcon,
};

const MIN_TYPEWRITER_LENGTH = 50;

const agentNameMap = AGENT_NAME_MAP;

function shouldFilterOut(msg: AgentMessage): boolean {
  if (msg.role === "info" && msg.agent === "system") return true;
  if (msg.role === "separator") return false;
  if (msg.role === "handoff") return false;
  if (!msg.content?.trim() && !msg.isLoading) return true;
  return false;
}

export function MessageList({ messages }: MessageListProps) {
  const completedMessagesRef = useRef<Set<string>>(new Set());
  const messageFirstSeenRef = useRef<Map<string, number>>(new Map());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const handleComplete = useCallback((messageId: string) => {
    completedMessagesRef.current.add(messageId);
  }, []);

  const toggleCollapse = useCallback((messageId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const shouldEnableTypewriter = useCallback((msg: AgentMessage, isLastMessage: boolean): boolean => {
    if (msg.role === "user") return false;
    if (msg.role === "separator" || msg.role === "handoff" || msg.role === "info") return false;
    if (msg.content.length < MIN_TYPEWRITER_LENGTH) return false;
    if (completedMessagesRef.current.has(msg.id || "")) return false;
    if (msg.isLoading) return true;
    if (isLastMessage && msg.id) {
      const firstSeen = messageFirstSeenRef.current.get(msg.id);
      if (!firstSeen) {
        messageFirstSeenRef.current.set(msg.id, Date.now());
        return true;
      }
      return Date.now() - firstSeen < 1000;
    }
    return false;
  }, []);

  useEffect(() => {
    const currentIds = new Set(messages.map(m => m.id).filter(Boolean));
    messageFirstSeenRef.current.forEach((_, id) => {
      if (!currentIds.has(id)) {
        messageFirstSeenRef.current.delete(id);
      }
    });
  }, [messages]);

  useEffect(() => {
    if (messages.length <= 8) return;
    const toCollapse = new Set(collapsed);
    let changed = false;
    messages.forEach((msg, idx) => {
      if (idx < messages.length - 4 && msg.summary && msg.id && !toCollapse.has(msg.id)) {
        toCollapse.add(msg.id);
        changed = true;
      }
    });
    if (changed) setCollapsed(toCollapse);
  }, [messages, collapsed]);

  const filtered = messages.filter((m) => !shouldFilterOut(m));

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-base-content/30">
        <p className="text-xs">暂无消息</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {filtered.map((msg, idx) => {
        const key = msg.id || `fallback_${idx}`;
        const isLastMessage = idx === filtered.length - 1;

        if (msg.role === "separator") {
          return (
            <div key={key} className="flex justify-center my-1">
              <div className="w-full border-t-2 border-dashed border-base-content/10" />
            </div>
          );
        }

        if (msg.role === "handoff") {
          return (
            <div key={key} className="flex justify-center my-1">
              <div className="badge badge-outline badge-sm gap-0.5 text-base-content/40 border-dashed">
                <HandRaisedIcon className="w-3 h-3" aria-hidden="true" />
                <span className="text-xs">{msg.content}</span>
              </div>
            </div>
          );
        }

        const isUserMessage = msg.role === "user";
        const enableTypewriter = shouldEnableTypewriter(msg, isLastMessage);
        const AgentIcon = agentIcons[msg.agent] || CpuChipIcon;
        const isCollapsed = msg.summary && !isLastMessage && !isUserMessage && collapsed.has(msg.id || "");
        const prevMsg = idx > 0 ? filtered[idx - 1] : null;
        const sameAgentAsPrev = prevMsg?.agent === msg.agent && !isUserMessage && prevMsg?.role !== "separator" && prevMsg?.role !== "handoff";

        const messageContent = (
          <>
            {!sameAgentAsPrev && (
              <div className="flex items-center gap-1 mb-0.5">
                <AgentIcon className={`w-3 h-3 ${agentColors[msg.agent] || "text-base-content/30"}`} aria-hidden="true" />
                <span className="text-xs font-comic uppercase tracking-wide text-base-content/40">{agentNameMap[msg.agent] || msg.agent}</span>
              </div>
            )}
            <div
              className={`${isUserMessage ? "speech-bubble-user ml-3" : "speech-bubble mr-3"} select-text text-sm leading-relaxed ${
                msg.role === "error"
                  ? "!bg-error/10 !text-error rounded-lg"
                  : ""
              }`}
            >
              {isCollapsed && msg.summary ? (
                <button
                  type="button"
                  onClick={() => toggleCollapse(msg.id || "")}
                  className="text-base-content/50 hover:text-base-content/70 transition-colors text-xs italic w-full text-left"
                >
                  {msg.summary}
                </button>
              ) : (
                <>
                  <div className="whitespace-pre-wrap break-words select-text" data-copyable="true">
                    {enableTypewriter ? (
                      <TypewriterText
                        text={msg.content}
                        enabled={true}
                        charDelay={20}
                        onComplete={() => handleComplete(msg.id || "")}
                      />
                    ) : (
                      msg.content
                    )}
                  </div>
                  {msg.summary && !isLastMessage && !isUserMessage && msg.id && !collapsed.has(msg.id) && (
                    <button
                      type="button"
                      onClick={() => { if (msg.id) toggleCollapse(msg.id); }}
                      className="text-xs text-base-content/20 hover:text-base-content/40 transition-colors mt-0.5"
                    >
                      收起
                    </button>
                  )}
                </>
              )}
              {msg.isLoading && (
                <div className="flex items-center gap-1 mt-1 text-base-content/30 text-xs">
                  <span className="loading loading-dots loading-xs text-primary" />
                  处理中
                </div>
              )}
            </div>
          </>
        );

        return (
          <div key={key}>
            {messageContent}
          </div>
        );
      })}
    </div>
  );
}
