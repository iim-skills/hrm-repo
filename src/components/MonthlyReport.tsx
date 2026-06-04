'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import AttendanceBadge from '@/components/AttendanceBadge';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import type { IEmployee, IAttendance, AttendanceStatus, Role } from '@/types';
import { ATTENDANCE_STATUS_CONFIG } from '@/types';
import { getCycleBoundsForDate } from '@/lib/cycleUtils';
import CustomSelect from '@/components/CustomSelect';

interface MonthlyReportProps {
  role: Role;
}

// Format date to local key
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTHS = [
  { label: 'January', value: 0 },
  { label: 'February', value: 1 },
  { label: 'March', value: 2 },
  { label: 'April', value: 3 },
  { label: 'May', value: 4 },
  { label: 'June', value: 5 },
  { label: 'July', value: 6 },
  { label: 'August', value: 7 },
  { label: 'September', value: 8 },
  { label: 'October', value: 9 },
  { label: 'November', value: 10 },
  { label: 'December', value: 11 },
];

const YEARS = [2026, 2027];

export default function MonthlyReport({ role }: MonthlyReportProps) {
  const isEmployeeSelf = role === 'employee';

  const today = new Date();
  const currentCycle = getCycleBoundsForDate(today);
  const defaultYear = currentCycle.cycleYear < 2026 ? 2026 : currentCycle.cycleYear;
  const defaultMonth = defaultYear === 2026 && (currentCycle.cycleMonth - 1) < 4 ? 4 : (currentCycle.cycleMonth - 1);
  const [selectedMonth, setSelectedMonth] = useState<number>(defaultMonth);
  const [selectedYear, setSelectedYear] = useState<number>(defaultYear);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [employees, setEmployees] = useState<IEmployee[]>([]);
  const [attendanceList, setAttendanceList] = useState<IAttendance[]>([]);
  const [sandwichFlags, setSandwichFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Sorting state
  const [sortBy, setSortBy] = useState<'name' | 'percentage'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Selected employee for detailed calendar modal
  const [activeEmployeeModal, setActiveEmployeeModal] = useState<IEmployee | null>(null);

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

  // Fetch report data
  const fetchReportData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const startYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
      const startMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
      const firstDay = toDateKey(new Date(startYear, startMonth, 21));
      const lastDay = toDateKey(new Date(selectedYear, selectedMonth, 20));

      const params = new URLSearchParams({
        startDate: firstDay,
        endDate: lastDay,
        limit: '1000', // Fetch all employees for reporting
      });

      const res = await fetch(`/api/attendance?${params}`);
      if (!res.ok) throw new Error('Failed to fetch attendance data');

      const data = await res.json();
      setEmployees(data.employees);
      setDepartments(data.departments);
      setAttendanceList(data.attendance);
      setSandwichFlags(data.sandwichFlags || []);
    } catch {
      setError('Failed to load monthly attendance report.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Map attendance by employeeId -> dateKey
  const attendanceMap = useMemo(() => {
    const map: Record<string, Record<string, IAttendance>> = {};
    for (const att of attendanceList) {
      const empId = att.employeeId.toString();
      const dateKey = toDateKey(new Date(att.date));
      if (!map[empId]) map[empId] = {};
      map[empId][dateKey] = att;
    }
    return map;
  }, [attendanceList]);

  // Helper calculation for an employee's monthly metrics
  const calculateEmployeeMetrics = useCallback((empId: string) => {
    const records = attendanceMap[empId] || {};

    // Find all active non-overridden sandwich dates for this employee
    const activeSandwichDates = new Set(
      sandwichFlags
        .filter(f => (f.employeeId?._id?.toString() || f.employeeId?.toString()) === empId && !f.isOverridden)
        .map(f => toDateKey(new Date(f.date)))
    );

    let present = 0;
    let wfh = 0;
    let rcd = 0;
    let hd = 0;
    let psl = 0;
    let off = 0;
    let lwp = 0;
    let unmarked = 0;

    datesInMonth.forEach((date) => {
      const key = toDateKey(date);
      const record = records[key];
      if (!record) {
        unmarked++;
        return;
      }

      const effectiveStatus = activeSandwichDates.has(key) ? 'LWP' : record.status;
      switch (effectiveStatus) {
        case 'PRESENT':
        case 'LATE':
        case 'EARLY_LEAVE':
          present++;
          break;
        case 'WFH': wfh++; break;
        case 'REMOTE_COMFORT_DAY': rcd++; break;
        case 'HALF_DAY': hd++; break;
        case 'PAID_SICK_LEAVE': psl++; break;
        case 'SCHEDULE_OFF': off++; break;
        case 'LWP':
        case 'PLANNED_LEAVE':
          lwp++;
          break;
        default: unmarked++;
      }
    });

    const operatingDays = (() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isCurrentMonth = selectedYear === today.getFullYear() && selectedMonth === today.getMonth();
      
      let elapsedDays = datesInMonth.length;
      if (isCurrentMonth) {
        elapsedDays = datesInMonth.filter((d) => {
          const checkDate = new Date(d);
          checkDate.setHours(0, 0, 0, 0);
          return checkDate <= today;
        }).length;
      }
      return elapsedDays - off;
    })();

    const actualWorkdays = present + wfh + rcd + (0.5 * hd);
    const attendancePercentage = operatingDays > 0 ? (actualWorkdays / operatingDays) * 100 : 100;

    return {
      present,
      wfh,
      rcd,
      hd,
      psl,
      off,
      lwp,
      unmarked,
      operatingDays,
      actualWorkdays,
      attendancePercentage,
    };
  }, [attendanceMap, datesInMonth, sandwichFlags, selectedMonth, selectedYear]);

  // Employee report rows
  const reportRows = useMemo(() => {
    return employees.map((emp) => {
      const metrics = calculateEmployeeMetrics(emp._id);
      return {
        employee: emp,
        metrics,
      };
    });
  }, [employees, calculateEmployeeMetrics]);

  // Filtered and Sorted rows
  const processedRows = useMemo(() => {
    let result = reportRows;

    // Filter by search (for admin/hr/manager)
    if (!isEmployeeSelf && search) {
      const s = search.toLowerCase();
      result = result.filter(
        (row) =>
          row.employee.name.toLowerCase().includes(s)
      );
    }

    // Filter by department
    if (!isEmployeeSelf && department) {
      result = result.filter((row) => row.employee.department === department);
    }

    // Sort rows
    result = [...result].sort((a, b) => {
      if (sortBy === 'name') {
        const nameA = a.employee.name.toLowerCase();
        const nameB = b.employee.name.toLowerCase();
        return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      } else {
        const pctA = a.metrics.attendancePercentage;
        const pctB = b.metrics.attendancePercentage;
        return sortOrder === 'asc' ? pctA - pctB : pctB - pctA;
      }
    });

    return result;
  }, [reportRows, search, department, sortBy, sortOrder, isEmployeeSelf]);

  // Aggregate Metrics for top cards
  const aggregateMetrics = useMemo(() => {
    if (processedRows.length === 0) {
      return {
        avgRate: 0,
        totalLeaves: 0,
        wfhAdoption: 0,
        totalOperating: 0,
      };
    }

    let totalPercentageSum = 0;
    let totalLeavesSum = 0;
    let totalWfhDays = 0;
    let totalActiveWorkdays = 0;

    processedRows.forEach((row) => {
      totalPercentageSum += row.metrics.attendancePercentage;
      totalLeavesSum += row.metrics.psl + row.metrics.lwp;
      totalWfhDays += row.metrics.wfh + row.metrics.rcd;
      totalActiveWorkdays += row.metrics.actualWorkdays;
    });

    return {
      avgRate: totalPercentageSum / processedRows.length,
      totalLeaves: totalLeavesSum,
      wfhAdoption: totalActiveWorkdays > 0 ? (totalWfhDays / totalActiveWorkdays) * 100 : 0,
      totalEmployees: processedRows.length,
    };
  }, [processedRows]);

  // Print function
  const handlePrint = () => {
    window.print();
  };

  const handleSort = (type: 'name' | 'percentage') => {
    if (sortBy === type) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(type);
      setSortOrder('asc');
    }
  };

  if (loading) return <LoadingState message="Loading monthly statistics report..." />;
  if (error) return <ErrorState message={error} onRetry={fetchReportData} />;

  // Self employee metrics shortcut
  const selfRow = isEmployeeSelf ? reportRows[0] : null;

  return (
    <div className="w-full">
      {/* Dynamic Style block for clean printing layout */}
      <style jsx global>{`
        @media print {
          aside, banner, button, .no-print {
            display: none !important;
          }
          main, .print-container {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: none !important;
          }
          .print-header {
            display: block !important;
            margin-bottom: 20px;
          }
          table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          th, td {
            border: 1px solid #cbd5e1 !important;
            padding: 6px 8px !important;
            font-size: 11px !important;
          }
          .badge-print {
            border: 1px solid #94a3b8 !important;
            color: black !important;
            background: none !important;
          }
        }
      `}</style>

      {/* Print-only Header */}
      <div className="hidden print-header text-center mb-6">
        <h1 className="text-xl font-bold text-slate-800">Monthly Attendance Report</h1>
        <p className="text-sm text-slate-500 mt-1">
          Month: {MONTHS.find((m) => m.value === selectedMonth)?.label} {selectedYear} · Role: {role.toUpperCase()}
        </p>
      </div>

      {/* Control Toolbar */}
      <div className="sticky top-0 z-30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white/95 backdrop-blur-sm p-4 rounded-2xl border border-slate-200 shadow-sm mb-6 no-print">
        {/* Month Selection */}
        <div className="flex items-center gap-3">
          <CustomSelect
            label="Month"
            value={selectedMonth}
            onChange={(v: number) => setSelectedMonth(v)}
            options={MONTHS.filter((m) => {
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
            options={YEARS.filter((y) => y <= currentCycle.cycleYear).map((y) => ({ value: y, label: String(y) }))}
            maxWidthClass="min-w-[100px]"
          />

          {/* Premium Active Cycle Date Range Label */}
          <div className="hidden sm:flex items-center gap-2 bg-indigo-50/50 border border-indigo-100 rounded-xl px-4 py-2 shadow-sm text-xs font-semibold text-indigo-700 select-none transition-all duration-200">
            <span>📅 Cycle:</span>
            <span>{activeCycleLabel}</span>
          </div>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3.5 py-2 border border-slate-200 hover:border-slate-300 bg-white text-slate-600 rounded-xl text-sm font-semibold transition-all hover:bg-slate-50 hover:text-slate-800 shadow-sm"
          >
            <span>🖨️</span>
            <span>Print Report</span>
          </button>
        </div>

        {/* Filters bar */}
        {!isEmployeeSelf && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search employee..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all w-52 shadow-sm"
              />
            </div>

            <CustomSelect
              label="Department"
              value={department}
              onChange={setDepartment}
              options={[
                { value: '', label: 'All Departments' },
                ...departments.map((d) => ({ value: d, label: d })),
              ]}
              maxWidthClass="min-w-[180px]"
            />
          </div>
        )}
      </div>

      {/* Aggregate Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {/* Card 1 */}
        <div className="bg-linear-to-br from-white to-slate-50/50 rounded-xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-500">
              {isEmployeeSelf ? 'My Attendance Rate' : 'Avg Attendance Rate'}
            </span>
            <span className="text-xl">📊</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tracking-tight text-slate-800">
              {(isEmployeeSelf ? selfRow?.metrics.attendancePercentage : aggregateMetrics.avgRate)?.toFixed(1)}%
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {isEmployeeSelf ? 'Present + WFH ratio in operating days' : `Weighted average across ${aggregateMetrics.totalEmployees} employees`}
          </p>
        </div>

        {/* Card 2 */}
        <div className="bg-linear-to-br from-white to-slate-50/50 rounded-xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-500">
              {isEmployeeSelf ? 'Working Days Expected' : 'Active Personnel'}
            </span>
            <span className="text-xl">💼</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tracking-tight text-slate-800">
              {isEmployeeSelf ? selfRow?.metrics.operatingDays : aggregateMetrics.totalEmployees}
            </span>
            <span className="text-xs text-slate-500">
              {isEmployeeSelf ? 'days' : 'employees'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {isEmployeeSelf ? `Excludes ${selfRow?.metrics.off} schedule-off days` : 'Listed active employees in reporting block'}
          </p>
        </div>

        {/* Card 3 */}
        <div className="bg-linear-to-br from-white to-slate-50/50 rounded-xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-500">
              {isEmployeeSelf ? 'Leaves & Absences' : 'Total Leaves Registered'}
            </span>
            <span className="text-xl">🤒</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tracking-tight text-slate-800">
              {isEmployeeSelf
                ? (selfRow ? selfRow.metrics.psl + selfRow.metrics.lwp : 0)
                : aggregateMetrics.totalLeaves}
            </span>
            <span className="text-xs text-slate-500">days</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {isEmployeeSelf
              ? `Sick Leave: ${selfRow?.metrics.psl} | LWP: ${selfRow?.metrics.lwp}`
              : 'Cumulative sick & leave without pay days'}
          </p>
        </div>

        {/* Card 4 */}
        <div className="bg-linear-to-br from-white to-slate-50/50 rounded-xl border border-slate-200/80 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-500">
              {isEmployeeSelf ? 'WFH / Remote Comfort' : 'WFH Adoption Rate'}
            </span>
            <span className="text-xl">🏠</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tracking-tight text-slate-800">
              {isEmployeeSelf
                ? (((selfRow?.metrics.wfh || 0) + (selfRow?.metrics.rcd || 0)))
                : aggregateMetrics.wfhAdoption.toFixed(1)}
            </span>
            <span className="text-xs text-slate-500">
              {isEmployeeSelf ? 'days' : '%'}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {isEmployeeSelf
              ? `WFH: ${selfRow?.metrics.wfh} | Remote Comfort Days: ${selfRow?.metrics.rcd}`
              : 'Percentage of remote shifts in overall active workdays'}
          </p>
        </div>
      </div>

      {/* Main Layout Section */}
      {isEmployeeSelf ? (
        /* Direct Self View (No list table, just standard premium 7-day grid calendar) */
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span>📅</span> Detailed Monthly Attendance Sheet: {MONTHS.find((m) => m.value === selectedMonth)?.label} {selectedYear}
          </h2>
          {selfRow && (
            <CalendarGrid
              employee={selfRow.employee}
              attendanceRecords={attendanceMap[selfRow.employee._id] || {}}
              dates={datesInMonth}
            />
          )}
        </div>
      ) : (
        /* Team Table View (Admin, HR, Manager) */
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden print-container">
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)] custom-scrollbar">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="sticky top-0 z-20 bg-slate-50 shadow-xs">
                <tr className="bg-slate-50/70">
                  <th
                    onClick={() => handleSort('name')}
                    className="px-5 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                  >
                    Employee {sortBy === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th className="px-3 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Department
                  </th>
                  <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50/20">
                    P
                  </th>
                  <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50/20">
                    WFH
                  </th>
                  <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50/20">
                    PSL
                  </th>
                  <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider text-sky-600 bg-sky-50/20">
                    HD
                  </th>
                  <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider text-purple-600 bg-purple-50/20">
                    RCD
                  </th>
                  <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider text-slate-400 bg-slate-50/20">
                    OFF
                  </th>
                  <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider text-amber-600 bg-amber-50/20">
                    LWP
                  </th>
                  <th
                    onClick={() => handleSort('percentage')}
                    className="px-5 py-4 text-center text-xs font-bold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                  >
                    Attendance % {sortBy === 'percentage' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider no-print">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {processedRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-10 text-sm text-slate-400">
                      No matching employee report data found.
                    </td>
                  </tr>
                ) : (
                  processedRows.map((row) => (
                    <tr
                      key={row.employee._id}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-linear-to-br from-indigo-100 to-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700">
                            {row.employee.name.charAt(0)}
                          </div>
                          <div>
                            <Link href={`${role === 'manager' ? '/manager/team' : '/hr/employees'}/${row.employee._id}`}>
                              <span className="text-sm font-semibold text-slate-900 hover:text-indigo-600 hover:underline cursor-pointer transition">
                                {row.employee.name}
                              </span>
                            </Link>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-500 font-medium">
                        {row.employee.department}
                      </td>
                      <td className="px-3 py-3 text-center text-sm font-semibold text-emerald-600 bg-emerald-50/5">
                        {row.metrics.present}
                      </td>
                      <td className="px-3 py-3 text-center text-sm font-semibold text-indigo-600 bg-indigo-50/5">
                        {row.metrics.wfh}
                      </td>
                      <td className="px-3 py-3 text-center text-sm font-semibold text-rose-600 bg-rose-50/5">
                        {row.metrics.psl}
                      </td>
                      <td className="px-3 py-3 text-center text-sm font-semibold text-sky-600 bg-sky-50/5">
                        {row.metrics.hd}
                      </td>
                      <td className="px-3 py-3 text-center text-sm font-semibold text-purple-600 bg-purple-50/5">
                        {row.metrics.rcd}
                      </td>
                      <td className="px-3 py-3 text-center text-sm font-semibold text-slate-400 bg-slate-50/5">
                        {row.metrics.off}
                      </td>
                      <td className="px-3 py-3 text-center text-sm font-semibold text-amber-600 bg-amber-50/5">
                        {row.metrics.lwp}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-bold rounded-lg ${row.metrics.attendancePercentage >= 90
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : row.metrics.attendancePercentage >= 75
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                          {row.metrics.attendancePercentage.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center no-print">
                        <button
                          onClick={() => setActiveEmployeeModal(row.employee)}
                          className="px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-white border border-indigo-200 hover:bg-indigo-600 rounded-lg transition-all shadow-sm"
                        >
                          View Sheet
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Calendar Overlay Drawer Modal (For Admin, HR, Manager checking individual sheets) */}
      {activeEmployeeModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto no-print">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
            onClick={() => setActiveEmployeeModal(null)}
          />

          {/* Dialog block */}
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl border border-slate-200 p-6 z-10 transition-all">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <span>📅</span> Attendance Sheet: {activeEmployeeModal.name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {activeEmployeeModal.department} · {MONTHS.find((m) => m.value === selectedMonth)?.label} {selectedYear}
                  </p>
                </div>
                <button
                  onClick={() => setActiveEmployeeModal(null)}
                  className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Body Calendar content */}
              <CalendarGrid
                employee={activeEmployeeModal}
                attendanceRecords={attendanceMap[activeEmployeeModal._id] || {}}
                dates={datesInMonth}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
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

// Beautiful structured 7-Day Monthly Calendar Grid View component
interface CalendarGridProps {
  employee: IEmployee;
  attendanceRecords: Record<string, IAttendance>;
  dates: Date[];
}

function CalendarGrid({ employee, attendanceRecords, dates }: CalendarGridProps) {
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

              {selectedDayDetail.record && (
                <>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Marked By</p>
                    <p className="text-xs font-semibold text-slate-700 truncate bg-white px-2 py-1.5 border border-slate-200 rounded-lg">
                      {selectedDayDetail.record.markedBy || 'System Generated / Seed'}
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
                      {new Date(selectedDayDetail.record.createdAt).toLocaleString('en-IN')}
                    </p>
                  </div>

                  {/* Sleek Timeline of History Logs */}
                  {/* {selectedDayDetail.record.history && selectedDayDetail.record.history.length > 0 && (
                    <div className="space-y-2 border-t border-slate-200/60 pt-3">
                      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Change History Logs</p>
                      <div className="relative pl-3.5 border-l border-indigo-100 space-y-3.5">
                        {[...selectedDayDetail.record.history].reverse().map((hist: any, hidx: number) => (
                          <div key={hidx} className="relative text-xs">
                            <span className="absolute -left-[18.5px] top-1.5 w-2 h-2 rounded-full bg-indigo-500 ring-4 ring-indigo-50" />
                            
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-700">
                                  Status:
                                </span>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100/60">
                                  {ATTENDANCE_STATUS_CONFIG[hist.status as AttendanceStatus]?.label || hist.status}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-600 font-medium">
                                By <span className="font-semibold text-slate-800">{hist.updatedByName || hist.updatedBy || 'System Seed'}</span>
                              </span>
                              <span className="text-[9px] text-slate-400">
                                {new Date(hist.updatedAt).toLocaleString('en-IN')}
                              </span>
                              {hist.notes && (
                                <span className="text-[10px] text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100 italic mt-0.5 inline-block">
                                  &quot;{hist.notes}&quot;
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )} */}
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
    </div>
  );
}
