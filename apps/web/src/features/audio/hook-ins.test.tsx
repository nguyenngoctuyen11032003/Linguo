// The hook-in points choose the recorded-audio player only for generated `<lang>-<hash>` ids.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListenExercise } from '@/components/exercise/ListenExercise';
import { renderExercise } from '@/components/exercise/test-utils';
import { stubSpeechSynthesis } from '../../../tests/unit/speech-synthesis';

vi.mock('@/lib/env', () => ({ env: { supabaseUrl: 'https://abc.supabase.co' } }));

const ID = `en-${'1f'.repeat(16)}`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderListen = (audio_asset_id: string | null) =>
  renderExercise(
    <ListenExercise
      prompt={{
        audio_asset_id,
        fallback_text: 'Hello, my name is Lan.',
        options: [
          { id: 'l1', text: 'Xin chào', lang: 'vi' as const },
          { id: 'l2', text: 'Tạm biệt', lang: 'vi' as const },
        ],
        shuffle: false,
      }}
      seed="s"
      selectedId={null}
      onSelect={() => {}}
      disabled={false}
      marks={null}
    />,
  );

describe('ListenExercise with a generated recording', () => {
  it('shows the player and no machine voice or transcript up front', () => {
    stubSpeechSynthesis([{ lang: 'en-US', name: 'Yank' }]);
    renderListen(ID);
    expect(screen.getByRole('group', { name: 'Trình phát bản ghi âm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nghe chậm (0,75×)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /giọng đọc của máy/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Đọc thay vì nghe')).not.toBeInTheDocument();
  });

  it('falls back to machine speech and the transcript when the clip is missing', async () => {
    stubSpeechSynthesis([{ lang: 'en-US', name: 'Yank' }]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    renderListen(ID);
    await userEvent.click(screen.getByRole('button', { name: 'Nghe bản ghi âm' }));
    expect(await screen.findByText('Đọc thay vì nghe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nghe bằng giọng đọc của máy: Hello, my name is Lan.' })).toBeInTheDocument();
  });

  it('keeps the machine voice when there is no recording', () => {
    stubSpeechSynthesis([{ lang: 'en-US', name: 'Yank' }]);
    renderListen(null);
    expect(screen.queryByRole('group', { name: 'Trình phát bản ghi âm' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nghe bằng giọng đọc của máy: Hello, my name is Lan.' })).toBeInTheDocument();
  });
});
