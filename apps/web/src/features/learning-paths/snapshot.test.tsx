import { act, render, screen, waitFor } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeClient, fakeQuery } from '../../../tests/unit/fake-supabase';
import { pathRow, TEST_PATH } from '../../../tests/unit/learning-fixtures';
import { AuthContext } from '../auth/AuthProvider';
import { LearningPathsProvider, useLearningPaths } from './LearningPathsProvider';
import { readPathsSnapshot, writePathsSnapshot } from './snapshot';

const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));

const NETWORK = { message: 'TypeError: Failed to fetch', code: '' };

function Probe() {
  const ctx = useLearningPaths();
  return <span data-testid="s">{`${ctx.status}:${ctx.paths.length}:${ctx.current?.id ?? '-'}:${ctx.fromCache ? 'cache' : 'fresh'}`}</span>;
}

const renderFor = (userId = 'u1') =>
  render(
    <AuthContext.Provider value={{ status: 'signed-in', session: null, user: { id: userId } as User }}>
      <LearningPathsProvider>
        <Probe />
      </LearningPathsProvider>
    </AuthContext.Provider>,
  );

afterEach(() => {
  mocks.client = null;
  vi.restoreAllMocks();
});

describe('learning paths snapshot', () => {
  it('round-trips a path and never keeps an empty list', () => {
    writePathsSnapshot('u1', { paths: [TEST_PATH], currentId: TEST_PATH.id });
    expect(readPathsSnapshot('u1')).toEqual({ paths: [TEST_PATH], currentId: TEST_PATH.id });
    expect(readPathsSnapshot('u2')).toBeNull();
    writePathsSnapshot('u1', { paths: [], currentId: null });
    expect(readPathsSnapshot('u1')).toBeNull();
  });

  it('ignores an empty or malformed stored snapshot', () => {
    localStorage.setItem('linguo-snap-v1:learning-paths:u1', JSON.stringify({ savedAt: 1, data: { paths: [], currentId: null } }));
    expect(readPathsSnapshot('u1')).toBeNull();
    localStorage.setItem('linguo-snap-v1:learning-paths:u1', JSON.stringify({ savedAt: 1, data: { paths: [{ id: 'x' }], currentId: null } }));
    expect(readPathsSnapshot('u1')).toBeNull();
  });
});

describe('LearningPathsProvider offline snapshot', () => {
  it('saves the paths after a successful load', async () => {
    mocks.client = fakeClient({
      learning_paths: fakeQuery({ data: [pathRow()] }),
      profiles: fakeQuery({ data: { current_learning_path_id: TEST_PATH.id } }),
    });
    renderFor();
    expect(await screen.findByText(`ready:1:${TEST_PATH.id}:fresh`)).toBeInTheDocument();
    await waitFor(() => expect(readPathsSnapshot('u1')?.paths).toHaveLength(1));
  });

  it('is ready from the saved copy on the first render and keeps it when the network fails', async () => {
    writePathsSnapshot('u1', { paths: [TEST_PATH], currentId: TEST_PATH.id });
    mocks.client = fakeClient({
      learning_paths: fakeQuery({ data: null, error: NETWORK }),
      profiles: fakeQuery({ data: null, error: NETWORK }),
    });
    renderFor();
    expect(screen.getByTestId('s')).toHaveTextContent(`ready:1:${TEST_PATH.id}:cache`);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('s')).toHaveTextContent(`ready:1:${TEST_PATH.id}:cache`);
  });

  it('adopts the server list when it answers, dropping a path that no longer exists', async () => {
    writePathsSnapshot('u1', { paths: [TEST_PATH, { ...TEST_PATH, id: 'gone' }], currentId: 'gone' });
    mocks.client = fakeClient({
      learning_paths: fakeQuery({ data: [pathRow()] }),
      profiles: fakeQuery({ data: { current_learning_path_id: TEST_PATH.id } }),
    });
    renderFor();
    expect(await screen.findByText(`ready:1:${TEST_PATH.id}:fresh`)).toBeInTheDocument();
  });

  it('an empty server list is shown as empty (onboarding) and clears the snapshot', async () => {
    writePathsSnapshot('u1', { paths: [TEST_PATH], currentId: TEST_PATH.id });
    mocks.client = fakeClient({
      learning_paths: fakeQuery({ data: [] }),
      profiles: fakeQuery({ data: { current_learning_path_id: null } }),
    });
    renderFor();
    expect(await screen.findByText('ready:0:-:fresh')).toBeInTheDocument();
    await waitFor(() => expect(readPathsSnapshot('u1')).toBeNull());
  });

  it('shows an error offline when nothing is saved (and never caches that)', async () => {
    mocks.client = fakeClient({
      learning_paths: fakeQuery({ data: null, error: NETWORK }),
      profiles: fakeQuery({ data: null, error: NETWORK }),
    });
    renderFor();
    expect(await screen.findByText('error:0:-:fresh')).toBeInTheDocument();
    expect(readPathsSnapshot('u1')).toBeNull();
  });

  it('does not hide a real server error behind the saved copy', async () => {
    writePathsSnapshot('u1', { paths: [TEST_PATH], currentId: TEST_PATH.id });
    mocks.client = fakeClient({
      learning_paths: fakeQuery({ data: null, error: { message: 'permission denied', code: '42501' } }),
      profiles: fakeQuery({ data: { current_learning_path_id: null } }),
    });
    renderFor();
    expect(await screen.findByText(`error:1:${TEST_PATH.id}:cache`)).toBeInTheDocument();
  });

  it("never shows another user's saved paths", () => {
    writePathsSnapshot('u1', { paths: [TEST_PATH], currentId: TEST_PATH.id });
    mocks.client = fakeClient({ learning_paths: fakeQuery({ data: null, error: NETWORK }), profiles: fakeQuery({ data: null, error: NETWORK }) });
    renderFor('u2');
    expect(screen.getByTestId('s')).toHaveTextContent('loading:0:-:fresh');
  });
});
