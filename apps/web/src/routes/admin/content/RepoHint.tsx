import { useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { AdminContentDetail } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { yamlHint } from '@/features/admin/yaml-hint';

/** Copies text with the async Clipboard API, falling back to a hidden textarea + execCommand. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or insecure context: try the legacy path.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** "Gợi ý sửa trong repo" (spec 11 §1/§4): file path + YAML of the current row, with a copy button. */
export function RepoHint({ detail }: { detail: AdminContentDetail }) {
  const hint = useMemo(() => yamlHint(detail), [detail]);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle');
  const preRef = useRef<HTMLPreElement>(null);

  const copy = async () => {
    const ok = await copyText(hint.snippet);
    setCopied(ok ? 'ok' : 'failed');
    if (!ok && preRef.current) {
      // Select the snippet so it can be copied by hand.
      const range = document.createRange();
      range.selectNodeContents(preRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[15px] text-muted">
        Nội dung được sửa trong repo rồi nhập lại qua pipeline, không sửa trực tiếp ở đây. Mở file dưới đây, tìm theo key và sửa đoạn YAML tương ứng.
      </p>
      <dl className="grid gap-1 text-[15px] sm:grid-cols-[6rem_minmax(0,1fr)]">
        <dt className="font-semibold text-muted">File</dt>
        <dd className="min-w-0 font-mono text-sm break-all">{hint.path ?? 'Không suy ra được từ key — tìm theo key trong thư mục content/.'}</dd>
        {hint.key && (
          <>
            <dt className="font-semibold text-muted">Key</dt>
            <dd className="min-w-0 font-mono text-sm break-all">{hint.key}</dd>
          </>
        )}
      </dl>
      <pre
        ref={preRef}
        role="region"
        aria-label="Đoạn YAML hiện tại"
        tabIndex={0}
        className="max-h-96 overflow-auto rounded-2xl border border-border bg-surface-solid p-4 font-mono text-[13px] leading-relaxed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
      >
        {hint.snippet}
      </pre>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={() => void copy()}>
          {copied === 'ok' ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          Sao chép YAML
        </Button>
        <span role="status" className="text-sm text-muted">
          {copied === 'ok' ? 'Đã sao chép.' : copied === 'failed' ? 'Không sao chép tự động được; đoạn YAML đã được chọn để bạn tự sao chép.' : ''}
        </span>
      </div>
    </div>
  );
}
