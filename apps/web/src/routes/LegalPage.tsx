import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { SolidCard } from '@/components/ui/SolidCard';

const CONTENT = {
  privacy: {
    title: 'Quyền riêng tư',
    body: [
      'Linguo lưu email, tên hiển thị, múi giờ và tuỳ chọn giao diện để vận hành tài khoản của bạn.',
      'Dữ liệu học tập chỉ bạn xem được; chúng tôi không công khai bảng xếp hạng và không bán dữ liệu.',
      'Bạn có thể yêu cầu xuất hoặc xoá dữ liệu. Chi tiết về lưu trữ, thời hạn và AI sẽ được bổ sung trước khi ra mắt chính thức.',
    ],
  },
  terms: {
    title: 'Điều khoản sử dụng',
    body: [
      'Linguo là công cụ hỗ trợ tự học; kết quả và dự báo tiến độ là ước lượng, không phải cam kết đạt chứng chỉ.',
      'Không dùng dịch vụ để phát tán nội dung vi phạm bản quyền hoặc gây hại.',
      'Điều khoản đầy đủ sẽ được công bố trước khi ra mắt chính thức.',
    ],
  },
} as const;

export function LegalPage({ kind }: { kind: keyof typeof CONTENT }) {
  const page = CONTENT[kind];
  return (
    <main id="main" className="mx-auto max-w-2xl space-y-5 px-safe pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))]">
      <Link to="/" className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary">
        <ArrowLeft aria-hidden className="size-4" />
        Trang chủ
      </Link>
      <h1 className="text-[32px] font-bold tracking-[-0.03em]">{page.title}</h1>
      <p role="note" className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-[15px]">
        Bản nháp — nội dung sẽ được hoàn thiện và rà soát pháp lý trước khi ra mắt chính thức.
      </p>
      <SolidCard className="space-y-3 text-[16px] leading-relaxed">
        {page.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </SolidCard>
    </main>
  );
}
