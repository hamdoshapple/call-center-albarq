import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, Plus, Trash2 } from 'lucide-react';
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
    </div>
  );
}
