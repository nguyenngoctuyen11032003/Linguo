import { Link } from 'react-router';
import { ArrowCTA } from '@/components/ui/ArrowCTA';

const footerLink = 'inline-flex min-h-11 items-center underline-offset-4 hover:text-text hover:underline';

export function FinalCtaSection() {
  return (
    <>
      <section aria-labelledby="final-cta" className="overflow-x-clip bg-[#0A1A28] px-safe py-[clamp(56px,10vh,96px)]">
        <div className="mx-auto max-w-3xl space-y-6">
          <h2 id="final-cta" className="font-display text-[clamp(44px,13vw,88px)] uppercase leading-[0.95] text-white">
            Bắt đầu lộ trình <span className="text-accent">của bạn</span>
          </h2>
          <p className="max-w-md text-[clamp(15px,3.8vw,18px)] text-[#B0BCC6]">
            Miễn phí. Chỉ cần 10–15 phút mỗi ngày để hình thành thói quen học đều đặn.
          </p>
          <ArrowCTA to="/dang-ky">Bắt đầu miễn phí</ArrowCTA>
        </div>
      </section>
      <footer className="bg-[#0A1A28] px-safe pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-6 text-sm text-[#8C9AA6]">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Pháp lý" className="flex gap-5">
            <Link to="/quyen-rieng-tu" className={footerLink}>
              Quyền riêng tư
            </Link>
            <Link to="/dieu-khoan" className={footerLink}>
              Điều khoản
            </Link>
          </nav>
          <p>© 2026 Linguo</p>
        </div>
      </footer>
    </>
  );
}
