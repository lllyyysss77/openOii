import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPanel } from './ChatPanel';
import type { WorkflowStage } from '~/types';
import type { RunMode } from '~/stores/editorStore';

type ChatPanelStoreState = {
  messages: never[];
  currentAgent: string | null;
  awaitingConfirm: boolean;
  awaitingAgent: string | null;
  currentStage: WorkflowStage;
  currentRunId: number | null;
  runMode: RunMode;
  setRunMode: (mode: RunMode) => void;
};

const onSendFeedback = vi.fn();
const onConfirm = vi.fn();
const onGenerate = vi.fn();
const onCancel = vi.fn();
const setRunMode = vi.fn();

const storeState: ChatPanelStoreState = {
  messages: [] as never[],
  currentAgent: null,
  awaitingConfirm: false,
  awaitingAgent: null,
  currentStage: 'plan',
  currentRunId: null as number | null,
  runMode: 'manual',
  setRunMode,
};

vi.mock('~/stores/editorStore', () => ({
  useEditorStore: Object.assign(
    (selector?: (state: typeof storeState) => unknown) =>
      selector ? selector(storeState) : storeState,
    {
      getState: () => storeState,
    }
  ),
  useShallow: (selector: (state: typeof storeState) => unknown) => {
    const result = selector(storeState);
    return () => result;
  },
}));

vi.mock('./MessageList', () => ({
  MessageList: () => <div data-testid="message-list" />,
}));

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });
    storeState.messages = [];
    storeState.currentAgent = null;
    storeState.awaitingConfirm = false;
    storeState.awaitingAgent = null;
    storeState.currentStage = 'plan';
    storeState.currentRunId = null;
    storeState.runMode = 'manual';
  });

  it('shows the start button when there are no messages and generation has not started', () => {
    render(
      <ChatPanel
        onSendFeedback={onSendFeedback}
        onConfirm={onConfirm}
        onGenerate={onGenerate}
        onCancel={onCancel}
        isGenerating={false}
      />
    );

    expect(screen.getByRole('button', { name: '开始生成漫剧' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '开始生成漫剧' })).toHaveTextContent('开始生成');
  });

  it('disables generate and exposes the reason through aria-describedby', () => {
    render(
      <ChatPanel
        onSendFeedback={onSendFeedback}
        onConfirm={onConfirm}
        onGenerate={onGenerate}
        onCancel={onCancel}
        isGenerating={false}
        generateDisabled
        generateDisabledReason="还缺少角色设定"
      />
    );

    const button = screen.getByRole('button', { name: '开始生成漫剧' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-describedby', 'generate-disabled-reason');
    expect(screen.getByText('还缺少角色设定')).toHaveAttribute('id', 'generate-disabled-reason');
  });

  it('shows processing state and stop button while generating', () => {
    storeState.currentAgent = 'plan';

    render(
      <ChatPanel
        onSendFeedback={onSendFeedback}
        onConfirm={onConfirm}
        onGenerate={onGenerate}
        onCancel={onCancel}
        isGenerating
      />
    );

    expect(screen.getByText('规划...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '停止生成' })).toBeInTheDocument();
  });

  it('shows awaiting confirm area and sends trimmed feedback to confirm', async () => {
    const user = userEvent.setup();
    storeState.awaitingConfirm = true;
    storeState.awaitingAgent = 'plan';
    storeState.messages = [
      {
        id: '1',
        agent: 'plan',
        role: 'assistant',
        content: '完整内容',
        summary: '规划摘要',
      },
    ] as never[];

    render(
      <ChatPanel
        onSendFeedback={onSendFeedback}
        onConfirm={onConfirm}
        onGenerate={onGenerate}
        onCancel={onCancel}
        isGenerating
      />
    );

    expect(screen.getByText(/规划 已完成/)).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), '  修改剧情节奏  ');
    await user.click(screen.getByRole('button', { name: /通过/ }));

    expect(onConfirm).toHaveBeenLastCalledWith('修改剧情节奏');
  });

  it('toggles between review and quick mode', async () => {
    const user = userEvent.setup();
    storeState.runMode = 'manual';

    render(
      <ChatPanel
        onSendFeedback={onSendFeedback}
        onConfirm={onConfirm}
        onGenerate={onGenerate}
        onCancel={onCancel}
        isGenerating={false}
      />
    );

    const toggleButton = screen.getByRole('button', { name: '切换快速生成模式' });
    await user.click(toggleButton);
    expect(setRunMode).toHaveBeenCalledWith('yolo');
  });

  it('confirms the current gate when switching to quick mode while awaiting confirmation', async () => {
    const user = userEvent.setup();
    storeState.awaitingConfirm = true;
    storeState.awaitingAgent = 'plan';
    storeState.runMode = 'manual';
    storeState.messages = [
      {
        id: '1',
        agent: 'plan',
        role: 'assistant',
        content: '规划完成',
      },
    ] as never[];

    render(
      <ChatPanel
        onSendFeedback={onSendFeedback}
        onConfirm={onConfirm}
        onGenerate={onGenerate}
        onCancel={onCancel}
        isGenerating
      />
    );

    await user.click(screen.getByRole('button', { name: '切换快速生成模式' }));

    expect(setRunMode).toHaveBeenCalledWith('yolo');
    expect(onConfirm).toHaveBeenLastCalledWith(undefined);
  });

  it('hides manual confirm bar in YOLO mode', () => {
    storeState.awaitingConfirm = true;
    storeState.awaitingAgent = 'plan';
    storeState.runMode = 'yolo';

    render(
      <ChatPanel
        onSendFeedback={onSendFeedback}
        onConfirm={onConfirm}
        onGenerate={onGenerate}
        onCancel={onCancel}
        isGenerating
      />
    );

    expect(screen.queryByText(/已完成/)).not.toBeInTheDocument();
  });

  it('sends feedback through onSendFeedback outside generating and confirm states', async () => {
    const user = userEvent.setup();

    render(
      <ChatPanel
        onSendFeedback={onSendFeedback}
        onConfirm={onConfirm}
        onGenerate={onGenerate}
        onCancel={onCancel}
        isGenerating={false}
      />
    );

    await user.type(screen.getByRole('textbox'), '  这里有建议  ');
    await user.click(screen.getByRole('button', { name: '发送' }));

    expect(onSendFeedback).toHaveBeenLastCalledWith('  这里有建议  ');
  });

  it('shows render stage icon when currentStage is render', () => {
    storeState.currentStage = 'render';

    render(
      <ChatPanel
        onSendFeedback={onSendFeedback}
        onConfirm={onConfirm}
        onGenerate={onGenerate}
        onCancel={onCancel}
        isGenerating={false}
      />
    );

    expect(screen.getByText('渲染阶段')).toBeInTheDocument();
  });

  it('shows render_approval stage icon when currentStage is render_approval', () => {
    storeState.currentStage = 'render_approval';

    render(
      <ChatPanel
        onSendFeedback={onSendFeedback}
        onConfirm={onConfirm}
        onGenerate={onGenerate}
        onCancel={onCancel}
        isGenerating={false}
      />
    );

    expect(screen.getByText('渲染阶段')).toBeInTheDocument();
  });

  it('shows merge stage icon when currentStage is merge', () => {
    storeState.currentStage = 'compose';

    render(
      <ChatPanel
        onSendFeedback={onSendFeedback}
        onConfirm={onConfirm}
        onGenerate={onGenerate}
        onCancel={onCancel}
        isGenerating={false}
      />
    );

    expect(screen.getByText('合成阶段')).toBeInTheDocument();
  });

  it('shows clip stage icon when currentStage is clip', () => {
    storeState.currentStage = 'compose';

    render(
      <ChatPanel
        onSendFeedback={onSendFeedback}
        onConfirm={onConfirm}
        onGenerate={onGenerate}
        onCancel={onCancel}
        isGenerating={false}
      />
    );

    expect(screen.getByText('合成阶段')).toBeInTheDocument();
  });
});
