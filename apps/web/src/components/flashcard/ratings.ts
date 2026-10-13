import type { Rating, ReviewCard } from '@linguo/shared';

export const RATINGS: readonly Rating[] = [1, 2, 3, 4];

export const RATING_LABELS: Record<Rating, string> = { 1: 'Quên', 2: 'Khó', 3: 'Được', 4: 'Dễ' };

/** Which `previews` entry belongs to each rating. */
export const RATING_PREVIEW_KEY: Record<Rating, keyof ReviewCard['previews']> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };
