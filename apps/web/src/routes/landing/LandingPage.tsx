import { useState, useContext } from 'react';
import { Navigate } from 'react-router';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { AuthContext } from '@/features/auth/AuthProvider';
import { isStandalone } from '@/features/pwa/useInstallPrompt';
import { FinalCtaSection } from './FinalCtaSection';
import { HeroSection } from './HeroSection';
import { LandingNav } from './LandingNav';
import { MethodSection } from './MethodSection';
import { RouteSection } from './RouteSection';
import { ShowcaseSection } from './ShowcaseSection';
import { StatsSection } from './StatsSection';
import { useHeroReady } from './useHeroReady';

/**
 * The installed app opens at `/` (manifest start_url). A signed-in learner launching it from the home screen wants
 * their lessons, not the marketing page: go straight to /app (which also works offline). In a normal browser tab the
 * landing page stays as is, signed in or not. The loader only shows in standalone mode while the stored session is
 * being read (instant when offline or already refreshed).
 */
export function LandingPage() {
  const auth = useContext(AuthContext);
  const [standalone] = useState(isStandalone);
  if (standalone && auth?.status === 'loading') return <FullScreenLoader />;
  if (standalone && auth?.status === 'signed-in') return <Navigate to="/app" replace />;
  return <MarketingPage />;
}

/** Marketing page: always dark, expressive motion tier. */
function MarketingPage() {
  const ready = useHeroReady();
  return (
    <div data-theme="dark" className="min-h-hero bg-bg text-text min-[1024px]:[&_.px-safe]:pl-[112px]">
      <a href="#main" className="sr-only z-[100] rounded-full bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Bỏ qua tới nội dung
      </a>
      {/* Nav is a sibling of every section, not a hero child: the hero's `isolate` stacking context would let later
          positioned sections paint over the fixed rail/pill. */}
      <LandingNav ready={ready} />
      <HeroSection ready={ready} />
      <main id="main">
        <RouteSection />
        <MethodSection />
        <StatsSection />
        <ShowcaseSection />
      </main>
      <FinalCtaSection />
    </div>
  );
}
