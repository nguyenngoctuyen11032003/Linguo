import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../tests/unit/render';
import { AiPrivacySection } from './AiPrivacySection';

const mocks = vi.hoisted(() => ({ maybeSingle: vi.fn(), from: vi.fn(), eq: vi.fn() }));

vi.mock('@/lib/supabase', () => {
  const client = {
    from: (table: string) => {
      mocks.from(table);
      return { select: () => ({ eq: (col: string, value: string) => (mocks.eq(col, value), { maybeSingle: mocks.maybeSingle }) }) };
    },
  };
  return { getSupabase: () => client, requireSupabase: () => client };
});

beforeEach(() => {
  mocks.from.mockReset();
  mocks.eq.mockReset();
  mocks.maybeSingle.mockReset();
});

describe('AiPrivacySection', () => {
  it('explains what the AI tutor sends to Gemini free tier', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { theme: 'system', ai_notice_ack_at: null }, error: null });
    renderWithProviders(<AiPrivacySection />, { route: '/app/cai-dat' });
    expect(screen.getByRole('heading', { level: 2, name: 'AI và quyền riêng tư' })).toBeInTheDocument();
    expect(screen.getByText(/Gemini của Google ở gói miễn phí/)).toBeInTheDocument();
    expect(screen.getByText(/Không gửi tên, email hay lịch sử học/)).toBeInTheDocument();
    expect(screen.getByText(/Đừng nhập\s+thông tin cá nhân/)).toBeInTheDocument();
    expect(await screen.findByText('Bạn sẽ thấy thông báo này trước lần đầu dùng Giải thích AI.')).toBeInTheDocument();
    expect(mocks.from).toHaveBeenCalledWith('user_preferences');
  });

  it('shows the acknowledged date in the learner time zone', async () => {
    // 20:00 UTC on 12 Oct is 13 Oct in Asia/Ho_Chi_Minh (the test profile).
    mocks.maybeSingle.mockResolvedValue({ data: { ai_notice_ack_at: '2026-10-12T20:00:00Z' }, error: null });
    renderWithProviders(<AiPrivacySection />, { route: '/app/cai-dat' });
    expect(await screen.findByText('Bạn đã xác nhận thông báo này ngày 13/10/2026.')).toBeInTheDocument();
  });

  it('still explains the policy when the date cannot load', async () => {
    mocks.maybeSingle.mockRejectedValue(new Error('offline'));
    renderWithProviders(<AiPrivacySection />, { route: '/app/cai-dat' });
    expect(screen.getByText(/Gemini của Google/)).toBeInTheDocument();
    await Promise.resolve();
    expect(screen.queryByTestId('ai-notice-ack')).not.toBeInTheDocument();
  });
});
