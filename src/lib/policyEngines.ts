import mongoose from 'mongoose';
import Attendance, { AttendanceStatus } from './models/Attendance';
import LeaveBalance from './models/LeaveBalance';
import SandwichFlag from './models/SandwichFlag';
import WFHRestriction from './models/WFHRestriction';
import ComplianceAlert from './models/ComplianceAlert';
import Employee from './models/Employee';
import EmployeeTier from './models/EmployeeTier';
import TierHistory from './models/TierHistory';
import FrozenMonthlySummary from './models/FrozenMonthlySummary';
import { generateMonthlySummary, calculateLeaveBalance } from './automation';
import { getCycleBoundsForDate, getCycleBounds } from './cycleUtils';

// Unplanned leaves trigger sandwich policy
export const UNPLANNED_LEAVES: AttendanceStatus[] = ['LWP', 'PAID_SICK_LEAVE'];

// Scheduled off or WFH/Remote days which can be sandwiched
export const SANDWICHABLE_STATUSES: AttendanceStatus[] = ['SCHEDULE_OFF', 'WFH', 'REMOTE_COMFORT_DAY'];

/**
 * Checks if an employee has enough PSL balance for a sick leave request.
 * If balance is <= 0, returns isOverflow: true.
 */
export async function checkPSLOverflow(
  employeeId: string | mongoose.Types.ObjectId,
  date: Date,
  excludeRecordId?: string | mongoose.Types.ObjectId
): Promise<{ availableBalance: number; isOverflow: boolean }> {
  const empId = new mongoose.Types.ObjectId(employeeId);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-indexed

  // Get prior month's balance
  let priorYear = year;
  let priorMonth = month - 1;
  if (month === 0) {
    priorYear = year - 1;
    priorMonth = 11;
  }

  const priorRecord = await calculateLeaveBalance(empId, priorYear, priorMonth);

  const carriedForward = priorRecord ? priorRecord.balance : 0.0;
  const allocated = 1.0; // Rule: 1 PSL accrued monthly

  // Count existing PAID_SICK_LEAVE and HALF_DAY records in the current month
  const startDate = new Date(Date.UTC(year, month, 1));
  const endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  const query: any = {
    employeeId: empId,
    date: { $gte: startDate, $lte: endDate },
    status: { $in: ['PAID_SICK_LEAVE', 'HALF_DAY'] },
  };

  if (excludeRecordId) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeRecordId) };
  }

  const records = await Attendance.find(query);
  let pslUsed = 0;
  for (const rec of records) {
    if (rec.status === 'PAID_SICK_LEAVE') {
      pslUsed += 1.0;
    } else if (rec.status === 'HALF_DAY') {
      pslUsed += 0.5;
    }
  }
  const availableBalance = Math.max(0, carriedForward + allocated - pslUsed);

  return {
    availableBalance,
    isOverflow: availableBalance <= 0,
  };
}

/**
 * Checks if an employee is restricted from taking WFH on a given date due to a Half-Day violation.
 * Rule: Half-Day removes WFH privilege for the remainder of the same calendar week (Mon–Sun).
 * The restriction expires at end of Sunday; Monday of the next week is always unrestricted.
 */
export async function checkWFHRestriction(
  employeeId: string | mongoose.Types.ObjectId,
  date: Date
): Promise<{ isRestricted: boolean; restrictedUntil?: Date; reason?: string }> {
  const empId = new mongoose.Types.ObjectId(employeeId);
  
  // Find any active restrictions that cover the given date
  const restriction = await WFHRestriction.findOne({
    employeeId: empId,
    restrictedUntil: { $gte: date },
  }).sort({ restrictedUntil: -1 });

  if (restriction) {
    return {
      isRestricted: true,
      restrictedUntil: restriction.restrictedUntil,
      reason: restriction.reason,
    };
  }

  // Dynamic fallback: scan for HALF_DAY or PAID_SICK_LEAVE recorded within the current calendar week (Mon–Sun).
  // Using Monday-of-week as the anchor prevents last week's half-days or sick leaves from bleeding in.
  const dow = date.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  // Days since last Monday: Sun=6 back, Mon=0 back, Tue=1 back …
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const startOfWeek = new Date(date);
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - daysSinceMonday);
  startOfWeek.setUTCHours(0, 0, 0, 0);

  const endOfWindow = new Date(date);
  endOfWindow.setUTCHours(23, 59, 59, 999);

  const violationAttendance = await Attendance.findOne({
    employeeId: empId,
    date: { $gte: startOfWeek, $lte: endOfWindow },
    status: { $in: ['HALF_DAY', 'PAID_SICK_LEAVE'] },
  }).sort({ date: -1 });

  if (violationAttendance) {
    // Restriction ends at end-of-Sunday of the same calendar week as the violation (in UTC)
    // JS getDay(): 0=Sun, 1=Mon … 5=Fri, 6=Sat
    const violationDate = new Date(violationAttendance.date);
    const violationDow = violationDate.getUTCDay();
    const daysUntilSunday = violationDow === 0 ? 0 : 7 - violationDow;
    const restrictedUntil = new Date(violationDate);
    restrictedUntil.setUTCDate(restrictedUntil.getUTCDate() + daysUntilSunday);
    restrictedUntil.setUTCHours(23, 59, 59, 999);

    if (restrictedUntil >= date) {
      const typeLabel = violationAttendance.status === 'HALF_DAY' ? 'Half-Day' : 'Paid Sick Leave';
      return {
        isRestricted: true,
        restrictedUntil,
        reason: `${typeLabel} violation marked on ${new Date(violationAttendance.date).toLocaleDateString('en-IN')}`,
      };
    }
  }

  return { isRestricted: false };
}

/**
 * Self-healing Sandwich Policy Engine.
 * Scans attendance records around a changedDate and automatically triggers sandwich LWP conversions or reverts them.
 */
export async function runSandwichCheck(
  employeeId: string | mongoose.Types.ObjectId,
  changedDate: Date,
  actorUserId?: string | mongoose.Types.ObjectId
): Promise<void> {
  const empId = new mongoose.Types.ObjectId(employeeId);
  
  // We scan records using cycle bounds and an extended boundary buffer to catch leaves crossing boundaries
  const { startDate, endDate, cycleMonth, cycleYear } = getCycleBoundsForDate(changedDate);
  const queryStartDate = new Date(startDate.getTime() - 5 * 24 * 60 * 60 * 1000);
  const queryEndDate = new Date(endDate.getTime() + 5 * 24 * 60 * 60 * 1000);

  // 1. Fetch all attendance records in the extended query range
  const records = await Attendance.find({
    employeeId: empId,
    date: { $gte: queryStartDate, $lte: queryEndDate },
  }).sort({ date: 1 }).lean();

  const recordMap = new Map<string, typeof records[0]>();
  for (const rec of records) {
    const dateStr = new Date(rec.date).toISOString().split('T')[0];
    recordMap.set(dateStr, rec);
  }

  // Fetch sandwich flags to see what has been previously marked in query range
  const existingFlags = await SandwichFlag.find({
    employeeId: empId,
    date: { $gte: queryStartDate, $lte: queryEndDate },
  });

  const flagsMap = new Map<string, typeof existingFlags[0]>();
  for (const flag of existingFlags) {
    const dateStr = new Date(flag.date).toISOString().split('T')[0];
    flagsMap.set(dateStr, flag);
  }

  // 2. Scan every day of the extended range to find sandwich blocks
  const sandwichedDates = new Set<string>();

  // Build a structured days list to run scans on
  interface DayInfo {
    dayNum: number;
    dateStr: string;
    date: Date;
    status: AttendanceStatus | undefined;
    originalStatus: AttendanceStatus | undefined;
    hasFlag: boolean;
  }

  const daysList: DayInfo[] = [];
  const currentDateIter = new Date(queryStartDate);
  currentDateIter.setUTCHours(0, 0, 0, 0);
  const endCompareDate = new Date(queryEndDate);
  endCompareDate.setUTCHours(23, 59, 59, 999);

  let dayNum = 1;
  while (currentDateIter <= endCompareDate) {
    const curDate = new Date(currentDateIter);
    const currentDateStr = curDate.toISOString().split('T')[0];
    const currentRec = recordMap.get(currentDateStr);
    const flag = flagsMap.get(currentDateStr);

    daysList.push({
      dayNum: dayNum++,
      dateStr: currentDateStr,
      date: curDate,
      status: currentRec?.status as AttendanceStatus,
      originalStatus: flag ? (flag.originalStatus as AttendanceStatus) : (currentRec?.status as AttendanceStatus),
      hasFlag: !!flag,
    });

    currentDateIter.setUTCDate(currentDateIter.getUTCDate() + 1);
  }

  // --- Unified Sandwich Policy Scan (Conditions A & B) ---
  // A SandwichableBlock is a contiguous list of days with status in SANDWICHABLE_STATUSES or hasFlag
  let currentBlock: DayInfo[] = [];
  const blocks: { block: DayInfo[]; leftAnchor: DayInfo | null; rightAnchor: DayInfo | null }[] = [];

  for (let i = 0; i < daysList.length; i++) {
    const dayInfo = daysList[i];
    const isSandwichable = dayInfo.status && (SANDWICHABLE_STATUSES.includes(dayInfo.originalStatus as any) || dayInfo.hasFlag);
    if (isSandwichable) {
      currentBlock.push(dayInfo);
    } else {
      if (currentBlock.length > 0) {
        // Find left and right non-sandwichable anchors
        const leftAnchorIdx = i - currentBlock.length - 1;
        const rightAnchorIdx = i;
        const leftAnchor = leftAnchorIdx >= 0 ? daysList[leftAnchorIdx] : null;
        const rightAnchor = rightAnchorIdx < daysList.length ? daysList[rightAnchorIdx] : null;
        blocks.push({ block: currentBlock, leftAnchor, rightAnchor });
        currentBlock = [];
      }
    }
  }
  if (currentBlock.length > 0) {
    const leftAnchorIdx = daysList.length - currentBlock.length - 1;
    const leftAnchor = leftAnchorIdx >= 0 ? daysList[leftAnchorIdx] : null;
    blocks.push({ block: currentBlock, leftAnchor, rightAnchor: null });
  }

  for (const { block, leftAnchor, rightAnchor } of blocks) {
    const leftStatus = leftAnchor?.status ? (leftAnchor.originalStatus as AttendanceStatus) : null;
    const rightStatus = rightAnchor?.status ? (rightAnchor.originalStatus as AttendanceStatus) : null;

    const isLeftUnplanned = leftStatus ? UNPLANNED_LEAVES.includes(leftStatus) : false;
    const isRightUnplanned = rightStatus ? UNPLANNED_LEAVES.includes(rightStatus) : false;

    // --- Condition A: Sandwiched between unplanned leaves on both sides ---
    if (isLeftUnplanned && isRightUnplanned) {
      for (const d of block) {
        sandwichedDates.add(d.dateStr);
      }
      continue;
    }

    // --- Condition B: Revised Sandwich Policy (unplanned leave on at least one side, with both OFF and WFH in the sandwich block) ---
    const hasUnplannedNeighbor = isLeftUnplanned || isRightUnplanned;
    if (hasUnplannedNeighbor) {
      const hasOff = block.some((d) => d.originalStatus === 'SCHEDULE_OFF');
      const hasWFH = block.some((d) => d.originalStatus === 'WFH' || d.originalStatus === 'REMOTE_COMFORT_DAY');

      if (hasOff && hasWFH) {
        for (const d of block) {
          if (d.originalStatus === 'SCHEDULE_OFF' || d.originalStatus === 'WFH' || d.originalStatus === 'REMOTE_COMFORT_DAY') {
            sandwichedDates.add(d.dateStr);
          }
        }
      }
    }
  }

  // 3. Apply conversions for newly sandwiched dates (only if strictly inside the active cycle)
  for (const dateStr of sandwichedDates) {
    const currentRec = recordMap.get(dateStr);
    if (!currentRec) continue;

    const flagDate = new Date(currentRec.date);
    if (flagDate < queryStartDate || flagDate > queryEndDate) continue;

    const flag = flagsMap.get(dateStr);
    if (flag) {
      // If it has a sandwich flag, check if it was manually overridden
      if (flag.isOverridden) {
        // Overridden: do not change status back to original if overridden/edited
        continue;
      }
      // If not overridden and status is currently 'LWP' (from old sandwich system),
      // restore it to original status so that it displays correctly on the grid.
      if (currentRec.status === 'LWP' && flag.originalStatus !== 'LWP') {
        await Attendance.updateOne(
          { _id: currentRec._id },
          {
            $set: { status: flag.originalStatus as any, notes: '[Sandwich Policy] Displaying original status on grid' },
            $push: {
              history: {
                status: flag.originalStatus as any,
                updatedBy: actorUserId || currentRec.markedBy,
                updatedAt: new Date(),
                notes: '[Sandwich Policy] Restored original status to display on grid while counting as LWP',
              },
            },
          }
        );
      }
    } else {
      // No flag yet: create flag, create compliance alert (keep original status intact on attendance grid)
      const originalStatus = currentRec.status;
      const flagDate = new Date(currentRec.date);

      await SandwichFlag.create({
        employeeId: empId,
        date: flagDate,
        originalStatus,
        isOverridden: false,
      });

      await ComplianceAlert.create({
        employeeId: empId,
        type: 'SANDWICH',
        date: flagDate,
        message: `Sandwich policy violation detected on ${flagDate.toLocaleDateString('en-IN')} (Original: ${originalStatus}). Counted as LWP.`,
      }).catch(() => {}); // prevent duplicate key error if alert exists
    }
  }

  // 4. Self-healing: Revert dates that are NO LONGER sandwiched (only if strictly inside the active cycle)
  for (const [dateStr, flag] of flagsMap.entries()) {
    const flagDate = new Date(flag.date);
    if (flagDate < queryStartDate || flagDate > queryEndDate) continue;

    if (!sandwichedDates.has(dateStr)) {
      // It was flagged as sandwich, but is no longer sandwiched!
      if (!flag.isOverridden) {
        const currentRec = recordMap.get(dateStr);
        if (currentRec && currentRec.status === 'LWP') {
          // Revert back to original status
          const originalStatus = flag.originalStatus;
          await Attendance.updateOne(
            { _id: currentRec._id },
            {
              $set: { status: originalStatus as any, notes: '[Sandwich Policy] Reverted to original status (Sandwich broken)' },
              $push: {
                history: {
                  status: originalStatus as any,
                  updatedBy: actorUserId || currentRec.markedBy,
                  updatedAt: new Date(),
                  notes: '[Sandwich Policy] Reverted to original status (Sandwich broken)',
                },
              },
            }
          );
        }
      }

      // Delete flag and compliance alert
      await SandwichFlag.deleteOne({ _id: flag._id });
      await ComplianceAlert.deleteOne({
        employeeId: empId,
        type: 'SANDWICH',
        date: flag.date,
      });
    }
  }

  // Recalculate employee summary & balance for the custom cycle
  await generateMonthlySummary(empId, cycleYear, cycleMonth - 1);
  await calculateLeaveBalance(empId, cycleYear, cycleMonth - 1);
}

/**
 * Self-healing WFH Restriction & Compliance Alert Engine for a single employee and date.
 * Automatically synchronizes WFHRestrictions and ComplianceAlerts for the calendar week of the changedDate.
 */
export async function runWFHRestrictionCheck(
  employeeId: string | mongoose.Types.ObjectId,
  changedDate: Date
): Promise<void> {
  const empId = new mongoose.Types.ObjectId(employeeId);
  
  // Determine calendar week boundaries (Monday to Sunday) for changedDate in UTC
  const date = new Date(changedDate);
  const dow = date.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const startOfWeek = new Date(date);
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - daysSinceMonday);
  startOfWeek.setUTCHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 6);
  endOfWeek.setUTCHours(23, 59, 59, 999);

  // Fetch all HALF_DAY and PAID_SICK_LEAVE records for this employee in the calendar week
  const violations = await Attendance.find({
    employeeId: empId,
    date: { $gte: startOfWeek, $lte: endOfWeek },
    status: { $in: ['HALF_DAY', 'PAID_SICK_LEAVE'] },
  }).sort({ date: 1 });

  // Compute expected Sunday restriction timestamp
  const expectedSunday = new Date(endOfWeek);

  // Fetch existing WFH restrictions and alerts in this calendar week
  const existingRestrictions = await WFHRestriction.find({
    employeeId: empId,
    restrictedUntil: expectedSunday,
  });

  const existingAlerts = await ComplianceAlert.find({
    employeeId: empId,
    type: 'HALF_DAY_VIOLATION',
    date: { $gte: startOfWeek, $lte: endOfWeek },
  });

  if (violations.length > 0) {
    // 1. Ensure WFHRestriction exists
    if (existingRestrictions.length === 0) {
      const firstViolation = violations[0];
      const typeLabel = firstViolation.status === 'HALF_DAY' ? 'Half-Day' : 'Paid Sick Leave';
      const triggerDateStr = new Date(firstViolation.date).toLocaleDateString('en-IN');
      await WFHRestriction.create({
        employeeId: empId,
        restrictedUntil: expectedSunday,
        reason: `${typeLabel} marked on ${triggerDateStr}`,
      });
    }

    // 2. Ensure ComplianceAlerts exist for all violation records in this week
    for (const v of violations) {
      const vDate = new Date(v.date);
      const exists = existingAlerts.some((a) => a.date.getTime() === vDate.getTime());
      if (!exists) {
        const triggerDateStr = vDate.toLocaleDateString('en-IN');
        const restrictedUntilStr = expectedSunday.toLocaleDateString('en-IN');
        const typeLabel = v.status === 'HALF_DAY' ? 'Half-day' : 'Paid Sick Leave';
        await ComplianceAlert.create({
          employeeId: empId,
          type: 'HALF_DAY_VIOLATION',
          date: vDate,
          message: `${typeLabel} violation marked on ${triggerDateStr}. WFH privilege locked until ${restrictedUntilStr}.`,
        }).catch(() => {});
      }
    }

    // 3. Clean up stale alerts for days that are no longer HALF_DAY or PAID_SICK_LEAVE but in the same week
    for (const a of existingAlerts) {
      const alertDate = new Date(a.date);
      const stillExists = violations.some((v) => new Date(v.date).getTime() === alertDate.getTime());
      if (!stillExists) {
        await ComplianceAlert.deleteOne({ _id: a._id });
      }
    }
  } else {
    // No violations in this calendar week! Clean up restriction and all alerts in this week.
    await WFHRestriction.deleteMany({
      employeeId: empId,
      restrictedUntil: expectedSunday,
    });

    await ComplianceAlert.deleteMany({
      employeeId: empId,
      type: 'HALF_DAY_VIOLATION',
      date: { $gte: startOfWeek, $lte: endOfWeek },
    });
  }
}

/**
 * Fully integrated re-scan rules engine.
 * Loops through all active employees, recalculates monthly summaries and PSL balances
 * for both previous and current months, runs sandwich auto-healing, and dynamically
 * reconciles WFH restrictions & compliance alerts for HALF_DAY records.
 */
export async function reScanAllComplianceRules(
  actorUserId?: string | mongoose.Types.ObjectId
): Promise<void> {
  const employees = await Employee.find({ isActive: true });

  const now = new Date();
  
  // Get current cycle bounds and metadata
  const currentCycle = getCycleBoundsForDate(now);
  
  // Calculate previous cycle metadata
  let prevCycleMonth = currentCycle.cycleMonth - 1;
  let prevCycleYear = currentCycle.cycleYear;
  if (prevCycleMonth === 0) {
    prevCycleMonth = 12;
    prevCycleYear--;
  }
  const prevCycle = getCycleBounds(prevCycleYear, prevCycleMonth);

  const startRange = prevCycle.startDate;
  const endRange = currentCycle.endDate;

  for (const emp of employees) {
    const empId = emp._id;

    // 1. Run sandwich checks for previous and current cycles
    // Note: runSandwichCheck also internally calls generateMonthlySummary and calculateLeaveBalance,
    // which guarantees that summaries, PSL balances, and sandwich flags are calculated/synchronized.
    await runSandwichCheck(empId, startRange, actorUserId);
    await runSandwichCheck(empId, endRange, actorUserId);

    // 2. Re-calculate monthly summaries and leave balances for previous and current cycles (just to be absolutely safe)
    await generateMonthlySummary(empId, prevCycleYear, prevCycleMonth - 1);
    await calculateLeaveBalance(empId, prevCycleYear, prevCycleMonth - 1);
    await generateMonthlySummary(empId, currentCycle.cycleYear, currentCycle.cycleMonth - 1);
    await calculateLeaveBalance(empId, currentCycle.cycleYear, currentCycle.cycleMonth - 1);

    // 3. WFH Restrictions & Compliance Alerts reconciliation for HALF_DAY & PAID_SICK_LEAVE records
    // Get all actual HALF_DAY and PAID_SICK_LEAVE records in the date range
    const violations = await Attendance.find({
      employeeId: empId,
      date: { $gte: startRange, $lte: endRange },
      status: { $in: ['HALF_DAY', 'PAID_SICK_LEAVE'] },
    }).sort({ date: 1 });

    // Map violation records to their corresponding week's Sunday (restrictedUntil)
    const expectedRestrictions = new Map<string, { restrictedUntil: Date; triggerDate: Date; triggerStatus: string }>();
    for (const v of violations) {
      const vDate = new Date(v.date);
      const dow = vDate.getUTCDay();
      const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
      const restrictedUntil = new Date(vDate);
      restrictedUntil.setUTCDate(restrictedUntil.getUTCDate() + daysUntilSunday);
      restrictedUntil.setUTCHours(23, 59, 59, 999);

      const restrictedUntilKey = restrictedUntil.toISOString();
      if (!expectedRestrictions.has(restrictedUntilKey)) {
        expectedRestrictions.set(restrictedUntilKey, {
          restrictedUntil,
          triggerDate: vDate,
          triggerStatus: v.status,
        });
      }
    }

    // Fetch existing WFH restrictions in the range
    const existingRestrictions = await WFHRestriction.find({
      employeeId: empId,
      restrictedUntil: { $gte: startRange, $lte: endRange },
    });

    // Fetch existing HALF_DAY_VIOLATION compliance alerts in the range
    const existingAlerts = await ComplianceAlert.find({
      employeeId: empId,
      type: 'HALF_DAY_VIOLATION',
      date: { $gte: startRange, $lte: endRange },
    });

    // A. Ensure all expected WFH restrictions exist
    for (const [key, val] of expectedRestrictions.entries()) {
      const exists = existingRestrictions.some(
        (r) => r.restrictedUntil.getTime() === val.restrictedUntil.getTime()
      );
      if (!exists) {
        const typeLabel = val.triggerStatus === 'HALF_DAY' ? 'Half-Day' : 'Paid Sick Leave';
        const triggerDateStr = val.triggerDate.toLocaleDateString('en-IN');
        await WFHRestriction.create({
          employeeId: empId,
          restrictedUntil: val.restrictedUntil,
          reason: `${typeLabel} marked on ${triggerDateStr}`,
        });
      }
    }

    // B. Ensure all expected ComplianceAlerts exist
    for (const v of violations) {
      const vDate = new Date(v.date);
      const exists = existingAlerts.some((a) => a.date.getTime() === vDate.getTime());
      if (!exists) {
        const dow = vDate.getUTCDay();
        const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
        const restrictedUntil = new Date(vDate);
        restrictedUntil.setUTCDate(restrictedUntil.getUTCDate() + daysUntilSunday);
        restrictedUntil.setUTCHours(23, 59, 59, 999);

        const triggerDateStr = vDate.toLocaleDateString('en-IN');
        const restrictedUntilStr = restrictedUntil.toLocaleDateString('en-IN');
        const typeLabel = v.status === 'HALF_DAY' ? 'Half-day' : 'Paid Sick Leave';

        await ComplianceAlert.create({
          employeeId: empId,
          type: 'HALF_DAY_VIOLATION',
          date: vDate,
          message: `${typeLabel} violation marked on ${triggerDateStr}. WFH privilege locked until ${restrictedUntilStr}.`,
        }).catch(() => {});
      }
    }

    // C. Clean up stale WFHRestrictions
    for (const r of existingRestrictions) {
      const key = r.restrictedUntil.toISOString();
      if (!expectedRestrictions.has(key)) {
        await WFHRestriction.deleteOne({ _id: r._id });
      }
    }

    // D. Clean up stale ComplianceAlerts
    for (const a of existingAlerts) {
      const alertDate = new Date(a.date);
      const stillExists = violations.some((v) => new Date(v.date).getTime() === alertDate.getTime());
      if (!stillExists) {
        await ComplianceAlert.deleteOne({ _id: a._id });
      }
    }
  }
}

/**
 * Evaluates the Monthly Roster Tier rules for an employee based on counts of PSL, Half-Days, and LWP.
 * 
 * Rules:
 * Tier 1:
 * - 0 PSL, 0 Half-Day, 0 LWP
 * 
 * Tier 2:
 * - Total absence equivalent of up to 1.0 day (where 1 PSL = 1.0 day, and 1 Half-Day = 0.5 day)
 * 
 * Tier 3:
 * - Any LWP (>0), or Total absence equivalent exceeds 1.0 day (e.g. 1 PSL + 1 Half-Day, or 3 Half-Days)
 */
export function evaluateTierRules(pslCount: number, halfDayCount: number, lwpCount: number): {
  tier: number;
  reason: string;
} {
  if (lwpCount > 0) {
    return {
      tier: 3,
      reason: `Triggered by Leave Without Pay (${lwpCount} LWP days)`
    };
  }

  const absenceWeight = pslCount + (halfDayCount * 0.5);

  if (absenceWeight > 1.0) {
    return {
      tier: 3,
      reason: `Triggered by exceeding 1 PSL absence equivalent (${pslCount} PSL, ${halfDayCount} Half-Days, total equivalent: ${absenceWeight} days)`
    };
  }

  if (absenceWeight > 0) {
    return {
      tier: 2,
      reason: `Satisfactory Attendance within 1 PSL equivalent: ${pslCount} PSL, ${halfDayCount} Half-Days (total equivalent: ${absenceWeight} days)`
    };
  }

  // Perfect attendance (0 PSL, 0 Half-Day, 0 LWP)
  return {
    tier: 1,
    reason: `Perfect Attendance: 0 PSL, 0 Half-Days, 0 LWP`
  };
}

/**
 * Runs the Monthly Roster Tier calculation for a single employee,
 * using the FrozenMonthlySummary as the source of truth, and updates Employee & History.
 */
export async function runTierCalculationForEmployee(
  employeeId: string | mongoose.Types.ObjectId,
  year: number,
  month: number,
  forceReRun: boolean = false,
  operatorId: string = 'SYSTEM'
) {
  const empId = new mongoose.Types.ObjectId(employeeId);

  // 1. Check if frozen summary already exists
  let frozenSummary = await FrozenMonthlySummary.findOne({ employeeId: empId, year, month }).lean();

  if (frozenSummary && !forceReRun) {
    // Already calculated and frozen, fetch existing EmployeeTier to return
    const existingTier = await EmployeeTier.findOne({ employeeId: empId, year, month }).lean();
    if (existingTier) {
      return {
        ...existingTier,
        isAlreadyFrozen: true,
        summary: frozenSummary
      };
    }
  }

  // 2. Fetch or dynamically generate active summary if not frozen
  let pslCount = 0;
  let halfDayCount = 0;
  let lwpCount = 0;
  let presentCount = 0;
  let wfhCount = 0;
  let offDayCount = 0;
  let totalWorkingDays = 0;
  let attendanceRate = 0;
  let isFallback = false;

  const activeSummary = await generateMonthlySummary(empId, year, month);

  if (activeSummary) {
    pslCount = activeSummary.pslCount;
    halfDayCount = activeSummary.halfDayCount;
    lwpCount = activeSummary.lwpCount;
    presentCount = activeSummary.presentCount;
    wfhCount = activeSummary.wfhCount;
    offDayCount = activeSummary.offDayCount;
    totalWorkingDays = activeSummary.totalWorkingDays;
    attendanceRate = activeSummary.attendanceRate;
  } else {
    isFallback = true;
  }

  // 3. Upsert FrozenMonthlySummary
  const frozen = await FrozenMonthlySummary.findOneAndUpdate(
    { employeeId: empId, year, month },
    {
      employeeId: empId,
      year,
      month,
      presentCount,
      pslCount,
      halfDayCount,
      wfhCount,
      lwpCount,
      offDayCount,
      totalWorkingDays,
      attendanceRate,
      frozenAt: new Date(),
      frozenBy: operatorId,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // 4. Evaluate Tier Rules
  const evaluation = evaluateTierRules(pslCount, halfDayCount, lwpCount);

  // 5. Upsert EmployeeTier
  const empTier = await EmployeeTier.findOneAndUpdate(
    { employeeId: empId, year, month },
    {
      employeeId: empId,
      year,
      month,
      tier: evaluation.tier,
      reason: evaluation.reason,
      isFallback,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // 6. Log to TierHistory
  await TierHistory.create({
    employeeId: empId,
    year,
    month,
    tier: evaluation.tier,
    reason: evaluation.reason,
    isFallback,
    calculatedAt: new Date(),
    calculatedBy: operatorId,
  });

  // 7. Update current roster tier on Employee model
  await Employee.findByIdAndUpdate(empId, {
    currentRosterTier: evaluation.tier,
  });

  return {
    ...empTier.toObject(),
    isAlreadyFrozen: false,
    summary: frozen
  };
}

