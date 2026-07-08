'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import Link from 'next/link';
import Badge from '@/components/Badge';
import LoadingState from '@/components/LoadingState';
import ErrorState from '@/components/ErrorState';
import { getCycleBoundsForDate } from '@/lib/cycleUtils';

interface EmployeeShort {
  _id: string;
  name: string;
  department: string;
}

interface ComplianceAlert {
  _id: string;
  employeeId: EmployeeShort;
  type: 'SANDWICH' | 'LWP_ALERT' | 'HALF_DAY_VIOLATION';
  date: string;
  message: string;
  resolved: boolean;
  createdAt: string;
}

interface SandwichFlag {
  _id: string;
  employeeId: EmployeeShort;
  date: string;
  originalStatus: string;
  isOverridden: boolean;
  overrideReason: string;
  overriddenBy?: { email: string };
  createdAt: string;
}

interface WFHRestriction {
  _id: string;
  employeeId: EmployeeShort;
  restrictedUntil: string;
  reason: string;
  isOverridden: boolean;
  overriddenBy?: { email: string };
  overrideReason?: string;
  createdAt: string;
}

interface AtRiskEmployee {
  _id: string;
  name: string;
  department: string;
  lwpCount: number;
  isRestricted: boolean;
  hasSandwich: boolean;
  riskLevel: 'HIGH' | 'MEDIUM';
}

export default function ComplianceDashboard() {
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [sandwichFlags, setSandwichFlags] = useState<SandwichFlag[]>([]);
  const [wfhRestrictions, setWfhRestrictions] = useState<WFHRestriction[]>([]);
  const [atRiskEmployees, setAtRiskEmployees] = useState<AtRiskEmployee[]>([]);
  const [lateOverrides, setLateOverrides] = useState<any[]>([]);
  const [overrideSearch, setOverrideSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'at-risk' | 'sandwich' | 'wfh' | 'alerts' | 'late-overrides'>('late-overrides');

  // Modal State for Sandwich Override
  const [selectedFlags, setSelectedFlags] = useState<SandwichFlag[] | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [submittingOverride, setSubmittingOverride] = useState(false);

  // Modal State for WFH Override
  const [wfhOverrideModal, setWfhOverrideModal] = useState<{ isOpen: boolean; restrictionId: string | null }>({ isOpen: false, restrictionId: null });
  const [wfhOverrideReason, setWfhOverrideReason] = useState('');
  const [submittingWfhOverride, setSubmittingWfhOverride] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);

  const [expandedEmployees, setExpandedEmployees] = useState<Record<string, boolean>>({});

  // Group sandwich flags by cycle first, then by employee within each cycle
  const sandwichByCycle = useMemo(() => {
    // Bucket flags into cycles
    const cycleMap: Record<string, {
      cycleLabel: string;
      cycleStart: Date;
      employees: Record<string, { employee: EmployeeShort; flags: SandwichFlag[] }>;
    }> = {};

    for (const flag of sandwichFlags) {
      const { startDate, endDate, cycleMonth, cycleYear } = getCycleBoundsForDate(new Date(flag.date));
      const cycleKey = `${cycleYear}-${String(cycleMonth).padStart(2, '0')}`;
      const cycleLabel = `${startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — ${endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;

      if (!cycleMap[cycleKey]) {
        cycleMap[cycleKey] = { cycleLabel, cycleStart: startDate, employees: {} };
      }

      const empId = flag.employeeId?._id?.toString() || flag.employeeId?.toString() || 'unknown';
      if (!cycleMap[cycleKey].employees[empId]) {
        cycleMap[cycleKey].employees[empId] = { employee: flag.employeeId, flags: [] };
      }
      cycleMap[cycleKey].employees[empId].flags.push(flag);
    }

    // Sort cycles newest first, convert employees map to array
    return Object.entries(cycleMap)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([cycleKey, { cycleLabel, cycleStart, employees }]) => ({
        cycleKey,
        cycleLabel,
        cycleStart,
        groups: Object.values(employees),
      }));
  }, [sandwichFlags]);

  // Kept for backward compatibility with empty-state check
  const groupedSandwichFlags = useMemo(() => {
    const map: Record<string, { employee: EmployeeShort; flags: SandwichFlag[] }> = {};
    for (const flag of sandwichFlags) {
      const empId = flag.employeeId?._id?.toString() || flag.employeeId?.toString() || 'unknown';
      if (!map[empId]) {
        map[empId] = {
          employee: flag.employeeId,
          flags: [],
        };
      }
      map[empId].flags.push(flag);
    }
    return Object.values(map);
  }, [sandwichFlags]);

  const toggleEmployeeExpand = (empId: string) => {
    setExpandedEmployees(prev => ({
      ...prev,
      [empId]: !prev[empId]
    }));
  };

  const fetchComplianceData = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/compliance');
      if (!res.ok) throw new Error('Failed to load compliance records');
      const data = await res.json();

      setAlerts(data.alerts || []);
      setSandwichFlags(data.sandwichFlags || []);
      setWfhRestrictions(data.wfhRestrictions || []);
      setAtRiskEmployees(data.atRiskEmployees || []);

      const lateRes = await fetch('/api/attendance/late-override');
      if (lateRes.ok) {
        const lateData = await lateRes.json();
        setLateOverrides(lateData.requests || []);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading compliance data');
    } finally {
      setLoading(false);
    }
  };

  const handleRescan = async () => {
    try {
      setRescanning(true);
      setError('');
      const res = await fetch('/api/compliance?rescan=true');
      if (!res.ok) throw new Error('Failed to re-scan compliance policies');
      const data = await res.json();

      setAlerts(data.alerts || []);
      setSandwichFlags(data.sandwichFlags || []);
      setWfhRestrictions(data.wfhRestrictions || []);
      setAtRiskEmployees(data.atRiskEmployees || []);

      setToastMessage('System-wide compliance policies successfully re-scanned and self-healed!');
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      setError(err.message || 'An error occurred during re-scan');
    } finally {
      setRescanning(false);
    }
  };

  useEffect(() => {
    fetchComplianceData();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'at-risk' || tab === 'sandwich' || tab === 'wfh' || tab === 'alerts' || tab === 'late-overrides') {
        setActiveTab(tab as any);
      }
    }
  }, []);



  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFlags || selectedFlags.length === 0 || !overrideReason.trim()) return;

    try {
      setSubmittingOverride(true);
      await Promise.all(
        selectedFlags.map((flag) =>
          fetch('/api/compliance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sandwichFlagId: flag._id,
              overrideReason: overrideReason.trim(),
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const errData = await res.json();
              throw new Error(errData.error || 'Failed to submit override');
            }
          })
        )
      );

      setToastMessage('Sandwich policy penalty successfully overridden!');
      setSelectedFlags(null);
      setOverrideReason('');

      // Auto dismiss toast
      setTimeout(() => setToastMessage(null), 4000);

      // Refresh statistics
      await fetchComplianceData();
    } catch (err: any) {
      alert(err.message || 'Failed to override sandwich penalty');
    } finally {
      setSubmittingOverride(false);
    }
  };

  const handleWfhOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wfhOverrideModal.restrictionId || !wfhOverrideReason.trim()) return;

    try {
      setSubmittingWfhOverride(true);
      const res = await fetch('/api/compliance/wfh-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restrictionId: wfhOverrideModal.restrictionId,
          reason: wfhOverrideReason.trim(),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to submit WFH override');
      }

      setToastMessage('WFH penalty successfully overridden!');
      setWfhOverrideModal({ isOpen: false, restrictionId: null });
      setWfhOverrideReason('');

      setTimeout(() => setToastMessage(null), 4000);

      await fetchComplianceData();
    } catch (err: any) {
      alert(err.message || 'Failed to override WFH penalty');
    } finally {
      setSubmittingWfhOverride(false);
    }
  };

  const handleLateOverrideAction = async (requestId: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      setSubmittingOverride(true);
      const res = await fetch('/api/attendance/late-override', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, status }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update request');
      }
      setToastMessage(`Late override request ${status.toLowerCase()}!`);
      setTimeout(() => setToastMessage(null), 4000);
      await fetchComplianceData();
    } catch (err: any) {
      alert(err.message || 'Error resolving request');
    } finally {
      setSubmittingOverride(false);
    }
  };

  if (loading) return <LoadingState message="Analyzing policy rules and compiling compliance risks..." />;
  if (error) return <ErrorState message={error} onRetry={fetchComplianceData} />;

  // Quick statistics calculation
  const totalAlerts = alerts.length;
  const activeRestrictions = wfhRestrictions.length;
  const totalSandwichedEmployees = new Set(
    sandwichFlags.filter(f => !f.isOverridden).map(f => f.employeeId?._id?.toString() || f.employeeId?.toString())
  ).size;
  const atRiskCount = atRiskEmployees.length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 border border-slate-700 text-white rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-100">Action Complete</p>
            <p className="text-xs text-slate-400">{toastMessage}</p>
          </div>
        </div>
      )}



      {/* Grid: Summary metrics cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* At Risk Card */}
        <div className="bg-white border border-l-4 border-slate-200 border-l-amber-400 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-default">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">At-Risk Employees</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <p className={`text-3xl font-extrabold ${atRiskCount > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{atRiskCount}</p>
          <p className="text-[11px] text-slate-400 mt-1.5 font-medium">High LWP rate or active locks</p>
        </div>

        {/* Active Sandwich Card */}
        <div className="bg-white border border-l-4 border-slate-200 border-l-rose-400 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-default">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Sandwich</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
            </div>
          </div>
          <p className={`text-3xl font-extrabold ${totalSandwichedEmployees > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{totalSandwichedEmployees}</p>
          <p className="text-[11px] text-slate-400 mt-1.5 font-medium">Employees with sandwich conversion</p>
        </div>

        {/* WFH Lockout Card */}
        <div className="bg-white border border-l-4 border-slate-200 border-l-indigo-400 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-default">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">WFH Restrictions</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
          </div>
          <p className={`text-3xl font-extrabold ${activeRestrictions > 0 ? 'text-indigo-600' : 'text-slate-800'}`}>{activeRestrictions}</p>
          <p className="text-[11px] text-slate-400 mt-1.5 font-medium">Rolling week lockout — Half-Day</p>
        </div>

        {/* Compliance Alerts Card */}
        <div className="bg-white border border-l-4 border-slate-200 border-l-slate-400 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-default">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">System Alerts</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
          </div>
          <p className="text-3xl font-extrabold text-slate-800">{totalAlerts}</p>
          <p className="text-[11px] text-slate-400 mt-1.5 font-medium">Audit log violations reported</p>
        </div>

      </div>

      {/* Tabs Menu Navigation */}
      <div className="border-b border-slate-200 flex flex-wrap gap-0">
        {/* 1. Late Overrides */}
        <button
          onClick={() => setActiveTab('late-overrides')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-150 flex items-center gap-2 cursor-pointer ${activeTab === 'late-overrides'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-700 hover:border-slate-300'
            }`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Late Overrides
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === 'late-overrides' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
            }`}>{lateOverrides.filter(req => req.status === 'PENDING').length}</span>
        </button>

        {/* 2. Sandwich Conversions */}
        <button
          onClick={() => setActiveTab('sandwich')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-150 flex items-center gap-2 cursor-pointer ${activeTab === 'sandwich'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-700 hover:border-slate-300'
            }`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Sandwich Conversions
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === 'sandwich' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
            }`}>{totalSandwichedEmployees}</span>
        </button>

        {/* 3. WFH Restrictions */}
        <button
          onClick={() => setActiveTab('wfh')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-150 flex items-center gap-2 cursor-pointer ${activeTab === 'wfh'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-700 hover:border-slate-300'
            }`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          WFH Restrictions
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === 'wfh' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
            }`}>{activeRestrictions}</span>
        </button>

        {/* 4. System Alerts */}
        <button
          onClick={() => setActiveTab('alerts')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-150 flex items-center gap-2 cursor-pointer ${activeTab === 'alerts'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-700 hover:border-slate-300'
            }`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          System Alerts
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === 'alerts' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
            }`}>{totalAlerts}</span>
        </button>

        {/* 5. At-Risk Employees */}
        <button
          onClick={() => setActiveTab('at-risk')}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all duration-150 flex items-center gap-2 cursor-pointer ${activeTab === 'at-risk'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-700 hover:border-slate-300'
            }`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          At-Risk Employees
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === 'at-risk' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
            }`}>{atRiskCount}</span>
        </button>

      </div>

      {/* Tab Panels */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm min-h-[300px]">

        {/* Late Overrides Panel */}
        {activeTab === 'late-overrides' && (
          <div className="space-y-8">
            <div className="space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-800">Pending Late Overrides</h3>
                <p className="text-xs text-slate-400 mt-0.5">Review employee requests to override late attendance records.</p>
              </div>
              {lateOverrides.filter(req => req.status === 'PENDING').length === 0 ? (
                <div className="py-14 text-center border border-dashed border-slate-200 rounded-xl">
                  <p className="font-semibold text-slate-600">No Pending Requests</p>
                  <p className="text-xs text-slate-400 mt-1">There are currently no late override requests to review.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                        <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
                        <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reason</th>
                        <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lateOverrides.filter(req => req.status === 'PENDING').map((req) => (
                        <tr key={req._id} className="hover:bg-slate-50/70 transition-colors duration-150">
                          <td className="px-5 py-4">
                            <Link href={`/hr/employees/${req.employeeId._id}`}>
                              <span className="font-semibold text-slate-900 text-sm hover:text-indigo-600 hover:underline cursor-pointer">
                                {req.employeeId.name}
                              </span>
                            </Link>
                          </td>
                          <td className="px-5 py-4 font-medium text-slate-700 text-sm">
                            {new Date(req.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-5 py-4 text-sm text-slate-600 italic">
                            &quot;{req.reason}&quot;
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="inline-flex gap-2">
                              <button
                                onClick={() => handleLateOverrideAction(req._id, 'APPROVED')}
                                disabled={submittingOverride}
                                className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 font-bold text-xs rounded-lg transition border border-emerald-100 shadow-sm disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleLateOverrideAction(req._id, 'REJECTED')}
                                disabled={submittingOverride}
                                className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 font-bold text-xs rounded-lg transition border border-rose-100 shadow-sm disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Resolved History */}
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-800">Resolved History</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Past approved and rejected override requests.</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search employee..."
                    value={overrideSearch}
                    onChange={(e) => setOverrideSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200/80 rounded-xl bg-slate-50/50 hover:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-400 transition-all font-medium text-slate-700 placeholder-slate-400"
                  />
                </div>
              </div>
              {lateOverrides.filter(req => req.status !== 'PENDING' && req.employeeId.name.toLowerCase().includes(overrideSearch.toLowerCase())).length === 0 ? (
                <div className="py-8 text-center border border-dashed border-slate-200 rounded-xl">
                  <p className="text-xs text-slate-400">No resolved requests found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 opacity-80 hover:opacity-100 transition-opacity">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                        <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
                        <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reason</th>
                        <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resolved By</th>
                        <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lateOverrides.filter(req => req.status !== 'PENDING' && req.employeeId.name.toLowerCase().includes(overrideSearch.toLowerCase())).map((req) => (
                        <tr key={req._id} className="hover:bg-slate-50/70 transition-colors duration-150">
                          <td className="px-5 py-3">
                            <Link href={`/hr/employees/${req.employeeId._id}`}>
                              <span className="font-semibold text-slate-900 text-xs hover:text-indigo-600 hover:underline cursor-pointer">
                                {req.employeeId.name}
                              </span>
                            </Link>
                          </td>
                          <td className="px-5 py-3 font-medium text-slate-700 text-xs">
                            {new Date(req.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-600 italic">
                            &quot;{req.reason}&quot;
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-600">
                            {req.resolvedBy?.email || 'Unknown'}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${req.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'
                              }`}>
                              {req.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* At Risk Panel */}
        {activeTab === 'at-risk' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-800">At-Risk Employees List</h3>
              <p className="text-xs text-slate-400 mt-0.5">Employees showing frequent absences, multiple active policy violations, or high LWP rates.</p>
            </div>

            {atRiskEmployees.length === 0 ? (
              <div className="py-14 text-center border border-dashed border-slate-200 rounded-xl">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-50 flex items-center justify-center">
                  <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="font-semibold text-slate-600">Zero Compliance Risks</p>
                <p className="text-xs text-slate-400 mt-1">All employees are currently fully compliant with active policy guidelines.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                      <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Department</th>
                      <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">LWP Count (Month)</th>
                      <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">WFH Status</th>
                      <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Sandwich</th>
                      <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Risk Level</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {atRiskEmployees.map((emp) => {
                      const initial = emp.name?.charAt(0)?.toUpperCase() || 'E';
                      const avatarPalette: Record<string, string> = {
                        A: 'bg-violet-100 text-violet-600',
                        B: 'bg-blue-100 text-blue-600',
                        C: 'bg-cyan-100 text-cyan-600',
                        D: 'bg-indigo-100 text-indigo-600',
                        E: 'bg-emerald-100 text-emerald-600',
                        F: 'bg-fuchsia-100 text-fuchsia-600',
                        G: 'bg-green-100 text-green-600',
                        H: 'bg-orange-100 text-orange-600',
                        I: 'bg-sky-100 text-sky-600',
                        J: 'bg-amber-100 text-amber-600',
                        K: 'bg-teal-100 text-teal-600',
                        L: 'bg-lime-100 text-lime-600',
                        M: 'bg-purple-100 text-purple-600',
                        N: 'bg-rose-100 text-rose-600',
                        O: 'bg-orange-100 text-orange-600',
                        P: 'bg-pink-100 text-pink-600',
                        Q: 'bg-slate-100 text-slate-600',
                        R: 'bg-red-100 text-red-600',
                        S: 'bg-indigo-100 text-indigo-600',
                        T: 'bg-teal-100 text-teal-600',
                        U: 'bg-purple-100 text-purple-600',
                        V: 'bg-violet-100 text-violet-600',
                        W: 'bg-blue-100 text-blue-600',
                        X: 'bg-slate-100 text-slate-600',
                        Y: 'bg-yellow-100 text-yellow-600',
                        Z: 'bg-zinc-100 text-zinc-600',
                      };
                      const avatarClass = avatarPalette[initial] || 'bg-slate-100 text-slate-600';

                      return (
                        <tr key={emp._id} className="hover:bg-slate-50/70 transition-colors duration-150">

                          {/* Employee */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarClass}`}>
                                {initial}
                              </div>
                              <Link href={`/hr/employees/${emp._id}`}>
                                <span className="font-semibold text-slate-900 text-sm hover:text-indigo-600 hover:underline cursor-pointer transition">
                                  {emp.name}
                                </span>
                              </Link>
                            </div>
                          </td>

                          {/* Department */}
                          <td className="px-5 py-4 text-slate-500 text-sm">{emp.department}</td>

                          {/* LWP Count */}
                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center px-3 py-1 rounded-md text-[11px] font-bold border ${emp.lwpCount > 3
                                ? 'bg-rose-50 border-rose-200 text-rose-600'
                                : 'bg-slate-50 border-slate-200 text-slate-500'
                              }`}>
                              {emp.lwpCount} LWP Days
                            </span>
                          </td>

                          {/* WFH Status */}
                          <td className="px-5 py-4">
                            {emp.isRestricted ? (
                              <span className="inline-flex items-center gap-1.5 font-semibold text-rose-500 text-sm">
                                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0110 0v4" />
                                </svg>
                                Locked
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 text-sm">
                                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 019.9-1" />
                                </svg>
                                Eligible
                              </span>
                            )}
                          </td>

                          {/* Active Sandwich */}
                          <td className="px-5 py-4">
                            {emp.hasSandwich ? (
                              <span className="inline-flex items-center px-3 py-1 rounded-md text-[11px] font-bold border bg-amber-50 border-amber-200 text-amber-700">
                                Converted Trigger
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium text-sm">—</span>
                            )}
                          </td>

                          {/* Risk Level */}
                          <td className="px-5 py-4 text-right">
                            <span className={`inline-flex items-center px-3 py-1 rounded-md text-[11px] font-extrabold tracking-wide border ${emp.riskLevel === 'HIGH'
                                ? 'bg-rose-50 border-rose-300 text-rose-600'
                                : 'bg-amber-50 border-amber-200 text-amber-600'
                              }`}>
                              {emp.riskLevel} RISK
                            </span>
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Sandwich Panel */}
        {activeTab === 'sandwich' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-800">Sandwich Conversions Audit Log</h3>
              <p className="text-xs text-slate-400 mt-0.5">Lists scheduled off-days or WFH days automatically converted to LWP due to adjacent unplanned absences. HR can override penalties.</p>
            </div>

            {groupedSandwichFlags.length === 0 ? (
              <div className="py-14 text-center border border-dashed border-slate-200 rounded-xl">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-50 flex items-center justify-center">
                  <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="font-semibold text-slate-600">No Sandwich Triggers Found</p>
                <p className="text-xs text-slate-400 mt-1">No scheduled off-days are currently sandwiched or converted to LWP.</p>
              </div>
            ) : (
              <div className="space-y-4">
                    {sandwichByCycle.map(({ cycleKey, cycleLabel, groups }) => (
                      <div key={cycleKey} className="overflow-hidden rounded-xl border border-slate-200">
                        {/* Cycle Header */}
                        <div className="bg-indigo-50 border-b border-indigo-200/60 px-5 py-3 flex items-center gap-3">
                          <svg className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Cycle: {cycleLabel}</span>
                          <span className="ml-auto text-[10px] font-bold bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
                            {new Set(groups.filter(g => g.flags.some(f => !f.isOverridden)).map(g => g.employee?._id)).size} affected
                          </span>
                        </div>

                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[40%]">Employee</th>
                              <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-[30%]">Sandwiched Date(s)</th>
                              <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right w-[30%]">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {groups.map((group) => {
                              const empId = group.employee?._id?.toString() || 'unknown';
                              const isExpanded = !!expandedEmployees[empId];
                              const totalDays = group.flags.length;
                              const activeCount = group.flags.filter(f => !f.isOverridden).length;
                              const initial = group.employee?.name?.charAt(0)?.toUpperCase() || 'E';
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
                              const avatarClass = avatarPalette[initial] || 'bg-indigo-100 text-indigo-600';

                              return (
                                <Fragment key={`${cycleKey}-${empId}`}>
                                  <tr
                                    className="hover:bg-slate-50/70 transition-colors duration-150 cursor-pointer"
                                    onClick={() => toggleEmployeeExpand(`${cycleKey}-${empId}`)}
                                  >
                                    {/* Employee */}
                                    <td className="px-5 py-4">
                                      <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarClass}`}>
                                          {initial}
                                        </div>
                                        <div>
                                          <Link href={`/hr/employees/${empId}`} onClick={(e) => e.stopPropagation()}>
                                            <span className="font-semibold text-slate-900 text-sm hover:text-indigo-600 hover:underline cursor-pointer transition">
                                              {group.employee?.name || 'Unknown'}
                                            </span>
                                          </Link>
                                          <p className="text-[10px] text-slate-400 mt-0.5">{group.employee?.department || '—'}</p>
                                        </div>
                                      </div>
                                    </td>

                                    {/* Dates */}
                                    <td className="px-5 py-4">
                                      <div className="flex flex-col">
                                        <span className="font-bold text-slate-900 text-sm">
                                          {totalDays} {totalDays === 1 ? 'Day' : 'Days'}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-medium mt-0.5">
                                          {group.flags.map(f => new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })).join(' & ')}
                                        </span>
                                      </div>
                                    </td>

                                    {/* Actions */}
                                    <td className="px-5 py-4 text-right">
                                      <div className="inline-flex items-center gap-2 justify-end">
                                        {activeCount > 0 ? (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedFlags(group.flags.filter(f => !f.isOverridden));
                                            }}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all duration-200 cursor-pointer whitespace-nowrap"
                                          >
                                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                            </svg>
                                            Override Penalty
                                          </button>
                                        ) : (
                                          <span className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-xl">
                                            <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                            All Waived
                                          </span>
                                        )}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleEmployeeExpand(`${cycleKey}-${empId}`);
                                          }}
                                          className={`inline-flex items-center justify-center w-9 h-9 border rounded-xl transition-all duration-200 cursor-pointer flex-shrink-0 ${!!expandedEmployees[`${cycleKey}-${empId}`]
                                              ? 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100'
                                              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'
                                            }`}
                                          title={!!expandedEmployees[`${cycleKey}-${empId}`] ? 'Hide Details' : 'View Details'}
                                        >
                                          <svg
                                            className={`w-4 h-4 transition-transform duration-300 ${!!expandedEmployees[`${cycleKey}-${empId}`] ? 'rotate-180' : ''}`}
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                          >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                          </svg>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* Collapsible details dropdown row */}
                                  {!!expandedEmployees[`${cycleKey}-${empId}`] && (
                                    <tr className="bg-slate-50/70 border-l-4 border-indigo-500">
                                      <td colSpan={3} className="px-5 py-4">
                                        <div className="space-y-3">
                                          <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                                            <h4 className="font-bold text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                                              <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                              </svg>
                                              Detailed Sandwich Leaves ({group.employee?.name})
                                            </h4>
                                            <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full">
                                              {activeCount} active penalties / {totalDays} total
                                            </span>
                                          </div>

                                          <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-sm">
                                            <table className="w-full text-left border-collapse text-[11px]">
                                              <thead>
                                                <tr className="bg-slate-50/80 border-b border-slate-200/80">
                                                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sandwiched Date</th>
                                                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Original Status</th>
                                                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current Status</th>
                                                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Override Info</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-100">
                                                {group.flags.map((flag) => (
                                                  <tr key={flag._id} className="hover:bg-slate-50/30 transition-colors">
                                                    <td className="px-6 py-3.5 text-slate-900 font-bold text-[11px]">
                                                      {new Date(flag.date).toLocaleDateString('en-IN', {
                                                        weekday: 'short',
                                                        day: 'numeric',
                                                        month: 'short',
                                                        year: 'numeric'
                                                      })}
                                                    </td>
                                                    <td className="px-6 py-3.5">
                                                      <span className="inline-flex px-2.5 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg text-[10px] font-extrabold uppercase tracking-wide">
                                                        {flag.originalStatus.replace(/_/g, ' ')}
                                                      </span>
                                                    </td>
                                                    <td className="px-6 py-3.5">
                                                      <span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wide border ${flag.isOverridden
                                                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                                          : 'bg-rose-50 border-rose-100 text-rose-700'
                                                        }`}>
                                                        {flag.isOverridden ? flag.originalStatus.replace(/_/g, ' ') : 'LWP'}
                                                      </span>
                                                    </td>
                                                    <td className="px-6 py-3.5">
                                                      {flag.isOverridden ? (
                                                        <div className="flex flex-col gap-0.5">
                                                          <span className="text-emerald-600 font-bold flex items-center gap-1 text-[11px]">
                                                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                            Waived (Overridden)
                                                          </span>
                                                          {flag.overrideReason && (
                                                            <p className="text-[10px] text-slate-500 italic font-medium max-w-xs">
                                                              &quot;{flag.overrideReason}&quot;
                                                            </p>
                                                          )}
                                                          <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">
                                                            By {flag.overriddenBy?.email || 'HR'}
                                                          </p>
                                                        </div>
                                                      ) : (
                                                        <div className="flex flex-col gap-0.5">
                                                          <span className="text-rose-600 font-bold flex items-center gap-1 text-[11px]">
                                                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                            Converted to LWP
                                                          </span>
                                                          <p className="text-[10px] text-slate-400 font-medium">Auto-calculated</p>
                                                        </div>
                                                      )}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
            )}
          </div>
        )}

        {/* WFH Panel */}
        {activeTab === 'wfh' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-800">Active WFH Lockout Restrictions</h3>
              <p className="text-xs text-slate-400 mt-0.5">Employees whose WFH privilege has been suspended for the rolling week due to a Half-Day violation.</p>
            </div>

            {wfhRestrictions.length === 0 ? (
              <div className="py-14 text-center border border-dashed border-slate-200 rounded-xl">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-indigo-50 flex items-center justify-center">
                  <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="font-semibold text-slate-600">Zero Locked Privileges</p>
                <p className="text-xs text-slate-400 mt-1">All team members are eligible to work from home without restrictions.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                      <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trigger Reason</th>
                      <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Restricted Until</th>
                      <th className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {wfhRestrictions.map((r) => {
                      const initial = r.employeeId?.name?.charAt(0)?.toUpperCase() || 'E';
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
                        <tr key={r._id} className="hover:bg-slate-50/70 transition-colors duration-150">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarClass}`}>
                                {initial}
                              </div>
                              <div>
                                <Link href={`/hr/employees/${r.employeeId?._id}`}>
                                  <span className="font-semibold text-slate-900 text-sm hover:text-indigo-600 hover:underline cursor-pointer transition">
                                    {r.employeeId?.name || 'Unknown'}
                                  </span>
                                </Link>
                                <p className="text-[10px] text-slate-400 mt-0.5">{r.employeeId?.department || '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 max-w-xs">
                            <p className="text-sm text-slate-500 italic truncate">&quot;{r.reason}&quot;</p>
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-rose-600 text-sm">
                              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {new Date(r.restrictedUntil).toLocaleDateString('en-IN', {
                                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                              })}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            {r.isOverridden ? (
                              <div className="flex flex-col items-end gap-1">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold border bg-emerald-50 border-emerald-200 text-emerald-700">
                                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Waived
                                </span>
                                <span className="text-[9px] text-slate-400">By {r.overriddenBy?.email || 'HR'}</span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-3">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold border bg-rose-50 border-rose-200 text-rose-600">
                                  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                  </svg>
                                  WFH Suspended
                                </span>
                                <button
                                  onClick={() => setWfhOverrideModal({ isOpen: true, restrictionId: r._id })}
                                  className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs rounded-lg transition border border-indigo-100 shadow-sm"
                                >
                                  Override
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Alerts Panel */}
        {activeTab === 'alerts' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-800">System Policy Violation Alerts</h3>
              <p className="text-xs text-slate-400 mt-0.5">Real-time log of policy-triggered warnings and conversions across the organization.</p>
            </div>

            {alerts.length === 0 ? (
              <div className="py-14 text-center border border-dashed border-slate-200 rounded-xl">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="font-semibold text-slate-600">All Safe and Compliant</p>
                <p className="text-xs text-slate-400 mt-1">No policy violations have been logged so far.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {alerts.map((alert) => {
                  const isSandwich = alert.type === 'SANDWICH';
                  const isHalfDay = alert.type === 'HALF_DAY_VIOLATION';
                  return (
                    <div
                      key={alert._id}
                      className="p-4 rounded-xl border border-slate-200 flex gap-4 items-start hover:bg-slate-50/60 hover:border-slate-300 transition-all duration-150 bg-white"
                    >
                      {/* Type Icon Badge */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${isSandwich ? 'bg-rose-50' : isHalfDay ? 'bg-indigo-50' : 'bg-amber-50'
                        }`}>
                        {isSandwich ? (
                          <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        ) : isHalfDay ? (
                          <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Link href={`/hr/employees/${alert.employeeId?._id}`}>
                            <span className="font-bold text-slate-800 text-sm hover:text-indigo-600 hover:underline cursor-pointer transition">
                              {alert.employeeId?.name || 'Employee'}
                            </span>
                          </Link>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {new Date(alert.createdAt).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{alert.message}</p>
                        <div className="mt-2 flex gap-2 flex-wrap">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${isSandwich ? 'bg-rose-50 border-rose-200 text-rose-600'
                              : isHalfDay ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                                : 'bg-amber-50 border-amber-200 text-amber-600'
                            }`}>
                            {alert.type.replace(/_/g, ' ')}
                          </span>
                          {alert.employeeId?.department && (
                            <span className="inline-flex px-2.5 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-[10px] font-bold text-slate-500">
                              {alert.employeeId.department}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}



      </div>

      {/* Override Penalty Modal */}
      {selectedFlags && selectedFlags.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full relative">

            {/* Modal Header */}
            <div className="flex items-start gap-4 p-6 pb-4 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-extrabold text-slate-900">Sandwich Penalty Override</h3>
                <p className="text-xs text-slate-400 mt-0.5">Submit a justified reason to waive the LWP conversion penalty.</p>
              </div>
              <button
                onClick={() => setSelectedFlags(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors duration-150 cursor-pointer flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Employee & Dates Info Card */}
            <div className="px-6 pt-4">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <p className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest mb-2">Waiving Penalty For</p>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                    <div className="w-6 h-6 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-[10px] font-extrabold flex-shrink-0">
                      {selectedFlags[0]?.employeeId?.name?.charAt(0) || 'E'}
                    </div>
                    {selectedFlags[0]?.employeeId?.name || 'Employee'}
                  </span>
                  <span className="text-slate-300">·</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedFlags.map(f => (
                      <span key={f._id} className="inline-flex px-2 py-0.5 bg-white border border-indigo-200 text-indigo-700 text-[10px] font-bold rounded-md">
                        {new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handleOverrideSubmit} className="px-6 pt-4 pb-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Reason for Override
                </label>
                <textarea
                  required
                  rows={4}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Employee provided physical hospital discharge slip; verified and approved by Department Head."
                  className="w-full text-sm p-3.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-300 text-slate-700 leading-relaxed resize-none transition-shadow duration-150"
                />
                <p className="text-[10px] text-slate-400 mt-1.5 font-medium">This reason will be recorded in the compliance audit log.</p>
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedFlags(null)}
                  className="px-5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all duration-150 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOverride || !overrideReason.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-bold rounded-xl shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {submittingOverride ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Apply Waiver
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WFH Override Modal */}
      {wfhOverrideModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setWfhOverrideModal({ isOpen: false, restrictionId: null })}
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Override WFH Penalty</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Waive the WFH lockout for this employee</p>
                </div>
              </div>
              <button
                onClick={() => setWfhOverrideModal({ isOpen: false, restrictionId: null })}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors duration-150 cursor-pointer flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleWfhOverrideSubmit} className="px-6 pt-4 pb-6 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Reason for Override
                </label>
                <textarea
                  required
                  rows={4}
                  value={wfhOverrideReason}
                  onChange={(e) => setWfhOverrideReason(e.target.value)}
                  placeholder="e.g. Approved by Manager due to exceptional circumstances."
                  className="w-full text-sm p-3.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-slate-300 text-slate-700 leading-relaxed resize-none transition-shadow duration-150"
                />
                <p className="text-[10px] text-slate-400 mt-1.5 font-medium">This reason will be recorded in the compliance audit log.</p>
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setWfhOverrideModal({ isOpen: false, restrictionId: null })}
                  className="px-5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all duration-150 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingWfhOverride || !wfhOverrideReason.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-bold rounded-xl shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {submittingWfhOverride ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Apply Waiver
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
