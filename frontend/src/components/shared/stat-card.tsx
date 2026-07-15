import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Tone = 'primary' | 'success' | 'warning' | 'destructive' | 'muted';

const toneMap: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  trend?: { value: number; positive?: boolean };
}

export function StatCard({ label, value, icon: Icon, tone = 'primary', hint, trend }: StatCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold tabular-nums">{value}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            {trend && (
              <p
                className={cn(
                  'text-xs font-medium',
                  trend.positive ? 'text-success' : 'text-destructive'
                )}
              >
                {trend.positive ? '▲' : '▼'} {Math.abs(trend.value)}%
              </p>
            )}
          </div>
          <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', toneMap[tone])}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
