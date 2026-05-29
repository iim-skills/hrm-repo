interface BadgeProps {
  variant: string;
  label: string;
}

const variantStyles: Record<string, string> = {
  admin: 'bg-rose-100 text-rose-700 border-rose-200',
  hr: 'bg-purple-100 text-purple-700 border-purple-200',
  manager: 'bg-blue-100 text-blue-700 border-blue-200',
  employee: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  active: 'bg-green-100 text-green-700 border-green-200',
  inactive: 'bg-red-100 text-red-700 border-red-200',
  tier1: 'bg-amber-100 text-amber-700 border-amber-200',
  tier2: 'bg-orange-100 text-orange-700 border-orange-200',
  tier3: 'bg-red-100 text-red-700 border-red-200',
  male: 'bg-sky-100 text-sky-700 border-sky-200',
  female: 'bg-pink-100 text-pink-700 border-pink-200',
  other: 'bg-slate-100 text-slate-700 border-slate-200',
  PRESENT: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PAID_SICK_LEAVE: 'bg-amber-100 text-amber-700 border-amber-200',
  WFH: 'bg-sky-100 text-sky-700 border-sky-200',
  REMOTE_COMFORT_DAY: 'bg-violet-100 text-violet-700 border-violet-200',
  HALF_DAY: 'bg-orange-100 text-orange-700 border-orange-200',
  SCHEDULE_OFF: 'bg-slate-100 text-slate-600 border-slate-200',
  LWP: 'bg-rose-100 text-rose-700 border-rose-200',
  LATE: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  EARLY_LEAVE: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  PLANNED_LEAVE: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  RESTRICTED_HOLIDAY: 'bg-teal-100 text-teal-700 border-teal-200',
  default: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function Badge({ variant, label }: BadgeProps) {
  const styles = variantStyles[variant] || variantStyles.default;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles}`}
    >
      {label}
    </span>
  );
}
