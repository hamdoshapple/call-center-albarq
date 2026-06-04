import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mic, Search, Download, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Loader } from '@/components/shared/loader';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { AudioPlayer } from '@/components/shared/audio-player';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { recordingsApi, agentsApi } from '@/api';
import type { RecordingFilters } from '@/api/recordings';
import { useAuth } from '@/hooks/use-auth';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/components/ui/use-toast';
import { formatDateTime } from '@/lib/utils';

export function RecordingsPage() {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const [filters, setFilters] = useState<RecordingFilters>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: agentsApi.listAgents });
  const { data: recordings, isLoading } = useQuery({ queryKey: ['recordings', filters], queryFn: () => recordingsApi.listRecordings(filters) });

  const canDelete = hasPermission('recordings', 'delete');
  const agentName = (id?: string) => agents.find((a) => a.id === id)?.name ?? '—';

  const deleteMut = useMutation({
    mutationFn: (id: string) => recordingsApi.deleteRecording(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recordings'] }); toast({ title: t('common.delete') }); },
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t('recordings.title')} subtitle={t('recordings.subtitle')} icon={<Mic className="h-5 w-5" />} />

      <Card>
        <CardContent className="flex flex-wrap gap-3 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t('common.phone')} className="ps-9" onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
          </div>
          <Select onValueChange={(v) => setFilters((f) => ({ ...f, agentId: v === 'all' ? undefined : v }))}>
            <SelectTrigger className="w-48"><SelectValue placeholder={t('live_calls.agent')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" className="w-44" onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))} />
        </CardContent>
      </Card>

      {isLoading ? (
        <Loader />
      ) : (recordings ?? []).length === 0 ? (
        <Card><CardContent><EmptyState icon={Mic} title={t('common.no_results')} /></CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(recordings ?? []).map((r) => (
            <Card key={r.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium tabular-nums">{r.callerNumber}</p>
                    <p className="text-xs text-muted-foreground">{agentName(r.agentId)}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon-sm" variant="ghost" title={t('common.download')} onClick={() => toast({ title: t('common.download'), description: r.fileName })}>
                      <Download className="h-4 w-4" />
                    </Button>
                    {canDelete && (
                      <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </div>
                <AudioPlayer durationSec={r.durationSec} />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDateTime(r.recordedAt, lang)}</span>
                  <span>{(r.sizeKb / 1024).toFixed(1)} MB</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title={t('recordings.delete_confirm')} confirmLabel={t('common.delete')} onConfirm={() => deleteId && deleteMut.mutate(deleteId)} />
    </div>
  );
}
