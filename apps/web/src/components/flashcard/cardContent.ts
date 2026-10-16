import type { ReviewCard } from '@linguo/shared';

/** Typed view of a review card's loosely-typed `front`/`back` jsonb (itemFrontSchema / itemBackSchema). */
export interface CardContent {
  lang: ReviewCard['item']['language_code'];
  text: string;
  ipa: string | null;
  /** ja: kana reading of a kanji word. */
  reading: string | null;
  romanization: string | null;
  pos: string | null;
  meaningVi: string;
  example: { target: string; translationVi: string } | null;
  /** The learner's own note on a personal word (get_personal_review_queue sends it as `back.note`). */
  note: string | null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function vi(value: unknown): string | null {
  return value !== null && typeof value === 'object' ? str((value as Record<string, unknown>).vi) : null;
}

export function readCardContent(card: ReviewCard): CardContent {
  const { front, back, language_code } = card.item;
  const examples = Array.isArray(back.examples) ? (back.examples as unknown[]) : [];
  const first = examples[0];
  const firstRecord = first !== null && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  const target = firstRecord ? str(firstRecord.target) : null;
  return {
    lang: language_code,
    text: str(front.text) ?? '',
    ipa: str(front.ipa),
    reading: str(front.reading),
    romanization: str(front.romanization),
    pos: str(front.pos),
    meaningVi: vi(back.meaning) ?? '',
    example: target ? { target, translationVi: vi(firstRecord?.translation) ?? '' } : null,
    note: str(back.note),
  };
}

/** What the learner is asked to remember, read out by the live region once the card is flipped. */
export function answerText(card: ReviewCard): string {
  const content = readCardContent(card);
  return card.direction === 'recognize' ? content.meaningVi : content.text;
}
