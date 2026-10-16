import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { SolidCard } from '@/components/ui/SolidCard';
import { CONTACT_EMAIL } from '@/features/account/retention';
import { PRIVACY, TERMS, type LegalDocument } from './content';

const DOCUMENTS = { privacy: PRIVACY, terms: TERMS } as const satisfies Record<string, LegalDocument>;

/** The contact address inside a paragraph, as a mailto link the learner can tap. */
function withContactLink(text: string): ReactNode {
  const parts = text.split(CONTACT_EMAIL);
  if (parts.length === 1) return text;
  return parts.flatMap((part, index) =>
    index === 0
      ? [part]
      : [
          <a
            key={index}
            href={`mailto:${CONTACT_EMAIL}`}
            className="wrap-anywhere font-semibold text-primary underline underline-offset-4"
          >
            {CONTACT_EMAIL}
          </a>,
          part,
        ],
  );
}

/** Public /quyen-rieng-tu and /dieu-khoan pages (spec 7 §2). */
export function LegalPage({ kind }: { kind: keyof typeof DOCUMENTS }) {
  const doc = DOCUMENTS[kind];
  const other = kind === 'privacy' ? { to: '/dieu-khoan', label: 'Điều khoản sử dụng' } : { to: '/quyen-rieng-tu', label: 'Quyền riêng tư' };
  return (
    <main
      id="main"
      className="mx-auto max-w-2xl space-y-5 px-safe pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))]"
    >
      <Link
        to="/"
        className="glass inline-flex min-h-11 items-center gap-2 rounded-full pl-3 pr-4 text-[14px] font-semibold text-text transition-[scale] active:scale-95"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Trang chủ
      </Link>
      <div className="space-y-3 pt-2">
        <h1 className="page-title">{doc.title}</h1>
        <p className="text-[16px] leading-relaxed">{doc.intro}</p>
        <p className="eyebrow">Cập nhật lần cuối: {doc.updated}</p>
      </div>
      {doc.sections.map((section, index) => (
        <SolidCard key={section.heading} role="region" aria-labelledby={`${kind}-${index}`} className="space-y-3 text-[16px] leading-relaxed">
          <h2 id={`${kind}-${index}`} className="flex items-baseline gap-3 text-lg font-bold tracking-[-0.01em]">
            <span aria-hidden="true" className="stat-num text-[28px] text-primary">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span>{section.heading}</span>
          </h2>
          {section.items && (
            <ul className="list-disc space-y-1.5 pl-5 marker:text-primary">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {section.paragraphs?.map((p) => (
            <p key={p}>{withContactLink(p)}</p>
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
