import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useToast, dismissToast, type ToastVariant } from './use-toast';
import { cn } from '@/lib/utils';

const icons: Record<ToastVariant, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  destructive: XCircle,
  warning: AlertTriangle,
};

const styles: Record<ToastVariant, string> = {
  default: 'border-border bg-card text-foreground',
  success: 'border-success/30 bg-success/10 text-foreground',
  destructive: 'border-destructive/30 bg-destructive/10 text-foreground',
  warning: 'border-warning/30 bg-warning/10 text-foreground',
};

const iconColors: Record<ToastVariant, string> = {
  default: 'text-primary',
  success: 'text-success',
  destructive: 'text-destructive',
  warning: 'text-warning',
};

export function Toaster() {
  const { toasts } = useToast();
  return (
    <div className="fixed bottom-4 start-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const variant = t.variant ?? 'default';
        const Icon = icons[variant];
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg animate-in slide-in-from-bottom-2',
              styles[variant]
            )}
          >
            <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconColors[variant])} />
            <div className="flex-1 space-y-0.5">
              {t.title && <p className="text-sm font-semibold">{t.title}</p>}
              {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
            </div>
            <button
              onClick={() => dismissToast(t.id)}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-foreground/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
