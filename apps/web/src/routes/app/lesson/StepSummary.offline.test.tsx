import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '@/providers/MotionProvider';
import { COMPLETE_RESULT } from './lesson-fixtures';
import { ExitSheet } from './ExitSheet';
import { StepSummary } from './StepSummary';

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

function summary(props: Partial<Parameters<typeof StepSummary>[0]> = {}) {
  return render(
    <StepSummary blocks={[]} result={COMPLETE_RESULT} canComplete pendingCount={0} unresolved={[]} onComplete={vi.fn()} onResume={vi.fn()} {...props} />,
  );
}

afterEach(() => setOnline(true));

describe('StepSummary offline copy', () => {
  it('a result worked out on the device says it is saved and will count when online', () => {
    setOnline(false);
    summary({ pendingCount: 3 });
    expect(screen.getByText('Đã lưu — kết quả và điểm sẽ tính khi có mạng.')).toBeInTheDocument();
  });

  it('back online but not yet synced it says it is syncing', () => {
    summary({ pendingCount: 3 });
    expect(screen.getByText('Đang đồng bộ kết quả lên máy chủ…')).toBeInTheDocument();
  });

  it('a synced result carries no note', () => {
    summary();
    expect(screen.queryByText(/Đã lưu — kết quả/)).toBeNull();
    expect(screen.queryByText(/Đang đồng bộ kết quả/)).toBeNull();
  });

  it('while answers wait offline the wait message says they are kept on the device', () => {
    setOnline(false);
    summary({ result: null, canComplete: false, pendingCount: 2 });
    expect(screen.getByText('Còn 2 câu đã lưu trên máy, sẽ đồng bộ khi có mạng')).toBeInTheDocument();
  });
});

describe('ExitSheet offline copy', () => {
  it('tells the learner the answers are kept on the device', () => {
    setOnline(false);
    render(
      <MotionProvider>
        <ExitSheet open onClose={vi.fn()} onExit={vi.fn()} pendingCount={4} />
      </MotionProvider>,
    );
    expect(screen.getByText('Còn 4 câu đã lưu trên máy — kết quả và điểm sẽ tính khi có mạng.')).toBeInTheDocument();
  });

  it('keeps the original wording while online', () => {
    render(
      <MotionProvider>
        <ExitSheet open onClose={vi.fn()} onExit={vi.fn()} pendingCount={4} />
      </MotionProvider>,
    );
    expect(screen.getByText('Còn 4 câu đang chờ đồng bộ — sẽ được chấm khi có mạng.')).toBeInTheDocument();
  });
});
