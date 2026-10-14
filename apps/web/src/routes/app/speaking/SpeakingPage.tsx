import { useCallback, useId, useState } from 'react';
import { Compass, Lock } from 'lucide-react';
import { Link } from 'react-router';
import { buttonClasses, Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
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
import { ChoiceGroup, FOCUS_RING, SelectField } from './controls';
import { OpenMode } from './OpenMode';
import { RepeatMode } from './RepeatMode';
import { RolePlayMode } from './RolePlayMode';

const MODES: { id: SpeakingMode; label: string }[] = [
  { id: 'repeat', label: 'Nhắc lại câu' },
  { id: 'open', label: 'Trả lời mở' },
  { id: 'roleplay', label: 'Đóng vai' },
];

function PrivacyNote() {
  return (
    <p className="flex items-start gap-2 rounded-2xl border border-border px-4 py-3 text-sm text-muted">
      <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
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
  const [reflections, setReflections] = useState(() => (userId ? loadReflections(userId) : []));
  const transcribeId = useId();
  const lang = material.lang;
  const tts = useTts(lang ?? 'en');

  const onSaveReflection = useCallback(
    (ratings: Ratings) => {
      if (!userId || !lang) return;
      setReflections(saveReflection(userId, { at: new Date().toISOString(), mode, lang, ratings }));
    },
    [userId, lang, mode],
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Luyện nói</h1>
        <p className="text-[15px] text-muted">
          Nói to, nghe lại và tự nhận xét. Đây là luyện tập nhẹ nhàng, không có điểm số hay đánh giá trình độ.
        </p>
      </header>

      {material.status === 'loading' && (
        <div role="status" className="space-y-4">
          <span className="sr-only">Đang chuẩn bị bài luyện nói…</span>
          <Skeleton className="block h-40 w-full rounded-3xl" />
          <Skeleton className="block h-64 w-full rounded-3xl" />
        </div>
      )}

      {material.status === 'ready' && !lang && (
        <EmptyState
          icon={Compass}
          title="Chưa có lộ trình để luyện nói"
          description="Hãy tạo một lộ trình tiếng Anh hoặc tiếng Hàn, rồi quay lại luyện nói nhé."
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
          <SolidCard className="space-y-4">
            <ChoiceGroup label="Chế độ luyện" options={MODES} value={mode} onChange={setMode} />
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
                    checked={transcribe}
                    onChange={(e) => setTranscribe(e.target.checked)}
                    className={`size-5 accent-primary ${FOCUS_RING}`}
                  />
                  Bật bản chép lời tự động (tuỳ chọn)
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
              transcribe={transcribe}
              onSaveReflection={onSaveReflection}
            />
          )}
          {mode === 'open' && (
            <OpenMode
              lang={lang}
              lessonTitle={material.lessonTitle}
              helpSentences={material.usingFallback ? [] : material.sentences}
              transcribe={transcribe}
              onSaveReflection={onSaveReflection}
            />
          )}
          {mode === 'roleplay' && <RolePlayMode lang={lang} tts={tts} transcribe={transcribe} onSaveReflection={onSaveReflection} />}

          {userId && reflections.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
              Bạn đã lưu {reflections.length} lần tự đánh giá trên thiết bị này.
              <Button
                variant="ghost"
                onClick={() => {
                  clearReflections(userId);
                  setReflections([]);
                }}
              >
                Xoá các tự đánh giá đã lưu
              </Button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
