'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import CustomSelect from '@/components/CustomSelect';
import { getCycleBoundsForDate } from '@/lib/cycleUtils';

export default function ManagerMonthEndTiersPage() {
  const today = new Date();
  const currentCycle = getCycleBoundsForDate(today);
  const defaultYear = currentCycle.cycleYear;
  const defaultMonth = currentCycle.cycleMonth - 1; // 0-indexed for state

  // Roster Tiers States
  const [tierListings, setTierListings] = useState<any[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(true);
  const [selectedTierYear, setSelectedTierYear] = useState(defaultYear);
  const [selectedTierMonth, setSelectedTierMonth] = useState(defaultMonth);
  const [selectedTierFilter, setSelectedTierFilter] = useState<string | number>('all');
  
  // States for Manager & Department filters (Managers only filter by department, no global manager filter needed)
  const [managers, setManagers] = useState<{ _id: string; name: string }[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  const fetchTiersListings = useCallback(async (yr = selectedTierYear, mo = selectedTierMonth) => {
    try {
      setLoadingTiers(true);
      const res = await fetch(`/api/automation/tiers?year=${yr}&month=${mo}`);
      if (!res.ok) throw new Error('Failed to load roster tiers');
      const data = await res.json();
      const rawListings = data.listings || [];
      const sorted = [...rawListings].sort((a: any, b: any) => {
        const tierA = a.calculatedTier ?? 0;
        const tierB = b.calculatedTier ?? 0;
        if (tierB !== tierA) {
          return tierB - tierA; // Tier 3 > Tier 2 > Tier 1
        }

        const lwpA = a.frozenSummary?.lwpCount ?? 0;
        const lwpB = b.frozenSummary?.lwpCount ?? 0;

        const pslA = a.frozenSummary?.pslCount ?? 0;
        const pslB = b.frozenSummary?.pslCount ?? 0;

        const hfA = a.frozenSummary?.halfDayCount ?? 0;
        const hfB = b.frozenSummary?.halfDayCount ?? 0;

        const severityA = lwpA + pslA + (hfA * 0.5);
        const severityB = lwpB + pslB + (hfB * 0.5);

        if (severityB !== severityA) {
          return severityB - severityA;
        }

        const nameA = a.employee?.name || '';
        const nameB = b.employee?.name || '';
        return nameA.localeCompare(nameB);
      });
      setTierListings(sorted);
    } catch {
      // Silent fail
    } finally {
      setLoadingTiers(false);
    }
  }, [selectedTierYear, selectedTierMonth]);

  const fetchManagers = async () => {
    try {
      const res = await fetch('/api/employees?limit=1000');
      if (!res.ok) return;
      const data = await res.json();
      const mgrs = data.employees
        .filter((e: any) => e.role === 'manager' || e.role === 'hr' || e.role === 'admin')
        .map((e: any) => ({ _id: e.userId || e._id, name: e.name }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      setManagers(mgrs);
    } catch {
      // Silent fail
    }
  };

  useEffect(() => {
    fetchTiersListings(selectedTierYear, selectedTierMonth);
  }, [selectedTierYear, selectedTierMonth, fetchTiersListings]);

  useEffect(() => {
    fetchManagers();
  }, []);

  // Compute unique departments dynamically from listings
  const uniqueDepartments = Array.from(
    new Set(tierListings.map((item) => item.employee?.department).filter(Boolean))
  ).sort() as string[];

  // Map to resolve manager ID to name for visual feedback
  const managerMap = new Map(managers.map((m) => [m._id, m.name]));

  // Combine filters: Tier + Department
  const filteredListings = tierListings.filter((item) => {
    const matchesTier = selectedTierFilter === 'all' || item.calculatedTier === selectedTierFilter;
    const matchesDepartment = selectedDepartment === 'all' || item.employee?.department === selectedDepartment;
    return matchesTier && matchesDepartment;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Main card containing description and calculations controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="space-y-1 flex-shrink-0">
          <h3 className="text-base font-bold text-slate-800">Team Month-End &amp; Roster Tiers</h3>
          <p className="text-xs text-slate-400">
            View Month-End compliance roster tiers and calculation audits for your direct reports and yourself.
          </p>
        </div>

        {/* Control Panel Form */}
        <div className="flex flex-wrap items-center gap-3">
          <CustomSelect
            label="Year"
            value={selectedTierYear}
            onChange={(val) => setSelectedTierYear(val)}
            maxWidthClass="min-w-[90px]"
            options={[2026, 2027].filter(y => y <= currentCycle.cycleYear).map((y) => ({ value: y, label: String(y) }))}
          />

          <CustomSelect
            label="Month"
            value={selectedTierMonth}
            onChange={(val) => setSelectedTierMonth(val)}
            maxWidthClass="min-w-[120px]"
            options={['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, idx) => ({ value: idx, label: m })).filter((m) => {
              if (selectedTierYear === 2026 && m.value < 4) return false;
              if (selectedTierYear > currentCycle.cycleYear) return false;
              if (selectedTierYear === currentCycle.cycleYear && m.value > currentCycle.cycleMonth - 1) return false;
              return true;
            })}
          />

          <CustomSelect
            label="Department"
            value={selectedDepartment}
            onChange={(val) => setSelectedDepartment(val)}
            maxWidthClass="min-w-[160px] max-w-[200px]"
            options={[
              { value: 'all', label: 'All Departments' },
              ...uniqueDepartments.map((dept) => ({ value: dept, label: dept }))
            ]}
          />

          {/* Premium Segmented Tier Control Filter */}
          <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200 select-none">
            <button
              onClick={() => setSelectedTierFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                selectedTierFilter === 'all'
                  ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              All Tiers
            </button>
            <button
              onClick={() => setSelectedTierFilter(1)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                selectedTierFilter === 1
                  ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/10'
                  : 'text-slate-500 hover:text-emerald-600'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${selectedTierFilter === 1 ? 'bg-white' : 'bg-emerald-500'}`}></span>
              Tier 1
            </button>
            <button
              onClick={() => setSelectedTierFilter(2)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                selectedTierFilter === 2
                  ? 'bg-amber-500 text-white shadow-md shadow-amber-500/10'
                  : 'text-slate-500 hover:text-amber-600'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${selectedTierFilter === 2 ? 'bg-white' : 'bg-amber-500'}`}></span>
              Tier 2
            </button>
            <button
              onClick={() => setSelectedTierFilter(3)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                selectedTierFilter === 3
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/10'
                  : 'text-slate-500 hover:text-rose-600'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${selectedTierFilter === 3 ? 'bg-white' : 'bg-rose-500'}`}></span>
              Tier 3
            </button>
          </div>
        </div>
      </div>

      {/* Main card containing table listings */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs min-h-[300px]">
        {loadingTiers ? (
          <div className="py-20 text-center">
            <svg className="animate-spin h-8 w-8 text-indigo-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-slate-500 font-semibold text-sm">Syncing with Team monthly ledger...</p>
          </div>
        ) : tierListings.length === 0 ? (
          <div className="py-14 text-center border border-dashed border-slate-200 rounded-xl bg-white">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <p className="font-semibold text-slate-600">No Tier Calculations Found</p>
            <p className="text-xs text-slate-400 mt-1">This payroll month does not have any calculated roster tiers yet.</p>
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="py-14 text-center border border-dashed border-slate-200 rounded-xl bg-white">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-50 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </div>
            <p className="font-semibold text-slate-600">No Employees Found</p>
            <p className="text-xs text-slate-400 mt-1">There are no team members calculated under Roster Tier {selectedTierFilter} for this month.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                  <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Absence Summary (Frozen)</th>
                  <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Calculated Tier</th>
                  <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Calculation Rule &amp; Audit Log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredListings.map((item) => {
                  const emp = item.employee;
                  const initial = emp.name?.charAt(0)?.toUpperCase() || 'E';

                  const avatarPalette: Record<string, string> = {
                    A: 'bg-violet-100 text-violet-600', B: 'bg-blue-100 text-blue-600',
                    C: 'bg-cyan-100 text-cyan-600', D: 'bg-indigo-100 text-indigo-600',
                    E: 'bg-emerald-100 text-emerald-600', F: 'bg-fuchsia-100 text-fuchsia-600',
                    G: 'bg-green-100 text-green-600', H: 'bg-orange-100 text-orange-600',
                    I: 'bg-sky-100 text-sky-Sky-600', J: 'bg-amber-100 text-amber-600',
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

                  // Determine style and label based on tier
                  let tierBadge = (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold border bg-slate-50 border-slate-200 text-slate-400">
                      Not Computed
                    </span>
                  );

                  if (item.calculatedTier === 1) {
                    tierBadge = (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold border bg-emerald-50 border-emerald-200 text-emerald-700">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                        </svg>
                        Roster Tier 1
                      </span>
                    );
                  } else if (item.calculatedTier === 2) {
                    tierBadge = (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold border bg-amber-50 border-amber-200 text-amber-700">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                        Roster Tier 2
                      </span>
                    );
                  } else if (item.calculatedTier === 3) {
                    tierBadge = (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold border bg-rose-50 border-rose-200 text-rose-700">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Roster Tier 3
                      </span>
                    );
                  }

                  return (
                    <tr key={emp._id} className="hover:bg-slate-50/70 transition-colors duration-150">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarClass}`}>
                            {initial}
                          </div>
                          <div>
                            <Link href={`/manager/team/${emp._id}`}>
                              <span className="font-semibold text-slate-900 text-sm hover:text-indigo-600 hover:underline cursor-pointer transition">
                                {emp.name || 'Unknown'}
                              </span>
                            </Link>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {emp.department || '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {item.frozenSummary ? (
                          <div className="flex gap-3 text-xs">
                            <div className="flex flex-col">
                              <span className="text-slate-400 font-medium text-[9px] uppercase tracking-wider">PSL</span>
                              <span className="font-bold text-slate-700 text-center">{item.frozenSummary.pslCount ?? 0}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-slate-400 font-medium text-[9px] uppercase tracking-wider">Half</span>
                              <span className="font-bold text-slate-700 text-center">{item.frozenSummary.halfDayCount ?? 0}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-slate-400 font-medium text-[9px] uppercase tracking-wider">LWP</span>
                              <span className="font-bold text-slate-700 text-center">{item.frozenSummary.lwpCount ?? 0}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Pending Freeze</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {tierBadge}
                      </td>
                      <td className="px-5 py-4 max-w-xs">
                        <div className="space-y-1">
                          <p className="text-xs text-slate-600 leading-normal">{item.reason}</p>
                          <div className="flex items-center gap-2">
                            {item.isFallback && (
                              <span className="inline-flex px-1.5 py-0.5 bg-amber-50 text-amber-600 text-[8px] font-extrabold uppercase border border-amber-200 rounded">
                                Fallback Used
                              </span>
                            )}
                            {item.updatedAt && (
                              <span className="text-[10px] text-slate-400">
                                Frozen: {new Date(item.updatedAt).toLocaleDateString('en-IN')}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
