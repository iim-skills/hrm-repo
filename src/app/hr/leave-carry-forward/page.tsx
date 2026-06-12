'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';

interface EmployeeBalance {
  employeeId: string;
  name: string;
  email: string;
  department: string;
  carriedForward: number;
  isCarriedForwardManual: boolean;
  currentBalance: number | null;
}

export default function LeaveCarryForwardPage() {
  const [employees, setEmployees] = useState<EmployeeBalance[]>([]);
  const [updates, setUpdates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Default to current UTC/local year and month
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchBalances = async (targetYear: number, targetMonth: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/leave-carry-forward?year=${targetYear}&month=${targetMonth}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch leave balances');
      }
      setEmployees(data.employees);

      // Populate input states
      const initialUpdates: Record<string, string> = {};
      data.employees.forEach((emp: EmployeeBalance) => {
        initialUpdates[emp.employeeId] = String(emp.carriedForward);
      });
      setUpdates(initialUpdates);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalances(year, month);
  }, [year, month]);

  const handleInputChange = (employeeId: string, val: string) => {
    setUpdates(prev => ({
      ...prev,
      [employeeId]: val
    }));
  };

  const resetAllToDefault = () => {
    const updated: Record<string, string> = {};
    employees.forEach(emp => {
      updated[emp.employeeId] = '1.0';
    });
    setUpdates(updated);
    showToast('All inputs reset to 1.0. Click save to apply changes.', 'success');
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Filter out updates that haven't changed from their original values
      const formattedUpdates = Object.entries(updates)
        .map(([employeeId, val]) => {
          const emp = employees.find(x => x.employeeId === employeeId);
          const originalVal = emp ? String(emp.carriedForward) : '1';
          return { employeeId, val, originalVal };
        })
        .filter(x => parseFloat(x.val) !== parseFloat(x.originalVal))
        .map(x => ({
          employeeId: x.employeeId,
          carriedForward: parseFloat(x.val) || 0
        }));

      if (formattedUpdates.length === 0) {
        showToast('No changes detected to save.', 'success');
        setSubmitting(false);
        return;
      }

      const res = await fetch('/api/leave-carry-forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          month,
          updates: formattedUpdates
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update leave balances');
      }

      showToast('PSL Carry Forward values successfully updated and propagated!', 'success');
      // Reload updated balances
      await fetchBalances(year, month);
    } catch (err: any) {
      showToast(err.message || 'Failed to save changes.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp =>
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.department.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [employees, searchQuery]);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = [2026, 2027, 2028];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center p-4 rounded-xl shadow-lg border transition-all duration-300 transform translate-y-0 ${
          toast.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <div className="mr-3">
            {toast.type === 'success' ? (
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">PSL Carry Forward Manager</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manually override Paid Sick Leave (PSL) carry-forward values for employees. Updates will automatically propagate to subsequent months.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/hr/report">
            <span className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl shadow-xs cursor-pointer transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              View Monthly Report
            </span>
          </Link>
        </div>
      </div>

      {/* Controls Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Year Selector */}
            <div className="flex flex-col gap-1 w-1/2 sm:w-32">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Year</label>
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 hover:bg-white text-sm font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Month Selector */}
            <div className="flex flex-col gap-1 w-1/2 sm:w-44">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 hover:bg-white text-sm font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition"
              >
                {months.map((m, idx) => (
                  <option key={idx} value={idx}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search employee or dept..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 hover:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition font-medium text-slate-700 placeholder-slate-400"
              />
            </div>

            <button
              type="button"
              onClick={resetAllToDefault}
              className="px-4 py-2 border border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-indigo-600 font-bold text-xs rounded-xl transition cursor-pointer shrink-0 whitespace-nowrap"
            >
              Reset All to 1.0
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <LoadingState message={`Fetching leave balances for ${months[month]} ${year}...`} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchBalances(year, month)} />
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[35%]">Employee</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[20%]">Department</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[20%]">Override Type</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[15%]">Carry Forward PSL</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[10%] text-right">Current Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center text-slate-400 text-sm">
                        No employees found matching filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp) => {
                      const initial = emp.name?.charAt(0)?.toUpperCase() || 'E';
                      const avatarClass = 'bg-indigo-100 text-indigo-600';
                      const isManual = updates[emp.employeeId] !== String(emp.carriedForward) || emp.isCarriedForwardManual;

                      return (
                        <tr key={emp.employeeId} className="hover:bg-slate-50/50 transition duration-150">
                          {/* Employee Details */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarClass}`}>
                                {initial}
                              </div>
                              <div className="truncate">
                                <span className="font-semibold text-slate-900 text-sm block truncate">
                                  {emp.name}
                                </span>
                                <span className="text-[10px] text-slate-400 block truncate">
                                  {emp.email}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Department */}
                          <td className="px-6 py-4 text-slate-500 text-sm">{emp.department}</td>

                          {/* Override Status Badge */}
                          <td className="px-6 py-4">
                            {isManual ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-purple-50 border-purple-200 text-purple-700 animate-pulse">
                                Manual Override
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-slate-50 border-slate-200 text-slate-400">
                                System Default
                              </span>
                            )}
                          </td>

                          {/* Input Fields */}
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 max-w-28">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={updates[emp.employeeId] || ''}
                                onChange={(e) => handleInputChange(emp.employeeId, e.target.value)}
                                className={`w-full px-2.5 py-1.5 border rounded-lg text-sm font-bold text-center focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition ${
                                  isManual ? 'border-purple-300 bg-purple-50/20 text-purple-800' : 'border-slate-200 text-slate-700 bg-white'
                                }`}
                              />
                              <span className="text-xs text-slate-400 font-semibold shrink-0">days</span>
                            </div>
                          </td>

                          {/* Current Balance */}
                          <td className="px-6 py-4 text-right">
                            <span className="font-bold text-slate-800 text-sm">
                              {emp.currentBalance !== null ? `${emp.currentBalance} days` : '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => fetchBalances(year, month)}
              className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-bold rounded-xl shadow-md cursor-pointer transition disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-indigo-200 border-t-white rounded-full animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Carry Forward Balances
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
