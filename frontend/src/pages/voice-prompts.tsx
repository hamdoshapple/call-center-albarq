import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AudioLines, Upload, Trash2, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Loader } from '@/components/shared/loader';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { AudioPlayer } from '@/components/shared/audio-player';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { voicePromptsApi } from '@/api';
import type { VoicePrompt, PromptCategory } from '@/types';
import type { VoicePromptInput } from '@/api/voicePrompts';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/use-toast';

const CATEGORIES: PromptCategory[] = ['welcome', 'waiting', 'closed_hours', 'busy', 'ivr', 'announcement', 'other'];

const emptyForm = (): VoicePromptInput => ({ name: '', category: 'welcome', fileName: '', url: '#', duration: 0, language: 'ar', sizeKb: 0 });

export function VoicePromptsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const { data: prompts, isLoading } = useQuery({ queryKey: ['prompts'], queryFn: voicePromptsApi.listPrompts });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VoicePrompt | null>(null);
  const [form, setForm] = useState<VoicePromptInput>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<PromptCategory | 'all'>('all');

  const canCreate = hasPermission('voice_prompts', 'create');
  const canEdit = hasPermission('voice_prompts', 'edit');
  const canDelete = hasPermission('voice_prompts', 'delete');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['prompts'] });
  const createMut = useMutation({ mutationFn: (i: VoicePromptInput) => voicePromptsApi.createPrompt(i), onSuccess: () => { invalidate(); toast({ title: t('voice_prompts.upload') }); } });
  const updateMut = useMutation({ mutationFn: ({ id, i }: { id: string; i: VoicePromptInput }) => voicePromptsApi.updatePrompt(id, i), onSuccess: () => { invalidate(); toast({ title: t('common.update') }); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => voicePromptsApi.deletePrompt(id), onSuccess: () => { invalidate(); toast({ title: t('common.delete') }); } });

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (p: VoicePrompt) => { setEditing(p); setForm({ name: p.name, category: p.category, fileName: p.fileName, url: p.url, duration: p.duration, language: p.language, sizeKb: p.sizeKb }); setDialogOpen(true); };
  const submit = () => {
    if (!form.name) return;
    const payload = { ...form, fileName: form.fileName || `${form.name}.mp3`, duration: form.duration || 12, sizeKb: form.sizeKb || 192 };
    if (editing) updateMut.mutate({ id: editing.id, i: payload });
    else createMut.mutate(payload);
    setDialogOpen(false);
  };

  if (isLoading) return <Loader />;
  const list = (prompts ?? []).filter((p) => filter === 'all' || p.category === filter);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('voice_prompts.title')}
        subtitle={t('voice_prompts.subtitle')}
        icon={<AudioLines className="h-5 w-5" />}
        actions={canCreate && <Button onClick={openCreate}><Upload className="h-4 w-4" />{t('voice_prompts.upload')}</Button>}
      />

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter('all')} className={`rounded-full border px-3 py-1 text-sm ${filter === 'all' ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{t('common.all')}</button>
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setFilter(c)} className={`rounded-full border px-3 py-1 text-sm ${filter === c ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{t(`voice_prompts.categories.${c}`)}</button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">{p.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{p.fileName}</p>
              </div>
              <div className="flex gap-1">
                {canEdit && <Button size="icon-sm" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>}
                {canDelete && <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Badge variant="secondary">{t(`voice_prompts.categories.${p.category}`)}</Badge>
                <Badge variant="outline">{p.language.toUpperCase()}</Badge>
              </div>
              <AudioPlayer durationSec={p.duration} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? t('common.edit') : t('voice_prompts.upload')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>{t('common.name')}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>{t('voice_prompts.category')}</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as PromptCategory })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`voice_prompts.categories.${c}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('voice_prompts.file')}</Label>
              <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                <span>{t('voice_prompts.upload_hint')}</span>
              </div>
              <Input placeholder="welcome.mp3" value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={submit}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title={t('voice_prompts.delete_confirm')} confirmLabel={t('common.delete')} onConfirm={() => deleteId && deleteMut.mutate(deleteId)} />
    </div>
  );
}
