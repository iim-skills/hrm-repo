'use client';

import type { AttendanceStatus } from '@/types';
import { ATTENDANCE_STATUS_CONFIG } from '@/types';
import AttendanceStatusDropdown from './AttendanceStatusDropdown';

interface BulkAttendanceToolbarProps {
  selectedCount: number;
  onApply: (status: AttendanceStatus | '', notes: string) => void;
  onClear: () => void;
  loading: boolean;
  isFuture?: boolean;
}

export default function BulkAttendanceToolbar({
  selectedCount,
  onApply,
  onClear,
  loading,
  isFuture = false,
}: BulkAttendanceToolbarProps) {
  const statusKeys = (Object.keys(ATTENDANCE_STATUS_CONFIG) as AttendanceStatus[]).filter(
    (status) => !isFuture || status === 'SCHEDULE_OFF'
  );

  const handleApply = (status: AttendanceStatus | '') => {
    onApply(status, '');
  };

  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-16 z-20 bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3 mb-4 flex items-center justify-between gap-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
            {selectedCount}
          </div>
          <span className="text-sm font-medium text-indigo-800">
            employee{selectedCount > 1 ? 's' : ''} selected
          </span>
        </div>
        <div className="h-5 w-px bg-indigo-200" />
        <span className="text-xs text-indigo-600">Apply status to all selected:</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {statusKeys.map((status) => {
          const config = ATTENDANCE_STATUS_CONFIG[status];
          return (
            <button
              key={status}
              onClick={() => handleApply(status)}
              disabled={loading}
              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50 ${config.color} hover:opacity-80`}
              title={config.label}
            >
              {config.code}
            </button>
          );
        })}
        <div className="h-5 w-px bg-indigo-200 mx-1" />
        <button
          type="button"
          onClick={() => handleApply('')}
          disabled={loading}
          className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
          title="Unmark / Clear Attendance"
        >
          Unmark
        </button>
        <AttendanceStatusDropdown
          value=""
          onChange={(status) => handleApply(status)}
          compact
          disabled={loading}
          onlyOffDay={isFuture}
        />
        <button
          onClick={onClear}
          className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
