import { StaleNote } from '@/components/ui/StaleNote';
import { inputClasses } from '@/components/ui/Input';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, FileUp, NotebookPen, Pencil, Play, Search, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { LANGUAGES, exportFileName, wordRowsToCsv, type PersonalWord } from '@linguo/shared';
import { SpeakButton } from '@/components/exercise/SpeakButton';
import { Button, buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { downloadTextFile } from '@/lib/download';
import { playSound } from '@/lib/sound';
import { WORD_STATE_LABELS, filterWords, type WordStateFilter } from '@/features/personal-vocab/file';
import { usePersonalLists } from '@/features/personal-vocab/usePersonalLists';
import { usePersonalWords } from '@/features/personal-vocab/usePersonalWords';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { ImportDialog } from './ImportDialog';
import { ListFormDialog } from './ListFormDialog';
import { WordEditDialog } from './WordEditDialog';

const PAGE_SIZE = 100;

const ICON_BTN =
  'inline-flex size-11 items-center justify-center rounded-full border border-border bg-text/[0.03] text-muted transition-[background-color,color,scale] duration-150 hover:bg-text/8 hover:text-text active:scale-95';

const STATE_LABELS = WORD_STATE_LABELS;
const STATE_OPTIONS: ReadonlyArray<{ value: WordStateFilter; label: string }> = [
  { value: 'all', label: 'Mọi trạng thái' },
  { value: 'new', label: STATE_LABELS.new },
  { value: 'learning', label: STATE_LABELS.learning },
  { value: 'relearning', label: STATE_LABELS.relearning },
  { value: 'review', label: STATE_LABELS.review },
];

/** /app/tu-vung-cua-toi/:listId: the words of one list, with import, edit, delete and the review entry. */
export function PersonalListPage() {
  const { listId = null } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const lists = usePersonalLists();
  const words = usePersonalWords(listId);
  const list = lists.lists.find((l) => l.id === listId) ?? null;

  const [importing, setImporting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<PersonalWord | null>(null);
  const [removing, setRemoving] = useState<PersonalWord | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<WordStateFilter>('all');
  const searchId = useId();
  const matches = useMemo(() => filterWords(words.words, query, stateFilter), [words.words, query, stateFilter]);
  const importRef = useRef<HTMLButtonElement>(null);
  const renameRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const rowTrigger = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** Delete buttons by word id, to move focus to a neighbour once a word (and its button) is gone. */
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>());
  /** Where focus goes after a word is deleted: a neighbouring word's id, or null for the list heading. */
  const focusAfterDelete = useRef<{ wordId: string | null } | null>(null);

  // The dialog returns focus to the delete button it was opened from, but that button left with its row.
  useEffect(() => {
    const pending = focusAfterDelete.current;
    if (removing !== null || !pending) return;
    focusAfterDelete.current = null;
    const next = pending.wordId ? deleteButtons.current.get(pending.wordId) : undefined;
    (next ?? headingRef.current)?.focus();
  }, [removing]);

  const back = (
    <Link
      to="/app/tu-vung-cua-toi"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-text/5 pl-3 pr-4 text-[14px] font-semibold text-muted transition-[background-color,color,scale] hover:bg-text/10 hover:text-text active:scale-95"
    >
      <ArrowLeft aria-hidden className="size-4" />
      Từ vựng của tôi
    </Link>
  );

  if (lists.status === 'loading' || (lists.status === 'ready' && list && words.status === 'loading')) {
    return (
      <div className="space-y-6">
        {back}
        <div role="status" className="space-y-3">
          <span className="sr-only">Đang tải danh sách…</span>
          <Skeleton className="block h-10 w-64" />
          <Skeleton className="block h-64 w-full rounded-3xl" />
        </div>
      </div>
    );
  }
  if (lists.status === 'error' && !list) {
    return (
      <div className="space-y-6">
        {back}
        <ErrorState title="Không tải được danh sách" description={lists.error ?? undefined} onRetry={lists.reload} />
      </div>
    );
  }
  if (!list) {
    return (
      <div className="space-y-6">
        {back}
        <EmptyState
          icon={NotebookPen}
          title="Không tìm thấy danh sách"
          description="Danh sách này không tồn tại hoặc đã bị xoá."
          action={
            <Link to="/app/tu-vung-cua-toi" className={buttonClasses('accent')}>
              Về Từ vựng của tôi
            </Link>
          }
        />
      </div>
    );
  }

  const language = LANGUAGES[list.language_code];
  /** Computed by the server in the learner's own timezone. */
  const dueCount = list.due_count;
  const items = words.words;
  const filtering = query.trim() !== '' || stateFilter !== 'all';
  const visible = matches.slice(0, shown);
  /** The server's count stays right when the words themselves failed to load. */
  const wordCount = words.status === 'ready' ? items.length : list.word_count;

  return (
    <div className="space-y-6">
      {back}
      <div className="space-y-1">
        <h1 ref={headingRef} tabIndex={-1} className="break-words page-title focus:outline-none">
          {list.name}
        </h1>
        <p className="pt-2 text-[15px] text-muted">
          {language.nameVi} · {wordCount} từ{dueCount > 0 ? ` · ${dueCount} từ cần ôn hôm nay` : ''}
        </p>
        <div aria-hidden="true" className="flex gap-6 pt-3">
          <span>
            <span className="eyebrow block">Từ</span>
            <span className="stat-num mt-1.5 block text-[48px]">{wordCount}</span>
          </span>
          <span>
            <span className="eyebrow block">Cần ôn</span>
            <span className={cn('stat-num mt-1.5 block text-[48px]', dueCount > 0 ? 'text-accent-text' : 'text-muted')}>{dueCount}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {dueCount > 0 ? (
          <Link to={`/app/tu-vung-cua-toi/${list.id}/on-tap`} className={cn(buttonClasses('accent', 'lg'), 'w-full sm:w-auto')}>
            <Play aria-hidden className="size-5" />
            Ôn danh sách này
          </Link>
        ) : null}
        <Button ref={importRef} variant={dueCount > 0 ? 'ghost' : 'accent'} onClick={() => setImporting(true)}>
          <FileUp aria-hidden className="size-5" />
          Nhập từ CSV
        </Button>
        <Button
          variant="ghost"
          disabled={items.length === 0}
          hint={items.length === 0 ? 'Danh sách chưa có từ nào để xuất.' : undefined}
          onClick={() => {
            downloadTextFile(wordRowsToCsv(items), exportFileName(list.name), 'text/csv;charset=utf-8');
            toast.show({ tone: 'success', message: `Đã tải ${items.length} từ ra file CSV.` });
          }}
        >
          <Download aria-hidden className="size-5" />
          Xuất CSV
        </Button>
        <div className="ml-auto flex gap-1.5">
          <button ref={renameRef} type="button" aria-label="Đổi tên" title="Đổi tên" onClick={() => setRenaming(true)} className={ICON_BTN}>
            <Pencil aria-hidden className="size-5" />
          </button>
          <button
            ref={deleteRef}
            type="button"
            aria-label="Xoá danh sách"
            title="Xoá danh sách"
            onClick={() => setDeleting(true)}
            className={cn(ICON_BTN, 'hover:bg-error/10 hover:text-error-text')}
          >
            <Trash2 aria-hidden className="size-5" />
          </button>
        </div>
      </div>

      <StaleNote stale={words.stale || lists.stale} updatedAt={words.updatedAt ?? lists.updatedAt} />

      {words.status === 'error' && (
        <ErrorState title="Không tải được các từ" description={words.error ?? undefined} onRetry={words.reload} headingLevel="h2" />
      )}

      {words.status === 'ready' && items.length === 0 && (
        <EmptyState
          icon={FileUp}
          title="Danh sách đang trống"
          description="Nhập file CSV hoặc dán danh sách từ của bạn. Mỗi dòng chỉ cần có từ và nghĩa."
          action={
            <Button variant="accent" onClick={() => setImporting(true)}>
              Nhập từ đầu tiên
            </Button>
          }
        />
      )}

      {words.status === 'ready' && items.length > 0 && dueCount === 0 && (
        <p role="status" className="rounded-2xl bg-success/10 px-4 py-3 text-[15px] ring-1 ring-success/25 ring-inset">
          Hôm nay bạn đã ôn xong danh sách này. Quay lại vào lúc khác nhé, Linguo sẽ nhắc đúng lúc.
        </p>
      )}

      {items.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor={searchId} className="mb-1 block px-1 text-sm font-medium">
              Tìm trong danh sách
            </label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                id={searchId}
                type="search"
                value={query}
                lang={list.language_code}
                autoComplete="off"
                spellCheck={false}
                maxLength={120}
                placeholder="Từ, nghĩa, ví dụ hoặc ghi chú"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(PAGE_SIZE);
                }}
                className={cn(inputClasses(false), 'min-h-11 pl-10')}
              />
            </div>
          </div>
          <div className="sm:w-52">
            <label htmlFor={`${searchId}-state`} className="mb-1 block px-1 text-sm font-medium">
              Trạng thái
            </label>
            <select
              id={`${searchId}-state`}
              value={stateFilter}
              onChange={(e) => {
                setStateFilter(e.target.value as WordStateFilter);
                setShown(PAGE_SIZE);
              }}
              className={cn(inputClasses(false), 'min-h-11 appearance-none py-2 pr-8 text-[15px]')}
            >
              {STATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {filtering && items.length > 0 && (
        <p role="status" className="px-1 text-[15px] text-muted">
          {matches.length === 0 ? 'Không có từ nào khớp.' : `${matches.length} trên ${items.length} từ khớp.`}{' '}
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setStateFilter('all');
            }}
            className="min-h-11 font-semibold underline"
          >
            Xoá bộ lọc
          </button>
        </p>
      )}

      {matches.length > 0 && (
        <div role="region" aria-label="Các từ trong danh sách" tabIndex={0} className="max-w-full overflow-x-auto card">
          <table className="w-full min-w-0 text-left text-[15px]">
            <caption className="sr-only">
              Danh sách {matches.length === items.length ? `${items.length} từ` : `${matches.length} trên ${items.length} từ`} của “{list.name}”
            </caption>
            <thead className="bg-text/[0.04] text-xs uppercase tracking-[0.06em] text-muted">
              <tr>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Từ
                </th>
                <th scope="col" className="hidden px-3 py-3 font-semibold sm:table-cell">
                  Phát âm
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Nghĩa
                </th>
                <th scope="col" className="hidden px-3 py-3 font-semibold sm:table-cell">
                  Trạng thái
                </th>
                <th scope="col" className="px-2 py-3 text-right font-semibold">
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((word) => (
                <tr key={word.id} className="border-t border-border align-top">
                  <td className="break-words px-3 py-3 font-semibold">
                    <div className="flex items-center gap-2">
                      <span lang={list.language_code} className="min-w-0">
                        {word.term}
                      </span>
                      <SpeakButton text={word.term} lang={list.language_code} label="Nghe từ" size="sm" />
                    </div>
                  </td>
                  <td className="hidden break-words px-3 py-3 text-muted sm:table-cell">
                    {word.pronunciation ?? (
                      <>
                        <span aria-hidden>—</span>
                        <span className="sr-only">Chưa có</span>
                      </>
                    )}
                  </td>
                  <td className="break-words px-3 py-3">
                    {word.meaning}
                    {word.example && (
                      <span className="mt-0.5 flex items-center gap-2 text-sm text-muted">
                        <span lang={list.language_code} className="min-w-0">
                          {word.example}
                        </span>
                        <SpeakButton text={word.example} lang={list.language_code} label="Nghe câu ví dụ" size="sm" />
                      </span>
                    )}
                    {word.note && <span className="mt-0.5 block text-sm text-muted">{word.note}</span>}
                  </td>
                  <td className="hidden px-3 py-3 text-sm text-muted sm:table-cell">{STATE_LABELS[word.fsrs_state]}</td>
                  <td className="px-1 py-1">
                    {/* Stacked on the narrowest phones so the meaning column keeps room for whole words. */}
                    <div className="flex flex-col items-end min-[400px]:flex-row min-[400px]:justify-end">
                      <button
                        type="button"
                        aria-label={`Sửa từ ${word.term}`}
                        onClick={(e) => {
                          rowTrigger.current = e.currentTarget;
                          setEditing(word);
                        }}
                        className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-text/5 hover:text-text"
                      >
                        <Pencil aria-hidden className="size-4" />
                      </button>
                      <button
                        ref={(el) => {
                          if (el) deleteButtons.current.set(word.id, el);
                          else deleteButtons.current.delete(word.id);
                        }}
                        type="button"
                        aria-label={`Xoá từ ${word.term}`}
                        onClick={(e) => {
                          rowTrigger.current = e.currentTarget;
                          setRemoving(word);
                        }}
                        className="inline-flex size-11 items-center justify-center rounded-full text-muted hover:bg-error/10 hover:text-error"
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {matches.length > shown && (
        <Button variant="ghost" block onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Hiện thêm {Math.min(PAGE_SIZE, matches.length - shown)} từ
        </Button>
      )}

      <ImportDialog
        open={importing}
        language={list.language_code}
        existingCount={items.length}
        triggerRef={importRef}
        onClose={() => setImporting(false)}
        onImport={async (rows) => {
          const result = await words.importRows(rows);
          if (result.added + result.updated > 0) playSound('save');
          lists.reload();
          return result;
        }}
      />
      <ListFormDialog
        open={renaming}
        mode="rename"
        initialName={list.name}
        triggerRef={renameRef}
        onClose={() => setRenaming(false)}
        onSubmit={async (name) => {
          await lists.rename(list.id, name);
          toast.show({ tone: 'success', message: 'Đã đổi tên danh sách.' });
        }}
      />
      <ConfirmDeleteDialog
        open={deleting}
        title={`Xoá “${list.name}”?`}
        description={
          words.status === 'error'
            ? 'Danh sách, mọi từ trong đó và lịch ôn của chúng sẽ bị xoá và không khôi phục được.'
            : wordCount === 0
              ? 'Danh sách đang trống và sẽ bị xoá, không khôi phục được.'
              : `Cả ${wordCount} từ trong danh sách và lịch ôn của chúng sẽ bị xoá và không khôi phục được.`
        }
        confirmLabel="Xoá danh sách"
        triggerRef={deleteRef}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await lists.remove(list.id);
          toast.show({ tone: 'success', message: 'Đã xoá danh sách.', sound: 'remove' });
          navigate('/app/tu-vung-cua-toi');
        }}
      />
      <WordEditDialog
        word={editing}
        language={list.language_code}
        triggerRef={rowTrigger}
        onClose={() => setEditing(null)}
        onSave={async (wordId, fields) => {
          await words.update(wordId, fields);
          toast.show({ tone: 'success', message: 'Đã lưu từ.' });
        }}
      />
      <ConfirmDeleteDialog
        open={removing !== null}
        title={`Xoá từ “${removing?.term ?? ''}”?`}
        description="Từ này và lịch ôn của nó sẽ bị xoá."
        confirmLabel="Xoá từ"
        triggerRef={rowTrigger}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          const index = visible.findIndex((w) => w.id === removing.id);
          const neighbour = visible[index + 1] ?? visible[index - 1] ?? null;
          await words.remove(removing.id);
          playSound('remove');
          focusAfterDelete.current = { wordId: neighbour?.id ?? null };
          lists.reload();
        }}
      />
    </div>
  );
}
