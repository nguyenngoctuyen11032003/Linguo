import { useEffect } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REPORT_REASON_LABELS_VI, REPORT_REASONS } from '@linguo/shared';
import { REPORT_EXERCISE_ID, reportResultFixture } from '@/features/content-reports/content-report-fixtures';
import { renderExercise } from '../exercise/test-utils';
import { ReportContentButton } from './ReportContentButton';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } as unknown };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));

beforeEach(() => {
  mocks.rpc.mockResolvedValue({ data: reportResultFixture(), error: null });
});
afterEach(() => {
  mocks.rpc.mockReset();
});

function renderButton(onReported = vi.fn()) {
  renderExercise(<ReportContentButton targetKind="exercise" targetId={REPORT_EXERCISE_ID} onReported={onReported} />);
  return onReported;
}

const dialog = () => screen.getByRole('dialog', { name: 'Báo lỗi nội dung' });

describe('ReportContentButton', () => {
  it('has an accessible name and does not take focus by itself', () => {
    renderButton();
    const button = screen.getByRole('button', { name: 'Báo lỗi nội dung' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).not.toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a modal dialog with every reason from the contract and focuses the first one', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Báo lỗi nội dung' }));
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    const group = within(dialog()).getByRole('radiogroup', { name: 'Nội dung có vấn đề gì?' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.textContent?.replace(/^\d+/, ''))).toEqual(REPORT_REASONS.map((r) => REPORT_REASON_LABELS_VI[r]));
    expect(radios[0]).toHaveFocus();
    expect(within(dialog()).getByRole('button', { name: 'Gửi báo lỗi' })).toBeDisabled();
  });

  it('sends the reason and note, then thanks the learner', async () => {
    const onReported = renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Báo lỗi nội dung' }));
    await userEvent.click(within(dialog()).getByRole('radio', { name: /Đáp án sai/ }));
    const note = within(dialog()).getByLabelText('Ghi chú (không bắt buộc)');
    await userEvent.type(note, 'Phải là am');
    expect(within(dialog()).getByText('10/500')).toBeInTheDocument();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Gửi báo lỗi' }));

    expect(await within(dialog()).findByText('Cảm ơn bạn! Linguo sẽ xem lại nội dung này.')).toBeInTheDocument();
    expect(within(dialog()).queryByText(/vừa được báo lỗi gần đây/)).not.toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith('report_content', {
      p_target_kind: 'exercise',
      p_target_id: REPORT_EXERCISE_ID,
      p_reason: 'wrong_answer',
      p_note: 'Phải là am',
    });
    expect(onReported).toHaveBeenCalledWith('open');
    const close = within(dialog()).getByRole('button', { name: 'Đóng' });
    await waitFor(() => expect(close).toHaveFocus());
    await userEvent.click(close);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Báo lỗi nội dung' })).toHaveFocus();
  });

  it('mentions a recent duplicate report', async () => {
    mocks.rpc.mockResolvedValue({ data: reportResultFixture({ status: 'duplicate' }), error: null });
    const onReported = renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Báo lỗi nội dung' }));
    await userEvent.click(within(dialog()).getByRole('radio', { name: /Lỗi chính tả/ }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Gửi báo lỗi' }));
    expect(await within(dialog()).findByText('Cảm ơn bạn! Linguo sẽ xem lại nội dung này.')).toBeInTheDocument();
    expect(within(dialog()).getByText(/vừa được báo lỗi gần đây/)).toBeInTheDocument();
    expect(onReported).toHaveBeenCalledWith('duplicate');
  });

  it('caps the note at 500 characters with a live counter', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Báo lỗi nội dung' }));
    const note = within(dialog()).getByLabelText('Ghi chú (không bắt buộc)');
    expect(note).toHaveAttribute('maxLength', '500');
    await userEvent.click(note);
    await userEvent.paste('x'.repeat(520));
    expect(note).toHaveValue('x'.repeat(500));
    const counter = within(dialog()).getByText('500/500');
    expect(note.getAttribute('aria-describedby')).toBe(counter.id);
    expect(counter).toHaveClass('text-error-text');
  });

  it('keeps the dialog open with the rate-limit message', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'rate_limited', code: 'P0001' } });
    const onReported = renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Báo lỗi nội dung' }));
    await userEvent.click(within(dialog()).getByRole('radio', { name: /Lỗi khác/ }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Gửi báo lỗi' }));
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Bạn đã gửi nhiều báo lỗi hôm nay, thử lại vào ngày mai nhé');
    expect(within(dialog()).getByRole('radio', { name: /Lỗi khác/ })).toHaveAttribute('aria-checked', 'true');
    expect(onReported).not.toHaveBeenCalled();
  });

  it('cancels with the button or Escape, resets the form and returns focus', async () => {
    renderButton();
    const trigger = screen.getByRole('button', { name: 'Báo lỗi nội dung' });
    await userEvent.click(trigger);
    await userEvent.click(within(dialog()).getByRole('radio', { name: /Lỗi âm thanh/ }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await userEvent.click(trigger);
    expect(within(dialog()).getByRole('radio', { name: /Lỗi âm thanh/ })).toHaveAttribute('aria-checked', 'false');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('traps Tab inside the dialog', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Báo lỗi nội dung' }));
    await userEvent.click(within(dialog()).getByRole('radio', { name: /Đáp án sai/ }));
    const cancel = within(dialog()).getByRole('button', { name: 'Huỷ' });
    cancel.focus();
    await userEvent.tab();
    expect(within(dialog()).getByRole('radio', { name: /Đáp án sai/ })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(cancel).toHaveFocus();
  });

  it('keeps keys pressed in the dialog away from page shortcuts', async () => {
    const pageKeys = vi.fn();
    function PageShortcuts() {
      useEffect(() => {
        const onKey = (e: KeyboardEvent) => pageKeys(e.key);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, []);
      return null;
    }
    renderExercise(
      <>
        <PageShortcuts />
        <ReportContentButton targetKind="exercise" targetId={REPORT_EXERCISE_ID} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Báo lỗi nội dung' }));
    await userEvent.keyboard('1p ');
    await userEvent.keyboard('{ArrowDown}');
    expect(pageKeys).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole('radio', { name: /Đề bài khó hiểu/ })).toHaveAttribute('aria-checked', 'true');
  });
});
