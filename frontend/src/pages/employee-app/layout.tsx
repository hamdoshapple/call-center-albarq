import { useEffect, useState } from 'react';
import { enableEmployeePush } from './employeePush';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, MessageCircle, Phone, Ticket, User } from 'lucide-react';

const navItems = [
  { to: '/employee/dashboard', label: 'الرئيسية', icon: Home },
  { to: '/employee/calls', label: 'المكالمات', icon: Phone },
  { to: '/employee/whatsapp', label: 'واتساب', icon: MessageCircle },
  { to: '/employee/tickets', label: 'التذاكر', icon: Ticket },
  { to: '/employee/profile', label: 'حسابي', icon: User },
];

export default function EmployeeLayout() {
  const navigate = useNavigate();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [waChatOpen, setWaChatOpen] = useState(false);
  const [pushModalOpen, setPushModalOpen] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const hideBottomNav = waChatOpen;



  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    const dismissed = localStorage.getItem('employee_install_dismissed') === '1';

    const onBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
      if (!standalone && !dismissed) setInstallModalOpen(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    const timer = window.setTimeout(() => {
      if (!standalone && !dismissed) setInstallModalOpen(true);
    }, 1800);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.clearTimeout(timer);
    };
  }, []);

  async function installEmployeeApp() {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice.catch(() => null);
    }
    localStorage.setItem('employee_install_dismissed', '1');
    setInstallModalOpen(false);
    setInstallPrompt(null);
  }

  function dismissInstallModal() {
    localStorage.setItem('employee_install_dismissed', '1');
    setInstallModalOpen(false);
  }

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const enabled = localStorage.getItem('employee_push_enabled') === '1';
    const dismissed = localStorage.getItem('employee_push_dismissed') === '1';

    if (Notification.permission === 'granted' && enabled) {
      setPushModalOpen(false);
      return;
    }

    if (!dismissed) {
      const t = window.setTimeout(() => setPushModalOpen(true), 800);
      return () => window.clearTimeout(t);
    }
  }, []);

  async function activateEmployeePush() {
    setPushLoading(true);
    setPushMsg('');

    try {
      const result = await enableEmployeePush();
      setPushMsg(result.message || (result.ok ? 'تم تفعيل الإشعارات' : 'تعذر تفعيل الإشعارات'));

      if (result.ok) {
        localStorage.setItem('employee_push_enabled', '1');
        localStorage.removeItem('employee_push_dismissed');
        setTimeout(() => setPushModalOpen(false), 700);
      }
    } catch {
      setPushMsg('تعذر تفعيل الإشعارات');
    } finally {
      setPushLoading(false);
    }
  }

  function dismissPushModal() {
    localStorage.setItem('employee_push_dismissed', '1');
    setPushModalOpen(false);
  }


  useEffect(() => {
    const onWaChat = (e: Event) => setWaChatOpen(Boolean((e as CustomEvent).detail));
    window.addEventListener('employee-wa-chat-open', onWaChat as EventListener);
    return () => window.removeEventListener('employee-wa-chat-open', onWaChat as EventListener);
  }, []);

  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA'].includes(el.tagName)) setKeyboardOpen(true);
    };
    const onBlur = () => setTimeout(() => setKeyboardOpen(false), 120);

    window.addEventListener('focusin', onFocus);
    window.addEventListener('focusout', onBlur);

    return () => {
      window.removeEventListener('focusin', onFocus);
      window.removeEventListener('focusout', onBlur);
    };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('cc_token') || localStorage.getItem('token');
    if (!token) navigate('/employee/login', { replace: true });
  }, [navigate]);

  return (
    <div dir="rtl" className="min-h-screen bg-[#f6f8fb] text-slate-950">
      
      <HelmetManifest />
      <main className={`mx-auto min-h-screen max-w-md transition-all duration-200 ${hideBottomNav || keyboardOpen ? "pb-0" : "pb-24"}`}>
        <Outlet />
      </main>

      {installModalOpen ? (
        <div dir="rtl" className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/40 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-sky-50 text-sky-500 text-3xl">
              📲
            </div>

            <h2 className="mt-4 text-center text-xl font-black text-slate-950">تثبيت تطبيق الموظف</h2>
            <p className="mt-2 text-center text-sm font-bold leading-6 text-slate-500">
              ثبّت التطبيق على الشاشة الرئيسية حتى يفتح بسرعة ويشتغل مثل التطبيق الحقيقي.
            </p>

            {!installPrompt ? (
              <div className="mt-4 rounded-2xl bg-sky-50 p-3 text-sm font-bold leading-7 text-sky-700">
                من أندرويد: افتح قائمة المتصفح ⋮ ثم اختر <b>تثبيت التطبيق</b> أو <b>إضافة إلى الشاشة الرئيسية</b>.
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={dismissInstallModal}
                className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-500"
              >
                لاحقاً
              </button>

              <button
                onClick={installEmployeeApp}
                className="rounded-2xl bg-sky-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-sky-200"
              >
                تثبيت
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pushModalOpen ? (
        <div dir="rtl" className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-sky-50 text-sky-500">
              🔔
            </div>

            <h2 className="mt-4 text-center text-xl font-black text-slate-950">تفعيل إشعارات الموظف</h2>
            <p className="mt-2 text-center text-sm font-bold leading-6 text-slate-500">
              فعّل الإشعارات حتى توصلك رسائل واتساب الجديدة مباشرة حتى لو التطبيق مغلق.
            </p>

            {pushMsg ? (
              <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-center text-xs font-black text-slate-500">
                {pushMsg}
              </div>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={dismissPushModal}
                disabled={pushLoading}
                className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-500 disabled:opacity-50"
              >
                لاحقاً
              </button>

              <button
                onClick={activateEmployeePush}
                disabled={pushLoading}
                className="rounded-2xl bg-sky-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-sky-200 disabled:opacity-50"
              >
                {pushLoading ? 'جاري التفعيل...' : 'تفعيل'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!hideBottomNav ? (
      <nav className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md border-t border-slate-200 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 shadow-[0_-14px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-transform duration-200 ${keyboardOpen ? 'translate-y-full' : 'translate-y-0'}`}>
        <div className="grid grid-cols-5 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-bold transition ${
                    isActive ? 'bg-sky-500 text-white shadow-lg shadow-sky-200' : 'text-slate-400'
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
      ) : null}
    </div>
  );
}


function HelmetManifest() {
  document.title = 'Albarq Staff';

  let manifest = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (!manifest) {
    manifest = document.createElement('link');
    manifest.rel = 'manifest';
    document.head.appendChild(manifest);
  }
  manifest.href = '/employee-manifest.json';

  let theme = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!theme) {
    theme = document.createElement('meta');
    theme.name = 'theme-color';
    document.head.appendChild(theme);
  }
  theme.content = '#0ea5e9';

  return null;
}
