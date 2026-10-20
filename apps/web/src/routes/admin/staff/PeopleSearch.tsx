import { useId } from 'react';
import { Search } from 'lucide-react';
import { inputClasses } from '@/components/ui/Input';
import { cn } from '@/lib/cn';

/** Search box above a long list of people (name, email or user id; accents and case ignored) with a result count. */
export function PeopleSearch({ label, value, onChange, shown, total }: { label: string; value: string; onChange(value: string): void; shown: number; total: number }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block px-1 text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          id={id}
          type="search"
          value={value}
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
          placeholder="Tên, email hoặc mã người dùng"
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClasses(false), 'min-h-11 pl-10 text-[15px]')}
        />
      </div>
      {value.trim() !== '' && (
        <p role="status" className="px-1 text-sm text-muted">
          {shown} trên {total} khớp.
        </p>
      )}
    </div>
  );
}
