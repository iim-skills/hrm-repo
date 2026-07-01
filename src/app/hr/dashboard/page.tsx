'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import { 
  Users, 
  Target, 
  Clock, 
  Sparkles, 
  RotateCw, 
  Check, 
  Calendar, 
  ShieldAlert
} from 'lucide-react';
import { ATTENDANCE_STATUS_CONFIG, AttendanceStatus } from '@/types';
import { getCycleBoundsForDate } from '@/lib/cycleUtils';

export default function HRDashboard() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendanceToday, setAttendanceToday] = useState<Record<string, any>>({});
  const [monthlyAttendance, setMonthlyAttendance] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [activeLateTab, setActiveLateTab] = useState<'today' | 'monthly'>('today');

  const todayStr = (() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const fetchDashboardData = async (isSilent = false) => {
    try {
      if (!isSilent) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError('');

      // 1. Fetch all employees
      const empRes = await fetch('/api/employees?limit=1000');
      if (!empRes.ok) throw new Error('Failed to load employees');
      const empData = await empRes.json();
      const allEmployees = empData.employees || [];

      // 2. Fetch today's and monthly attendance bounds
      const { startDate, endDate } = getCycleBoundsForDate(new Date());
      const cycleStartStr = formatDate(startDate);
      const cycleEndStr = formatDate(endDate);

      const [attRes, monthlyRes] = await Promise.all([
        fetch(`/api/attendance?startDate=${todayStr}&endDate=${todayStr}`),
        fetch(`/api/attendance?startDate=${cycleStartStr}&endDate=${cycleEndStr}`)
      ]);

      if (attRes.ok) {
        const attData = await attRes.json();
        const records = attData.records || attData.attendance || [];
        const recordMap: Record<string, any> = {};
        for (const r of records) {
          recordMap[r.employeeId] = r;
        }
        setAttendanceToday(recordMap);
      }

      if (monthlyRes.ok) {
        const monthlyData = await monthlyRes.json();
        const monthlyRecords = monthlyData.records || monthlyData.attendance || [];
        setMonthlyAttendance(monthlyRecords);
      }

      setEmployees(allEmployees);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingState message="Assembling your HR dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={() => fetchDashboardData()} />;

  // --- Calculations & Metrics ---
  const activeEmployees = employees.filter(e => e.isActive);
  const totalActive = activeEmployees.length;

  let presentCount = 0;
  let wfhCount = 0;
  let lateCount = 0;
  let earlyCount = 0;
  let rcdCount = 0;
  let pslCount = 0;
  let plCount = 0;
  let lwpCount = 0;
  let pendingCount = 0;

  for (const emp of activeEmployees) {
    const record = attendanceToday[emp._id];
    if (!record) {
      pendingCount++;
      continue;
    }
    switch (record.status) {
      case 'PRESENT':
        presentCount++;
        break;
      case 'WFH':
        wfhCount++;
        break;
      case 'LATE':
        lateCount++;
        break;
      case 'EARLY_LEAVE':
        earlyCount++;
        break;
      case 'REMOTE_COMFORT_DAY':
        rcdCount++;
        break;
      case 'PAID_SICK_LEAVE':
        pslCount++;
        break;
      case 'PLANNED_LEAVE':
        plCount++;
        break;
      case 'LWP':
        lwpCount++;
        break;
      default:
        pendingCount++;
        break;
    }
  }

  // Total working today = Present + WFH + Late + Early + RCD
  const totalWorkingToday = presentCount + wfhCount + lateCount + earlyCount + rcdCount;
  const workingPercentage = totalActive > 0 ? Math.round((totalWorkingToday / totalActive) * 100) : 0;

  // System-wide Tier standings
  let tier1Count = 0;
  let tier2Count = 0;
  let tier3Count = 0;
  for (const emp of activeEmployees) {
    const tier = emp.currentRosterTier ?? 1;
    if (tier === 1) tier1Count++;
    if (tier === 2) tier2Count++;
    if (tier === 3) tier3Count++;
  }
  const systemRosterHealth = totalActive > 0 ? Math.round((tier1Count / totalActive) * 100) : 0;

  // Severity-based sorting to bubble up critical violations (matching Month-End page)
  const getEmployeeSeverity = (empId: string) => {
    const records = monthlyAttendance.filter(r => r.employeeId === empId);
    const lwp = records.filter(r => r.status === 'LWP').length;
    const psl = records.filter(r => r.status === 'PAID_SICK_LEAVE').length;
    const halfDay = records.filter(r => r.status === 'HALF_DAY').length;
    return lwp + psl + (halfDay * 0.5);
  };

  // Tier Lists sorted by severity descending
  const tier3Listings = activeEmployees
    .filter(emp => (emp.currentRosterTier ?? 1) === 3)
    .sort((a, b) => {
      const sevA = getEmployeeSeverity(a._id);
      const sevB = getEmployeeSeverity(b._id);
      if (sevB !== sevA) return sevB - sevA;
      return a.name.localeCompare(b.name);
    });
  const tier2Listings = activeEmployees
    .filter(emp => (emp.currentRosterTier ?? 1) === 2)
    .sort((a, b) => {
      const sevA = getEmployeeSeverity(a._id);
      const sevB = getEmployeeSeverity(b._id);
      if (sevB !== sevA) return sevB - sevA;
      return a.name.localeCompare(b.name);
    });

  // Monthly Lates calculation
  const monthlyLateCounts = activeEmployees.map((emp) => {
    const lateDays = monthlyAttendance.filter(r => r.employeeId === emp._id && r.status === 'LATE');
    return {
      emp,
      count: lateDays.length,
    };
  })
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count || a.emp.name.localeCompare(b.emp.name));

  // Stat cards definitions
  const statCards = [
    { 
      label: 'Total Active Base', 
      value: totalActive, 
      subtext: `${employees.length - totalActive} inactive records`,
      icon: Users, 
      color: 'bg-indigo-50/50 border-indigo-100 text-indigo-900 icon-bg-indigo-500' 
    },
    { 
      label: 'Working Today', 
      value: `${workingPercentage}%`, 
      subtext: `${totalWorkingToday} of ${totalActive} active in office/remote`,
      icon: Target, 
      color: 'bg-emerald-50/50 border-emerald-100 text-emerald-900 icon-bg-emerald-500' 
    },
    { 
      label: 'Late Arrivals Today', 
      value: lateCount, 
      subtext: `${activeLateTab === 'monthly' ? monthlyLateCounts.length : 0} reports with late cycles`,
      icon: Clock, 
      color: 'bg-amber-50/50 border-amber-100 text-amber-900 icon-bg-amber-500' 
    },
    { 
      label: 'System Roster Health', 
      value: `${systemRosterHealth}%`, 
      subtext: `${tier1Count} of ${totalActive} employees in Tier 1`,
      icon: Sparkles, 
      color: 'bg-violet-50/50 border-violet-100 text-violet-900 icon-bg-violet-500' 
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 p-6 rounded-2xl shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">HR Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Overview of your organization — you have HR management privileges</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 transition disabled:opacity-60 cursor-pointer shadow-xs"
          >
            <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Dashboard'}</span>
          </button>
          <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2 text-xs font-semibold text-indigo-700 select-none shadow-xs">
            <Calendar className="w-3.5 h-3.5" />
            <span>Today: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {statCards.map((card) => {
          const IconComponent = card.icon;
          return (
            <div 
              key={card.label} 
              className={`border rounded-2xl p-5 shadow-xs flex items-center justify-between transition-all duration-200 hover:scale-[1.02] ${card.color.split(' icon-bg-')[0]}`}
            >
              <div className="space-y-1 overflow-hidden">
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block truncate">{card.label}</span>
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-[9px] text-slate-400 mt-0.5 truncate leading-relaxed">{card.subtext}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl text-white shadow-md flex items-center justify-center flex-shrink-0 ${
                card.color.includes('icon-bg-indigo-500') ? 'bg-indigo-500 shadow-indigo-500/20' :
                card.color.includes('icon-bg-emerald-500') ? 'bg-emerald-500 shadow-emerald-500/20' :
                card.color.includes('icon-bg-amber-500') ? 'bg-amber-500 shadow-amber-500/20' :
                'bg-violet-500 shadow-violet-500/20'
              }`}>
                <IconComponent className="w-5 h-5" strokeWidth={2.2} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Widget 1: System-wide Roster Tier Distribution */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-4 mb-1 pb-1">
              <h3 className="text-base font-bold text-slate-800">Roster Tier Distribution</h3>
              <Link
                href="/hr/month-end"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-lg text-[10px] font-bold shadow-xs transition cursor-pointer"
              >
                <span>View Month-End</span>
                <span>→</span>
              </Link>
            </div>
            <p className="text-xs text-slate-400 mb-4">Roster standings of all active employees system-wide.</p>

            {/* Tier 3 & Tier 2 Needing Attention Lists */}
            <div className="mb-5 space-y-3">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                Needs Attention (Tier 3 & 2)
              </span>

              {tier3Listings.length === 0 && tier2Listings.length === 0 ? (
                <div className="text-center py-6 rounded-xl bg-slate-50/30 border border-dashed border-slate-200">
                  <p className="text-[10px] text-emerald-600 font-bold">✓ All clear! No Tier 3 or 2 violations.</p>
                </div>
              ) : (
                <div className="max-h-[160px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                  {/* Tier 3 List */}
                  {tier3Listings.map((emp) => {
                    const initial = emp.name?.charAt(0)?.toUpperCase() || 'E';
                    return (
                      <div key={emp._id} className="flex items-center justify-between p-2 rounded-xl bg-rose-50/20 hover:bg-rose-50/40 border border-rose-100/50 transition-all duration-200 hover:scale-[1.01]">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-rose-100/80 text-rose-600 flex-shrink-0">
                            {initial}
                          </div>
                          <Link href={`/hr/employees/${emp._id}`}>
                            <span className="font-semibold text-slate-700 hover:text-indigo-600 hover:underline cursor-pointer text-xs transition">
                              {emp.name}
                            </span>
                          </Link>
                        </div>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-rose-100 text-rose-700 border border-rose-200 uppercase tracking-wider">
                          Tier 3
                        </span>
                      </div>
                    );
                  })}

                  {/* Tier 2 List */}
                  {tier2Listings.map((emp) => {
                    const initial = emp.name?.charAt(0)?.toUpperCase() || 'E';
                    return (
                      <div key={emp._id} className="flex items-center justify-between p-2 rounded-xl bg-amber-50/20 hover:bg-amber-50/40 border border-amber-100/50 transition-all duration-200 hover:scale-[1.01]">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-amber-100/80 text-amber-600 flex-shrink-0">
                            {initial}
                          </div>
                          <Link href={`/hr/employees/${emp._id}`}>
                            <span className="font-semibold text-slate-700 hover:text-indigo-600 hover:underline cursor-pointer text-xs transition">
                              {emp.name}
                            </span>
                          </Link>
                        </div>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-extrabold bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-wider">
                          Tier 2
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Progress Bar and counts */}
            <div className="space-y-4 pt-4 border-t border-slate-100/60">
              <div className="h-3 rounded-full bg-slate-100 flex overflow-hidden">
                <div
                  style={{ width: `${totalActive > 0 ? (tier1Count / totalActive) * 100 : 0}%` }}
                  className="bg-emerald-500 transition-all duration-300"
                  title={`Tier 1: ${tier1Count}`}
                />
                <div
                  style={{ width: `${totalActive > 0 ? (tier2Count / totalActive) * 100 : 0}%` }}
                  className="bg-amber-500 transition-all duration-300"
                  title={`Tier 2: ${tier2Count}`}
                />
                <div
                  style={{ width: `${totalActive > 0 ? (tier3Count / totalActive) * 100 : 0}%` }}
                  className="bg-rose-500 transition-all duration-300"
                  title={`Tier 3: ${tier3Count}`}
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="inline-flex w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Tier 1</span>
                  <p className="text-base font-bold text-slate-800 mt-0.5">{tier1Count}</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="inline-flex w-2 h-2 rounded-full bg-amber-500 mr-1.5" />
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Tier 2</span>
                  <p className="text-base font-bold text-slate-800 mt-0.5">{tier2Count}</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="inline-flex w-2 h-2 rounded-full bg-rose-500 mr-1.5" />
                  <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">Tier 3</span>
                  <p className="text-base font-bold text-slate-800 mt-0.5">{tier3Count}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-5 mt-5 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">System Compliance Rate:</span>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
              {systemRosterHealth}% compliance
            </span>
          </div>
        </div>

        {/* Widget 2: System-wide Late Arrivals */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3 mb-1 pb-1">
              <h3 className="text-base font-bold text-slate-800">Late Arrivals</h3>

              {/* Segmented control toggle */}
              <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 shadow-xs select-none flex-shrink-0">
                <button
                  onClick={() => setActiveLateTab('today')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition-all cursor-pointer whitespace-nowrap ${activeLateTab === 'today'
                      ? 'bg-white text-indigo-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  Today ({lateCount})
                </button>
                <button
                  onClick={() => setActiveLateTab('monthly')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition-all cursor-pointer whitespace-nowrap ${activeLateTab === 'monthly'
                      ? 'bg-white text-indigo-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  This Month
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-5">
              {activeLateTab === 'today'
                ? "Employees who arrived late today."
                : "Top employees with late arrival frequencies in this cycle."}
            </p>

            {/* Today's Late List */}
            {activeLateTab === 'today' && (
              activeEmployees.filter(emp => attendanceToday[emp._id]?.status === 'LATE').length === 0 ? (
                <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/30 flex flex-col items-center justify-center my-auto min-h-[220px]">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/5 mb-3">
                    <Check className="w-5 h-5" strokeWidth={3} />
                  </div>
                  <p className="font-bold text-slate-700 text-xs">All On Time Today</p>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] mx-auto leading-relaxed">
                    No employees are marked as late today.
                  </p>
                </div>
              ) : (
                <div className="max-h-[340px] overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
                  <div className="flex flex-col gap-2.5">
                    {activeEmployees
                      .filter(emp => attendanceToday[emp._id]?.status === 'LATE')
                      .slice(0, 5)
                      .map((emp) => {
                        const record = attendanceToday[emp._id];
                        const initial = emp.name?.charAt(0)?.toUpperCase() || 'E';

                        return (
                          <div key={emp._id} className="p-3 rounded-xl border border-indigo-200/60 bg-indigo-50/10 hover:bg-indigo-50/20 transition duration-150 flex flex-col justify-between hover:scale-[1.01]">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-indigo-100 text-indigo-600 flex-shrink-0">
                                  {initial}
                                </div>
                                <div>
                                  <Link href={`/hr/employees/${emp._id}`}>
                                    <span className="font-semibold text-slate-800 text-xs hover:text-indigo-600 hover:underline cursor-pointer transition">
                                      {emp.name}
                                    </span>
                                  </Link>
                                  <p className="text-[10px] text-slate-400 mt-0.5">{emp.department || '—'}</p>
                                </div>
                              </div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[8px] font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
                                <Clock className="w-2.5 h-2.5" />
                                Late
                              </span>
                            </div>
                            {record?.notes && (
                              <p className="text-[10px] text-indigo-700/80 bg-indigo-50/50 p-2 rounded-lg border border-indigo-100/50 mt-2.5 italic leading-relaxed">
                                &quot; {record.notes} &quot;
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )
            )}

            {/* Monthly Late List */}
            {activeLateTab === 'monthly' && (
              monthlyLateCounts.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/30 flex flex-col items-center justify-center my-auto min-h-[220px]">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/5 mb-3">
                    <Check className="w-5 h-5" strokeWidth={3} />
                  </div>
                  <p className="font-bold text-slate-700 text-xs">Punctual Month</p>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] mx-auto leading-relaxed">
                    No employees have been late in the current cycle!
                  </p>
                </div>
              ) : (
                <div className="max-h-[340px] overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
                  <div className="flex flex-col gap-2.5">
                    {monthlyLateCounts.slice(0, 5).map(({ emp, count }) => {
                      const initial = emp.name?.charAt(0)?.toUpperCase() || 'E';

                      return (
                        <div key={emp._id} className="p-3 rounded-xl border border-indigo-200/60 bg-indigo-50/10 hover:bg-indigo-50/20 transition duration-150 flex flex-col justify-between hover:scale-[1.01]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-indigo-100 text-indigo-600 flex-shrink-0">
                                  {initial}
                              </div>
                              <div>
                                <Link href={`/hr/employees/${emp._id}`}>
                                  <span className="font-semibold text-slate-800 text-xs hover:text-indigo-600 hover:underline cursor-pointer transition">
                                    {emp.name}
                                  </span>
                                </Link>
                                <p className="text-[10px] text-slate-400 mt-0.5">{emp.department || '—'}</p>
                              </div>
                            </div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-extrabold bg-rose-50 text-rose-700 border border-rose-100 uppercase tracking-wider shadow-xs">
                              <Clock className="w-2.5 h-2.5 text-rose-500" />
                              {count} {count === 1 ? 'Late' : 'Lates'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </div>

          <div className="pt-4 mt-5 border-t border-slate-100 flex items-center justify-between gap-3 select-none">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                {activeLateTab === 'today' ? 'Active' : 'Cycle Active'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-normal text-right">
              {activeLateTab === 'today' ? 'Live sync active.' : 'Monthly totals sync active.'}
            </p>
          </div>
        </div>

        {/* Widget 3: Today's Attendance Status Breakdown */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-4 mb-1 pb-1">
              <h3 className="text-base font-bold text-slate-800">Attendance Breakdown</h3>
              <span className="px-2 py-1 bg-indigo-50 text-indigo-600 border border-indigo-200 font-extrabold text-[9px] uppercase tracking-wider rounded-lg">
                Today
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-5">
              System-wide status count summary for all active employees today.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Present', count: presentCount, status: 'PRESENT' },
                { label: 'WFH', count: wfhCount, status: 'WFH' },
                { label: 'Late', count: lateCount, status: 'LATE' },
                { label: 'Early Leave', count: earlyCount, status: 'EARLY_LEAVE' },
                { label: 'Sick (PSL)', count: pslCount, status: 'PAID_SICK_LEAVE' },
                { label: 'LWP', count: lwpCount, status: 'LWP' },
              ].map((item) => {
                const config = ATTENDANCE_STATUS_CONFIG[item.status as AttendanceStatus];
                return (
                  <div 
                    key={item.label} 
                    className={`p-3 rounded-xl border text-center flex flex-col justify-center items-center gap-0.5 hover:scale-[1.02] transition shadow-xs ${
                      config?.color || 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <span className="text-[9px] font-extrabold uppercase tracking-wider opacity-85">{item.label}</span>
                    <p className="text-xl font-black">{item.count}</p>
                    <span className="text-[8px] opacity-60">employees</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Warning card for Pending Actions */}
          {pendingCount > 0 ? (
            <div className="bg-amber-50/50 border border-amber-200/70 p-3 rounded-xl mt-4 flex items-start gap-2.5 text-left">
              <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-[10px] font-bold text-amber-800 leading-none">Pending Statuses</h4>
                <p className="text-[9px] text-amber-700/90 leading-relaxed mt-1">
                  <strong>{pendingCount} active employees</strong> remain unmarked today.
                </p>
              </div>
            </div>
          ) : (
            <div className="pt-4 mt-5 border-t border-slate-100 flex items-center justify-between gap-3 select-none">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">All Marked</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal text-right">
                All records marked.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
