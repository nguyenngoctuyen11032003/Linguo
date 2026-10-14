import type { ReactNode } from 'react';
import type { AdminContentDetail } from '@linguo/shared';
import { JsonView } from './JsonView';

// Answer key, explanation and script of a row (content_private, spec 11 §3 admin_get_content).

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** Private fields of the row; assessment items keep their key on the public row. */
function answerFields(detail: AdminContentDetail): Record<string, unknown> | null {
  if (detail.private) return detail.private;
  const { answer_key, explanation } = detail.row;
  if (answer_key === undefined && explanation === undefined) return null;
  return { answer_key, explanation };
}

function optionText(detail: AdminContentDetail, id: string): string {
  const prompt = detail.row.prompt;
  const options = isRecord(prompt) && Array.isArray(prompt.options) ? prompt.options : [];
  const found = options.find((o): o is Record<string, unknown> => isRecord(o) && o.id === id);
  const text = found ? str(found.text) : null;
  return text ? `${text} (${id})` : id;
}

function tokenText(detail: AdminContentDetail, id: string): string {
  const prompt = detail.row.prompt;
  const tokens = isRecord(prompt) && Array.isArray(prompt.tokens) ? prompt.tokens : [];
  const found = tokens.find((t): t is Record<string, unknown> => isRecord(t) && t.id === id);
  return (found && str(found.text)) ?? id;
}

/** Human-readable answer key; null when the shape is unknown (shown as JSON instead). */
function describeAnswer(detail: AdminContentDetail, answer: unknown): ReactNode | null {
  if (typeof answer === 'string') return optionText(detail, answer);
  if (!isRecord(answer)) return null;
  if (typeof answer.correct_option_id === 'string') return optionText(detail, answer.correct_option_id);
  if (Array.isArray(answer.accepted)) return <List items={answer.accepted.map(String)} />;
  if (isRecord(answer.blanks)) {
    return (
      <ul className="space-y-1">
        {Object.entries(answer.blanks).map(([id, accepted]) => (
          <li key={id}>
            <span className="font-mono text-sm text-muted">{id}:</span> {Array.isArray(accepted) ? accepted.map(String).join(' / ') : String(accepted)}
          </li>
        ))}
      </ul>
    );
  }
  if (Array.isArray(answer.orders)) {
    return <List items={answer.orders.map((order) => (Array.isArray(order) ? order.map((id) => tokenText(detail, String(id))).join(' ') : String(order)))} />;
  }
  return null;
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {items.map((t, i) => (
        <li key={`${i}:${t}`}>{t}</li>
      ))}
    </ul>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border py-2.5 last:border-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-sm font-semibold text-muted">{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

const SHOWN = new Set(['answer_key', 'answer', 'display_answer', 'explanation', 'script', 'tts_text', 'known_wrong', 'rubric', 'sample_answer']);

export function AnswerPanel({ detail }: { detail: AdminContentDetail }) {
  const fields = answerFields(detail);
  if (!fields) return <p className="text-[15px] text-muted">Loại nội dung này không có đáp án riêng.</p>;

  const answer = fields.answer_key ?? fields.answer;
  const described = answer === undefined ? null : describeAnswer(detail, answer);
  const explanation = isRecord(fields.explanation) ? str(fields.explanation.vi) : str(fields.explanation);
  const script = str(fields.script) ?? str(fields.tts_text);
  const sample = str(fields.sample_answer);
  const knownWrong = Array.isArray(fields.known_wrong) ? fields.known_wrong.filter(isRecord) : [];
  const rest = Object.fromEntries(Object.entries(fields).filter(([k]) => !SHOWN.has(k)));

  return (
    <div className="space-y-3">
      <dl>
        {answer !== undefined && <Row term="Đáp án">{described ?? <JsonView value={answer} label="Đáp án (dạng thô)" />}</Row>}
        {str(fields.display_answer) && <Row term="Đáp án hiển thị">{str(fields.display_answer)}</Row>}
        {explanation && <Row term="Giải thích">{explanation}</Row>}
        {script && (
          <Row term="Lời thoại (script)">
            <p className="whitespace-pre-line">{script}</p>
          </Row>
        )}
        {sample && (
          <Row term="Bài mẫu">
            <p className="whitespace-pre-line">{sample}</p>
          </Row>
        )}
        {knownWrong.length > 0 && (
          <Row term="Lỗi dự đoán">
            <ul className="space-y-1">
              {knownWrong.map((k, i) => (
                <li key={i}>
                  <span className="font-semibold">{String(k.answer)}</span> → {String(k.feedback_vi ?? '')}{' '}
                  {typeof k.error_tag === 'string' && <span className="font-mono text-xs text-muted">[{k.error_tag}]</span>}
                </li>
              ))}
            </ul>
          </Row>
        )}
        {isRecord(fields.rubric) && Object.keys(fields.rubric).length > 0 && (
          <Row term="Rubric">
            <span className="font-mono text-sm">
              {Object.entries(fields.rubric)
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join(' · ')}
            </span>
          </Row>
        )}
      </dl>
      {Object.keys(rest).length > 0 && <JsonView value={rest} label="Dữ liệu riêng khác" />}
    </div>
  );
}
