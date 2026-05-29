'use client';

import MonthlyReport from '@/components/MonthlyReport';

export default function HRReportPage() {
  return (
    <div>
      <div className="mb-6 no-print">
        <h1 className="text-2xl font-bold text-slate-800">Monthly Attendance Report</h1>
        <p className="text-sm text-slate-500 mt-1">
          Complete organizational overview — view individual monthly calendars, leaves, and percentages.
        </p>
      </div>
      <MonthlyReport role="hr" />
    </div>
  );
}
