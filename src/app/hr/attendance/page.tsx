'use client';

import AttendanceGrid from '@/components/AttendanceGrid';

export default function HRAttendancePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Attendance</h1>
        <p className="text-sm text-slate-500 mt-1">Mark and view attendance for all employees</p>
      </div>
      <AttendanceGrid role="hr" />
    </div>
  );
}
