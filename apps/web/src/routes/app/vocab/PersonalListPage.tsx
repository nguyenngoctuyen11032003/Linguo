import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileUp, NotebookPen, Pencil, Play, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { LANGUAGES, type PersonalWord } from '@linguo/shared';
import { Button, buttonClasses } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { usePersonalLists } from '@/features/personal-vocab/usePersonalLists';
import { usePersonalWords } from '@/features/personal-vocab/usePersonalWords';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { ImportDialog } from './ImportDialog';
import { ListFormDialog } from './ListFormDialog';
import { WordEditDialog } from './WordEditDialog';

const PAGE_SIZE = 100;

const STATE_LABELS: Record<PersonalWord['fsrs_state'], string> = {
  new: 'Mới',
  learning: 'Đang học',
  relearning: 'Học lại',
  review: 'Đã học',
};

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
    <Link to="/app/tu-vung-cua-toi" className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-muted hover:text-text">
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
  const visible = items.slice(0, shown);
  /** The server's count stays right when the words themselves failed to load. */
  const wordCount = words.status === 'ready' ? items.length : list.word_count;

  return (
    <div className="space-y-6">
      {back}
      <div className="space-y-1">
        <h1 ref={headingRef} tabIndex={-1} className="break-words page-title focus:outline-none">
          {list.name}
        </h1>
        <p className="text-[15px] text-muted">
          {language.nameVi} · {wordCount} từ{dueCount > 0 ? ` · ${dueCount} từ cần ôn hôm nay` : ''}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {dueCount > 0 ? (
          <Link to={`/app/tu-vung-cua-toi/${list.id}/on-tap`} className={buttonClasses('accent')}>
            <Play aria-hidden className="size-5" />
            Ôn danh sách này
          </Link>
        ) : null}
        <Button ref={importRef} variant={dueCount > 0 ? 'ghost' : 'accent'} onClick={() => setImporting(true)}>
          <FileUp aria-hidden className="size-5" />
          Nhập từ CSV
        </Button>
        <Button ref={renameRef} variant="ghost" onClick={() => setRenaming(true)}>
          <Pencil aria-hidden className="size-5" />
          Đổi tên
        </Button>
        <Button ref={deleteRef} variant="danger" onClick={() => setDeleting(true)}>
          <Trash2 aria-hidden className="size-5" />
          Xoá danh sách
        </Button>
      </div>

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
        <p role="status" className="rounded-2xl bg-primary/10 px-4 py-3 text-[15px]">
          Hôm nay bạn đã ôn xong danh sách này. Quay lại vào lúc khác nhé, Linguo sẽ nhắc đúng lúc.
        </p>
      )}

      {items.length > 0 && (
        <div role="region" aria-label="Các từ trong danh sách" tabIndex={0} className="max-w-full overflow-x-auto card">
          <table className="w-full min-w-0 text-left text-[15px]">
            <caption className="sr-only">
              Danh sách {items.length} từ của “{list.name}”
            </caption>
            <thead className="bg-text/5 text-sm">
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
                  <td className="break-words px-3 py-3 font-semibold" lang={list.language_code}>
                    {word.term}
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
                      <span lang={list.language_code} className="mt-0.5 block text-sm text-muted">
                        {word.example}
                      </span>
                    )}
                    {word.note && <span className="mt-0.5 block text-sm text-muted">{word.note}</span>}
                  </td>
                  <td className="hidden px-3 py-3 text-sm text-muted sm:table-cell">{STATE_LABELS[word.fsrs_state]}</td>
                  <td className="whitespace-nowrap px-1 py-1 text-right">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.length > shown && (
        <Button variant="ghost" block onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Hiện thêm {Math.min(PAGE_SIZE, items.length - shown)} từ
        </Button>
      )}

      <ImportDialog
        open={importing}
        existingCount={items.length}
        triggerRef={importRef}
        onClose={() => setImporting(false)}
        onImport={async (rows) => {
          const result = await words.importRows(rows);
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
          toast.show({ tone: 'success', message: 'Đã xoá danh sách.' });
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
          focusAfterDelete.current = { wordId: neighbour?.id ?? null };
          lists.reload();
        }}
      />
    </div>
  );
}
