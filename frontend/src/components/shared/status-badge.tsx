import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline';

const STATUS_MAP: Record<string, { variant: Variant; dot: string }> = {
  online: { variant: 'success', dot: 'bg-success' },
  offline: { variant: 'secondary', dot: 'bg-muted-foreground' },
  busy: { variant: 'destructive', dot: 'bg-destructive' },
  paused: { variant: 'warning', dot: 'bg-warning' },
  active: { variant: 'success', dot: 'bg-success' },
  ringing: { variant: 'warning', dot: 'bg-warning' },
  waiting: { variant: 'default', dot: 'bg-primary' },
  ended: { variant: 'secondary', dot: 'bg-muted-foreground' },
  missed: { variant: 'destructive', dot: 'bg-destructive' },
  failed: { variant: 'destructive', dot: 'bg-destructive' },
  answered: { variant: 'success', dot: 'bg-success' },
  abandoned: { variant: 'warning', dot: 'bg-warning' },
  no_answer: { variant: 'destructive', dot: 'bg-destructive' },
  expired: { variant: 'destructive', dot: 'bg-destructive' },
  suspended: { variant: 'warning', dot: 'bg-warning' },
  disabled: { variant: 'secondary', dot: 'bg-muted-foreground' },
  open: { variant: 'default', dot: 'bg-primary' },
  pending: { variant: 'warning', dot: 'bg-warning' },
  resolved: { variant: 'success', dot: 'bg-success' },
  closed: { variant: 'secondary', dot: 'bg-muted-foreground' },
  completed: { variant: 'success', dot: 'bg-success' },
  in_progress: { variant: 'warning', dot: 'bg-warning' },
  no_sim: { variant: 'secondary', dot: 'bg-muted-foreground' },
  error: { variant: 'destructive', dot: 'bg-destructive' },
  inactive: { variant: 'secondary', dot: 'bg-muted-foreground' },
};

export function StatusBadge({ status, pulse }: { status: string; pulse?: boolean }) {
  const { t } = useTranslation();
  const config = STATUS_MAP[status] ?? { variant: 'secondary' as Variant, dot: 'bg-muted-foreground' };
  const label = t(`status.${status}`, { defaultValue: status });
  return (
    <Badge variant={config.variant} className="gap-1.5">
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75 animate-pulse-ring', config.dot)} />
        )}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', config.dot)} />
      </span>
      {label}
    </Badge>
  );
}
