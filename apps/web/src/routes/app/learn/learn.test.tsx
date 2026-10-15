import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PathLesson } from '@linguo/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../tests/unit/render';
import { pathLesson } from '../lesson/lesson-fixtures';
import { groupPathLessons } from './grouping';
import { LearnPage } from './LearnPage';
import { UNIT_OPEN_KEY } from './unit-open';

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
    const links = screen.getAllByRole('list').flatMap((ul) => within(ul).getAllByRole('link')).filter((a) => a.getAttribute('href')?.startsWith('/app/hoc-tap/bai/'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      [greet, names, numbers, grammar].map((l) => `/app/hoc-tap/bai/${l.lesson_id}`),
    );
    // One term for finished lessons, matching "N/M bài đã học".
    expect(within(links[0] as HTMLElement).getByText('Đã học')).toBeInTheDocument();
    expect(screen.queryByText('Đã xong')).toBeNull();
    expect(within(links[1] as HTMLElement).getByText('Đang học')).toBeInTheDocument();
    expect(within(links[1] as HTMLElement).getByText('12 phút')).toBeInTheDocument();
    expect(within(links[2] as HTMLElement).getByText('Chưa học')).toBeInTheDocument();
  });

  it('recommends the in-progress lesson with a top link and a row badge', () => {
    renderWithProviders(<LearnPage />, { route: '/app/hoc-tap' });
    expect(screen.getByRole('link', { name: /Học tiếp: Tên của bạn/ })).toHaveAttribute('href', `/app/hoc-tap/bai/${names.lesson_id}`);
    expect(screen.getAllByText('Học tiếp')).toHaveLength(1);
    expect(screen.queryByText('Bài tiếp theo')).toBeNull();
  });

  it('recommends the first startable lesson when nothing is in progress', () => {
    setHook({ lessons: [greet, { ...names, run_status: 'not_started' }, numbers] });
    renderWithProviders(<LearnPage />, { route: '/app/hoc-tap' });
    // Not started yet: the top link says "Bắt đầu", agreeing with the row's "Bài tiếp theo" badge.
    expect(screen.getByRole('link', { name: /Bắt đầu: Tên của bạn/ })).toHaveAttribute('href', `/app/hoc-tap/bai/${names.lesson_id}`);
    expect(screen.queryByRole('link', { name: /Học tiếp:/ })).toBeNull();
    expect(screen.getByText('Bài tiếp theo')).toBeInTheDocument();
  });

  it('shows the language and current → target level of the path', () => {
    renderWithProviders(<LearnPage />, { route: '/app/hoc-tap' });
    const header = screen.getByText('Tiếng Anh').closest('p') as HTMLElement;
    expect(header).toHaveTextContent('A2 → B1');
    expect(within(header).getByText('trình độ hiện tại A2, mục tiêu B1')).toHaveClass('sr-only');
  });

  it('opens only the unit holding the recommended lesson and remembers toggles for the tab', async () => {
    window.sessionStorage.clear();
    const view = renderWithProviders(<LearnPage />, { route: '/app/hoc-tap' });
    const details = () => [...view.container.querySelectorAll('details')];
    // Làm quen holds "Tên của bạn" (in progress); Con số and Câu đơn start collapsed.
    expect(details().map((d) => d.open)).toEqual([true, false, false]);
    // Lesson links stay in the DOM (and in `ul a[href]`) even when their unit is collapsed.
    expect(view.container.querySelector(`ul a[href$="/app/hoc-tap/bai/${grammar.lesson_id}"]`)).not.toBeNull();

    await userEvent.click(screen.getByRole('heading', { level: 3, name: 'Câu đơn' }));
    await waitFor(() => expect(details()[2]?.open).toBe(true));
    await userEvent.click(screen.getByRole('heading', { level: 3, name: 'Làm quen' }));
    await waitFor(() => expect(details()[0]?.open).toBe(false));
    expect(JSON.parse(window.sessionStorage.getItem(UNIT_OPEN_KEY) ?? '{}')).toEqual({ [U3]: true, [U1]: false });

    view.unmount();
    const again = renderWithProviders(<LearnPage />, { route: '/app/hoc-tap' });
    expect([...again.container.querySelectorAll('details')].map((d) => d.open)).toEqual([false, false, true]);
    window.sessionStorage.clear();
  });

  it('marks prerequisites with a route hint, not a lock', () => {
    renderWithProviders(<LearnPage />, { route: '/app/hoc-tap' });
    const hint = screen.getByText('Nên học trước: Tên của bạn');
    expect(hint.querySelector('svg')?.getAttribute('class')).toContain('lucide-route');
    expect(document.querySelector('.lucide-lock')).toBeNull();
  });

  it('shows a kind note when everything is completed', () => {
    setHook({ lessons: [greet, { ...names, run_status: 'completed' }] });
    renderWithProviders(<LearnPage />, { route: '/app/hoc-tap' });
    expect(screen.getByText(/Bạn đã hoàn thành các bài hiện có/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Học tiếp:/ })).toBeNull();
  });

  it('shows accessible per-program and per-unit progress', () => {
    renderWithProviders(<LearnPage />, { route: '/app/hoc-tap' });
    const bars = screen.getAllByRole('progressbar');
    expect(bars).toHaveLength(5);
    expect(bars[0]).toHaveAttribute('aria-valuenow', '1');
    expect(bars[0]).toHaveAttribute('aria-valuemax', '3');
    expect(bars[0]).toHaveAccessibleName('Tiến độ Tiếng Anh A1');
    expect(screen.getAllByText('1/3 bài đã học')).toHaveLength(1);
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
