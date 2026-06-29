import { AlertCircle, CheckCircle2, Clock3, Plus, Ticket } from 'lucide-react';

export default function EmployeeTicketsPage() {
  return (
    <section className="space-y-5 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+18px)]">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-sky-500">Tasks</p>
          <h1 className="text-3xl font-black text-slate-950">التذاكر</h1>
        </div>
        <button className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-lg shadow-sky-200">
          <Plus className="h-6 w-6" />
        </button>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <StatusCard title="مفتوحة" value="0" icon={<AlertCircle />} />
        <StatusCard title="قيد العمل" value="0" icon={<Clock3 />} />
        <StatusCard title="مكتملة" value="0" icon={<CheckCircle2 />} />
      </div>

      <div className="rounded-[2rem] bg-white p-8 text-center shadow-xl shadow-slate-200/70">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-50 text-sky-500">
          <Ticket className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-lg font-black">ماكو تذاكر حالياً</h2>
        <p className="mt-2 text-sm font-medium text-slate-400">
          أنت على اطلاع بجميع المهام.
        </p>
      </div>
    </section>
  );
}

function StatusCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[1.35rem] bg-white p-3 text-center shadow-lg shadow-slate-200/70">
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-50 text-sky-500">
        {icon}
      </div>
      <p className="mt-2 text-2xl font-black">{value}</p>
      <p className="text-[11px] font-bold text-slate-400">{title}</p>
    </div>
  );
}
