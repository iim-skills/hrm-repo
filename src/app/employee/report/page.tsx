'use client';

import MonthlyReport from '@/components/MonthlyReport';

export default function EmployeeReportPage() {
  return (
    <div>
      <div className="mb-6 no-print">
        <h1 className="text-2xl font-bold text-slate-800">My Monthly Report</h1>
        <p className="text-sm text-slate-500 mt-1">
          Personal dashboard — view cumulative percentages, WFH schedules, and individual daily details.
        </p>
      </div>
      <MonthlyReport role="employee" />
    </div>
  );
}
