import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiRequestInput } from '@linguo/shared';
import type { LearningPath } from '@/features/learning-paths/service';
import type { ReviewSessionApi } from '@/features/reviews/types';
import { renderWithProviders } from '../../../../tests/unit/render';
import { levelForCard, reviewAiState } from './ai';
import { reviewCard, sessionApi } from './review-fixtures';
import { ReviewPage } from './ReviewPage';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  request: AiRequestInput;
  fallback?: { title: string; body: string };
}

const mocks = vi.hoisted(() => ({ session: null as unknown as ReviewSessionApi, sheet: null as SheetProps | null }));

vi.mock('@/features/reviews/useReviewSession', () => ({ useReviewSession: () => mocks.session }));
vi.mock('@/components/ai', () => ({
  AiExplainSheet: (props: SheetProps) => {
    mocks.sheet = props;
    return props.open ? (
      <div role="dialog" aria-label="AI sheet">
        <button type="button" onClick={props.onClose}>
          Đóng
        </button>
      </div>
    ) : null;
  },
}));

const path = (overrides: Partial<LearningPath>): LearningPath => ({ id: 'p', language: 'en', currentLevel: 'a2', ...overrides }) as LearningPath;

beforeEach(() => {
  mocks.sheet = null;
});

describe('review card "Giải thích AI"', () => {
  it('is not offered on the front of the card', () => {
    mocks.session = sessionApi();
    renderWithProviders(<ReviewPage />, { route: '/app/on-tap' });
    expect(screen.queryByRole('button', { name: 'Giải thích AI' })).not.toBeInTheDocument();
  });

  it('explains the item from the back, and pauses rating keys while the sheet is open', async () => {
    mocks.session = sessionApi({ cardState: { status: 'back' } });
    renderWithProviders(<ReviewPage />, { route: '/app/on-tap' });
    await userEvent.click(screen.getByRole('button', { name: 'Giải thích AI' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.sheet?.request).toMatchObject({ task: 'explain_concept', language: 'en', concept: 'hello' });
    expect(mocks.sheet?.fallback).toEqual({ title: 'hello', body: 'Nghĩa: xin chào' });

    await userEvent.keyboard('3');
    expect(mocks.session.grade).not.toHaveBeenCalled();
    await userEvent.keyboard('p');
    expect(mocks.session.postpone).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    await userEvent.keyboard('3');
    expect(mocks.session.grade).toHaveBeenCalledWith(3, expect.anything());
  });
});

describe('review AI helpers', () => {
  it('uses the level of the path in the card language, else the first level', () => {
    const ko = reviewCard({ item: { ...reviewCard().item, language_code: 'ko' } });
    expect(levelForCard(reviewCard(), [path({})], null)).toBe('a2');
    expect(levelForCard(ko, [path({}), path({ id: 'k', language: 'ko', currentLevel: 'topik2' })], path({}))).toBe('topik2');
    expect(levelForCard(ko, [path({})], null)).toBe('hangul');
    expect(levelForCard(reviewCard(), [path({ currentLevel: 'unknown' })], null)).toBe('pre_a1');
  });

  it('adds the confusion note to the fallback', () => {
    const card = reviewCard({
      item: { ...reviewCard().item, back: { meaning: { vi: 'xin chào' }, confusion: { vi: 'Đừng nhầm với "hell".' } } },
    });
    expect(reviewAiState(card, 'a1')).toEqual({
      request: { task: 'explain_concept', language: 'en', level: 'a1', concept: 'hello', context: 'Nghĩa tiếng Việt: xin chào' },
      fallback: { title: 'hello', body: 'Nghĩa: xin chào\n\nĐừng nhầm với "hell".' },
    });
  });
});
