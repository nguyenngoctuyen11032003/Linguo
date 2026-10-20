import { useId, useMemo, useState, type FormEvent } from 'react';
import { STAFF_ROLES, type AdminFoundUser, type AdminStaffMember, type StaffRole } from '@linguo/shared';
import { Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { inputClasses } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { STAFF_ROLE_LABELS_VI } from '@/features/admin/service';
import {
  STAFF_LIST_PAGE_SIZE,
  STAFF_ROLE_DESCRIPTIONS_VI,
  STAFF_SEARCH_THRESHOLD,
  canManageMember,
  filterPeople,
  staffDisplayName,
  staffQueryKind,
} from '@/features/admin/staff';
import { useAdminStaff, useAdminTeachers } from '@/features/admin/useAdminStaff';
import { useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/cn';
import { HistorySection } from './HistorySection';
import { PeopleSearch } from './PeopleSearch';
import { RevokeRoleDialog } from './RevokeRoleDialog';
import { TeacherSection } from './TeacherSection';

const selectClasses = cn(inputClasses(false), 'min-h-11 appearance-none py-2 pr-8 text-[15px]');

type Message = { tone: 'ok' | 'error'; text: string };

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('vi-VN', { dateStyle: 'medium' });
};

function Feedback({ message }: { message: Message | null }) {
  if (!message) return null;
  return (
    <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-[15px] text-error-text' : 'text-[15px] text-success-text'}>
      {message.text}
    </p>
  );
}

function RoleSelect({ id, value, onChange, disabled }: { id: string; value: StaffRole; onChange: (role: StaffRole) => void; disabled?: boolean }) {
  return (
    <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as StaffRole)} className={selectClasses}>
      {STAFF_ROLES.map((role) => (
        <option key={role} value={role}>
          {STAFF_ROLE_LABELS_VI[role]}
        </option>
      ))}
    </select>
  );
}

interface GrantSectionProps {
  currentUserId: string | null;
  saving: boolean;
  findUser: ReturnType<typeof useAdminStaff>['findUser'];
  setRole: ReturnType<typeof useAdminStaff>['setRole'];
  /** User ids with teacher status, or null while the teacher list loads. */
  teacherIds: ReadonlySet<string> | null;
  savingTeacher: boolean;
  setTeacher: ReturnType<typeof useAdminTeachers>['setTeacher'];
}

/** Look an account up by email or user id, then grant (or change) its role, or grant teacher status. */
function GrantSection({ currentUserId, saving, findUser, setRole, teacherIds, savingTeacher, setTeacher }: GrantSectionProps) {
  const ids = useId();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<AdminFoundUser | null>(null);
  const [role, setRoleChoice] = useState<StaffRole>('editor');
  const [message, setMessage] = useState<Message | null>(null);
  const [confirming, setConfirming] = useState(false);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setFound(null);
    if (!staffQueryKind(query)) {
      setMessage({ tone: 'error', text: 'Hãy nhập đúng email hoặc mã người dùng (UUID).' });
      return;
    }
    setSearching(true);
    const outcome = await findUser(query);
    setSearching(false);
    if (!outcome.ok) {
      setMessage({ tone: 'error', text: outcome.message });
      return;
    }
    if (!outcome.value) {
      setMessage({ tone: 'error', text: 'Không tìm thấy tài khoản nào khớp. Người này cần đăng ký Linguo trước.' });
      return;
    }
    setFound(outcome.value);
    setRoleChoice(outcome.value.role ?? 'editor');
  };

  const grant = async () => {
    if (!found) return;
    setMessage(null);
    const outcome = await setRole(found.user_id, role);
    setConfirming(false);
    if (!outcome.ok) {
      setMessage({ tone: 'error', text: outcome.message });
      return;
    }
    setMessage({ tone: 'ok', text: `Đã cấp vai trò "${STAFF_ROLE_LABELS_VI[role]}" cho ${staffDisplayName(found)}.` });
    setFound(null);
    setQuery('');
  };

  const grantTeacher = async () => {
    if (!found) return;
    setMessage(null);
    const outcome = await setTeacher(found.user_id, true);
    if (!outcome.ok) {
      setMessage({ tone: 'error', text: outcome.message });
      return;
    }
    setMessage({ tone: 'ok', text: `Đã cấp quyền giáo viên cho ${staffDisplayName(found)}.` });
    setFound(null);
    setQuery('');
  };

  const self = found ? !canManageMember(found, currentUserId) : false;
  const unchanged = found?.role === role;
  const isTeacher = found && teacherIds ? teacherIds.has(found.user_id) : null;

  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-3 rounded-3xl border border-border bg-surface-solid p-4">
      <h2 id={`${ids}-title`} className="font-semibold">
        Thêm nhân sự hoặc giáo viên
      </h2>
      <form onSubmit={(e) => void search(e)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor={`${ids}-query`} className="mb-1 block text-sm font-semibold">
            Email hoặc mã người dùng
          </label>
          <input
            id={`${ids}-query`}
            type="text"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            value={query}
            maxLength={320}
            onChange={(e) => setQuery(e.target.value)}
            className={cn(inputClasses(false), 'min-h-11 text-[15px]')}
          />
        </div>
        <Button type="submit" variant="ghost" loading={searching} className="shrink-0">
          <Search aria-hidden className="size-4" />
          Tìm tài khoản
        </Button>
      </form>

      {found && (
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <div className="min-w-0">
            <p className="break-words font-semibold">{staffDisplayName(found)}</p>
            {found.email && found.display_name && <p className="break-all text-sm text-muted">{found.email}</p>}
            <p className="text-sm text-muted">Vai trò hiện tại: {found.role ? STAFF_ROLE_LABELS_VI[found.role] : 'Chưa có'}</p>
          </div>
          {self ? (
            <p className="text-[15px] text-muted">Đây là tài khoản của bạn. Hãy nhờ một quản trị viên khác nếu cần đổi vai trò.</p>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor={`${ids}-role`} className="mb-1 block text-sm font-semibold">
                  Vai trò
                </label>
                <RoleSelect id={`${ids}-role`} value={role} onChange={setRoleChoice} disabled={saving} />
                <p className="mt-1 text-sm text-muted">{STAFF_ROLE_DESCRIPTIONS_VI[role]}</p>
              </div>
              <Button variant="primary" disabled={saving || unchanged} onClick={() => setConfirming(true)} className="shrink-0 sm:mb-6">
                {found.role ? 'Đổi vai trò' : 'Cấp vai trò'}
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center">
            <p className="min-w-0 flex-1 text-sm text-muted">
              Quyền giáo viên: {isTeacher === null ? 'đang kiểm tra…' : isTeacher ? 'Đã có' : 'Chưa có'}
            </p>
            {isTeacher === false && (
              <Button variant="ghost" disabled={savingTeacher} onClick={() => void grantTeacher()} className="self-start sm:self-auto sm:shrink-0">
                Cấp quyền giáo viên
              </Button>
            )}
          </div>
        </div>
      )}
      <Feedback message={message} />
      <RevokeRoleDialog
        name={confirming && found ? staffDisplayName(found) : null}
        roleLabel={STAFF_ROLE_LABELS_VI[role]}
        title={found?.role ? 'Đổi vai trò?' : 'Cấp vai trò?'}
        consequence={roleChangeConsequence(found?.role ?? null, role)}
        confirmLabel={found?.role ? 'Đổi vai trò' : 'Cấp vai trò'}
        tone={found?.role === 'admin' && role !== 'admin' ? 'danger' : 'primary'}
        note="Thay đổi được ghi vào nhật ký quản trị. Bạn có thể đổi lại sau."
        busy={saving}
        onConfirm={() => void grant()}
        onCancel={() => {
          if (!saving) setConfirming(false);
        }}
      />
    </section>
  );
}

/** What a role change means for the person, for the confirmation dialog (after their name). */
export function roleChangeConsequence(previous: StaffRole | null, next: StaffRole): string {
  const label = STAFF_ROLE_LABELS_VI[next];
  const lead = previous ? `sẽ đổi vai trò từ ${STAFF_ROLE_LABELS_VI[previous]} thành ${label}.` : `sẽ được cấp vai trò ${label}.`;
  const detail = STAFF_ROLE_DESCRIPTIONS_VI[next];
  const demote = previous === 'admin' && next !== 'admin' ? ' Người này sẽ mất quyền quản trị.' : '';
  return `${lead} ${detail}${demote}`;
}

interface MemberRowProps {
  member: AdminStaffMember;
  isSelf: boolean;
  saving: boolean;
  onSave: (member: AdminStaffMember, role: StaffRole) => void;
  onRevoke: (member: AdminStaffMember) => void;
}

function MemberRow({ member, isSelf, saving, onSave, onRevoke }: MemberRowProps) {
  const ids = useId();
  const [role, setRole] = useState<StaffRole>(member.role);
  const name = staffDisplayName(member);
  const granted = member.granted_by_email ? `Cấp ngày ${formatDate(member.granted_at)} bởi ${member.granted_by_email}` : `Cấp ngày ${formatDate(member.granted_at)}`;

  return (
    <li className="space-y-3 border-t border-border p-4 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-semibold">
            {name}
            {isSelf && <span className="ml-2 rounded-full bg-primary/12 px-2 py-0.5 text-sm font-semibold">Bạn</span>}
          </p>
          {member.email && member.display_name && <p className="break-all text-sm text-muted">{member.email}</p>}
          <p className="text-sm text-muted">{granted}</p>
        </div>
        <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-0.5 text-sm font-semibold">{STAFF_ROLE_LABELS_VI[member.role]}</span>
      </div>
      {isSelf ? (
        <p className="text-sm text-muted">Bạn không thể tự đổi hoặc thu hồi vai trò của mình. Hãy nhờ một quản trị viên khác.</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 sm:w-56">
            <label htmlFor={`${ids}-role`} className="mb-1 block text-sm font-semibold">
              Vai trò của {name}
            </label>
            <RoleSelect id={`${ids}-role`} value={role} onChange={setRole} disabled={saving} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={saving || role === member.role} onClick={() => onSave(member, role)}>
              Lưu vai trò
            </Button>
            <Button variant="danger" disabled={saving} onClick={() => onRevoke(member)} aria-label={`Thu hồi vai trò của ${name}`}>
              Thu hồi
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** /quan-tri/nhan-su (admin only, enforced by the route guard and the RPCs): staff list, grant, change, revoke. */
export function StaffPage() {
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const staff = useAdminStaff();
  const { status, data, error, reload, setRole, findUser, savingUserId } = staff;
  const teachers = useAdminTeachers();
  const teacherIds = useMemo(() => (teachers.data ? new Set(teachers.data.map((t) => t.user_id)) : null), [teachers.data]);
  const [revoking, setRevoking] = useState<AdminStaffMember | null>(null);
  const [changing, setChanging] = useState<{ member: AdminStaffMember; role: StaffRole } | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(STAFF_LIST_PAGE_SIZE);
  const saving = savingUserId !== null;
  const listTitleId = useId();
  /** Bumped after each change so that the history on the page fetches its first page again. */
  const [changes, setChanges] = useState(0);
  const matches = useMemo(() => filterPeople(data ?? [], query), [data, query]);

  const save = async (member: AdminStaffMember, role: StaffRole) => {
    setMessage(null);
    const outcome = await setRole(member.user_id, role);
    setChanging(null);
    if (outcome.ok) setChanges((n) => n + 1);
    setMessage(
      outcome.ok
        ? { tone: 'ok', text: `Đã đổi vai trò của ${staffDisplayName(member)} thành "${STAFF_ROLE_LABELS_VI[role]}".` }
        : { tone: 'error', text: outcome.message },
    );
  };

  const confirmRevoke = async () => {
    const member = revoking;
    if (!member) return;
    // UI guard (the server still refuses to remove the last admin).
    if (!canManageMember(member, currentUserId)) {
      setRevoking(null);
      return;
    }
    setMessage(null);
    const outcome = await setRole(member.user_id, null);
    setRevoking(null);
    if (outcome.ok) setChanges((n) => n + 1);
    setMessage(outcome.ok ? { tone: 'ok', text: `Đã thu hồi vai trò của ${staffDisplayName(member)}.` } : { tone: 'error', text: outcome.message });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">Nhân sự</h1>
        <p className="text-[15px] text-muted">Cấp, đổi hoặc thu hồi vai trò trong khu quản trị và quyền giáo viên. Mọi thay đổi được ghi vào nhật ký.</p>
      </div>

      <GrantSection
        currentUserId={currentUserId}
        saving={saving}
        findUser={findUser}
        setRole={async (userId, role) => {
          const outcome = await setRole(userId, role);
          if (outcome.ok) setChanges((n) => n + 1);
          return outcome;
        }}
        teacherIds={teacherIds}
        savingTeacher={teachers.savingTeacherId !== null}
        setTeacher={async (userId, grant) => {
          const outcome = await teachers.setTeacher(userId, grant);
          if (outcome.ok) setChanges((n) => n + 1);
          return outcome;
        }}
      />

      <section aria-labelledby={listTitleId} className="space-y-3">
        <h2 id={listTitleId} className="text-lg font-semibold">
          Nhân sự hiện tại
        </h2>
        <Feedback message={message} />
        {status === 'error' && !data ? (
          <ErrorState description={error ?? undefined} onRetry={reload} />
        ) : !data ? (
          <div role="status" aria-label="Đang tải danh sách nhân sự" className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState icon={Users} title="Chưa có nhân sự" description="Tìm một tài khoản ở trên để cấp vai trò đầu tiên." />
        ) : (
          <>
            {data.length > STAFF_SEARCH_THRESHOLD && (
              <PeopleSearch
                label="Tìm trong nhân sự"
                value={query}
                onChange={(value) => {
                  setQuery(value);
                  setLimit(STAFF_LIST_PAGE_SIZE);
                }}
                shown={matches.length}
                total={data.length}
              />
            )}
            {matches.length === 0 ? (
              <p role="status" className="px-1 text-[15px] text-muted">
                Không có nhân sự nào khớp.
              </p>
            ) : (
              <ul aria-label="Danh sách nhân sự" aria-busy={status === 'loading' || undefined} className="rounded-3xl border border-border bg-surface-solid">
                {matches.slice(0, limit).map((member) => (
                  <MemberRow
                    // Keyed by role too, so the select resets to the saved role after a reload.
                    key={`${member.user_id}:${member.role}`}
                    member={member}
                    isSelf={!canManageMember(member, currentUserId)}
                    saving={saving}
                    onSave={(m, r) => setChanging({ member: m, role: r })}
                    onRevoke={setRevoking}
                  />
                ))}
              </ul>
            )}
            {matches.length > limit && (
              <Button variant="ghost" block onClick={() => setLimit((n) => n + STAFF_LIST_PAGE_SIZE)}>
                Hiện thêm {Math.min(STAFF_LIST_PAGE_SIZE, matches.length - limit)} người
              </Button>
            )}
          </>
        )}
      </section>

      <TeacherSection
        teachers={teachers}
        currentUserId={currentUserId}
        onChanged={() => setChanges((n) => n + 1)}
      />

      <HistorySection refreshKey={changes} />

      <RevokeRoleDialog
        name={changing ? staffDisplayName(changing.member) : null}
        roleLabel={changing ? STAFF_ROLE_LABELS_VI[changing.role] : ''}
        title="Đổi vai trò?"
        consequence={changing ? roleChangeConsequence(changing.member.role, changing.role) : undefined}
        confirmLabel="Đổi vai trò"
        tone={changing?.member.role === 'admin' && changing.role !== 'admin' ? 'danger' : 'primary'}
        note="Thay đổi được ghi vào nhật ký quản trị. Bạn có thể đổi lại sau."
        busy={changing !== null && savingUserId === changing.member.user_id}
        onConfirm={() => {
          if (changing) void save(changing.member, changing.role);
        }}
        onCancel={() => {
          if (!saving) setChanging(null);
        }}
      />

      <RevokeRoleDialog
        name={revoking ? staffDisplayName(revoking) : null}
        roleLabel={revoking ? STAFF_ROLE_LABELS_VI[revoking.role] : ''}
        busy={revoking !== null && savingUserId === revoking.user_id}
        onConfirm={() => void confirmRevoke()}
        onCancel={() => {
          if (!saving) setRevoking(null);
        }}
      />
    </div>
  );
}
