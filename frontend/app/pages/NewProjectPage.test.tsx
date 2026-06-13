import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NewProjectPage } from './NewProjectPage';
import { projectsApi } from '~/services/api';

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('~/services/api', () => ({
  projectsApi: {
    create: vi.fn(),
  },
  styleTemplatesApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  universesApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    addProject: vi.fn(),
    removeProject: vi.fn(),
    listSharedCharacters: vi.fn().mockResolvedValue([]),
    promoteCharacter: vi.fn(),
    importCharacter: vi.fn(),
    syncCharacter: vi.fn(),
  },
}));

vi.mock('~/utils/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('NewProjectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits the current bootstrap payload and navigates on success', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    vi.mocked(projectsApi.create).mockResolvedValue({ id: 7 } as never);

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NewProjectPage />
        </QueryClientProvider>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('项目标题'), 'Bootstrap Story');
    await user.type(screen.getByPlaceholderText('很久很久以前...'), 'A creator starts a new comic-drama.');
    await user.click(screen.getByRole('button', { name: '下一步 →' }));
    const imageFieldset = screen.getByText('图像').closest('fieldset');
    expect(imageFieldset).not.toBeNull();
    await user.click(within(imageFieldset as HTMLElement).getByRole('radio', { name: 'OpenAI' }));
    await user.click(screen.getByRole('button', { name: '下一步 →' }));
    await user.click(screen.getByRole('button', { name: '创建项目' }));

    const firstCall = vi.mocked(projectsApi.create).mock.calls.at(0);
    expect(firstCall?.[0]).toEqual({
      title: 'Bootstrap Story',
      story: 'A creator starts a new comic-drama.',
      style: 'cinematic',
      text_provider_override: null,
      image_provider_override: 'openai',
      video_provider_override: null,
      universe_id: null,
      target_shot_count: 6,
      creation_mode: 'review',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['projects'] });
    expect(mockNavigate).toHaveBeenCalledWith('/project/7?autoStart=true');
  });

  it('submits quick mode, shot count, character hints, and fake providers', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    vi.mocked(projectsApi.create).mockResolvedValue({ id: 8 } as never);

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NewProjectPage />
        </QueryClientProvider>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('项目标题'), 'Paper Fit Story');
    await user.type(screen.getByPlaceholderText('很久很久以前...'), 'The workflow turns an idea into a comic video.');
    await user.click(screen.getByRole('button', { name: '快速生成' }));
    fireEvent.change(screen.getByRole('slider', { name: /目标镜头数/ }), {
      target: { value: '8' },
    });
    await user.type(screen.getByPlaceholderText('角色 1'), '导演小陈');
    await user.click(screen.getByRole('button', { name: '添加角色' }));
    await user.type(screen.getByPlaceholderText('角色 2'), 'AI 助手 Oii');
    await user.click(screen.getByRole('button', { name: '下一步 →' }));

    for (const provider of ['文本', '图像', '视频']) {
      const fieldset = screen.getByText(provider).closest('fieldset');
      expect(fieldset).not.toBeNull();
      await user.click(
        within(fieldset as HTMLElement).getByRole('radio', {
          name: 'Fake（本地测试）',
        }),
      );
    }

    await user.click(screen.getByRole('button', { name: '下一步 →' }));

    expect(screen.getByText('快速生成')).toBeInTheDocument();
    expect(screen.getByText('8 镜头')).toBeInTheDocument();
    expect(screen.getByText('导演小陈')).toBeInTheDocument();
    expect(screen.getByText('AI 助手 Oii')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '创建项目' }));

    expect(vi.mocked(projectsApi.create).mock.calls.at(0)?.[0]).toMatchObject({
      title: 'Paper Fit Story',
      story: 'The workflow turns an idea into a comic video.',
      text_provider_override: 'fake',
      image_provider_override: 'fake',
      video_provider_override: 'fake',
      target_shot_count: 8,
      creation_mode: 'quick',
      character_hints: ['导演小陈', 'AI 助手 Oii'],
    });
    expect(mockNavigate).toHaveBeenCalledWith('/project/8?autoStart=true');
  });

  it('shows an error toast when project creation fails and keeps the form on the current step', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    vi.spyOn(queryClient, 'invalidateQueries');

    vi.mocked(projectsApi.create).mockRejectedValue(new Error('network down'));

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <NewProjectPage />
        </QueryClientProvider>
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: '下一步 →' }));
    expect(screen.getByText('讲述你的故事')).toBeInTheDocument();

    await user.type(screen.getByLabelText('项目标题'), 'Broken Story');
    await user.click(screen.getByRole('button', { name: '下一步 →' }));
    await user.click(screen.getByRole('button', { name: '下一步 →' }));
    await user.click(screen.getByRole('button', { name: '创建项目' }));

    expect(screen.getByText('创建项目失败，请重试。')).toBeInTheDocument();
  });
});
