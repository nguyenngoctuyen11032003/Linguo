import { useId, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { Download, FileUp } from 'lucide-react';
import {
  LANGUAGES,
  PERSONAL_VOCAB_LIMITS as L,
  buildCsv,
  buildSampleCsv,
  decodeCsvBytes,
  isCsvTooLarge,
  parsePersonalVocabCsv,
  sampleWordRows,
  toImportRows,
  type CsvEncoding,
  type CsvParseResult,
  type PersonalImportResult,
  type PersonalLanguage,
  type PersonalWordRow,
} from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { personalVocabErrorMessage, rowReasonMessage } from '@/features/personal-vocab/error-map';
import { readFileBytes } from '@/features/personal-vocab/file';
import { downloadTextFile } from '@/lib/download';
import { VocabDialog } from './VocabDialog';

/** Rows listed in the preview table; the rest are counted. */
export const PREVIEW_ROWS = 50;
/** Repeated terms listed in the preview; the rest are counted. */
export const PREVIEW_DUPLICATES = 20;

const ENCODING_LABELS: Record<CsvEncoding, string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16',
  'utf-16be': 'UTF-16',
  shift_jis: 'Shift_JIS (tiếng Nhật)',
  'euc-kr': 'EUC-KR (tiếng Hàn)',
  'windows-1258': 'Windows-1258 (chữ Latin, tiếng Việt)',
};

export interface ImportDialogProps {
  open: boolean;
  /** Language of the list: picks the sample file, the example shown and the code page tried for a non-UTF-8 file. */
  language: PersonalLanguage;
  /** Words already in the list, to warn before a list would overflow. */
  existingCount: number;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onImport: (rows: PersonalWordRow[]) => Promise<PersonalImportResult>;
}

/** `encoding` is set when the file was not UTF-8 and Linguo guessed its code page. */
type Step =
  | { kind: 'input' }
  | { kind: 'preview'; parsed: CsvParseResult; source: string; encoding: CsvEncoding | null }
  | { kind: 'done'; result: PersonalImportResult };

/**
 * Import words from a CSV file or pasted text. Parsing happens here in the browser; only the rows shown in the
 * preview are sent. Nothing is imported until the learner confirms.
 */
export function ImportDialog({ open, language, existingCount, triggerRef, onClose, onImport }: ImportDialogProps) {
  return (
    <VocabDialog
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      wide
      title="Nhập từ CSV"
      description="Chọn file CSV hoặc dán danh sách từ. Bạn sẽ xem trước trước khi nhập."
    >
      <ImportBody language={language} existingCount={existingCount} onClose={onClose} onImport={onImport} />
    </VocabDialog>
  );
}

function ImportBody({ language, existingCount, onClose, onImport }: Pick<ImportDialogProps, 'language' | 'existingCount' | 'onClose' | 'onImport'>) {
  const [step, setStep] = useState<Step>({ kind: 'input' });
  const [text, setText] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /** What receives focus when a step appears: the summary of preview / done, the text box when going back. */
  const stepFocusRef = useRef<HTMLElement | null>(null);
  const shownStep = useRef(step.kind);
  const pasteId = useId();
  const fileId = useId();
  const languageName = LANGUAGES[language].nameVi;
  /** The language without "Tiếng " for sentences like "chữ Hàn". */
  const languageShort = languageName.replace(/^Tiếng /, '');
  /** The first sample row as CSV, shown as the expected format. */
  const formatExample = useMemo(() => {
    const first = sampleWordRows(language)[0];
    return first ? buildCsv([['Từ', 'Nghĩa', 'Ví dụ'], [first.term, first.meaning, first.example]], { bom: false }).trimEnd() : '';
  }, [language]);
  /** The first two sample words, as the placeholder of the paste box. */
  const pasteExample = useMemo(
    () =>
      sampleWordRows(language)
        .slice(0, 2)
        .map((r) => buildCsv([[r.term, r.meaning]], { bom: false }).trimEnd())
        .join('\n'),
    [language],
  );

  // The button that moved to the next step is gone with the old step: start the new one from the top (the dialog
  // body keeps its scroll offset otherwise, hiding the summary on small phones) and move focus to its summary.
  useLayoutEffect(() => {
    if (shownStep.current === step.kind) return;
    shownStep.current = step.kind;
    const target = stepFocusRef.current;
    const body = target?.closest<HTMLElement>('[data-vocab-dialog-body]');
    if (body) body.scrollTop = 0;
    target?.focus({ preventScroll: true });
  }, [step.kind]);

  function preview(source: string, encoding: CsvEncoding | null = null) {
    const parsed = parsePersonalVocabCsv(source);
    if (parsed.fileError === 'too_large') {
      setInputError('File lớn hơn 1 MB nên chưa nhập được. Hãy tách thành các file nhỏ hơn.');
      return;
    }
    if (parsed.fileError === 'empty') {
      setInputError('Chưa thấy dòng từ nào. Mỗi dòng cần có từ và nghĩa, ví dụ: apple,quả táo');
      return;
    }
    setInputError(null);
    setImportError(null);
    setStep({ kind: 'preview', parsed, source, encoding });
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    // Refused before the file is even read.
    if (isCsvTooLarge(file.size)) {
      setInputError('File lớn hơn 1 MB nên chưa nhập được. Hãy tách thành các file nhỏ hơn.');
      return;
    }
    try {
      // UTF-8 (with or without a BOM) and the UTF-16 of Excel's "Unicode Text" are read as they are; any other bytes
      // are read with the code page that fits the list's language, and the preview says so.
      const decoded = decodeCsvBytes(await readFileBytes(file), language);
      preview(decoded.text, decoded.guessed ? decoded.encoding : null);
    } catch {
      setInputError('Không đọc được file này. Hãy thử lưu lại dưới dạng CSV (UTF-8) hoặc dán nội dung vào ô bên dưới.');
    }
  }

  async function confirm(rows: PersonalWordRow[]) {
    setBusy(true);
    setImportError(null);
    try {
      const result = await onImport(rows);
      setStep({ kind: 'done', result });
    } catch (e) {
      setImportError(personalVocabErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === 'done') {
    const { result } = step;
    return (
      <div className="space-y-4">
        <p
          ref={(el) => {
            stepFocusRef.current = el;
          }}
          role="status"
          tabIndex={-1}
          className="rounded-2xl bg-primary/10 px-4 py-3 text-[15px] focus:outline-none"
        >
          Xong rồi! Đã thêm <strong>{result.added}</strong> từ mới
          {result.updated > 0 && <>, cập nhật {result.updated} từ</>}
          {result.unchanged > 0 && <>, {result.unchanged} từ đã có sẵn và giữ nguyên</>}.
          {result.invalid.length > 0 && <> Có {result.invalid.length} dòng chưa nhập được.</>}
        </p>
        <Button size="lg" block onClick={onClose}>
          Đóng
        </Button>
      </div>
    );
  }

  if (step.kind === 'preview') {
    const { parsed } = step;
    const rows = parsed.rows;
    const overflow = Math.max(0, existingCount + rows.length - L.maxWordsPerList);
    return (
      <div className="space-y-4">
        <p
          ref={(el) => {
            stepFocusRef.current = el;
          }}
          role="status"
          tabIndex={-1}
          className="text-[15px] focus:outline-none"
        >
          Đọc được <strong>{rows.length}</strong> từ hợp lệ
          {parsed.errorCount > 0 && <>, {parsed.errorCount} dòng có lỗi sẽ bị bỏ qua</>}
          {parsed.duplicates.length > 0 && <>, {parsed.duplicates.length} dòng trùng từ với dòng trước nên được bỏ qua</>}.
        </p>
        {rows.length > 0 && (
          <p className="text-sm text-muted">
            Từ đã có trong danh sách sẽ không bị thêm lần nữa: Linguo giữ nguyên lịch ôn và chỉ cập nhật nghĩa cùng các cột có nội dung trong file.
          </p>
        )}
        {step.encoding && (
          <p role="note" className="rounded-2xl border border-border px-4 py-3 text-[15px]">
            File này không lưu ở dạng UTF-8 nên Linguo đã đọc theo bảng mã {ENCODING_LABELS[step.encoding]}. Hãy kiểm tra chữ {languageShort} và chữ có dấu trong
            bảng bên dưới; nếu bị sai, hãy lưu lại file dưới dạng “CSV UTF-8”.
          </p>
        )}
        {parsed.encodingSuspect && (
          <p role="note" className="rounded-2xl border border-border px-4 py-3 text-[15px]">
            Có ký tự lạ trong file, có thể file chưa được lưu ở dạng UTF-8. Nếu chữ Hàn hoặc chữ có dấu bị hỏng, hãy lưu lại file dưới dạng “CSV UTF-8”.
          </p>
        )}
        {parsed.skippedOverLimit > 0 && (
          <p role="note" className="rounded-2xl border border-border px-4 py-3 text-[15px]">
            Mỗi lần chỉ nhập tối đa {L.maxRowsPerImport} dòng, nên {parsed.skippedOverLimit} dòng cuối được để lại. Bạn có thể nhập tiếp phần còn lại sau.
          </p>
        )}
        {overflow > 0 && (
          <p role="alert" className="rounded-2xl border border-error/50 bg-error/10 px-4 py-3 text-[15px] text-error-text">
            Danh sách chỉ chứa tối đa {L.maxWordsPerList} từ, nên lần nhập này có thể bị từ chối. Hãy bỏ bớt {overflow} từ hoặc nhập vào danh sách khác.
          </p>
        )}

        {rows.length > 0 && (
          <div role="region" aria-label="Các từ sẽ được nhập" tabIndex={0} className="max-w-full overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-0 text-left text-[15px]">
              <caption className="sr-only">
                Xem trước {Math.min(rows.length, PREVIEW_ROWS)} trên {rows.length} từ sẽ được nhập
              </caption>
              <thead className="bg-text/5 text-sm">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Dòng
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Từ
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Nghĩa
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, PREVIEW_ROWS).map((row) => (
                  <tr key={row.line} className="border-t border-border align-top">
                    <td className="px-3 py-2 text-muted">{row.line}</td>
                    <td lang={language} className="break-words px-3 py-2 font-medium">
                      {row.term}
                      {row.pronunciation && <span className="block text-sm font-normal text-muted">{row.pronunciation}</span>}
                    </td>
                    <td className="break-words px-3 py-2">
                      {row.meaning}
                      {row.example && (
                        <span lang={language} className="mt-0.5 block text-sm text-muted">
                          {row.example}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > PREVIEW_ROWS && <p className="text-sm text-muted">… và {rows.length - PREVIEW_ROWS} từ nữa.</p>}

        {parsed.errors.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[15px] font-semibold">Các dòng bị bỏ qua</h3>
            <div role="region" aria-label="Các dòng bị bỏ qua vì lỗi" tabIndex={0} className="max-h-56 max-w-full overflow-auto rounded-2xl border border-error/40">
              <table className="w-full min-w-0 text-left text-[15px]">
                <caption className="sr-only">Danh sách {parsed.errorCount} dòng có lỗi và lý do</caption>
                <thead className="bg-error/10 text-sm">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Dòng
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Nội dung dòng
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Lý do
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.errors.map((error, index) => (
                    <tr key={`${error.line}-${index}`} className="border-t border-border">
                      <td className="px-3 py-2 text-muted">{error.line}</td>
                      <td className="break-words px-3 py-2 text-muted">{error.excerpt ?? '—'}</td>
                      <td className="px-3 py-2">{rowReasonMessage(error.reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.errorCount > parsed.errors.length && <p className="text-sm text-muted">… và {parsed.errorCount - parsed.errors.length} dòng lỗi nữa.</p>}
          </div>
        )}

        {parsed.duplicates.length > 0 && (
          <details className="rounded-2xl border border-border px-4 py-3 text-[15px]">
            <summary className="min-h-6 cursor-pointer font-semibold">Xem các dòng trùng từ ({parsed.duplicates.length})</summary>
            <ul className="mt-2 space-y-1">
              {parsed.duplicates.slice(0, PREVIEW_DUPLICATES).map((d) => (
                <li key={d.line} className="break-words">
                  Dòng {d.line}: <span lang={language}>{d.term}</span> trùng với dòng {d.firstLine}
                </li>
              ))}
            </ul>
            {parsed.duplicates.length > PREVIEW_DUPLICATES && (
              <p className="mt-2 text-sm text-muted">… và {parsed.duplicates.length - PREVIEW_DUPLICATES} dòng trùng nữa.</p>
            )}
          </details>
        )}

        {importError && (
          <p role="alert" className="rounded-2xl border border-error/50 bg-error/10 px-4 py-3 text-[15px] text-error-text">
            {importError}
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="ghost" size="lg" block disabled={busy} onClick={() => setStep({ kind: 'input' })}>
            Chọn lại
          </Button>
          <Button size="lg" block loading={busy} disabled={rows.length === 0} onClick={() => void confirm(toImportRows(rows))}>
            {rows.length > 0 ? `Nhập ${rows.length} từ` : 'Chưa có từ để nhập'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border px-4 py-3 text-[15px]">
        <p className="font-medium">Định dạng gợi ý</p>
        <p className="mt-1 text-muted">
          Mỗi dòng một từ, các cột cách nhau bằng dấu phẩy, chấm phẩy hoặc Tab. Dòng đầu có thể là tiêu đề (Từ, Nghĩa, Ví dụ, Ghi chú, Phát âm). Nếu không có
          tiêu đề, cột 1 là từ và cột 2 là nghĩa.
        </p>
        <pre lang={language} className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm">
          {formatExample}
        </pre>
        <Button
          variant="ghost"
          onClick={() => downloadTextFile(buildSampleCsv(language), `mau-tu-vung-${language}.csv`, 'text/csv;charset=utf-8')}
          className="mt-2"
        >
          <Download aria-hidden className="size-4" />
          Tải file mẫu ({languageName.toLowerCase()})
        </Button>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={fileId} className="block px-1 text-sm font-medium">
          Chọn file CSV
        </label>
        {/* The native control (with its browser-language "Choose File") stays for keyboard and assistive tech but is
            visually replaced by the drop zone below, which is a second label for the same input. */}
        <input
          ref={fileRef}
          id={fileId}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          onChange={(e) => void onFile(e)}
          className="peer sr-only"
        />
        <label
          htmlFor={fileId}
          aria-hidden="true"
          className="flex min-h-24 cursor-pointer items-center gap-3.5 rounded-2xl border-2 border-dashed border-border bg-text/[0.02] px-4 py-4 transition-colors hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99] peer-focus-visible:border-primary peer-focus-visible:ring-4 peer-focus-visible:ring-primary/40"
        >
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
            <FileUp className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">Chạm để chọn file</span>
            <span className="block text-[13px] text-muted">.csv · .tsv · .txt</span>
          </span>
        </label>
        <p className="px-1 text-sm text-muted">
          Tối đa 1 MB, {L.maxRowsPerImport} dòng mỗi lần. File được đọc ngay trên máy bạn. Khi lưu từ Excel, hãy chọn “CSV UTF-8” để giữ đúng chữ {languageShort}.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={pasteId} className="block px-1 text-sm font-medium">
          Hoặc dán danh sách vào đây
        </label>
        <textarea
          ref={(el) => {
            stepFocusRef.current = el;
          }}
          id={pasteId}
          value={text}
          rows={5}
          onChange={(e) => {
            setText(e.target.value);
            setInputError(null);
          }}
          placeholder={pasteExample}
          lang={language}
          aria-invalid={inputError ? true : undefined}
          aria-describedby={inputError ? `${pasteId}-error` : undefined}
          className="block w-full resize-y rounded-2xl border border-border bg-surface-solid px-4 py-3 font-mono text-[15px] text-text placeholder:text-muted focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/45"
        />
      </div>

      {inputError && (
        <p id={`${pasteId}-error`} role="alert" className="rounded-2xl border border-error/50 bg-error/10 px-4 py-3 text-[15px] text-error-text">
          {inputError}
        </p>
      )}
      <Button size="lg" block disabled={text.trim() === ''} onClick={() => preview(text)}>
        <FileUp aria-hidden className="size-5" />
        Xem trước
      </Button>
    </div>
  );
}
