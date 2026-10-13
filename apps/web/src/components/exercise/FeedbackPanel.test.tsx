import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { SubmitResult } from '@linguo/shared';
import { renderExercise } from './test-utils';
import { stubMatchMedia } from '../../../tests/unit/match-media';
import { DemoBadge, PendingSyncBadge } from './Badges';
import { FeedbackPanel } from './FeedbackPanel';
import { makeResult } from './test-fixtures';

describe('FeedbackPanel', () => {
  it('is an always-mounted polite live region', () => {
    renderExercise(<FeedbackPanel result={null} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
  });

  it.each([
    ['correct', '✓', 'Chính xác'],
    ['almost', '≈', 'Gần đúng'],
    ['incorrect', '✗', 'Chưa đúng'],
  ] as const)('shows %s with an icon and a text label', (verdict, icon, label) => {
    renderExercise(<FeedbackPanel result={makeResult({ verdict, is_correct: verdict !== 'incorrect' })} />);
    const heading = screen.getByRole('heading', { name: label });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText(icon)).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([
    ['typo', 'Đúng ý nhưng sai chính tả'],
    ['article', 'Kiểm tra lại mạo từ a/an/the'],
    ['spacing', 'Đúng, lưu ý khoảng cách giữa các từ (띄어쓰기)'],
    ['particle_allomorph', 'Sai dạng trợ từ — xem từ trước có patchim không'],
    ['missing_diacritics', 'Đúng nhưng thiếu dấu'],
  ])('explains the built-in tag %s', (tag, message) => {
    renderExercise(<FeedbackPanel result={makeResult({ error_tags: [tag] })} />);
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('shows feedback_vi, display answer and explanation when revealed', () => {
    renderExercise(
      <FeedbackPanel
        result={makeResult({
          attempt_no: 2,
          revealed: true,
          final: true,
          feedback_vi: 'Dùng "am" với "I".',
          display_answer: 'I am a student.',
          explanation: { vi: 'Động từ to be đi với I là am.' },
        })}
      />,
    );
    expect(screen.getByText('Dùng "am" với "I".')).toBeInTheDocument();
    expect(screen.getByText('I am a student.')).toBeInTheDocument();
    expect(screen.getByText('Động từ to be đi với I là am.')).toBeInTheDocument();
  });

  it('keeps secondary text off the muted color, which drops below 4.5:1 on the tinted verdict card', () => {
    renderExercise(
      <FeedbackPanel
        result={makeResult({ verdict: 'correct', is_correct: true, display_answer: 'I am.', explanation: { vi: 'Giải thích.' } })}
      />,
    );
    expect(screen.getByText('Đáp án')).not.toHaveClass('text-muted');
    expect(screen.getByText('Giải thích.')).not.toHaveClass('text-muted');
    expect(screen.getByTestId('feedback-card').querySelector('.text-muted')).toBeNull();
  });

  it('suggests one more try when incorrect and not final', () => {
    renderExercise(<FeedbackPanel result={makeResult()} />);
    expect(screen.getByText(/Bạn còn một lần thử/)).toBeInTheDocument();
  });

  it('moves focus to the heading when a new result arrives, not on mount', async () => {
    function Harness() {
      const [result, setResult] = useState<SubmitResult | null>(makeResult({ attempt_id: '00000000-0000-4000-8000-000000000001' }));
      return (
        <>
          <button type="button" onClick={() => setResult(makeResult({ verdict: 'correct', is_correct: true, final: true }))}>
            next
          </button>
          <FeedbackPanel result={result} />
        </>
      );
    }
    renderExercise(<Harness />);
    expect(screen.getByRole('heading', { name: 'Chưa đúng' })).not.toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'next' }));
    expect(screen.getByRole('heading', { name: 'Chính xác' })).toHaveFocus();
  });

  it('uses an opacity-only entrance when reduced motion is on', () => {
    stubMatchMedia((q) => q.includes('reduce'));
    renderExercise(<FeedbackPanel result={makeResult()} />);
    const card = screen.getByTestId('feedback-card');
    expect(card.style.transform).toBe('');
    expect(card.style.opacity).toBe('0');
  });

  it('slides in when motion is allowed', () => {
    renderExercise(<FeedbackPanel result={makeResult()} />);
    expect(screen.getByTestId('feedback-card').style.transform).toMatch(/translateY/);
  });
});

describe('badges', () => {
  it('DemoBadge text', () => {
    renderExercise(<DemoBadge />);
    expect(screen.getByText('Nội dung demo — chưa kiểm duyệt')).toBeInTheDocument();
  });

  it('PendingSyncBadge text', () => {
    renderExercise(<PendingSyncBadge />);
    expect(screen.getByText('Đang chờ đồng bộ — sẽ chấm khi có mạng')).toBeInTheDocument();
  });
});
