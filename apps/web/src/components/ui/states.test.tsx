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

  it('announces as an alert and supports a custom heading level', () => {
    render(<ErrorState headingLevel="h3" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Không tải được dữ liệu' })).toBeInTheDocument();
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

  it('removes a toast with its close button', async () => {
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByText('Hiện'));
    expect(screen.getByText('Đã lưu thay đổi.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' }));
    expect(screen.queryByText('Đã lưu thay đổi.')).not.toBeInTheDocument();
  });

  it('expires toasts independently: errors last 8s, others 4s', () => {
    vi.useFakeTimers();
    function Both() {
      const toast = useToast();
      return (
        <>
          <button onClick={() => toast.show({ tone: 'error', message: 'Có lỗi.' })}>Lỗi</button>
          <button onClick={() => toast.show({ tone: 'info', message: 'Thông tin.' })}>Tin</button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Both />
      </ToastProvider>,
    );
    act(() => screen.getByText('Lỗi').click());
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => screen.getByText('Tin').click());
    expect(screen.getAllByRole('button', { name: 'Đóng thông báo' })).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(4100); // t=6.1s: info (4s) gone, error (8s) still here
    });
    expect(screen.queryByText('Thông tin.')).not.toBeInTheDocument();
    expect(screen.getByText('Có lỗi.')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2000); // t=8.1s
    });
    expect(screen.queryByText('Có lỗi.')).not.toBeInTheDocument();
  });

  it('clears pending timers on unmount', () => {
    vi.useFakeTimers();
    const { unmount } = render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    act(() => screen.getByText('Hiện').click());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('OfflineBanner', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  it('shows only while offline and hides again when back online', () => {
    render(<OfflineBanner />);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    expect(screen.queryByText(/ngoại tuyến/)).not.toBeInTheDocument();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByText(/ngoại tuyến/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toBe(region);
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText(/ngoại tuyến/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
