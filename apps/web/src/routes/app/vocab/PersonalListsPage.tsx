import { useRef, useState } from 'react';
import { ChevronRight, NotebookPen, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { LANGUAGES, PERSONAL_VOCAB_LIMITS as L } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { usePersonalLists } from '@/features/personal-vocab/usePersonalLists';
import { ListFormDialog } from './ListFormDialog';

/** /app/tu-vung-cua-toi: the learner's own word lists (spec P2), separate from the curated lessons. */
export function PersonalListsPage() {
  const api = usePersonalLists();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const createRef = useRef<HTMLButtonElement>(null);
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
          <p role="alert" className="rounded-2xl border border-error/50 bg-error/10 px-4 py-3 text-[15px] text-error-text">
            {api.error}{' '}
            <button type="button" onClick={api.reload} className="font-semibold underline">
              Thử lại
            </button>
          </p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {api.lists.map((list) => (
            <li key={list.id} className="min-w-0">
              <SolidCard className="p-0">
                <Link to={`/app/tu-vung-cua-toi/${list.id}`} className="flex min-h-20 items-center gap-3 rounded-3xl p-5 hover:bg-text/5">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[17px] font-semibold">{list.name}</span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {LANGUAGES[list.language_code].nameVi} · {list.word_count} từ
                      {list.due_count > 0 ? ` · ${list.due_count} từ cần ôn` : list.word_count > 0 ? ' · hôm nay đã ôn xong' : ''}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
                </Link>
              </SolidCard>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">Từ vựng của tôi</h1>
          <p className="mt-1 max-w-prose text-[15px] text-muted">
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
