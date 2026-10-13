import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { SolidCard } from '@/components/ui/SolidCard';
import { PRIVACY, TERMS, type LegalDocument } from './content';

const DOCUMENTS = { privacy: PRIVACY, terms: TERMS } as const satisfies Record<string, LegalDocument>;

/** Public /quyen-rieng-tu and /dieu-khoan pages (spec 7 §2). */
export function LegalPage({ kind }: { kind: keyof typeof DOCUMENTS }) {
  const doc = DOCUMENTS[kind];
  const other = kind === 'privacy' ? { to: '/dieu-khoan', label: 'Điều khoản sử dụng' } : { to: '/quyen-rieng-tu', label: 'Quyền riêng tư' };
  return (
    <main
      id="main"
      className="mx-auto max-w-2xl space-y-5 px-safe pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))]"
    >
      <Link to="/" className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary">
        <ArrowLeft aria-hidden className="size-4" />
        Trang chủ
      </Link>
      <div className="space-y-2">
        <h1 className="text-[32px] font-bold tracking-[-0.03em]">{doc.title}</h1>
        <p className="text-[16px] leading-relaxed">{doc.intro}</p>
        <p className="text-sm text-muted">Cập nhật lần cuối: {doc.updated}</p>
      </div>
      {doc.sections.map((section, index) => (
        <SolidCard key={section.heading} role="region" aria-labelledby={`${kind}-${index}`} className="space-y-3 text-[16px] leading-relaxed">
          <h2 id={`${kind}-${index}`} className="text-lg font-bold">
            {section.heading}
          </h2>
          {section.items && (
            <ul className="list-disc space-y-1.5 pl-5">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {section.paragraphs?.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </SolidCard>
      ))}
      <p>
        <Link to={other.to} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
          Xem {other.label}
        </Link>
      </p>
    </main>
  );
}
