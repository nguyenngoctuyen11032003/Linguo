import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiagnosticStatus } from '@linguo/shared';
import { renderWithProviders } from '../../../../tests/unit/render';
import { DiagnosticCard } from './DiagnosticCard';

type Hook = { status: 'loading' | 'ready' | 'error'; data: DiagnosticStatus | null; reload: () => void };
const mocks = vi.hoisted(() => ({ value: null as unknown as Hook, pathIds: [] as Array<string | undefined> }));

vi.mock('@/features/diagnostic/useDiagnosticStatus', () => ({
  useDiagnosticStatus: (pathId?: string) => {
    mocks.pathIds.push(pathId);
    return mocks.value;
  },
}));

const NONE: DiagnosticStatus = { attempt_id: null, status: 'none', completed_at: null, applied_at: null, retake_after: null, can_start: true };
const ATTEMPT = '22222222-2222-4222-8222-222222222222';

function setHook(status: Hook['status'], data: Partial<DiagnosticStatus> | null) {
  mocks.value = { status, data: data && { ...NONE, ...data }, reload: vi.fn() };
}

const render = () => renderWithProviders(<DiagnosticCard pathId="path-en" />, { route: '/app' });

describe('DiagnosticCard', () => {
  it('offers the placement test when none was completed', () => {
    setHook('ready', {});
    render();
    expect(mocks.pathIds.at(-1)).toBe('path-en');
    expect(screen.getByRole('heading', { level: 2, name: 'Kiểm tra trình độ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bắt đầu kiểm tra' })).toHaveAttribute('href', '/app/kiem-tra/path-en');
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
