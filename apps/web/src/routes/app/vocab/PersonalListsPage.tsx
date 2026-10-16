import { useId, useRef, useState } from 'react';
import { ChevronRight, NotebookPen, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { LANGUAGES, PERSONAL_VOCAB_LIMITS as L } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { useToast } from '@/components/ui/Toast';
import { usePersonalLists } from '@/features/personal-vocab/usePersonalLists';
import { ListFormDialog } from './ListFormDialog';

/** /app/tu-vung-cua-toi: the learner's own word lists (spec P2), separate from the curated lessons. */
export function PersonalListsPage() {
  const api = usePersonalLists();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const createRef = useRef<HTMLButtonElement>(null);
  const listsHeadingId = useId();
  const atLimit = api.lists.length >= L.maxLists;

  let content;
  if (api.status === 'loading') {
    content = (
      <div role="status" className="space-y-3">
        <span className="sr-only">Đang tải danh sách từ…</span>
        <Skeleton className="block h-24 w-full rounded-3xl" />
        <Skeleton className="block h-24 w-full rounded-3xl" />
      </div>
    );
  } else if (api.status === 'error' && api.lists.length === 0) {
    content = <ErrorState title="Không tải được danh sách từ" description={api.error ?? undefined} onRetry={api.reload} />;
  } else if (api.lists.length === 0) {
    content = (
      <EmptyState
        icon={NotebookPen}
        title="Chưa có danh sách nào"
        description="Hãy tạo một danh sách rồi nhập từ bạn gặp hằng ngày từ file CSV. Linguo sẽ nhắc bạn ôn đúng lúc, giống như các thẻ trong bài học."
        action={
          <Button variant="accent" onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-5" />
            Tạo danh sách đầu tiên
          </Button>
        }
      />
    );
  } else {
    content = (
      <>
        {api.status === 'error' && (
          <p role="alert" className="rounded-2xl bg-error/10 px-4 py-3 text-[15px] text-error-text ring-1 ring-error/40 ring-inset">
            {api.error}{' '}
            <button type="button" onClick={api.reload} className="-my-2 inline-flex min-h-11 min-w-11 items-center justify-center px-1 font-semibold underline">
              Thử lại
            </button>
          </p>
        )}
        <section aria-labelledby={listsHeadingId} className="space-y-3">
          <h2 id={listsHeadingId} className="eyebrow px-1">
            Danh sách của tôi
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {api.lists.map((list) => (
              <li key={list.id} className="min-w-0">
                <div className="card">
                  <Link
                    to={`/app/tu-vung-cua-toi/${list.id}`}
                    className="group flex min-h-20 items-center gap-3.5 rounded-[1.75rem] py-3.5 pl-3.5 pr-3 transition-[background-color,scale] hover:bg-text/[0.03] active:scale-[0.99]"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-2xl ring-1 ring-inset',
                        list.due_count > 0 ? 'bg-accent/12 text-accent-text ring-accent/30' : 'bg-text/[0.04] ring-border',
                      )}
                    >
                      <span className="stat-num text-[26px] leading-none">{list.due_count > 0 ? list.due_count : list.word_count}</span>
                      <span className="mt-0.5 text-[12px] font-semibold uppercase leading-none text-muted">{list.due_count > 0 ? 'cần ôn' : 'từ'}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 break-words text-[16px] font-bold leading-snug tracking-[-0.01em]">{list.name}</span>
                      <span className="mt-0.5 block text-[13px] text-muted">
                        {LANGUAGES[list.language_code].nameVi} · {list.word_count} từ
                        {list.due_count > 0 ? ` · ${list.due_count} từ cần ôn` : list.word_count > 0 ? ' · hôm nay đã ôn xong' : ''}
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Từ vựng của tôi</h1>
          <p className="mt-2 max-w-prose text-[15px] text-muted">
            Danh sách riêng của bạn, chỉ mình bạn thấy. Ôn bằng cùng lịch ôn thông minh với các thẻ trong bài học.
          </p>
        </div>
        {api.lists.length > 0 && (
          <Button ref={createRef} disabled={atLimit} onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-5" />
            Tạo danh sách
          </Button>
        )}
      </div>
      {atLimit && <p className="text-sm text-muted">Bạn đã có {L.maxLists} danh sách, mức tối đa. Hãy xoá bớt một danh sách để tạo mới.</p>}
      {content}
      <ListFormDialog
        open={creating}
        mode="create"
        triggerRef={createRef}
        onClose={() => setCreating(false)}
        onSubmit={async (name, language) => {
          await api.create(name, language);
          toast.show({ tone: 'success', message: 'Đã tạo danh sách. Giờ hãy nhập từ vào nhé!' });
        }}
      />
    </div>
  );
}
