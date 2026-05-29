'use client';

import AttendanceGrid from '@/components/AttendanceGrid';

export default function EmployeeAttendancePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">My Attendance</h1>
        <p className="text-sm text-slate-500 mt-1">View your attendance records</p>
      </div>
      <AttendanceGrid role="employee" />
    </div>
  );
}
