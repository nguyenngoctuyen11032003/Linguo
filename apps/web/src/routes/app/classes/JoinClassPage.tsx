import { Link, useNavigate, useSearchParams } from 'react-router';
import { buttonClasses } from '@/components/ui/Button';
import { SolidCard } from '@/components/ui/SolidCard';
import { useToast } from '@/components/ui/Toast';
import { joinedMessage } from '@/features/classes/labels';
import { useLearnerClasses } from '@/features/classes/useLearnerClasses';
import { cn } from '@/lib/cn';
import { JoinClassForm } from './JoinClassForm';
import { PrivacyNote } from './PrivacyNote';

/**
 * /app/lop-hoc/tham-gia?ma=CODE: the invite link a teacher shares. The code is filled in but never sent on its own:
 * the learner first reads what the teacher will see, then confirms.
 */
export function JoinClassPage() {
  const [params] = useSearchParams();
  const initialCode = (params.get('ma') ?? '').slice(0, 16);
  const api = useLearnerClasses();
  const toast = useToast();
  const navigate = useNavigate();

  return (
    <div className="space-y-6 lg:max-w-3xl">
      <div>
        <h1 className="page-title">Tham gia lớp học</h1>
        <p className="mt-2 max-w-prose text-[15px] text-muted">
          {initialCode
            ? 'Giáo viên đã mời bạn vào lớp. Hãy đọc kỹ giáo viên sẽ thấy gì, rồi bấm “Tham gia lớp” nếu bạn đồng ý.'
            : 'Nhập mã lớp mà giáo viên gửi cho bạn.'}
        </p>
      </div>
      <PrivacyNote />
      <SolidCard>
        <section aria-labelledby="join-link-title" className="space-y-3">
          <h2 id="join-link-title" className="text-lg font-bold tracking-[-0.02em]">
            Nhập mã lớp
          </h2>
          <JoinClassForm
            initialCode={initialCode}
            join={api.join}
            onJoined={(klass, alreadyMember) => {
              toast.show({ tone: alreadyMember ? 'info' : 'success', message: joinedMessage(klass, alreadyMember) });
              navigate('/app/lop-hoc', { replace: true });
            }}
            secondary={
              <Link to="/app/lop-hoc" className={cn(buttonClasses('ghost', 'lg'))}>
                Để sau
              </Link>
            }
          />
        </section>
      </SolidCard>
    </div>
  );
}
