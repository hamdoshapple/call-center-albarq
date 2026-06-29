import { NavLink, Outlet } from 'react-router-dom';
import { Bell, Home, Phone, Ticket, User } from 'lucide-react';

const navItems = [
  { to: '/employee/dashboard', label: 'الرئيسية', icon: Home },
  { to: '/employee/calls', label: 'المكالمات', icon: Phone },
  { to: '/employee/tickets', label: 'التذاكر', icon: Ticket },
  { to: '/employee/profile', label: 'حسابي', icon: User },
];

export default function EmployeeLayout() {
  return (
    <div dir="rtl" className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <main className="mx-auto min-h-screen max-w-md pb-24">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md border-t border-slate-200 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 shadow-[0_-14px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <div className="grid grid-cols-4 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-bold transition ${
                    isActive
                      ? 'bg-sky-500 text-white shadow-lg shadow-sky-200'
                      : 'text-slate-400'
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

      <button className="fixed bottom-[88px] left-[calc(50%-196px)] z-40 flex h-12 w-12 items-center justify-center rounded-full bg-white text-sky-500 shadow-xl shadow-slate-200 max-[420px]:left-4">
        <Bell className="h-5 w-5" />
      </button>
    </div>
  );
}
