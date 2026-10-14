import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { CONTACT_EMAIL } from '@/features/account/retention';
import { LegalPage } from './LegalPage';

function renderPage(kind: 'privacy' | 'terms') {
  render(
    <MemoryRouter>
      <LegalPage kind={kind} />
    </MemoryRouter>,
  );
}

describe('LegalPage', () => {
  it('privacy: data collected, what Gemini receives, retention, export/delete and contact', () => {
    renderPage('privacy');
    expect(screen.getByRole('heading', { level: 1, name: 'Quyền riêng tư' })).toBeInTheDocument();
    for (const heading of ['Dữ liệu chúng tôi thu thập', 'Mục đích sử dụng', 'Gia sư AI và Gemini', 'Thời hạn lưu', 'Xuất và xoá dữ liệu', 'Liên hệ']) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText(/Tiến độ học:/)).toBeInTheDocument();
    expect(screen.getByText(/Lượt dùng AI: chỉ siêu dữ liệu/)).toBeInTheDocument();
    expect(screen.getByText(/không gửi tên, email hay lịch sử học/)).toBeInTheDocument();
    expect(screen.getByText(/Linguo không lưu nội dung câu hỏi bạn gửi cho AI/)).toBeInTheDocument();
    expect(screen.getByText(/Nhật ký lượt dùng AI tự xoá sau 90 ngày/)).toBeInTheDocument();
    expect(screen.getByText(/Hộp thông báo nhắc học tự xoá sau 90 ngày/)).toBeInTheDocument();
    expect(screen.getByText(/hết hạn sau 30 ngày/)).toBeInTheDocument();
    expect(screen.getByText(/tải toàn bộ dữ liệu của mình dưới dạng tệp JSON/)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(CONTACT_EMAIL.replace('.', '\\.')))).toBeInTheDocument();
    expect(screen.queryByText(/Bản nháp/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem Điều khoản sử dụng' })).toHaveAttribute('href', '/dieu-khoan');
    expect(screen.getByRole('link', { name: 'Trang chủ' })).toHaveAttribute('href', '/');
  });

  it('terms: AI output is a learning suggestion and liability is limited', () => {
    renderPage('terms');
    expect(screen.getByRole('heading', { level: 1, name: 'Điều khoản sử dụng' })).toBeInTheDocument();
    expect(screen.getByText(/là gợi ý học tập, không phải đáp án chính thức/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Giới hạn trách nhiệm' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem Quyền riêng tư' })).toHaveAttribute('href', '/quyen-rieng-tu');
  });
});
