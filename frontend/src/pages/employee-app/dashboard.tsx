import type { ReactNode } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock3,
  Coffee,
  Headphones,
  PhoneCall,
  PhoneMissed,
  TicketCheck,
} from 'lucide-react';

export default function EmployeeDashboardPage() {
  return (
    <section className="space-y-5 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+18px)]">
      <header className="relative overflow-hidden rounded-[2rem] bg-white p-5 shadow-xl shadow-slate-200/70">
        <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-sky-100" />
        <div className="absolute -bottom-12 right-16 h-36 w-36 rounded-full bg-cyan-100" />

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-sky-500">Albarq Staff</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
              صباح الخير 👋
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-500">
              تابع عملك بسهولة من مكان واحد.
            </p>
          </div>

          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-sky-500 text-white shadow-lg shadow-sky-200">
            <Headphones className="h-7 w-7" />
          </div>
        </div>
      </header>

      <div className="rounded-[1.75rem] bg-gradient-to-br from-sky-500 to-cyan-400 p-4 text-white shadow-xl shadow-sky-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold opacity-90">الحالة الحالية</p>
            <h2 className="mt-1 text-2xl font-black">متاح</h2>
            <p className="mt-1 text-xs font-medium opacity-80">جاهز لاستقبال المكالمات</p>
          </div>
          <CheckCircle2 className="h-11 w-11" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="rounded-2xl bg-white px-3 py-3 text-sm font-black text-sky-600">
            متاح
          </button>
          <button className="rounded-2xl bg-white/20 px-3 py-3 text-sm font-black text-white backdrop-blur">
            <span className="inline-flex items-center gap-1">
              <Coffee className="h-4 w-4" />
              استراحة
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard title="مكالمات اليوم" value="0" icon={<PhoneCall />} />
        <StatCard title="فائتة" value="0" icon={<PhoneMissed />} />
        <StatCard title="تذاكر مفتوحة" value="0" icon={<TicketCheck />} />
        <StatCard title="إشعارات" value="0" icon={<Bell />} />
      </div>

      <div className="rounded-[1.75rem] bg-white p-4 shadow-lg shadow-slate-200/70">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">ملخص اليوم</h2>
          <Clock3 className="h-5 w-5 text-sky-500" />
        </div>

        <div className="mt-4 space-y-3">
          <SummaryRow label="وقت العمل" value="0h 00m" />
          <SummaryRow label="آخر نشاط" value="لا يوجد" />
          <SummaryRow label="المهام المتأخرة" value="0" />
        </div>
      </div>
    </section>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-[1.5rem] bg-white p-4 shadow-lg shadow-slate-200/70">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-500">
        {icon}
      </div>
      <p className="text-3xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-bold text-slate-400">{title}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm font-bold text-slate-500">{label}</span>
      <span className="text-sm font-black text-slate-950">{value}</span>
    </div>
  );
}
