import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function Loader({ className, label }: { className?: string; label?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-14 text-muted-foreground', className)}>
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      <p className="text-sm">{label ?? t('common.loading')}</p>
    </div>
  );
}
