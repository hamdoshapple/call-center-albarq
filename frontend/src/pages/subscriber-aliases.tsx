import { useEffect, useMemo, useState } from 'react';
import {
  Link2,
  RefreshCw,
  Search,
  Trash2,
  Plus,
  Pencil,
  X,
  ShieldCheck,
  ShieldAlert,
  Database,
  Phone,
  UserRound,
} from 'lucide-react';

type AliasRow = {
  id: string;
  phoneNorm: string;
  label?: string;
  pppoeUsername?: string;
  externalId?: string;
  subscriberId?: string;
  verified?: boolean | number;
  isPrimary?: boolean | number;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
};

type SubscriberRow = {
  id?: string;
  name?: string;
  phone?: string;
  pppoeUsername?: string;
  package?: string;
  status?: string;
  debt?: number;
  source?: string;
};

function authHeaders(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}`,
    ...extra,
  };
}

function money(v: any) {
  return Number(v || 0).toLocaleString('en-US');
}

function cleanPhone(v: string) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('964')) d = '0' + d.slice(3);
  return d;
}

function fmtDate(v?: string) {
  if (!v) return '—';
  return new Date(v).toLocaleString('ar-IQ');
}

export default function SubscriberAliasesPage() {
  const [rows, setRows] = useState<AliasRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AliasRow | null>(null);

  async function load() {
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch(`/api/subscriber-identity/links?q=${encodeURIComponent(q)}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setMsg('فشل تحميل الارتباطات');
    } finally {
      setLoading(false);
    }
  }

  async function remove(row: AliasRow) {
    if (!confirm(`فصل ارتباط الرقم ${row.phoneNorm}؟`)) return;

    const res = await fetch(`/api/subscriber-identity/links/${encodeURIComponent(row.id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    if (!res.ok) {
      setMsg('فشل فصل الارتباط');
      return;
    }

    setRows((old) => old.filter((x) => x.id !== row.id));
    setMsg('تم فصل الارتباط');
  }

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(row: AliasRow) {
    setEditing(row);
    setModalOpen(true);
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const verified = rows.filter((x) => Boolean(Number(x.verified || 0))).length;
    const manual = rows.filter((x) => String(x.source || 'manual') === 'manual').length;
    return {
      total,
      verified,
      unverified: total - verified,
      manual,
    };
  }, [rows]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-slate-950">ارتباطات الأرقام</h1>
          <p className="mt-2 text-sm font-bold text-slate-500">
            إدارة الربط بين أرقام الهواتف والمشتركين
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-2xl bg-sky-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-sky-700"
          >
            <Plus className="h-4 w-4" />
            ربط رقم جديد
          </button>

          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </button>
        </div>
      </div>

      {msg ? (
        <div className="rounded-2xl border bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
          {msg}
        </div>
      ) : null}

      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute right-4 top-3.5 h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="بحث بالرقم أو PPPoE أو External ID..."
              className="h-12 w-full rounded-2xl border bg-slate-50 pr-10 pl-4 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-100"
            />
          </div>

          <button
            onClick={load}
            className="h-12 rounded-2xl bg-sky-600 px-8 text-sm font-black text-white"
          >
            بحث
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="إجمالي الارتباطات" value={stats.total} icon={<Link2 className="h-6 w-6" />} />
        <StatCard title="موثق" value={stats.verified} icon={<ShieldCheck className="h-6 w-6" />} />
        <StatCard title="غير موثق" value={stats.unverified} icon={<ShieldAlert className="h-6 w-6" />} />
        <StatCard title="من مصادر النظام" value={stats.total - stats.manual} icon={<Database className="h-6 w-6" />} />
      </div>

      <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
        <div className="border-b bg-slate-50 px-5 py-4 text-sm font-black text-slate-700">
          العدد: {rows.length}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="p-4 text-right">الرقم المرتبط</th>
                <th className="p-4 text-right">PPPoE</th>
                <th className="p-4 text-right">External ID</th>
                <th className="p-4 text-right">الوسم</th>
                <th className="p-4 text-right">الحالة</th>
                <th className="p-4 text-right">المصدر</th>
                <th className="p-4 text-right">آخر تحديث</th>
                <th className="p-4 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-sm font-bold text-slate-400">
                    لا توجد ارتباطات
                  </td>
                </tr>
              ) : rows.map((x) => (
                <tr key={x.id} className="border-t hover:bg-slate-50">
                  <td className="p-4">
                    <div className="flex items-center gap-2 font-mono font-black" dir="ltr">
                      <Link2 className="h-4 w-4 text-sky-600" />
                      {x.phoneNorm}
                    </div>
                  </td>
                  <td className="p-4 font-mono font-black">{x.pppoeUsername || '—'}</td>
                  <td className="p-4 font-mono text-xs">{x.externalId || '—'}</td>
                  <td className="p-4">{x.label || '—'}</td>
                  <td className="p-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${
                      x.verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {x.verified ? 'موثق' : 'غير موثق'}
                    </span>
                  </td>
                  <td className="p-4 font-bold">{x.source || 'manual'}</td>
                  <td className="p-4 text-xs font-bold text-slate-500">{fmtDate(x.updatedAt)}</td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(x)}
                        className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 hover:bg-violet-100"
                      >
                        <Pencil className="h-4 w-4" />
                        تغيير
                      </button>

                      <button
                        onClick={() => remove(x)}
                        className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                        فصل
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <LinkAliasModal
          row={editing}
          onClose={() => setModalOpen(false)}
          onDone={() => {
            setModalOpen(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function StatCard({ title, value, icon }: any) {
  return (
    <div className="rounded-3xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-500">{title}</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
        </div>
        <div className="rounded-2xl bg-sky-50 p-4 text-sky-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

function LinkAliasModal({ row, onClose, onDone }: { row?: AliasRow | null; onClose: () => void; onDone: () => void }) {
  const [phone, setPhone] = useState(row?.phoneNorm || '');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SubscriberRow[]>([]);
  const [selected, setSelected] = useState<SubscriberRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function search() {
    if (q.trim().length < 2) {
      setMsg('اكتب حرفين على الأقل للبحث');
      return;
    }

    setLoading(true);
    setMsg('');

    try {
      const res = await fetch(`/api/subscriber-identity/search?q=${encodeURIComponent(q.trim())}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      setResults(arr);
      setSelected(null);
      if (!arr.length) setMsg('ماكو نتائج مطابقة');
    } catch {
      setMsg('فشل البحث عن المشترك');
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const clean = cleanPhone(phone);
    if (clean.length < 10) {
      setMsg('رقم الهاتف غير صحيح');
      return;
    }

    if (!selected?.pppoeUsername) {
      setMsg('اختر مشترك يحتوي PPPoE');
      return;
    }

    setSaving(true);
    setMsg('');

    try {
      const res = await fetch('/api/subscriber-identity/link', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          phone: clean,
          pppoeUsername: selected.pppoeUsername,
          externalId: selected.id || null,
          label: 'رقم إضافي',
          verified: false,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg(data.error || data.message || 'فشل ربط الرقم');
        return;
      }

      setMsg('تم ربط الرقم بنجاح');
      setTimeout(onDone, 500);
    } catch {
      setMsg('فشل ربط الرقم');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" dir="rtl">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b p-5">
          <div>
            <h2 className="text-2xl font-black text-slate-950">
              {row ? 'تغيير ربط الرقم' : 'ربط رقم جديد بمشترك'}
            </h2>
            <p className="mt-1 text-xs font-bold text-slate-500">
              اكتب الرقم ثم ابحث عن المشترك واختره من القائمة
            </p>
          </div>

          <button onClick={onClose} className="rounded-2xl bg-slate-100 p-3 text-slate-600 hover:bg-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-90px)] space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-2 block text-xs font-black text-slate-600">
              رقم الهاتف
            </label>
            <div className="relative">
              <Phone className="absolute right-4 top-3.5 h-4 w-4 text-slate-400" />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="مثال: 07835074938"
                dir="ltr"
                className="h-12 w-full rounded-2xl border bg-slate-50 pr-10 pl-4 text-sm font-black outline-none focus:ring-2 focus:ring-sky-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-black text-slate-600">
              ابحث عن المشترك
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-4 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && search()}
                  placeholder="اكتب اسم المشترك أو PPPoE أو رقم الهاتف..."
                  className="h-12 w-full rounded-2xl border pr-10 pl-4 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-100"
                />
              </div>

              <button
                onClick={search}
                disabled={loading}
                className="h-12 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white disabled:opacity-50"
              >
                {loading ? 'بحث...' : 'بحث'}
              </button>
            </div>
          </div>

          <div className="max-h-[310px] overflow-auto rounded-2xl border">
            {results.length === 0 ? (
              <div className="p-8 text-center text-xs font-bold text-slate-400">
                ابحث لعرض النتائج
              </div>
            ) : (
              <div className="divide-y">
                {results.map((x, i) => {
                  const active = selected?.id === x.id && selected?.pppoeUsername === x.pppoeUsername;
                  return (
                    <button
                      key={`${x.id || x.pppoeUsername || i}`}
                      onClick={() => setSelected(x)}
                      className={`flex w-full items-center justify-between gap-3 p-4 text-right hover:bg-sky-50 ${
                        active ? 'bg-sky-100' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`rounded-2xl p-3 ${active ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                          <UserRound className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-black text-slate-950">{x.name || '—'}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                            <span dir="ltr">{x.phone || '—'}</span>
                            <span>•</span>
                            <span>{x.package || '—'}</span>
                            <span>•</span>
                            <span>دين: {money(x.debt)} د.ع</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-left">
                        <div className="font-mono text-sm font-black text-slate-950">{x.pppoeUsername || '—'}</div>
                        <div className="mt-1 text-[11px] font-bold text-slate-400">{x.id || '—'}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="mb-2 text-sm font-black text-slate-900">ملخص الربط</div>
            <div className="grid gap-3 text-xs font-bold text-slate-600 md:grid-cols-3">
              <div>الرقم الجديد: <span dir="ltr" className="font-mono text-sky-700">{cleanPhone(phone) || '—'}</span></div>
              <div>المشترك: <span className="text-slate-950">{selected?.name || '—'}</span></div>
              <div>PPPoE: <span className="font-mono text-slate-950">{selected?.pppoeUsername || '—'}</span></div>
            </div>
          </div>

          {msg ? (
            <div className="rounded-2xl border bg-slate-50 p-3 text-center text-xs font-black text-slate-700">
              {msg}
            </div>
          ) : null}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving || !selected}
              className="h-12 flex-1 rounded-2xl bg-emerald-600 text-sm font-black text-white disabled:opacity-50"
            >
              {saving ? 'جاري الربط...' : 'ربط الرقم'}
            </button>

            <button
              onClick={onClose}
              className="h-12 rounded-2xl border px-8 text-sm font-black"
            >
              إلغاء
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
