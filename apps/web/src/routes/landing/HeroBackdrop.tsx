export function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="absolute inset-0 -z-20 overflow-hidden bg-bg">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_20%_15%,rgb(76_162_209/0.38),transparent_65%),radial-gradient(ellipse_60%_50%_at_95%_70%,rgb(243_125_37/0.28),transparent_60%),radial-gradient(ellipse_50%_40%_at_40%_100%,rgb(217_161_59/0.18),transparent_70%)]" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="hero-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-grid)" />
      </svg>
    </div>
  );
}
