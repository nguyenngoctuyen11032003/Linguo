import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubMatchMedia } from '../../../tests/unit/match-media';
import { renderExercise } from '../exercise/test-utils';
import { Flashcard } from './Flashcard';
import { RatingBar } from './RatingBar';
import { makeCard, PREVIEWS } from './test-fixtures';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, client: { rpc } as unknown };
});
vi.mock('@/lib/supabase', () => ({ getSupabase: () => mocks.client, requireSupabase: () => mocks.client }));

beforeEach(() => {
  stubMatchMedia(() => false);
  mocks.rpc.mockReset();
});

function ReviewHarness({ reportable = true, onRate = () => {} }: { reportable?: boolean; onRate?: (r: number) => void }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <>
      <Flashcard card={makeCard()} flipped={flipped} onFlip={() => setFlipped(true)} reportable={reportable} />
      <RatingBar previews={PREVIEWS} revealed={flipped} onRate={onRate} />
    </>
  );
}

describe('Flashcard content report button', () => {
  it('appears on the back only and reports the learning item', async () => {
    mocks.rpc.mockResolvedValue({ data: { report_id: '30000000-0000-4000-8000-0000000000aa', status: 'open' }, error: null });
    const card = makeCard();
    renderExercise(<ReviewHarness />);
    expect(screen.queryByRole('button', { name: 'Báo lỗi nội dung' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('flashcard-front'));
    const button = screen.getByRole('button', { name: 'Báo lỗi nội dung' });
    expect(screen.getByTestId('flashcard-back')).toContainElement(button);
    await userEvent.click(button);
    await userEvent.click(screen.getByRole('radio', { name: /Dịch chưa đúng/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Gửi báo lỗi' }));
    expect(await screen.findByText('Cảm ơn bạn! Linguo sẽ xem lại nội dung này.')).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith('report_content', {
      p_target_kind: 'learning_item',
      p_target_id: card.item_id,
      p_reason: 'translation',
      p_note: null,
    });
  });

  it('does not rate the card when number keys are pressed inside the dialog', async () => {
    const onRate = vi.fn();
    renderExercise(<ReviewHarness onRate={onRate} />);
    await userEvent.click(screen.getByTestId('flashcard-front'));
    await userEvent.click(screen.getByRole('button', { name: 'Báo lỗi nội dung' }));
    await userEvent.keyboard('1234');
    expect(onRate).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Báo lỗi nội dung' })).toHaveFocus();
  });

  it('is hidden unless reportable (admin previews)', async () => {
    renderExercise(<ReviewHarness reportable={false} />);
    await userEvent.click(screen.getByTestId('flashcard-front'));
    expect(screen.queryByRole('button', { name: 'Báo lỗi nội dung' })).not.toBeInTheDocument();
  });
});
