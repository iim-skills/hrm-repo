'use client';

import AttendanceGrid from '@/components/AttendanceGrid';

export default function ManagerAttendancePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Team Attendance</h1>
        <p className="text-sm text-slate-500 mt-1">Mark and view attendance for your team members</p>
      </div>
      <AttendanceGrid role="manager" />
    </div>
  );
}
