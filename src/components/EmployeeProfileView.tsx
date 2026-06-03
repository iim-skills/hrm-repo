'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Badge from '@/components/Badge';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import AttendanceBadge from '@/components/AttendanceBadge';
import { ATTENDANCE_STATUS_CONFIG } from '@/types';
import type { AttendanceStatus } from '@/types';
import { getCycleBoundsForDate } from '@/lib/cycleUtils';
import CustomSelect from '@/components/CustomSelect';

interface MonthlySummary {
  presentCount: number;
  pslCount: number;
  halfDayCount: number;
  wfhCount: number;
  lwpCount: number;
  offDayCount: number;
  totalWorkingDays: number;
  attendanceRate: number;
}

interface LeaveBalance {
  allocated: number;
  used: number;
  carriedForward: number;
  balance: number;
}

interface AttendanceRecord {
  _id: string;
  date: string;
  status: string;
  notes?: string;
  markedByName?: string;
  createdAt?: string;
  history?: Array<{
    status: string;
    updatedByName?: string;
    updatedAt: string;
    notes?: string;
  }>;
}

interface EmployeeProfileViewProps {
  employeeId?: string;
  isSelfProfile?: boolean;
}

function toDateKey(date: Date): string {
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
  employee: any;
  attendanceRecords: Record<string, AttendanceRecord>;
  dates: Date[];
  onRefresh?: () => void;
  lateOverrides?: Record<string, any>;
  isSelfProfile?: boolean;
}

function CalendarGrid({ employee, attendanceRecords, dates, onRefresh, lateOverrides = {}, isSelfProfile }: CalendarGridProps) {
  const { user } = useAuth();
  const isAdminOrHr = user?.role === 'admin' || user?.role === 'hr';

  const firstDayOfMonth = dates[0];
  const startDayIndex = firstDayOfMonth.getDay();
  // Map Sun (0) -> 6, Mon (1) -> 0, Tue (2) -> 1, ..., Sat (6) -> 5
  const mondayStartDayIndex = startDayIndex === 0 ? 6 : startDayIndex - 1;

  const paddingSlots = Array.from({ length: mondayStartDayIndex }, (_, i) => i);
  const [selectedDayDetail, setSelectedDayDetail] = useState<{ date: Date; record: AttendanceRecord | null } | null>(null);
  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Editing states for Admin/HR
  const [isEditing, setIsEditing] = useState(false);
  const [editStatus, setEditStatus] = useState<AttendanceStatus | ''>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [submittingOverride, setSubmittingOverride] = useState(false);

  const isFutureDay = useMemo(() => {
    if (!selectedDayDetail) return false;
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const targetDate = new Date(selectedDayDetail.date);
    targetDate.setHours(0, 0, 0, 0);
    return targetDate > todayDate;
  }, [selectedDayDetail]);

  const canEditDay = useMemo(() => {
    if (!selectedDayDetail || !user) return false;
    const role = user.role;
    if (role !== 'admin' && role !== 'hr') return false;

    const now = new Date();
    const target = new Date(selectedDayDetail.date);
    target.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);

    const isFuture = target > now;
    if (isFuture) {
      return true;
    }

    if (role === 'admin') {
      return target.getMonth() === now.getMonth() && target.getFullYear() === now.getFullYear();
    }

    if (role === 'hr') {
      return (now.getTime() - target.getTime()) <= 7 * 24 * 60 * 60 * 1000;
    }

    return false;
  }, [selectedDayDetail, user]);

  useEffect(() => {
    if (selectedDayDetail) {
      setEditStatus(
        selectedDayDetail.record
          ? (selectedDayDetail.record.status as AttendanceStatus)
          : (isFutureDay ? 'SCHEDULE_OFF' : 'PRESENT')
      );
      setEditNotes(selectedDayDetail.record?.notes || '');
      setIsEditing(false); // Reset to read-only mode on clicked day changes
    }
  }, [selectedDayDetail, isFutureDay]);

  const handleSaveAttendance = async () => {
    if (!selectedDayDetail || !employee || !editStatus) return;

    try {
      setIsSaving(true);
      const dateStr = toDateKey(selectedDayDetail.date);

      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: [{
            employeeId: employee._id,
            date: dateStr,
            status: editStatus,
            notes: editNotes
          }]
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save attendance record');
      }

      // Proactively update local state for fast visual response
      const updatedRecord: AttendanceRecord = {
        _id: selectedDayDetail.record?._id || '',
        date: dateStr,
        status: editStatus,
        notes: editNotes,
        markedByName: user?.name || user?.email || 'Admin/HR',
        createdAt: selectedDayDetail.record?.createdAt || new Date().toISOString()
      };
      setSelectedDayDetail({
        date: selectedDayDetail.date,
        record: updatedRecord
      });
      setIsEditing(false);

      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred while saving attendance');
    } finally {
      setIsSaving(false);
    }
  };

  const submitLateOverride = async () => {
    if (!selectedDayDetail || !overrideReason.trim()) return;
    setSubmittingOverride(true);
    try {
      const dateStr = toDateKey(selectedDayDetail.date);
      const res = await fetch('/api/attendance/late-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, reason: overrideReason, employeeId: employee._id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit override request');

      alert('Override request submitted successfully!');
      setShowOverrideModal(false);
      setOverrideReason('');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(err.message || 'Error submitting request');
    } finally {
      setSubmittingOverride(false);
    }
  };

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
                  className={`py-2 text-center text-xs font-bold transition-colors ${isWeekend
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
                  className={`aspect-square p-1.5 flex flex-col justify-between cursor-pointer transition-colors group relative ${isToday ? 'ring-2 ring-indigo-500/30' : ''
                    } ${getStatusBgClass(record?.status, isToday, isWeekend)}`}
                >
                  {/* Day count */}
                  <span className={`text-xs font-bold ${isToday
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
                <p className="text-xs text-slate-400 mt-0.5">
                  {isAdminOrHr ? 'Administrative Attendance Editor' : 'Daily record status audit'}
                </p>
              </div>

              {canEditDay && isEditing ? (
                <div className="space-y-3.5 border-t border-slate-200/60 pt-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">Choose Status</label>
                    <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs custom-scrollbar">
                      {(Object.keys(ATTENDANCE_STATUS_CONFIG) as AttendanceStatus[])
                        .filter((status) => {
                          if (isFutureDay) {
                            return status === 'SCHEDULE_OFF' || status === 'PLANNED_LEAVE';
                          }
                          return true;
                        })
                        .map((status) => {
                          const config = ATTENDANCE_STATUS_CONFIG[status];
                          const isSelected = editStatus === status;

                          return (
                            <button
                              key={status}
                              type="button"
                              disabled={isSaving}
                              onClick={() => setEditStatus(status)}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-semibold transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${isSelected
                                ? 'border-indigo-500 bg-indigo-50/60 text-indigo-900 shadow-xs transform scale-[1.01]'
                                : 'border-slate-100 bg-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50/50'
                                }`}
                            >
                              <span className="flex items-center gap-2">
                                {isSelected && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse shrink-0" />
                                )}
                                {config.label}
                              </span>
                              <span className={`px-1.5 py-0.5 text-[9px] font-black rounded border shrink-0 ${config.color}`}>
                                {config.code}
                              </span>
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Notes / Reason</label>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Add reason for administrative markings..."
                      rows={3}
                      disabled={isSaving}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none disabled:opacity-50"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      disabled={isSaving}
                      className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-600 rounded-xl text-xs font-bold transition duration-150 disabled:opacity-50 cursor-pointer border border-slate-250"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveAttendance}
                      disabled={isSaving}
                      className="flex-[2] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isSaving ? (
                        <>
                          <svg className="animate-spin h-3.5 w-3.5 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          Save
                        </>
                      )}
                    </button>
                  </div>

                  {selectedDayDetail.record && (
                    <div className="border-t border-slate-200/40 pt-3.5 mt-2.5 space-y-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-bold uppercase tracking-wider">Marked By:</span>
                        <span className="font-semibold text-slate-700 truncate max-w-[140px]" title={selectedDayDetail.record.markedByName}>
                          {selectedDayDetail.record.markedByName || 'System'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-bold uppercase tracking-wider">Registered At:</span>
                        <span className="text-slate-500">
                          {selectedDayDetail.record.createdAt ? new Date(selectedDayDetail.record.createdAt).toLocaleDateString('en-IN') : '—'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
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
                    {selectedDayDetail.record?.status === 'LATE' && (
                      <div className="mt-3">
                        {lateOverrides[toDateKey(selectedDayDetail.date)] ? (
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${lateOverrides[toDateKey(selectedDayDetail.date)].status === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                            lateOverrides[toDateKey(selectedDayDetail.date)].status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                              'bg-rose-50 text-rose-700 border-rose-100'
                            }`}>
                            Override {lateOverrides[toDateKey(selectedDayDetail.date)].status}
                          </span>
                        ) : (
                          <button
                            onClick={() => setShowOverrideModal(true)}
                            className="text-[10px] font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors shadow-sm border border-indigo-100 cursor-pointer"
                          >
                            Request Override
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {selectedDayDetail.record && (
                    <>
                      <div className="space-y-1">
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Marked By</p>
                        <p className="text-xs font-semibold text-slate-700 truncate bg-white px-2 py-1.5 border border-slate-200 rounded-lg">
                          {selectedDayDetail.record.markedByName || 'System Generated / Seed'}
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
                          {selectedDayDetail.record.createdAt ? new Date(selectedDayDetail.record.createdAt).toLocaleString('en-IN') : '—'}
                        </p>
                      </div>
                    </>
                  )}

                  {canEditDay && !isEditing && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="w-full mt-3.5 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-350 text-slate-750 rounded-xl text-xs font-bold transition duration-150 cursor-pointer border border-slate-200 shadow-sm"
                    >
                      <svg className="w-3.5 h-3.5 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Edit Attendance
                    </button>
                  )}
                </>
              )}
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

      {showOverrideModal && selectedDayDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Request Late Override</h3>
              <button onClick={() => setShowOverrideModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                You are requesting to override your LATE attendance on <span className="font-bold text-slate-800">{toDateKey(selectedDayDetail.date)}</span>. Please provide a valid reason for HR/Admin approval.
              </p>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="E.g., Train delayed, approved by manager..."
                className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 resize-none h-24"
                disabled={submittingOverride}
              />
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowOverrideModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl disabled:opacity-50 cursor-pointer transition-colors">Cancel</button>
              <button onClick={submitLateOverride} disabled={!overrideReason.trim() || submittingOverride} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50 shadow-sm cursor-pointer transition-colors">
                {submittingOverride ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmployeeProfileView({ employeeId, isSelfProfile }: EmployeeProfileViewProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetEmployee, setTargetEmployee] = useState<any>(null);

  // Date selection states
  const today = new Date();
  const currentCycle = getCycleBoundsForDate(today);
  const defaultYear = currentCycle.cycleYear < 2026 ? 2026 : currentCycle.cycleYear;
  const defaultMonth = defaultYear === 2026 && (currentCycle.cycleMonth - 1) < 4 ? 4 : (currentCycle.cycleMonth - 1);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  // Data states
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>(null as any);
  const [wfhRestriction, setWfhRestriction] = useState<{ restrictedUntil: string; reason: string } | null>(null);
  const [sandwichFlags, setSandwichFlags] = useState<string[]>([]);
  const [tierHistory, setTierHistory] = useState<any[]>([]);
  const [lateOverrides, setLateOverrides] = useState<Record<string, any>>({});

  // Generate date array for the custom cycle (21st of previous month to 20th of current month)
  const datesInMonth = useMemo(() => {
    const startYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
    const startMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
    const startDate = new Date(startYear, startMonth, 21);
    const endDate = new Date(selectedYear, selectedMonth, 20);

    const dates: Date[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }, [selectedMonth, selectedYear]);

  const activeCycleLabel = useMemo(() => {
    if (datesInMonth.length === 0) return '';
    const start = datesInMonth[0];
    const end = datesInMonth[datesInMonth.length - 1];
    return `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} — ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }, [datesInMonth]);

  // Map attendance by dateKey
  const attendanceMap = useMemo(() => {
    const map: Record<string, AttendanceRecord> = {};
    if (!history) return map;
    for (const record of history) {
      const dateKey = toDateKey(new Date(record.date));
      map[dateKey] = record;
    }
    return map;
  }, [history]);

  // Count Late and Early Leave days from history
  const lateCount = useMemo(() => {
    if (!history) return 0;
    return history.filter((rec) => rec.status === 'LATE').length;
  }, [history]);

  const earlyLeaveCount = useMemo(() => {
    if (!history) return 0;
    return history.filter((rec) => rec.status === 'EARLY_LEAVE').length;
  }, [history]);

  const plannedLeaveCount = useMemo(() => {
    if (!history) return 0;
    return history.filter((rec) => rec.status === 'PLANNED_LEAVE').length;
  }, [history]);

  // Month navigation helpers
  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const fetchDashboardData = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) {
      setLoading(true);
    }
    setError(null);

    try {
      // 0. Fetch target employee details if viewed by another role
      if (employeeId) {
        const empRes = await fetch(`/api/employees/${employeeId}`);
        if (!empRes.ok) {
          throw new Error('Failed to load employee details or unauthorized');
        }
        const empData = await empRes.json();
        if (!empData || !empData.employee) {
          throw new Error('Employee profile not found');
        }
        setTargetEmployee(empData.employee);
      }

      // 1. Fetch Monthly Summary & Leave Balance
      const summaryUrl = `/api/attendance/summary?year=${selectedYear}&month=${selectedMonth}${employeeId ? `&employeeId=${employeeId}` : ''
        }`;
      const summaryRes = await fetch(summaryUrl);
      if (!summaryRes.ok) {
        const errData = await summaryRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load monthly summary data');
      }
      const summaryData = await summaryRes.json();

      setSummary(summaryData.summary || {
        presentCount: 0,
        pslCount: 0,
        halfDayCount: 0,
        wfhCount: 0,
        lwpCount: 0,
        offDayCount: 0,
        totalWorkingDays: 0,
        attendanceRate: 0
      });
      setBalance(summaryData.balance || {
        allocated: 0,
        used: 0,
        carriedForward: 0,
        balance: 0
      });
      setWfhRestriction(summaryData.wfhRestriction || null);
      setSandwichFlags(summaryData.sandwichFlags || []);

      // 2. Fetch Detailed Attendance Records for the Date Range
      const startYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
      const startMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
      const firstDay = toDateKey(new Date(startYear, startMonth, 21));
      const lastDay = toDateKey(new Date(selectedYear, selectedMonth, 20));

      const historyUrl = `/api/attendance?startDate=${firstDay}&endDate=${lastDay}${employeeId ? `&employeeId=${employeeId}` : ''
        }`;
      const historyRes = await fetch(historyUrl);
      if (!historyRes.ok) {
        const errData = await historyRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load attendance history records');
      }
      const historyData = await historyRes.json();

      // Sort records chronologically (newest first)
      const sortedHistory = (historyData.records || historyData.attendance || []).sort(
        (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setHistory(sortedHistory);

      // 3. Fetch Roster Tier History (6 months)
      const tierHistoryUrl = `/api/automation/tiers?history=true${employeeId ? `&employeeId=${employeeId}` : ''
        }`;
      const tierHistoryRes = await fetch(tierHistoryUrl);
      if (tierHistoryRes.ok) {
        const tierHistoryData = await tierHistoryRes.json();
        setTierHistory(tierHistoryData.history || []);
      }

      // 4. Fetch Late Overrides
      const lateOverridesUrl = `/api/attendance/late-override${employeeId ? `?employeeId=${employeeId}` : ''
        }`;
      const lateRes = await fetch(lateOverridesUrl);
      if (lateRes.ok) {
        const lateData = await lateRes.json();
        const overridesMap: Record<string, any> = {};
        lateData.requests?.forEach((req: any) => {
          overridesMap[toDateKey(new Date(req.date))] = req;
        });
        setLateOverrides(overridesMap);
      }

    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message || 'An error occurred while fetching dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }, [user, selectedYear, selectedMonth, employeeId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (loading) {
    return <LoadingState message="Assembling the personalized dashboard..." />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-center max-w-lg mx-auto my-10 shadow-sm">
        <span className="text-3xl">⚠️</span>
        <h3 className="text-lg font-bold mt-2">Error Loading Profile</h3>
        <p className="text-sm mt-1">{error}</p>
        <div className="mt-4 flex justify-center gap-3">
          {employeeId && (
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              Go Back
            </button>
          )}
          <button
            onClick={() => fetchDashboardData(false)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const displayUser = employeeId ? targetEmployee : user;

  const totalPslBalance = (balance?.carriedForward || 0) + (balance?.allocated || 0);
  const halfDayDeduction = (summary?.halfDayCount || 0) * 0.5;
  const pslTaken = summary?.pslCount || 0;
  const lwpTaken = summary?.lwpCount || 0;

  // Late LOP breakdown: first 2 are free, subsequent deduct 0.25 days each
  const lateDeduction = lateCount > 2 ? (lateCount - 2) * 0.25 : 0;
  const baseLwpTaken = Math.max(0, lwpTaken - plannedLeaveCount); // lwpCount is now pure LWP!

  // Total LOP / Absences: pslTaken + halfDayDeduction + lwpTaken + lateDeduction
  const totalLOPAbsences = pslTaken + halfDayDeduction + lwpTaken + lateDeduction;

  // Adjusted Available PSL Balance = Max(0, totalPslBalance - totalLOPAbsences)
  const adjustedAvailablePsl = Math.max(0, totalPslBalance - totalLOPAbsences);

  // Salary deduction days (Est. Salary Deduction)
  const salaryDeductionDays = totalLOPAbsences > totalPslBalance ? totalLOPAbsences - totalPslBalance : 0;

  return (
    <div className="space-y-7 max-w-7xl mx-auto pb-10">
      {/* Back Button for Admin/HR/Manager view */}
      {employeeId && !isSelfProfile && (
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Listings
        </button>
      )}

      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {employeeId ? `Profile of ${displayUser?.name}` : `Welcome Back, ${displayUser?.name}!`}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Role: <span className="font-semibold text-indigo-600 uppercase text-xs">{displayUser?.role}</span> ·
            Email: <span className="text-slate-600">{displayUser?.email}</span>
            {displayUser?.department && (
              <>
                {' '}· Department: <span className="font-semibold text-slate-700">{displayUser?.department}</span>
              </>
            )}
          </p>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-2 bg-indigo-50/50 border border-indigo-100 rounded-xl px-4 py-2 shadow-sm text-xs font-semibold text-indigo-700 select-none transition-all duration-200">
            <span>📅 Cycle:</span>
            <span>{activeCycleLabel}</span>
          </div>
          <CustomSelect
            label="Month"
            value={selectedMonth}
            onChange={(v: number) => setSelectedMonth(v)}
            options={monthsList
              .map((m, idx) => ({ value: idx, label: m }))
              .filter((m) => {
                if (selectedYear === 2026 && m.value < 4) return false;
                if (selectedYear > currentCycle.cycleYear) return false;
                if (selectedYear === currentCycle.cycleYear && m.value > currentCycle.cycleMonth - 1) return false;
                return true;
              })}
          />
          <CustomSelect
            label="Year"
            value={selectedYear}
            onChange={(v: number) => {
              setSelectedYear(v);
              if (v === 2026 && selectedMonth < 4) {
                setSelectedMonth(4);
              }
            }}
            options={[2026, 2027].filter(y => y <= currentCycle.cycleYear).map((y) => ({ value: y, label: String(y) }))}
            maxWidthClass="min-w-[100px]"
          />
        </div>
      </div>

      {/* WFH Restriction Alert Banner */}
      {wfhRestriction && (
        <div className="bg-linear-to-r from-rose-50 to-amber-50 border-l-4 border-rose-600 p-5 rounded-2xl shadow-sm flex items-start gap-4 animate-pulse">
          <span className="text-2xl mt-0.5">🚫</span>
          <div>
            <h4 className="text-sm font-extrabold text-rose-900 uppercase tracking-wide">Work From Home Privilege Locked</h4>
            <p className="text-xs text-rose-700 mt-1 leading-relaxed">
              Work-from-home privilege has been suspended until <strong>{new Date(wfhRestriction.restrictedUntil).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>.
            </p>
            <p className="text-[10px] text-rose-600 mt-2 font-medium italic">
              Reason: &quot;{wfhRestriction.reason}&quot; (In accordance with roster policy guidelines, Half-Day markings trigger automatic rolling 7-day lockout of remote comforts).
            </p>
          </div>
        </div>
      )}

      {/* Sandwich Notification Alert Banner */}
      {sandwichFlags.length > 0 && (
        <div className="bg-linear-to-r from-orange-50 to-amber-50 border-l-4 border-orange-600 p-5 rounded-2xl shadow-sm flex items-start gap-4 animate-pulse">
          <span className="text-2xl mt-0.5">🥪</span>
          <div>
            <h4 className="text-sm font-extrabold text-orange-900 uppercase tracking-wide">Sandwich Leave Active</h4>
            <p className="text-xs text-orange-700 mt-1 leading-relaxed">
              Attendance for <strong>{sandwichFlags.map(d => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })).join(', ')}</strong> has been marked as <strong>LWP</strong> due to the sandwich policy.
            </p>
            <p className="text-[10px] text-orange-600 mt-2 font-medium italic">
              (In accordance with roster policy guidelines, unauthorized absences surrounding off-days or holidays trigger automatic deduction of the intervening days).
            </p>
          </div>
        </div>
      )}

      {/* Roster Tier & Eligibility Status */}
      {(() => {
        const activeMonthTier = tierHistory.find(
          (t) => t.year === selectedYear && t.month === selectedMonth
        );
        const isFemale = displayUser?.genderFlag === 'female';

        // Derive RCD dates for the selected month from existing attendance history
        const rcdDatesThisMonth = (history || [])
          .filter((r) => r.status === 'REMOTE_COMFORT_DAY')
          .map((r) => new Date(r.date))
          .sort((a, b) => a.getTime() - b.getTime());

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Current Roster Tier Card */}
            <div className={`${isFemale ? 'lg:col-span-1' : 'lg:col-span-2'} bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between`}>
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                  Roster Tier Status ({monthsList[selectedMonth]} {selectedYear})
                </h3>

                {activeMonthTier ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-5 bg-slate-50 p-4.5 rounded-xl border border-slate-100">
                    {activeMonthTier.tier === 1 && (
                      <>
                        <div className="w-14 h-14 rounded-2xl bg-emerald-5050 text-emerald-600 flex items-center justify-center shrink-0">
                          <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                          </svg>
                        </div>
                        <div>
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
                            Roster Tier 1 - Elite
                          </span>
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed font-medium">
                            Tier 1 status achieved. Eligible for prime off-day calendar bidding, priority scheduling, and flexible rosters.
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1 italic">
                            Reason: &quot;{activeMonthTier.reason}&quot;
                          </p>
                        </div>
                      </>
                    )}
                    {activeMonthTier.tier === 2 && (
                      <>
                        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                          <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                          </svg>
                        </div>
                        <div>
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 border border-amber-200 text-amber-700">
                            Roster Tier 2 - Preferred
                          </span>
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed font-medium">
                            Tier 2 status achieved. Standard roster preferences and roster bidding eligibility apply.
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1 italic">
                            Reason: &quot;{activeMonthTier.reason}&quot;
                          </p>
                        </div>
                      </>
                    )}
                    {activeMonthTier.tier === 3 && (
                      <>
                        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                          <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                        <div>
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 border border-rose-200 text-rose-700">
                            Roster Tier 3 - Restricted
                          </span>
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed font-medium">
                            Tier status is currently Tier 3. Off-day preferences and flexible roster selections are suspended; rosters are auto-assigned by default rules.
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1 italic">
                            Reason: &quot;{activeMonthTier.reason}&quot;
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-50 p-4.5 rounded-xl border border-slate-100 flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center shrink-0 text-slate-500 font-bold">
                      ?
                    </div>
                    <div>
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 border border-slate-200 text-slate-500">
                        Pending Calculation
                      </span>
                      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed font-medium">
                        Roster tier metrics for this month will lock permanently during month-end freeze processing.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-150 text-[11px] text-slate-500 mt-4 flex gap-2 leading-relaxed">
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  <strong>Tier Rules Policy:</strong> Tiers evaluate month-end absence aggregates. Tier 1 requires exactly 0 PSL, 0 Half-Days, and 0 LWPs. Tier 2 allows up to 1 PSL or up to 2 Half-Days (0 LWPs). Tier 3 applies if you have any LWPs or exceed 1 PSL equivalent of absences (e.g. 1 PSL + 1 Half-Day, or 3 Half-Days).
                </span>
              </div>
            </div>

            {/* Live Tier Tracking Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2" />
                  </svg>
                  Month-to-Date Leave Tracker
                </h3>

                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs text-slate-500 font-medium">Sick Leaves (PSL):</span>
                    <span className="text-xs font-bold text-slate-800">{summary?.pslCount || 0}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs text-slate-500 font-medium">Half-Days:</span>
                    <span className="text-xs font-bold text-slate-800">{summary?.halfDayCount || 0}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs text-slate-500 font-medium">LWPs:</span>
                    <span className="text-xs font-bold text-slate-800">{Math.max(0, (summary?.lwpCount || 0) - plannedLeaveCount)}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs text-slate-500 font-medium">Planned Leaves:</span>
                    <span className="text-xs font-bold text-slate-800">{plannedLeaveCount}</span>
                  </div>

                  {/* Status Indicator */}
                  <div className="pt-2">
                    {(() => {
                      const psl = summary?.pslCount || 0;
                      const half = summary?.halfDayCount || 0;
                      const lwp = summary?.lwpCount || 0;

                      const absenceWeight = psl + (half * 0.5);

                      if (lwp > 0 || absenceWeight > 1.0) {
                        return (
                          <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-800 text-[11px] font-semibold">
                            ⚠️ Tracking towards Tier 3.
                          </div>
                        );
                      } else if (absenceWeight > 0) {
                        return (
                          <div className="p-3 bg-orange-50 rounded-xl border border-orange-200 text-orange-800 text-[11px] font-semibold">
                            ✨ Roster Tier 2 tracking is active.
                          </div>
                        );
                      } else {
                        return (
                          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-[11px] font-semibold">
                            🏆 Roster Tier 1 tracking is active!
                          </div>
                        );
                      }
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Female-only: Remote Comfort Day (RCD) Log Card */}
            {isFemale && (
              <div className="bg-white border border-violet-200 rounded-2xl p-6 shadow-sm flex flex-col">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
                  <svg className="w-5 h-5 text-violet-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  RCD Usage Log
                  <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-600">
                    {monthsList[selectedMonth]} {selectedYear}
                  </span>
                </h3>

                {/* RCD count badge */}
                <div className="flex items-center gap-3 mb-4 p-3.5 bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl border border-violet-100">
                  <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">RCDs Taken</p>
                    <p className="text-2xl font-black text-violet-900 leading-none">
                      {rcdDatesThisMonth.length}
                      <span className="text-xs font-semibold text-violet-500 ml-1">/ 1 allowed</span>
                    </p>
                  </div>
                  <div className="ml-auto">
                    {rcdDatesThisMonth.length === 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-700">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        Available
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-violet-100 border border-violet-300 text-violet-700">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        Used
                      </span>
                    )}
                  </div>
                </div>

                {/* Date entries */}
                <div className="flex-1">
                  {rcdDatesThisMonth.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center border border-dashed border-violet-200 rounded-xl bg-violet-50/30">
                      <svg className="w-8 h-8 text-violet-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      <p className="text-xs font-semibold text-violet-500">No RCD taken this month</p>
                      <p className="text-[10px] text-violet-400 mt-1">1 Remote Comfort Day available to use</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {rcdDatesThisMonth.map((date, idx) => (
                        <div key={idx} className="flex items-center gap-3 p-2.5 bg-violet-50 border border-violet-100 rounded-xl">
                          <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center shrink-0">
                            <span className="text-[11px] font-black text-white leading-none">
                              {date.getDate()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800">
                              {date.toLocaleDateString('en-IN', { weekday: 'long' })}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                          </div>
                          <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-violet-200 text-violet-800 border border-violet-300">
                            RCD
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Policy note */}
                <div className="mt-4 bg-violet-50 border border-violet-100 rounded-xl p-3 text-[10px] text-violet-600 leading-relaxed flex gap-2">
                  <svg className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span><strong>Policy:</strong> Female employees are entitled to 1 Remote Comfort Day (RCD) per calendar month. Unused RCDs do not carry forward.</span>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Main Container: Summary Cards & Leave Balance (3-column grid layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Card 1: Monthly Attendance Summary */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col">
          <h2 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2" />
            </svg>
            Summary — {monthsList[selectedMonth]} {selectedYear}
          </h2>

          <div className="grid grid-cols-2 gap-2.5 flex-1">

            {/* Present */}
            <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide leading-none">Present in Office</span>
              <span className="text-2xl font-black text-emerald-800 leading-none">{summary?.presentCount || 0}</span>
              <span className="text-[10px] text-emerald-500 leading-none">Office days</span>
            </div>

            {/* WFH */}
            <div className="bg-sky-50 border border-sky-100 p-3 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wide leading-none">WFH</span>
              <span className="text-2xl font-black text-sky-800 leading-none">{summary?.wfhCount || 0}</span>
              <span className="text-[10px] text-sky-500 leading-none">Remote days</span>
            </div>

            {/* Half Day */}
            <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide leading-none">Half Day</span>
              <span className="text-2xl font-black text-amber-800 leading-none">{summary?.halfDayCount || 0}</span>
              <span className="text-[10px] text-amber-500 leading-none">Half credits</span>
            </div>

            {/* PSL */}
            <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wide leading-none">Sick (PSL)</span>
              <span className="text-2xl font-black text-rose-800 leading-none">{summary?.pslCount || 0}</span>
              <span className="text-[10px] text-rose-500 leading-none">Sick leaves</span>
            </div>

            {/* LWP */}
            <div className="bg-purple-50 border border-purple-100 p-3 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wide leading-none">LWP</span>
              <span className="text-2xl font-black text-purple-800 leading-none">{summary?.lwpCount || 0}</span>
              <span className="text-[10px] text-purple-500 leading-none">Unpaid leave</span>
            </div>

            {/* Off Day */}
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide leading-none">Off Days</span>
              <span className="text-2xl font-black text-slate-700 leading-none">{summary?.offDayCount || 0}</span>
              <span className="text-[10px] text-slate-400 leading-none">Roster off</span>
            </div>

            {/* Late */}
            <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide leading-none">Late</span>
              <span className="text-2xl font-black text-amber-800 leading-none">{lateCount}</span>
              <span className="text-[10px] text-amber-500 leading-none">Late arrivals</span>
            </div>

            {/* Early Leave */}
            <div className="bg-orange-50 border border-orange-100 p-3 rounded-xl flex flex-col gap-1">
              <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wide leading-none">Early Leave</span>
              <span className="text-2xl font-black text-orange-800 leading-none">{earlyLeaveCount}</span>
              <span className="text-[10px] text-orange-500 leading-none">Early leaves</span>
            </div>

          </div>

          {/* Attendance Rate Progress bar */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-slate-500">Attendance Rate</span>
              <span className="text-sm font-bold text-indigo-600">{summary?.attendanceRate || 0}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${summary?.attendanceRate || 0}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
              (Present + WFH + 0.5×HalfDay) ÷ {summary?.totalWorkingDays || 0} working days
            </p>
          </div>

        </div>


        {/* Unified Card: Leave Balance & Salary Deductions */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col">
          <h2 className="text-base font-bold text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
            <span>⚖️</span> Leave Balance & Salary Deductions
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
            {/* Left Column: Highlights */}
            <div className="flex flex-col gap-4">
              <div className="bg-linear-to-br from-indigo-50 to-purple-50 rounded-xl p-5 border border-indigo-100 text-center flex flex-col justify-center items-center flex-1">
                <p className="text-xs text-indigo-700 font-bold uppercase tracking-widest">Available Balance</p>
                <p className="text-5xl font-black text-indigo-900 mt-2 shadow-sm inline-block px-5 py-2 bg-white rounded-2xl border border-indigo-100">
                  {adjustedAvailablePsl} <span className="text-sm font-semibold text-indigo-500">days</span>
                </p>
                <p className="text-[11px] text-indigo-500 mt-2.5">Unused PSL carries forward automatically.</p>
              </div>

              <div className="bg-linear-to-br from-rose-50 to-amber-50 rounded-xl p-5 border border-rose-100 text-center flex flex-col justify-center items-center flex-1">
                <p className="text-xs text-rose-700 font-bold uppercase tracking-widest">Est. Salary Deduction</p>
                <p className="text-5xl font-black text-rose-900 mt-2 shadow-sm inline-block px-5 py-2 bg-white rounded-2xl border border-rose-100">
                  {salaryDeductionDays} <span className="text-sm font-semibold text-rose-500">days</span>
                </p>
                <p className="text-[11.5px] text-rose-600 font-semibold mt-2.5">
                  {salaryDeductionDays > 0
                    ? `⚠️ LOP applied: money will deduct for ${salaryDeductionDays} days`
                    : '✅ No LOP deductions applied this month'}
                </p>
              </div>
            </div>

            {/* Right Column: Breakdown */}
            <div className="flex flex-col space-y-4 text-sm bg-slate-50 p-5 rounded-xl border border-slate-100 justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">1. Starting PSL Balance</h3>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-600 font-medium pl-2">Carried Forward (Prev. Month):</span>
                  <span className="font-bold text-slate-800">{balance?.carriedForward !== undefined ? balance.carriedForward : 0} days</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2 mt-2">
                  <span className="text-slate-600 font-medium pl-2">Allocated This Month:</span>
                  <span className="font-bold text-emerald-600">+{balance?.allocated !== undefined ? balance.allocated : 0} days</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-slate-800 font-bold">Total Starting PSL:</span>
                  <span className="font-black text-indigo-600">{totalPslBalance} days</span>
                </div>
              </div>

              <div className="pt-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">2. Absences & Penalties (Deductions)</h3>
                {totalLOPAbsences === 0 ? (
                  <div className="text-center py-4 text-slate-400 italic border-b border-slate-200 mb-2">
                    No absences or penalties this month.
                  </div>
                ) : (
                  <div className="flex flex-col space-y-2 border-b border-slate-200 pb-2">
                    {pslTaken > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600 font-medium pl-2">Paid Sick Leave Taken:</span>
                        <span className="font-bold text-rose-600">-{pslTaken} days</span>
                      </div>
                    )}
                    {halfDayDeduction > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600 font-medium pl-2">Half-Day Absences:</span>
                        <span className="font-bold text-rose-600">-{halfDayDeduction} days</span>
                      </div>
                    )}
                    {baseLwpTaken > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600 font-medium pl-2">Leave Without Pay (LWP):</span>
                        <span className="font-bold text-rose-600">-{baseLwpTaken} days</span>
                      </div>
                    )}
                    {plannedLeaveCount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600 font-medium pl-2">Planned Leave:</span>
                        <span className="font-bold text-rose-600">-{plannedLeaveCount} days</span>
                      </div>
                    )}
                    {lateDeduction > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600 font-medium pl-2">Late Arrivals ({lateCount} lates):</span>
                        <span className="font-bold text-rose-600">-{lateDeduction} days</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <span className="text-slate-800 font-bold">Total Deductions:</span>
                  <span className="font-black text-rose-600">-{totalLOPAbsences} days</span>
                </div>
              </div>

              <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100 mt-4 flex flex-col items-center text-center shadow-sm">
                <span className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3">Final Calculation</span>

                <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 text-sm font-medium text-slate-600 mb-4">
                  <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                    Starting: <span className="font-bold text-slate-800">{totalPslBalance}</span>
                  </div>
                  <span className="text-slate-400 font-bold">-</span>
                  <div className="bg-white px-3 py-1.5 rounded-lg border border-rose-100 shadow-sm text-rose-600">
                    Deductions: <span className="font-bold">{totalLOPAbsences}</span>
                  </div>
                </div>

                <div className="w-full max-w-xs h-px bg-indigo-100 mb-4" />

                <div className="flex flex-col items-center gap-1">
                  <div className="text-base font-bold text-slate-800">
                    Available PSL: <span className="text-2xl font-black text-indigo-600 ml-1">{adjustedAvailablePsl} <span className="text-sm font-bold">days</span></span>
                  </div>
                  {salaryDeductionDays > 0 && (
                    <div className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100 mt-2">
                      ⚠️ Salary Deduction: {salaryDeductionDays} days
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-[11px] text-slate-500 mt-5 flex gap-2 leading-relaxed">
            <span>ℹ️</span>
            <span>
              <strong>Loss of Pay (LOP) Rule:</strong> If monthly sick leaves, half days (0.5 LOP per half day), and LWPs exceed total PSL balance, salary is deducted for the negative balance difference. All records are audited automatically at the beginning of each calendar month.
            </span>
          </div>
        </div>

      </div>

      {/* Detailed Monthly Attendance Sheet */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span>📅</span> Detailed Monthly Attendance Sheet: {monthsList[selectedMonth]} {selectedYear}
        </h2>
        {history === null ? (
          <div className="py-10 text-center text-slate-400">Loading attendance data...</div>
        ) : (
          <CalendarGrid
            employee={displayUser}
            attendanceRecords={attendanceMap}
            dates={datesInMonth}
            onRefresh={() => fetchDashboardData(true)}
            lateOverrides={lateOverrides}
            isSelfProfile={isSelfProfile}
          />
        )}
      </div>

      {/* Roster Tier 6-Month History Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          6-Month Roster Tier History Audit
        </h3>

        {tierHistory.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
            No historical roster tier calculations are available yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200/80">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Month &amp; Year</th>
                  <th className="px-5 py-3.5">Assigned Roster Tier</th>
                  <th className="px-5 py-3.5">Reason / Rule Triggered</th>
                  <th className="px-5 py-3.5">Calculation &amp; Freeze Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {tierHistory.map((item) => {
                  let badge = (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold border bg-slate-50 border-slate-200 text-slate-400">
                      Tier {item.tier}
                    </span>
                  );
                  if (item.tier === 1) {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold border bg-emerald-50 border-emerald-200 text-emerald-700">
                        Tier 1 - Elite
                      </span>
                    );
                  } else if (item.tier === 2) {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold border bg-amber-50 border-amber-200 text-amber-700">
                        Tier 2 - Preferred
                      </span>
                    );
                  } else if (item.tier === 3) {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold border bg-rose-50 border-rose-200 text-rose-700">
                        Tier 3 - Restricted
                      </span>
                    );
                  }

                  return (
                    <tr key={item._id} className="hover:bg-slate-50/50 transition">
                      <td className="px-5 py-4 font-bold text-slate-900">
                        {monthsList[item.month]} {item.year}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        {badge}
                      </td>
                      <td className="px-5 py-4 text-slate-500 italic max-w-sm truncate">
                        &quot;{item.reason}&quot;
                      </td>
                      <td className="px-5 py-4 text-slate-400 whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString('en-IN')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section: Dynamic Attendance History (Read-Only) */}
      {/* COMMENTED OUT — Attendance Records & Log History block hidden for employee profile */}
      {/* {user?.role === 'employee' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span>📅</span> Attendance Records & Log History
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">A complete read-only record log of daily attendance and admin changes</p>
            </div>
            <Badge variant="employee" label="READ-ONLY PORTAL" />
          </div>

          {history === null ? (
            <div className="py-10 text-center text-slate-400">Loading history records...</div>
          ) : history.length === 0 ? (
            <EmptyState
              title="No Attendance Recorded"
              description="There are no attendance logs available for this account during this selected calendar month."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider">
                    <th className="px-5 py-3.5">Date</th>
                    <th className="px-5 py-3.5">Attendance Status</th>
                    <th className="px-5 py-3.5">Marked By</th>
                    <th className="px-5 py-3.5">Administrative Notes</th>
                    <th className="px-5 py-3.5">Audited Revisions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {history.map((record) => (
                    <tr key={record._id} className="hover:bg-slate-50/50 transition">
                      <td className="px-5 py-4 whitespace-nowrap text-slate-900 font-bold">
                        {new Date(record.date).toLocaleDateString('en-IN', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          timeZone: 'UTC'
                        })}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <Badge variant={record.status.toLowerCase() as any} label={record.status.replace(/_/g, ' ')} />
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap font-semibold text-slate-800">
                        {record.markedByName || 'System Seed'}
                      </td>
                      <td className="px-5 py-4 text-slate-500 max-w-xs truncate italic">
                        {record.notes ? `"${record.notes}"` : '—'}
                      </td>
                      <td className="px-5 py-4">
                        {record.history && record.history.length > 0 ? (
                          <div className="space-y-1.5 max-w-sm">
                            {(() => {
                              const latestHist = record.history[record.history.length - 1];
                              return (
                                <div className="bg-slate-50 border border-slate-100 p-2 rounded-lg text-[10px] text-slate-500">
                                  <div className="flex justify-between items-center">
                                    <span className="font-semibold text-slate-700 capitalize">
                                      Status: <span className="text-indigo-600 font-bold">{latestHist.status.replace(/_/g, ' ')}</span>
                                    </span>
                                    <span className="text-[9px] text-slate-400">
                                      {new Date(latestHist.updatedAt).toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                  <div className="mt-1 flex justify-between items-center text-[9px]">
                                    <span>Actor: <span className="font-medium text-slate-600">{latestHist.updatedByName || 'System Seed'}</span></span>
                                    {latestHist.notes && <span className="italic max-w-[150px] truncate text-slate-400">&quot;{latestHist.notes}&quot;</span>}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px]">No revision logs available</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )} */}
    </div>
  );
}
