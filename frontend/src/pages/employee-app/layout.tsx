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
  const hideBottomNav = waChatOpen;


  useEffect(() => {
    const asked = localStorage.getItem('employee_push_asked');
    if (asked || localStorage.getItem('employee_push_enabled') === '1') return;

    const t = window.setTimeout(() => {
      localStorage.setItem('employee_push_asked', '1');
      enableEmployeePush().catch(() => null);
    }, 1500);

    return () => window.clearTimeout(t);
  }, []);

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
