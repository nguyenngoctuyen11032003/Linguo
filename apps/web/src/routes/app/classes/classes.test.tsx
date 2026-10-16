import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LearnerAssignment, LearnerClass } from '@linguo/shared';
import { CLASS_ID, CLASS_ID_2, LESSON_ID, fakeClassesClient, learnerAssignment, learnerClass } from '@/features/classes/class-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { ClassesHomeCard } from '@/features/classes/ClassesHomeCard';
import { ClassesPage } from './ClassesPage';
import { JoinClassPage } from './JoinClassPage';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

let classes: LearnerClass[];
let assignments: LearnerAssignment[];
let failList: unknown;
let client: ReturnType<typeof fakeClassesClient>;

const NEW_CLASS = learnerClass({ id: CLASS_ID_2, name: 'IELTS tối thứ Ba', language_code: 'en', teacher_name: 'Thầy Minh', assignment_count: 0, pending_count: 0 });

function backend() {
  client = fakeClassesClient((name, args) => {
    switch (name) {
      case 'learner_list_classes':
        return failList ? { error: failList } : { data: classes };
      case 'learner_list_assignments':
        return failList ? { error: failList } : { data: assignments };
      case 'learner_join_class': {
        const code = String(args.p_code);
        if (code === 'RATEMMMM') return { error: { message: 'rate_limited', code: 'P0001' } };
        if (code === 'ABCDEFGH') {
          const already = classes.some((c) => c.id === NEW_CLASS.id);
          if (!already) classes = [...classes, NEW_CLASS];
          return { data: { status: already ? 'already_member' : 'joined', class: NEW_CLASS } };
        }
        return { data: { status: 'invalid_code' } };
      }
      case 'learner_leave_class':
        classes = classes.filter((c) => c.id !== args.p_class_id);
        assignments = assignments.filter((a) => a.class_id !== args.p_class_id);
        return { data: { left: true } };
    }
    return { error: { message: `unexpected ${name}` } };
  });
  mocks.client = client;
}

beforeEach(() => {
  localStorage.setItem('linguo-reduce-motion', 'true');
  classes = [];
  assignments = [];
  failList = null;
  backend();
});
afterEach(() => {
  mocks.client = null;
  vi.restoreAllMocks();
});

function renderAt(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/app/lop-hoc" element={<ClassesPage />} />
      <Route path="/app/lop-hoc/tham-gia" element={<JoinClassPage />} />
    </Routes>,
    { route },
  );
}

describe('ClassesPage', () => {
  it('shows an empty state, the privacy explanation, and joins with a typed code', async () => {
    const user = userEvent.setup();
    renderAt('/app/lop-hoc');
    expect(await screen.findByRole('heading', { name: 'Bạn chưa ở lớp nào' })).toBeInTheDocument();
    const privacy = screen.getByRole('region', { name: 'Giáo viên thấy gì về bạn?' });
    expect(within(privacy).getByText('Câu trả lời của bạn trong bài học, bài ôn hay bài luyện thi')).toBeInTheDocument();
    expect(within(privacy).getByText(/Email/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Mã lớp'), 'abcd-efgh');
    await user.click(screen.getByRole('button', { name: 'Tham gia lớp' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'IELTS tối thứ Ba' })).toBeInTheDocument();
    expect(client.calls.find(([n]) => n === 'learner_join_class')?.[1]).toEqual({ p_code: 'ABCDEFGH' });
    expect(screen.getByText(/Giáo viên: Thầy Minh/)).toBeInTheDocument();
    expect(await screen.findByText('Đã vào lớp IELTS tối thứ Ba. Chào mừng bạn!')).toBeInTheDocument();
    expect(screen.getByLabelText('Mã lớp')).toHaveValue('');
  });

  it('checks the code shape locally and explains server answers under the field', async () => {
    const user = userEvent.setup();
    renderAt('/app/lop-hoc');
    const input = await screen.findByLabelText('Mã lớp');
    await user.click(screen.getByRole('button', { name: 'Tham gia lớp' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Hãy nhập mã lớp');
    await user.type(input, 'ABC0');
    await user.click(screen.getByRole('button', { name: 'Tham gia lớp' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Mã lớp gồm 8 chữ cái và chữ số');
    expect(client.calls.some(([n]) => n === 'learner_join_class')).toBe(false);

    await user.clear(input);
    await user.type(input, 'ZZZZZZZZ');
    await user.click(screen.getByRole('button', { name: 'Tham gia lớp' }));
    expect(await screen.findByText(/Mã này không đúng, đã hết hạn/)).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await user.clear(input);
    await user.type(input, 'RATEMMMM');
    await user.click(screen.getByRole('button', { name: 'Tham gia lớp' }));
    expect(await screen.findByText(/Bạn đã thử nhập mã nhiều lần/)).toBeInTheDocument();
    expect(input).toHaveValue('RATEMMMM');
  }, 20_000);

  it('lists classes with their assignments, due dates, states and links', async () => {
    classes = [learnerClass()];
    assignments = [
      learnerAssignment({ note: 'Nhớ luyện phát âm nhé' }),
      learnerAssignment({ kind: 'review', ref_id: null, title: null, target_count: 20, progress_count: 5, state: 'overdue', due_at: '2026-10-12T13:00:00Z' }),
      learnerAssignment({ kind: 'exam', title: 'TOPIK I mini', due_at: null, state: 'done', completed_at: '2026-10-12T00:00:00Z', progress_count: 1 }),
    ];
    renderAt('/app/lop-hoc');
    const card = await screen.findByRole('region', { name: 'Tiếng Hàn sơ cấp 1' });
    expect(within(card).getByText(/Tiếng Hàn · Giáo viên: Cô Lan · Vào lớp 10\/10\/2026/)).toBeInTheDocument();
    expect(within(card).getByRole('heading', { level: 3, name: 'Bài được giao · còn 2 bài' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Làm bài: Chào hỏi cơ bản' })).toHaveAttribute('href', `/app/hoc-tap/bai/${LESSON_ID}`);
    expect(within(card).getByRole('link', { name: 'Ôn ngay: Ôn 20 thẻ' })).toHaveAttribute('href', '/app/on-tap');
    expect(within(card).getByRole('link', { name: 'Làm lại đề: TOPIK I mini' })).toHaveAttribute('href', `/app/luyen-thi?de=${LESSON_ID}`);
    expect(within(card).getByText('Quá hạn · Đã ôn 5/20')).toBeInTheDocument();
    expect(within(card).getByText('Đã xong')).toBeInTheDocument();
    expect(within(card).getByText('Không có hạn')).toBeInTheDocument();
    expect(within(card).getAllByText(/^Hạn: /)).toHaveLength(2);
    expect(within(card).getByText('Nhớ luyện phát âm nhé')).toBeInTheDocument();
    // The test learner studies English: a Korean class gets a hint about which path counts.
    expect(within(card).getByText(/Lớp này học tiếng Hàn, khác lộ trình bạn đang mở/)).toBeInTheDocument();
  });

  it('shows the teacher placeholder and the no-assignment text', async () => {
    classes = [learnerClass({ teacher_name: null, assignment_count: 0, pending_count: 0 })];
    renderAt('/app/lop-hoc');
    const card = await screen.findByRole('region', { name: 'Tiếng Hàn sơ cấp 1' });
    expect(within(card).getByText(/Giáo viên: chưa đặt tên/)).toBeInTheDocument();
    expect(within(card).getByText(/Giáo viên chưa giao bài nào/)).toBeInTheDocument();
    expect(within(card).queryByText(/khác lộ trình/)).not.toBeInTheDocument();
  });

  it('leaves a class after confirming, and keeps it when the learner changes their mind', async () => {
    const user = userEvent.setup();
    classes = [learnerClass()];
    assignments = [learnerAssignment()];
    renderAt('/app/lop-hoc');
    await user.click(await screen.findByRole('button', { name: 'Rời lớp Tiếng Hàn sơ cấp 1' }));
    let dialog = await screen.findByRole('dialog', { name: 'Rời lớp Tiếng Hàn sơ cấp 1?' });
    expect(dialog).toHaveTextContent('Giáo viên sẽ không còn thấy tiến độ của bạn');
    await user.click(within(dialog).getByRole('button', { name: 'Ở lại lớp' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.calls.some(([n]) => n === 'learner_leave_class')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Rời lớp Tiếng Hàn sơ cấp 1' }));
    dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Rời lớp' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.calls.find(([n]) => n === 'learner_leave_class')?.[1]).toEqual({ p_class_id: CLASS_ID });
    expect(await screen.findByRole('heading', { name: 'Bạn chưa ở lớp nào' })).toBeInTheDocument();
    expect(screen.getByText(/Đã rời lớp Tiếng Hàn sơ cấp 1/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Lớp học' })).toHaveFocus());
  });

  it('explains a failed load offline-friendly and retries when the network is back', async () => {
    failList = { message: 'TypeError: Failed to fetch', code: '' };
    renderAt('/app/lop-hoc');
    expect(await screen.findByText('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại nhé.')).toBeInTheDocument();

    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(await screen.findByText(/Bạn đang ngoại tuyến. Danh sách lớp có thể chưa mới nhất/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tham gia lớp' })).toBeDisabled();

    failList = null;
    classes = [learnerClass()];
    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByRole('region', { name: 'Tiếng Hàn sơ cấp 1' })).toBeInTheDocument();
  });
});

describe('JoinClassPage (invite link)', () => {
  it('prefills the code but joins only after the learner confirms, then opens the classes page', async () => {
    const user = userEvent.setup();
    renderAt('/app/lop-hoc/tham-gia?ma=abcdefgh');
    expect(screen.getByRole('heading', { level: 1, name: 'Tham gia lớp học' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Giáo viên thấy gì về bạn?' })).toBeInTheDocument();
    expect(screen.getByLabelText('Mã lớp')).toHaveValue('ABCD-EFGH');
    expect(screen.getByRole('link', { name: 'Để sau' })).toHaveAttribute('href', '/app/lop-hoc');
    await waitFor(() => expect(client.calls.map(([n]) => n)).toContain('learner_list_classes'));
    expect(client.calls.some(([n]) => n === 'learner_join_class')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Tham gia lớp' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/app/lop-hoc'));
    expect(screen.getByTestId('location').textContent).toBe('/app/lop-hoc');
    expect(await screen.findByText('Đã vào lớp IELTS tối thứ Ba. Chào mừng bạn!')).toBeInTheDocument();
  });

  it('says so when the learner is already in the class', async () => {
    const user = userEvent.setup();
    classes = [NEW_CLASS];
    renderAt('/app/lop-hoc/tham-gia?ma=ABCD-EFGH');
    await user.click(screen.getByRole('button', { name: 'Tham gia lớp' }));
    expect(await screen.findByText('Bạn đã ở trong lớp IELTS tối thứ Ba rồi.')).toBeInTheDocument();
  });

  it('asks for a code when the link has none', () => {
    renderAt('/app/lop-hoc/tham-gia');
    expect(screen.getByText('Nhập mã lớp mà giáo viên gửi cho bạn.')).toBeInTheDocument();
    expect(screen.getByLabelText('Mã lớp')).toHaveValue('');
  });
});

describe('ClassesHomeCard', () => {
  it('links to the classes page without loading anything', () => {
    renderWithProviders(<ClassesHomeCard />, { route: '/app' });
    expect(screen.getByRole('heading', { level: 2, name: 'Lớp học' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở lớp học' })).toHaveAttribute('href', '/app/lop-hoc');
    expect(client.calls).toHaveLength(0);
  });
});
