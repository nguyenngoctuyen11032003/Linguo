/** Short learning tips / fun facts shown by FullScreenLoader when a load takes a while. */
export interface LoadingTip {
  /** Lead-in shown in the accent colour. */
  lead: 'Mẹo:' | 'Bạn có biết?';
  text: string;
}

export const LOADING_TIPS: readonly LoadingTip[] = [
  { lead: 'Mẹo:', text: 'Tự nhớ lại đáp án trước khi lật thẻ — não ghi nhớ tốt nhất khi phải cố gắng một chút.' },
  { lead: 'Mẹo:', text: '10 phút mỗi ngày hiệu quả hơn hẳn một buổi dài mỗi tuần.' },
  { lead: 'Bạn có biết?', text: 'Bảng chữ cái Hangul được vua Sejong cho ra đời năm 1443.' },
  { lead: 'Mẹo:', text: 'Đọc to câu mẫu giúp bạn nhớ lâu hơn là chỉ đọc thầm.' },
  { lead: 'Bạn có biết?', text: 'Nhiều từ tiếng Hàn gốc Hán nghe rất giống tiếng Việt: “hak-saeng” là học sinh.' },
  { lead: 'Mẹo:', text: 'Học cả cụm từ thay vì từng từ rời rạc — bạn sẽ nói tự nhiên hơn.' },
  { lead: 'Mẹo:', text: 'Sai cũng là học. Mỗi lỗi được giải thích là một bước tiến trên lộ trình.' },
  { lead: 'Bạn có biết?', text: 'Ôn lại đúng lúc sắp quên giúp từ mới “bám” lâu hơn nhiều lần.' },
];
