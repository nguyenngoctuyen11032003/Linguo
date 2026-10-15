import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonalList, PersonalWord } from '@linguo/shared';
import { LIST_ID, fakeVocabClient, personalCard, personalList, personalWord } from '@/features/personal-vocab/personal-fixtures';
import { TEST_PATH } from '../../../../tests/unit/learning-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { PersonalListPage } from './PersonalListPage';
import { PersonalListsPage } from './PersonalListsPage';
import { PersonalReviewPage } from './PersonalReviewPage';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client }));

let lists: PersonalList[];
let words: PersonalWord[];
let client: ReturnType<typeof fakeVocabClient>;

function backend() {
  client = fakeVocabClient((name, args) => {
    switch (name) {
      case 'list_personal_lists':
        return { data: lists.map((l) => ({ ...l, word_count: words.filter((w) => w.list_id === l.id).length })) };
      case 'create_personal_list': {
        if (String(args.p_name) === 'Trùng') return { error: { message: 'name_taken', code: 'P0001' } };
        const created = personalList({ id: '9e000000-0000-4000-8000-0000000000aa', name: String(args.p_name), language_code: args.p_language as 'en' | 'ko', word_count: 0, due_count: 0 });
        lists.push(created);
        return { data: created };
      }
      case 'rename_personal_list':
        return { data: { id: args.p_list_id, name: args.p_name, language_code: 'ko' } };
      case 'delete_personal_list':
        lists = lists.filter((l) => l.id !== args.p_list_id);
        return { data: { deleted: true } };
      case 'import_personal_words': {
        const rows = args.p_rows as Array<{ term: string; meaning: string }>;
        for (const r of rows) words.push(personalWord({ term: r.term, meaning: r.meaning }));
        return { data: { added: rows.length, updated: 0, unchanged: 0, duplicates: 0, invalid: [] } };
      }
      case 'delete_personal_word':
        words = words.filter((w) => w.id !== args.p_word_id);
        return { data: { deleted: true } };
      case 'update_personal_word':
        return { data: { id: args.p_word_id, term: args.p_term, meaning: args.p_meaning, example: args.p_example, note: args.p_note, pronunciation: args.p_pronunciation } };
      case 'get_personal_review_queue':
        return { data: { cards: words.map((w) => personalCard(w)), totals: { due_total: words.length, served: words.length, new_available: words.length } } };
      case 'grade_personal_word':
        return { data: { word_id: args.p_word_id, state: 'learning', due_at: '2026-10-14T00:10:00Z', interval_minutes: 10, replayed: false } };
    }
    return { error: { message: `unexpected ${name}` } };
  }, []);
  // The fake reads `words` lazily from the array it was given; keep it in sync with the test's current array.
  const original = client.from;
  client.from = () => {
    const q = original();
    (q as { then: unknown }).then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: words, error: null }).then(resolve, reject);
    return q;
  };
  mocks.client = client;
}

beforeEach(() => {
  localStorage.setItem('linguo-reduce-motion', 'true');
  lists = [];
  words = [];
  backend();
});
afterEach(() => {
  mocks.client = null;
});

function renderLists() {
  return renderWithProviders(
    <Routes>
      <Route path="/app/tu-vung-cua-toi" element={<PersonalListsPage />} />
      <Route path="/app/tu-vung-cua-toi/:listId" element={<PersonalListPage />} />
      <Route path="/app/tu-vung-cua-toi/:listId/on-tap" element={<PersonalReviewPage />} />
    </Routes>,
    { route: '/app/tu-vung-cua-toi' },
  );
}

describe('PersonalListsPage', () => {
  it('shows a warm empty state and creates the first list', async () => {
    const user = userEvent.setup();
    renderLists();
    expect(await screen.findByRole('heading', { name: 'Chưa có danh sách nào' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Tạo danh sách đầu tiên/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo danh sách mới' });
    await user.type(within(dialog).getByLabelText('Tên danh sách'), '  Từ   mới  ');
    await user.click(within(dialog).getByRole('radio', { name: /Tiếng Anh/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Tạo danh sách' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(client.calls.find(([n]) => n === 'create_personal_list')?.[1]).toEqual({ p_name: 'Từ mới', p_language: 'en' });
    expect(screen.getByRole('link', { name: /Từ mới/ })).toHaveAttribute('href', '/app/tu-vung-cua-toi/9e000000-0000-4000-8000-0000000000aa');
  });

  it('keeps the dialog open and explains a server refusal', async () => {
    const user = userEvent.setup();
    lists = [personalList()];
    renderLists();
    await user.click(await screen.findByRole('button', { name: 'Tạo danh sách' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Tên danh sách'), 'Trùng');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo danh sách' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Bạn đã có một danh sách trùng tên');
  });

  it('refuses a blank name without calling the server', async () => {
    const user = userEvent.setup();
    lists = [personalList()];
    renderLists();
    await user.click(await screen.findByRole('button', { name: 'Tạo danh sách' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo danh sách' }));
    expect(await within(dialog).findByText('Hãy đặt tên cho danh sách nhé.')).toBeInTheDocument();
    expect(client.calls.some(([n]) => n === 'create_personal_list')).toBe(false);
  });

  it('shows lists with counts and an offline-friendly error with retry', async () => {
    lists = [personalList({ name: 'Món ăn', due_count: 3 })];
    words = [personalWord(), personalWord(), personalWord()];
    renderLists();
    expect(await screen.findByRole('link', { name: /Món ăn/ })).toHaveTextContent('3 từ · 3 từ cần ôn');
  });

  it('reports a failed load with a retry button', async () => {
    const user = userEvent.setup();
    let fail = true;
    const inner = client.rpc;
    client.rpc = (name: string, args: Record<string, unknown>) =>
      fail ? Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }) : inner(name, args);
    renderLists();
    expect(await screen.findByText('Không kết nối được máy chủ. Kiểm tra mạng và thử lại.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: 'Chưa có danh sách nào' })).toBeInTheDocument();
  });
});

describe('PersonalListPage', () => {
  beforeEach(() => {
    lists = [personalList({ name: 'Từ vựng TOPIK', due_count: 2 })];
    words = [personalWord({ term: '사과', meaning: 'quả táo' }), personalWord({ term: '학교', meaning: 'trường học' })];
  });

  const open = () =>
    renderWithProviders(
      <Routes>
        <Route path="/app/tu-vung-cua-toi" element={<PersonalListsPage />} />
        <Route path="/app/tu-vung-cua-toi/:listId" element={<PersonalListPage />} />
      </Routes>,
      { route: `/app/tu-vung-cua-toi/${LIST_ID}` },
    );

  it('lists the words in a labelled table and offers the review', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Từ vựng TOPIK' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: /Danh sách 2 từ/ });
    expect(within(table).getByRole('cell', { name: '사과' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ôn danh sách này' })).toHaveAttribute('href', `/app/tu-vung-cua-toi/${LIST_ID}/on-tap`);
  });

  it('shows a not-found state for an unknown list', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/app/tu-vung-cua-toi/:listId" element={<PersonalListPage />} />
      </Routes>,
      { route: '/app/tu-vung-cua-toi/9e000000-0000-4000-8000-0000000000ff' },
    );
    expect(await screen.findByRole('heading', { name: 'Không tìm thấy danh sách' })).toBeInTheDocument();
  });

  it('deletes a word after confirmation', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Xoá từ 사과' }));
    const dialog = await screen.findByRole('dialog', { name: /Xoá từ/ });
    await user.click(within(dialog).getByRole('button', { name: 'Xoá từ' }));
    await waitFor(() => expect(screen.queryByRole('cell', { name: '사과' })).not.toBeInTheDocument());
    expect(client.calls.find(([n]) => n === 'delete_personal_word')?.[1]).toEqual({ p_word_id: expect.any(String) });
  });

  it('edits a word', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Sửa từ 사과' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sửa từ' });
    const meaning = within(dialog).getByLabelText('Nghĩa');
    await user.clear(meaning);
    await user.type(meaning, 'trái táo');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByRole('cell', { name: 'trái táo' })).toBeInTheDocument();
    expect(client.calls.find(([n]) => n === 'update_personal_word')?.[1]).toMatchObject({ p_meaning: 'trái táo', p_example: null });
  });

  it('deletes the list and returns to all lists', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Xoá danh sách' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Xoá danh sách' }));
    expect(await screen.findByRole('heading', { name: 'Chưa có danh sách nào' })).toBeInTheDocument();
  });

  it('previews a pasted CSV with row errors, then imports only the valid rows', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Nhập từ CSV' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nhập từ CSV' });
    await user.click(within(dialog).getByLabelText('Hoặc dán danh sách vào đây'));
    await user.paste('word,meaning\napple,quả táo\npear\n=1+1,công thức\napple,trùng');
    await user.click(within(dialog).getByRole('button', { name: 'Xem trước' }));

    expect(await within(dialog).findByRole('status')).toHaveTextContent('Đọc được 2 từ hợp lệ, 1 dòng có lỗi sẽ bị bỏ qua, 1 dòng trùng từ với dòng trước nên được bỏ qua');
    const preview = within(dialog).getByRole('table', { name: /Xem trước 2 trên 2 từ/ });
    expect(within(preview).getByRole('cell', { name: '=1+1' })).toBeInTheDocument();
    const errors = within(dialog).getByRole('table', { name: /1 dòng có lỗi/ });
    expect(within(errors).getByRole('cell', { name: '3' })).toBeInTheDocument();
    expect(within(errors).getByRole('cell', { name: 'Thiếu nghĩa' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Nhập 2 từ' }));
    expect(await within(dialog).findByRole('status')).toHaveTextContent('Đã thêm 2 từ mới');
    expect(client.calls.find(([n]) => n === 'import_personal_words')?.[1]).toEqual({
      p_list_id: LIST_ID,
      p_rows: [
        { term: 'apple', meaning: 'quả táo' },
        { term: '=1+1', meaning: 'công thức' },
      ],
    });
    await user.click(within(dialog).getAllByRole('button', { name: 'Đóng' }).at(-1) as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('reads a chosen file, and keeps the preview when the import fails (offline-safe)', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Nhập từ CSV' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nhập từ CSV' });
    const inner = client.rpc;
    client.rpc = (name: string, args: Record<string, unknown>) =>
      name === 'import_personal_words'
        ? Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } })
        : inner(name, args);
    const file = new File(['\ufeff단어;뜻\n바나나;quả chuối'], 'tu.csv', { type: 'text/csv' });
    await user.upload(within(dialog).getByLabelText('Chọn file CSV'), file);
    expect(await within(dialog).findByRole('cell', { name: '바나나' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Nhập 1 từ' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
    expect(within(dialog).getByRole('button', { name: 'Nhập 1 từ' })).toBeEnabled();
  });

  it('refuses a file over 1 MB before reading it', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Nhập từ CSV' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nhập từ CSV' });
    const big = new File(['a,b'], 'big.csv', { type: 'text/csv' });
    Object.defineProperty(big, 'size', { value: 1_048_577 });
    await user.upload(within(dialog).getByLabelText('Chọn file CSV'), big);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('File lớn hơn 1 MB');
  });

  it('explains empty input', async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'Nhập từ CSV' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nhập từ CSV' });
    await user.click(within(dialog).getByLabelText('Hoặc dán danh sách vào đây'));
    await user.paste('word,meaning\n');
    await user.click(within(dialog).getByRole('button', { name: 'Xem trước' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Chưa thấy dòng từ nào');
  });
});

describe('PersonalReviewPage', () => {
  it('flips and grades the cards of a list, then shows the summary', async () => {
    const user = userEvent.setup();
    lists = [personalList()];
    words = [personalWord({ term: '사과', meaning: 'quả táo' }), personalWord({ term: '학교', meaning: 'trường học' })];
    renderWithProviders(
      <Routes>
        <Route path="/app/tu-vung-cua-toi/:listId/on-tap" element={<PersonalReviewPage />} />
      </Routes>,
      { route: `/app/tu-vung-cua-toi/${LIST_ID}/on-tap` },
    );
    expect(await screen.findByRole('heading', { level: 2, name: 'Thẻ 1/2' })).toBeInTheDocument();
    await user.click(screen.getByTestId('flashcard-front'));
    await user.click(await screen.findByRole('button', { name: /^Được,/ }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Thẻ 2/2' })).toBeInTheDocument();
    await user.click(screen.getByTestId('flashcard-front'));
    await user.keyboard('4');
    expect(await screen.findByRole('heading', { name: 'Xong phiên ôn' })).toBeInTheDocument();
    expect(screen.getByText(/Bạn vừa ôn 2 từ/)).toBeInTheDocument();
    expect(client.calls.filter(([n]) => n === 'grade_personal_word').map(([, a]) => a.p_rating)).toEqual([3, 4]);
  });

  it('shows an empty state when nothing is due', async () => {
    lists = [personalList()];
    words = [];
    renderWithProviders(
      <Routes>
        <Route path="/app/tu-vung-cua-toi/:listId/on-tap" element={<PersonalReviewPage />} />
      </Routes>,
      { route: `/app/tu-vung-cua-toi/${LIST_ID}/on-tap` },
    );
    expect(await screen.findByRole('heading', { name: 'Chưa có từ nào cần ôn lúc này' })).toBeInTheDocument();
  });
});

describe('focus and wording', () => {
  const openList = () =>
    renderWithProviders(
      <Routes>
        <Route path="/app/tu-vung-cua-toi" element={<PersonalListsPage />} />
        <Route path="/app/tu-vung-cua-toi/:listId" element={<PersonalListPage />} />
      </Routes>,
      { route: `/app/tu-vung-cua-toi/${LIST_ID}` },
    );

  it('starts each import step from the top and moves focus to its summary', async () => {
    const user = userEvent.setup();
    lists = [personalList({ name: 'Từ vựng TOPIK' })];
    openList();
    await user.click(await screen.findByRole('button', { name: 'Nhập từ CSV' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nhập từ CSV' });
    const body = dialog.querySelector<HTMLElement>('[data-vocab-dialog-body]') as HTMLElement;
    expect(body).not.toBeNull();
    await user.click(within(dialog).getByLabelText('Hoặc dán danh sách vào đây'));
    await user.paste('apple,quả táo\npear,quả lê');
    body.scrollTop = 240;
    await user.click(within(dialog).getByRole('button', { name: 'Xem trước' }));

    const summary = await within(dialog).findByRole('status');
    expect(summary).toHaveTextContent('Đọc được 2 từ hợp lệ');
    expect(summary).toHaveFocus();
    expect(body.scrollTop).toBe(0);
    expect(within(dialog).getByText(/giữ nguyên lịch ôn và chỉ cập nhật nghĩa/)).toBeInTheDocument();

    // Going back puts the learner in the text box again, with the pasted text kept.
    await user.click(within(dialog).getByRole('button', { name: 'Chọn lại' }));
    expect(within(dialog).getByLabelText('Hoặc dán danh sách vào đây')).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Xem trước' }));

    body.scrollTop = 240;
    await user.click(within(dialog).getByRole('button', { name: 'Nhập 2 từ' }));
    const done = await within(dialog).findByText(/Đã thêm/);
    expect(done.closest('[role="status"]')).toHaveFocus();
    expect(body.scrollTop).toBe(0);
  });

  it('moves focus to the next word, then the previous one, then the heading as words are deleted', async () => {
    const user = userEvent.setup();
    lists = [personalList({ name: 'Từ vựng TOPIK', due_count: 2 })];
    words = [personalWord({ term: '사과', meaning: 'quả táo' }), personalWord({ term: '학교', meaning: 'trường học' }), personalWord({ term: '물', meaning: 'nước' })];
    openList();

    async function remove(term: string) {
      await user.click(await screen.findByRole('button', { name: `Xoá từ ${term}` }));
      const dialog = await screen.findByRole('dialog', { name: /Xoá từ/ });
      await user.click(within(dialog).getByRole('button', { name: 'Xoá từ' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }

    await remove('학교');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xoá từ 물' })).toHaveFocus());
    await remove('물');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xoá từ 사과' })).toHaveFocus());
    await remove('사과');
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Từ vựng TOPIK' })).toHaveFocus());
  });

  it('shows the error state, not "0 từ", when the words fail to load', async () => {
    const user = userEvent.setup();
    lists = [personalList({ name: 'Từ vựng TOPIK', word_count: 4, due_count: 0 })];
    // The fake counts the words itself: keep the server count at 4, and fail the words query.
    const inner = client.rpc;
    client.rpc = (name: string, args: Record<string, unknown>) =>
      name === 'list_personal_lists' ? Promise.resolve({ data: lists, error: null }) : inner(name, args);
    client.from = () => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'order']) q[m] = () => q;
      q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } }).then(resolve, reject);
      return q as never;
    };
    openList();
    expect(await screen.findByRole('heading', { name: 'Không tải được các từ' })).toBeInTheDocument();
    expect(screen.getByText(/· 4 từ/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xoá danh sách' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).not.toHaveTextContent('Cả 0 từ');
    expect(dialog).toHaveTextContent('mọi từ trong đó');
  });

  it('uses consistent names: back to "Từ vựng của tôi", lists under "Danh sách của tôi"', async () => {
    const user = userEvent.setup();
    lists = [personalList({ name: 'Từ vựng TOPIK' })];
    openList();
    expect(await screen.findByRole('link', { name: 'Từ vựng của tôi' })).toHaveAttribute('href', '/app/tu-vung-cua-toi');
    expect(screen.queryByText('Tất cả danh sách')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Từ vựng của tôi' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Danh sách của tôi' })).toBeInTheDocument();
  });

  it('defaults a new list to the current path language and moves the choice with arrow keys', async () => {
    const user = userEvent.setup();
    renderLists();
    await user.click(await screen.findByRole('button', { name: /Tạo danh sách đầu tiên/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo danh sách mới' });
    const english = within(dialog).getByRole('radio', { name: /Tiếng Anh/ });
    const korean = within(dialog).getByRole('radio', { name: /Tiếng Hàn/ });
    // The test learner studies English.
    expect(english).toBeChecked();
    english.focus();
    await user.keyboard('{ArrowRight}');
    expect(korean).toBeChecked();
    expect(korean).toHaveFocus();
  });

  it('defaults to Korean for a Korean path', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PersonalListsPage />, { route: '/app/tu-vung-cua-toi', paths: { paths: [{ ...TEST_PATH, language: 'ko' }] } });
    await user.click(await screen.findByRole('button', { name: /Tạo danh sách đầu tiên/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo danh sách mới' });
    expect(within(dialog).getByRole('radio', { name: /Tiếng Hàn/ })).toBeChecked();
  });

  const renderReview = () =>
    renderWithProviders(
      <Routes>
        <Route path="/app/tu-vung-cua-toi/:listId/on-tap" element={<PersonalReviewPage />} />
      </Routes>,
      { route: `/app/tu-vung-cua-toi/${LIST_ID}/on-tap` },
    );

  async function finishOneCard() {
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { level: 2, name: 'Thẻ 1/1' })).toBeInTheDocument();
    await user.click(screen.getByTestId('flashcard-front'));
    await user.keyboard('3');
    expect(await screen.findByRole('heading', { name: 'Xong phiên ôn' })).toBeInTheDocument();
  }

  it('hides "Ôn tiếp" when nothing is left and keeps the full list name in the back link', async () => {
    const longName = 'Một tên danh sách rất dài để kiểm tra việc cắt bớt ở màn hình hẹp';
    lists = [personalList({ name: longName })];
    words = [personalWord({ term: '사과', meaning: 'quả táo' })];
    renderReview();
    await finishOneCard();
    expect(screen.queryByRole('button', { name: 'Ôn tiếp các từ còn lại' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về danh sách' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Về danh sách ${longName}` })).toBeInTheDocument();
  });

  it('offers "Ôn tiếp các từ còn lại" when due words were left out of the session', async () => {
    lists = [personalList()];
    words = [personalWord({ term: '사과', meaning: 'quả táo' })];
    const inner = client.rpc;
    client.rpc = (name: string, args: Record<string, unknown>) =>
      name === 'get_personal_review_queue'
        ? Promise.resolve({ data: { cards: words.map((w) => personalCard(w)), totals: { due_total: 4, served: 1, new_available: 4 } }, error: null })
        : inner(name, args);
    renderReview();
    await finishOneCard();
    expect(screen.getByText(/Còn 3 từ đến hạn hôm nay/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ôn tiếp các từ còn lại' })).toBeInTheDocument();
  });
});
