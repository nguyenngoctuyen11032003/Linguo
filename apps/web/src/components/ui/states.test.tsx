import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Hourglass } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { OfflineBanner } from './OfflineBanner';
import { ToastProvider, useToast } from './Toast';

describe('EmptyState / ErrorState', () => {
  it('renders title, description and action', () => {
    render(<EmptyState icon={Hourglass} title="Sắp ra mắt" description="Đang xây dựng." action={<button>Về trang chủ</button>} />);
    expect(screen.getByRole('heading', { name: 'Sắp ra mắt' })).toBeInTheDocument();
    expect(screen.getByText('Đang xây dựng.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Về trang chủ' })).toBeInTheDocument();
  });

  it('calls onRetry', async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

function ToastTrigger() {
  const toast = useToast();
  return <button onClick={() => toast.show({ tone: 'success', message: 'Đã lưu thay đổi.' })}>Hiện</button>;
}

describe('Toast', () => {
  afterEach(() => vi.useRealTimers());

  it('announces and auto-dismisses after 4 seconds', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    act(() => screen.getByText('Hiện').click());
    expect(screen.getByRole('status')).toHaveTextContent('Đã lưu thay đổi.');
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByText('Đã lưu thay đổi.')).not.toBeInTheDocument();
  });
});

describe('OfflineBanner', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  it('shows only while offline', () => {
    render(<OfflineBanner />);
    expect(screen.queryByText(/ngoại tuyến/)).not.toBeInTheDocument();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(/ngoại tuyến/)).toBeInTheDocument();
  });
});
