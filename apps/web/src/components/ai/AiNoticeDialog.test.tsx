import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../tests/unit/render';
import { AiNoticeDialog } from './AiNoticeDialog';

function renderNotice(props: Partial<Parameters<typeof AiNoticeDialog>[0]> = {}) {
  const onAccept = vi.fn().mockResolvedValue(true);
  const onClose = vi.fn();
  renderWithProviders(<AiNoticeDialog open onAccept={onAccept} onClose={onClose} {...props} />);
  return { onAccept, onClose, dialog: screen.getByRole('alertdialog') };
}

describe('AiNoticeDialog', () => {
  it('speaks about the tutor and questions by default', () => {
    const { dialog } = renderNotice();
    expect(dialog).toHaveAccessibleName(/Trước khi dùng Gia sư AI/);
    expect(dialog).toHaveTextContent('Câu hỏi của bạn được gửi tới Google Gemini');
    expect(dialog).not.toHaveTextContent('Đối tác AI');
  });

  it('speaks about the role-play partner and messages in the roleplay context', () => {
    const { dialog } = renderNotice({ context: 'roleplay' });
    expect(dialog).toHaveAccessibleName(/Trước khi trò chuyện với Đối tác AI/);
    expect(dialog).toHaveAccessibleDescription(/Đối tác AI có thể nói sai/);
    expect(dialog).toHaveTextContent('Tin nhắn của bạn được gửi tới Google Gemini');
    expect(dialog).not.toHaveTextContent('Gia sư AI');
    expect(dialog).not.toHaveTextContent('Câu hỏi của bạn');
  });

  it('starts focus on the title, not on the privacy link', () => {
    const { dialog } = renderNotice({ context: 'roleplay' });
    expect(within(dialog).getByText('Trước khi trò chuyện với Đối tác AI')).toHaveFocus();
    expect(within(dialog).getByRole('link', { name: 'Chính sách quyền riêng tư' })).not.toHaveFocus();
  });

  it('keeps the answer buttons in a sticky footer and still traps Tab inside', async () => {
    const { dialog, onAccept } = renderNotice();
    const actions = within(dialog).getByTestId('ai-notice-actions');
    expect(actions).toHaveClass('sticky');
    expect(within(actions).getByRole('button', { name: 'Tôi đã hiểu, tiếp tục' })).toBeInTheDocument();
    await userEvent.tab();
    expect(within(dialog).getByRole('link', { name: 'Chính sách quyền riêng tư' })).toHaveFocus();
    await userEvent.click(within(actions).getByRole('button', { name: 'Tôi đã hiểu, tiếp tục' }));
    expect(onAccept).toHaveBeenCalled();
  });
});
