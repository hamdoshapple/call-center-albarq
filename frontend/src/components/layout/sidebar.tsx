import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { NAV_GROUP_ORDER, NAV_ITEMS } from '@/routes/nav';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(item.module, 'view'));

  return (
    <>
      {open && (
        <div
          className="cc-sidebar-backdrop"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          'cc-sidebar flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground',
          open ? 'cc-sidebar-open' : ''
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-sidebar-border px-4">
          <div className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="logo" className="h-9 w-9" />
            <div className="leading-tight">
              <p className="text-sm font-bold">{t('app.name')}</p>
              <p className="text-[11px] text-sidebar-foreground/60">{t('app.tagline')}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-white/10 md:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUP_ORDER.map((group) => {
            const items = visibleItems.filter((i) => i.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  {t(`nav.groups.${group}`, group)}
                </p>
                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.module}
                        to={item.path}
                        onClick={onClose}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-sidebar-accent text-white shadow-sm'
                              : 'text-sidebar-foreground/75 hover:bg-white/10 hover:text-white'
                          )
                        }
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        <span className="truncate">{item.path === '/admin-tickets' ? 'التكتات' : t(`nav.${item.module}`, item.module)}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <Badge variant="warning" className="w-full justify-center py-1.5">
            {t('common.demo_mode')}
          </Badge>
        </div>
      </aside>
    </>
  );
}

// TODO: add sidebar link to /vpn with module vpn