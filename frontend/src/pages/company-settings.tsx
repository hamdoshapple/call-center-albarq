import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, Plus, Trash2, Smartphone, ImagePlus, MessageCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Loader } from '@/components/shared/loader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { companyApi } from '@/api';
import type { CompanySettings } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage } from '@/hooks/use-language';
import { useToast } from '@/components/ui/use-toast';

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const COLORS = ['#0ea5e9', '#2563eb', '#16a34a', '#9333ea', '#dc2626', '#f59e0b', '#0d9488'];

type SubscriberAppConfig = {
  id?: string;
  appName: string;
  logoUrl?: string | null;
  splashLogoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  expiredColor: string;
  warningColor: string;
  supportPhone?: string | null;
  supportWhatsapp?: string | null;
  supportTelegram?: string | null;
  welcomeMessage?: string | null;
  expiredMessage?: string | null;
  bannerTitle?: string | null;
  bannerText?: string | null;
  bannerImage?: string | null;
  bannerLink?: string | null;
  popupEnabled: boolean;
  popupTitle?: string | null;
  popupMessage?: string | null;
  enablePayments: boolean;
  enableTickets: boolean;
  enableNotifications: boolean;
};

type SubscriberAppBanner = {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  active: boolean;
  sortOrder: number;
};

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}`,
});

const subscriberAppApi = {
  getConfig: async (): Promise<SubscriberAppConfig> => {
    const r = await fetch('/api/subscriber-app/config', { headers: authHeaders() });
    if (!r.ok) throw new Error('Failed to load subscriber app config');
    return r.json();
  },
  updateConfig: async (data: SubscriberAppConfig): Promise<SubscriberAppConfig> => {
    const r = await fetch('/api/subscriber-app/config', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('Failed to save subscriber app config');
    return r.json();
  },
  listBanners: async (): Promise<SubscriberAppBanner[]> => {
    const r = await fetch('/api/subscriber-app/banners', { headers: authHeaders() });
    if (!r.ok) throw new Error('Failed to load banners');
    return r.json();
  },
  createBanner: async (data: Partial<SubscriberAppBanner>): Promise<SubscriberAppBanner> => {
    const r = await fetch('/api/subscriber-app/banners', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error('Failed to create banner');
    return r.json();
  },
  deleteBanner: async (id: string) => {
    const r = await fetch(`/api/subscriber-app/banners/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!r.ok) throw new Error('Failed to delete banner');
    return r.json();
  },

  uploadImage: async (file: File): Promise<{ url: string; fileName: string }> => {
    const fd = new FormData();
    fd.append('file', file);

    const r = await fetch('/api/subscriber-app/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}`,
      },
      body: fd,
    });

    if (!r.ok) throw new Error('Failed to upload image');
    return r.json();
  },
};


export function CompanySettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lang, setLanguage } = useLanguage();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['company'], queryFn: companyApi.getCompany });
  const [form, setForm] = useState<CompanySettings | null>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);

  const canEdit = hasPermission('company_settings', 'edit');

  const saveMut = useMutation({
    mutationFn: (s: CompanySettings) => companyApi.updateCompany(s),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company'] }); toast({ title: t('common.save') }); },
  });

  if (isLoading || !form) return <Loader />;
  const set = (patch: Partial<CompanySettings>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const toggleDay = (d: number) => set({ businessHours: { ...form.businessHours, days: form.businessHours.days.includes(d) ? form.businessHours.days.filter((x) => x !== d) : [...form.businessHours.days, d] } });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('company.title')}
        subtitle={t('company.subtitle')}
        icon={<Settings className="h-5 w-5" />}
        actions={canEdit && <Button onClick={() => saveMut.mutate(form)}><Save className="h-4 w-4" />{t('common.save')}</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t('company.general')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5"><Label>{t('company.company_name')}</Label><Input value={form.name} disabled={!canEdit} onChange={(e) => set({ name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Name (EN)</Label><Input value={form.nameEn} disabled={!canEdit} onChange={(e) => set({ nameEn: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>{t('company.theme_color')}</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => <button key={c} type="button" disabled={!canEdit} onClick={() => set({ themeColor: c })} className={`h-8 w-8 rounded-full border-2 transition ${form.themeColor === c ? 'border-foreground scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t('company.appearance')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('company.mode')}</Label>
              <div className="flex gap-2">
                <Button variant={theme === 'light' ? 'default' : 'outline'} onClick={() => setTheme('light')}>{t('theme.light')}</Button>
                <Button variant={theme === 'dark' ? 'default' : 'outline'} onClick={() => setTheme('dark')}>{t('theme.dark')}</Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('company.language')}</Label>
              <div className="flex gap-2">
                <Button variant={lang === 'ar' ? 'default' : 'outline'} onClick={() => setLanguage('ar')}>العربية</Button>
                <Button variant={lang === 'en' ? 'default' : 'outline'} onClick={() => setLanguage('en')}>English</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t('company.business_hours')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>{t('common.from')}</Label><Input type="time" value={form.businessHours.from} disabled={!canEdit} onChange={(e) => set({ businessHours: { ...form.businessHours, from: e.target.value } })} /></div>
              <div className="space-y-1.5"><Label>{t('common.to')}</Label><Input type="time" value={form.businessHours.to} disabled={!canEdit} onChange={(e) => set({ businessHours: { ...form.businessHours, to: e.target.value } })} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('company.working_days')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => (
                  <button key={d} type="button" disabled={!canEdit} onClick={() => toggleDay(d)} className={`rounded-md border px-3 py-1.5 text-sm transition ${form.businessHours.days.includes(d) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
                    {t(`days.${d}`)}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t('company.closed_message')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={3} value={form.closedMessage} disabled={!canEdit} onChange={(e) => set({ closedMessage: e.target.value })} />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('company.holidays')}</Label>
                {canEdit && <Button size="sm" variant="outline" onClick={() => set({ holidays: [...form.holidays, { date: '', name: '' }] })}><Plus className="h-3.5 w-3.5" />{t('common.add')}</Button>}
              </div>
              {form.holidays.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <Input type="date" value={h.date} disabled={!canEdit} onChange={(e) => { const hs = [...form.holidays]; hs[i] = { ...hs[i], date: e.target.value }; set({ holidays: hs }); }} />
                  <Input placeholder={t('common.name')} value={h.name} disabled={!canEdit} onChange={(e) => { const hs = [...form.holidays]; hs[i] = { ...hs[i], name: e.target.value }; set({ holidays: hs }); }} />
                  {canEdit && <Button size="icon" variant="ghost" className="text-destructive" onClick={() => set({ holidays: form.holidays.filter((_, x) => x !== i) })}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <SubscriberAppSettingsPanel canEdit={canEdit} />

    </div>
  );
}


function SubscriberAppSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['subscriber-app-config'],
    queryFn: subscriberAppApi.getConfig,
  });

  const { data: banners = [] } = useQuery({
    queryKey: ['subscriber-app-banners'],
    queryFn: subscriberAppApi.listBanners,
  });

  const [form, setForm] = useState<SubscriberAppConfig | null>(null);
  const [bannerForm, setBannerForm] = useState({
    title: '',
    description: '',
    imageUrl: '',
    linkUrl: '',
    sortOrder: 0,
    active: true,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: (x: SubscriberAppConfig) => subscriberAppApi.updateConfig(x),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscriber-app-config'] });
      toast({ title: 'تم حفظ إعدادات تطبيق المشتركين' });
    },
  });

  const addBanner = useMutation({
    mutationFn: subscriberAppApi.createBanner,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscriber-app-banners'] });
      setBannerForm({ title: '', description: '', imageUrl: '', linkUrl: '', sortOrder: 0, active: true });
      toast({ title: 'تم إضافة الإعلان' });
    },
  });

  const removeBanner = useMutation({
    mutationFn: subscriberAppApi.deleteBanner,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscriber-app-banners'] });
      toast({ title: 'تم حذف الإعلان' });
    },
  });

  if (isLoading || !form) {
    return (
      <Card>
        <CardContent className="p-6">
          <Loader />
        </CardContent>
      </Card>
    );
  }

  const setApp = (patch: Partial<SubscriberAppConfig>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-5 w-5 text-primary" />
          إعدادات تطبيق المشتركين
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center gap-2 font-bold">
              <ImagePlus className="h-4 w-4 text-primary" />
              الهوية والواجهة
            </div>

            <div className="space-y-1.5">
              <Label>اسم التطبيق</Label>
              <Input disabled={!canEdit} value={form.appName || ''} onChange={(e) => setApp({ appName: e.target.value })} />
            </div>

            <ImageUploadField
              label="شعار التطبيق Logo"
              value={form.logoUrl || ''}
              disabled={!canEdit}
              onChange={(url) => setApp({ logoUrl: url })}
            />

            <ImageUploadField
              label="شعار شاشة البداية Splash"
              value={form.splashLogoUrl || ''}
              disabled={!canEdit}
              onChange={(url) => setApp({ splashLogoUrl: url })}
            />

            <div className="grid grid-cols-2 gap-3">
              <ColorField label="اللون الرئيسي" value={form.primaryColor} disabled={!canEdit} onChange={(v) => setApp({ primaryColor: v })} />
              <ColorField label="اللون الثانوي" value={form.secondaryColor} disabled={!canEdit} onChange={(v) => setApp({ secondaryColor: v })} />
              <ColorField label="لون المنتهي" value={form.expiredColor} disabled={!canEdit} onChange={(v) => setApp({ expiredColor: v })} />
              <ColorField label="لون التحذير" value={form.warningColor} disabled={!canEdit} onChange={(v) => setApp({ warningColor: v })} />
            </div>
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center gap-2 font-bold">
              <MessageCircle className="h-4 w-4 text-primary" />
              التواصل والرسائل
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>رقم الاتصال</Label>
                <Input disabled={!canEdit} value={form.supportPhone || ''} onChange={(e) => setApp({ supportPhone: e.target.value })} />
              </div>

              <div className="space-y-1.5">
                <Label>واتساب الدعم</Label>
                <Input disabled={!canEdit} value={form.supportWhatsapp || ''} onChange={(e) => setApp({ supportWhatsapp: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>رسالة الترحيب</Label>
              <Textarea rows={2} disabled={!canEdit} value={form.welcomeMessage || ''} onChange={(e) => setApp({ welcomeMessage: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label>رسالة انتهاء الاشتراك</Label>
              <Textarea rows={3} disabled={!canEdit} value={form.expiredMessage || ''} onChange={(e) => setApp({ expiredMessage: e.target.value })} />
            </div>

            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <input type="checkbox" disabled={!canEdit} checked={!!form.popupEnabled} onChange={(e) => setApp({ popupEnabled: e.target.checked })} />
              تفعيل نافذة منبثقة عند انتهاء الاشتراك
            </label>

            <div className="space-y-1.5">
              <Label>عنوان النافذة المنبثقة</Label>
              <Input disabled={!canEdit} value={form.popupTitle || ''} onChange={(e) => setApp({ popupTitle: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label>نص النافذة المنبثقة</Label>
              <Textarea rows={3} disabled={!canEdit} value={form.popupMessage || ''} onChange={(e) => setApp({ popupMessage: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="mb-3 font-bold">الميزات</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm">
              <input type="checkbox" disabled={!canEdit} checked={!!form.enablePayments} onChange={(e) => setApp({ enablePayments: e.target.checked })} />
              الدفع الإلكتروني
            </label>
            <label className="flex items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm">
              <input type="checkbox" disabled={!canEdit} checked={!!form.enableTickets} onChange={(e) => setApp({ enableTickets: e.target.checked })} />
              التذاكر
            </label>
            <label className="flex items-center gap-2 rounded-lg bg-muted/40 p-3 text-sm">
              <input type="checkbox" disabled={!canEdit} checked={!!form.enableNotifications} onChange={(e) => setApp({ enableNotifications: e.target.checked })} />
              الإشعارات
            </label>
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="font-bold">إعلانات تطبيق المشترك</div>
          </div>

          <div className="grid gap-3 lg:grid-cols-5">
            <Input disabled={!canEdit} placeholder="عنوان الإعلان" value={bannerForm.title} onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })} />
            <Input disabled={!canEdit} placeholder="الوصف" value={bannerForm.description} onChange={(e) => setBannerForm({ ...bannerForm, description: e.target.value })} />
            <ImageUploadField
              label="صورة الإعلان"
              value={bannerForm.imageUrl}
              disabled={!canEdit}
              compact
              onChange={(url) => setBannerForm({ ...bannerForm, imageUrl: url })}
            />
            <Input disabled={!canEdit} placeholder="رابط عند الضغط" value={bannerForm.linkUrl} onChange={(e) => setBannerForm({ ...bannerForm, linkUrl: e.target.value })} />
            <Button disabled={!canEdit || !bannerForm.title.trim() || addBanner.isPending} onClick={() => addBanner.mutate(bannerForm)}>
              <Plus className="h-4 w-4" />
              إضافة
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {banners.length === 0 ? (
              <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">لا توجد إعلانات حالياً</div>
            ) : banners.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
                <div>
                  <div className="font-bold">{b.title}</div>
                  {b.description && <div className="text-sm text-muted-foreground">{b.description}</div>}
                  {b.linkUrl && <div className="text-xs text-muted-foreground">{b.linkUrl}</div>}
                </div>
                {canEdit && (
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeBanner.mutate(b.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <Button disabled={save.isPending} onClick={() => save.mutate(form)}>
              <Save className="h-4 w-4" />
              حفظ إعدادات تطبيق المشتركين
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ColorField({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input type="color" className="h-10 w-14 p-1" disabled={disabled} value={value || '#000000'} onChange={(e) => onChange(e.target.value)} />
        <Input disabled={disabled} value={value || ''} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}


function ImageUploadField({
  label,
  value,
  disabled,
  onChange,
  compact,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  compact?: boolean;
  onChange: (url: string) => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  async function pick(file?: File) {
    if (!file) return;

    try {
      setUploading(true);
      const res = await subscriberAppApi.uploadImage(file);
      onChange(res.url);
      toast({ title: 'تم رفع الصورة بنجاح' });
    } catch {
      toast({
        title: 'فشل رفع الصورة',
        description: 'تأكد أن الملف صورة وحجمه أقل من 10MB',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={`space-y-1.5 ${compact ? '' : ''}`}>
      <Label>{label}</Label>

      {value ? (
        <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
          <img
            src={value}
            alt={label}
            className="h-14 w-14 rounded-lg border bg-white object-cover"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-muted-foreground">{value}</div>
            <div className="mt-2 flex gap-2">
              <label className={`inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 text-xs font-medium ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
                تغيير الصورة
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={disabled || uploading}
                  onChange={(e) => pick(e.target.files?.[0])}
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-destructive"
                disabled={disabled || uploading}
                onClick={() => onChange('')}
              >
                حذف
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <label className={`flex cursor-pointer items-center justify-center rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
          {uploading ? 'جاري الرفع...' : 'اختر صورة من الجهاز'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled || uploading}
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </label>
      )}
    </div>
  );
}
