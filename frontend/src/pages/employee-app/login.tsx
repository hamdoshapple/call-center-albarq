import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones, Lock, Mail, RefreshCw } from 'lucide-react';

export default function EmployeeLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    document.title = 'Albarq Staff';
    const token = localStorage.getItem('cc_token') || localStorage.getItem('token');
    if (token) navigate('/employee/dashboard', { replace: true });
  }, [navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username: email, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'LOGIN_FAILED');

      const token = data.token || data.accessToken || data.jwt;
      if (!token) throw new Error('NO_TOKEN');

      localStorage.setItem('cc_token', token);
      localStorage.setItem('token', token);

      navigate('/employee/dashboard', { replace: true });
    } catch {
      setErr('بيانات الدخول غير صحيحة');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-[#f6f8fb] px-5 pt-[calc(env(safe-area-inset-top)+42px)] text-slate-950">
      <section className="mx-auto max-w-md">
        <div className="rounded-[2.2rem] bg-white p-6 text-center shadow-xl shadow-slate-200/70">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-lg shadow-sky-200">
            <Headphones className="h-10 w-10" />
          </div>

          <p className="mt-5 text-sm font-black text-sky-500">Albarq Staff</p>
          <h1 className="mt-1 text-3xl font-black">تسجيل دخول الموظف</h1>
          <p className="mt-2 text-sm font-bold text-slate-400">ادخل بياناتك للوصول إلى تطبيق الموظفين</p>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3 rounded-[2rem] bg-white p-5 shadow-xl shadow-slate-200/70">
          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-600">البريد أو اسم المستخدم</span>
            <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3">
              <Mail className="h-5 w-5 text-sky-500" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent text-sm font-bold outline-none"
                placeholder="example@albarq.app"
                autoComplete="username"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-600">كلمة المرور</span>
            <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3">
              <Lock className="h-5 w-5 text-sky-500" />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent text-sm font-bold outline-none"
                placeholder="••••••••"
                type="password"
                autoComplete="current-password"
              />
            </div>
          </label>

          {err ? <p className="rounded-2xl bg-red-50 p-3 text-center text-sm font-black text-red-500">{err}</p> : null}

          <button
            disabled={loading || !email.trim() || !password.trim()}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-4 text-sm font-black text-white shadow-lg shadow-sky-200 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : null}
            دخول
          </button>
        </form>
      </section>
    </main>
  );
}
