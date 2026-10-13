import type { ReviewCard } from '@linguo/shared';

type CardOverrides = Omit<Partial<ReviewCard>, 'item'> & { item?: Partial<ReviewCard['item']> };

const preview = (interval_minutes: number) => ({ interval_minutes, due_at: '2026-10-14T00:00:00Z' });

export const PREVIEWS: ReviewCard['previews'] = {
  again: preview(0),
  hard: preview(10),
  good: preview(3 * 1440),
  easy: preview(60 * 1440),
};

export function makeCard(overrides: CardOverrides = {}): ReviewCard {
  const { item, ...rest } = overrides;
  return {
    card_id: '00000000-0000-4000-8000-0000000000c1',
    item_id: '00000000-0000-4000-8000-0000000000a1',
    direction: 'recognize',
    state: 'review',
    is_new: false,
    due_at: '2026-10-13T00:00:00Z',
    postpone_count: 0,
    previews: PREVIEWS,
    ...rest,
    item: {
      language_code: 'ko',
      item_type: 'vocab',
      front: { text: '학교', romanization: 'hakgyo', ipa: 'hak̚.k͈jo' },
      back: { meaning: { vi: 'trường học' }, examples: [{ target: '학교에 가요.', translation: { vi: 'Tôi đi học.' } }] },
      audio_path: null,
      ...item,
    },
  };
}
