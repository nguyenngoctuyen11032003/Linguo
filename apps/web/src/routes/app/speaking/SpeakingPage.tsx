import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Compass, Lock } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses, Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useOnline } from '@/lib/useOnline';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  clearReflections,
  loadReflections,
  saveReflection,
  type Ratings,
  type SpeakingMode,
} from '@/features/speaking/ratings';
import { isSpeechRecognitionSupported } from '@/features/speaking/useSpeechRecognition';
import { useSpeakingMaterial } from '@/features/speaking/useSpeakingMaterial';
import { useTts } from '@/features/speaking/useTts';
import { ClearReflectionsDialog } from './ClearReflectionsDialog';
import { ChoiceGroup, FOCUS_RING, SelectField } from './controls';
import { OpenMode } from './OpenMode';
import { RepeatMode } from './RepeatMode';
import { RolePlayMode } from './RolePlayMode';

const MODES: { id: SpeakingMode; label: string }[] = [
  { id: 'repeat', label: 'Nhắc lại câu' },
  { id: 'open', label: 'Trả lời mở' },
  // Scripted, no AI. Not "Đóng vai": that name belongs to the AI conversation feature linked from this page's header.
  { id: 'roleplay', label: 'Hội thoại mẫu' },
];

function PrivacyNote() {
  return (
    <p className="flex items-start gap-3 rounded-2xl bg-success/8 px-4 py-3 text-[13px] text-muted ring-1 ring-success/25 ring-inset">
      <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-success-text">
        <Lock className="size-4" />
      </span>
      <span>
        Giọng nói của bạn chỉ nằm trong bộ nhớ của trình duyệt lúc luyện và sẽ biến mất khi bạn rời trang này. Linguo không tải lên hay lưu bản ghi nào.
      </span>
    </p>
  );
}

export function SpeakingPage() {
  const material = useSpeakingMaterial();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [mode, setMode] = useState<SpeakingMode>('repeat');
  const [transcribe, setTranscribe] = useState(false);
  const online = useOnline();
  // The browser's speech service (the optional transcript) needs the network; self-rating and listening do not.
  const transcribing = transcribe && online;
  const [reflections, setReflections] = useState(() => (userId ? loadReflections(userId) : []));
  const transcribeId = useId();
  const lang = material.lang;
  const tts = useTts(lang ?? 'en');

  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const clearedRef = useRef<HTMLParagraphElement>(null);

  // The sample voice belongs to the sentence on screen: switching mode must not keep reading the old one.
  const changeMode = (next: SpeakingMode) => {
    if (next !== mode) tts.stop();
    setMode(next);
  };

  const onSaveReflection = useCallback(
    (ratings: Ratings) => {
      if (!userId || !lang) return;
      setReflections(saveReflection(userId, { at: new Date().toISOString(), mode, lang, ratings }));
      setCleared(false);
    },
    [userId, lang, mode],
  );

  // The clear button is gone after deleting: keep keyboard focus where it was, on the confirmation that replaces it.
  // Runs after the dialog's own clean-up, which can no longer return focus to the removed button.
  useEffect(() => {
    if (cleared) clearedRef.current?.focus();
  }, [cleared]);

  return (
    <div className="space-y-6 lg:max-w-4xl">
      <header className="space-y-1">
        <h1 className="page-title">Luyện nói</h1>
        <p className="text-[15px] text-muted">
          Nói to, nghe lại và tự nhận xét. Đây là luyện tập nhẹ nhàng, không có điểm số hay đánh giá trình độ.
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-[15px] text-muted">
          Muốn trò chuyện tự do hơn?
          <Link
            to="/app/dong-vai"
            className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
          >
            Luyện hội thoại với đối tác AI
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </p>
      </header>

      {material.status === 'loading' && (
        <div role="status" className="space-y-4">
          <span className="sr-only">Đang chuẩn bị bài luyện nói…</span>
          <Skeleton className="block h-40 w-full rounded-3xl" />
          <Skeleton className="block h-64 w-full rounded-3xl" />
        </div>
      )}

      {material.status === 'error' && <ErrorState title="Không tải được lộ trình" onRetry={material.reload} />}

      {material.status === 'ready' && !lang && (
        <EmptyState
          icon={Compass}
          title="Chưa có lộ trình để luyện nói"
          description="Hãy tạo một lộ trình học, rồi quay lại luyện nói nhé."
          action={
            <Link to="/app/bat-dau" className={buttonClasses('primary', 'md')}>
              Tạo lộ trình
            </Link>
          }
        />
      )}

      {material.status === 'ready' && lang && (
        <>
          <PrivacyNote />
          <SolidCard className="space-y-4 max-[379px]:p-4">
            <ChoiceGroup label="Chế độ luyện" options={MODES} value={mode} onChange={changeMode} />
            {mode !== 'roleplay' && material.lessons.length > 0 && (
              <SelectField label="Lấy câu mẫu từ bài" value={material.lessonId ?? ''} onChange={material.selectLesson}>
                {material.lessons.map((l) => (
                  <option key={l.lesson_id} value={l.lesson_id}>
                    {l.title.vi}
                  </option>
                ))}
              </SelectField>
            )}
            {mode !== 'roleplay' && material.usingFallback && (
              <p className="text-sm text-muted">
                Bài này chưa có câu ngắn để nhắc lại, nên Linguo dùng vài câu giao tiếp quen thuộc để bạn luyện.
              </p>
            )}
            {isSpeechRecognitionSupported() && (
              <div className="space-y-1">
                <label htmlFor={transcribeId} className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-medium">
                  <input
                    id={transcribeId}
                    type="checkbox"
                    checked={transcribing}
                    disabled={!online}
                    onChange={(e) => setTranscribe(e.target.checked)}
                    className={`size-5 accent-primary ${FOCUS_RING}`}
                  />
                  Bật bản chép lời tự động (tuỳ chọn){online ? '' : ' · cần mạng'}
                </label>
                <p className="px-1 text-sm text-muted">
                  Một số trình duyệt gửi âm thanh tới dịch vụ nhận dạng giọng nói của hãng trình duyệt để chép lời, nên mục này mặc định tắt. Bản chép có thể sai và bạn tự sửa được.
                </p>
              </div>
            )}
          </SolidCard>

          {mode === 'repeat' && (
            <RepeatMode
              key={`${material.lessonId}:${lang}`}
              lang={lang}
              sentences={material.sentences}
              tts={tts}
              transcribe={transcribing}
              onSaveReflection={onSaveReflection}
            />
          )}
          {mode === 'open' && (
            <OpenMode
              lang={lang}
              lessonTitle={material.lessonTitle}
              helpSentences={material.usingFallback ? [] : material.sentences}
              transcribe={transcribing}
              onSaveReflection={onSaveReflection}
            />
          )}
          {mode === 'roleplay' && <RolePlayMode lang={lang} tts={tts} transcribe={transcribing} onSaveReflection={onSaveReflection} />}

          {userId && reflections.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
              Bạn đã lưu {reflections.length} lần tự đánh giá trên thiết bị này.
              <Button ref={clearButtonRef} variant="ghost" onClick={() => setConfirmClear(true)}>
                Xoá các tự đánh giá đã lưu
              </Button>
            </p>
          )}
          {userId && cleared && reflections.length === 0 && (
            <p ref={clearedRef} tabIndex={-1} className="text-sm text-muted focus:outline-none">
              Đã xoá các tự đánh giá đã lưu trên thiết bị này.
            </p>
          )}
          <ClearReflectionsDialog
            open={confirmClear}
            count={reflections.length}
            triggerRef={clearButtonRef}
            onKeep={() => setConfirmClear(false)}
            onConfirm={() => {
              if (userId) clearReflections(userId);
              setReflections([]);
              setCleared(true);
              setConfirmClear(false);
            }}
          />
        </>
      )}
    </div>
  );
}
