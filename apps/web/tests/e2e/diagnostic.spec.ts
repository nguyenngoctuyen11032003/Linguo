import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { diagnosticReportSchema, diagnosticStatusSchema, diagnosticStepSchema, placementResultSchema } from '@linguo/shared';
import { DIAGNOSTIC_BANK, diagnosticCorrectText, expectNoHorizontalScroll, mockSupabase, pathRow, signIn, SUPABASE_URL } from './fixtures';

// Spec 4 §6: "chưa chắc" onboarding → placement test → pause/reload → report → level update, with no answer key on
// the wire. The test runner and report screens come from D7; Home/settings/onboarding entry points from D8.

const PATH_ID = '33333333-3333-4333-8333-333333333333';
const LEAK_KEYS = new Set(['answer_key', 'is_correct', 'correct', 'correct_option_id', 'answer', 'theta', 'eap']);
const A11Y_PROJECTS = ['iphone-15-pro', 'pixel-7'];

interface Step {
  attempt_id: string;
  item: { id: string; skill: string } | null;
  done: boolean;
  resumed: boolean;
}

/** Records every diagnostic RPC answer the page receives and fails on any answer-key-like field. */
function watchDiagnostic(page: Page) {
  const state = { last: null as Step | null, leaks: [] as string[], calls: [] as string[] };
  const scan = (value: unknown, where: string): void => {
    if (Array.isArray(value)) value.forEach((v, i) => scan(v, `${where}[${i}]`));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if (LEAK_KEYS.has(k)) state.leaks.push(`${where}.${k}`);
        scan(v, `${where}.${k}`);
      }
    }
  };
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.startsWith(SUPABASE_URL) || !/diagnostic/.test(url)) return;
    const fn = new URL(url).pathname.split('/').at(-1) ?? url;
    state.calls.push(fn);
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return;
    }
    scan(json, fn);
    if (/^(start_diagnostic|answer_diagnostic|skip_diagnostic_skill)$/.test(fn) && json && typeof json === 'object' && 'attempt_id' in json) {
      state.last = json as Step;
    }
  });
  return state;
}

async function axe(page: Page, testInfo: TestInfo, label: string) {
  if (!A11Y_PROJECTS.includes(testInfo.project.name)) return;
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, `${label} (${colorScheme}): ${JSON.stringify(serious.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })), null, 2)}`).toEqual([]);
  }
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
}

async function next(page: Page) {
  const button = page.getByRole('button', { name: 'Tiếp tục', exact: true });
  await expect(button).toBeEnabled();
  await button.click();
}

const dontKnow = (page: Page) => page.getByRole('radio', { name: 'Tôi không biết' }).or(page.getByRole('button', { name: 'Tôi không biết' }));

/** Gets past the intro (or the resume screen) to a question. */
async function reachQuestion(page: Page) {
  const start = page.getByRole('button', { name: /^(Bắt đầu|Tiếp tục|Làm tiếp)/ });
  await expect(dontKnow(page).or(start).first()).toBeVisible({ timeout: 15_000 });
  if (!(await dontKnow(page).first().isVisible())) await start.first().click();
  await expect(dontKnow(page).first()).toBeVisible();
}

/** Answers the question on screen through the UI (right answer from the local bank) and waits for the next step. */
async function answerRight(page: Page, state: ReturnType<typeof watchDiagnostic>) {
  await expect.poll(() => state.last?.item?.id ?? null).not.toBeNull();
  const id = state.last!.item!.id;
  const text = diagnosticCorrectText(id);
  await page.getByRole('radio', { name: text, exact: true }).or(page.getByRole('button', { name: text, exact: true })).first().click();
  const submit = page.getByRole('button', { name: /^(Trả lời|Xác nhận|Tiếp theo|Tiếp tục|Gửi)$/ });
  if (await submit.isVisible()) await submit.click();
  await expect.poll(() => (state.last?.done ? 'done' : (state.last?.item?.id ?? null))).not.toBe(id);
}

test('"chưa chắc" onboarding leads to the test, which pauses, resumes, skips reading and updates the level', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mock = await mockSupabase(page, { paths: [], pathIds: 'uuid' });
  const state = watchDiagnostic(page);
  await signIn(page);
  await page.goto('/app');

  // Onboarding: "unsure" keeps the provisional A1 level.
  await expect(page.getByRole('heading', { level: 1, name: 'Bạn muốn học ngôn ngữ nào?' })).toBeVisible();
  await page.getByRole('radio', { name: /Tiếng Anh/ }).check();
  await next(page);
  await page.getByRole('radio', { name: /^Tôi chưa chắc trình độ của mình/ }).check();
  await expect(page.getByText(/bài kiểm tra \(~12 phút\)/)).toBeVisible();
  await next(page);
  await expect(page.getByRole('radio', { name: /^A1/ })).toBeChecked();
  await next(page);
  await page.getByRole('radio', { name: 'Tiếng Anh công việc / IT' }).check();
  await expect(page.getByRole('radio', { name: /^B2/ })).toBeChecked();
  await next(page);
  await next(page);
  await page.getByRole('button', { name: 'Tạo lộ trình' }).click();

  await expect(page.getByRole('heading', { name: 'Lộ trình đã sẵn sàng!' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Để sau' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Làm bài kiểm tra (~12 phút)' }).click();
  const pathId = mock.paths()[0]!.id as string;
  await expect(page).toHaveURL(new RegExp(`/app/kiem-tra/${pathId}$`));

  // Two vocabulary answers, then pause.
  await reachQuestion(page);
  await expectNoHorizontalScroll(page);
  await axe(page, testInfo, 'question');
  await answerRight(page, state);
  await answerRight(page, state);
  const pending = state.last!.item!.id;
  await page.getByRole('button', { name: /^Tạm dừng/ }).click();
  const confirmPause = page.getByRole('dialog').getByRole('button', { name: /Tạm dừng/ });
  if (await confirmPause.isVisible()) await confirmPause.click();

  // Coming back resumes the same pending question; so does a reload in the middle of it.
  await page.goto(`/app/kiem-tra/${pathId}`);
  await reachQuestion(page);
  await expect.poll(() => state.last?.resumed).toBe(true);
  expect(state.last!.item!.id).toBe(pending);
  const stem = DIAGNOSTIC_BANK.find((i) => i.id === pending)!.stem;
  await expect(page.getByText(stem, { exact: true })).toBeVisible();
  await page.reload();
  await reachQuestion(page);
  await expect(page.getByText(stem, { exact: true })).toBeVisible();
  expect(state.last!.item!.id).toBe(pending);

  // Finish vocabulary and grammar, then skip reading.
  for (let i = 0; i < 12 && state.last?.item && state.last.item.skill !== 'reading'; i++) await answerRight(page, state);
  expect(state.last?.item?.skill).toBe('reading');
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Bỏ qua kỹ năng này' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('radio').first().check();
  await sheet.getByRole('button', { name: /Bỏ qua/ }).click();

  // Report: reading has no estimate; the suggestion is capped at +2 levels (A1 → B1).
  await expect(page).toHaveURL(new RegExp(`/app/kiem-tra/${pathId}/ket-qua$`), { timeout: 15_000 });
  await expect(page.getByText(/chưa đủ dữ liệu/i).first()).toBeVisible();
  await expect(page.getByText(/Ước lượng sơ bộ, không phải chứng chỉ/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await axe(page, testInfo, 'report');
  await page.getByRole('button', { name: /Cập nhật trình độ lộ trình thành B1/ }).click();
  await expect.poll(() => mock.paths().find((p) => p.id === pathId)?.current_level).toBe('b1');

  expect(state.calls).toContain('finish_diagnostic');
  expect(state.calls).toContain('accept_diagnostic_placement');
  expect(state.leaks, 'diagnostic responses must not carry answer keys or correctness').toEqual([]);
});

test('Home offers the test, settings shows the retake date during the cooldown', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const recent = new Date(Date.now() - 2 * 86_400_000).toISOString();
  await mockSupabase(page, {
    paths: [pathRow({ id: PATH_ID, start_point: 'unsure', current_level: 'a1' }), pathRow({ id: '44444444-4444-4444-8444-444444444444', language_code: 'ko', goal_type: 'communication', current_level: 'topik1', target_level: 'topik3' })],
    diagnostic: { completedAt: { '44444444-4444-4444-8444-444444444444': recent } },
  });
  await signIn(page);
  await page.goto('/app');
  await expect(page.getByRole('heading', { level: 2, name: 'Kiểm tra trình độ' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bắt đầu kiểm tra' })).toHaveAttribute('href', new RegExp(`/app/kiem-tra/${PATH_ID}$`));
  await expectNoHorizontalScroll(page);

  await page.goto('/app/cai-dat');
  await expect(page.getByRole('link', { name: 'Tiếng Anh: Làm bài kiểm tra trình độ' })).toBeVisible();
  const retake = page.getByRole('button', { name: 'Tiếng Hàn: Làm lại bài kiểm tra' });
  await expect(retake).toBeDisabled();
  const opens = new Date(Date.parse(recent) + 14 * 86_400_000);
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(opens);
  await expect(retake).toHaveAccessibleDescription(`Có thể làm lại từ ${date}`);
  await expectNoHorizontalScroll(page);
});

test('a beginner may take the optional foundation check', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mock = await mockSupabase(page, { paths: [], pathIds: 'uuid' });
  await signIn(page);
  await page.goto('/app/bat-dau');
  await page.getByRole('radio', { name: /Tiếng Anh/ }).check();
  await next(page);
  await page.getByRole('radio', { name: 'Tôi mới hoàn toàn' }).check();
  await next(page);
  await page.getByRole('radio', { name: 'Nền tảng từ số 0' }).check();
  await next(page);
  await next(page);
  await page.getByRole('button', { name: 'Tạo lộ trình' }).click();
  await expect(page.getByRole('button', { name: 'Vào trang chủ' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Làm bài kiểm tra/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Kiểm tra nền tảng (2–3 phút)' }).click();
  await expect(page).toHaveURL(new RegExp(`/app/kiem-tra/${String(mock.paths()[0]!.id)}\\?che-do=nen-tang$`));
});

test('the diagnostic mock honours the RPC contracts and never sends answer keys', async ({ page }) => {
  await mockSupabase(page, { paths: [pathRow({ id: PATH_ID, current_level: 'a1', target_level: 'b2' })] });
  await page.goto('/dang-nhap');
  const rpc = (fn: string, args: Record<string, unknown>) =>
    page.evaluate(
      async ([url, body]) => {
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
        return { status: res.status, json: (await res.json()) as unknown };
      },
      [`${SUPABASE_URL}/rest/v1/rpc/${fn}`, JSON.stringify(args)] as const,
    );
  const ok = async (fn: string, args: Record<string, unknown>) => {
    const res = await rpc(fn, args);
    expect(res.status, `${fn}: ${JSON.stringify(res.json)}`).toBe(200);
    expect(JSON.stringify(res.json)).not.toMatch(/answer_key|is_correct|"correct"/);
    return res.json;
  };
  const errorOf = async (fn: string, args: Record<string, unknown>) => ((await rpc(fn, args)).json as { message: string }).message;

  expect(diagnosticStatusSchema.parse(await ok('diagnostic_status', { p_path_id: PATH_ID }))).toMatchObject({ status: 'none', can_start: true });
  let step = diagnosticStepSchema.parse(await ok('start_diagnostic', { p_path_id: PATH_ID, p_mode: 'full' }));
  expect(step.item?.skill).toBe('vocabulary');
  const first = step.item!;
  expect(diagnosticStepSchema.parse(await ok('start_diagnostic', { p_path_id: PATH_ID })).item?.id).toBe(first.id);
  expect(await errorOf('answer_diagnostic', { p_attempt_id: step.attempt_id, p_item_id: DIAGNOSTIC_BANK.at(-1)!.id, p_choice: null })).toBe('item_mismatch');
  expect(await errorOf('answer_diagnostic', { p_attempt_id: step.attempt_id, p_item_id: first.id, p_choice: 'nope' })).toBe('invalid_choice');
  step = diagnosticStepSchema.parse(await ok('answer_diagnostic', { p_attempt_id: step.attempt_id, p_item_id: first.id, p_choice: null }));
  expect(await errorOf('answer_diagnostic', { p_attempt_id: step.attempt_id, p_item_id: first.id, p_choice: null })).toBe('already_answered');
  expect(diagnosticStatusSchema.parse(await ok('diagnostic_status', { p_path_id: PATH_ID })).status).toBe('in_progress');

  step = diagnosticStepSchema.parse(await ok('skip_diagnostic_skill', { p_attempt_id: step.attempt_id, p_skill: 'reading', p_reason: 'no_time' }));
  expect(step.progress.skills.find((s) => s.skill === 'reading')?.status).toBe('skipped');
  while (step.item) {
    const right = DIAGNOSTIC_BANK.find((i) => i.id === step.item!.id)!.options.find((o) => o.text === diagnosticCorrectText(step.item!.id))!.id;
    step = diagnosticStepSchema.parse(await ok('answer_diagnostic', { p_attempt_id: step.attempt_id, p_item_id: step.item.id, p_choice: right }));
  }
  expect(step.done).toBe(true);
  const report = diagnosticReportSchema.parse(await ok('finish_diagnostic', { p_attempt_id: step.attempt_id }));
  expect(report.skills.map((s) => s.status)).toEqual(['estimated', 'estimated', 'skipped', 'not_supported', 'not_supported', 'not_supported']);
  expect(report).toMatchObject({ current_level: 'a1', capped_level: 'b1' });
  expect(diagnosticReportSchema.parse(await ok('finish_diagnostic', { p_attempt_id: step.attempt_id })).completed_at).toBe(report.completed_at);
  expect(placementResultSchema.parse(await ok('accept_diagnostic_placement', { p_attempt_id: step.attempt_id }))).toMatchObject({ outcome: 'applied', new_level: 'b1' });
  expect(await errorOf('accept_diagnostic_placement', { p_attempt_id: step.attempt_id })).toBe('already_applied');
  expect(diagnosticStatusSchema.parse(await ok('diagnostic_status', { p_path_id: PATH_ID }))).toMatchObject({ status: 'completed', can_start: false });
  expect(await errorOf('start_diagnostic', { p_path_id: PATH_ID })).toBe('diagnostic_cooldown');
});
