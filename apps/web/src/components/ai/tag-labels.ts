// Vietnamese labels for error tags and exercise types shown in the AI result views.
const TAG_LABELS: Record<string, string> = {
  typo: 'Chính tả',
  article: 'Mạo từ a/an/the',
  spacing: 'Khoảng cách giữa các từ',
  particle_allomorph: 'Dạng trợ từ',
  missing_diacritics: 'Thiếu dấu',
  mcq: 'Trắc nghiệm',
  fill_blank: 'Điền chỗ trống',
  word_bank: 'Sắp xếp từ',
  translate: 'Dịch câu',
  listen: 'Nghe',
  roleplay_corrections: 'Lỗi gặp khi đóng vai',
};

export function tagLabel(tag: string): string {
  return TAG_LABELS[tag] ?? tag.replace(/_/g, ' ');
}
