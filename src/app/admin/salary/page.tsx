'use client';

import SalaryCalculationReport from '@/components/SalaryCalculationReport';

export default function AdminSalaryPage() {
  return (
    <div>
      <div className="mb-6 no-print">
        <h1 className="text-2xl font-bold text-slate-800">Salary Calculation</h1>
        <p className="text-sm text-slate-500 mt-1">
          Calculate and view total payable days for regular employees and new joiners.
        </p>
      </div>
      <SalaryCalculationReport role="admin" />
    </div>
  );
}
