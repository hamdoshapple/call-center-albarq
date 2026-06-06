import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AudioLines,
  Upload,
  Trash2,
  Pencil,
  Music4,
  PhoneCall,
  Clock,
  Headphones,
  DoorClosed,
  PhoneOff,
  Shuffle,
  ListTree,
  Megaphone,
  CheckCircle2,
} from 'lucide-react';
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

const SOUND_SLOTS: Array<{
  value: PromptCategory;
  title: string;
  desc: string;
  icon: any;
  canApplyMoh?: boolean;
  applyLabel?: string;
}> = [
  {
    value: 'hold_music',
    title: 'موسيقى التعليق',
    desc: 'الصوت الذي يسمعه الزبون عند ضغط تعليق المكالمة.',
    icon: Music4,
    canApplyMoh: true,
    applyLabel: 'تطبيق كموسيقى تعليق',
  },
  {
    value: 'waiting',
    title: 'موسيقى الانتظار',
    desc: 'صوت الانتظار العام قبل الرد أو عند الطابور.',
    icon: Headphones,
    canApplyMoh: true,
    applyLabel: 'تطبيق كموسيقى انتظار',
  },
  {
    value: 'welcome',
    title: 'رسالة الترحيب',
    desc: 'أول رسالة يسمعها المتصل عند وصوله للنظام.',
    icon: PhoneCall,
  },
  {
    value: 'closed_hours',
    title: 'خارج أوقات الدوام',
    desc: 'رسالة يتم تشغيلها خارج ساعات العمل.',
    icon: Clock,
  },
  {
    value: 'busy',
    title: 'الموظفون مشغولون',
    desc: 'رسالة عند عدم توفر موظفين للرد.',
    icon: PhoneOff,
  },
  {
    value: 'transfer',
    title: 'رسالة التحويل',
    desc: 'رسالة قبل تحويل المكالمة إلى موظف آخر.',
    icon: Shuffle,
  },
  {
    value: 'transfer_failed',
    title: 'فشل التحويل',
    desc: 'رسالة عند فشل التحويل أو عدم رد الموظف.',
    icon: DoorClosed,
  },
  {
    value: 'ivr',
    title: 'رسائل IVR',
    desc: 'رسائل القوائم الصوتية وخيارات الأرقام.',
    icon: ListTree,
  },
  {
    value: 'queue',
    title: 'رسائل الطابور',
    desc: 'رسائل مثل: يرجى الانتظار، سيتم الرد عليك قريباً.',
    icon: Megaphone,
  },
  {
    value: 'goodbye',
    title: 'إنهاء المكالمة',
    desc: 'رسالة قبل إنهاء الاتصال.',
    icon: CheckCircle2,
  },
  {
    value: 'announcement',
    title: 'إعلان عام',
    desc: 'أي إعلان صوتي عام.',
    icon: Megaphone,
  },
  {
    value: 'other',
    title: 'أخرى',
    desc: 'ملفات صوتية إضافية غير مصنفة.',
    icon: AudioLines,
  },
];

const categoryLabel = (v: string) => SOUND_SLOTS.find((x) => x.value === v)?.title || v;
const emptyForm = (category: PromptCategory = 'welcome'): VoicePromptInput => ({
  name: '',
  category,
  fileName: '',
  url: '#',
  duration: 0,
  language: 'ar',
  sizeKb: 0,
});

export function VoicePromptsPage() {
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const qc = useQueryClient();

  const { data: prompts = [], isLoading } = useQuery({
    queryKey: ['prompts'],
    queryFn: voicePromptsApi.listPrompts,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VoicePrompt | null>(null);
  const [form, setForm] = useState<VoicePromptInput>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<PromptCategory | 'all'>('all');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const canCreate = hasPermission('voice_prompts', 'create');
  const canEdit = hasPermission('voice_prompts', 'edit');
  const canDelete = hasPermission('voice_prompts', 'delete');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['prompts'] });

  const byCategory = useMemo(() => {
    const map = new Map<string, VoicePrompt[]>();
    for (const p of prompts) {
      map.set(p.category, [...(map.get(p.category) || []), p]);
    }
    return map;
  }, [prompts]);

  const createMut = useMutation({
    mutationFn: (i: VoicePromptInput) => voicePromptsApi.createPrompt(i),
    onSuccess: () => {
      invalidate();
      toast({ title: 'تم حفظ الصوت' });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, i }: { id: string; i: VoicePromptInput }) => voicePromptsApi.updatePrompt(id, i),
    onSuccess: () => {
      invalidate();
      toast({ title: 'تم التحديث' });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => voicePromptsApi.deletePrompt(id),
    onSuccess: () => {
      invalidate();
      toast({ title: 'تم الحذف' });
    },
  });

  const mohMut = useMutation({
    mutationFn: (id: string) => voicePromptsApi.applyPrompt(id),
    onSuccess: () => {
      toast({ title: 'تم تطبيق الصوت على السنترال' });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'فشل تطبيق الصوت' });
    },
  });

  const openCreate = (category: PromptCategory = 'welcome') => {
    setEditing(null);
    setAudioFile(null);
    setForm(emptyForm(category));
    setDialogOpen(true);
  };

  const openEdit = (p: VoicePrompt) => {
    setEditing(p);
    setAudioFile(null);
    setForm({
      name: p.name,
      category: p.category,
      fileName: p.fileName,
      url: p.url,
      duration: p.duration,
      language: p.language,
      sizeKb: p.sizeKb,
    });
    setDialogOpen(true);
  };

  const uploadWithProgress = async () => {
    if (!audioFile) return;

    setUploading(true);
    setUploadProgress(0);

    const token = localStorage.getItem('cc_token') || '';
    const fd = new FormData();
    fd.append('name', form.name || audioFile.name);
    fd.append('category', form.category);
    fd.append('language', form.language || 'ar');
    fd.append('file', audioFile);

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded * 100) / e.total));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
      };

      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.open('POST', '/api/voice-prompts/upload');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(fd);
    });
  };

  const submit = async () => {
    if (!form.name && !audioFile) return;

    try {
      if (audioFile && !editing) {
        await uploadWithProgress();
        invalidate();
        toast({ title: 'تم رفع الملف بنجاح', description: audioFile.name });
        setDialogOpen(false);
        setAudioFile(null);
        setForm(emptyForm());
        return;
      }

      const payload = {
        ...form,
        fileName: form.fileName || `${form.name}.mp3`,
        duration: form.duration || 0,
        sizeKb: form.sizeKb || 0,
      };

      if (editing) updateMut.mutate({ id: editing.id, i: payload });
      else createMut.mutate(payload);

      setDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'حدث خطأ غير معروف';
      toast({ variant: 'destructive', title: 'فشل رفع الملف', description: message.slice(0, 180) });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  if (isLoading) return <Loader />;

  const shownSlots =
    activeCategory === 'all' ? SOUND_SLOTS : SOUND_SLOTS.filter((s) => s.value === activeCategory);

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة الصوتيات"
        subtitle="تحكم بكل أصوات السنترال: تعليق، انتظار، ترحيب، IVR، تحويل، وخارج الدوام."
        icon={<AudioLines className="h-5 w-5" />}
        actions={canCreate && (
          <Button onClick={() => openCreate('welcome')}>
            <Upload className="h-4 w-4" />
            رفع صوت جديد
          </Button>
        )}
      />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory('all')}
          className={`rounded-full border px-3 py-1 text-sm ${activeCategory === 'all' ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
        >
          الكل
        </button>
        {SOUND_SLOTS.map((slot) => (
          <button
            key={slot.value}
            onClick={() => setActiveCategory(slot.value)}
            className={`rounded-full border px-3 py-1 text-sm ${activeCategory === slot.value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          >
            {slot.title}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {shownSlots.map((slot) => {
          const Icon = slot.icon;
          const items = byCategory.get(slot.value) || [];

          return (
            <Card key={slot.value} className="overflow-hidden">
              <CardHeader className="border-b bg-muted/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{slot.title}</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">{slot.desc}</p>
                    </div>
                  </div>
                  {canCreate && (
                    <Button size="sm" variant="outline" onClick={() => openCreate(slot.value)}>
                      <Upload className="h-4 w-4" />
                      رفع
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-3 p-4">
                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    لا يوجد صوت مخصص لهذه الوظيفة
                  </div>
                ) : (
                  items.map((p) => (
                    <div key={p.id} className="rounded-xl border p-3">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.fileName}</div>
                        </div>
                        <div className="flex gap-1">
                          <Badge variant="secondary">{categoryLabel(p.category)}</Badge>
                          <Badge variant="outline">{p.language.toUpperCase()}</Badge>
                        </div>
                      </div>

                      <AudioPlayer
                        durationSec={p.duration}
                        src={p.url && p.url !== '#' ? p.url : undefined}
                        label={p.fileName}
                      />

                      <div className="mt-3 flex flex-wrap gap-2">
                        {(
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={mohMut.isPending}
                            onClick={() => mohMut.mutate(p.id)}
                          >
                            <Music4 className="h-4 w-4" />
                            {slot.applyLabel || 'تطبيق الصوت'}
                          </Button>
                        )}

                        {canEdit && (
                          <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                            <Pencil className="h-4 w-4" />
                            تعديل
                          </Button>
                        )}

                        {canDelete && (
                          <Button size="sm" variant="destructive" onClick={() => setDeleteId(p.id)}>
                            <Trash2 className="h-4 w-4" />
                            حذف
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => !uploading && setDialogOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'تعديل صوت' : 'رفع صوت جديد'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم الصوت</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>وظيفة الصوت</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as PromptCategory })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOUND_SLOTS.map((slot) => (
                    <SelectItem key={slot.value} value={slot.value}>{slot.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!editing && (
              <div className="space-y-2">
                <Label>ملف الصوت</Label>
                <Input
                  type="file"
                  accept="audio/*,.m4a,.aac,.mp4,.wav,.mp3"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setAudioFile(file);
                    if (file) {
                      setForm({
                        ...form,
                        name: form.name || file.name.replace(/\.[^.]+$/, ''),
                        fileName: file.name,
                        url: '#',
                        sizeKb: Math.max(1, Math.round(file.size / 1024)),
                      });
                    }
                  }}
                />

                {audioFile && (
                  <div className="rounded-lg border p-3 text-sm">
                    <div><b>الملف:</b> {audioFile.name}</div>
                    <div><b>الحجم:</b> {(audioFile.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                )}
              </div>
            )}

            {editing && (
              <div className="space-y-2">
                <Label>اسم الملف</Label>
                <Input value={form.fileName} onChange={(e) => setForm({ ...form, fileName: e.target.value })} />
              </div>
            )}

            {uploading && (
              <div className="space-y-2">
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
                <div className="text-center text-xs text-muted-foreground">
                  جاري رفع الملف... {uploadProgress}%
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={uploading} onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button disabled={uploading} onClick={submit}>
              {uploading ? `جاري الرفع ${uploadProgress}%` : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="حذف الصوت"
        confirmLabel="حذف"
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
      />
    </div>
  );
}
