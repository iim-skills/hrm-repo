export type Role = 'admin' | 'hr' | 'manager' | 'employee';

export interface IUser {
  _id: string;
  email: string;
  password: string;
  role: Role;
  employeeId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEmployee {
  _id: string;
  name: string;
  email: string;
  department: string;
  genderFlag: 'male' | 'female' | 'other';
  joiningDate: Date;
  currentRosterTier: number;
  managerId: string | null;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface JWTPayload {
  userId: string;
  role: Role;
  employeeId: string;
}

export interface AuthUser {
  userId: string;
  role: Role;
  employeeId: string;
  email: string;
  name: string;
}

export interface EmployeeFormData {
  name: string;
  email: string;
  password: string;
  department: string;
  genderFlag: 'male' | 'female' | 'other';
  joiningDate: string;
  currentRosterTier: number;
  managerId: string;
  role: Role;
  isActive: boolean;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type AttendanceStatus =
  | 'PRESENT'
  | 'PAID_SICK_LEAVE'
  | 'WFH'
  | 'REMOTE_COMFORT_DAY'
  | 'HALF_DAY'
  | 'SCHEDULE_OFF'
  | 'LWP'
  | 'LATE'
  | 'EARLY_LEAVE'
  | 'PLANNED_LEAVE'
  | 'RESTRICTED_HOLIDAY';

export interface IAttendanceHistoryItem {
  status: AttendanceStatus;
  updatedBy: string;
  updatedByName?: string;
  updatedAt: string;
  notes: string;
}

export interface IAttendance {
  _id: string;
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  markedBy: string;
  notes: string;
  history?: IAttendanceHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceGridRow {
  employee: IEmployee;
  attendance: Record<string, IAttendance | null>; // date string -> attendance
}

export const ATTENDANCE_STATUS_CONFIG: Record<AttendanceStatus, { code: string; label: string; color: string }> = {
  PRESENT: { code: 'P', label: 'Present', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  PAID_SICK_LEAVE: { code: 'PSL', label: 'Paid Sick Leave', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  WFH: { code: 'WFH', label: 'Work From Home', color: 'bg-sky-100 text-sky-700 border-sky-200' },
  REMOTE_COMFORT_DAY: { code: 'RCD', label: 'Remote Comfort Day', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  HALF_DAY: { code: 'HD', label: 'Half Day', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  SCHEDULE_OFF: { code: 'OFF', label: 'Roaster Off', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  LWP: { code: 'LWP', label: 'Leave Without Pay', color: 'bg-rose-100 text-rose-700 border-rose-200' },
  LATE: { code: 'LATE', label: 'Late', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  EARLY_LEAVE: { code: 'EL', label: 'Early Leave', color: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200' },
  PLANNED_LEAVE: { code: 'PL', label: 'Planned Leave', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  RESTRICTED_HOLIDAY: { code: 'RH', label: 'Restricted Holiday', color: 'bg-teal-100 text-teal-700 border-teal-200' },
};

