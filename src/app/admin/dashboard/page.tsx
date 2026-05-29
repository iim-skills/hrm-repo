'use client';

import { useState, useEffect } from 'react';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';

interface DashboardStats {
  total: number;
  active: number;
  departments: { name: string; count: number }[];
  roleDistribution: { role: string; count: number }[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
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

      const deptMap: Record<string, number> = {};
      const roleMap: Record<string, number> = {};
      employees.forEach((e: { department: string; role: string }) => {
        deptMap[e.department] = (deptMap[e.department] || 0) + 1;
        roleMap[e.role] = (roleMap[e.role] || 0) + 1;
      });

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
    { label: 'Total Employees', value: stats.total, icon: '👥', color: 'from-rose-500 to-pink-600' },
    { label: 'Active', value: stats.active, icon: '✅', color: 'from-emerald-500 to-teal-600' },
    { label: 'Inactive', value: stats.total - stats.active, icon: '⏸️', color: 'from-amber-500 to-orange-600' },
    { label: 'Departments', value: stats.departments.length, icon: '🏢', color: 'from-sky-500 to-blue-600' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Admin Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Full system overview — you have unrestricted access</p>
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

      {/* Department & Role Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">By Department</h3>
          <div className="space-y-3">
            {stats.departments.map((dept) => (
              <div key={dept.name} className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{dept.name}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-linear-to-r from-rose-500 to-pink-500 rounded-full"
                      style={{ width: `${(dept.count / stats.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-700 w-6 text-right">{dept.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">By Role</h3>
          <div className="space-y-3">
            {stats.roleDistribution.map((item) => (
              <div key={item.role} className="flex items-center justify-between">
                <span className="text-sm text-slate-600 capitalize">{item.role}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-linear-to-r from-emerald-500 to-teal-500 rounded-full"
                      style={{ width: `${(item.count / stats.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-700 w-6 text-right">{item.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
