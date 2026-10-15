import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewCard } from '@linguo/shared';
import { stubMatchMedia } from '../../../tests/unit/match-media';
import { renderExercise } from '../exercise/test-utils';
import { Flashcard } from './Flashcard';
import { makeCard } from './test-fixtures';

function Harness({ card, onFlip = () => {} }: { card: ReviewCard; onFlip?: () => void }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <Flashcard
      card={card}
      flipped={flipped}
      onFlip={() => {
        onFlip();
        setFlipped(true);
      }}
    />
  );
}

const liveRegion = () => screen.getByRole('status');

describe('Flashcard', () => {
  it('recognize: shows the word with romanization/IPA and its language, then the meaning and first example', async () => {
    renderExercise(<Harness card={makeCard()} />);
    const word = screen.getByText('학교');
    expect(word).toHaveAttribute('lang', 'ko');
    expect(screen.getByText('hakgyo')).toBeInTheDocument();
    expect(screen.getByText('/hak̚.k͈jo/')).toBeInTheDocument();
    expect(screen.queryByText('trường học')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(screen.getByText('trường học')).toBeInTheDocument();
    expect(screen.getByText('학교에 가요.')).toHaveAttribute('lang', 'ko');
    expect(screen.getByText('Tôi đi học.')).toBeInTheDocument();
  });

  it('recall: shows the Vietnamese meaning, then the target word', async () => {
    renderExercise(<Harness card={makeCard({ direction: 'recall' })} />);
    expect(screen.getByText('trường học')).toBeInTheDocument();
    expect(screen.getByText('Nói bằng tiếng Hàn')).toBeInTheDocument();
    expect(screen.queryByText('학교')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(screen.getByText('학교')).toHaveAttribute('lang', 'ko');
  });

  it('announces the answer through an always-mounted polite live region', async () => {
    renderExercise(<Harness card={makeCard()} />);
    expect(liveRegion()).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion()).toBeEmptyDOMElement();
    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(liveRegion()).toHaveTextContent('Đáp án: trường học');
  });

  it('announces the target word on a recall card', async () => {
    renderExercise(<Harness card={makeCard({ direction: 'recall' })} />);
    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(liveRegion()).toHaveTextContent('Đáp án: 학교');
  });

  it.each([' ', '{Enter}'])('flips with %j from anywhere on the page, once', async (key) => {
    const onFlip = vi.fn();
    renderExercise(<Harness card={makeCard()} onFlip={onFlip} />);
    await userEvent.keyboard(key);
    await userEvent.keyboard(key);
    expect(onFlip).toHaveBeenCalledTimes(1);
    expect(liveRegion()).toHaveTextContent('Đáp án: trường học');
  });

  it('flips with Space when the card itself has focus and keeps focus on the card', async () => {
    const onFlip = vi.fn();
    renderExercise(<Harness card={makeCard()} onFlip={onFlip} />);
    await userEvent.tab();
    expect(screen.getByTestId('flashcard-front')).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(onFlip).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('flashcard-back')).toHaveFocus();
  });

  it('does not flip while disabled', async () => {
    const onFlip = vi.fn();
    renderExercise(<Flashcard card={makeCard()} flipped={false} onFlip={onFlip} disabled />);
    await userEvent.keyboard(' ');
    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(onFlip).not.toHaveBeenCalled();
  });

  it('turns over in 3D when motion is allowed', async () => {
    renderExercise(<Harness card={makeCard()} />);
    await userEvent.click(screen.getByTestId('flashcard-front'));
    const inner = screen.getByTestId('flashcard-inner');
    expect(inner.className).toContain('preserve-3d');
    // Both faces exist during the turn; the front is hidden from assistive tech.
    expect(screen.getByTestId('flashcard-front')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('flashcard-front')).toHaveAttribute('tabindex', '-1');
  });

  it('swaps faces instantly with reduced motion', async () => {
    stubMatchMedia((q) => q.includes('reduce'));
    renderExercise(<Harness card={makeCard()} />);
    const inner = screen.getByTestId('flashcard-inner');
    expect(inner.style.transform).toBe('');
    expect(inner.className).not.toContain('preserve-3d');
    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(screen.queryByTestId('flashcard-front')).not.toBeInTheDocument();
    expect(screen.getByTestId('flashcard-back')).toBeInTheDocument();
    expect(screen.getByTestId('flashcard-inner').style.transform).toBe('');
    expect(liveRegion()).toHaveTextContent('Đáp án: trường học');
  });

  it('renders no audio control when there is no audio', async () => {
    renderExercise(<Harness card={makeCard()} />);
    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(screen.queryByRole('button', { name: /Nghe|audio|Thử lại/ })).not.toBeInTheDocument();
  });

  it('keeps audio enabled after a playback failure and retries on the next press', async () => {
    const play = vi.fn().mockRejectedValueOnce(new Error('NotAllowedError')).mockResolvedValue(undefined);
    vi.stubGlobal(
      'Audio',
      class {
        currentTime = 0;
        play = play;
      },
    );
    renderExercise(<Harness card={makeCard({ item: { audio_path: 'ko/hakgyo.mp3' } })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Nghe' }));
    const retry = await screen.findByRole('button', { name: 'Không phát được. Thử lại' });
    expect(retry).toBeEnabled();
    await userEvent.click(retry);
    expect(await screen.findByRole('button', { name: 'Nghe' })).toBeEnabled();
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('marks the Vietnamese meaning and example translation with lang="vi"', async () => {
    renderExercise(<Harness card={makeCard()} />);
    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(screen.getByText('trường học')).toHaveAttribute('lang', 'vi');
    expect(screen.getByText('Tôi đi học.')).toHaveAttribute('lang', 'vi');
  });

  it('offers audio when the item has a recording', () => {
    renderExercise(<Harness card={makeCard({ item: { audio_path: 'ko/hakgyo.mp3' } })} />);
    expect(screen.getByRole('button', { name: 'Nghe' })).toBeEnabled();
  });

  it('hides audio on the front of a recall card so it does not give the answer away', async () => {
    renderExercise(<Harness card={makeCard({ direction: 'recall', item: { audio_path: 'ko/hakgyo.mp3' } })} />);
    expect(screen.queryByRole('button', { name: 'Nghe' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(screen.getByRole('button', { name: 'Nghe' })).toBeInTheDocument();
  });

  it('shows the learner note of a personal word on the back only', async () => {
    // get_personal_review_queue puts the word's note in back.note.
    const card = makeCard({ item: { language_code: 'en', front: { text: 'apple' }, back: { meaning: { vi: 'quả táo' }, examples: [], note: 'Gặp trong bài đọc tuần 3' } } });
    renderExercise(<Harness card={card} />);
    expect(screen.queryByText('Gặp trong bài đọc tuần 3')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(screen.getByTestId('flashcard-back')).toHaveTextContent('Ghi chú: Gặp trong bài đọc tuần 3');
  });

  it('tolerates a card without examples or pronunciation', async () => {
    const card = makeCard({ item: { language_code: 'en', front: { text: 'school' }, back: { meaning: { vi: 'trường học' } } } });
    renderExercise(<Harness card={card} />);
    expect(screen.getByText('school')).toHaveAttribute('lang', 'en');
    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(screen.getByText('trường học')).toBeInTheDocument();
  });
});
