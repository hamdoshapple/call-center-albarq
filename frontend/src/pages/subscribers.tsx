import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  UserSearch,
  Search,
  Phone,
  Wifi,
  Calendar,
  Wallet,
  MapPin,
  Ticket as TicketIcon,
  User,
  ArrowLeft,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Loader } from '@/components/shared/loader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { subscribersApi } from '@/api';
import type { Subscriber } from '@/types';
import { useLanguage } from '@/hooks/use-language';
import { formatCurrency, formatDate } from '@/lib/utils';

export function SubscribersPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { id } = useParams();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const { data: results, isLoading } = useQuery({ queryKey: ['subscribers', query], queryFn: () => subscribersApi.searchSubscribers(query) });
  const { data: selected } = useQuery({ queryKey: ['subscriber', id], queryFn: () => subscribersApi.getSubscriber(id!), enabled: !!id });
  const { data: tickets = [] } = useQuery({ queryKey: ['subscriber-tickets', id], queryFn: () => subscribersApi.getSubscriberTickets(id!), enabled: !!id });

  if (id) {
    if (!selected) return <Loader />;
    return <SubscriberProfile subscriber={selected} tickets={tickets} onBack={() => navigate('/subscribers')} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('subscribers.title')} subtitle={t('subscribers.subtitle')} icon={<UserSearch className="h-5 w-5" />} />

      <Card>
        <CardContent className="p-3">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t('subscribers.search_placeholder')} className="h-12 ps-10 text-base" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Loader />
      ) : (results ?? []).length === 0 ? (
        <Card><CardContent><EmptyState icon={UserSearch} title={t('common.no_results')} description={t('subscribers.search_placeholder')} /></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(results ?? []).map((s) => (
            <Card key={s.id} className="cursor-pointer transition hover:border-primary hover:shadow-md" onClick={() => navigate(`/subscribers/${s.id}`)}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary"><User className="h-5 w-5" /></div>
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">{s.phone}</p>
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <Badge variant="secondary">{s.package}</Badge>
                  {s.debt > 0 && <span className="text-destructive font-medium">{formatCurrency(s.debt, lang)}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SubscriberProfile({ subscriber: s, tickets, onBack }: { subscriber: Subscriber; tickets: { id: string; subject: string; status: string }[]; onBack: () => void }) {
  const { t } = useTranslation();
  const { lang } = useLanguage();

  const rows = [
    { icon: Phone, label: t('common.phone'), value: s.phone },
    { icon: Wifi, label: t('subscribers.pppoe'), value: s.pppoeUsername },
    { icon: Wifi, label: t('subscribers.package'), value: `${s.package} • ${s.speed}` },
    { icon: Calendar, label: t('subscribers.expiration'), value: formatDate(s.expiration, lang) },
    { icon: Calendar, label: t('subscribers.last_activation'), value: formatDate(s.lastActivation, lang) },
    { icon: Wallet, label: t('subscribers.debt'), value: formatCurrency(s.debt, lang) },
    { icon: MapPin, label: t('subscribers.address'), value: s.address },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}><ArrowLeft className="h-4 w-4 rtl:rotate-180" /></Button>
        <PageHeader title={s.name} subtitle={t('subscribers.profile')} icon={<User className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{t('subscribers.profile')}</CardTitle>
            <StatusBadge status={s.status} />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {rows.map((r) => (
                <div key={r.label} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><r.icon className="h-4 w-4" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">{r.label}</p>
                    <p className="font-medium">{r.value}</p>
                  </div>
                </div>
              ))}
            </div>
            {s.notes && <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">{s.notes}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TicketIcon className="h-4 w-4" />{t('subscribers.last_ticket')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('common.no_data')}</p>
            ) : (
              tickets.map((ticket) => (
                <div key={ticket.id} className="space-y-1 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{ticket.subject}</p>
                    <StatusBadge status={ticket.status} />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
