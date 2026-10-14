import { useCallback, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { DEFAULT_TIMEZONE } from '@linguo/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import {
  accountErrorMessage,
  clearLocalAccountData,
  DELETE_CONFIRM_PHRASE,
  deleteMyAccount,
  downloadJson,
  exportFileName,
  exportMyData,
} from '@/features/account/service';
import { RETENTION_SUMMARY, STORED_DATA_SUMMARY } from '@/features/account/retention';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/ProfileProvider';
import { todayIso } from '@/lib/dates';
import { hardNavigate } from '@/lib/hard-navigate';
import { requireSupabase } from '@/lib/supabase';
import { useModalDialog } from '@/lib/useModalDialog';

const DELETED_ITEMS = [
  'Tài khoản đăng nhập, email và hồ sơ.',
  'Mọi lộ trình, kết quả kiểm tra đầu vào, bài học đã làm và thẻ ôn tập.',
  'Lịch sử dùng AI và các báo cáo bạn đã gửi.',
  'Câu trả lời còn chờ đồng bộ trên thiết bị này.',
] as const;

const linkClass = 'inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline';

/** Settings "Tài khoản và dữ liệu" (spec 7 §2): what is stored, JSON export, permanent deletion. */
export function AccountDataSection() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const toast = useToast();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);

  async function exportData() {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await exportMyData(requireSupabase());
      downloadJson(data, exportFileName(todayIso(profile?.timezone ?? DEFAULT_TIMEZONE)));
      toast.show({ tone: 'success', message: 'Đã tải dữ liệu của bạn.' });
    } catch (error) {
      toast.show({ tone: 'error', message: accountErrorMessage(error, 'export') });
    } finally {
      setExporting(false);
    }
  }

  const closeDialog = useCallback(() => setDialogOpen(false), []);

  async function onDeleted() {
    if (user) clearLocalAccountData(user.id);
    // Leave /app first: signing out while still inside it would send RequireAuth to the sign-in page instead.
    navigate('/', { replace: true });
    // The server already removed the user (and so the session): only the local copy is left to drop.
    await requireSupabase()
      .auth.signOut({ scope: 'local' })
      .catch(() => undefined);
    // The client-side navigation above can still be pending (lazy landing route) when the sign-out empties the
    // session, and RequireAuth then wins and shows the sign-in page: finish with a full load of the landing page.
    hardNavigate('/');
  }

  return (
    <section aria-labelledby="account-data-heading">
      <SolidCard className="space-y-4">
        <h2 id="account-data-heading" className="text-lg font-bold">
          Tài khoản và dữ liệu
        </h2>
        <div className="space-y-2 text-[15px]">
          <p className="font-medium">Linguo đang lưu:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            {STORED_DATA_SUMMARY.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="font-medium">Thời hạn lưu:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            {RETENTION_SUMMARY.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="ghost" loading={exporting} onClick={() => void exportData()}>
            <Download aria-hidden className="size-5" />
            Tải dữ liệu của tôi
          </Button>
          <Button ref={deleteTriggerRef} variant="danger" onClick={() => setDialogOpen(true)}>
            <Trash2 aria-hidden className="size-5" />
            Xoá tài khoản
          </Button>
        </div>
        <nav aria-label="Chính sách" className="flex flex-wrap gap-x-5">
          <Link to="/quyen-rieng-tu" className={linkClass}>
            Quyền riêng tư
          </Link>
          <Link to="/dieu-khoan" className={linkClass}>
            Điều khoản sử dụng
          </Link>
        </nav>
      </SolidCard>
      {dialogOpen && <DeleteAccountDialog onClose={closeDialog} onDeleted={onDeleted} triggerRef={deleteTriggerRef} />}
    </section>
  );
}

interface DialogProps {
  onClose: () => void;
  onDeleted: () => Promise<void>;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

function DeleteAccountDialog({ onClose, onDeleted, triggerRef }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = value.trim() === DELETE_CONFIRM_PHRASE;
  const close = useCallback(() => {
    if (!deleting) onClose();
  }, [deleting, onClose]);
  useModalDialog(true, close, { triggerRef, containerRef: panelRef });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!matches || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMyAccount(requireSupabase(), DELETE_CONFIRM_PHRASE);
    } catch (err) {
      setError(accountErrorMessage(err, 'delete'));
      setDeleting(false);
      return;
    }
    await onDeleted();
  }

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[90dvh] max-w-xl overflow-y-auto rounded-t-[28px] border-t border-border bg-surface-solid px-safe pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-5 sm:bottom-6 sm:rounded-[28px] sm:border"
      >
        <h2 id={titleId} className="text-lg font-bold">
          Xoá vĩnh viễn tài khoản?
        </h2>
        <div id={descriptionId} className="mt-2 space-y-2 text-[15px]">
          <p>Việc này không thể hoàn tác. Những dữ liệu sau sẽ bị xoá ngay:</p>
          <ul className="list-disc space-y-1 pl-5">
            {DELETED_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="text-muted">Nếu muốn giữ một bản, hãy “Tải dữ liệu của tôi” trước khi xoá.</p>
        </div>
        <form noValidate onSubmit={(e) => void submit(e)} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={inputId} className="block px-1 text-sm font-medium">
              Gõ <span className="font-mono font-bold">{DELETE_CONFIRM_PHRASE}</span> để xác nhận
            </label>
            <Input
              id={inputId}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={value}
              invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              onChange={(e) => setValue(e.target.value)}
            />
            {error && (
              <p id={errorId} role="alert" className="px-1 text-sm text-error">
                {error}
              </p>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="ghost" disabled={deleting} onClick={close}>
              Huỷ
            </Button>
            <Button type="submit" variant="danger" disabled={!matches} loading={deleting}>
              Xoá vĩnh viễn
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
