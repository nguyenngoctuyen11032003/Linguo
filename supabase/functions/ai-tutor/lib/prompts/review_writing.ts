import { type ReviewWritingOutput, reviewWritingOutputSchema } from '../../../_shared/ai-contract.ts';
import { dataField, header, parseWith, type PromptModule, requireTargetSentence, s, systemPrompt, wrongTask } from './shared.ts';

// Spec 9 X6: practice feedback on an exam essay against the form's rubric. The points are a practice
// estimate, never an official exam score; the corrected version is the learner's own essay, fixed.

export const reviewWriting: PromptModule = {
  task: 'review_writing',
  version: 'review_writing@1',
  temperature: 0.3,
  maxOutputTokens: 2048,
  repairMaxOutputTokens: 2048,
  system: systemPrompt([
    'Nhận xét một bài viết luyện tập của người học theo các tiêu chí chấm (rubric) được cung cấp. Đây là phản hồi luyện tập, không phải điểm chính thức: không gọi điểm là điểm thi, không quy đổi sang cấp/bậc hay điểm của kỳ thi chính thức nào, không dự đoán kết quả thi.',
    '`criteria`: đúng một mục cho MỖI tiêu chí, giữ nguyên `key` và theo đúng thứ tự đã cho; không thêm hay bỏ tiêu chí.',
    '`points`: số nguyên từ 0 đến max_points của tiêu chí đó, chấm công bằng, vừa phải theo mô tả tiêu chí và trình độ người học.',
    '`comment_vi`: nhận xét bằng tiếng Việt, cụ thể: điểm làm tốt và lỗi chính, trích ngắn từ bài viết khi cần (phần trích giữ nguyên ngôn ngữ đích).',
    '`overall_vi`: 2–4 câu tiếng Việt: nhận xét chung và 1–2 việc nên ưu tiên cải thiện.',
    '`corrected_version`: viết lại CHÍNH bài của người học bằng ngôn ngữ đích cho tự nhiên và đúng (tiếng Hàn phải viết bằng Hangul, tiếng Nhật phải viết bằng chữ Nhật: kana, kanji; tiếng Đức giữ đúng du/Sie của bài gốc, viết hoa danh từ, đúng giống, cách, đuôi tính từ và vị trí động từ): sửa lỗi ngữ pháp, từ vựng, chính tả, giữ ý và độ dài gần như bài gốc, vừa trình độ; không thêm lời giải thích hay tiêu đề.',
    'Nếu bài viết lạc đề, viết sai ngôn ngữ hoặc quá ngắn, cho điểm thấp ở tiêu chí liên quan và nói rõ lý do trong nhận xét.',
    'Không suy đoán về người học (tuổi, nghề nghiệp, năng lực).',
  ]),
  responseSchema: s.obj({
    criteria: s.arr(s.obj({ key: s.str(32), points: s.int('0 ≤ points ≤ max_points của tiêu chí'), comment_vi: s.str(500) }), 1, 6),
    overall_vi: s.str(800),
    corrected_version: s.str(2000),
  }),
  buildUser(req) {
    if (req.task !== 'review_writing') return wrongTask('review_writing', req);
    // key and max_points are validated by the contract; labels and descriptions stay inside the data block.
    const rubric = req.rubric.map((r) => `- ${r.key} (tối đa ${r.max_points} điểm): ${r.label_vi} — ${r.description_vi}`).join('\n');
    const lines = [
      'Nhiệm vụ: review_writing',
      ...header(req),
      ...dataField('Tiêu chí chấm', rubric),
      ...dataField('Đề bài', req.prompt),
      ...dataField('Bài viết của người học', req.answer),
      '',
      `Trả về JSON đúng schema: \`criteria\` có đúng ${req.rubric.length} mục theo thứ tự key ${req.rubric.map((r) => r.key).join(', ')}.`,
    ];
    return lines.join('\n');
  },
  // Essays are personal: never cached.
  cacheable: () => false,
  validate(data, req) {
    const parsed = parseWith(reviewWritingOutputSchema, data);
    if (!parsed.ok) return parsed;
    const out: ReviewWritingOutput = parsed.data;
    if (!out.overall_vi.trim()) return { ok: false, error: 'overall_vi must not be empty' };
    if (!out.corrected_version.trim()) return { ok: false, error: 'corrected_version must not be empty' };
    if (out.criteria.some((c) => !c.comment_vi.trim())) return { ok: false, error: 'comment_vi must not be empty' };
    if (req?.task === 'review_writing') {
      const keys = out.criteria.map((c) => c.key);
      if (new Set(keys).size !== keys.length) return { ok: false, error: 'criteria: duplicate key' };
      if (keys.length !== req.rubric.length) return { ok: false, error: 'criteria: one entry per rubric criterion' };
      for (const c of out.criteria) {
        const rubric = req.rubric.find((r) => r.key === c.key);
        if (!rubric) return { ok: false, error: `criteria: unknown key ${c.key}` };
        if (c.points > rubric.max_points) return { ok: false, error: `criteria.${c.key}: points over max_points` };
      }
      const err = requireTargetSentence(req.language, out.corrected_version, 'corrected_version');
      if (err) return { ok: false, error: err };
    }
    return { ok: true, data: out };
  },
};
