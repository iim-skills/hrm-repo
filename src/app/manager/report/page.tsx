'use client';

import MonthlyReport from '@/components/MonthlyReport';

export default function ManagerReportPage() {
  return (
    <div>
      <div className="mb-6 no-print">
        <h1 className="text-2xl font-bold text-slate-800">Team Monthly Report</h1>
        <p className="text-sm text-slate-500 mt-1">
          Detailed team tracking — monitor monthly averages, shifts, and view direct reports&apos; calendars.
        </p>
      </div>
      <MonthlyReport role="manager" />
    </div>
  );
}
