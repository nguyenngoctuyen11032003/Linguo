import {
  ANALYZE_SENTENCE_MAX_TOKENS,
  type AnalyzeSentenceOutput,
  analyzeSentenceOutputSchema,
  SENTENCE_COMPONENTS,
  SENTENCE_POS,
} from '../../../_shared/ai-contract.ts';
import { hasHangul, hasJapanese } from '../text.ts';
import { dataField, header, normalizeForMatch, parseWith, type PromptModule, s, systemPrompt, wrongTask } from './shared.ts';

// Spec 8.2 #4: part of speech per token, sentence components, grammar points, natural and alternative meanings.
// Rubric (checked in validate): every token and component is copied from the sentence (nothing invented) and
// Korean tokens are written in Hangul and Japanese tokens in kana/kanji, never romanised.

const LATIN_RE = /[A-Za-z]/;

export const analyzeSentence: PromptModule = {
  task: 'analyze_sentence',
  version: 'analyze_sentence@1',
  temperature: 0.3,
  maxOutputTokens: 2048,
  repairMaxOutputTokens: 2048,
  maxArrayLength: ANALYZE_SENTENCE_MAX_TOKENS,
  system: systemPrompt([
    'Phân tích MỘT câu do người học đưa ra, chỉ dựa trên chính câu đó, ở mức vừa trình độ đã nêu.',
    '`translation_vi`: nghĩa tự nhiên của cả câu bằng tiếng Việt (không dịch từng chữ).',
    '`alternative_meanings`: tối đa 3 cách hiểu khác bằng tiếng Việt nếu câu mơ hồ hoặc có nghĩa khác theo ngữ cảnh; mảng rỗng nếu không có.',
    '`tokens`: tách câu thành từ (tiếng Hàn: từ kèm tiểu từ/đuôi câu, có thể tách hình vị; tiếng Nhật: tách từ và trợ từ như は, が, を) theo thứ tự xuất hiện. `text` phải CHÉP NGUYÊN VĂN từ câu: không sửa, không thêm từ không có trong câu, tiếng Hàn phải viết bằng Hangul, tiếng Nhật viết bằng kana/kanji đúng như trong câu, không phiên âm La-tinh. `pos` là một trong: ' +
      SENTENCE_POS.join(', ') +
      ' (tiểu từ tiếng Hàn và trợ từ tiếng Nhật là particle, đuôi từ là ending). `meaning_vi`: nghĩa hoặc chức năng ngắn bằng tiếng Việt.',
    '`components`: các thành phần câu (label thuộc: ' +
      SENTENCE_COMPONENTS.join(', ') +
      '); `text` là đoạn trích NGUYÊN VĂN từ câu, `note_vi` giải thích ngắn bằng tiếng Việt.',
    '`grammar_points`: tối đa 4 điểm ngữ pháp THỰC SỰ xuất hiện trong câu, vừa trình độ; `pattern` là mẫu ngữ pháp, `explanation_vi` giải thích ngắn bằng tiếng Việt.',
    'Nếu câu có lỗi, vẫn phân tích đúng nguyên văn câu (không tự sửa tokens) và nêu lỗi trong `grammar_points` hoặc `uncertainty`.',
    '`confidence`: mức chắc chắn (high/medium/low). `uncertainty`: nếu không phải high, nêu ngắn điều chưa chắc và khuyên đối chiếu bài học đã kiểm duyệt; nếu chắc chắn thì null.',
    'Nếu đầu vào không phải một câu bằng ngôn ngữ đích, đặt confidence là low, giải thích trong `uncertainty`, và vẫn trả về ít nhất một token chép từ đầu vào.',
  ]),
  responseSchema: s.obj({
    translation_vi: s.str(300),
    alternative_meanings: s.arr(s.str(200), 0, 3),
    tokens: s.arr(
      s.obj({ text: s.str(40), pos: s.enum(SENTENCE_POS), meaning_vi: s.str(120) }),
      1,
      ANALYZE_SENTENCE_MAX_TOKENS,
    ),
    components: s.arr(s.obj({ label: s.enum(SENTENCE_COMPONENTS), text: s.str(80), note_vi: s.str(200) }), 0, 8),
    grammar_points: s.arr(s.obj({ pattern: s.str(80), explanation_vi: s.str(300) }), 0, 4),
    confidence: s.enum(['high', 'medium', 'low']),
    uncertainty: s.nullableStr(300),
  }),
  buildUser(req) {
    if (req.task !== 'analyze_sentence') return wrongTask('analyze_sentence', req);
    return [
      'Nhiệm vụ: analyze_sentence',
      ...header(req),
      ...dataField('Câu cần phân tích', req.sentence),
      '',
      'Trả về JSON đúng schema; mọi `text` trong tokens và components phải chép nguyên văn từ câu trên.',
    ].join('\n');
  },
  // The same sentence at the same level gives the same analysis: cacheable like explain_concept.
  cacheable: () => true,
  validate(data, req) {
    const parsed = parseWith(analyzeSentenceOutputSchema, data);
    if (!parsed.ok) return parsed;
    const out: AnalyzeSentenceOutput = parsed.data;
    if (!out.translation_vi.trim()) return { ok: false, error: 'translation_vi must not be empty' };
    if (out.confidence === 'low' && !out.uncertainty?.trim()) return { ok: false, error: 'uncertainty is required when confidence is low' };
    if (out.tokens.some((t) => !t.text.trim() || !t.meaning_vi.trim())) return { ok: false, error: 'tokens: text and meaning_vi must not be empty' };
    if (out.components.some((c) => !c.text.trim())) return { ok: false, error: 'components: text must not be empty' };
    if (req?.task === 'analyze_sentence') {
      const sentence = normalizeForMatch(req.sentence, req.language);
      for (const [i, t] of out.tokens.entries()) {
        if (!sentence.includes(normalizeForMatch(t.text, req.language))) return { ok: false, error: `tokens.${i}: "${t.text}" is not in the sentence` };
        // Korean tokens are written in Hangul; a token with letters but no Hangul is romanisation. Digits and
        // punctuation alone are fine.
        if (req.language === 'ko' && !hasHangul(t.text) && LATIN_RE.test(t.text)) {
          return { ok: false, error: `tokens.${i}: Korean token must be written in Hangul` };
        }
        // Same rule for Japanese: letters without kana or kanji are romaji.
        if (req.language === 'ja' && !hasJapanese(t.text) && LATIN_RE.test(t.text)) {
          return { ok: false, error: `tokens.${i}: Japanese token must be written in kana or kanji` };
        }
      }
      for (const [i, c] of out.components.entries()) {
        if (!sentence.includes(normalizeForMatch(c.text, req.language))) return { ok: false, error: `components.${i}: "${c.text}" is not in the sentence` };
      }
    }
    return { ok: true, data: out };
  },
};
