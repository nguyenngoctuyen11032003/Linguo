import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiagnosticStatus } from '@linguo/shared';
import { ATTEMPT_ID, status } from '@/features/diagnostic/diagnostic-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { DiagnosticCard } from './DiagnosticCard';

type Hook = { status: 'loading' | 'ready' | 'error'; data: DiagnosticStatus | null; error: string | null; reload: () => void };
const mocks = vi.hoisted(() => ({ value: null as unknown as Hook, pathIds: [] as Array<string | undefined> }));

vi.mock('@/features/diagnostic/useDiagnosticStatus', () => ({
  useDiagnosticStatus: (pathId?: string) => {
    mocks.pathIds.push(pathId);
    return mocks.value;
  },
}));

const NONE: DiagnosticStatus = status();
const ATTEMPT = ATTEMPT_ID;

function setHook(state: Hook['status'], data: Partial<DiagnosticStatus> | null) {
  mocks.value = { status: state, data: data && { ...NONE, ...data }, error: state === 'error' ? 'Lỗi' : null, reload: vi.fn() };
}

const render = () => renderWithProviders(<DiagnosticCard pathId="path-en" />, { route: '/app' });

describe('DiagnosticCard', () => {
  it('offers the placement test when none was completed', () => {
    setHook('ready', {});
    render();
    expect(mocks.pathIds.at(-1)).toBe('path-en');
    expect(screen.getByRole('heading', { level: 2, name: 'Kiểm tra trình độ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Làm bài kiểm tra' })).toHaveAttribute('href', '/app/kiem-tra/path-en');
  });

  it('keeps the pitch short and the button an outline, not a second primary', () => {
    setHook('ready', {});
    render();
    expect(screen.getByText(/Khoảng 12 phút/).textContent!.length).toBeLessThan(90);
    expect(screen.getByRole('link', { name: 'Làm bài kiểm tra' })).toHaveClass('border');
    expect(screen.getByRole('link', { name: 'Làm bài kiểm tra' })).not.toHaveClass('bg-primary');
  });

  it('stacks the button under the text on phones so the copy keeps the full width', () => {
    setHook('ready', {});
    const { container } = render();
    expect(container.querySelector('section')).toHaveClass('flex-col', 'sm:flex-row');
    expect(screen.getByRole('link', { name: 'Làm bài kiểm tra' })).toHaveClass('w-full', 'sm:w-auto');
  });

  it('offers it again after an abandoned attempt', () => {
    setHook('ready', { attempt_id: ATTEMPT, status: 'abandoned' });
    render();
    expect(screen.getByRole('heading', { level: 2, name: 'Kiểm tra trình độ' })).toBeInTheDocument();
  });

  it('resumes a test in progress', () => {
    setHook('ready', { attempt_id: ATTEMPT, status: 'in_progress' });
    render();
    expect(screen.getByRole('heading', { level: 2, name: 'Tiếp tục bài kiểm tra' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Làm tiếp' })).toHaveAttribute('href', '/app/kiem-tra/path-en');
  });

  it('is hidden once a test was completed, during the cooldown, while loading and on errors', () => {
    const cases: Array<[Hook['status'], Partial<DiagnosticStatus> | null]> = [
      ['ready', { attempt_id: ATTEMPT, status: 'completed', completed_at: '2026-10-10T00:00:00Z', retake_after: '2026-10-24T00:00:00Z', can_start: false }],
      ['ready', { attempt_id: ATTEMPT, status: 'completed', completed_at: '2026-09-01T00:00:00Z', retake_after: '2026-09-15T00:00:00Z', can_start: true }],
      ['ready', { can_start: false }],
      ['loading', null],
      ['error', null],
    ];
    for (const [status, data] of cases) {
      setHook(status, data);
      const { container, unmount } = render();
      expect(container.querySelector('section')).toBeNull();
      unmount();
    }
  });
});
