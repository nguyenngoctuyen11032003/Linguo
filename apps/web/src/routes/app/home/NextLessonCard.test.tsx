import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PathLesson } from '@linguo/shared';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../tests/unit/render';
import { pathLesson } from '../lesson/lesson-fixtures';
import { pickNextLesson } from '../learn/grouping';
import { NextLessonCard } from './NextLessonCard';

type Hook = { status: 'loading' | 'ready' | 'error'; lessons: PathLesson[]; error: string | null; reload: () => void };
const mocks = vi.hoisted(() => ({ value: null as unknown as Hook }));

vi.mock('@/features/lesson-player/usePathLessons', () => ({ usePathLessons: () => mocks.value }));

function setHook(value: Partial<Hook>) {
  mocks.value = { status: 'ready', lessons: [], error: null, reload: vi.fn(), ...value };
}

const done = pathLesson({ title: { vi: 'Đã học' }, unit_order: 1, lesson_order: 1, run_status: 'completed' });
const blocked = pathLesson({ title: { vi: 'Chưa đủ tiên quyết' }, unit_order: 1, lesson_order: 2, prerequisites_met: false });
const open = pathLesson({ title: { vi: 'Bài mở' }, unit_order: 1, lesson_order: 3, estimated_minutes: 10 });
const later = pathLesson({ title: { vi: 'Bài sau' }, unit_order: 2, lesson_order: 1, run_status: 'in_progress' });

describe('pickNextLesson', () => {
  it('prefers the first lesson in progress', () => {
    expect(pickNextLesson([done, blocked, open, later])).toBe(later);
  });

  it('otherwise takes the first not-started lesson whose prerequisites are met', () => {
    expect(pickNextLesson([{ ...later, run_status: 'completed' }, open, blocked, done])).toBe(open);
  });

  it('follows unit and lesson order, not the input order', () => {
    const first = pathLesson({ unit_order: 1, lesson_order: 1 });
    const second = pathLesson({ unit_order: 1, lesson_order: 2 });
    expect(pickNextLesson([second, first])).toBe(first);
  });

  it('returns null when nothing is available', () => {
    expect(pickNextLesson([done, blocked])).toBeNull();
    expect(pickNextLesson([])).toBeNull();
  });
});

describe('NextLessonCard', () => {
  it('continues a lesson in progress', () => {
    setHook({ lessons: [done, open, later] });
    renderWithProviders(<NextLessonCard />, { route: '/app' });
    expect(screen.getByText('Bài tiếp theo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bài sau' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tiếp tục' })).toHaveAttribute('href', `/app/hoc-tap/bai/${later.lesson_id}`);
  });

  it('starts the next open lesson', () => {
    setHook({ lessons: [done, blocked, open] });
    renderWithProviders(<NextLessonCard />, { route: '/app' });
    expect(screen.getByRole('heading', { name: 'Bài mở' })).toBeInTheDocument();
    expect(screen.getByText('Khoảng 10 phút')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bắt đầu' })).toHaveAttribute('href', `/app/hoc-tap/bai/${open.lesson_id}`);
  });

  it('renders nothing while loading or when there is no next lesson', () => {
    setHook({ status: 'loading' });
    const { container, unmount } = renderWithProviders(<NextLessonCard />, { route: '/app' });
    expect(container.querySelector('section')).toBeNull();
    unmount();
    setHook({ lessons: [done] });
    const again = renderWithProviders(<NextLessonCard />, { route: '/app' });
    expect(again.container.querySelector('section')).toBeNull();
  });

  it('fails quietly with a small retry link', async () => {
    const reload = vi.fn();
    setHook({ status: 'error', error: 'Lỗi', reload });
    renderWithProviders(<NextLessonCard />, { route: '/app' });
    expect(screen.queryByText('Bài tiếp theo')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tải lại bài tiếp theo' }));
    expect(reload).toHaveBeenCalled();
  });
});
