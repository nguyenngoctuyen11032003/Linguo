import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { usePreferencesSync } from '@/features/preferences/usePreferencesSync';
import { AppBar } from './AppBar';
import { BottomNav } from './BottomNav';
import { MoreSheet } from './MoreSheet';
import { Sidebar } from './Sidebar';
import { SyncStatusChip } from './SyncStatusChip';

const COLLAPSE_KEY = 'linguo.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppLayout() {
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const { pathname } = useLocation();
  usePreferencesSync();

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage unavailable: the preference just is not remembered */
    }
  }, [collapsed]);

  return (
    <div className="shell min-h-hero bg-bg" data-sidebar={collapsed ? 'collapsed' : 'open'}>
      <a href="#main" className="sr-only z-[100] rounded-full bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Bỏ qua tới nội dung
      </a>
      <Sidebar className="hidden lg:flex" collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="shell__col">
        <AppBar />
        <SyncStatusChip />
        <main id="main" className="shell__main">
          <div key={pathname} className="shell__route">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav className="lg:hidden" onMore={() => setMoreOpen(true)} moreOpen={moreOpen} moreTriggerRef={moreTriggerRef} />
      <MoreSheet open={moreOpen} onClose={closeMore} triggerRef={moreTriggerRef} />
    </div>
  );
}
