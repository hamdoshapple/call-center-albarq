import type { AppNotification, TimeSeriesPoint } from '@/types';

export const dailySeries: TimeSeriesPoint[] = [
  { label: '08:00', calls: 24, answered: 21, missed: 3 },
  { label: '09:00', calls: 42, answered: 38, missed: 4 },
  { label: '10:00', calls: 65, answered: 58, missed: 7 },
  { label: '11:00', calls: 78, answered: 69, missed: 9 },
  { label: '12:00', calls: 54, answered: 48, missed: 6 },
  { label: '13:00', calls: 38, answered: 34, missed: 4 },
  { label: '14:00', calls: 61, answered: 55, missed: 6 },
  { label: '15:00', calls: 72, answered: 64, missed: 8 },
  { label: '16:00', calls: 49, answered: 44, missed: 5 },
  { label: '17:00', calls: 31, answered: 28, missed: 3 },
];

export const weeklySeries: TimeSeriesPoint[] = [
  { label: 'days.sat', calls: 312, answered: 281, missed: 31 },
  { label: 'days.sun', calls: 398, answered: 360, missed: 38 },
  { label: 'days.mon', calls: 421, answered: 379, missed: 42 },
  { label: 'days.tue', calls: 389, answered: 351, missed: 38 },
  { label: 'days.wed', calls: 445, answered: 402, missed: 43 },
  { label: 'days.thu', calls: 367, answered: 332, missed: 35 },
  { label: 'days.fri', calls: 142, answered: 128, missed: 14 },
];

export const monthlySeries: TimeSeriesPoint[] = Array.from({ length: 12 }, (_, i) => {
  const labels = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const base = 6800 + ((i * 37) % 11) * 220;
  const answered = Math.round(base * 0.9);
  return { label: labels[i], calls: base, answered, missed: base - answered };
});

export const callsByDepartment = [
  { name: 'الدعم الفني', nameEn: 'Support', value: 184, color: '#0ea5e9' },
  { name: 'المحاسبة', nameEn: 'Accounting', value: 92, color: '#22c55e' },
  { name: 'المبيعات', nameEn: 'Sales', value: 121, color: '#f59e0b' },
  { name: 'عام', nameEn: 'General', value: 76, color: '#8b5cf6' },
];

export const peakHours = dailySeries.map((d) => ({ hour: d.label, calls: d.calls }));

export const seedNotifications: AppNotification[] = [
  { id: 'nt1', type: 'call', title: 'مكالمة في الانتظار', message: 'مكالمة من 07733221100 تنتظر في قائمة الدعم منذ 38 ثانية', read: false, createdAt: new Date(Date.now() - 60000).toISOString() },
  { id: 'nt2', type: 'alert', title: 'تجاوز وقت الانتظار', message: 'قائمة المحاسبة تجاوزت مستوى الخدمة المستهدف', read: false, createdAt: new Date(Date.now() - 240000).toISOString() },
  { id: 'nt3', type: 'agent', title: 'موظف متوقف مؤقتاً', message: 'الموظف يوسف ناصر (1004) في وضع التوقف المؤقت منذ 15 دقيقة', read: false, createdAt: new Date(Date.now() - 900000).toISOString() },
  { id: 'nt4', type: 'subscriber', title: 'مشترك متأخر', message: 'المشترك باسم قاسم لديه مديونية متراكمة 60,000 د.ع', read: true, createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: 'nt5', type: 'system', title: 'خط GSM بدون شريحة', message: 'الفتحة 4 في جهاز TG400 لا تحتوي على شريحة', read: true, createdAt: new Date(Date.now() - 7200000).toISOString() },
];
