'use client';

import AttendanceGrid from '@/components/AttendanceGrid';

export default function AdminAttendancePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Attendance Management</h1>
        <p className="text-sm text-slate-500 mt-1">Full attendance access — editable for the entire current month</p>
      </div>
      <AttendanceGrid role="admin" />
    </div>
  );
}
