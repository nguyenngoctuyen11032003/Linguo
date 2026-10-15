import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LanguageCode, PathLesson } from '@linguo/shared';
import { usePathLessons } from '@/features/lesson-player/usePathLessons';
import { getLesson } from '@/features/lesson-player/service';
import { useLearningPaths } from '@/features/learning-paths/LearningPathsProvider';
import { getSupabase } from '@/lib/supabase';
import { FALLBACK_SENTENCES, sentencesFromLesson, type SpeakingSentence } from './content';
import type { SpeakingLanguage } from './ratings';

/** How many lessons the picker offers: what the learner already studied, plus the next one. */
export const LESSON_CHOICES_MAX = 30;

export interface SpeakingMaterial {
  /** 'error': the learning paths could not be loaded, so it is unknown whether the learner has one. */
  status: 'loading' | 'ready' | 'error';
  /** Loads the learning paths again (after 'error'). */
  reload: () => void;
  /** Language of the current learning path; null until a path is known. */
  lang: SpeakingLanguage | null;
  lessons: PathLesson[];
  lessonId: string | null;
  lessonTitle: string | null;
  selectLesson: (id: string) => void;
  sentences: SpeakingSentence[];
  /** The sentences are the built-in starter set (lesson missing, empty or unreachable). */
  usingFallback: boolean;
}

const isSpeakingLanguage = (code: LanguageCode | undefined): code is SpeakingLanguage => code === 'en' || code === 'ko';

/** Studied lessons in path order, then the first lesson that is ready to start. */
export function lessonChoices(lessons: PathLesson[]): PathLesson[] {
  const studied = lessons.filter((l) => l.run_status !== 'not_started');
  const next = lessons.find((l) => l.run_status === 'not_started' && l.prerequisites_met);
  return [...studied, ...(next ? [next] : [])].slice(0, LESSON_CHOICES_MAX);
}

/** The lesson being worked on, else the last finished one, else the first choice. */
export function defaultLessonId(choices: PathLesson[]): string | null {
  return (
    choices.find((l) => l.run_status === 'in_progress') ??
    [...choices].reverse().find((l) => l.run_status === 'completed') ??
    choices[0]
  )?.lesson_id ?? null;
}

/**
 * Practice sentences from a published lesson of the current path, read with the existing lesson services
 * (path_lessons + get_lesson; no new RPC, nothing is started or saved).
 */
export function useSpeakingMaterial(): SpeakingMaterial {
  const { current, currentId, status: pathsStatus, reload } = useLearningPaths();
  const { status: lessonsStatus, lessons } = usePathLessons();
  const lang = isSpeakingLanguage(current?.language) ? current.language : null;
  const choices = useMemo(() => lessonChoices(lessons), [lessons]);
  const [picked, setPicked] = useState<{ pathId: string | null; lessonId: string } | null>(null);
  const lessonId = picked && picked.pathId === currentId && choices.some((l) => l.lesson_id === picked.lessonId) ? picked.lessonId : defaultLessonId(choices);
  const [loaded, setLoaded] = useState<{ pathId: string | null; lessonId: string; sentences: SpeakingSentence[] } | null>(null);

  useEffect(() => {
    if (!lessonId || !currentId || !lang) return;
    const client = getSupabase();
    if (!client) {
      setLoaded({ pathId: currentId, lessonId, sentences: [] });
      return;
    }
    let active = true;
    getLesson(client, lessonId, currentId)
      .then((payload) => {
        if (active) setLoaded({ pathId: currentId, lessonId, sentences: sentencesFromLesson(payload, lang) });
      })
      .catch(() => {
        if (active) setLoaded({ pathId: currentId, lessonId, sentences: [] });
      });
    return () => {
      active = false;
    };
  }, [lessonId, currentId, lang]);

  const selectLesson = useCallback((id: string) => setPicked({ pathId: currentId, lessonId: id }), [currentId]);

  const lessonReady = loaded !== null && loaded.pathId === currentId && loaded.lessonId === lessonId;
  // Lessons are only read for a speaking language: without one there is nothing to wait for (else: endless skeleton).
  const waitingForLesson = lang !== null && lessonId !== null && !lessonReady;
  const status: SpeakingMaterial['status'] =
    pathsStatus === 'error' && !current
      ? 'error'
      : pathsStatus === 'loading' || (currentId !== null && lessonsStatus === 'loading' && lessons.length === 0) || waitingForLesson
        ? 'loading'
        : 'ready';
  const fromLesson = lessonReady ? loaded.sentences : [];
  const usingFallback = fromLesson.length === 0;
  const sentences = usingFallback ? (lang ? FALLBACK_SENTENCES[lang] : []) : fromLesson;
  const lesson = choices.find((l) => l.lesson_id === lessonId);

  return { status, reload, lang, lessons: choices, lessonId, lessonTitle: lesson?.title.vi ?? null, selectLesson, sentences, usingFallback };
}
