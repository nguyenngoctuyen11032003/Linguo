import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INERT_OFFLINE_CONTENT, OfflineContentContext, type OfflineContentValue } from '@/features/offline/offline-context';
import { renderWithProviders } from '../../../../tests/unit/render';
import { pathLesson } from '../lesson/lesson-fixtures';
import { formatBytes } from './offline-format';
import { DownloadControl, LessonOfflineTag, SavedListNotice } from './OfflineControls';

const A = pathLesson({ lesson_id: '20000000-0000-4000-8000-00000000000a', title: { vi: 'Bài A' } });
const B = pathLesson({ lesson_id: '20000000-0000-4000-8000-00000000000b', title: { vi: 'Bài B' } });

function value(overrides: Partial<OfflineContentValue> = {}): OfflineContentValue {
  return {
    ...INERT_OFFLINE_CONTENT,
    ready: true,
    persistent: true,
    isDownloaded: () => false,
    estimateBytes: (count) => count * 1024 * 1024,
    download: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(1),
    ...overrides,
  };
}

const withOffline = (v: OfflineContentValue, ui: ReactNode) => renderWithProviders(<OfflineContentContext.Provider value={v}>{ui}</OfflineContentContext.Provider>);
const setOnline = (on: boolean) => {
  Object.defineProperty(navigator, 'onLine', { value: on, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(on ? 'online' : 'offline'));
  });
};
afterEach(() => setOnline(true));

describe('formatBytes', () => {
  it('uses MB with a decimal comma and KB below 1 MB', () => {
    expect(formatBytes(12.4 * 1024 * 1024)).toBe('12,4 MB');
    expect(formatBytes(850 * 1024)).toBe('850 KB');
    expect(formatBytes(10)).toBe('1 KB');
  });
});

describe('DownloadControl', () => {
  it('quotes the size and downloads only the lessons that are not on the device yet', async () => {
    const v = value({ isDownloaded: (id) => id === A.lesson_id });
    withOffline(v, <DownloadControl scope="unit:1" kind="unit" lessons={[A, B]} label="Tải về học offline" />);
    expect(screen.getByText(/1\/2 bài chưa tải · khoảng 1,0 MB/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Tải về học offline/ }));
    expect(v.download).toHaveBeenCalledWith({ kind: 'unit', scope: 'unit:1', lessonIds: [B.lesson_id] });
  });

  it('is disabled with a reason offline', () => {
    setOnline(false);
    withOffline(value(), <DownloadControl scope="path" kind="path" lessons={[A]} label="Tải cả lộ trình" />);
    expect(screen.getByRole('button', { name: /Tải cả lộ trình/ })).toBeDisabled();
    expect(screen.getByText('Cần mạng để tải')).toBeInTheDocument();
  });

  it('shows progress with a stop button only for its own job, then the outcome', async () => {
    const cancel = vi.fn();
    const job = { id: 1, kind: 'path' as const, scope: 'path', auto: false, running: true, total: 4, done: 1, failed: 0, bytes: 0 };
    const view = withOffline(value({ job, cancel }), <DownloadControl scope="path" kind="path" lessons={[A, B]} label="Tải cả lộ trình" />);
    expect(screen.getByRole('progressbar', { name: 'Tiến độ tải bài học' })).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('Đang tải 1/4 bài…')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dừng' }));
    expect(cancel).toHaveBeenCalled();
    view.unmount();
    withOffline(value({ job: { ...job, running: false, outcome: 'quota' } }), <DownloadControl scope="path" kind="path" lessons={[A, B]} label="Tải cả lộ trình" />);
    expect(screen.getByText(/Bộ nhớ thiết bị đã đầy/)).toBeInTheDocument();
  });

  it('offers removal once everything is on the device', async () => {
    const v = value({ isDownloaded: () => true });
    withOffline(v, <DownloadControl scope="path" kind="path" lessons={[A, B]} label="Tải cả lộ trình" />);
    expect(screen.getByText('2 bài đã có trên máy, học được khi ngoại tuyến.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Xoá 2 bài đã tải' }));
    expect(v.remove).toHaveBeenCalledWith([A.lesson_id, B.lesson_id]);
  });

  it('renders nothing when the device cannot keep downloads or there are no lessons', () => {
    const view = withOffline(value({ persistent: false }), <DownloadControl scope="path" kind="path" lessons={[A]} label="Tải cả lộ trình" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    view.unmount();
    withOffline(value(), <DownloadControl scope="path" kind="path" lessons={[]} label="Tải cả lộ trình" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('LessonOfflineTag and SavedListNotice', () => {
  it('tags downloaded lessons, and the undownloaded ones "Cần mạng" while offline', () => {
    const v = value({ isDownloaded: (id) => id === A.lesson_id });
    withOffline(
      v,
      <>
        <LessonOfflineTag lesson={A} />
        <LessonOfflineTag lesson={B} />
      </>,
    );
    expect(screen.getByText('Đã tải về máy')).toBeInTheDocument();
    expect(screen.queryByText('Cần mạng')).not.toBeInTheDocument();
    setOnline(false);
    expect(screen.getByText('Cần mạng')).toBeInTheDocument();
  });

  it('explains that the list is the saved copy', () => {
    setOnline(false);
    const view = renderWithProviders(<SavedListNotice fromCache />);
    expect(screen.getByText(/đang hiển thị danh sách bài đã lưu trên máy/)).toBeInTheDocument();
    view.unmount();
    renderWithProviders(<SavedListNotice fromCache={false} />);
    expect(screen.queryByText(/đã lưu trên máy/)).not.toBeInTheDocument();
  });
});
