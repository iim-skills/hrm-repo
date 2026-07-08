'use client';

import { useState } from 'react';
import AttendanceBadge from '@/components/AttendanceBadge';
import type { IEmployee, IAttendance, AttendanceStatus } from '@/types';
import { ATTENDANCE_STATUS_CONFIG } from '@/types';

// Format date to local key
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getStatusBgClass(status: string | undefined, isToday: boolean, isWeekend: boolean): string {
  if (!status) {
    if (isToday) return 'bg-indigo-50/20 hover:bg-indigo-50/40 border border-indigo-100/30';
    if (isWeekend) return 'bg-slate-50/30 hover:bg-slate-50/60';
    return 'bg-white hover:bg-indigo-50/20';
  }
  switch (status) {
    case 'PRESENT':
      return 'bg-emerald-100/85 hover:bg-emerald-200/80 border border-emerald-200/40 text-slate-700';
    case 'PAID_SICK_LEAVE':
      return 'bg-amber-100/85 hover:bg-amber-200/80 border border-amber-200/40 text-slate-700';
    case 'WFH':
      return 'bg-sky-100/85 hover:bg-sky-200/80 border border-sky-200/40 text-slate-700';
    case 'REMOTE_COMFORT_DAY':
      return 'bg-violet-100/85 hover:bg-violet-200/80 border border-violet-200/40 text-slate-700';
    case 'HALF_DAY':
      return 'bg-orange-100/85 hover:bg-orange-200/80 border border-orange-200/40 text-slate-700';
    case 'SCHEDULE_OFF':
      return 'bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200/40 text-slate-500';
    case 'LWP':
      return 'bg-rose-100/85 hover:bg-rose-200/80 border border-rose-200/40 text-slate-700';
    case 'PLANNED_LEAVE':
      return 'bg-cyan-100/85 hover:bg-cyan-200/80 border border-cyan-200/40 text-slate-700';
    case 'LATE':
      return 'bg-indigo-100/85 hover:bg-indigo-200/80 border border-indigo-200/40 text-slate-700';
    case 'EARLY_LEAVE':
      return 'bg-fuchsia-100/85 hover:bg-fuchsia-200/80 border border-fuchsia-200/40 text-slate-700';
    case 'RESTRICTED_HOLIDAY':
      return 'bg-teal-100/85 hover:bg-teal-200/80 border border-teal-200/40 text-slate-700';
    default:
      if (isToday) return 'bg-indigo-50/20 hover:bg-indigo-50/40 border border-indigo-100/30';
      if (isWeekend) return 'bg-slate-50/30 hover:bg-slate-50/60';
      return 'bg-white hover:bg-indigo-50/20';
  }
}

interface CalendarGridProps {
  employee: IEmployee;
  attendanceRecords: Record<string, IAttendance>;
  dates: Date[];
}

export default function CalendarGrid({ employee, attendanceRecords, dates }: CalendarGridProps) {
  // Calendar requires computing padding slots (empty days before the 1st day of month)
  const firstDayOfMonth = dates[0];
  const startDayIndex = firstDayOfMonth.getDay(); // 0 = Sun, 1 = Mon, ...
  // Map Sun (0) -> 6, Mon (1) -> 0, Tue (2) -> 1, ..., Sat (6) -> 5
  const mondayStartDayIndex = startDayIndex === 0 ? 6 : startDayIndex - 1;

  // Padding slots (days from Monday till the 1st of month)
  const paddingSlots = Array.from({ length: mondayStartDayIndex }, (_, i) => i);

  const [selectedDayDetail, setSelectedDayDetail] = useState<{ date: Date; record: IAttendance | null } | null>(null);

  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div>
      {/* Legend Block */}
      <div className="flex flex-wrap items-center gap-3.5 mb-5 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-xl">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Legend:</span>
        {(Object.keys(ATTENDANCE_STATUS_CONFIG) as AttendanceStatus[]).map((status) => {
          const config = ATTENDANCE_STATUS_CONFIG[status];
          return (
            <div key={status} className="flex items-center gap-1">
              <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded border ${config.color}`}>
                {config.code}
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">{config.label}</span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Left Column: Calendar Sheet grid */}
        <div className="md:col-span-2 border border-slate-200/70 rounded-xl overflow-hidden shadow-sm">
          {/* Weekdays row */}
          <div className="grid grid-cols-7 border-b border-slate-200">
            {weekdayLabels.map((day) => {
              const isWeekend = day === 'Sat' || day === 'Sun';
              return (
                <div
                  key={day}
                  className={`py-2 text-center text-xs font-bold transition-colors ${
                    isWeekend
                      ? 'bg-rose-50/40 text-rose-500 font-extrabold border-x border-slate-100'
                      : 'bg-slate-50/70 text-slate-500'
                  }`}
                >
                  {day}
                </div>
              );
            })}
          </div>

          {/* Month grid days */}
          <div className="grid grid-cols-7 bg-white divide-y divide-x divide-slate-100">
            {/* Empty slots for month start padding */}
            {paddingSlots.map((i) => (
              <div key={`pad-${i}`} className="aspect-square bg-slate-50/30 text-slate-300" />
            ))}

            {/* Actual Month Days */}
            {dates.map((date) => {
              const key = toDateKey(date);
              const record = attendanceRecords[key] || null;
              const isToday = date.toDateString() === new Date().toDateString();
              const dayOfWeek = date.getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

              return (
                <div
                  key={key}
                  onClick={() => setSelectedDayDetail({ date, record })}
                  className={`aspect-square p-1.5 flex flex-col justify-between cursor-pointer transition-colors group relative ${
                    isToday ? 'ring-2 ring-indigo-500/30' : ''
                  } ${getStatusBgClass(record?.status, isToday, isWeekend)}`}
                >
                  {/* Day count */}
                  <span className={`text-xs font-bold ${
                    isToday
                      ? 'text-indigo-600 bg-indigo-50 w-5 h-5 rounded-full flex items-center justify-center'
                      : 'text-slate-500'
                  }`}>
                    {date.getDate()}
                  </span>

                  {/* Day status badge */}
                  <div className="flex justify-end">
                    {record ? (
                      <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded border leading-none badge-print ${ATTENDANCE_STATUS_CONFIG[record.status as AttendanceStatus]?.color
                        }`}>
                        {ATTENDANCE_STATUS_CONFIG[record.status as AttendanceStatus]?.code}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300 font-medium">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Selected day details panel */}
        <div className="border border-slate-200/80 rounded-xl p-4 bg-slate-50/40 shadow-sm flex flex-col justify-between min-h-[300px]">
          {selectedDayDetail ? (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  {selectedDayDetail.date.toLocaleDateString('en-IN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">Daily record status audit</p>
              </div>

              <div className="border-t border-slate-200/60 pt-3">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Attendance Status</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <AttendanceBadge status={selectedDayDetail.record ? (selectedDayDetail.record.status as AttendanceStatus) : null} />
                  <span className="text-sm font-bold text-slate-700">
                    {selectedDayDetail.record
                      ? ATTENDANCE_STATUS_CONFIG[selectedDayDetail.record.status as AttendanceStatus]?.label
                      : 'Unmarked / No record'}
                  </span>
                </div>
              </div>

              {selectedDayDetail.record && (() => {
                const firstLog = selectedDayDetail.record.history && selectedDayDetail.record.history.length > 0
                  ? selectedDayDetail.record.history[0]
                  : null;
                const originalMarker = firstLog?.updatedByName || selectedDayDetail.record.markedBy || 'System Generated / Seed';
                const originalDate = firstLog?.updatedAt || selectedDayDetail.record.createdAt;
                return (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Marked By</p>
                      <p className="text-xs font-semibold text-slate-700 truncate bg-white px-2 py-1.5 border border-slate-200 rounded-lg">
                        {originalMarker}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Notes / Explanations</p>
                      <p className="text-xs text-slate-600 bg-white p-2.5 border border-slate-200 rounded-lg min-h-[50px] leading-relaxed italic">
                        {selectedDayDetail.record.notes || 'No administrative notes submitted.'}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Registration Date</p>
                      <p className="text-[10px] text-slate-500">
                        {originalDate ? new Date(originalDate).toLocaleString('en-IN') : '—'}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="text-center py-12 space-y-2 my-auto">
              <span className="text-3xl">👈</span>
              <p className="text-xs font-semibold text-slate-600">Select any day on the calendar grid to audit details, administrative notes, and timestamps.</p>
            </div>
          )}

          <div className="border-t border-slate-200/60 pt-3 text-[10px] text-slate-400 font-medium text-center">
            7-Day Continuous Operation Matrix
          </div>
        </div>
      </div>
    </div>
  );
}
