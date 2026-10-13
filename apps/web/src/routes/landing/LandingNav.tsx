import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Menu, X } from 'lucide-react';
import { Link } from 'react-router';
import { EXPO_OUT, reveal } from '@/design/motion';
import { asset } from '@/lib/asset';
import { useMotionPrefs } from '@/providers/MotionProvider';

const MENU = [
  { href: '#lo-trinh', label: 'Lộ trình' },
  { href: '#phuong-phap', label: 'Phương pháp' },
];

export function LandingNav({ ready }: { ready: boolean }) {
  const { reduceMotion } = useMotionPrefs();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const state = ready ? 'shown' : 'hidden';

  return (
    <>
      <header className="absolute inset-x-0 top-0 z-20 pt-safe">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-safe">
          <motion.div variants={reveal('slideLeft', reduceMotion)} initial="hidden" animate={state}>
            <Link to="/" className="inline-flex min-h-11 items-center gap-2" aria-label="Linguo — trang chủ">
              <img src={asset('brand/logo-mark.svg')} alt="" width={34} height={34} className="size-[34px]" />
              <span className="font-display text-[clamp(22px,6vw,30px)] uppercase leading-none tracking-wide">
                Lin<span className="text-primary">guo</span>
              </span>
            </Link>
          </motion.div>
          <motion.div className="flex items-center gap-1" variants={reveal('slideRight', reduceMotion)} initial="hidden" animate={state}>
            <Link to="/dang-nhap" className="hidden min-h-11 items-center rounded-full px-4 text-[15px] font-semibold min-[380px]:inline-flex">
              Đăng nhập
            </Link>
            <button
              type="button"
              aria-label="Mở menu"
              aria-expanded={open}
              aria-haspopup="dialog"
              onClick={() => setOpen(true)}
              className="inline-flex size-11 items-center justify-center rounded-full"
            >
              <Menu aria-hidden className="size-7" />
            </button>
          </motion.div>
        </div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-0 z-[99] flex flex-col bg-[linear-gradient(160deg,#0B1420_0%,#12324A_45%,#2F7FB5_100%)] px-safe pb-safe pt-safe"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 1.04 }}
            transition={{ duration: 0.35, ease: EXPO_OUT }}
          >
            <div className="flex h-16 items-center justify-end">
              <button
                type="button"
                aria-label="Đóng menu"
                onClick={() => setOpen(false)}
                className="inline-flex size-11 items-center justify-center rounded-full"
                autoFocus
              >
                <X aria-hidden className="size-7" />
              </button>
            </div>
            <nav aria-label="Menu" className="flex flex-1 flex-col items-center justify-center gap-6">
              {[...MENU.map((m) => ({ ...m, kind: 'anchor' as const })), { href: '/dang-nhap', label: 'Đăng nhập', kind: 'route' as const }, { href: '/dang-ky', label: 'Đăng ký', kind: 'route' as const }].map(
                (item, i) => (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: EXPO_OUT, delay: reduceMotion ? 0 : 0.08 + i * 0.07 }}
                  >
                    {item.kind === 'anchor' ? (
                      <a href={item.href} onClick={() => setOpen(false)} className="inline-flex min-h-12 items-center text-2xl font-semibold text-white">
                        {item.label}
                      </a>
                    ) : (
                      <Link to={item.href} onClick={() => setOpen(false)} className="inline-flex min-h-12 items-center text-2xl font-semibold text-white">
                        {item.label}
                      </Link>
                    )}
                  </motion.div>
                ),
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
