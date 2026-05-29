'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';

interface DashboardStats {
  total: number;
  active: number;
  departments: { name: string; count: number }[];
  roleDistribution: { role: string; count: number }[];
}

export default function HRDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [tierStats, setTierStats] = useState<{ tier1: number; tier2: number; tier3: number; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/employees?limit=1000');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      const employees = data.employees;
      const active = employees.filter((e: { isActive: boolean }) => e.isActive).length;

      // Group by department
      const deptMap: Record<string, number> = {};
      const roleMap: Record<string, number> = {};
      employees.forEach((e: { department: string; role: string }) => {
        deptMap[e.department] = (deptMap[e.department] || 0) + 1;
        roleMap[e.role] = (roleMap[e.role] || 0) + 1;
      });

      // Fetch Roster Tier stats
      const tierRes = await fetch('/api/automation/tiers?stats=true');
      if (tierRes.ok) {
        const tData = await tierRes.json();
        setTierStats(tData.stats);
      }

      setStats({
        total: employees.length,
        active,
        departments: Object.entries(deptMap).map(([name, count]) => ({ name, count })),
        roleDistribution: Object.entries(roleMap).map(([role, count]) => ({ role, count })),
      });
    } catch {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingState message="Loading dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={fetchStats} />;
  if (!stats) return null;

  const statCards = [
    { label: 'Total Employees', value: stats.total, icon: '👥', color: 'from-indigo-500 to-purple-600' },
    { label: 'Active', value: stats.active, icon: '✅', color: 'from-emerald-500 to-teal-600' },
    { label: 'Inactive', value: stats.total - stats.active, icon: '⏸️', color: 'from-amber-500 to-orange-600' },
    { label: 'Departments', value: stats.departments.length, icon: '🏢', color: 'from-sky-500 to-blue-600' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">HR Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Overview of your organization</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              <div className={`w-10 h-10 rounded-lg bg-linear-to-br ${card.color} opacity-10`} />
            </div>
            <p className="text-2xl font-bold text-slate-800">{card.value}</p>
            <p className="text-sm text-slate-500 mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Department, Role, & Tier Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Department breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-1.5">
              <span>🏢</span> By Department
            </h3>
            <div className="space-y-3">
              {stats.departments.map((dept) => (
                <div key={dept.name} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 truncate max-w-[100px]">{dept.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 sm:w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-linear-to-r from-indigo-500 to-purple-500 rounded-full"
                        style={{ width: `${(dept.count / stats.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-slate-700 w-5 text-right">{dept.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Role distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-1.5">
              <span>👥</span> By Role
            </h3>
            <div className="space-y-3">
              {stats.roleDistribution.map((item) => (
                <div key={item.role} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 capitalize truncate max-w-[100px]">{item.role}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 sm:w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-linear-to-r from-emerald-500 to-teal-500 rounded-full"
                        style={{ width: `${(item.count / stats.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-slate-700 w-5 text-right">{item.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tier distribution breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <span>🎯</span> Roster Tiers
              </h3>
              <Link href="/hr/month-end" className="text-xs text-indigo-600 hover:text-indigo-800 font-bold transition">
                Manage →
              </Link>
            </div>

            {tierStats ? (
              <div className="space-y-4">
                {/* Stacked indicator bar */}
                <div className="w-full h-3.5 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                  <div
                    className="h-full bg-linear-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                    style={{ width: `${tierStats.total > 0 ? (tierStats.tier1 / tierStats.total) * 100 : 0}%` }}
                    title={`Tier 1: ${tierStats.tier1}`}
                  />
                  <div
                    className="h-full bg-linear-to-r from-amber-400 to-amber-500 transition-all duration-500"
                    style={{ width: `${tierStats.total > 0 ? (tierStats.tier2 / tierStats.total) * 100 : 0}%` }}
                    title={`Tier 2: ${tierStats.tier2}`}
                  />
                  <div
                    className="h-full bg-linear-to-r from-rose-400 to-rose-500 transition-all duration-500"
                    style={{ width: `${tierStats.total > 0 ? (tierStats.tier3 / tierStats.total) * 100 : 0}%` }}
                    title={`Tier 3: ${tierStats.tier3}`}
                  />
                </div>

                <div className="space-y-2 mt-4 text-[11px] font-bold">
                  {/* Tier 1 */}
                  <div className="flex items-center justify-between p-1.5 rounded bg-emerald-50/40 border border-emerald-100/50">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-slate-600">Tier 1 (Perfect)</span>
                    </div>
                    <span className="text-slate-800">{tierStats.tier1} ({tierStats.total > 0 ? Math.round((tierStats.tier1 / tierStats.total) * 100) : 0}%)</span>
                  </div>

                  {/* Tier 2 */}
                  <div className="flex items-center justify-between p-1.5 rounded bg-amber-50/40 border border-amber-100/50">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-slate-600">Tier 2 (Satisfactory)</span>
                    </div>
                    <span className="text-slate-800">{tierStats.tier2} ({tierStats.total > 0 ? Math.round((tierStats.tier2 / tierStats.total) * 100) : 0}%)</span>
                  </div>

                  {/* Tier 3 */}
                  <div className="flex items-center justify-between p-1.5 rounded bg-rose-50/40 border border-rose-100/50">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span className="text-slate-600">Tier 3 (Restricted)</span>
                    </div>
                    <span className="text-slate-800">{tierStats.tier3} ({tierStats.total > 0 ? Math.round((tierStats.tier3 / tierStats.total) * 100) : 0}%)</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400">Loading tier stats...</div>
            )}
          </div>

          <div className="text-[9px] text-slate-400 mt-3 border-t border-slate-100 pt-2 leading-relaxed italic">
            * Roster tiers are automatically updated at month-end based on LWP, half days, and absences.
          </div>
        </div>
      </div>
    </div>
  );
}
