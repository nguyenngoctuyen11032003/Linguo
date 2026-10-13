import { useCallback, useState } from 'react';
import { Outlet } from 'react-router';
import { usePreferencesSync } from '@/features/preferences/usePreferencesSync';
import { AppBar } from './AppBar';
import { BottomNav } from './BottomNav';
import { MoreSheet } from './MoreSheet';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  usePreferencesSync();

  return (
    <div className="min-h-hero bg-bg lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only z-[100] rounded-full bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Bỏ qua tới nội dung
      </a>
      <Sidebar className="hidden lg:flex" />
      <div className="flex min-h-hero min-w-0 flex-col">
        <AppBar />
        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-safe pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-5 lg:pb-12">
          <Outlet />
        </main>
      </div>
      <BottomNav className="lg:hidden" onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={closeMore} />
    </div>
  );
}
