import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, mockPersonalVocab, mockSupabase, PERSONAL_LIST_ID, settleAnimations, signIn, type PersonalVocabMockOptions } from './fixtures';

// Personal vocabulary (spec P2): import a CSV with row errors, review a list, axe in both themes, no horizontal scroll.

const LISTS_URL = '/app/tu-vung-cua-toi';
const LIST_URL = `${LISTS_URL}/${PERSONAL_LIST_ID}`;

const CSV = ['word,meaning,example', 'apple,quả táo,I eat an apple.', 'pear', '=1+1,công thức', '사과,quả táo,사과를 먹어요.', 'apple,trùng'].join('\n');

async function setup(page: Page, vocab: PersonalVocabMockOptions = {}, colorScheme: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
  await mockSupabase(page);
  const mock = await mockPersonalVocab(page, vocab);
  await signIn(page);
  return mock;
}

async function expectNoSeriousAxe(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, `${label}: ${JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)}`).toEqual([]);
}

test('import a pasted CSV: preview with row errors, then confirm', async ({ page }) => {
  const mock = await setup(page);
  await page.goto(LIST_URL);
  await expect(page.getByRole('heading', { level: 1, name: 'Từ vựng TOPIK' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Danh sách đang trống' })).toBeVisible();

  await page.getByRole('button', { name: 'Nhập từ CSV' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nhập từ CSV' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Hoặc dán danh sách vào đây').fill(CSV);
  await dialog.getByRole('button', { name: 'Xem trước' }).click();

  const summary = dialog.getByRole('status').first();
  await expect(summary).toContainText('Đọc được 3 từ hợp lệ, 1 dòng có lỗi sẽ bị bỏ qua, 1 dòng trùng từ với dòng trước nên được bỏ qua');
  // The preview starts from the top with focus on its summary (the button that opened it is gone).
  await expect(summary).toBeFocused();
  await expect(summary).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByText(/giữ nguyên lịch ôn/)).toBeVisible();
  await expect(dialog.getByRole('table', { name: /Xem trước 3 trên 3 từ/ }).getByRole('cell', { name: '=1+1' })).toBeVisible();
  const errors = dialog.getByRole('table', { name: /1 dòng có lỗi/ });
  await expect(errors.getByRole('cell', { name: 'Thiếu nghĩa' })).toBeVisible();
  await settleAnimations(page);
  await expectNoHorizontalScroll(page);
  await expectNoSeriousAxe(page, 'import preview');

  await dialog.getByRole('button', { name: 'Nhập 3 từ' }).click();
  const done = dialog.getByRole('status').first();
  await expect(done).toContainText('Đã thêm 3 từ mới');
  await expect(done).toBeFocused();
  await expect(done).toBeInViewport({ ratio: 1 });
  expect(mock.imports()).toHaveLength(1);
  expect(mock.imports()[0]?.map((r) => r.term)).toEqual(['apple', '=1+1', '사과']);

  await dialog.getByRole('button', { name: 'Đóng' }).last().click();
  await expect(dialog).toBeHidden();
  const table = page.getByRole('table', { name: /Danh sách 3 từ/ });
  await expect(table.getByRole('cell', { name: '사과', exact: true })).toBeVisible();
  // A formula-like term is shown as plain text.
  await expect(table.getByRole('cell', { name: '=1+1', exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('an oversized file is refused and a failed import keeps the preview', async ({ page }) => {
  await setup(page, { failNextImport: 'rate_limited' });
  await page.goto(LIST_URL);
  await page.getByRole('button', { name: 'Nhập từ CSV' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nhập từ CSV' });
  const input = dialog.getByLabel('Chọn file CSV');

  await input.setInputFiles({ name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.alloc(1_048_577, 'a') });
  await expect(dialog.getByRole('alert')).toContainText('File lớn hơn 1 MB');

  await input.setInputFiles({ name: 'tu.csv', mimeType: 'text/csv', buffer: Buffer.from('\ufeff단어;뜻\n바나나;quả chuối\n') });
  await expect(dialog.getByRole('cell', { name: '바나나' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Nhập 1 từ' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Bạn đã nhập khá nhiều rồi');
  // The preview is still there: retry works.
  await dialog.getByRole('button', { name: 'Nhập 1 từ' }).click();
  await expect(dialog.getByRole('status').first()).toContainText('Đã thêm 1 từ mới');
});

test('review a list with the flashcards', async ({ page }) => {
  const mock = await setup(page, {
    lists: [
      {
        id: PERSONAL_LIST_ID,
        name: 'Từ vựng TOPIK',
        language_code: 'ko',
        words: [
          { term: '사과', meaning: 'quả táo' },
          { term: '학교', meaning: 'trường học', example: '학교에 가요.' },
        ],
      },
    ],
  });
  await page.goto(LIST_URL);
  await expect(page.getByRole('table', { name: /Danh sách 2 từ/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('link', { name: 'Ôn danh sách này' }).click();

  const counter = page.getByRole('heading', { level: 2, name: /^Thẻ \d+\/2$/ });
  await expect(counter).toHaveText('Thẻ 1/2', { timeout: 15_000 });
  await expectNoHorizontalScroll(page);
  await page.getByTestId('flashcard-front').click();
  await expect(page.getByTestId('flashcard-back')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: /^Được,/ }).click();

  await expect(counter).toHaveText('Thẻ 2/2');
  await page.getByTestId('flashcard-front').click();
  await page.keyboard.press('4');

  const summary = page.getByRole('heading', { name: 'Xong phiên ôn' });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  expect(mock.grades().map((g) => g.rating)).toEqual([3, 4]);
  // Nothing else is due: no "review more" button that would only lead to an empty screen.
  await expect(page.getByRole('button', { name: /Ôn tiếp/ })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await page.getByRole('link', { name: 'Về danh sách', exact: true }).click();
  await expect(page.getByText('Hôm nay bạn đã ôn xong danh sách này')).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`axe and layout: lists, list and review (${colorScheme})`, async ({ page }) => {
    await setup(
      page,
      {
        lists: [
          { id: PERSONAL_LIST_ID, name: 'Từ vựng TOPIK', language_code: 'ko', words: [{ term: '사과', meaning: 'quả táo', example: '사과를 먹어요.' }, { term: '학교', meaning: 'trường học' }] },
          { id: '9e000000-0000-4000-8000-0000000000e2', name: 'English words', language_code: 'en' },
        ],
      },
      colorScheme,
    );
    for (const [path, ready] of [
      [LISTS_URL, page.getByRole('heading', { level: 1, name: 'Từ vựng của tôi' })],
      [LIST_URL, page.getByRole('table', { name: /Danh sách 2 từ/ })],
    ] as const) {
      await page.goto(path);
      await expect(ready).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
      await settleAnimations(page);
      await expectNoHorizontalScroll(page);
      await expectNoSeriousAxe(page, `${path} ${colorScheme}`);
    }

    // Dialogs: create a list, edit a word.
    await page.getByRole('button', { name: 'Sửa từ 사과' }).click();
    const edit = page.getByRole('dialog', { name: 'Sửa từ' });
    await expect(edit).toBeVisible();
    await settleAnimations(page);
    await expectNoSeriousAxe(page, `edit dialog ${colorScheme}`);
    await page.keyboard.press('Escape');
    await expect(edit).toBeHidden();

    await page.goto(`${LIST_URL}/on-tap`);
    await expect(page.getByTestId('flashcard-front')).toBeVisible({ timeout: 15_000 });
    await settleAnimations(page);
    await expectNoHorizontalScroll(page);
    await expectNoSeriousAxe(page, `review ${colorScheme}`);
  });
}

test('deleting a word keeps keyboard focus in the table', async ({ page }) => {
  await setup(page, {
    lists: [
      {
        id: PERSONAL_LIST_ID,
        name: 'Từ vựng TOPIK',
        language_code: 'ko',
        words: [
          { term: '사과', meaning: 'quả táo' },
          { term: '학교', meaning: 'trường học' },
        ],
      },
    ],
  });
  // Registered after the vocabulary mock, so it answers first; everything else falls through to the mock.
  await page.route('**/rest/v1/rpc/delete_personal_word', (route) => route.fulfill({ json: { deleted: true } }));
  await page.goto(LIST_URL);
  await expect(page.getByRole('table', { name: /Danh sách 2 từ/ })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Xoá từ 사과' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xoá từ' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Xoá từ 학교' })).toBeFocused();

  await page.keyboard.press('Enter');
  await page.getByRole('dialog').getByRole('button', { name: 'Xoá từ' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Từ vựng TOPIK' })).toBeFocused();
});

test('a long list name is truncated in the review back link, never widening the page', async ({ page }) => {
  const longName = 'Từ vựng chuyên ngành kế toán kiểm toán và tài chính doanh nghiệp quốc tế';
  await setup(page, { lists: [{ id: PERSONAL_LIST_ID, name: longName, language_code: 'ko', words: [{ term: '사과', meaning: 'quả táo' }] }] });
  await page.goto(`${LIST_URL}/on-tap`);
  const back = page.getByRole('link', { name: `Về danh sách ${longName}` });
  await expect(back).toBeVisible({ timeout: 15_000 });
  const box = await back.boundingBox();
  expect(box?.height ?? 0).toBeLessThan(60);
  await expectNoHorizontalScroll(page);
});

test('the navigation reaches the personal vocabulary and the empty state is warm', async ({ page }) => {
  await setup(page, { lists: [] });
  await page.goto(LISTS_URL);
  await expect(page.getByRole('heading', { name: 'Chưa có danh sách nào' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Tạo danh sách đầu tiên/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Tạo danh sách mới' });
  await dialog.getByLabel('Tên danh sách').fill('Từ mới');
  // The learner studies English, so English is preselected; the language choice is one Tab stop with arrow keys.
  const english = dialog.getByRole('radio', { name: /Tiếng Anh/ });
  const korean = dialog.getByRole('radio', { name: /Tiếng Hàn/ });
  await expect(english).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(english).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(korean).toBeChecked();
  await expect(korean).toBeFocused();
  await dialog.getByText('Tiếng Anh', { exact: true }).click();
  await expect(english).toBeChecked();
  await dialog.getByRole('button', { name: 'Tạo danh sách' }).click();
  await expect(page.getByRole('link', { name: /Từ mới/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
