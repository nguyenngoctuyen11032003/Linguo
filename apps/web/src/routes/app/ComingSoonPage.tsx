import { Hourglass } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">{title}</h1>
      <EmptyState
        icon={Hourglass}
        title="Sắp ra mắt"
        description={`Tính năng ${title} đang được xây dựng và sẽ có trong các bản cập nhật tới.`}
      />
    </div>
  );
}
