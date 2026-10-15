import { BookOpen, Drama, GraduationCap, House, Mic, NotebookPen, RotateCcw, Settings, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Bottom bar (mobile) shows these 4 + "Thêm". Sidebar (desktop ≥1024px) shows all 8 (PRD 12.2). */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/app', label: 'Trang chủ', icon: House, end: true },
  { to: '/app/hoc-tap', label: 'Học tập', icon: BookOpen },
  { to: '/app/on-tap', label: 'Ôn tập', icon: RotateCcw },
  { to: '/app/gia-su', label: 'Gia sư AI', icon: Sparkles },
];

export const MORE_NAV: NavItem[] = [
  { to: '/app/luyen-thi', label: 'Luyện thi', icon: GraduationCap },
  { to: '/app/luyen-noi', label: 'Luyện nói', icon: Mic },
  { to: '/app/dong-vai', label: 'Đóng vai với AI', icon: Drama },
  { to: '/app/tu-vung-cua-toi', label: 'Từ vựng của tôi', icon: NotebookPen },
  { to: '/app/tien-do', label: 'Tiến độ', icon: TrendingUp },
  { to: '/app/cai-dat', label: 'Cài đặt', icon: Settings },
];
