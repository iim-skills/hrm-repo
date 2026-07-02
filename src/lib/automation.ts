import mongoose from 'mongoose';
import Employee from '@/lib/models/Employee';
import Attendance from '@/lib/models/Attendance';
import MonthlyAttendanceSummary from '@/lib/models/MonthlyAttendanceSummary';
import LeaveBalance from '@/lib/models/LeaveBalance';
import SandwichFlag from '@/lib/models/SandwichFlag';
import PSLExclusion from '@/lib/models/PSLExclusion';
import { getCycleBounds } from './cycleUtils';

/**
 * Generates or updates the monthly attendance summary for a single employee.
 */
export async function generateMonthlySummary(
  employeeId: string | mongoose.Types.ObjectId,
  year: number,
  month: number
) {
  const empId = new mongoose.Types.ObjectId(employeeId);

  let calcYear = year;
  let calcMonth = month;
  if (calcYear < 2026 || (calcYear === 2026 && calcMonth < 3)) {
    calcYear = 2026;
    calcMonth = 3; // April cycle (0-indexed month 3)
  }

  // Define date bounds for the custom cycle (calcMonth is 0-indexed, getCycleBounds expects 1-indexed)
  const { startDate, endDate } = getCycleBounds(calcYear, calcMonth + 1);

  // Fetch all attendance records for this month
  const records = await Attendance.find({
    employeeId: empId,
    date: { $gte: startDate, $lte: endDate },
  }).lean();

  // Fetch all non-overridden sandwich flags for this employee in the month
  const sandwichFlags = await SandwichFlag.find({
    employeeId: empId,
    date: { $gte: startDate, $lte: endDate },
    isOverridden: false,
  }).lean();

  const flaggedDates = new Set(
    sandwichFlags.map((f) => new Date(f.date).toISOString().split('T')[0])
  );

  let presentCount = 0;
  let pslCount = 0;
  let halfDayCount = 0;
  let wfhCount = 0;
  let lwpCount = 0;
  let plannedLeaveCount = 0;
  let offDayCount = 0;
  let lateCount = 0;

  const today = new Date();
  const isCurrentMonth = today.getTime() >= startDate.getTime() && today.getTime() <= endDate.getTime();
  
  for (const rec of records) {
    const recDate = new Date(rec.date);
    // Skip future dates (important for cycles spanning across months)
    if (recDate.getTime() > today.getTime()) {
      continue;
    }

    const dateStr = recDate.toISOString().split('T')[0];
    const isSandwichLwp = flaggedDates.has(dateStr);
    const status = isSandwichLwp ? 'LWP' : rec.status;

    switch (status) {
      case 'PRESENT':
      case 'EARLY_LEAVE':
        presentCount++;
        break;
      case 'LATE':
        lateCount++;
        break;
      case 'PAID_SICK_LEAVE':
        pslCount++;
        break;
      case 'HALF_DAY':
        halfDayCount++;
        break;
      case 'WFH':
        wfhCount++;
        break;
      case 'LWP':
        lwpCount++;
        break;
      case 'PLANNED_LEAVE':
        plannedLeaveCount++;
        break;
      case 'SCHEDULE_OFF':
      case 'RESTRICTED_HOLIDAY':
        offDayCount++;
        break;
      case 'REMOTE_COMFORT_DAY':
        // Count as WFH/Comfort style or similar
        wfhCount++;
        break;
    }
  }

  // Late arrivals count as 1 present day. 
  // Half days count as 0.5 present days.
  // The LOP penalty is handled separately in the deductions UI and payroll calculation.
  presentCount += lateCount + (halfDayCount * 0.5);

  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const totalCycleDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let totalDaysToConsider = totalCycleDays;
  if (isCurrentMonth) {
    const startOfDayToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const elapsedDays = Math.max(0, Math.ceil((startOfDayToday.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))) + 1;
    totalDaysToConsider = Math.min(totalCycleDays, elapsedDays);
  }
  const totalWorkingDays = totalDaysToConsider - offDayCount;

  // Attendance rate formula: (present + wfh + 0.5 * half_day) / total_working_days * 100
  let attendanceRate = 0;
  if (totalWorkingDays > 0) {
    const presentCredits = presentCount + wfhCount + 0.5 * halfDayCount;
    attendanceRate = Math.min(100, Math.round((presentCredits / totalWorkingDays) * 100));
  }

  // Upsert summary document
  const summary = await MonthlyAttendanceSummary.findOneAndUpdate(
    { employeeId: empId, year: calcYear, month: calcMonth },
    {
      employeeId: empId,
      year: calcYear,
      month: calcMonth,
      presentCount,
      pslCount,
      halfDayCount,
      wfhCount,
      lwpCount,
      plannedLeaveCount,
      offDayCount,
      totalWorkingDays,
      attendanceRate,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return summary;
}

/**
 * Calculates or updates the PSL leave balance ledger with carry-forward support for a single employee.
 */
export async function calculateLeaveBalance(
  employeeId: string | mongoose.Types.ObjectId,
  year: number,
  month: number,
  forceRecalculate: boolean = false
): Promise<any> {
  const empId = new mongoose.Types.ObjectId(employeeId);

  let calcYear = year;
  let calcMonth = month;
  if (calcYear < 2026 || (calcYear === 2026 && calcMonth < 4)) {
    calcYear = 2026;
    calcMonth = 4; // May
  }

  if (!forceRecalculate) {
    const existing = await LeaveBalance.findOne({ employeeId: empId, year: calcYear, month: calcMonth }).lean();
    if (existing) {
      return existing;
    }
  }

  // 1. Get the used PSL from the monthly attendance summary
  const summary = await generateMonthlySummary(empId, calcYear, calcMonth);

  // Define date bounds for the custom cycle to count late arrivals
  const { startDate, endDate } = getCycleBounds(calcYear, calcMonth + 1);
  const lateCount = await Attendance.countDocuments({
    employeeId: empId,
    date: { $gte: startDate, $lte: endDate },
    status: 'LATE'
  });

  const halfDayDeduction = summary.halfDayCount * 0.5;
  const lateDeduction = lateCount > 2 ? (lateCount - 2) * 0.25 : 0;
  
  // Total used PSL includes Paid Sick Leave, Half Day, LWP, Late, and Planned Leave
  const used = summary.pslCount + halfDayDeduction + summary.lwpCount + lateDeduction + summary.plannedLeaveCount;

  // 2. Fetch the prior month's balance to carry forward
  let priorYear = calcYear;
  let priorMonth = calcMonth - 1;
  if (calcMonth === 0) {
    priorYear = calcYear - 1;
    priorMonth = 11;
  }

  let carriedForward = 0.0;
  
  // Find the earliest active month/year for this employee to safely bound recursive calculation
  const earliestAttendance = await Attendance.findOne({ employeeId: empId }).sort({ date: 1 }).lean();
  const earliestBalance = await LeaveBalance.findOne({ employeeId: empId }).sort({ year: 1, month: 1 }).lean();
  const emp = await Employee.findById(empId).lean();

  let earliestYear = calcYear;
  let earliestMonth = calcMonth;

  if (emp && emp.joiningDate) {
    const jd = new Date(emp.joiningDate);
    earliestYear = jd.getUTCFullYear();
    earliestMonth = jd.getUTCMonth();
  }

  if (earliestAttendance && earliestAttendance.date) {
    const attDate = new Date(earliestAttendance.date);
    const attYear = attDate.getUTCFullYear();
    const attMonth = attDate.getUTCMonth();
    if (attYear < earliestYear || (attYear === earliestYear && attMonth < earliestMonth)) {
      earliestYear = attYear;
      earliestMonth = attMonth;
    }
  }

  if (earliestBalance) {
    if (earliestBalance.year < earliestYear || (earliestBalance.year === earliestYear && earliestBalance.month < earliestMonth)) {
      earliestYear = earliestBalance.year;
      earliestMonth = earliestBalance.month;
    }
  }

  // Enforce May 2026 as the absolute earliest base month/year for leave calculation
  let minYear = 2026;
  const minMonth = 4; // May (0-indexed)

  if (earliestYear < minYear || (earliestYear === minYear && earliestMonth < minMonth)) {
    earliestYear = minYear;
    earliestMonth = minMonth;
  }

  let isManual = false;
  const existingRecord = await LeaveBalance.findOne({ employeeId: empId, year: calcYear, month: calcMonth }).lean();
  if (existingRecord && existingRecord.isCarriedForwardManual) {
    carriedForward = existingRecord.carriedForward;
    isManual = true;
  } else {
    const isAfterOrAtEarliest = 
      priorYear > earliestYear || 
      (priorYear === earliestYear && priorMonth >= earliestMonth);

    if (isAfterOrAtEarliest) {
      const priorBalanceRecord = await calculateLeaveBalance(empId, priorYear, priorMonth, forceRecalculate);
      carriedForward = priorBalanceRecord ? priorBalanceRecord.balance : 0.0;
    }
  }

  // Determine if this is a past month (before the current calendar month)
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth(); // 0-indexed
  const isPastMonth = calcYear < currentYear || (calcYear === currentYear && calcMonth < currentMonth);

  // Standard allocation: 1.0 PSL days added per month (Sick Leave Policy Engine rule)
  let allocated = 1.0;
  if (isPastMonth) {
    // For past months, preserve whatever was previously allocated (or default to 1.0)
    const existingRecord = await LeaveBalance.findOne({ employeeId: empId, year: calcYear, month: calcMonth }).lean();
    if (existingRecord && existingRecord.allocated !== undefined) {
      allocated = existingRecord.allocated;
    }
  } else {
    // For current and future months, respect the exclusion setting
    const isExcluded = await PSLExclusion.exists({ employeeId: empId });
    allocated = isExcluded ? 0.0 : 1.0;
  }

  // Calculate final balance for the month
  const balance = Math.max(0, parseFloat((carriedForward + allocated - used).toFixed(2)));

  // Upsert the leave balance ledger document
  const leaveBalance = await LeaveBalance.findOneAndUpdate(
    { employeeId: empId, year: calcYear, month: calcMonth },
    {
      employeeId: empId,
      year: calcYear,
      month: calcMonth,
      allocated,
      used,
      carriedForward,
      balance,
      isCarriedForwardManual: isManual,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return leaveBalance;
}

/**
 * Runs the complete monthly automation engine (summaries + carry-forward ledger) for all active employees.
 */
export async function runMonthlyAutomation(year: number, month: number) {
  const employees = await Employee.find({ isActive: true });
  const results = [];

  for (const emp of employees) {
    const summary = await generateMonthlySummary(emp._id as any, year, month);
    const balance = await calculateLeaveBalance(emp._id as any, year, month);
    results.push({
      employeeId: emp._id,
      name: emp.name,
      summary,
      balance,
    });
  }

  return results;
}

/**
 * Recalculates and propagates leave balance calculations forward from a starting month and year.
 */
export async function recalculateForward(
  employeeId: string | mongoose.Types.ObjectId,
  startYear: number,
  startMonth: number
) {
  const empId = new mongoose.Types.ObjectId(employeeId);
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  let y = startYear;
  let m = startMonth;

  // Propagate calculations from the start month up to 2 months into the future
  while (y < currentYear || (y === currentYear && m <= currentMonth + 2)) {
    await calculateLeaveBalance(empId, y, m, true);
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
}

