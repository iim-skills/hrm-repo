'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import Badge from '@/components/Badge';
import { Users, Sparkles, Clock, Umbrella, Target, User, RotateCw, Calendar, Check } from 'lucide-react';
import { ATTENDANCE_STATUS_CONFIG, AttendanceStatus } from '@/types';
import { getCycleBoundsForDate } from '@/lib/cycleUtils';

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [attendanceToday, setAttendanceToday] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshingAttendance, setRefreshingAttendance] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'monthly'>('today');
  const [monthlyAttendance, setMonthlyAttendance] = useState<any[]>([]);

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

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError('');

      // 1. Fetch team members
      const empRes = await fetch('/api/employees?limit=1000');
      if (!empRes.ok) throw new Error('Failed to load team members');
      const empData = await empRes.json();
      const teamList = empData.employees || [];
      setEmployees(teamList);

      // 2. Fetch today's and monthly attendance in parallel
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
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const refreshAttendance = async () => {
    try {
      setRefreshingAttendance(true);

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
    } catch (err) {
      console.error("Failed to refresh today's attendance data:", err);
    } finally {
      setRefreshingAttendance(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingState message="Assembling your manager dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={fetchDashboardData} />;

  // 1. Calculations & Metrics
  const teamSize = employees.length;

  let presentCount = 0;
  let leaveCount = 0;
  let lwpCount = 0;
  let lateCount = 0;
  let pendingCount = 0;

  for (const emp of employees) {
    const record = attendanceToday[emp._id];
    if (!record) {
      pendingCount++;
      continue;
    }
    const status = record.status;
    if (status === 'LATE') {
      lateCount++;
    }
    if (status === 'PRESENT' || status === 'WFH' || status === 'LATE' || status === 'EARLY_LEAVE') {
      presentCount++;
    } else if (status === 'PAID_SICK_LEAVE' || status === 'PLANNED_LEAVE' || status === 'REMOTE_COMFORT_DAY') {
      leaveCount++;
    } else if (status === 'LWP') {
      lwpCount++;
    } else {
      pendingCount++;
    }
  }

  // Tier Counts
  let tier1Count = 0;
  let tier2Count = 0;
  let tier3Count = 0;
  for (const emp of employees) {
    const tier = emp.currentRosterTier ?? 1;
    if (tier === 1) tier1Count++;
    if (tier === 2) tier2Count++;
    if (tier === 3) tier3Count++;
  }
  const tier3Employees = employees
    .filter(emp => (emp.currentRosterTier ?? 1) === 3)
    .sort((a, b) => a.name.localeCompare(b.name));
  const tier2Employees = employees
    .filter(emp => (emp.currentRosterTier ?? 1) === 2)
    .sort((a, b) => a.name.localeCompare(b.name));

  const getStatusPriority = (status: string | undefined): number => {
    if (!status) return 5; // Pending Action
    switch (status) {
      case 'LWP':
        return 1;
      case 'LATE':
        return 2;
      case 'PRESENT':
      case 'WFH':
      case 'HALF_DAY':
      case 'EARLY_LEAVE':
        return 3;
      case 'PAID_SICK_LEAVE':
      case 'PLANNED_LEAVE':
      case 'REMOTE_COMFORT_DAY':
      case 'SCHEDULE_OFF':
      case 'RESTRICTED_HOLIDAY':
        return 4;
      default:
        return 5;
    }
  };

  const sortedEmployees = [...employees].sort((a, b) => {
    const recordA = attendanceToday[a._id];
    const recordB = attendanceToday[b._id];
    const statusA = recordA?.status;
    const statusB = recordB?.status;

    const priorityA = getStatusPriority(statusA);
    const priorityB = getStatusPriority(statusB);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return a.name.localeCompare(b.name);
  });

  const monthlyLateCounts = employees.map((emp) => {
    const lateDays = monthlyAttendance.filter(r => r.employeeId === emp._id && r.status === 'LATE');
    return {
      emp,
      count: lateDays.length,
    };
  })
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count || a.emp.name.localeCompare(b.emp.name));

  const rosterHealth = teamSize > 0 ? Math.round((tier1Count / teamSize) * 100) : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 p-6 rounded-2xl shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            Welcome back, <span className="text-indigo-600">{user?.name || 'Manager'}</span>
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Overview of your direct reports compliance, attendance metrics, and roster standings.
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-indigo-50/50 border border-indigo-100 rounded-xl px-4 py-2 text-xs font-semibold text-indigo-700 select-none shadow-xs">
          <Calendar className="w-3.5 h-3.5" />
          <span>Today: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Grid Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
        <div className="bg-indigo-50/40 hover:bg-indigo-50/70 border border-indigo-100/70 rounded-2xl p-5 shadow-xs flex items-center justify-between transition-all duration-200 hover:scale-[1.02]">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-indigo-500 uppercase tracking-wider">Direct Reports</span>
            <p className="text-2xl font-bold text-indigo-900">{teamSize}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white shadow-md shadow-indigo-500/20 flex items-center justify-center">
            <Users className="w-5 h-5" strokeWidth={2.2} />
          </div>
        </div>

        <div className="bg-emerald-50/40 hover:bg-emerald-50/70 border border-emerald-100/70 rounded-2xl p-5 shadow-xs flex items-center justify-between transition-all duration-200 hover:scale-[1.02]">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-wider">Present Today</span>
            <p className="text-2xl font-bold text-emerald-900">{presentCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white shadow-md shadow-emerald-500/20 flex items-center justify-center">
            <User className="w-5 h-5" strokeWidth={2.2} />
          </div>
        </div>

        <div className="bg-indigo-50/40 hover:bg-indigo-50/70 border border-indigo-100/70 rounded-2xl p-5 shadow-xs flex items-center justify-between transition-all duration-200 hover:scale-[1.02]">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider">Late Arrivals</span>
            <p className="text-2xl font-bold text-indigo-900">{lateCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500 text-white shadow-md shadow-indigo-500/20 flex items-center justify-center">
            <Clock className="w-5 h-5" strokeWidth={2.2} />
          </div>
        </div>

        <div className="bg-rose-50/40 hover:bg-rose-50/70 border border-rose-100/70 rounded-2xl p-5 shadow-xs flex items-center justify-between transition-all duration-200 hover:scale-[1.02]">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-rose-500 uppercase tracking-wider">LWP</span>
            <p className="text-2xl font-bold text-rose-900">{leaveCount + lwpCount}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500 text-white shadow-md shadow-rose-500/20 flex items-center justify-center">
            <Umbrella className="w-5 h-5" strokeWidth={2.2} />
          </div>
        </div>

        <div className="bg-violet-50/40 hover:bg-violet-50/70 border border-violet-100/70 rounded-2xl p-5 shadow-xs flex items-center justify-between transition-all duration-200 hover:scale-[1.02]">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-violet-500 uppercase tracking-wider">Roster Health</span>
            <p className="text-2xl font-bold text-violet-900">{rosterHealth}%</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-violet-500 text-white shadow-md shadow-violet-500/20 flex items-center justify-center">
            <Target className="w-5 h-5" strokeWidth={2.2} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tier Distribution Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-4 mb-1 pb-1">
              <h3 className="text-base font-bold text-slate-800">Roster Tier Distribution</h3>
              <Link
                href="/manager/month-end"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-lg text-[10px] font-bold shadow-xs transition cursor-pointer"
              >
                <span>View Month-End</span>
                <span>→</span>
              </Link>
            </div>
            <p className="text-xs text-slate-400 mb-4">Roster standings of your active direct reports.</p>

            {/* Tier 3 & Tier 2 Employees List — Needs Attention */}
            <div className="mb-5 space-y-3">
              <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                Needs Attention (Tier 3 & 2)
              </span>

              {tier3Employees.length === 0 && tier2Employees.length === 0 ? (
                <div className="text-center py-6 rounded-xl bg-slate-50/30 border border-dashed border-slate-200">
                  <p className="text-[10px] text-emerald-600 font-bold">✓ All clear! No Tier 3 or 2 reports.</p>
                </div>
              ) : (
                <div className="max-h-[160px] overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                  {/* Tier 3 Employees */}
                  {tier3Employees.map((emp) => {
                    const initial = emp.name?.charAt(0)?.toUpperCase() || 'E';
                    return (
                      <div key={emp._id} className="flex items-center justify-between p-2 rounded-xl bg-rose-50/20 hover:bg-rose-50/40 border border-rose-100/50 transition-all duration-200 hover:scale-[1.01]">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-rose-100/80 text-rose-600 flex-shrink-0">
                            {initial}
                          </div>
                          <Link href={`/manager/team/${emp._id}`}>
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

                  {/* Tier 2 Employees */}
                  {tier2Employees.map((emp) => {
                    const initial = emp.name?.charAt(0)?.toUpperCase() || 'E';
                    return (
                      <div key={emp._id} className="flex items-center justify-between p-2 rounded-xl bg-amber-50/20 hover:bg-amber-50/40 border border-amber-100/50 transition-all duration-200 hover:scale-[1.01]">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-amber-100/80 text-amber-600 flex-shrink-0">
                            {initial}
                          </div>
                          <Link href={`/manager/team/${emp._id}`}>
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

            {/* Progress bar + Tier counts */}
            <div className="space-y-4 pt-4 border-t border-slate-100/60">
              {/* Progress bar stack */}
              <div className="h-3 rounded-full bg-slate-100 flex overflow-hidden">
                <div
                  style={{ width: `${teamSize > 0 ? (tier1Count / teamSize) * 100 : 0}%` }}
                  className="bg-emerald-500 transition-all duration-300"
                  title={`Tier 1: ${tier1Count}`}
                />
                <div
                  style={{ width: `${teamSize > 0 ? (tier2Count / teamSize) * 100 : 0}%` }}
                  className="bg-amber-500 transition-all duration-300"
                  title={`Tier 2: ${tier2Count}`}
                />
                <div
                  style={{ width: `${teamSize > 0 ? (tier3Count / teamSize) * 100 : 0}%` }}
                  className="bg-rose-500 transition-all duration-300"
                  title={`Tier 3: ${tier3Count}`}
                />
              </div>

              {/* Counts listing */}
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
            <span className="text-xs font-semibold text-slate-500">Tier 1 compliance rate:</span>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
              {rosterHealth}% compliance
            </span>
          </div>
        </div>

        {/* Today's Late Arrivals & Top Monthly Latecomers Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3 mb-1 pb-1">
              <h3 className="text-base font-bold text-slate-800">Late Arrivals</h3>

              {/* Segmented Pill Toggle Button */}
              <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 shadow-xs select-none flex-shrink-0">
                <button
                  onClick={() => setActiveTab('today')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition-all cursor-pointer whitespace-nowrap ${activeTab === 'today'
                      ? 'bg-white text-indigo-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  Today ({lateCount})
                </button>
                <button
                  onClick={() => setActiveTab('monthly')}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold transition-all cursor-pointer whitespace-nowrap ${activeTab === 'monthly'
                      ? 'bg-white text-indigo-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  This Month
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-5">
              {activeTab === 'today'
                ? "Direct reports who arrived late today."
                : "Top reports with high late arrival frequencies in this cycle."}
            </p>

            {/* List 1: Today's Late Arrivals */}
            {activeTab === 'today' && (
              employees.filter(emp => attendanceToday[emp._id]?.status === 'LATE').length === 0 ? (
                <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/30 flex flex-col items-center justify-center my-auto min-h-[220px]">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/5 mb-3">
                    <Check className="w-5 h-5" strokeWidth={3} />
                  </div>
                  <p className="font-bold text-slate-700 text-xs">All Reports On Time Today</p>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] mx-auto leading-relaxed">
                    No direct reports are marked as late today.
                  </p>
                </div>
              ) : (
                <div className="max-h-[340px] overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
                  <div className="flex flex-col gap-2.5">
                    {employees
                      .filter(emp => attendanceToday[emp._id]?.status === 'LATE')
                      .map((emp) => {
                        const record = attendanceToday[emp._id];
                        const initial = emp.name?.charAt(0)?.toUpperCase() || 'E';

                        const avatarPalette: Record<string, string> = {
                          A: 'bg-violet-100 text-violet-600', B: 'bg-blue-100 text-blue-600',
                          C: 'bg-cyan-100 text-cyan-600', D: 'bg-indigo-100 text-indigo-600',
                          E: 'bg-emerald-100 text-emerald-600', F: 'bg-fuchsia-100 text-fuchsia-600',
                          G: 'bg-green-100 text-green-600', H: 'bg-orange-100 text-orange-600',
                          I: 'bg-sky-100 text-sky-600', J: 'bg-amber-100 text-amber-600',
                          K: 'bg-teal-100 text-teal-600', L: 'bg-lime-100 text-lime-600',
                          M: 'bg-purple-100 text-purple-600', N: 'bg-rose-100 text-rose-600',
                          O: 'bg-orange-100 text-orange-600', P: 'bg-pink-100 text-pink-600',
                          Q: 'bg-slate-100 text-slate-600', R: 'bg-red-100 text-red-600',
                          S: 'bg-indigo-100 text-indigo-600', T: 'bg-teal-100 text-teal-600',
                          U: 'bg-purple-100 text-purple-600', V: 'bg-violet-100 text-violet-600',
                          W: 'bg-blue-100 text-blue-600', X: 'bg-slate-100 text-slate-600',
                          Y: 'bg-yellow-100 text-yellow-600', Z: 'bg-zinc-100 text-zinc-600',
                        };
                        const avatarClass = avatarPalette[initial] || 'bg-slate-100 text-slate-600';

                        return (
                          <div key={emp._id} className="p-3 rounded-xl border border-indigo-200/60 bg-indigo-50/10 hover:bg-indigo-50/20 transition-all duration-200 flex flex-col justify-between hover:scale-[1.01]">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarClass}`}>
                                  {initial}
                                </div>
                                <div>
                                  <Link href={`/manager/team/${emp._id}`}>
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

            {/* List 2: This Month's Top Latecomers */}
            {activeTab === 'monthly' && (
              monthlyLateCounts.length === 0 ? (
                <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/30 flex flex-col items-center justify-center my-auto min-h-[220px]">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/5 mb-3">
                    <Check className="w-5 h-5" strokeWidth={3} />
                  </div>
                  <p className="font-bold text-slate-700 text-xs">100% Punctual Month</p>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] mx-auto leading-relaxed">
                    No direct reports have been late in the current cycle!
                  </p>
                </div>
              ) : (
                <div className="max-h-[340px] overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
                  <div className="flex flex-col gap-2.5">
                    {monthlyLateCounts.map(({ emp, count }) => {
                      const initial = emp.name?.charAt(0)?.toUpperCase() || 'E';

                      const avatarPalette: Record<string, string> = {
                        A: 'bg-violet-100 text-violet-600', B: 'bg-blue-100 text-blue-600',
                        C: 'bg-cyan-100 text-cyan-600', D: 'bg-indigo-100 text-indigo-600',
                        E: 'bg-emerald-100 text-emerald-600', F: 'bg-fuchsia-100 text-fuchsia-600',
                        G: 'bg-green-100 text-green-600', H: 'bg-orange-100 text-orange-600',
                        I: 'bg-sky-100 text-sky-600', J: 'bg-amber-100 text-amber-600',
                        K: 'bg-teal-100 text-teal-600', L: 'bg-lime-100 text-lime-600',
                        M: 'bg-purple-100 text-purple-600', N: 'bg-rose-100 text-rose-600',
                        O: 'bg-orange-100 text-orange-600', P: 'bg-pink-100 text-pink-600',
                        Q: 'bg-slate-100 text-slate-600', R: 'bg-red-100 text-red-600',
                        S: 'bg-indigo-100 text-indigo-600', T: 'bg-teal-100 text-teal-600',
                        U: 'bg-purple-100 text-purple-600', V: 'bg-violet-100 text-violet-600',
                        W: 'bg-blue-100 text-blue-600', X: 'bg-slate-100 text-slate-600',
                        Y: 'bg-yellow-100 text-yellow-600', Z: 'bg-zinc-100 text-zinc-600',
                      };
                      const avatarClass = avatarPalette[initial] || 'bg-slate-100 text-slate-600';

                      return (
                        <div key={emp._id} className="p-3 rounded-xl border border-indigo-200/60 bg-indigo-50/10 hover:bg-indigo-50/20 transition-all duration-200 flex flex-col justify-between hover:scale-[1.01]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarClass}`}>
                                {initial}
                              </div>
                              <div>
                                <Link href={`/manager/team/${emp._id}`}>
                                  <span className="font-semibold text-slate-800 text-xs hover:text-indigo-600 hover:underline cursor-pointer transition">
                                    {emp.name}
                                  </span>
                                </Link>
                                <p className="text-[10px] text-slate-400 mt-0.5">{emp.department || '—'}</p>
                              </div>
                            </div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-extrabold bg-rose-50 text-rose-700 border border-rose-100 uppercase tracking-wider shadow-xs select-none">
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
                {activeTab === 'today' ? 'Active' : 'Cycle Active'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-normal text-right">
              {activeTab === 'today' ? 'Live sync active.' : 'Monthly totals sync active.'}
            </p>
          </div>
        </div>

        {/* Today's Roster Status */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-4 mb-1 pb-1">
              <h3 className="text-base font-bold text-slate-800">Today&apos;s Attendance Status</h3>
              <button
                onClick={refreshAttendance}
                disabled={refreshingAttendance}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-lg text-[10px] font-bold shadow-xs transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RotateCw className={`w-3 h-3 ${refreshingAttendance ? 'animate-spin' : ''}`} />
                <span>{refreshingAttendance ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-5">
              Live feed of marked roster statuses.
            </p>

            {employees.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/30 flex flex-col items-center justify-center my-auto min-h-[220px]">
                <p className="text-xs font-semibold text-slate-500">No Direct Reports Listed</p>
                <p className="text-[10px] text-slate-400 mt-1">Please add team members in My Team directory first.</p>
              </div>
            ) : (
              <div className="max-h-[320px] overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
                {sortedEmployees.map((emp) => {
                  const record = attendanceToday[emp._id];
                  const hasStatus = !!record;
                  const status = record?.status;

                  // Render compact badge
                  let statusBadge = (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-extrabold border border-dashed border-slate-300 text-slate-400 bg-slate-50/50 uppercase tracking-wider">
                      Pending
                    </span>
                  );

                  if (hasStatus && status) {
                    const config = ATTENDANCE_STATUS_CONFIG[status as AttendanceStatus];
                    if (config) {
                      // Custom clean short labels for widget readability
                      const label = status === 'PRESENT' ? 'Present'
                        : status === 'PAID_SICK_LEAVE' ? 'PSL'
                          : status === 'REMOTE_COMFORT_DAY' ? 'RCD'
                            : status === 'HALF_DAY' ? 'Half Day'
                              : status === 'SCHEDULE_OFF' ? 'Off'
                                : status === 'EARLY_LEAVE' ? 'Early'
                                  : status === 'RESTRICTED_HOLIDAY' ? 'Holiday'
                                    : config.label;

                      statusBadge = (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-extrabold border ${config.color} uppercase tracking-wider`}>
                          {label}
                        </span>
                      );
                    }
                  }

                  return (
                    <div key={emp._id} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-indigo-100 bg-slate-50/30 hover:bg-indigo-50/5 transition-all duration-150">
                      <div className="font-semibold text-slate-800 text-xs">
                        <Link href={`/manager/team/${emp._id}`}>
                          <span className="hover:text-indigo-600 hover:underline cursor-pointer transition">
                            {emp.name}
                          </span>
                        </Link>
                      </div>
                      <div>{statusBadge}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-4 mt-5 border-t border-slate-100 flex items-center justify-between gap-3 select-none">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Roster Active</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-normal text-right">
              Live updates.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
