import { describe, expect, it } from 'vitest';
import { ADMIN_CHILD_PATHS, routes } from '@/app/router';
import { DEFAULT_TITLE, NOT_FOUND_NAME, routeDocumentTitle, routeName } from './route-titles';

describe('routeDocumentTitle', () => {
  it('keeps the tagline title on the landing page', () => {
    expect(routeDocumentTitle('/')).toBe(DEFAULT_TITLE);
  });

  it.each([
    ['/app', 'Trang chủ · Linguo'],
    ['/app/', 'Trang chủ · Linguo'],
    ['/app/hoc-tap', 'Học tập · Linguo'],
    ['/app/hoc-tap/bai/abc', 'Bài học · Linguo'],
    ['/app/on-tap', 'Ôn tập · Linguo'],
    ['/app/kiem-tra/p1', 'Kiểm tra trình độ · Linguo'],
    ['/app/kiem-tra/p1/ket-qua', 'Kết quả kiểm tra · Linguo'],
    ['/app/gia-su', 'Gia sư AI · Linguo'],
    ['/app/luyen-thi', 'Luyện thi · Linguo'],
    ['/app/luyen-thi/lam-bai/a1', 'Làm bài luyện thi · Linguo'],
    ['/app/luyen-thi/ket-qua/a1', 'Kết quả luyện thi · Linguo'],
    ['/app/luyen-noi', 'Luyện nói · Linguo'],
    ['/app/tu-vung-cua-toi', 'Từ vựng của tôi · Linguo'],
    ['/app/tu-vung-cua-toi/l1', 'Danh sách từ vựng · Linguo'],
    ['/app/tu-vung-cua-toi/l1/on-tap', 'Ôn từ vựng của tôi · Linguo'],
    ['/app/tien-do', 'Tiến độ · Linguo'],
    ['/app/cai-dat', 'Cài đặt · Linguo'],
    ['/app/thong-bao', 'Thông báo · Linguo'],
    ['/app/bat-dau', 'Bắt đầu · Linguo'],
    ['/dang-nhap', 'Đăng nhập · Linguo'],
    ['/dang-ky', 'Đăng ký · Linguo'],
    ['/quyen-rieng-tu', 'Quyền riêng tư · Linguo'],
    ['/dieu-khoan', 'Điều khoản sử dụng · Linguo'],
    ['/quan-tri', 'Quản trị — Tổng quan · Linguo'],
    ['/quan-tri/thong-ke', 'Quản trị — Thống kê · Linguo'],
    ['/khong-co-trang-nay', `${NOT_FOUND_NAME} · Linguo`],
  ])('%s -> %s', (path, title) => {
    expect(routeDocumentTitle(path)).toBe(title);
  });

  it('names every concrete route in the router (no route falls through to the 404 title)', () => {
    const paths: string[] = [];
    const walk = (list: typeof routes, base: string) => {
      for (const route of list) {
        const here = route.path ? `${base.replace(/\/$/, '')}/${route.path}`.replace(/\/+/g, '/') : base;
        if (route.path === '*') continue;
        if ((route.index || (route.path && !route.children)) && here !== '/') paths.push(here);
        if (route.children) walk(route.children, here);
      }
    };
    walk(routes, '');
    for (const child of ADMIN_CHILD_PATHS) paths.push(child ? `/quan-tri/${child}` : '/quan-tri');
    expect(paths.length).toBeGreaterThan(20);
    for (const raw of paths) {
      const concrete = raw.replace(/:\w+/g, 'x');
      expect(routeName(concrete), concrete).not.toBe(NOT_FOUND_NAME);
    }
  });
});
