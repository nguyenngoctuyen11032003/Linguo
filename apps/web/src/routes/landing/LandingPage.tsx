import { FinalCtaSection } from './FinalCtaSection';
import { HeroSection } from './HeroSection';
import { LandingNav } from './LandingNav';
import { MethodSection } from './MethodSection';
import { RouteSection } from './RouteSection';
import { ShowcaseSection } from './ShowcaseSection';
import { StatsSection } from './StatsSection';
import { useHeroReady } from './useHeroReady';

/** Marketing page: always dark, expressive motion tier. */
export function LandingPage() {
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
