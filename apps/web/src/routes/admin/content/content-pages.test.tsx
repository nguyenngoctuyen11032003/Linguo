import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EXERCISE_ID, ITEM_ID, contentListFixture, exerciseDetailFixture, itemDetailFixture } from '@/features/admin/content-fixtures';
import { renderAdmin, routeRpcs, type RpcTable } from '../admin-test-utils';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  // One stable client, like the real singleton.
  return { rpc, client: { rpc } };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

afterEach(() => {
  mocks.rpc.mockReset();
});

const listCalls = () => mocks.rpc.mock.calls.filter(([name]) => name === 'admin_list_content').map(([, args]) => args as Record<string, unknown>);

describe('ContentListPage', () => {
  it('reads the filters from the URL, lists rows and links to the detail page', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'editor' }, admin_list_content: { data: contentListFixture(3, 60) } });
    renderAdmin('/quan-tri/noi-dung?ngon-ngu=en&trang=2');
    const table = await screen.findByRole('table', { name: 'Bài học, trang 2' });
    expect(listCalls()[0]).toEqual({ p_kind: 'lesson', p_language: 'en', p_status: null, p_search: null, p_limit: 25, p_offset: 25 });
    expect(within(table).getByRole('link', { name: 'Bài 1' })).toHaveAttribute('href', '/quan-tri/noi-dung/lesson/e0000000-0000-4000-8000-100000000000');
    expect(screen.getByText('Hiển thị 26–50 trên 60 mục')).toBeInTheDocument();
    expect(screen.getByText('Trang 2 / 3')).toBeInTheDocument();
  });

  it('refetches from page 1 when a filter changes', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'editor' }, admin_list_content: { data: contentListFixture(3, 60) } });
    const user = userEvent.setup();
    renderAdmin('/quan-tri/noi-dung?trang=2');
    await screen.findByRole('table');
    await user.selectOptions(screen.getByLabelText('Loại'), 'exercise');
    await waitFor(() => expect(listCalls().at(-1)).toMatchObject({ p_kind: 'exercise', p_offset: 0 }));
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'in_review');
    await waitFor(() => expect(listCalls().at(-1)).toMatchObject({ p_kind: 'exercise', p_status: 'in_review' }));
  });

  it('shows a Vietnamese error with a retry', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'editor' }, admin_list_content: { data: null, error: { message: 'invalid_kind', code: 'P0001' } } });
    renderAdmin('/quan-tri/noi-dung');
    expect(await screen.findByText('Loại nội dung không hợp lệ.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});

function detailTable(role: string, extra: RpcTable = {}): RpcTable {
  return { staff_role: { data: role }, admin_get_content: { data: exerciseDetailFixture() }, ...extra };
}

describe('ContentDetailPage', () => {
  it('shows the preview, answer, source, versions and the repo hint', async () => {
    routeRpcs(mocks.rpc, detailTable('editor'));
    const user = userEvent.setup();
    renderAdmin(`/quan-tri/noi-dung/exercise/${EXERCISE_ID}`);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Chọn từ đúng cho chỗ trống: She ___ a teacher.');
    expect(mocks.rpc).toHaveBeenCalledWith('admin_get_content', { p_kind: 'exercise', p_id: EXERCISE_ID });

    // Learner-faithful preview, graded locally with the private key.
    await user.click(screen.getByRole('radio', { name: /is/ }));
    await user.click(screen.getByRole('button', { name: 'Kiểm tra' }));
    expect(mocks.rpc).not.toHaveBeenCalledWith('submit_exercise_attempt', expect.anything());

    const answer = screen.getByRole('region', { name: 'Đáp án và giải thích' });
    expect(answer).toHaveTextContent('is (f8e)');
    expect(answer).toHaveTextContent('She là ngôi thứ ba số ít');
    expect(screen.getByRole('region', { name: 'Nguồn và giấy phép' })).toHaveTextContent('Linguo demo');
    expect(screen.getByRole('region', { name: 'Lịch sử version' })).toHaveTextContent('Version 3');
    expect(screen.getByRole('link', { name: 'Mở hàng đợi báo lỗi loại nội dung này' })).toHaveAttribute('href', '/quan-tri/bao-loi?loai=exercise');
    expect(screen.getByRole('region', { name: 'Đoạn YAML hiện tại' })).toHaveTextContent('02-i-am.yaml');

    // Editors only read.
    expect(screen.getByText(/Chỉ người duyệt hoặc quản trị viên mới đổi được trạng thái/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xuất bản' })).not.toBeInTheDocument();
  });

  it('lets a reviewer move the status and reloads the row', async () => {
    const setStatus = vi.fn(() => ({ data: { status: 'published' } }));
    routeRpcs(mocks.rpc, detailTable('reviewer', { admin_set_status: setStatus }));
    const user = userEvent.setup();
    renderAdmin(`/quan-tri/noi-dung/exercise/${EXERCISE_ID}`);
    await user.type(await screen.findByLabelText('Ghi chú duyệt (không bắt buộc)'), 'ổn');
    await user.click(screen.getByRole('button', { name: 'Xuất bản' }));
    expect(await screen.findByText('Đã chuyển sang "Đã xuất bản".')).toBeInTheDocument();
    expect(setStatus).toHaveBeenCalledWith({ p_kind: 'exercise', p_id: EXERCISE_ID, p_status: 'published', p_note: 'ổn', p_force: false });
    await waitFor(() => expect(mocks.rpc.mock.calls.filter(([name]) => name === 'admin_get_content')).toHaveLength(2));
  });

  it('lets only an admin force a publish over open wrong-answer reports', async () => {
    const setStatus = vi.fn((args: Record<string, unknown>) =>
      args.p_force ? { data: { status: 'published' } } : { data: null, error: { message: 'open_wrong_answer_reports', code: 'P0001' } },
    );
    routeRpcs(mocks.rpc, detailTable('admin', { admin_set_status: setStatus }));
    const user = userEvent.setup();
    renderAdmin(`/quan-tri/noi-dung/exercise/${EXERCISE_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Xuất bản' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Đáp án sai');
    const force = screen.getByRole('button', { name: 'Vẫn xuất bản' });
    expect(force).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /vẫn muốn xuất bản/ }));
    await user.click(force);
    await waitFor(() => expect(setStatus).toHaveBeenLastCalledWith(expect.objectContaining({ p_status: 'published', p_force: true })));
  });

  it('tells a reviewer to ask an admin when publishing is blocked', async () => {
    routeRpcs(
      mocks.rpc,
      detailTable('reviewer', { admin_set_status: { data: null, error: { message: 'open_wrong_answer_reports', code: 'P0001' } } }),
    );
    const user = userEvent.setup();
    renderAdmin(`/quan-tri/noi-dung/exercise/${EXERCISE_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Xuất bản' }));
    expect(await screen.findByText(/nhờ quản trị viên xuất bản/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vẫn xuất bản' })).not.toBeInTheDocument();
  });

  it('previews a learning item as a flashcard', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'editor' }, admin_get_content: { data: itemDetailFixture() } });
    renderAdmin(`/quan-tri/noi-dung/learning_item/${ITEM_ID}`);
    expect(await screen.findByRole('group', { name: 'Chiều thẻ' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Đáp án và giải thích' })).toHaveTextContent('không có đáp án riêng');
  });

  it('rejects a malformed path without calling the server', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'editor' } });
    renderAdmin('/quan-tri/noi-dung/user/not-a-uuid');
    expect(await screen.findByText('Đường dẫn không hợp lệ')).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalledWith('admin_get_content', expect.anything());
  });

  it('links only http(s) source urls', async () => {
    const withUrl = (url: string) => exerciseDetailFixture({ source: { ...exerciseDetailFixture().source!, url } });
    routeRpcs(mocks.rpc, detailTable('editor', { admin_get_content: { data: withUrl('https://tatoeba.org/vi') } }));
    const first = renderAdmin(`/quan-tri/noi-dung/exercise/${EXERCISE_ID}`);
    const source = await screen.findByRole('region', { name: 'Nguồn và giấy phép' });
    expect(within(source).getByRole('link', { name: /tatoeba\.org/ })).toHaveAttribute('href', 'https://tatoeba.org/vi');
    first.unmount();

    routeRpcs(mocks.rpc, detailTable('editor', { admin_get_content: { data: withUrl('javascript:alert(1)') } }));
    renderAdmin(`/quan-tri/noi-dung/exercise/${EXERCISE_ID}`);
    const unsafe = await screen.findByRole('region', { name: 'Nguồn và giấy phép' });
    expect(within(unsafe).getByText('javascript:alert(1)')).toBeInTheDocument();
    expect(within(unsafe).queryByRole('link')).not.toBeInTheDocument();
  });

  it('never shows the previous row under a new path and resets the status form', async () => {
    const OTHER = 'e0000000-0000-4000-8000-0000000000ff';
    let release: (value: { data: unknown; error: null }) => void = () => {};
    mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name === 'staff_role') return Promise.resolve({ data: 'reviewer', error: null });
      if (name === 'admin_get_content' && args.p_id === OTHER) return new Promise((resolve) => (release = resolve));
      if (name === 'admin_get_content') return Promise.resolve({ data: exerciseDetailFixture(), error: null });
      return Promise.resolve({ data: null, error: { message: `no_rpc_${name}`, code: 'X' } });
    });
    const user = userEvent.setup();
    const { router } = renderAdmin(`/quan-tri/noi-dung/exercise/${EXERCISE_ID}`);
    const note = await screen.findByLabelText('Ghi chú duyệt (không bắt buộc)');
    await user.type(note, 'ghi chú của dòng cũ');
    expect(note).toHaveValue('ghi chú của dòng cũ');

    await router.navigate(`/quan-tri/noi-dung/exercise/${OTHER}`);
    expect(await screen.findByText('Đang tải nội dung…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ghi chú duyệt (không bắt buộc)')).not.toBeInTheDocument();

    release({ data: exerciseDetailFixture({ id: OTHER, key: 'en:exercise:other' }), error: null });
    expect(await screen.findByLabelText('Ghi chú duyệt (không bắt buộc)')).toHaveValue('');
  });

  it('shows a not-found error', async () => {
    routeRpcs(mocks.rpc, { staff_role: { data: 'editor' }, admin_get_content: { data: null, error: { message: 'content_not_found', code: 'P0001' } } });
    renderAdmin(`/quan-tri/noi-dung/exercise/${EXERCISE_ID}`);
    expect(await screen.findByText('Không tìm thấy nội dung.')).toBeInTheDocument();
  });
});
