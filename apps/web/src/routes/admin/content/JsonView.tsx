/** Pretty-printed JSON in a scrollable, labelled region (fallback preview and raw private data). */
export function JsonView({ value, label }: { value: unknown; label: string }) {
  return (
    <pre
      role="region"
      aria-label={label}
      tabIndex={0}
      className="max-h-96 overflow-auto rounded-2xl border border-border bg-surface-solid p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-words focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
