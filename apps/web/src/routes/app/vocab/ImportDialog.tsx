import { useId, useLayoutEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { FileUp } from 'lucide-react';
import {
  PERSONAL_VOCAB_LIMITS as L,
  isCsvTooLarge,
  parsePersonalVocabCsv,
  toImportRows,
  type CsvParseResult,
  type PersonalImportResult,
  type PersonalWordRow,
} from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { personalVocabErrorMessage, rowReasonMessage } from '@/features/personal-vocab/error-map';
import { VocabDialog } from './VocabDialog';

/** Rows listed in the preview table; the rest are counted. */
export const PREVIEW_ROWS = 50;

export interface ImportDialogProps {
  open: boolean;
  /** Words already in the list, to warn before a list would overflow. */
  existingCount: number;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onImport: (rows: PersonalWordRow[]) => Promise<PersonalImportResult>;
}

type Step = { kind: 'input' } | { kind: 'preview'; parsed: CsvParseResult; source: string } | { kind: 'done'; result: PersonalImportResult };

/**
 * Import words from a CSV file or pasted text. Parsing happens here in the browser; only the rows shown in the
 * preview are sent. Nothing is imported until the learner confirms.
 */
export function ImportDialog({ open, existingCount, triggerRef, onClose, onImport }: ImportDialogProps) {
  return (
    <VocabDialog
      open={open}
      onClose={onClose}
      triggerRef={triggerRef}
      wide
      title="Nhập từ CSV"
      description="Chọn file CSV hoặc dán danh sách từ. Bạn sẽ xem trước trước khi nhập."
    >
      <ImportBody existingCount={existingCount} onClose={onClose} onImport={onImport} />
    </VocabDialog>
  );
}

function ImportBody({ existingCount, onClose, onImport }: Pick<ImportDialogProps, 'existingCount' | 'onClose' | 'onImport'>) {
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

  function preview(source: string) {
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
    setStep({ kind: 'preview', parsed, source });
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
      preview(await file.text());
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
                    <td className="break-words px-3 py-2 font-medium">{row.term}</td>
                    <td className="break-words px-3 py-2">{row.meaning}</td>
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
                      Lý do
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.errors.map((error, index) => (
                    <tr key={`${error.line}-${index}`} className="border-t border-border">
                      <td className="px-3 py-2 text-muted">{error.line}</td>
                      <td className="px-3 py-2">{rowReasonMessage(error.reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.errorCount > parsed.errors.length && <p className="text-sm text-muted">… và {parsed.errorCount - parsed.errors.length} dòng lỗi nữa.</p>}
          </div>
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
        <p lang="ko" className="mt-2 font-mono text-sm">
          단어,뜻,예문
          <br />
          사과,quả táo,사과를 먹어요.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={fileId} className="block px-1 text-sm font-medium">
          Chọn file CSV
        </label>
        <input
          ref={fileRef}
          id={fileId}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          onChange={(e) => void onFile(e)}
          className="block w-full rounded-2xl border border-border bg-surface-solid p-3 text-[15px] file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-on-primary"
        />
        <p className="px-1 text-sm text-muted">Tối đa 1 MB, {L.maxRowsPerImport} dòng mỗi lần. File được đọc ngay trên máy bạn.</p>
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
          placeholder={'apple,quả táo\npear,quả lê'}
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
