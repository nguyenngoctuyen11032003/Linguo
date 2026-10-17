import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OutboxSyncContext, type OutboxSyncContextValue, type SyncStatus } from '@/features/lesson-player/OutboxSyncProvider';
import type { SyncReportEntry } from '@/features/lesson-player/sync-report';
import { SyncStatusChip, syncStatusText } from './SyncStatusChip';

const IDLE: SyncStatus = { pending: 0, failing: false, syncing: false, expiring: 0 };

function renderChip(status: Partial<SyncStatus> = {}, extra: { reports?: SyncReportEntry[]; flushAll?: () => Promise<void>; dismissReport?: (id: string) => void } = {}) {
  const value = {
    status: { ...IDLE, ...status },
    flushAll: extra.flushAll ?? vi.fn().mockResolvedValue(undefined),
    reports: extra.reports ?? [],
    dismissReport: extra.dismissReport ?? vi.fn(),
  } as unknown as OutboxSyncContextValue;
  return render(
    <OutboxSyncContext.Provider value={value}>
      <SyncStatusChip />
    </OutboxSyncContext.Provider>,
  );
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

afterEach(() => setOnline(true));

describe('syncStatusText', () => {
  it('describes what waits, per state', () => {
    expect(syncStatusText(IDLE, true)).toBeNull();
    expect(syncStatusText({ ...IDLE, pending: 3 }, true)).toBe('Đang chờ đồng bộ 3 mục');
    expect(syncStatusText({ ...IDLE, pending: 3, syncing: true }, true)).toBe('Đang đồng bộ 3 mục…');
    expect(syncStatusText({ ...IDLE, pending: 3, failing: true }, true)).toBe('Chưa gửi được 3 mục, sẽ tự thử lại');
    expect(syncStatusText({ ...IDLE, pending: 3, failing: true }, false)).toBe('3 mục sẽ được gửi khi có mạng');
  });
});

describe('SyncStatusChip', () => {
  it('renders nothing when everything is synced', () => {
    renderChip();
    expect(screen.queryByTestId('sync-status')).toBeNull();
  });

  it('renders nothing outside the provider', () => {
    render(<SyncStatusChip />);
    expect(screen.queryByTestId('sync-status')).toBeNull();
  });

  it('shows the pending count and syncs on demand', async () => {
    const flushAll = vi.fn().mockResolvedValue(undefined);
    renderChip({ pending: 4 }, { flushAll });
    expect(screen.getByRole('status')).toHaveTextContent('Đang chờ đồng bộ 4 mục');
    await userEvent.click(screen.getByRole('button', { name: 'Đồng bộ ngay' }));
    expect(flushAll).toHaveBeenCalledTimes(1);
  });

  it('offline: says it will send later and offers no button', () => {
    setOnline(false);
    renderChip({ pending: 2 });
    expect(screen.getByRole('status')).toHaveTextContent('2 mục sẽ được gửi khi có mạng');
    expect(screen.queryByRole('button', { name: 'Đồng bộ ngay' })).toBeNull();
  });

  it('warns about answers close to expiry', () => {
    renderChip({ pending: 2, expiring: 2 });
    expect(screen.getByText(/2 câu sắp hết hạn gửi/)).toBeInTheDocument();
  });

  it('shows the latest dropped-work report until it is dismissed', async () => {
    const dismissReport = vi.fn();
    const reports: SyncReportEntry[] = [
      { id: 'r1', at: '2026-10-20T08:00:00Z', kind: 'review', reason: 'expired', count: 1 },
      { id: 'r2', at: '2026-10-20T09:00:00Z', kind: 'lesson', reason: 'exercise_version_mismatch', count: 3, runId: 'x' },
    ];
    renderChip({}, { reports, dismissReport });
    expect(screen.getByRole('alert')).toHaveTextContent('3 câu trả lời bài học không đồng bộ được: bài tập đã được cập nhật.');
    await userEvent.click(screen.getByRole('button', { name: 'Đã hiểu' }));
    expect(dismissReport).toHaveBeenCalledWith('r2');
  });
});
