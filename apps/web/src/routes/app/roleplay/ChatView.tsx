import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Check, Circle, Flag, Lightbulb, Mic, Pencil, Square, Volume2 } from 'lucide-react';
import type { RoleplayScenario } from '@linguo/shared';
import { AiFallback, AiLoading, AiTextarea, type QuotaGate } from '@/components/ai';
import { Button } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import type { AiQuota } from '@/features/ai-tutor/quota';
import { useSpeechRecognition } from '@/features/speaking/useSpeechRecognition';
import type { TtsApi } from '@/features/speaking/useTts';
import {
  isOver,
  learnerTurns,
  MAX_TURNS,
  partnerTurns,
  type RoleplayMessage,
  type RoleplaySession,
} from '@/features/roleplay/session';
import type { RoleplayApi } from '@/features/roleplay/useRoleplaySession';
import { cn } from '@/lib/cn';
import { useMotionPrefs } from '@/providers/MotionProvider';
import { LeaveRoleplayDialog } from './LeaveRoleplayDialog';

const MESSAGE_MAX = 300;
const LANGUAGE_NAME = { en: 'tiếng Anh', ko: 'tiếng Hàn', ja: 'tiếng Nhật' } as const;
const REPLY_PLACEHOLDER = { en: 'Type your reply in English…', ko: 'Gõ câu trả lời bằng tiếng Hàn…', ja: 'Gõ câu trả lời bằng tiếng Nhật…' } as const;

export const ROLEPLAY_AI_NOTE =
  'Đối tác là AI nên có thể nói sai hoặc chưa tự nhiên. Đừng nhập thông tin cá nhân thật như số điện thoại, địa chỉ hay mật khẩu.';

function GoalChecklist({ scenario, reached }: { scenario: RoleplayScenario; reached: string[] }) {
  return (
    <ul aria-label="Mục tiêu của tình huống" className="space-y-1">
      {scenario.goals.map((g) => {
        const done = reached.includes(g.key);
        return (
          <li key={g.key} className="flex items-start gap-2 text-[15px]">
            {done ? <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" /> : <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />}
            <span className={cn(done && 'font-medium')}>
              {g.label_vi}
              <span className="sr-only">{done ? ' (đã đạt)' : ' (chưa đạt)'}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Corrections({ message, lang }: { message: RoleplayMessage; lang: 'en' | 'ko' | 'ja' }) {
  if (message.corrections.length === 0) return null;
  return (
    <section aria-label="Gợi ý sửa câu" className="mt-1.5 space-y-1.5 rounded-2xl border border-border px-3 py-2 text-sm">
      <h3 className="flex items-center gap-1.5 font-semibold">
        <Pencil aria-hidden className="size-3.5 text-primary" />
        Gợi ý sửa câu
      </h3>
      <ul className="space-y-1.5">
        {message.corrections.map((c, i) => (
          <li key={i} className="space-y-0.5">
            <p className="break-words">
              <span lang={lang} className="text-muted line-through decoration-1">
                {c.original}
              </span>
              <span aria-hidden> → </span>
              <span className="sr-only"> nên viết: </span>
              <span lang={lang} className="font-medium">
                {c.corrected}
              </span>
            </p>
            <p className="break-words text-muted">{c.note_vi}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Bubble({
  message,
  lang,
  tts,
  latestPartner,
  onReport,
}: {
  message: RoleplayMessage;
  lang: 'en' | 'ko' | 'ja';
  tts: TtsApi;
  latestPartner: boolean;
  onReport: (responseId: string, trigger: HTMLButtonElement) => void;
}) {
  const partner = message.role === 'partner';
  const playing = tts.speakingText === message.text;
  return (
    <li className={cn('flex flex-col', partner ? 'items-start' : 'items-end')}>
      <div className={cn('max-w-[92%] space-y-1', partner ? '' : 'items-end')}>
        <p className="px-1 text-xs font-medium text-muted">{partner ? 'Đối tác AI' : 'Bạn'}</p>
        <p
          lang={lang}
          className={cn(
            'whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-base leading-relaxed',
            partner ? 'rounded-tl-lg border border-border bg-surface-solid' : 'rounded-tr-lg bg-primary/12',
            message.status === 'failed' && 'border border-dashed border-error',
          )}
        >
          {message.text}
        </p>
        {message.status === 'sending' && <p className="px-1 text-xs text-muted">Đang gửi…</p>}
        {message.status === 'failed' && <p className="px-1 text-xs text-error-text">Chưa gửi được tin nhắn này.</p>}
        {!partner && <Corrections message={message} lang={lang} />}
        {partner && (
          <div className="flex flex-wrap items-center gap-1">
            {tts.available && (
              <Button variant="ghost" onClick={() => (playing ? tts.stop() : tts.play(message.text))} aria-label={playing ? undefined : 'Nghe câu của đối tác'}>
                {playing ? <Square aria-hidden className="size-4" /> : <Volume2 aria-hidden className="size-4" />}
                {playing ? 'Dừng đọc' : 'Nghe'}
              </Button>
            )}
            {latestPartner && message.responseId && (
              <Button variant="ghost" onClick={(e) => onReport(message.responseId!, e.currentTarget)}>
                <Flag aria-hidden className="size-4" />
                Báo lỗi
              </Button>
            )}
          </div>
        )}
        {partner && latestPartner && message.hint_vi && (
          <p className="flex items-start gap-1.5 rounded-2xl bg-primary/10 px-3 py-2 text-sm">
            <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="break-words">
              <span className="font-semibold">Gợi ý cách trả lời: </span>
              {message.hint_vi}
            </span>
          </p>
        )}
      </div>
    </li>
  );
}

export interface ChatViewProps {
  api: RoleplayApi;
  session: RoleplaySession;
  scenario: RoleplayScenario;
  quota: AiQuota | null;
  gate: QuotaGate;
  tts: TtsApi;
  onFinish: () => void;
  onLeave: () => void;
  onReport: (responseId: string, trigger: HTMLButtonElement) => void;
}

/** The conversation: bubbles, turn counter, goal checklist, composer (text, optional voice input), finish. */
export function ChatView({ api, session, scenario, quota, gate, tts, onFinish, onLeave, onReport }: ChatViewProps) {
  const { reduceMotion } = useMotionPrefs();
  const lang = session.language;
  const stt = useSpeechRecognition(lang);
  const [voiceOn, setVoiceOn] = useState(false);
  const [draft, setDraft] = useState('');
  const [empty, setEmpty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  // The input and its send button, or the "finished" card: what should sit above the bottom nav after a reply.
  const tailRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const voiceId = useId();
  const errorId = useId();
  const finishHintId = useId();
  const turns = partnerTurns(session);
  const over = isOver(session);
  const loading = api.state === 'loading';
  const sendDisabled = gate.exhausted || loading || api.stalled || over;
  const lastPartnerId = [...session.messages].reverse().find((m) => m.role === 'partner')?.id;
  const { listening, transcript, start: startStt, stop: stopStt, reset: resetStt } = stt;

  // Starting a scenario (or coming back to one) lands on its title instead of leaving focus on <body>.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  // New message: keep the end of the conversation in view (no smooth scroll with reduced motion). While the partner
  // is typing that is the typing indicator; once it replied it is the whole composer (input and "Gửi"), which the
  // root scroll-padding keeps clear of the bottom nav.
  useEffect(() => {
    const target = loading ? endRef.current : (tailRef.current ?? endRef.current);
    target?.scrollIntoView?.({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [session.messages.length, loading, over, reduceMotion]);

  // After each partner reply the input is ready again.
  const seenTurns = useRef(0);
  useEffect(() => {
    if (turns === seenTurns.current) return;
    seenTurns.current = turns;
    if (!over) composerRef.current?.querySelector('textarea')?.focus({ preventScroll: true });
  }, [turns, over]);

  // Dictation fills the editable draft while listening; the learner corrects it before sending.
  useEffect(() => {
    if (listening) setDraft(transcript);
  }, [listening, transcript]);
  useEffect(() => () => stopStt(), [stopStt]);

  // A failed turn that was taken back for editing: the text returns to the input.
  const takeBack = () => {
    const text = api.takeBackFailed();
    if (text !== null) {
      setDraft(text);
      composerRef.current?.querySelector('textarea')?.focus({ preventScroll: true });
    }
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (sendDisabled) return;
    const text = draft.trim();
    if (!text) {
      setEmpty(true);
      return;
    }
    setEmpty(false);
    stopStt();
    if (api.send(text)) {
      setDraft('');
      resetStt();
    }
  };

  const fallbackState = api.badAnswer ? 'error' : api.state === 'quota' || api.state === 'unavailable' || api.state === 'error' ? api.state : null;
  const learnerCount = learnerTurns(session);

  return (
    <div className="space-y-4">
      <SolidCard className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold leading-snug focus:outline-none">
              {scenario.title_vi}
            </h2>
            <p className="text-sm text-muted">Đối tác: {scenario.partner_role_vi} · nói {LANGUAGE_NAME[lang]}</p>
          </div>
          <p className="shrink-0 rounded-full bg-text/5 px-3 py-1 text-sm font-semibold tabular-nums">
            Lượt {Math.min(turns, MAX_TURNS)}/{MAX_TURNS}
          </p>
        </div>
        <GoalChecklist scenario={scenario} reached={session.goals} />
      </SolidCard>

      <p className="px-1 text-sm text-muted">{ROLEPLAY_AI_NOTE}</p>

      <div role="log" aria-label="Cuộc trò chuyện" aria-live="polite" aria-relevant="additions">
        <ol className="space-y-3">
          {session.messages.map((m) => (
            <Bubble key={m.id} message={m} lang={lang} tts={tts} latestPartner={m.id === lastPartnerId} onReport={onReport} />
          ))}
        </ol>
      </div>

      <div aria-live="polite" aria-busy={loading || undefined}>
        {loading && <AiLoading label={session.messages.length === 0 ? 'Đối tác đang mở lời…' : 'Đối tác đang trả lời…'} />}
        {!loading && fallbackState && (
          <div className="space-y-3">
            <AiFallback state={fallbackState} error={api.badAnswer ? null : api.error} quota={quota} onRetry={api.stalled ? api.retry : undefined} />
            {api.failedMessage && (
              <Button variant="ghost" onClick={takeBack}>
                <Pencil aria-hidden className="size-4" />
                Sửa tin nhắn rồi gửi lại
              </Button>
            )}
          </div>
        )}
      </div>
      <div ref={endRef} />

      {over ? (
        <div ref={tailRef}>
          <SolidCard className="space-y-3 p-4">
            <p className="font-semibold">Buổi trò chuyện đã xong, bạn làm tốt lắm!</p>
            <p className="text-[15px] text-muted">
              {session.goals.length >= scenario.goals.length
                ? 'Bạn đã đạt mọi mục tiêu của tình huống.'
                : 'Bạn đã đi hết số lượt của một buổi.'}{' '}
              Xem tóm tắt để nhớ lại những gì đã luyện nhé.
            </p>
            <Button variant="accent" onClick={onFinish}>
              Kết thúc và xem tóm tắt
            </Button>
          </SolidCard>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-3">
          <div ref={tailRef} className="space-y-3">
            <div ref={composerRef} className="space-y-1.5">
              <label htmlFor={`${voiceId}-msg`} className="block px-1 text-sm font-medium">
                Tin nhắn của bạn (bằng {LANGUAGE_NAME[lang]})
              </label>
              <AiTextarea
                id={`${voiceId}-msg`}
                lang={lang}
                value={draft}
                maxLength={MESSAGE_MAX}
                invalid={empty}
                aria-describedby={empty ? errorId : undefined}
                placeholder={REPLY_PLACEHOLDER[lang]}
                onValueChange={(v) => {
                  setDraft(v);
                  if (empty) setEmpty(false);
                }}
                onSubmitShortcut={() => submit()}
              />
              {empty && (
                <p id={errorId} role="alert" className="px-1 text-sm text-error-text">
                  Hãy viết vài chữ trước khi gửi nhé.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="accent" loading={loading} disabled={sendDisabled} hint={gate.hint ? `${gate.hint} Bài học và ôn tập vẫn dùng bình thường.` : undefined}>
                Gửi
              </Button>
              {stt.supported && voiceOn && (
                <Button variant="ghost" onClick={listening ? stopStt : startStt} aria-pressed={listening} disabled={loading || api.stalled}>
                  {listening ? <Square aria-hidden className="size-4" /> : <Mic aria-hidden className="size-4" />}
                  {listening ? 'Dừng nói' : 'Nói để nhập'}
                </Button>
              )}
            </div>
          </div>
          {stt.supported && (
            <div className="space-y-1">
              <label htmlFor={voiceId} className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-medium">
                <input
                  id={voiceId}
                  type="checkbox"
                  checked={voiceOn}
                  onChange={(e) => {
                    setVoiceOn(e.target.checked);
                    if (!e.target.checked) stopStt();
                  }}
                  className="size-5 accent-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
                />
                Bật nói để nhập tin nhắn (tuỳ chọn)
              </label>
              <p className="px-1 text-sm text-muted">
                Linguo không tải lên hay lưu bản ghi âm nào. Một số trình duyệt gửi âm thanh tới dịch vụ nhận dạng giọng nói của hãng trình duyệt để chép lời, nên mục này mặc định tắt. Bản chép có thể sai: hãy đọc và sửa trước khi gửi.
              </p>
            </div>
          )}
          {!tts.available && <p className="px-1 text-sm text-muted">Trình duyệt chưa có giọng đọc {LANGUAGE_NAME[lang]}, nên bạn hãy đọc to câu của đối tác nhé.</p>}
        </form>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap gap-2">
          {!over && (
            <Button variant="ghost" onClick={onFinish} disabled={learnerCount === 0 || loading} aria-describedby={learnerCount === 0 ? finishHintId : undefined}>
              Kết thúc và xem tóm tắt
            </Button>
          )}
          <Button ref={leaveRef} variant="ghost" onClick={() => (learnerCount > 0 ? setConfirmLeave(true) : onLeave())} disabled={loading}>
            Chọn tình huống khác
          </Button>
        </div>
        {!over && learnerCount === 0 && (
          <p id={finishHintId} className="px-1 text-sm text-muted">
            Gửi ít nhất một tin nhắn để xem tóm tắt nhé.
          </p>
        )}
      </div>
      <LeaveRoleplayDialog
        open={confirmLeave}
        triggerRef={leaveRef}
        onStay={() => setConfirmLeave(false)}
        onLeave={() => {
          setConfirmLeave(false);
          onLeave();
        }}
      />
    </div>
  );
}
