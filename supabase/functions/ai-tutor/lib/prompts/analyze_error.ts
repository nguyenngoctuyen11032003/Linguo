import { type AnalyzeErrorOutput, analyzeErrorOutputSchema } from '../../../_shared/ai-contract.ts';
import { dataField, header, lessonBlock, parseWith, type PromptModule, requireTargetScript, s, systemPrompt, wrongTask } from './shared.ts';

export const analyzeError: PromptModule = {
  task: 'analyze_error',
  version: 'analyze_error@1',
  temperature: 0.3,
  maxOutputTokens: 900,
  system: systemPrompt([
    'Phân tích bài làm của người học so với đáp án chuẩn của bài tập. Đáp án chuẩn đã được biên tập viên kiểm duyệt: coi đó là đúng, không tranh luận lại.',
    '`verdict`: correct nếu bài làm đúng hoặc tương đương về nghĩa và ngữ pháp; minor_issue nếu chỉ sai chính tả, dấu câu, viết hoa, khoảng cách hoặc lỗi nhỏ; incorrect nếu sai về nghĩa, ngữ pháp hoặc từ vựng.',
    '`error_type`: tên ngắn tiếng Việt của loại lỗi (ví dụ "chia động từ", "trợ từ", "chính tả", "trật tự từ"); null nếu verdict là correct.',
    '`explanation_md`: giải thích bằng tiếng Việt (Markdown đơn giản) vì sao bài làm sai hoặc đúng, chỉ dựa trên đề bài, đáp án chuẩn và bài làm.',
    '`corrected`: câu trả lời đã sửa bằng ngôn ngữ đích (tiếng Hàn phải viết bằng Hangul, tiếng Nhật phải viết bằng chữ Nhật: kana, kanji); null nếu verdict là correct.',
    '`tip_vi`: một mẹo ngắn bằng tiếng Việt để tránh lặp lại lỗi; null nếu không cần.',
    'Nếu bài làm bỏ trống, verdict là incorrect và giải thích đáp án chuẩn.',
    'Không suy đoán về người học (tuổi, nghề nghiệp, năng lực) và không chấm điểm số.',
  ]),
  responseSchema: s.obj({
    verdict: s.enum(['correct', 'minor_issue', 'incorrect']),
    error_type: s.nullableStr(80),
    explanation_md: s.str(1500),
    corrected: s.nullableStr(300),
    tip_vi: s.nullableStr(300),
  }),
  buildUser(req, ctx) {
    if (req.task !== 'analyze_error') return wrongTask('analyze_error', req);
    const answer = req.answer.trim();
    const lines = [
      'Nhiệm vụ: analyze_error',
      ...header(req),
      ...lessonBlock(ctx.lessonContext),
      ...dataField('Đề bài', req.prompt),
      ...dataField('Đáp án chuẩn', req.expected),
      ...(answer ? dataField('Bài làm của người học', answer) : ['', 'Bài làm của người học: (bỏ trống)']),
      '',
      'Trả về JSON đúng schema.',
    ];
    return lines.join('\n');
  },
  // Answers are personal: never cached (spec §3 step 6).
  cacheable: () => false,
  validate(data, req) {
    const parsed = parseWith(analyzeErrorOutputSchema, data);
    if (!parsed.ok) return parsed;
    const out: AnalyzeErrorOutput = parsed.data;
    if (!out.explanation_md.trim()) return { ok: false, error: 'explanation_md must not be empty' };
    if (req && out.corrected?.trim()) {
      const err = requireTargetScript(req.language, out.corrected, 'corrected');
      if (err) return { ok: false, error: err };
    }
    return { ok: true, data: out };
  },
};
