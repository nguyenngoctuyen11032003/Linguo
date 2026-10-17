import { type GeneratePracticeOutput, generatePracticeOutputSchema } from '../../../_shared/ai-contract.ts';
import { dataField, header, lessonBlock, parseWith, type PromptModule, requireTargetScript, s, systemPrompt, wrongTask } from './shared.ts';

const SKILL_LABELS = { vocabulary: 'từ vựng', grammar: 'ngữ pháp', reading: 'đọc hiểu' } as const;

export const generatePractice: PromptModule = {
  task: 'generate_practice',
  version: 'generate_practice@1',
  temperature: 0.5,
  maxOutputTokens: 1200,
  system: systemPrompt([
    'Tạo câu hỏi trắc nghiệm luyện tập ngắn, mỗi câu có đúng MỘT đáp án đúng.',
    '`question`: đề bài; nội dung cần luyện viết bằng ngôn ngữ đích (tiếng Hàn phải viết bằng Hangul, tiếng Nhật phải viết bằng chữ Nhật: kana, kanji; tiếng Đức viết đúng chính tả có ä, ö, ü, ß, danh từ viết hoa), lời dẫn có thể bằng tiếng Việt.',
    '`options`: 3–4 lựa chọn khác nhau, không trùng lặp, các phương án nhiễu phải hợp lý nhưng sai rõ ràng.',
    '`answer`: chép NGUYÊN VĂN một phần tử trong `options`.',
    '`explanation_vi`: giải thích bằng tiếng Việt vì sao đáp án đúng và vì sao lựa chọn nhiễu sai.',
    'Độ khó vừa với trình độ đã nêu; không sao chép đề thi chính thức; không tạo câu có nhiều đáp án đúng hoặc phụ thuộc kiến thức ngoài ngôn ngữ.',
  ]),
  responseSchema: s.obj({
    items: s.arr(
      s.obj({
        question: s.str(300),
        options: s.arr(s.str(150), 2, 5),
        answer: s.str(150),
        explanation_vi: s.str(500),
      }),
      1,
      5,
    ),
  }),
  buildUser(req, ctx) {
    if (req.task !== 'generate_practice') return wrongTask('generate_practice', req);
    const lines = [
      'Nhiệm vụ: generate_practice',
      ...header(req),
      `Kỹ năng: ${SKILL_LABELS[req.skill]}`,
      `Số câu cần tạo: ${req.count}`,
      ...lessonBlock(ctx.lessonContext),
    ];
    if (req.focus) lines.push(...dataField('Trọng tâm người học muốn luyện', req.focus));
    lines.push('', `Trả về JSON đúng schema với đúng ${req.count} câu trong \`items\`.`);
    return lines.join('\n');
  },
  // Personalised focus text is never cached (spec §3 step 6).
  cacheable: (req) => req.task === 'generate_practice' && !req.focus,
  validate(data, req) {
    const parsed = parseWith(generatePracticeOutputSchema, data);
    if (!parsed.ok) return parsed;
    const out: GeneratePracticeOutput = parsed.data;
    if (req?.task === 'generate_practice' && out.items.length > req.count) {
      return { ok: false, error: `items: expected at most ${req.count}, got ${out.items.length}` };
    }
    for (const [i, item] of out.items.entries()) {
      const options = item.options.map((o) => o.trim());
      if (!item.question.trim()) return { ok: false, error: `items.${i}.question is empty` };
      if (options.some((o) => !o)) return { ok: false, error: `items.${i}.options contains an empty option` };
      if (new Set(options).size !== options.length) return { ok: false, error: `items.${i}.options has duplicates` };
      if (!options.includes(item.answer.trim())) return { ok: false, error: `items.${i}.answer is not one of the options` };
      if (req) {
        const err = requireTargetScript(req.language, [item.question, ...item.options].join(' '), `items.${i}`);
        if (err) return { ok: false, error: err };
      }
    }
    return { ok: true, data: out };
  },
};
