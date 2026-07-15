import { Bell, LogOut, ShieldCheck, User } from 'lucide-react';
import employeeLogout from './logout';

export default function EmployeeProfilePage() {
  return (
    <section className="space-y-5 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+18px)]">
      <header className="rounded-[2rem] bg-white p-5 text-center shadow-xl shadow-slate-200/70">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[2rem] bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-lg shadow-sky-200">
          <User className="h-10 w-10" />
        </div>
        <h1 className="mt-4 text-2xl font-black text-slate-950">حساب الموظف</h1>
        <p className="mt-1 text-sm font-bold text-slate-400">Albarq Staff Member</p>
      </header>

      <div className="space-y-3">
        <ProfileItem icon={<ShieldCheck />} title="الصلاحيات" subtitle="حسب حساب الموظف" />
        <ProfileItem icon={<Bell />} title="الإشعارات" subtitle="جاهزة للاستقبال" />
      </div>

      <button
        onClick={employeeLogout}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-4 text-sm font-black text-white shadow-lg shadow-red-100"
      >
        <LogOut className="h-5 w-5" />
        تسجيل الخروج
      </button>
    </section>
  );
}

function ProfileItem({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[1.5rem] bg-white p-4 shadow-lg shadow-slate-200/70">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-500">
        {icon}
      </div>
      <div>
        <p className="font-black text-slate-950">{title}</p>
        <p className="text-xs font-bold text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}
