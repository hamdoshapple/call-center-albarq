import { useEffect, useState } from 'react';
import { RefreshCw, Search, Trash2, Link2 } from 'lucide-react';

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

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('cc_token') || ''}` };
}

export default function SubscriberAliasesPage() {
  const [rows, setRows] = useState<AliasRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

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

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-950">ارتباطات الأرقام</h1>
          <p className="mt-1 text-sm font-bold text-slate-500">
            إدارة الأرقام الإضافية المرتبطة بالمشتركين
          </p>
        </div>

        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      {msg ? (
        <div className="rounded-2xl border bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
          {msg}
        </div>
      ) : null}

      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="flex gap-2">
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
            className="h-12 rounded-2xl bg-sky-600 px-6 text-sm font-black text-white"
          >
            بحث
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
        <div className="border-b bg-slate-50 px-5 py-4 text-sm font-black text-slate-700">
          العدد: {rows.length}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="p-3 text-right">الرقم المرتبط</th>
                <th className="p-3 text-right">PPPoE</th>
                <th className="p-3 text-right">External ID</th>
                <th className="p-3 text-right">الوسم</th>
                <th className="p-3 text-right">الحالة</th>
                <th className="p-3 text-right">المصدر</th>
                <th className="p-3 text-right">آخر تحديث</th>
                <th className="p-3 text-right">إجراء</th>
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
                  <td className="p-3">
                    <div className="flex items-center gap-2 font-mono font-black" dir="ltr">
                      <Link2 className="h-4 w-4 text-sky-600" />
                      {x.phoneNorm}
                    </div>
                  </td>
                  <td className="p-3 font-mono font-bold">{x.pppoeUsername || '—'}</td>
                  <td className="p-3 font-mono text-xs">{x.externalId || '—'}</td>
                  <td className="p-3">{x.label || '—'}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${
                      x.verified ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {x.verified ? 'موثق' : 'غير موثق'}
                    </span>
                  </td>
                  <td className="p-3">{x.source || 'manual'}</td>
                  <td className="p-3 text-xs text-slate-500">
                    {x.updatedAt ? new Date(x.updatedAt).toLocaleString('ar-IQ') : '—'}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => remove(x)}
                      className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      فصل
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
