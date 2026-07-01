import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, ChevronsRight } from 'lucide-react';
import { NAV_GROUP_ORDER, NAV_ITEMS } from '@/routes/nav';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const groupNames: Record<string, string> = {
  operations: 'العمليات',
  telephony: 'الهاتف',
  management: 'الإدارة',
  system: 'النظام',
};

function itemLabel(item: any, t: any) {
  if (item.path === '/admin-tickets') return 'التكتات';
  if (item.path === '/subscriber-aliases') return 'ارتباطات الأرقام';
  if (item.path === '/whatsapp-inbox') return 'صندوق الوارد';
  if (item.path === '/whatsapp') return 'واتساب';
  return t(`nav.${item.module}`, item.module);
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => hasPermission(item.module, 'view'));

  return (
    <>
      {open && <div className="cc-sidebar-backdrop" onClick={onClose} aria-hidden />}

      <aside
        className={cn(
          'cc-sidebar flex w-72 shrink-0 flex-col overflow-hidden border-l border-white/10 bg-[#071426] text-white shadow-2xl',
          open ? 'cc-sidebar-open' : ''
        )}
      >
        <div className="relative border-b border-white/10 px-4 py-4">
          <div className="absolute inset-0 bg-gradient-to-l from-sky-500/10 to-transparent" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
                <img src="/logo.svg" alt="logo" className="h-8 w-8" />
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-black">مركز البرق للاتصالات</p>
                <p className="mt-1 truncate text-[11px] font-bold text-white/45">{t('app.tagline')}</p>
              </div>
            </div>

            <button onClick={onClose} className="rounded-xl p-2 text-white/70 hover:bg-white/10 md:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUP_ORDER.map((group) => {
            const items = visibleItems.filter((i) => i.group === group);
            if (!items.length) return null;

            return (
              <div key={group}>
                <div className="px-3 pb-2 text-[11px] font-black text-white/35">
                  {groupNames[group] || t(`nav.groups.${group}`, group)}
                </div>

                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = item.icon;

                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        className={({ isActive }) =>
                          cn(
                            'group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-black transition-all',
                            isActive
                              ? 'bg-gradient-to-l from-sky-600 to-blue-600 text-white shadow-lg shadow-sky-950/30'
                              : 'text-white/70 hover:bg-white/10 hover:text-white'
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span
                              className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors',
                                isActive ? 'bg-white/15' : 'bg-white/5 group-hover:bg-white/10'
                              )}
                            >
                              <Icon className="h-[18px] w-[18px]" />
                            </span>

                            <span className="min-w-0 flex-1 truncate">
                              {itemLabel(item, t)}
                            </span>

                            {isActive ? <ChevronsRight className="h-4 w-4 opacity-80" /> : null}
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center justify-between rounded-2xl bg-white/5 px-3 py-3 text-xs font-black text-white/60">
            <span>طي القائمة</span>
            <span className="rounded-full bg-white/10 px-2 py-1">⌘</span>
          </div>
        </div>
      </aside>
    </>
  );
}
