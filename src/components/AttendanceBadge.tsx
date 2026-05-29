import { ATTENDANCE_STATUS_CONFIG } from '@/types';
import type { AttendanceStatus } from '@/types';

interface AttendanceBadgeProps {
  status: AttendanceStatus | null;
  size?: 'sm' | 'md';
}

export default function AttendanceBadge({ status, size = 'md' }: AttendanceBadgeProps) {
  if (!status) {
    return (
      <span className={`inline-flex items-center justify-center rounded-md border border-dashed border-slate-200 text-slate-400 font-medium ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
      }`}>
        —
      </span>
    );
  }

  const config = ATTENDANCE_STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border font-semibold ${config.color} ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
      }`}
      title={config.label}
    >
      {config.code}
    </span>
  );
}
