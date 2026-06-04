'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import AttendanceBadge from '@/components/AttendanceBadge';
import AttendanceStatusDropdown from '@/components/AttendanceStatusDropdown';
import BulkAttendanceToolbar from '@/components/BulkAttendanceToolbar';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import EmptyState from '@/components/EmptyState';
import type { IEmployee, IAttendance, AttendanceStatus, Role } from '@/types';
import { ATTENDANCE_STATUS_CONFIG } from '@/types';
import { toCycleKey } from '@/lib/cycleUtils';
import CustomSelect from '@/components/CustomSelect';

interface AttendanceGridProps {
  role: Role;
}

function getWeekDates(offset: number): { dates: Date[]; label: string } {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);

  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }

  const start = dates[0];
  const end = dates[6];
  const label = `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return { dates, label };
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Check if a date cell is editable based on role
function canEditDate(role: any, date: Date): boolean {
  const now = new Date();
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const isFuture = target > now;

  if (isFuture) {
    // Admin, HR can mark future attendance (only for SCHEDULE_OFF)
    return role === 'admin' || role === 'hr';
  }

  // TEMPORARILY DISABLED TIME LIMITS FOR ADMIN & HR:
  if (role === 'admin' || role === 'hr') {
    return true;
  }

  switch (role) {
    case 'admin':
      // Admin: current cycle only
      return toCycleKey(target) === toCycleKey(now);
    case 'hr':
      // HR: within 48 hours
      return (now.getTime() - target.getTime()) <= 48 * 60 * 60 * 1000;
    default:
      return false;
  }
}

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function AttendanceGrid({ role }: AttendanceGridProps) {
  const { user } = useAuth();
  const activeRole = user?.role === 'admin' ? 'admin' : role;
  const isReadonly = activeRole === 'employee' || activeRole === 'manager';
  const [weekOffset, setWeekOffset] = useState(0);
  const [employees, setEmployees] = useState<IEmployee[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, Record<string, IAttendance>>>({});
  const [departments, setDepartments] = useState<string[]>([]);
  const [managers, setManagers] = useState<{ _id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [managerFilter, setManagerFilter] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [wfhRestrictions, setWfhRestrictions] = useState<any[]>([]);
  const [pslMonthlyCounts, setPslMonthlyCounts] = useState<Record<string, Record<string, number>>>({});
  const [rcdMonthlyCounts, setRcdMonthlyCounts] = useState<Record<string, Record<string, number>>>({});
  const [elMonthlyCounts, setElMonthlyCounts] = useState<Record<string, Record<string, number>>>({});
  const [pslBalances, setPslBalances] = useState<Record<string, Record<string, number>>>({});
  const [rcdDates, setRcdDates] = useState<Record<string, string[]>>({});
  const [lateOverrides, setLateOverrides] = useState<Record<string, any>>({});
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideDate, setOverrideDate] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [submittingOverride, setSubmittingOverride] = useState(false);

  const { dates, label: weekLabel } = getWeekDates(weekOffset);

  // Disable previous week navigation if the last day of the previous week is before April 1, 2026
  const prevWeekDates = getWeekDates(weekOffset - 1).dates;
  const isPrevWeekDisabled = prevWeekDates[6] < new Date('2026-04-01');

  const [debouncedSearch, setDebouncedSearch] = useState(search);

  // Debounce the search input — only update debouncedSearch after user stops typing for 400ms
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchAttendance = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setInitialLoading(true);
      else setRefreshing(true);
      setError('');

      const startDate = toDateKey(dates[0]);
      const endDate = toDateKey(dates[6]);

      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(department && { department }),
        ...(managerFilter && { managerId: managerFilter }),
      });

      const res = await fetch(`/api/attendance?${params}`);
      if (!res.ok) throw new Error('Failed to fetch attendance');

      const data = await res.json();
      setEmployees(data.employees);
      setDepartments(data.departments);
      setWfhRestrictions(data.wfhRestrictions || []);
      setPslMonthlyCounts(data.pslMonthlyCounts || {});
      setRcdMonthlyCounts(data.rcdMonthlyCounts || {});
      setElMonthlyCounts(data.elMonthlyCounts || {});
      setPslBalances(data.pslBalances || {});
      setRcdDates(data.rcdDates || {});

      // Build attendance map: employeeId -> dateKey -> attendance
      const map: Record<string, Record<string, IAttendance>> = {};
      for (const att of data.attendance) {
        const empId = att.employeeId.toString();
        const attDate = new Date(att.date);
        const dateKey = toDateKey(attDate);
        if (!map[empId]) map[empId] = {};
        map[empId][dateKey] = att;
      }
      setAttendanceMap(map);
    } catch {
      setError('Failed to load attendance data');
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [dates, debouncedSearch, department, managerFilter]);

  const fetchLateOverrides = useCallback(async () => {
    if (activeRole !== 'employee' && activeRole !== 'manager') return;
    try {
      const res = await fetch('/api/attendance/late-override');
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, any> = {};
        data.requests.forEach((req: any) => {
          const dKey = toDateKey(new Date(req.date));
          map[dKey] = req;
        });
        setLateOverrides(map);
      }
    } catch (e) {
      console.error('Failed to fetch late overrides', e);
    }
  }, [activeRole]);

  const fetchManagers = useCallback(async () => {
    try {
      const res = await fetch('/api/employees?limit=1000');
      if (!res.ok) return;
      const data = await res.json();
      const mgrs = data.employees
        .filter((e: any) => e.role === 'manager' || e.role === 'hr' || e.role === 'admin')
        .map((e: any) => ({ _id: e.userId || e._id, name: e.name }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      console.log('AttendanceGrid: Fetched and sorted managers alphabetically:', mgrs);
      setManagers(mgrs);
    } catch (err) {
      console.error('AttendanceGrid: Error fetching/sorting managers:', err);
    }
  }, []);

  useEffect(() => {
    if (activeRole === 'admin' || activeRole === 'hr') {
      fetchManagers();
    }
  }, [activeRole, fetchManagers]);

  const isFirstFetch = useRef(true);
  useEffect(() => {
    fetchAttendance(isFirstFetch.current);
    fetchLateOverrides();
    isFirstFetch.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, debouncedSearch, department, managerFilter, fetchLateOverrides]);

  // Show toast briefly then clear
  const showToast = (message: string, type: 'error' | 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Silently re-syncs only the policy state (WFH restrictions + PSL/RCD counts)
  // without triggering the full loading overlay
  const syncPolicyCounts = useCallback(async () => {
    try {
      const startDate = toDateKey(dates[0]);
      const endDate = toDateKey(dates[6]);
      const params = new URLSearchParams({
        startDate,
        endDate,
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(department && { department }),
        ...(managerFilter && { managerId: managerFilter }),
      });
      const res = await fetch(`/api/attendance?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setWfhRestrictions(data.wfhRestrictions || []);
      setPslMonthlyCounts(data.pslMonthlyCounts || {});
      setRcdMonthlyCounts(data.rcdMonthlyCounts || {});
      setElMonthlyCounts(data.elMonthlyCounts || {});
      setPslBalances(data.pslBalances || {});
    } catch {
      // Silently ignore — policy counts are best-effort
    }
  }, [dates, debouncedSearch, department, managerFilter]);

  // Mark single attendance — Optimistic UI pattern:
  //  1. Instantly flip the cell to the requested status
  //  2. Show a per-cell micro-spinner while the request is in flight
  //  3. On success: apply server's actual final status (e.g. PSL→LWP overflow)
  //     then silently re-sync policy counts in the background
  //  4. On error: revert the cell and show a toast — never a full reload
  const markAttendance = async (employeeId: string, date: string, status: AttendanceStatus) => {
    const cellKey = `${employeeId}-${date}`;
    const prevAtt = attendanceMap[employeeId]?.[date] ?? null;

    // 1. Optimistic update — instant cell flip
    setSavingCells((prev) => new Set(prev).add(cellKey));
    setAttendanceMap((prev) => {
      const updated = { ...prev, [employeeId]: { ...prev[employeeId] } };
      updated[employeeId][date] = {
        ...(prevAtt ?? {}),
        _id: prevAtt?._id ?? '',
        employeeId,
        date,
        status,
        markedBy: prevAtt?.markedBy ?? '',
        notes: prevAtt?.notes ?? '',
        createdAt: prevAtt?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as IAttendance;
      return updated;
    });

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: [{ employeeId, date, status }],
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        // Revert optimistic update
        setAttendanceMap((prev) => {
          const updated = { ...prev, [employeeId]: { ...prev[employeeId] } };
          if (prevAtt) {
            updated[employeeId][date] = prevAtt;
          } else {
            delete updated[employeeId][date];
          }
          return updated;
        });
        showToast(err.error || 'Failed to mark attendance', 'error');
        return;
      }

      // 3. Policy counts re-sync in background (no loading flash)
      // Note: POST returns { success, created } — actual status correction
      // (e.g. PSL→LWP overflow) is picked up by syncPolicyCounts via the GET
      syncPolicyCounts();
    } catch {
      // Revert on network error
      setAttendanceMap((prev) => {
        const updated = { ...prev, [employeeId]: { ...prev[employeeId] } };
        if (prevAtt) {
          updated[employeeId][date] = prevAtt;
        } else {
          delete updated[employeeId][date];
        }
        return updated;
      });
      showToast('Network error — please try again', 'error');
    } finally {
      setSavingCells((prev) => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  };

  // Bulk mark attendance
  const handleBulkApply = async (status: AttendanceStatus, notes: string) => {
    if (selectedEmployees.size === 0) return;

    const date = selectedDate || toDateKey(new Date());

    const records = Array.from(selectedEmployees).map((empId) => ({
      employeeId: empId,
      date,
      status,
      notes,
    }));

    try {
      setSaving(true);
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to mark bulk attendance');
        return;
      }

      // Refresh data
      await fetchAttendance();
      setSelectedEmployees(new Set());
    } catch {
      alert('Failed to mark bulk attendance');
    } finally {
      setSaving(false);
    }
  };

  const toggleEmployeeSelection = (empId: string) => {
    setSelectedEmployees((prev) => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });
  };

  const toggleAllEmployees = () => {
    if (selectedEmployees.size === employees.length) {
      setSelectedEmployees(new Set());
    } else {
      setSelectedEmployees(new Set(employees.map((e) => e._id)));
    }
  };

  const isWFHRestricted = (employeeId: string, date: Date): boolean => {
    const targetKey = toDateKey(date);

    return wfhRestrictions.some((r) => {
      if (r.employeeId.toString() !== employeeId) return false;
      const untilDate = new Date(r.restrictedUntil);
      const y = untilDate.getUTCFullYear();
      const m = String(untilDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(untilDate.getUTCDate()).padStart(2, '0');
      const untilKey = `${y}-${m}-${d}`;
      return targetKey <= untilKey;
    });
  };

  const isRcdWfhRestricted = (employeeId: string, date: Date): boolean => {
    // Find the immediate previous calendar working day (approximate UI check)
    const prevDate = new Date(date);
    prevDate.setDate(prevDate.getDate() - 1);
    if (prevDate.getDay() === 0) prevDate.setDate(prevDate.getDate() - 2); // if Sunday, go back to Friday
    if (prevDate.getDay() === 6) prevDate.setDate(prevDate.getDate() - 1); // if Saturday, go back to Friday

    const prevKey = toDateKey(prevDate);
    // Fallback: Also check the local date format YYYY-MM-DD in case the backend parsed the date differently
    const prevLocalStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
    
    const empIdStr = employeeId ? employeeId.toString() : '';
    return rcdDates[empIdStr]?.includes(prevKey) || rcdDates[empIdStr]?.includes(prevLocalStr) || false;
  };

  const hasUsedPSLThisMonth = (employeeId: string, date: Date): boolean => {
    const cycleKey = toCycleKey(date);
    const count = pslMonthlyCounts[employeeId]?.[cycleKey] || 0;
    return count >= 1;
  };

  const hasUsedRCDThisMonth = (employeeId: string, date: Date): boolean => {
    const cycleKey = toCycleKey(date);
    const count = rcdMonthlyCounts[employeeId]?.[cycleKey] || 0;
    return count >= 1;
  };

  const hasUsedELThisMonth = (employeeId: string, date: Date): boolean => {
    const cycleKey = toCycleKey(date);
    const count = elMonthlyCounts[employeeId]?.[cycleKey] || 0;
    return count >= 1;
  };

  const isTodayDate = (date: Date): boolean => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const submitLateOverride = async () => {
    if (!overrideReason.trim()) return;
    setSubmittingOverride(true);
    try {
      const res = await fetch('/api/attendance/late-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: overrideDate, reason: overrideReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit override request');
      
      showToast('Override request submitted successfully!', 'success');
      setShowOverrideModal(false);
      setOverrideReason('');
      fetchLateOverrides();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSubmittingOverride(false);
    }
  };

  if (initialLoading) return <LoadingState message="Loading attendance..." />;
  if (error) return <ErrorState message={error} onRetry={() => fetchAttendance(true)} />;

  return (
    <>
      {/* Dynamic Interactive Card Panel */}
      <div className="bg-white border border-slate-200/70 rounded-2xl p-5 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05)] mb-6 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-5 transition-all">
        {/* Week Navigation */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center bg-slate-100/80 border border-slate-200/50 p-1 rounded-xl shadow-inner">
            <button
              onClick={() => setWeekOffset((p) => p - 1)}
              disabled={isPrevWeekDisabled}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-white rounded-lg transition duration-200 shadow-sm disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              title="Previous Week"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="px-4 text-sm font-semibold text-slate-700 min-w-[210px] text-center select-none">
              {weekLabel}
            </div>
            <button
              onClick={() => setWeekOffset((p) => p + 1)}
              disabled={weekOffset >= 0}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-white rounded-lg transition duration-200 shadow-sm disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
              title="Next Week"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="px-4 py-2.5 text-xs font-semibold bg-indigo-50 border border-indigo-100 hover:bg-indigo-100/70 text-indigo-700 rounded-xl transition duration-200 cursor-pointer shadow-sm"
            >
              Reset to Current Week
            </button>
          )}
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center gap-3 flex-wrap flex-1 lg:flex-initial lg:justify-end">
          {role !== 'employee' && (
            <div className="relative flex-1 sm:flex-initial">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search employee..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-56 pl-10 pr-4 py-2.5 text-sm border border-slate-200/80 rounded-xl bg-slate-50/50 hover:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-400 transition-all font-medium text-slate-700 placeholder-slate-400"
              />
            </div>
          )}
          {(activeRole === 'admin' || activeRole === 'hr') && (
            <CustomSelect
              label="Manager"
              value={managerFilter}
              onChange={setManagerFilter}
              options={[
                { value: '', label: 'All Managers' },
                ...managers.map((m) => ({ value: m._id, label: m.name })),
              ]}
              maxWidthClass="min-w-[190px]"
            />
          )}
          {(activeRole === 'admin' || activeRole === 'hr') && (
            <CustomSelect
              label="Department"
              value={department}
              onChange={setDepartment}
              options={[
                { value: '', label: 'All Departments' },
                ...departments.map((d) => ({ value: d, label: d })),
              ]}
              maxWidthClass="min-w-[190px]"
            />
          )}
          {/* Bulk date picker */}
          {!isReadonly && selectedEmployees.size > 0 && (
            <div className="flex items-center gap-2 bg-indigo-50/50 border border-indigo-100 rounded-xl px-3 py-1.5 shadow-sm">
              <span className="text-xs font-semibold text-indigo-700 shrink-0">Bulk Date:</span>
              <input
                type="date"
                value={selectedDate || toDateKey(new Date())}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-2 py-1 text-xs border border-indigo-200/60 rounded-lg bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/5 font-semibold text-slate-700 cursor-pointer"
              />
            </div>
          )}
        </div>
      </div>

      {/* Administrative Policy Guide Banner */}
      {!isReadonly && (
        <div className="flex items-start gap-3 bg-indigo-50/40 border-l-4 border-indigo-500 rounded-r-2xl p-4 mb-6 text-sm text-indigo-900 shadow-sm transition-all">
          <svg className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <span className="font-bold text-indigo-950">Administrative Guardrails:</span>
            <span className="ml-1 text-indigo-800 font-medium">
              {activeRole === 'admin' && 'You are authorized to edit attendance records for the entire current month.'}
              {activeRole === 'hr' && 'You are authorized to edit attendance records within a sliding 48-hour window.'}
            </span>
          </div>
        </div>
      )}

      {/* Bulk Toolbar */}
      {!isReadonly && (() => {
        const bulkDateStr = selectedDate || toDateKey(new Date());
        const bulkDate = new Date(bulkDateStr);
        bulkDate.setHours(0, 0, 0, 0);
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        const isBulkDateFuture = bulkDate > todayDate;
        return (
          <BulkAttendanceToolbar
            selectedCount={selectedEmployees.size}
            onApply={handleBulkApply}
            onClear={() => setSelectedEmployees(new Set())}
            loading={saving}
            isFuture={isBulkDateFuture}
          />
        );
      })()}

      {/* Grid Table */}
      {employees.length === 0 && !refreshing ? (
        <EmptyState title="No employees found" description={isReadonly ? 'No attendance records found.' : 'No employees match your current filters.'} />
      ) : (
        <div className="relative">
          {refreshing && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-30 flex items-center justify-center rounded-xl">
              <div className="flex items-center gap-2.5 bg-white px-4 py-2.5 rounded-xl shadow-lg border border-slate-200">
                <svg className="w-4 h-4 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
                <span className="text-xs font-semibold text-slate-500">Updating…</span>
              </div>
            </div>
          )}
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-260px)] rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-50 shadow-sm">
                {/* Checkbox — only for non-readonly */}
                {!isReadonly && (
                  <th className="px-3 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={selectedEmployees.size === employees.length && employees.length > 0}
                      onChange={toggleAllEmployees}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                )}
                {/* Employee */}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[200px]">
                  Employee
                </th>
                {/* Day columns */}
                {dates.map((date, i) => {
                  const isToday = isTodayDate(date);
                  const isWeekend = dayNames[i] === 'Sat' || dayNames[i] === 'Sun';
                  return (
                    <th
                      key={i}
                      className={`px-3 py-4 text-center text-xs font-semibold uppercase tracking-wider min-w-[115px] transition-all relative ${
                        isToday
                          ? 'bg-indigo-50/40 text-indigo-700'
                          : isWeekend
                            ? 'bg-rose-50/40 text-rose-500 font-extrabold border-x border-slate-100'
                            : 'bg-slate-50/70 text-slate-500'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <span className={`font-bold ${isToday ? 'text-indigo-700' : isWeekend ? 'text-rose-500 font-extrabold' : 'text-slate-600'}`}>{dayNames[i]}</span>
                        <span className={`text-[10px] font-medium ${isToday ? 'text-indigo-500' : 'text-slate-400'}`}>
                          {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                        {isToday && (
                          <span className="absolute top-1 right-1 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp, empIdx) => (
                <tr key={emp._id} className={`transition-colors ${selectedEmployees.has(emp._id) ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'}`}>
                  {/* Checkbox */}
                  {!isReadonly && (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedEmployees.has(emp._id)}
                        onChange={() => toggleEmployeeSelection(emp._id)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                  )}
                  {/* Employee info */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-linear-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-bold text-slate-600">
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <Link href={`${activeRole === 'manager' ? '/manager/team' : '/hr/employees'}/${emp._id}`}>
                          <span className="text-sm font-semibold text-slate-900 hover:text-indigo-600 hover:underline cursor-pointer transition">
                            {emp.name}
                          </span>
                        </Link>
                        <p className="text-[11px] text-slate-400 mt-0.5">{emp.department}</p>
                      </div>
                    </div>
                  </td>
                  {/* Day cells */}
                  {dates.map((date, i) => {
                    const dateKey = toDateKey(date);
                    const att = attendanceMap[emp._id]?.[dateKey] || null;

                    const todayDate = new Date();
                    todayDate.setHours(0, 0, 0, 0);
                    const targetDate = new Date(date);
                    targetDate.setHours(0, 0, 0, 0);
                    const isFuture = targetDate > todayDate;

                    const editable = !isReadonly && canEditDate(activeRole, date);
                    const isRestricted = isWFHRestricted(emp._id, date);
                    const pslBal = pslBalances[emp._id]?.[toCycleKey(date)];
                    const isPSLRestricted = pslBal !== undefined
                      ? pslBal < 1.0 && att?.status !== 'PAID_SICK_LEAVE'
                      : hasUsedPSLThisMonth(emp._id, date) && att?.status !== 'PAID_SICK_LEAVE';
                    const isRCDRestricted = (emp.genderFlag !== 'female' || hasUsedRCDThisMonth(emp._id, date)) && att?.status !== 'REMOTE_COMFORT_DAY';
                    const isELRestricted = hasUsedELThisMonth(emp._id, date) && att?.status !== 'EARLY_LEAVE';

                    const restrictedList: AttendanceStatus[] = [];
                    let wfhReason = "";

                    if (isRestricted) {
                      restrictedList.push('WFH');
                      wfhReason = "WFH privilege restricted due to Half-Day/PSL violation in the rolling week.";
                    } else if (isRcdWfhRestricted(emp._id, date)) {
                      restrictedList.push('WFH');
                      wfhReason = "WFH privilege restricted: Cannot be taken on the working day immediately following a Remote Comfort Day.";
                    }

                    if (isPSLRestricted) {
                      restrictedList.push('PAID_SICK_LEAVE');
                    }
                    if (isRCDRestricted) {
                      restrictedList.push('REMOTE_COMFORT_DAY');
                    }
                    if (isELRestricted) {
                      restrictedList.push('EARLY_LEAVE');
                    }

                    const cellKey = `${emp._id}-${dateKey}`;
                    const isCellSaving = savingCells.has(cellKey);

                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    return (
                      <td
                        key={i}
                        className={`px-2 py-3 text-center transition-all ${
                          isTodayDate(date)
                            ? 'bg-indigo-50/20 ring-1 ring-indigo-500/10'
                            : isWeekend
                              ? 'bg-rose-50/10 hover:bg-rose-50/25'
                              : 'hover:bg-slate-50/30'
                        }`}
                      >
                        {isReadonly || !editable ? (
                          att ? (
                            <div className="relative group inline-flex flex-col items-center justify-center select-none">
                              <div className="relative inline-flex items-center justify-center cursor-not-allowed">
                                <AttendanceBadge status={att.status} size="sm" />
                                <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 bg-slate-800 text-white rounded px-1 py-0.5 text-[8px] font-bold transition-all duration-150 pointer-events-none shadow-md z-10 flex items-center gap-0.5 whitespace-nowrap">
                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                  </svg>
                                  <span>Locked</span>
                                </div>
                              </div>
                              {/* Request Override for LATE */}
                              {att.status === 'LATE' && user?.employeeId === emp._id && (
                                <div className="mt-1">
                                  {lateOverrides[dateKey] ? (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                      lateOverrides[dateKey].status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                                      lateOverrides[dateKey].status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                                      'bg-rose-100 text-rose-700'
                                    }`}>
                                      {lateOverrides[dateKey].status}
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setOverrideDate(dateKey);
                                        setShowOverrideModal(true);
                                      }}
                                      className="text-[9px] font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-1.5 py-0.5 rounded cursor-pointer transition-colors shadow-sm border border-indigo-100"
                                    >
                                      Override
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-300 font-medium select-none cursor-not-allowed">—</span>
                          )
                        ) : (
                          <div className="relative inline-flex items-center justify-center hover:z-20 focus-within:z-50">
                            <AttendanceStatusDropdown
                              value={att ? att.status : ''}
                              onChange={(status) => markAttendance(emp._id, dateKey, status)}
                              compact
                              disabled={isCellSaving || saving}
                              onlyOffDay={isFuture}
                              restrictedStatuses={restrictedList}
                              align={i >= 4 ? 'left' : i < 2 ? 'right' : 'center'}
                              placement={empIdx >= employees.length - 2 ? 'top' : 'bottom'}
                              employeeGender={emp.genderFlag}
                              wfhRestrictionReason={wfhReason}
                            />
                            {/* Per-cell micro-spinner — overlaid while this specific cell is saving */}
                            {isCellSaving && (
                              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70 backdrop-blur-[1px] pointer-events-none z-10">
                                <svg className="w-3.5 h-3.5 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                                </svg>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {/* Redesigned Premium Legend Card */}
      <div className="mt-6 bg-slate-50 border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.02)] transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-xs font-bold text-slate-700 tracking-wide uppercase select-none">Attendance Status Legend</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(Object.keys(ATTENDANCE_STATUS_CONFIG) as AttendanceStatus[]).map((status) => {
              const config = ATTENDANCE_STATUS_CONFIG[status];
              return (
                <div key={status} className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200/60 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:border-slate-300 transition duration-150 cursor-default select-none">
                  <AttendanceBadge status={status} size="sm" />
                  <span className="text-[11px] font-bold text-slate-600">{config.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm font-semibold ${toast.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
        >
          {toast.type === 'error' ? (
            <svg className="w-4 h-4 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-current opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Override Request Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800">Request Late Override</h3>
              <button
                onClick={() => setShowOverrideModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                You are requesting to override your LATE attendance on <span className="font-bold text-slate-800">{overrideDate}</span>. Please provide a valid reason for HR/Admin approval.
              </p>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="E.g., Train delayed, approved by manager..."
                className="w-full px-4 py-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none h-24"
                disabled={submittingOverride}
              />
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors"
                disabled={submittingOverride}
              >
                Cancel
              </button>
              <button
                onClick={submitLateOverride}
                disabled={!overrideReason.trim() || submittingOverride}
                className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm transition-colors flex items-center gap-2"
              >
                {submittingOverride ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
