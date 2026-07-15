import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Menu, Bell, Moon, Sun, Languages, LogOut, User as UserIcon, Search, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/hooks/use-language';
import { useAuth } from '@/hooks/use-auth';
import { notificationsApi } from '@/api';
import { formatDateTime } from '@/lib/utils';

const typeIcon: Record<string, typeof Phone> = {
  call: Phone,
  alert: Bell,
  agent: UserIcon,
  subscriber: UserIcon,
  system: Bell,
};

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { lang, toggleLanguage } = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.listNotifications,
  });
  const unread = notifications.filter((n) => !n.read).length;

  const markAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: (data) => qc.setQueryData(['notifications'], data),
  });
  const markOne = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: (data) => qc.setQueryData(['notifications'], data),
  });

  const initials = user?.name.split(' ').slice(0, 2).map((s) => s[0]).join('') ?? '؟';

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
      <Button variant="ghost" size="icon" className="cc-menu-btn" onClick={onMenu}>
        <Menu className="h-5 w-5" />
      </Button>

      <div className="relative hidden max-w-xs flex-1 sm:block">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder={t('topbar.search_placeholder')} className="ps-9" />
      </div>

      <div className="ms-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={toggleLanguage} title={t('topbar.toggle_language')}>
          <Languages className="h-5 w-5" />
          <span className="sr-only">{lang}</span>
        </Button>

        <Button variant="ghost" size="icon" onClick={toggleTheme} title={t('topbar.toggle_theme')}>
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {unread}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b p-3">
              <p className="text-sm font-semibold">{t('topbar.notifications')}</p>
              {unread > 0 && (
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => markAll.mutate()}>
                  {t('topbar.mark_all_read')}
                </Button>
              )}
            </div>
            <ScrollArea className="max-h-80">
              {notifications.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">{t('topbar.no_notifications')}</p>
              ) : (
                <div className="divide-y">
                  {notifications.map((n) => {
                    const Icon = typeIcon[n.type] ?? Bell;
                    return (
                      <button
                        key={n.id}
                        onClick={() => markOne.mutate(n.id)}
                        className="flex w-full items-start gap-3 p-3 text-start hover:bg-accent"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{n.title}</p>
                            {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                          </div>
                          <p className="text-xs text-muted-foreground">{n.message}</p>
                          <p className="text-[11px] text-muted-foreground/70">{formatDateTime(n.createdAt, lang)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="hidden text-start sm:block">
                <p className="text-sm font-medium leading-none">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user && t(`roles.${user.role}`)}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs font-normal text-muted-foreground">{user?.email}</p>
                <Badge variant="default" className="mt-1">{user && t(`roles.${user.role}`)}</Badge>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/company-settings')}>
              <UserIcon className="h-4 w-4" />
              {t('auth.my_profile')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" />
              {t('auth.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
