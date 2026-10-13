import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PathLesson } from '@linguo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../tests/unit/render';
import { pathLesson } from '../lesson/lesson-fixtures';
import { groupPathLessons } from './grouping';
import { LearnPage } from './LearnPage';

type Hook = { status: 'loading' | 'ready' | 'error'; lessons: PathLesson[]; error: string | null; reload: () => void };
const mocks = vi.hoisted(() => ({ value: null as unknown as Hook }));

vi.mock('@/features/lesson-player/usePathLessons', () => ({ usePathLessons: () => mocks.value }));
vi.mock('@/components/exercise', () => ({ DemoBadge: () => <span>Nội dung demo — chưa kiểm duyệt</span> }));

const P1 = '10000000-0000-4000-8000-000000000001';
const P2 = '10000000-0000-4000-8000-000000000002';
const U1 = '20000000-0000-4000-8000-000000000001';
const U2 = '20000000-0000-4000-8000-000000000002';
const U3 = '20000000-0000-4000-8000-000000000003';

const greet = pathLesson({ title: { vi: 'Chào hỏi' }, unit_id: U1, unit_order: 1, lesson_order: 1, run_status: 'completed', is_demo: true });
const names = pathLesson({ title: { vi: 'Tên của bạn' }, unit_id: U1, unit_order: 1, lesson_order: 2, run_status: 'in_progress', estimated_minutes: 12 });
const numbers = pathLesson({
  title: { vi: 'Số đếm' },
  unit_id: U2,
  unit_title: { vi: 'Con số' },
  unit_order: 2,
  lesson_order: 1,
  prerequisite_ids: [names.lesson_id],
  prerequisites_met: false,
});
const grammar = pathLesson({
  title: { vi: 'Động từ to be' },
  program_id: P2,
  program_title: { vi: 'Ngữ pháp nền tảng' },
  unit_id: U3,
  unit_title: { vi: 'Câu đơn' },
  unit_order: 1,
  lesson_order: 1,
});

function setHook(value: Partial<Hook>) {
  mocks.value = { status: 'ready', lessons: [], error: null, reload: vi.fn(), ...value };
}

beforeEach(() => setHook({ lessons: [numbers, grammar, names, greet] }));

describe('groupPathLessons', () => {
  it('groups by program then unit, ordered by unit and lesson order', () => {
    const groups = groupPathLessons([numbers, grammar, names, greet]);
    expect(groups.map((g) => g.id)).toEqual([P1, P2]);
    expect(groups.map((g) => g.title)).toEqual(['Tiếng Anh A1', 'Ngữ pháp nền tảng']);
    expect(groups[0]?.units.map((u) => u.title)).toEqual(['Làm quen', 'Con số']);
    expect(groups[0]?.units[0]?.lessons.map((l) => l.title.vi)).toEqual(['Chào hỏi', 'Tên của bạn']);
    expect(groups[0]?.isDemo).toBe(true);
    expect(groups[1]?.isDemo).toBe(false);
  });
});

describe('LearnPage', () => {
  it('lists programs, units and lessons with status chips', () => {
    renderWithProviders(<LearnPage />, { route: '/app/hoc-tap' });
    expect(screen.getByRole('heading', { level: 1, name: 'Học tập' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Tiếng Anh A1', 'Ngữ pháp nền tảng']);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Làm quen', 'Con số', 'Câu đơn']);
    const links = screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/app/hoc-tap/bai/'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      [greet, names, numbers, grammar].map((l) => `/app/hoc-tap/bai/${l.lesson_id}`),
    );
    expect(within(links[0] as HTMLElement).getByText('Đã xong')).toBeInTheDocument();
    expect(within(links[1] as HTMLElement).getByText('Đang học')).toBeInTheDocument();
    expect(within(links[1] as HTMLElement).getByText('12 phút')).toBeInTheDocument();
    expect(within(links[2] as HTMLElement).getByText('Chưa học')).toBeInTheDocument();
  });

  it('shows the demo badge once per program with demo lessons', () => {
    renderWithProviders(<LearnPage />, { route: '/app/hoc-tap' });
    expect(screen.getAllByText('Nội dung demo — chưa kiểm duyệt')).toHaveLength(1);
  });

  it('hints at prerequisites without locking the lesson', () => {
    renderWithProviders(<LearnPage />, { route: '/app/hoc-tap' });
    const link = screen.getByRole('link', { name: /Số đếm/ });
    expect(within(link).getByText('Nên học trước: Tên của bạn')).toBeInTheDocument();
    expect(screen.queryAllByText(/Nên học trước/)).toHaveLength(1);
  });

  it('shows an empty state when the path has no lessons', () => {
    setHook({ lessons: [] });
    renderWithProviders(<LearnPage />, { route: '/app/hoc-tap' });
    expect(screen.getByText('Chưa có bài học phù hợp với lộ trình này')).toBeInTheDocument();
  });

  it('links to onboarding without a path', () => {
    setHook({ lessons: [] });
    renderWithProviders(<LearnPage />, { route: '/app/hoc-tap', paths: { paths: [] } });
    expect(screen.getByRole('link', { name: 'Tạo lộ trình' })).toHaveAttribute('href', '/app/bat-dau');
  });

  it('shows a loading state', () => {
    setHook({ status: 'loading' });
    renderWithProviders(<LearnPage />, { route: '/app/hoc-tap' });
    expect(screen.getByText('Đang tải bài học…').closest('[role="status"]')).not.toBeNull();
  });

  it('shows an error with retry', async () => {
    const reload = vi.fn();
    setHook({ status: 'error', error: 'Không kết nối được máy chủ.', reload });
    renderWithProviders(<LearnPage />, { route: '/app/hoc-tap' });
    expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được máy chủ.');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(reload).toHaveBeenCalled();
  });
});
