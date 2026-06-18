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
import CalendarGrid, { toDateKey } from '@/components/CalendarGrid';
import { Printer, Download, ChevronDown } from 'lucide-react';

interface MonthlyReportProps {
  role: Role;
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
  const [pslTotalBalances, setPslTotalBalances] = useState<Record<string, Record<string, number>>>({});
  const [showExportDropdown, setShowExportDropdown] = useState(false);
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
      setPslTotalBalances(data.pslTotalBalances || {});
    } catch {
      setError('Failed to load monthly attendance report.');
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Click outside to close Export Dropdown
  useEffect(() => {
    if (!showExportDropdown) return;
    const handleClose = () => setShowExportDropdown(false);
    document.addEventListener('click', handleClose);
    return () => document.removeEventListener('click', handleClose);
  }, [showExportDropdown]);

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
    let lateCount = 0;

    datesInMonth.forEach((date) => {
      const key = toDateKey(date);
      const record = records[key];
      if (!record) {
        unmarked++;
        return;
      }

      if (record.status === 'LATE') {
        lateCount++;
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

    // Calculate estimated salary deduction days (Est. Salary Deduction)
    const halfDayDeduction = hd * 0.5;
    const lateDeduction = lateCount > 2 ? (lateCount - 2) * 0.25 : 0;
    const totalLOPAbsences = psl + halfDayDeduction + lwp + lateDeduction;
    
    const yearMonthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    const totalPslBalance = pslTotalBalances[empId]?.[yearMonthKey] || 0;
    const salaryDeductionDays = totalLOPAbsences > totalPslBalance ? totalLOPAbsences - totalPslBalance : 0;

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
      salaryDeductionDays,
    };
  }, [attendanceMap, datesInMonth, sandwichFlags, selectedMonth, selectedYear, pslTotalBalances]);

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

  // CSV Export function for Attendance Statistics
  const handleExportAttendanceCSV = () => {
    const headers = ['Employee Name', 'Department', 'P', 'WFH', 'PSL', 'HD', 'RCD', 'OFF', 'LWP', 'Deductions', 'Attendance %'];
    const rows = processedRows.map((row) => [
      row.employee.name,
      row.employee.department,
      row.metrics.present,
      row.metrics.wfh,
      row.metrics.psl,
      row.metrics.hd,
      row.metrics.rcd,
      row.metrics.off,
      row.metrics.lwp,
      row.metrics.salaryDeductionDays.toFixed(2).replace(/\.00$/, ''),
      row.metrics.attendancePercentage.toFixed(1) + '%',
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);

    const monthLabel = MONTHS.find(m => m.value === selectedMonth)?.label || 'Month';
    const filename = `attendance_report_${monthLabel.toLowerCase()}_${selectedYear}.csv`;

    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // CSV Export function for Salary Deductions
  const handleExportCSV = () => {
    const headers = ['Employee Name', 'Department', 'Est. Salary Deduction Days'];
    
    // Sort employees by deduction days descending, with alphabetical name fallback
    const sortedForExport = [...processedRows].sort((a, b) => {
      const dedA = a.metrics.salaryDeductionDays;
      const dedB = b.metrics.salaryDeductionDays;
      if (dedB !== dedA) {
        return dedB - dedA;
      }
      return a.employee.name.localeCompare(b.employee.name);
    });

    const rows = sortedForExport.map((row) => [
      row.employee.name,
      row.employee.department,
      row.metrics.salaryDeductionDays.toFixed(2).replace(/\.00$/, ''),
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);

    const monthLabel = MONTHS.find(m => m.value === selectedMonth)?.label || 'Month';
    const filename = `salary_deductions_${monthLabel.toLowerCase()}_${selectedYear}.csv`;

    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2.5 bg-white/95 backdrop-blur-sm p-3 rounded-2xl border border-slate-200 shadow-xs mb-6 no-print">
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
          maxWidthClass="min-w-[90px]"
        />

        {/* Premium Active Cycle Date Range Label */}
        <div className="flex items-center gap-1.5 bg-indigo-50/50 border border-indigo-100 rounded-xl px-3 text-xs font-semibold text-indigo-700 select-none h-10 whitespace-nowrap">
          <span>📅</span>
          <span>{activeCycleLabel}</span>
        </div>

        {!isEmployeeSelf && (
          <CustomSelect
            label="Department"
            value={department}
            onChange={setDepartment}
            options={[
              { value: '', label: 'All Departments' },
              ...departments.map((d) => ({ value: d, label: d })),
            ]}
            maxWidthClass="min-w-[150px]"
          />
        )}

        {!isEmployeeSelf && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowExportDropdown(!showExportDropdown);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer h-10 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showExportDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showExportDropdown && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-xl shadow-md py-1 z-40 animate-fadeIn">
                <button
                  onClick={() => {
                    handleExportAttendanceCSV();
                    setShowExportDropdown(false);
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition cursor-pointer"
                >
                  📄 Export Attendance
                </button>
                
                {(role === 'admin' || role === 'hr') && (
                  <button
                    onClick={() => {
                      handleExportCSV();
                      setShowExportDropdown(false);
                    }}
                    className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 border-t border-slate-100 transition cursor-pointer"
                  >
                    ⚖️ Export Deductions
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {!isEmployeeSelf && (
          <div className="relative flex-1 min-w-[160px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search employee..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all w-full h-10 shadow-xs"
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
                  <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider text-rose-600 bg-rose-50/20">
                    Deductions
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
                    <td colSpan={12} className="text-center py-10 text-sm text-slate-400">
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
                      <td className="px-3 py-3 text-center text-sm font-semibold text-rose-600 bg-rose-50/5">
                        {row.metrics.salaryDeductionDays > 0 ? (
                          <span className="text-rose-600 font-bold">-{row.metrics.salaryDeductionDays.toFixed(2).replace(/\.00$/, '')} d</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
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
