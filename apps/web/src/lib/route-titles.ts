import { matchPath } from 'react-router';

export const APP_NAME = 'Linguo';
/** Landing page title; keep it identical to `<title>` in index.html. */
export const DEFAULT_TITLE = 'Linguo — Học tiếng Anh & tiếng Hàn thông minh';
export const NOT_FOUND_NAME = 'Không tìm thấy trang';

/** Page names by route pattern (basename already stripped); the first match wins. `null` = the landing default. */
const ROUTE_NAMES: ReadonlyArray<readonly [pattern: string, name: string | null]> = [
  ['/', null],
  ['/quyen-rieng-tu', 'Quyền riêng tư'],
  ['/dieu-khoan', 'Điều khoản sử dụng'],
  ['/dang-nhap', 'Đăng nhập'],
  ['/dang-ky', 'Đăng ký'],
  ['/quen-mat-khau', 'Quên mật khẩu'],
  ['/kiem-tra-email', 'Kiểm tra email'],
  ['/auth/callback', 'Đang đăng nhập'],
  ['/dat-lai-mat-khau', 'Đặt lại mật khẩu'],
  ['/app', 'Trang chủ'],
  ['/app/bat-dau', 'Bắt đầu'],
  ['/app/kiem-tra/:pathId', 'Kiểm tra trình độ'],
  ['/app/kiem-tra/:pathId/ket-qua', 'Kết quả kiểm tra'],
  ['/app/hoc-tap', 'Học tập'],
  ['/app/hoc-tap/bai/:lessonId', 'Bài học'],
  ['/app/on-tap', 'Ôn tập'],
  ['/app/phien-hoc', 'Phiên học'],
  ['/app/gia-su', 'Gia sư AI'],
  ['/app/luyen-noi', 'Luyện nói'],
  ['/app/dong-vai', 'Đóng vai với AI'],
  ['/app/luyen-thi', 'Luyện thi'],
  ['/app/luyen-thi/lam-bai/:attemptId', 'Làm bài luyện thi'],
  ['/app/luyen-thi/ket-qua/:attemptId', 'Kết quả luyện thi'],
  ['/app/tien-do', 'Tiến độ'],
  ['/app/cai-dat', 'Cài đặt'],
  ['/app/thong-bao', 'Thông báo'],
  ['/app/tu-vung-cua-toi', 'Từ vựng của tôi'],
  ['/app/tu-vung-cua-toi/:listId', 'Danh sách từ vựng'],
  ['/app/tu-vung-cua-toi/:listId/on-tap', 'Ôn từ vựng của tôi'],
  ['/app/lop-hoc', 'Lớp học'],
  ['/app/lop-hoc/tham-gia', 'Tham gia lớp học'],
  ['/quan-tri', 'Quản trị — Tổng quan'],
  ['/quan-tri/noi-dung', 'Quản trị — Nội dung'],
  ['/quan-tri/noi-dung/:kind/:id', 'Quản trị — Chi tiết nội dung'],
  ['/quan-tri/bao-loi', 'Quản trị — Báo lỗi nội dung'],
  ['/quan-tri/nguon', 'Quản trị — Nguồn và giấy phép'],
  ['/quan-tri/thong-ke', 'Quản trị — Thống kê'],
  ['/quan-tri/nhat-ky', 'Quản trị — Nhật ký'],
  ['/quan-tri/nhan-su', 'Quản trị — Nhân sự'],
];

/** The page name for a pathname, or `null` for the landing page. Unknown paths are the 404 page. */
export function routeName(pathname: string): string | null {
  for (const [pattern, name] of ROUTE_NAMES) {
    if (matchPath({ path: pattern, end: true }, pathname)) return name;
  }
  return NOT_FOUND_NAME;
}

/** "Tên trang · Linguo" (the landing page keeps the full tagline title). */
export function routeDocumentTitle(pathname: string): string {
  const name = routeName(pathname);
  return name ? `${name} · ${APP_NAME}` : DEFAULT_TITLE;
}
