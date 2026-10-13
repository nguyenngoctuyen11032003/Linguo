import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LessonRunApi } from '@/features/lesson-player/types';
import { FIXTURE_SESSION_ID } from '@/features/session-link/session-fixtures';
import { renderWithProviders } from '../../../../tests/unit/render';
import { COMPLETE_RESULT, LESSON_ID, makeRun } from './lesson-fixtures';
import { LessonPage } from './LessonPage';

// Spec 6 §4: a lesson opened from the study session (?phien=&muc=) reports the activity and leads back to it.

const mocks = vi.hoisted(() => ({ run: null as LessonRunApi | null, report: vi.fn(), listeners: new Set<() => void>() }));

function setRun(run: LessonRunApi) {
  mocks.run = run;
  mocks.listeners.forEach((l) => l());
}

vi.mock('@/features/lesson-player/useLessonRun', () => ({
  useLessonRun: () =>
    useSyncExternalStore(
      (l) => {
        mocks.listeners.add(l);
        return () => mocks.listeners.delete(l);
      },
      () => mocks.run,
    ),
}));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}), requireSupabase: () => ({}) }));
vi.mock('@/features/session-link/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/session-link/service')>()),
  reportSessionItem: mocks.report,
}));
vi.mock('@/components/exercise', () => ({
  DemoBadge: () => <span>Nội dung demo — chưa kiểm duyệt</span>,
  PendingSyncBadge: () => null,
  ExerciseFrame: () => null,
}));

const SESSION_QUERY = `?phien=${FIXTURE_SESSION_ID}&muc=a2`;

function renderLesson(run: LessonRunApi, search = SESSION_QUERY) {
  mocks.run = run;
  return renderWithProviders(
    <Routes>
      <Route path="/app/hoc-tap/bai/:lessonId" element={<LessonPage />} />
      <Route path="*" element={null} />
    </Routes>,
    { route: `/app/hoc-tap/bai/${LESSON_ID}${search}` },
  );
}

beforeEach(() => {
  mocks.report.mockReset();
  mocks.report.mockResolvedValue(undefined);
});

describe('LessonPage in a study session', () => {
  it('does not report before the lesson is completed', async () => {
    renderLesson(makeRun({ stepIndex: 2 }));
    await act(async () => {});
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('reports the activity done once the lesson is completed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
      const run = makeRun({ stepIndex: 6 });
      renderLesson(run);
      await act(async () => {});
      expect(mocks.report).not.toHaveBeenCalled();
      vi.setSystemTime(new Date('2026-10-13T08:06:30Z'));
      act(() => setRun({ ...run, completeResult: COMPLETE_RESULT, runStatus: 'completed' }));
      await waitFor(() => expect(mocks.report).toHaveBeenCalledTimes(1));
      expect(mocks.report).toHaveBeenCalledWith({}, { sessionId: FIXTURE_SESSION_ID, itemId: 'a2', status: 'done', seconds: 390 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('makes "Quay lại phiên học" the main action and keeps "Về trang chủ"', async () => {
    renderLesson(makeRun({ stepIndex: 7, completeResult: COMPLETE_RESULT }));
    await waitFor(() => expect(mocks.report).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Về trang chủ' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Quay lại phiên học' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/phien-hoc$/));
    // Already saved: going back does not report twice.
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it('still returns to the session when reporting fails, after one more try', async () => {
    mocks.report.mockRejectedValue(new TypeError('Failed to fetch'));
    renderLesson(makeRun({ stepIndex: 7, completeResult: COMPLETE_RESULT }));
    await waitFor(() => expect(mocks.report).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole('button', { name: 'Quay lại phiên học' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/phien-hoc$/));
    expect(mocks.report).toHaveBeenCalledTimes(2);
  });

  it('leaves to the session page from the exit sheet', async () => {
    localStorage.setItem('linguo-reduce-motion', 'true');
    renderLesson(makeRun({ stepIndex: 2 }));
    await userEvent.click(screen.getByRole('button', { name: 'Thoát bài học' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Thoát' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/phien-hoc$/);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('behaves as before without the session params', async () => {
    renderLesson(makeRun({ stepIndex: 7, completeResult: COMPLETE_RESULT }), '');
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Quay lại phiên học' })).not.toBeInTheDocument();
    expect(mocks.report).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Về trang chủ' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/app$/);
  });

  it('ignores a malformed session link', async () => {
    renderLesson(makeRun({ stepIndex: 7, completeResult: COMPLETE_RESULT }), '?phien=abc&muc=a2');
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Quay lại phiên học' })).not.toBeInTheDocument();
    expect(mocks.report).not.toHaveBeenCalled();
  });
});
