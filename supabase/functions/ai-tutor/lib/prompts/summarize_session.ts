import { type SummarizeSessionOutput, summarizeSessionOutputSchema } from '../../../_shared/ai-contract.ts';
import { header, parseWith, type PromptModule, s, systemPrompt, wrongTask } from './shared.ts';

// Spec 8.2 #9: a warm Vietnamese recap of one study session from a compact, client-built summary (numbers and
// tags only). Never cached (it is about one learner's session); only the input size is logged.

const KIND_LABELS = { review: 'ôn thẻ', lesson: 'bài học', practice: 'luyện tập', recap: 'tổng kết lỗi' } as const;
const STATUS_LABELS = { done: 'đã xong', skipped: 'đã bỏ qua', pending: 'chưa làm' } as const;
const STAGE_LABELS = { recognition: 'nhận biết', recall: 'nhớ lại', application: 'vận dụng' } as const;

export const summarizeSession: PromptModule = {
  task: 'summarize_session',
  version: 'summarize_session@1',
  temperature: 0.4,
  maxOutputTokens: 800,
  system: systemPrompt([
    'Viết lời tổng kết ngắn, ấm áp bằng tiếng Việt cho một phiên học, chỉ dựa trên số liệu được cung cấp.',
    '`recap_vi`: 2–4 câu nói người học đã làm gì (hoạt động, số phút, độ chính xác nếu có). Chỉ dùng đúng các con số được cho, không bịa thêm số liệu, không so sánh với người khác, không gây áp lực về chuỗi ngày học hay điểm số.',
    '`errors_to_remember`: tối đa 3 lỗi cần nhớ, mỗi mục có `tag` chép NGUYÊN VĂN từ danh sách lỗi được cung cấp và `note_vi` là mẹo nhớ ngắn bằng tiếng Việt. Nếu không có danh sách lỗi thì trả về mảng rỗng.',
    '`next_step_vi`: đúng MỘT bước tiếp theo nhỏ, cụ thể, dễ làm.',
    'Giọng văn động viên, tự nhiên; không nhận định về người học (tuổi, năng lực, tính cách).',
  ]),
  responseSchema: s.obj({
    recap_vi: s.str(600),
    errors_to_remember: s.arr(s.obj({ tag: s.str(40), note_vi: s.str(300) }), 0, 3),
    next_step_vi: s.str(300),
  }),
  buildUser(req) {
    if (req.task !== 'summarize_session') return wrongTask('summarize_session', req);
    // Everything here is a number or an enum / pattern-checked key from the contract: no free text.
    const activities = req.activities.map((a) => `- ${KIND_LABELS[a.kind]}: ${STATUS_LABELS[a.status]}, ${a.minutes} phút`);
    const lines = ['Nhiệm vụ: summarize_session', ...header(req), `Tổng thời gian: ${req.minutes} phút`, 'Hoạt động:', ...activities];
    if (req.accuracy_by_stage.length) {
      lines.push(
        'Độ chính xác theo giai đoạn:',
        ...req.accuracy_by_stage.map((a) => `- ${STAGE_LABELS[a.stage]}: đúng ${a.correct}/${a.attempts}`),
      );
    }
    if (req.error_tags.length) {
      lines.push('Lỗi hay gặp (tag: số lần):', ...req.error_tags.map((e) => `- ${e.tag}: ${e.count}`));
    } else {
      lines.push('Lỗi hay gặp: không có.');
    }
    lines.push('', 'Trả về JSON đúng schema.');
    return lines.join('\n');
  },
  cacheable: () => false,
  validate(data, req) {
    const parsed = parseWith(summarizeSessionOutputSchema, data);
    if (!parsed.ok) return parsed;
    const out: SummarizeSessionOutput = parsed.data;
    if (!out.recap_vi.trim()) return { ok: false, error: 'recap_vi must not be empty' };
    if (!out.next_step_vi.trim()) return { ok: false, error: 'next_step_vi must not be empty' };
    if (out.errors_to_remember.some((e) => !e.note_vi.trim())) return { ok: false, error: 'note_vi must not be empty' };
    if (req?.task === 'summarize_session') {
      const known = new Set(req.error_tags.map((e) => e.tag));
      const seen = new Set<string>();
      for (const e of out.errors_to_remember) {
        if (!known.has(e.tag)) return { ok: false, error: `errors_to_remember: unknown tag ${e.tag}` };
        if (seen.has(e.tag)) return { ok: false, error: `errors_to_remember: duplicate tag ${e.tag}` };
        seen.add(e.tag);
      }
    }
    return { ok: true, data: out };
  },
};
