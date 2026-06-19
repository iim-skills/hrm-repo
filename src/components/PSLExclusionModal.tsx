'use client';

import { useState, useEffect, useMemo } from 'react';

interface ExcludedEmployee {
  employeeId: string;
  name: string;
  email: string;
  department: string;
  excludeFromPSL: boolean;
}

interface PSLExclusionModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function PSLExclusionModal({ onClose, onSuccess }: PSLExclusionModalProps) {
  const [employees, setEmployees] = useState<ExcludedEmployee[]>([]);
  const [excludeMap, setExcludeMap] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [error, setError] = useState('');

  // Fetch employees and their exclusion status
  const fetchExclusions = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/leave-carry-forward/exclusions');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load exclusions settings');
      }
      setEmployees(data.employees);

      // Initialize exclusion map
      const initialMap: Record<string, boolean> = {};
      data.employees.forEach((emp: ExcludedEmployee) => {
        initialMap[emp.employeeId] = emp.excludeFromPSL;
      });
      setExcludeMap(initialMap);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExclusions();
  }, []);

  // Filter unique departments for filter dropdown
  const departments = useMemo(() => {
    const depts = new Set(employees.map((e) => e.department));
    return Array.from(depts).sort();
  }, [employees]);

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesSearch =
        emp.name.toLowerCase().includes(search.toLowerCase()) ||
        emp.email.toLowerCase().includes(search.toLowerCase());
      const matchesDept = !department || emp.department === department;
      return matchesSearch && matchesDept;
    });
  }, [employees, search, department]);

  const handleToggle = (employeeId: string) => {
    setExcludeMap((prev) => ({
      ...prev,
      [employeeId]: !prev[employeeId]
    }));
  };

  const handleSelectAll = (shouldReceive: boolean) => {
    const updated = { ...excludeMap };
    filteredEmployees.forEach((emp) => {
      // shouldReceive = true means NOT excluded (excludeFromPSL = false)
      // shouldReceive = false means excluded (excludeFromPSL = true)
      updated[emp.employeeId] = !shouldReceive;
    });
    setExcludeMap(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Find changes
      const updates = Object.entries(excludeMap)
        .map(([employeeId, excludeVal]) => {
          const original = employees.find((e) => e.employeeId === employeeId);
          return {
            employeeId,
            excludeFromPSL: excludeVal,
            originalExclude: original ? original.excludeFromPSL : false
          };
        })
        .filter((x) => x.excludeFromPSL !== x.originalExclude)
        .map((x) => ({
          employeeId: x.employeeId,
          excludeFromPSL: x.excludeFromPSL
        }));

      if (updates.length === 0) {
        onClose();
        return;
      }

      const res = await fetch('/api/leave-carry-forward/exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save exclusion settings');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save exclusions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md transition-all duration-300">
      <div className="bg-white border border-slate-200/80 rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col h-[80vh] max-h-[650px] transition-transform scale-100 duration-300">
        
        {/* Header */}
        <div className="bg-linear-to-r from-indigo-600 to-violet-600 px-6 py-5 flex items-center justify-between text-white">
          <div>
            <h2 className="text-xl font-bold tracking-tight">PSL Exclusions</h2>
            <p className="text-xs text-indigo-100 mt-0.5">
              Select who should be excluded from receiving the automatic 1.0 PSL monthly accrual.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-white/20 text-white hover:text-indigo-100 rounded-xl transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex gap-3 w-full sm:w-auto flex-1">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all font-medium text-slate-700 placeholder-slate-400"
              />
            </div>

            {/* Department Filter */}
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white text-slate-700 font-semibold focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 transition"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Quick Select Actions */}
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => handleSelectAll(true)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
            >
              Check All
            </button>
            <button
              onClick={() => handleSelectAll(false)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
            >
              Uncheck All
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-3">
              <svg className="w-5 h-5 text-rose-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-semibold">{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <span className="text-sm font-medium text-slate-500">Loading active employees...</span>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-20 text-slate-400 text-sm font-medium">
              No employees found matching filter criteria.
            </div>
          ) : (
            <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[45%]">Employee</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[25%]">Department</th>
                    <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[30%] text-center">Receive Monthly PSL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredEmployees.map((emp) => {
                    const receivesPSL = !excludeMap[emp.employeeId];
                    const initial = emp.name.charAt(0).toUpperCase() || 'E';

                    return (
                      <tr key={emp.employeeId} className="hover:bg-slate-50/40 transition duration-100">
                        {/* Name / Email */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
                              {initial}
                            </div>
                            <div className="truncate">
                              <span className="font-semibold text-slate-800 text-sm block truncate">
                                {emp.name}
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate">
                                {emp.email}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Dept */}
                        <td className="px-5 py-3 text-slate-500 text-sm font-medium">
                          {emp.department}
                        </td>

                        {/* Checkbox Toggle */}
                        <td className="px-5 py-3 text-center">
                          <label className="relative inline-flex items-center justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={receivesPSL}
                              onChange={() => handleToggle(emp.employeeId)}
                              className="absolute inset-0 opacity-0 cursor-pointer z-10"
                            />
                            <div className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${receivesPSL ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                              <div className={`absolute top-[2px] left-[2px] bg-white border border-slate-300 rounded-full h-5 w-5 transition-all duration-200 ${receivesPSL ? 'translate-x-5' : 'translate-x-0'}`}></div>
                            </div>
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-bold rounded-xl shadow-md cursor-pointer transition disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-indigo-200 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Save Changes
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
