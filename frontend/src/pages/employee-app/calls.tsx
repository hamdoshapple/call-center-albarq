import { Phone, PhoneCall, PhoneIncoming, Search } from 'lucide-react';

const emptyCalls = true;

export default function EmployeeCallsPage() {
  return (
    <section className="space-y-5 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+18px)]">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-sky-500">Call Center</p>
          <h1 className="text-3xl font-black text-slate-950">المكالمات</h1>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-sky-500 shadow-lg shadow-slate-200">
          <Phone className="h-6 w-6" />
        </div>
      </header>

      <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-lg shadow-slate-200/70">
        <Search className="h-5 w-5 text-slate-400" />
        <input
          className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
          placeholder="بحث برقم أو اسم المشترك"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MiniCard title="الواردة" value="0" icon={<PhoneIncoming />} />
        <MiniCard title="المجابة" value="0" icon={<PhoneCall />} />
      </div>

      {emptyCalls ? (
        <div className="rounded-[2rem] bg-white p-8 text-center shadow-xl shadow-slate-200/70">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-sky-50 text-sky-500">
            <Phone className="h-8 w-8" />
          </div>
          <h2 className="mt-4 text-lg font-black">لا توجد مكالمات حالياً</h2>
          <p className="mt-2 text-sm font-medium text-slate-400">
            لا توجد مكالمات حالياً.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function MiniCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[1.5rem] bg-white p-4 shadow-lg shadow-slate-200/70">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-400">{title}</span>
        <span className="text-sky-500">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-black">{value}</p>
    </div>
  );
}
