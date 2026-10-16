import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../tests/unit/render';
import { DiagnosticPage } from './DiagnosticPage';
import { DiagnosticReportPage } from './DiagnosticReportPage';
import { ITEM, makeRun, PATH_ID, PROGRESS, READING_ITEM, REPORT, type DiagnosticRunApi } from './diagnostic-fixtures';
import { levelLabel, missingReason, rangeLabel } from './labels';

const mocks = vi.hoisted(() => ({
  run: null as DiagnosticRunApi | null,
  useDiagnosticRun: vi.fn(),
  listeners: new Set<() => void>(),
  track: vi.fn(),
}));

vi.mock('@/features/analytics', () => ({ track: mocks.track }));

vi.mock('@/features/diagnostic/useDiagnosticRun', async () => {
  const { useSyncExternalStore } = await import('react');
  const subscribe = (listener: () => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  };
  return {
    useDiagnosticRun: (pathId: string, options?: unknown) => {
      mocks.useDiagnosticRun(pathId, options);
      return useSyncExternalStore(subscribe, () => mocks.run);
    },
  };
});

/** Simulates the hook moving on (e.g. the server served the next question). */
function setRun(run: DiagnosticRunApi) {
  act(() => {
    mocks.run = run;
    mocks.listeners.forEach((listener) => listener());
  });
}

function renderAt(run: DiagnosticRunApi, route = `/app/kiem-tra/${PATH_ID}`, paths?: Parameters<typeof renderWithProviders>[1]) {
  mocks.run = run;
  return renderWithProviders(
    <Routes>
      <Route path="/app/kiem-tra/:pathId" element={<DiagnosticPage />} />
      <Route path="/app/kiem-tra/:pathId/ket-qua" element={<DiagnosticReportPage />} />
      <Route path="*" element={null} />
    </Routes>,
    { route, ...paths },
  );
}

const location = () => screen.getByTestId('location').textContent;

beforeEach(() => {
  mocks.useDiagnosticRun.mockReset();
  mocks.track.mockReset();
});

describe('DiagnosticPage — intro', () => {
  it('explains the adaptive test honestly and starts on demand', async () => {
    const run = makeRun({ status: 'intro', mode: null, item: null, progress: null, resumable: false });
    renderAt(run);
    expect(mocks.useDiagnosticRun).toHaveBeenCalledWith(PATH_ID, { mode: 'full' });
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Kiểm tra trình độ',
    });
    expect(heading).toHaveFocus();
    expect(screen.getByText('Câu hỏi sẽ dễ hoặc khó hơn tùy câu trả lời — sai là bình thường.')).toBeInTheDocument();
    expect(screen.getByText(/Khoảng 12 phút, không tính giờ/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu' }));
    expect(run.start).toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith('diagnostic_started', { mode: 'full', resumed: false });
    await userEvent.click(screen.getByRole('link', { name: 'Để sau' }));
    expect(location()).toBe('/app');
  });

  it('asks for a foundation attempt from the query and uses the short copy', () => {
    renderAt(
      makeRun({ status: 'intro', mode: null, item: null, progress: null, resumable: false }),
      `/app/kiem-tra/${PATH_ID}?che-do=nen-tang`,
    );
    expect(mocks.useDiagnosticRun).toHaveBeenCalledWith(PATH_ID, { mode: 'foundation' });
    expect(screen.getByRole('heading', { level: 1, name: 'Kiểm tra nền tảng' })).toBeInTheDocument();
    expect(screen.getByText(/Khoảng 2–3 phút/)).toBeInTheDocument();
  });

  it('offers to continue an attempt in progress in its own mode', async () => {
    const run = makeRun({ status: 'intro', mode: 'foundation', item: null, progress: null, resumable: true });
    renderAt(run);
    expect(screen.getByRole('heading', { level: 1, name: 'Kiểm tra nền tảng' })).toBeInTheDocument();
    expect(screen.getByText(/Bạn đang làm dở bài kiểm tra/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Làm tiếp' }));
    expect(run.start).toHaveBeenCalled();
  });

  it('shows when a retake is allowed', () => {
    renderAt(makeRun({ status: 'intro', item: null, progress: null, resumable: false, retakeAfter: '2026-10-27T03:00:00Z' }));
    expect(screen.getByText(/Bạn có thể làm lại bài kiểm tra từ ngày 27\/10\/2026/)).toBeInTheDocument();
  });

  it('offers no start that would only hit the cooldown while the retake date is ahead', async () => {
    const retakeAfter = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const run = makeRun({ status: 'intro', mode: null, item: null, progress: null, resumable: false, retakeAfter });
    renderAt(run);
    expect(screen.getByText(/Bạn có thể làm lại bài kiểm tra từ ngày/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bắt đầu' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Về trang chủ' }));
    expect(location()).toBe('/app');
    expect(run.start).not.toHaveBeenCalled();
  });

  it('keeps the foundation check available: the retake date is the full test’s', () => {
    const retakeAfter = new Date(Date.now() + 5 * 86_400_000).toISOString();
    renderAt(
      makeRun({ status: 'intro', mode: null, item: null, progress: null, resumable: false, retakeAfter }),
      `/app/kiem-tra/${PATH_ID}?che-do=nen-tang`,
    );
    expect(screen.queryByText(/Bạn có thể làm lại bài kiểm tra từ ngày/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bắt đầu' })).toBeEnabled();
  });
});

describe('DiagnosticPage — question', () => {
  it('renders one question with language tags and focuses its heading', () => {
    renderAt(makeRun());
    expect(screen.getByRole('heading', { level: 1, name: 'Từ vựng' })).toHaveFocus();
    expect(screen.getByText(ITEM.prompt.stem)).toHaveAttribute('lang', 'vi');
    const group = screen.getByRole('radiogroup', { name: ITEM.prompt.stem });
    const radios = within(group).getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(within(group).getByText('apple')).toHaveAttribute('lang', 'en');
  });

  it('keeps small-screen layout: stacked footer buttons and untruncated skill labels', () => {
    renderAt(makeRun());
    const footerRow = screen.getByRole('button', { name: 'Tôi không biết' }).parentElement!;
    expect(footerRow).toHaveClass('flex-col-reverse', 'min-[360px]:flex-row');
    const progress = screen.getByRole('list', { name: 'Tiến độ theo kỹ năng' });
    for (const label of within(progress).getAllByText(/Từ vựng|Ngữ pháp|Đọc hiểu/)) {
      expect(label.closest('p')).not.toHaveClass('truncate');
      expect(label).not.toHaveClass('truncate');
    }
  });

  it('lets the learner report the question on screen', () => {
    renderAt(makeRun());
    expect(screen.getByRole('button', { name: 'Báo lỗi nội dung' })).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('submits the chosen option only after a selection', async () => {
    const run = makeRun();
    renderAt(run);
    const next = screen.getByRole('button', { name: 'Tiếp tục' });
    expect(next).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /orange/ }));
    expect(screen.getByRole('radio', { name: /orange/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(next);
    expect(run.answer).toHaveBeenCalledWith('b');
  });

  it('selects with number keys and answers "Tôi không biết" as null', async () => {
    const run = makeRun();
    renderAt(run);
    await userEvent.keyboard('3');
    expect(screen.getByRole('radio', { name: /table/ })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Tôi không biết' }));
    expect(run.answer).toHaveBeenCalledWith(null);
  });

  it('resets the selection and refocuses the heading on the next question', async () => {
    renderAt(makeRun());
    await userEvent.click(screen.getByRole('radio', { name: /orange/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Từ vựng' })).not.toHaveFocus();
    setRun(
      makeRun({
        item: READING_ITEM,
        progress: { ...PROGRESS, near_end: true },
      }),
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Đọc hiểu · Sắp xong' })).toHaveFocus();
    expect(screen.queryByRole('radio', { checked: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled();
  });

  it('shows a reading passage tagged with the path language', () => {
    renderAt(makeRun({ item: READING_ITEM }));
    const passage = screen.getByRole('region', { name: 'Đoạn văn' });
    expect(within(passage).getByText(READING_ITEM.prompt.passage!)).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Where does Tom work?')).toHaveAttribute('lang', 'en');
  });

  it('shows per-skill progress without any question count', () => {
    renderAt(makeRun({ progress: { ...PROGRESS, near_end: true } }));
    const list = screen.getByRole('list', { name: 'Tiến độ theo kỹ năng' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).toHaveTextContent('Từ vựng: đang làm');
    expect(items[1]).toHaveTextContent('Ngữ pháp: chưa làm');
    expect(screen.getByText('Đang kiểm tra từ vựng. Sắp xong.')).toHaveAttribute('aria-live', 'polite');
    expect(document.body.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
  });

  it('disables answering while submitting', () => {
    renderAt(makeRun({ status: 'submitting' }));
    expect(screen.getByRole('button', { name: 'Tôi không biết' })).toBeDisabled();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });

  it('pauses and returns home', async () => {
    const run = makeRun();
    renderAt(run);
    await userEvent.click(screen.getByRole('button', { name: 'Tạm dừng' }));
    expect(run.pause).toHaveBeenCalled();
    await waitFor(() => expect(location()).toBe('/app'));
  });

  it('skips the current skill with a reason', async () => {
    const run = makeRun();
    renderAt(run);
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ qua kỹ năng này' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Bỏ qua phần từ vựng?',
    });
    const confirm = within(dialog).getByRole('button', {
      name: 'Bỏ qua kỹ năng này',
    });
    expect(confirm).toBeDisabled();
    // Number keys pick a reason inside the sheet, not an answer behind it.
    await userEvent.keyboard('2');
    expect(within(dialog).getByRole('radio', { name: /quá khó/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /orange/, hidden: true })).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(confirm);
    expect(run.skip).toHaveBeenCalledWith('vocabulary', 'too_hard');
  });

  it('says the other skills still follow when some are left', async () => {
    renderAt(makeRun());
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ qua kỹ năng này' }));
    expect(await screen.findByRole('dialog')).toHaveAccessibleDescription(/Bạn vẫn làm tiếp các phần còn lại\.$/);
  });

  it('says the test ends when the last skill is skipped', async () => {
    const progress = {
      ...PROGRESS,
      skills: [
        { skill: 'vocabulary' as const, status: 'active' as const, fill: 0.4 },
        { skill: 'grammar' as const, status: 'done' as const, fill: 1 },
        { skill: 'reading' as const, status: 'skipped' as const, fill: 0 },
      ],
    };
    renderAt(makeRun({ progress }));
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ qua kỹ năng này' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleDescription(
      'Kết quả sẽ ghi “chưa đủ dữ liệu” cho kỹ năng này. Đây là phần cuối nên bài kiểm tra sẽ kết thúc và bạn xem kết quả ngay.',
    );
    expect(within(dialog).queryByText(/các phần còn lại/)).toBeNull();
  });

  it('closes the skip sheet without skipping', async () => {
    const run = makeRun();
    renderAt(run);
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ qua kỹ năng này' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Tiếp tục làm bài' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(run.skip).not.toHaveBeenCalled();
  });
});

describe('DiagnosticPage — other states', () => {
  it('shows a finishing status while the report is computed', () => {
    renderAt(makeRun({ status: 'finishing', item: null }));
    expect(screen.getByText('Đang tính kết quả…').closest('[role="status"]')).not.toBeNull();
  });

  it('shows the error with a retry', async () => {
    const run = makeRun({
      status: 'error',
      item: null,
      error: 'Bạn có thể làm lại bài kiểm tra sau 14 ngày.',
    });
    renderAt(run);
    expect(screen.getByRole('alert')).toHaveTextContent('Bạn có thể làm lại bài kiểm tra sau 14 ngày.');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(run.retry).toHaveBeenCalled();
  });

  it('records a completion only when the test was answered here', async () => {
    renderAt(makeRun({ status: 'question' }));
    setRun(makeRun({ status: 'finishing', item: null }));
    expect(mocks.track).not.toHaveBeenCalled();
    setRun(makeRun({ status: 'report', item: null, report: REPORT }));
    await waitFor(() => expect(location()).toBe(`/app/kiem-tra/${PATH_ID}/ket-qua`));
    expect(mocks.track).toHaveBeenCalledTimes(1);
    expect(mocks.track).toHaveBeenCalledWith('diagnostic_completed', { mode: REPORT.mode });
  });

  it('moves to the report route when the test is done', async () => {
    renderAt(makeRun({ status: 'report', item: null, report: REPORT }));
    await waitFor(() => expect(location()).toBe(`/app/kiem-tra/${PATH_ID}/ket-qua`));
    expect(mocks.track).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Kết quả kiểm tra',
      }),
    ).toBeInTheDocument();
  });
});

describe('DiagnosticReportPage', () => {
  const reportRoute = `/app/kiem-tra/${PATH_ID}/ket-qua`;

  it('shows all six skills honestly', () => {
    renderAt(makeRun({ status: 'report', item: null, report: REPORT }), reportRoute);
    expect(screen.getByRole('heading', { level: 1, name: 'Kết quả kiểm tra' })).toHaveFocus();
    expect(screen.getByText('Ước lượng sơ bộ, không phải chứng chỉ. Bộ câu hỏi đang thử nghiệm.')).toBeInTheDocument();
    const cards = within(screen.getByRole('region', { name: 'Theo từng kỹ năng' })).getAllByRole('listitem');
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual([
      'Từ vựng',
      'Ngữ pháp',
      'Đọc hiểu',
      'Nghe',
      'Viết',
      'Nói',
    ]);
    expect(cards[0]).toHaveTextContent('B1');
    expect(cards[0]).toHaveTextContent('khoảng A2–B2');
    expect(cards[0]).toHaveTextContent('Độ tin cậy: Cao');
    expect(cards[0]).toHaveTextContent('dựa trên 7 câu');
    expect(cards[1]).toHaveTextContent('Độ tin cậy: Trung bình');
    expect(cards[2]).toHaveTextContent('Chưa đủ dữ liệu');
    expect(cards[2]).toHaveTextContent('Bạn đã bỏ qua kỹ năng này (không đủ thời gian).');
    expect(cards[3]).toHaveTextContent('Bài kiểm tra chưa có phần nghe.');
    expect(cards[4]).toHaveTextContent('Bài trắc nghiệm không đánh giá được kỹ năng này.');
  });

  it('applies the capped level only when the learner accepts', async () => {
    const run = makeRun({
      status: 'report',
      item: null,
      report: { ...REPORT, suggested_level: 'b2', capped_level: 'b1' },
      accept: vi.fn().mockResolvedValue({
        learning_path_id: PATH_ID,
        previous_level: 'a1',
        new_level: 'b1',
        outcome: 'applied',
        estimate: null,
      }),
    });
    renderAt(run, reportRoute);
    expect(mocks.useDiagnosticRun).toHaveBeenCalledWith(PATH_ID, { preferReport: true });
    expect(screen.getByText(/Kết quả kiểm tra ở mức B2, nhưng mỗi lần Linguo chỉ nâng/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Cập nhật trình độ lộ trình thành B1',
      }),
    );
    expect(run.accept).toHaveBeenCalled();
    expect(await screen.findByText(/Đã cập nhật trình độ lộ trình thành B1/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cập nhật trình độ/ })).toBeNull();
  });

  it('shows a report from navigation state while the hook loads, without allowing accept yet', () => {
    mocks.run = makeRun({ status: 'loading', item: null, report: null });
    renderWithProviders(
      <Routes>
        <Route path="/app/kiem-tra/:pathId/ket-qua" element={<DiagnosticReportPage />} />
      </Routes>,
      { route: { pathname: reportRoute, state: { report: REPORT } } as unknown as string },
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Kết quả kiểm tra' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cập nhật trình độ lộ trình thành B1/ })).toBeDisabled();
  });

  it('offers a retry instead of an endless spinner when loading fails under a report from navigation state', async () => {
    mocks.run = makeRun({ status: 'error', item: null, report: null, error: 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.' });
    renderWithProviders(
      <Routes>
        <Route path="/app/kiem-tra/:pathId/ket-qua" element={<DiagnosticReportPage />} />
      </Routes>,
      { route: { pathname: reportRoute, state: { report: REPORT } } as unknown as string },
    );
    const accept = screen.getByRole('button', { name: /Cập nhật trình độ lộ trình thành B1/ });
    expect(accept).toBeDisabled();
    expect(accept).not.toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(mocks.run.retry).toHaveBeenCalled();
  });

  it('does not explain a cap when the suggestion was not capped', () => {
    renderAt(makeRun({ status: 'report', item: null, report: REPORT }), reportRoute);
    expect(
      screen.getByRole('button', {
        name: 'Cập nhật trình độ lộ trình thành B1',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/chỉ nâng trình độ lộ trình/)).toBeNull();
  });

  it('keeps the current level without calling accept', async () => {
    const run = makeRun({ status: 'report', item: null, report: REPORT });
    renderAt(run, reportRoute);
    await userEvent.click(screen.getByRole('button', { name: 'Giữ trình độ hiện tại' }));
    expect(run.accept).not.toHaveBeenCalled();
    expect(location()).toBe('/app');
  });

  it('points to settings when the target must be raised first', async () => {
    const run = makeRun({
      status: 'report',
      item: null,
      report: REPORT,
      accept: vi.fn().mockResolvedValue({
        learning_path_id: PATH_ID,
        previous_level: 'a1',
        new_level: 'a1',
        outcome: 'needs_target_update',
        estimate: null,
      }),
    });
    renderAt(run, reportRoute);
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Cập nhật trình độ lộ trình thành B1',
      }),
    );
    const status = (await screen.findByText(/đã bằng hoặc vượt mục tiêu/)).closest('[role="status"]') as HTMLElement;
    expect(status).toHaveTextContent('đã bằng hoặc vượt mục tiêu B1');
    expect(within(status).getByRole('link', { name: 'Cài đặt lộ trình' })).toHaveAttribute('href', '/app/cai-dat#lo-trinh');
  });

  it('shows an error when accepting fails', async () => {
    const run = makeRun({
      status: 'report',
      item: null,
      report: REPORT,
      accept: vi.fn().mockResolvedValue(null),
    });
    renderAt(run, reportRoute);
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Cập nhật trình độ lộ trình thành B1',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Không cập nhật được trình độ. Hãy thử lại.');
  });

  it('offers no update when there is no suggestion', () => {
    renderAt(
      makeRun({
        status: 'report',
        item: null,
        report: { ...REPORT, suggested_level: null, capped_level: null },
      }),
      reportRoute,
    );
    expect(screen.getByText(/Chưa đủ dữ liệu để gợi ý trình độ lộ trình/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cập nhật trình độ/ })).toBeNull();
  });

  it('says when the result was already applied', () => {
    renderAt(
      makeRun({
        status: 'report',
        item: null,
        report: { ...REPORT, applied_at: '2026-10-13T04:00:00Z' },
      }),
      reportRoute,
    );
    expect(screen.getByText('Kết quả này đã được áp dụng cho lộ trình.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cập nhật trình độ/ })).toBeNull();
  });

  it('mentions early stop and rapid answers', () => {
    renderAt(
      makeRun({
        status: 'report',
        item: null,
        report: { ...REPORT, early_stop: true, rapid_answer_share: 0.5 },
      }),
      reportRoute,
    );
    expect(screen.getByText(/Bài dừng sớm/)).toBeInTheDocument();
    expect(screen.getByText(/độ tin cậy đã được hạ một mức/)).toBeInTheDocument();
  });

  it('invites to take the test when there is no report', async () => {
    renderAt(makeRun({ status: 'intro', item: null, report: null }), reportRoute);
    expect(screen.getByRole('heading', { level: 1, name: 'Chưa có kết quả' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Làm bài kiểm tra' }));
    expect(location()).toBe(`/app/kiem-tra/${PATH_ID}`);
  });
});

describe('labels', () => {
  it('maps level codes, ranges and missing reasons', () => {
    expect(levelLabel('topik1')).toBe('TOPIK 1');
    expect(levelLabel('pre_a1')).toBe('Mới bắt đầu');
    expect(levelLabel('zz')).toBe('zz');
    expect(levelLabel(null)).toBe('—');
    expect(rangeLabel({ low: 'a2', high: 'a2' })).toBe('A2');
    expect(rangeLabel(null)).toBeNull();
    expect(
      missingReason({
        ...REPORT.skills[0]!,
        status: 'insufficient',
        level_code: null,
        sample_size: 0,
      }),
    ).toBe('Bạn chưa trả lời câu nào của kỹ năng này.');
    expect(missingReason({ ...REPORT.skills[2]!, reason: null })).toBe('Bạn đã bỏ qua kỹ năng này.');
  });
});
