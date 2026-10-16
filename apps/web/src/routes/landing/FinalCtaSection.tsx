import { Link } from 'react-router';
import { ArrowCTA } from '@/components/ui/ArrowCTA';
import { InstallButton } from '@/features/pwa/InstallButton';

const footerLink = 'inline-flex min-h-11 items-center underline-offset-4 hover:text-text hover:underline';

export function FinalCtaSection() {
  return (
    <>
      <section aria-labelledby="final-cta" className="overflow-x-clip bg-bg px-3 pb-6 min-[1024px]:pl-[104px]">
        <div className="relative isolate mx-auto max-w-5xl overflow-hidden rounded-[2.25rem] bg-[image:var(--hero-bg)] px-6 py-[clamp(48px,9vh,88px)] ring-1 ring-white/10 ring-inset sm:px-12">
          <div aria-hidden="true" className="absolute -bottom-32 -right-16 -z-10 size-96 rounded-full bg-radial from-accent/35 to-transparent to-70%" />
          <div aria-hidden="true" className="absolute -left-24 -top-24 -z-10 size-72 rounded-full bg-radial from-primary/30 to-transparent to-70%" />
          <div className="max-w-3xl space-y-6">
            <h2 id="final-cta" className="font-display text-[clamp(48px,14vw,96px)] font-extrabold uppercase leading-[0.95] text-white">
              <span className="block">Bắt đầu</span> <span className="block">lộ trình</span>{' '}
              <span className="block text-right text-accent sm:text-left">của bạn</span>
            </h2>
            <p className="max-w-md text-[clamp(15px,3.8vw,18px)] text-white/75">
              Miễn phí. Chỉ cần 10–15 phút mỗi ngày để hình thành thói quen học đều đặn.
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <ArrowCTA to="/dang-ky">Bắt đầu miễn phí</ArrowCTA>
              <InstallButton />
            </div>
          </div>
        </div>
      </section>
      <footer className="bg-bg px-safe pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-2 text-sm text-muted">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
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
