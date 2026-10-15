import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReviewCard } from '@linguo/shared';
import { stubMatchMedia } from '../../../tests/unit/match-media';
import { stubSpeechSynthesis } from '../../../tests/unit/speech-synthesis';
import { renderExercise } from '../exercise/test-utils';
import { Flashcard } from './Flashcard';
import { makeCard } from './test-fixtures';

function Harness({ card }: { card: ReviewCard }) {
  const [flipped, setFlipped] = useState(false);
  return <Flashcard card={card} flipped={flipped} onFlip={() => setFlipped(true)} />;
}

const VOICES = [{ lang: 'ko-KR', name: 'Yuna' }, { lang: 'en-US', name: 'Yank' }];

afterEach(() => vi.unstubAllGlobals());

describe('Flashcard machine speech', () => {
  it('speaks the word on the front of a recognize card, in Korean, without autoplay', async () => {
    stubMatchMedia(() => false);
    const { spoken } = stubSpeechSynthesis(VOICES);
    renderExercise(<Harness card={makeCard()} />);
    expect(spoken).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Nghe phát âm: 학교' }));
    expect(spoken[0]).toMatchObject({ text: '학교', lang: 'ko-KR', rate: 0.9 });
  });

  it('cancels speech on flip and offers the example after flipping', async () => {
    stubMatchMedia(() => false);
    const { cancel } = stubSpeechSynthesis(VOICES);
    renderExercise(<Harness card={makeCard()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Nghe phát âm: 학교' }));
    cancel.mockClear();
    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(cancel).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Nghe câu ví dụ: 학교에 가요.' })).toBeInTheDocument();
  });

  it('hides the word button on the front of a recall card (it would give the answer away)', async () => {
    stubMatchMedia(() => false);
    stubSpeechSynthesis(VOICES);
    renderExercise(<Harness card={makeCard({ direction: 'recall' })} />);
    expect(screen.queryByRole('button', { name: /Nghe/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(screen.getByRole('button', { name: 'Nghe phát âm: 학교' })).toBeInTheDocument();
  });

  it('shows nothing when unsupported and defers to a recording when there is one', () => {
    stubMatchMedia(() => false);
    stubSpeechSynthesis(null);
    const { unmount } = renderExercise(<Harness card={makeCard()} />);
    expect(screen.queryByRole('button', { name: /Nghe/ })).not.toBeInTheDocument();
    unmount();
    stubSpeechSynthesis(VOICES);
    renderExercise(<Harness card={makeCard({ item: { audio_path: 'ko/hakgyo.mp3' } })} />);
    expect(screen.queryByRole('button', { name: /Nghe phát âm/ })).not.toBeInTheDocument();
  });

  it('cancels speech on unmount', async () => {
    stubMatchMedia(() => false);
    const { cancel } = stubSpeechSynthesis(VOICES);
    const { unmount } = renderExercise(<Harness card={makeCard()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Nghe phát âm: 학교' }));
    cancel.mockClear();
    unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
