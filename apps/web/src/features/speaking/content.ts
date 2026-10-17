import type { LessonPayload } from '@linguo/shared';
import type { SpeakingLanguage } from './ratings';

// Spec 6.9 practice material. Sentences come from the published lesson examples the learner already has
// client-side (get_lesson); fixed scripts below are only used when a lesson has nothing suitable, and for role-play.
// Nothing here is generated, scored or sent anywhere.

export interface SpeakingSentence {
  id: string;
  text: string;
  /** Vietnamese translation shown under the sentence. */
  translation: string;
}

/** Long paragraphs and "A: … B: …" dialogues do not suit repeat-after-me practice. */
export const SENTENCE_MAX_CHARS = 120;
export const SENTENCES_MAX = 12;

const DIALOGUE_MARKER = /(?:^|\s)[A-Z]\s?:\s/;

export function sentencesFromLesson(payload: LessonPayload, lang: SpeakingLanguage): SpeakingSentence[] {
  const out: SpeakingSentence[] = [];
  payload.lesson.body.forEach((block, index) => {
    if (block.type !== 'example' || block.target_lang !== lang) return;
    const text = block.target.trim();
    if (text.length > SENTENCE_MAX_CHARS || DIALOGUE_MARKER.test(text)) return;
    out.push({ id: `${payload.lesson.id}:${index}`, text, translation: block.translation.vi });
  });
  return out.slice(0, SENTENCES_MAX);
}

export const FALLBACK_SENTENCES: Record<SpeakingLanguage, SpeakingSentence[]> = {
  en: [
    { id: 'fb-en-1', text: 'Nice to meet you.', translation: 'Rất vui được gặp bạn.' },
    { id: 'fb-en-2', text: 'How are you today?', translation: 'Hôm nay bạn thế nào?' },
    { id: 'fb-en-3', text: 'I would like a cup of tea, please.', translation: 'Làm ơn cho tôi một tách trà.' },
    { id: 'fb-en-4', text: 'Could you say that again, please?', translation: 'Bạn làm ơn nói lại được không?' },
    { id: 'fb-en-5', text: 'Where is the station?', translation: 'Nhà ga ở đâu?' },
  ],
  ko: [
    { id: 'fb-ko-1', text: '안녕하세요.', translation: 'Xin chào.' },
    { id: 'fb-ko-2', text: '만나서 반갑습니다.', translation: 'Rất vui được gặp bạn.' },
    { id: 'fb-ko-3', text: '저는 학생입니다.', translation: 'Tôi là học sinh.' },
    { id: 'fb-ko-4', text: '물 한 잔 주세요.', translation: 'Cho tôi một cốc nước.' },
    { id: 'fb-ko-5', text: '다시 한번 말씀해 주세요.', translation: 'Xin hãy nói lại một lần nữa.' },
  ],
  // Polite です/ます form only, N5 vocabulary and kanji (what beginners repeat first).
  ja: [
    { id: 'fb-ja-1', text: 'こんにちは。', translation: 'Xin chào.' },
    { id: 'fb-ja-2', text: 'はじめまして。よろしくおねがいします。', translation: 'Rất vui được gặp bạn. Mong được giúp đỡ.' },
    { id: 'fb-ja-3', text: 'わたしは学生です。', translation: 'Tôi là học sinh.' },
    { id: 'fb-ja-4', text: 'お水をください。', translation: 'Cho tôi nước.' },
    { id: 'fb-ja-5', text: 'もう一度言ってください。', translation: 'Xin hãy nói lại một lần nữa.' },
  ],
  de: [
    { id: 'fb-de-1', text: 'Guten Tag! Wie geht es Ihnen?', translation: 'Chào ông/bà! Ông/bà có khỏe không?' },
    { id: 'fb-de-2', text: 'Freut mich, Sie kennenzulernen.', translation: 'Rất vui được gặp ông/bà.' },
    { id: 'fb-de-3', text: 'Ich komme aus Vietnam.', translation: 'Tôi đến từ Việt Nam.' },
    { id: 'fb-de-4', text: 'Ich hätte gern ein Wasser, bitte.', translation: 'Làm ơn cho tôi một cốc nước.' },
    { id: 'fb-de-5', text: 'Können Sie das bitte wiederholen?', translation: 'Ông/bà có thể nhắc lại được không?' },
  ],
};

export interface OpenPrompt {
  id: string;
  /** Vietnamese instruction. */
  question: string;
  /** Sentence starters in the target language (not a model answer). */
  starter: string;
}

export const OPEN_PROMPTS: Record<SpeakingLanguage, OpenPrompt[]> = {
  en: [
    { id: 'open-en-1', question: 'Hãy giới thiệu bản thân trong 2–3 câu.', starter: 'My name is … I live in … I like …' },
    { id: 'open-en-2', question: 'Hãy kể về một ngày bình thường của bạn.', starter: 'In the morning, I … After that, I …' },
    { id: 'open-en-3', question: 'Cuối tuần bạn thích làm gì?', starter: 'At the weekend, I like to … because …' },
  ],
  ko: [
    { id: 'open-ko-1', question: 'Hãy giới thiệu bản thân trong 2–3 câu.', starter: '저는 …입니다. 저는 …에 살아요.' },
    { id: 'open-ko-2', question: 'Hãy kể về một ngày bình thường của bạn.', starter: '아침에 저는 …. 그리고 ….' },
    { id: 'open-ko-3', question: 'Cuối tuần bạn thích làm gì?', starter: '주말에 저는 …을/를 좋아해요.' },
  ],
  ja: [
    { id: 'open-ja-1', question: 'Hãy giới thiệu bản thân trong 2–3 câu.', starter: 'わたしは…です。…にすんでいます。' },
    { id: 'open-ja-2', question: 'Hãy kể về một ngày bình thường của bạn.', starter: '朝、わたしは…ます。それから、…ます。' },
    { id: 'open-ja-3', question: 'Cuối tuần bạn thích làm gì?', starter: '週末、わたしは…がすきです。' },
  ],
  de: [
    { id: 'open-de-1', question: 'Hãy giới thiệu bản thân trong 2–3 câu.', starter: 'Ich heiße … Ich komme aus … Ich wohne in …' },
    { id: 'open-de-2', question: 'Hãy kể về một ngày bình thường của bạn.', starter: 'Am Morgen stehe ich um … Uhr auf. Danach …' },
    { id: 'open-de-3', question: 'Cuối tuần bạn thích làm gì?', starter: 'Am Wochenende gehe ich gern …, weil …' },
  ],
};

/** The lesson-specific prompt first (when the lesson has a title), then the generic ones. */
export function openPromptsFor(lang: SpeakingLanguage, lessonTitle: string | null): OpenPrompt[] {
  const generic = OPEN_PROMPTS[lang];
  const title = lessonTitle?.trim();
  if (!title) return generic;
  return [{ id: 'open-lesson', question: `Hãy nói 2–3 câu liên quan đến bài “${title}”.`, starter: '' }, ...generic];
}

export interface RolePlayTurn {
  speaker: 'partner' | 'you';
  text: string;
  translation: string;
}

export interface RolePlayScript {
  id: string;
  title: string;
  setting: string;
  turns: RolePlayTurn[];
}

export const ROLE_PLAYS: Record<SpeakingLanguage, RolePlayScript[]> = {
  en: [
    {
      id: 'rp-en-cafe',
      title: 'Gọi đồ uống ở quán cà phê',
      setting: 'Bạn bước vào quán cà phê và gọi một thức uống.',
      turns: [
        { speaker: 'partner', text: 'Hi! What would you like to drink?', translation: 'Chào bạn! Bạn muốn uống gì?' },
        { speaker: 'you', text: 'I would like a cup of tea, please.', translation: 'Làm ơn cho tôi một tách trà.' },
        { speaker: 'partner', text: 'Sure. Anything else?', translation: 'Vâng. Bạn dùng thêm gì không?' },
        { speaker: 'you', text: 'No, thank you. How much is it?', translation: 'Không, cảm ơn. Hết bao nhiêu tiền?' },
        { speaker: 'partner', text: "That's three dollars.", translation: 'Ba đô la ạ.' },
        { speaker: 'you', text: 'Here you are. Thank you!', translation: 'Của bạn đây. Cảm ơn!' },
      ],
    },
    {
      id: 'rp-en-intro',
      title: 'Làm quen với người mới',
      setting: 'Bạn gặp một người bạn mới và chào hỏi.',
      turns: [
        { speaker: 'partner', text: "Hello! I'm Anna. What's your name?", translation: 'Xin chào! Mình là Anna. Bạn tên gì?' },
        { speaker: 'you', text: "Hi, I'm Minh. Nice to meet you.", translation: 'Chào, mình là Minh. Rất vui được gặp bạn.' },
        { speaker: 'partner', text: 'Nice to meet you too. Where are you from?', translation: 'Mình cũng rất vui. Bạn đến từ đâu?' },
        { speaker: 'you', text: "I'm from Vietnam.", translation: 'Mình đến từ Việt Nam.' },
      ],
    },
  ],
  ko: [
    {
      id: 'rp-ko-cafe',
      title: 'Gọi đồ uống ở quán cà phê',
      setting: 'Bạn bước vào quán cà phê và gọi một thức uống.',
      turns: [
        { speaker: 'partner', text: '어서 오세요. 뭘 드릴까요?', translation: 'Xin mời vào. Bạn dùng gì ạ?' },
        { speaker: 'you', text: '커피 한 잔 주세요.', translation: 'Cho tôi một ly cà phê.' },
        { speaker: 'partner', text: '다른 건 필요하세요?', translation: 'Bạn có cần gì khác không?' },
        { speaker: 'you', text: '아니요, 괜찮아요. 얼마예요?', translation: 'Không, đủ rồi. Hết bao nhiêu tiền?' },
        { speaker: 'partner', text: '삼천 원이에요.', translation: 'Ba nghìn won ạ.' },
        { speaker: 'you', text: '여기 있어요. 감사합니다!', translation: 'Của bạn đây. Cảm ơn!' },
      ],
    },
    {
      id: 'rp-ko-intro',
      title: 'Làm quen với người mới',
      setting: 'Bạn gặp một người bạn mới và chào hỏi.',
      turns: [
        { speaker: 'partner', text: '안녕하세요? 저는 민수예요. 이름이 뭐예요?', translation: 'Xin chào! Mình là Minsu. Bạn tên gì?' },
        { speaker: 'you', text: '안녕하세요? 저는 민아예요. 만나서 반갑습니다.', translation: 'Xin chào! Mình là Mina. Rất vui được gặp bạn.' },
        { speaker: 'partner', text: '저도 반가워요. 어느 나라 사람이에요?', translation: 'Mình cũng vui. Bạn là người nước nào?' },
        { speaker: 'you', text: '저는 베트남 사람이에요.', translation: 'Mình là người Việt Nam.' },
      ],
    },
  ],
  ja: [
    {
      id: 'rp-ja-cafe',
      title: 'Gọi đồ uống ở quán cà phê',
      setting: 'Bạn bước vào quán cà phê và gọi một thức uống.',
      turns: [
        { speaker: 'partner', text: 'いらっしゃいませ。ご注文はお決まりですか？', translation: 'Xin mời vào. Quý khách đã chọn được món chưa ạ?' },
        { speaker: 'you', text: 'コーヒーをひとつください。', translation: 'Cho tôi một ly cà phê.' },
        { speaker: 'partner', text: 'ホットとアイス、どちらにしますか？', translation: 'Nóng hay đá ạ?' },
        { speaker: 'you', text: 'アイスでおねがいします。いくらですか？', translation: 'Cho tôi đá. Bao nhiêu tiền ạ?' },
        { speaker: 'partner', text: '四百円です。', translation: 'Bốn trăm yên ạ.' },
        { speaker: 'you', text: 'はい、どうぞ。ありがとうございます。', translation: 'Đây ạ. Cảm ơn!' },
      ],
    },
    {
      id: 'rp-ja-intro',
      title: 'Làm quen với người mới',
      setting: 'Bạn gặp một người bạn mới và chào hỏi.',
      turns: [
        { speaker: 'partner', text: 'はじめまして。わたしはゆいです。おなまえはなんですか？', translation: 'Rất vui được gặp bạn. Mình là Yui. Bạn tên gì?' },
        { speaker: 'you', text: 'はじめまして。ミンです。よろしくおねがいします。', translation: 'Rất vui được gặp bạn. Mình là Minh. Mong được giúp đỡ.' },
        { speaker: 'partner', text: 'こちらこそ。どこから来ましたか？', translation: 'Mình cũng vậy. Bạn đến từ đâu?' },
        { speaker: 'you', text: 'ベトナムから来ました。', translation: 'Mình đến từ Việt Nam.' },
      ],
    },
  ],
  de: [
    {
      id: 'rp-de-cafe',
      title: 'Gọi đồ uống ở quán cà phê',
      setting: 'Bạn bước vào quán cà phê và gọi một thức uống.',
      turns: [
        { speaker: 'partner', text: 'Guten Tag! Was möchten Sie trinken?', translation: 'Chào bạn! Bạn muốn uống gì?' },
        { speaker: 'you', text: 'Ich möchte einen Kaffee, bitte.', translation: 'Cho tôi một cà phê.' },
        { speaker: 'partner', text: 'Gern. Mit Milch?', translation: 'Vâng. Có sữa không ạ?' },
        { speaker: 'you', text: 'Ja, bitte. Was kostet das?', translation: 'Có, làm ơn. Hết bao nhiêu tiền?' },
        { speaker: 'partner', text: 'Das macht drei Euro fünfzig.', translation: 'Ba euro rưỡi ạ.' },
        { speaker: 'you', text: 'Hier, bitte. Danke schön!', translation: 'Của bạn đây. Cảm ơn nhiều!' },
      ],
    },
    {
      id: 'rp-de-intro',
      title: 'Làm quen với người mới',
      setting: 'Bạn gặp một người bạn mới và chào hỏi.',
      turns: [
        { speaker: 'partner', text: 'Hallo! Ich bin Anna. Wie heißt du?', translation: 'Chào! Mình là Anna. Bạn tên gì?' },
        { speaker: 'you', text: 'Hallo, ich heiße Minh. Freut mich!', translation: 'Chào, mình là Minh. Rất vui được gặp bạn!' },
        { speaker: 'partner', text: 'Freut mich auch. Woher kommst du?', translation: 'Mình cũng vui. Bạn đến từ đâu?' },
        { speaker: 'you', text: 'Ich komme aus Vietnam.', translation: 'Mình đến từ Việt Nam.' },
      ],
    },
  ],
};
