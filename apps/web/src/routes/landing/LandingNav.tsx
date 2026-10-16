import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, m as motion } from 'motion/react';
import { Menu, X } from 'lucide-react';
import { Link } from 'react-router';
import { EXPO_OUT, reveal } from '@/design/motion';
import { asset } from '@/lib/asset';
import { InstallButton } from '@/features/pwa/InstallButton';
import { useModalDialog } from '@/lib/useModalDialog';
import { useMotionPrefs } from '@/providers/MotionProvider';

const MENU = [
  { href: '#lo-trinh', label: 'Lộ trình' },
  { href: '#phuong-phap', label: 'Phương pháp' },
];

const MENU_ITEM =
  'inline-flex min-h-14 items-center font-display text-[clamp(44px,13vw,64px)] font-extrabold uppercase leading-none text-white transition-colors hover:text-accent';

export function LandingNav({ ready }: { ready: boolean }) {
  const { reduceMotion } = useMotionPrefs();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useModalDialog(open, close, { triggerRef, containerRef: dialogRef });

  const state = ready ? 'shown' : 'hidden';

  return (
    <>
      {/* Floating glass pill: stays reachable while scrolling the long page. */}
      <header className="fixed inset-x-0 top-0 z-30 px-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]">
        <motion.div
          className="glass mx-auto flex h-14 max-w-5xl items-center justify-between rounded-full pl-3 pr-1.5 shadow-[var(--shadow-dock)]"
          variants={reveal('drop', reduceMotion)}
          initial="hidden"
          animate={state}
        >
          <Link to="/" className="inline-flex min-h-11 items-center gap-2" aria-label="Linguo — trang chủ">
            <img src={asset('brand/logo-mark.svg')} alt="" width={30} height={30} className="size-[30px]" />
            <span className="font-display text-[26px] font-extrabold uppercase leading-none tracking-wide">
              Lin<span className="text-primary">guo</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <InstallButton className="hidden min-[560px]:inline-flex" />
            <Link
              to="/dang-nhap"
              className="hidden min-h-11 items-center rounded-full px-4 text-[14px] font-semibold text-white/85 transition-colors hover:text-white min-[380px]:inline-flex"
            >
              Đăng nhập
            </Link>
            <button
              ref={triggerRef}
              type="button"
              aria-label="Mở menu"
              aria-expanded={open}
              aria-haspopup="dialog"
              onClick={() => setOpen(true)}
              className="inline-flex size-11 items-center justify-center rounded-full bg-white/10 transition-[background-color,scale] hover:bg-white/15 active:scale-95"
            >
              <Menu aria-hidden className="size-6" />
            </button>
          </div>
        </motion.div>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            tabIndex={-1}
            className="fixed inset-0 z-[99] flex flex-col overflow-hidden bg-[image:var(--hero-bg)] px-safe pb-safe pt-[max(0.75rem,env(safe-area-inset-top,0px))]"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduceMotion ? 1 : 1.04 }}
            transition={{ duration: 0.35, ease: EXPO_OUT }}
          >
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-16 size-80 rounded-full bg-radial from-accent/25 to-transparent to-70%" />
            <div className="relative flex h-14 items-center justify-end">
              <button
                type="button"
                aria-label="Đóng menu"
                onClick={() => setOpen(false)}
                className="inline-flex size-11 items-center justify-center rounded-full bg-white/10 transition-[background-color,scale] hover:bg-white/15 active:scale-95"
              >
                <X aria-hidden className="size-6" />
              </button>
            </div>
            <nav aria-label="Menu" className="relative flex flex-1 flex-col justify-center gap-1">
              {[
                ...MENU.map((m) => ({ ...m, kind: 'anchor' as const })),
                { href: '/dang-nhap', label: 'Đăng nhập', kind: 'route' as const },
                { href: '/dang-ky', label: 'Đăng ký', kind: 'route' as const },
              ].map((item, i) => (
                <motion.div
                  key={item.href}
                  className="flex items-baseline gap-4 border-b border-white/10 py-1"
                  initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EXPO_OUT, delay: reduceMotion ? 0 : 0.08 + i * 0.07 }}
                >
                  <span aria-hidden="true" className="stat-num w-8 text-[18px] text-white/40">
                    0{i + 1}
                  </span>
                  {item.kind === 'anchor' ? (
                    <a href={item.href} onClick={() => setOpen(false)} className={MENU_ITEM}>
                      {item.label}
                    </a>
                  ) : (
                    <Link to={item.href} onClick={() => setOpen(false)} className={MENU_ITEM}>
                      {item.label}
                    </Link>
                  )}
                </motion.div>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
