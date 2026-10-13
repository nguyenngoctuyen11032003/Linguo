import { FinalCtaSection } from './FinalCtaSection';
import { HeroSection } from './HeroSection';
import { MethodSection } from './MethodSection';
import { RouteSection } from './RouteSection';
import { ShowcaseSection } from './ShowcaseSection';
import { StatsSection } from './StatsSection';

/** Marketing page: always dark, expressive motion tier. */
export function LandingPage() {
  return (
    <div data-theme="dark" className="min-h-hero bg-bg text-text">
      <a href="#main" className="sr-only z-[100] rounded-full bg-primary px-4 py-2 text-on-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Bỏ qua tới nội dung
      </a>
      <HeroSection />
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
