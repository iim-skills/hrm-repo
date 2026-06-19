import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Attendance from '@/lib/models/Attendance';
import Employee from '@/lib/models/Employee';
import User from '@/lib/models/User';
import { getAuthUser } from '@/lib/auth';
import { checkPSLOverflow, checkWFHRestriction, runSandwichCheck, runWFHRestrictionCheck, runTierCalculationForEmployee } from '@/lib/policyEngines';
import WFHRestriction from '@/lib/models/WFHRestriction';
import ComplianceAlert from '@/lib/models/ComplianceAlert';
import LeaveBalance from '@/lib/models/LeaveBalance';
import SandwichFlag from '@/lib/models/SandwichFlag';
import PSLExclusion from '@/lib/models/PSLExclusion';
import { generateMonthlySummary, calculateLeaveBalance } from '@/lib/automation';
import { toCycleKey, getCycleBounds, getCycleBoundsForDate } from '@/lib/cycleUtils';

// GET /api/attendance — fetch attendance records for a date range
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search') || '';
    const department = searchParams.get('department') || '';
    const employeeIdParam = searchParams.get('employeeId');
    const managerIdParam = searchParams.get('managerId');

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    // Build employee query based on role
    const empQuery: Record<string, unknown> = { isActive: true, role: { $ne: 'admin' } };

    if (authUser.role === 'employee') {
      // Employee can only view their own attendance
      empQuery._id = authUser.employeeId;
    } else if (authUser.role === 'manager') {
      if (employeeIdParam) {
        const isSelf = authUser.employeeId && authUser.employeeId.toString() === employeeIdParam;
        if (isSelf) {
          empQuery._id = new mongoose.Types.ObjectId(employeeIdParam);
        } else {
          empQuery._id = new mongoose.Types.ObjectId(employeeIdParam);
          empQuery.managerId = authUser.userId;
        }
      } else {
        empQuery.$or = [
          { managerId: authUser.userId },
          { _id: authUser.employeeId }
        ];
      }
    } else {
      // Admin and HR see everything — no filter unless employeeId or managerId specified
      if (employeeIdParam) {
        empQuery._id = new mongoose.Types.ObjectId(employeeIdParam);
      }
      if (managerIdParam) {
        const mgrUser = await User.findById(managerIdParam).lean();
        if (mgrUser && mgrUser.employeeId) {
          empQuery.$or = [
            { managerId: new mongoose.Types.ObjectId(managerIdParam) },
            { _id: mgrUser.employeeId }
          ];
        } else {
          empQuery.managerId = new mongoose.Types.ObjectId(managerIdParam);
        }
      }
    }

    if (search) {
      empQuery.name = { $regex: search, $options: 'i' };
    }

    if (department) {
      empQuery.department = department;
    }

    // Fetch employees
    const employees = await Employee.find(empQuery).sort({ name: 1 }).lean();
    const employeeIds = employees.map((e) => e._id);

    // Fetch attendance records for date range with populated markedBy and history.updatedBy
    const attendanceRecords = await Attendance.find({
      employeeId: { $in: employeeIds },
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    })
    .populate({
      path: 'markedBy',
      populate: {
        path: 'employeeId',
        select: 'name'
      }
    })
    .populate({
      path: 'history.updatedBy',
      populate: {
        path: 'employeeId',
        select: 'name'
      },
      options: { strictPopulate: false }
    })
    .lean();

    const attendance = attendanceRecords.map((att: any) => {
      let markedByName = 'System Seed';
      if (att.markedBy && typeof att.markedBy === 'object') {
        const markedByUser = att.markedBy;
        if (markedByUser.employeeId && typeof markedByUser.employeeId === 'object' && markedByUser.employeeId.name) {
          markedByName = markedByUser.employeeId.name;
        } else if (markedByUser.email) {
          markedByName = markedByUser.email;
        }
      }

      const history = (att.history || []).map((hist: any) => {
        let updatedByName = 'System Seed';
        if (hist.updatedBy && typeof hist.updatedBy === 'object') {
          const updatedByUser = hist.updatedBy;
          if (updatedByUser.employeeId && typeof updatedByUser.employeeId === 'object' && updatedByUser.employeeId.name) {
            updatedByName = updatedByUser.employeeId.name;
          } else if (updatedByUser.email) {
            updatedByName = updatedByUser.email;
          }
        }
        return {
          status: hist.status,
          updatedBy: hist.updatedBy?._id?.toString() || hist.updatedBy?.toString() || '',
          updatedByName,
          updatedAt: hist.updatedAt ? new Date(hist.updatedAt).toISOString() : new Date().toISOString(),
          notes: hist.notes || '',
        };
      });

      return {
        ...att,
        markedBy: markedByName,
        history,
      };
    });

    // Get departments for filter
    const departments = await Employee.distinct('department', { isActive: true });

    const startObj = new Date(startDate);
    const endObj = new Date(endDate);

    // Fetch all WFH restrictions for the fetched employees that are active during or after this week's start
    const wfhRestrictions = await WFHRestriction.find({
      employeeId: { $in: employeeIds },
      restrictedUntil: { $gte: startObj },
      isOverridden: { $ne: true }
    }).lean();

    // Fetch all PAID_SICK_LEAVE, REMOTE_COMFORT_DAY, and HALF_DAY records for the fetched employees in the cycles containing startDate and endDate
    const startCycle = getCycleBoundsForDate(startObj);
    const endCycle = getCycleBoundsForDate(endObj);
    const firstMonthStart = startCycle.startDate;
    const lastMonthEnd = endCycle.endDate;

    const monthlyRecords = await Attendance.find({
      employeeId: { $in: employeeIds },
      status: { $in: ['PAID_SICK_LEAVE', 'REMOTE_COMFORT_DAY', 'HALF_DAY', 'EARLY_LEAVE'] },
      date: { $gte: firstMonthStart, $lte: lastMonthEnd }
    }).lean();

    // Map: employeeId -> cycle key -> count
    const pslMonthlyCounts: Record<string, Record<string, number>> = {};
    const rcdMonthlyCounts: Record<string, Record<string, number>> = {};
    const elMonthlyCounts: Record<string, Record<string, number>> = {};
    const rcdDates: Record<string, string[]> = {};
    for (const record of monthlyRecords) {
      const empId = record.employeeId.toString();
      const rDate = new Date(record.date);
      const yearMonthKey = toCycleKey(rDate);
      
      if (record.status === 'PAID_SICK_LEAVE') {
        if (!pslMonthlyCounts[empId]) {
          pslMonthlyCounts[empId] = {};
        }
        if (!pslMonthlyCounts[empId][yearMonthKey]) {
          pslMonthlyCounts[empId][yearMonthKey] = 0;
        }
        pslMonthlyCounts[empId][yearMonthKey]++;
      } else if (record.status === 'REMOTE_COMFORT_DAY') {
        if (!rcdMonthlyCounts[empId]) {
          rcdMonthlyCounts[empId] = {};
        }
        if (!rcdMonthlyCounts[empId][yearMonthKey]) {
          rcdMonthlyCounts[empId][yearMonthKey] = 0;
        }
        rcdMonthlyCounts[empId][yearMonthKey]++;
        if (!rcdDates[empId]) rcdDates[empId] = [];
        rcdDates[empId].push(rDate.toISOString().split('T')[0]);
      } else if (record.status === 'EARLY_LEAVE') {
        if (!elMonthlyCounts[empId]) {
          elMonthlyCounts[empId] = {};
        }
        if (!elMonthlyCounts[empId][yearMonthKey]) {
          elMonthlyCounts[empId][yearMonthKey] = 0;
        }
        elMonthlyCounts[empId][yearMonthKey]++;
      }
    }

    // Fetch unique cycles covered by startObj and endObj
    const uniqueMonths: { year: number; month: number }[] = [];
    let currYear = startCycle.cycleYear;
    let currMonth = startCycle.cycleMonth - 1; // 0-indexed cycle month index
    const endYear = endCycle.cycleYear;
    const endMonth = endCycle.cycleMonth - 1;

    while (currYear < endYear || (currYear === endYear && currMonth <= endMonth)) {
      uniqueMonths.push({ year: currYear, month: currMonth });
      currMonth++;
      if (currMonth > 11) {
        currMonth = 0;
        currYear++;
      }
    }

    // Pre-fetch prior months we need balances for
    const priorMonths = uniqueMonths.map(({ year, month }) => {
      let py = year;
      let pm = month - 1;
      if (month === 0) {
        py = year - 1;
        pm = 11;
      }
      return { year: py, month: pm };
    });

    // Query all balances in the range in a single query!
    const priorAndCurrentBalances = await LeaveBalance.find({
      employeeId: { $in: employeeIds },
      $or: [...priorMonths, ...uniqueMonths].map(({ year, month }) => ({ year, month }))
    }).lean();

    // Map: employeeId -> year-month -> balance details
    const balanceDetailsMap: Record<string, Record<string, { balance: number; allocated: number }>> = {};
    for (const bal of priorAndCurrentBalances) {
      const empId = bal.employeeId.toString();
      const key = `${bal.year}-${bal.month}`;
      if (!balanceDetailsMap[empId]) balanceDetailsMap[empId] = {};
      balanceDetailsMap[empId][key] = {
        balance: bal.balance,
        allocated: bal.allocated !== undefined ? bal.allocated : 1.0
      };
    }

    // Query active exclusions for displayed employees
    const exclusions = await PSLExclusion.find({ employeeId: { $in: employeeIds } }).lean();
    const excludedSet = new Set(exclusions.map(ex => ex.employeeId.toString()));

    // Map: employeeId -> year-month -> pslUsed in that custom cycle
    const pslUsedMap: Record<string, Record<string, number>> = {};
    for (const record of monthlyRecords) {
      const empId = record.employeeId.toString();
      const rDate = new Date(record.date);
      const { cycleMonth, cycleYear } = getCycleBoundsForDate(rDate);
      const key = `${cycleYear}-${cycleMonth - 1}`;

      let weight = 0;
      if (record.status === 'PAID_SICK_LEAVE') {
        weight = 1.0;
      } else if (record.status === 'HALF_DAY') {
        weight = 0.5;
      }

      if (weight > 0) {
        if (!pslUsedMap[empId]) pslUsedMap[empId] = {};
        if (!pslUsedMap[empId][key]) pslUsedMap[empId][key] = 0;
        pslUsedMap[empId][key] += weight;
      }
    }

    // Map: employeeId -> cycleKey -> availableBalance
    const pslBalances: Record<string, Record<string, number>> = {};
    const pslTotalBalances: Record<string, Record<string, number>> = {};
    for (const emp of employees) {
      const empId = emp._id.toString();
      pslBalances[empId] = {};
      pslTotalBalances[empId] = {};
      for (const { year, month } of uniqueMonths) {
        const yearMonthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

        let priorYear = year;
        let priorMonth = month - 1;
        if (month === 0) {
          priorYear = year - 1;
          priorMonth = 11;
        }
        const priorKey = `${priorYear}-${priorMonth}`;

        // Get prior month balance from pre-fetched map, with dynamic database fallback just in case
        let carriedForward = 0.0;
        if (balanceDetailsMap[empId]?.[priorKey] !== undefined) {
          carriedForward = balanceDetailsMap[empId][priorKey].balance;
        } else {
          const priorRecord = await calculateLeaveBalance(emp._id, priorYear, priorMonth);
          carriedForward = priorRecord ? priorRecord.balance : 0.0;
        }

        // Determine if this is a past month (before the current calendar month)
        const now = new Date();
        const currentYear = now.getUTCFullYear();
        const currentMonth = now.getUTCMonth(); // 0-indexed
        const isPastMonth = year < currentYear || (year === currentYear && month < currentMonth);

        let allocated = 1.0;
        if (isPastMonth) {
          if (balanceDetailsMap[empId]?.[`${year}-${month}`] !== undefined) {
            allocated = balanceDetailsMap[empId][`${year}-${month}`].allocated;
          }
        } else {
          allocated = excludedSet.has(empId) ? 0.0 : 1.0;
        }

        const pslUsedKey = `${year}-${month}`;
        const pslUsed = pslUsedMap[empId]?.[pslUsedKey] || 0.0;
        const availableBalance = Math.max(0, carriedForward + allocated - pslUsed);
        pslBalances[empId][yearMonthKey] = availableBalance;
        pslTotalBalances[empId][yearMonthKey] = carriedForward + allocated;
      }
    }

    // Fetch active non-overridden sandwich flags in the date range
    const sandwichFlags = await SandwichFlag.find({
      employeeId: { $in: employeeIds },
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
      isOverridden: false
    }).lean();

    return NextResponse.json({
      employees,
      attendance,
      departments,
      wfhRestrictions,
      pslMonthlyCounts,
      rcdMonthlyCounts,
      elMonthlyCounts,
      pslBalances,
      pslTotalBalances,
      sandwichFlags,
      rcdDates
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper: check if a date is in the current month
function isCurrentMonth(date: Date): boolean {
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

// Helper: check if a date is today
function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

// Helper: check if a date is within last 7 days
function isWithin7Days(date: Date): boolean {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000;
}

// POST /api/attendance — mark attendance (single or bulk)
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (authUser.role === 'employee') {
      return NextResponse.json({ error: 'Employees cannot mark attendance' }, { status: 403 });
    }

    if (authUser.role !== 'admin' && authUser.role !== 'hr') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await dbConnect();

    const body = await request.json();
    const { records } = body as {
      records: Array<{
        employeeId: string;
        date: string;
        status: string;
        notes?: string;
      }>;
    };

    if (!records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'Records array is required' }, { status: 400 });
    }

    const validStatuses = [
      'PRESENT', 'PAID_SICK_LEAVE', 'WFH', 'REMOTE_COMFORT_DAY',
      'HALF_DAY', 'SCHEDULE_OFF', 'LWP', 'LATE', 'EARLY_LEAVE', 'PLANNED_LEAVE',
      'RESTRICTED_HOLIDAY',
    ];

    // Validate all records
    for (const record of records) {
      if (!record.employeeId || !record.date || !record.status) {
        return NextResponse.json({ error: 'Each record must have employeeId, date, and status' }, { status: 400 });
      }
      if (!validStatuses.includes(record.status)) {
        return NextResponse.json({ error: `Invalid status: ${record.status}` }, { status: 400 });
      }
    }

    // Time-based restrictions per role
    for (const record of records) {
      const attendanceDate = new Date(record.date);
      attendanceDate.setHours(0, 0, 0, 0);

      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);

      const isFuture = attendanceDate > todayDate;

      if (isFuture) {
        // If date is in the future, only 'SCHEDULE_OFF' can be marked
        if (record.status !== 'SCHEDULE_OFF') {
          return NextResponse.json({
            error: `Only 'Off Day' (SCHEDULE_OFF) attendance can be marked for future dates. Date ${record.date} status was ${record.status}.`
          }, { status: 400 });
        }
        // Future date off days are allowed for admin and hr roles
        if (authUser.role !== 'admin' && authUser.role !== 'hr') {
          return NextResponse.json({
            error: 'You do not have permission to mark future attendance.'
          }, { status: 403 });
        }
        continue; // Bypasses the past-day timeframe boundaries below
      }

      if (authUser.role === 'admin') {
        // Admin: can edit attendance for current cycle only, not previous cycles
        // TEMPORARILY DISABLED:
        /*
        if (toCycleKey(attendanceDate) !== toCycleKey(new Date())) {
          return NextResponse.json({
            error: `Admin can only mark attendance for the current cycle. Date ${record.date} is outside the current cycle.`
          }, { status: 403 });
        }
        */
      } else if (authUser.role === 'hr') {
        // HR: 7-day time limit
        // TEMPORARILY DISABLED:
        /*
        if (!isWithin7Days(attendanceDate)) {
          return NextResponse.json({
            error: `HR can only mark/edit attendance within 7 days. Date ${record.date} is outside the 7-day window.`
          }, { status: 403 });
        }
        */
      }
    }



    const employeeIds = [...new Set(records.map((r) => r.employeeId))];
    const dbEmployees = await Employee.find({ _id: { $in: employeeIds } }).lean();
    const employeeMap = new Map(dbEmployees.map((e) => [e._id.toString(), e]));

    // Map dates being marked in the current batch per employee to support bulk uploads
    const batchMarkedDatesByEmp = new Map<string, Set<string>>();
    for (const record of records) {
      const empIdStr = record.employeeId.toString();
      if (!batchMarkedDatesByEmp.has(empIdStr)) {
        batchMarkedDatesByEmp.set(empIdStr, new Set<string>());
      }
      const attendanceDate = new Date(record.date);
      attendanceDate.setUTCHours(0, 0, 0, 0);
      batchMarkedDatesByEmp.get(empIdStr)!.add(attendanceDate.toISOString().split('T')[0]);
    }

    // Sequential marking check for HR role
    if (authUser.role === 'hr') {
      for (const record of records) {
        const emp = employeeMap.get(record.employeeId);
        if (!emp) {
          return NextResponse.json({ error: `Employee not found: ${record.employeeId}` }, { status: 404 });
        }

        const attendanceDate = new Date(record.date);
        attendanceDate.setUTCHours(0, 0, 0, 0);

        const { startDate, endDate } = getCycleBoundsForDate(attendanceDate);

        // Bypass check 1: Exclude employee's first cycle containing their joiningDate
        let isFirstCycle = false;
        if (emp.joiningDate) {
          const jd = new Date(emp.joiningDate);
          if (jd >= startDate && jd <= endDate) {
            isFirstCycle = true;
          }
        }

        if (isFirstCycle) {
          continue;
        }

        // Bypass check 2: Exclude editing/updating already marked records
        const existingRecord = await Attendance.findOne({
          employeeId: record.employeeId,
          date: attendanceDate,
        }).lean();

        if (existingRecord) {
          continue;
        }

        // Sequential check for new records
        const expectedCount = Math.round((attendanceDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
        if (expectedCount > 0) {
          const actualCount = await Attendance.countDocuments({
            employeeId: record.employeeId,
            date: { $gte: startDate, $lt: attendanceDate }
          });

          if (actualCount < expectedCount) {
            // Find which prior days in the cycle are unmarked
            const markedRecords = await Attendance.find({
              employeeId: record.employeeId,
              date: { $gte: startDate, $lt: attendanceDate }
            }, { date: 1 }).lean();
            const markedSet = new Set(markedRecords.map(r => r.date.toISOString().split('T')[0]));

            const unmarkedDays: string[] = [];
            let checkDate = new Date(startDate);
            const empBatchSet = batchMarkedDatesByEmp.get(record.employeeId.toString()) || new Set<string>();

            while (checkDate < attendanceDate) {
              const key = checkDate.toISOString().split('T')[0];
              if (!markedSet.has(key) && !empBatchSet.has(key)) {
                unmarkedDays.push(key);
              }
              checkDate.setUTCDate(checkDate.getUTCDate() + 1);
            }

            if (unmarkedDays.length > 0) {
              return NextResponse.json({
                error: `Cannot mark attendance for ${emp.name} on ${record.date.split('T')[0]}. Please mark earlier attendance first.`
              }, { status: 400 });
            }
          }
        }
      }
    }

    // WFH vs Half-Day/PSL conflict validation: Block Half-Day/PSL if WFH has already been taken in the same calendar week
    for (const record of records) {
      if (record.status === 'HALF_DAY' || record.status === 'PAID_SICK_LEAVE') {
        const emp = employeeMap.get(record.employeeId);
        if (!emp) {
          return NextResponse.json({ error: `Employee not found: ${record.employeeId}` }, { status: 404 });
        }

        const attendanceDate = new Date(record.date);
        attendanceDate.setUTCHours(0, 0, 0, 0);

        // Determine calendar week boundaries (Monday to Sunday) for the date in UTC
        const dow = attendanceDate.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
        const daysSinceMonday = dow === 0 ? 6 : dow - 1;
        const startOfWeek = new Date(attendanceDate);
        startOfWeek.setUTCDate(startOfWeek.getUTCDate() - daysSinceMonday);
        startOfWeek.setUTCHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 6);
        endOfWeek.setUTCHours(23, 59, 59, 999);

        // Find existing WFH records in DB in this calendar week
        const existingWfh = await Attendance.find({
          employeeId: record.employeeId,
          date: { $gte: startOfWeek, $lte: endOfWeek },
          status: 'WFH'
        }).lean();

        // Check the current request batch for WFH updates for this employee
        const empIdStr = record.employeeId.toString();
        const batchWfhDates = new Set<string>();
        const batchNonWfhDates = new Set<string>();

        for (const r of records) {
          if (r.employeeId.toString() === empIdStr) {
            const rDate = new Date(r.date);
            rDate.setUTCHours(0, 0, 0, 0);
            const rDateStr = rDate.toISOString().split('T')[0];
            if (r.status === 'WFH') {
              batchWfhDates.add(rDateStr);
            } else {
              batchNonWfhDates.add(rDateStr);
            }
          }
        }

        let hasActiveWfh = false;
        for (const w of existingWfh) {
          const wDateStr = new Date(w.date).toISOString().split('T')[0];
          if (!batchNonWfhDates.has(wDateStr)) {
            hasActiveWfh = true;
            break;
          }
        }

        if (!hasActiveWfh) {
          for (const wDateStr of batchWfhDates) {
            const wDate = new Date(wDateStr);
            if (wDate >= startOfWeek && wDate <= endOfWeek) {
              hasActiveWfh = true;
              break;
            }
          }
        }

        if (hasActiveWfh) {
          const typeLabel = record.status === 'HALF_DAY' ? 'Half-Day' : 'Sick Leave';
          return NextResponse.json({
            error: `Cannot mark ${typeLabel} for ${emp.name} on ${record.date.split('T')[0]}. WFH has already been taken in this calendar week.`
          }, { status: 400 });
        }
      }
    }

    // Upsert attendance records (prevents duplicates)
    const results = [];
    const errors = [];

    for (const record of records) {
      try {
        const attendanceDate = new Date(record.date);
        attendanceDate.setUTCHours(0, 0, 0, 0);

        const existing = await Attendance.findOne({
          employeeId: record.employeeId,
          date: attendanceDate,
        });

        let finalStatus = record.status;
        let policyNote = '';

        // 1. PSL Overflow logic
        if (record.status === 'PAID_SICK_LEAVE') {
          const overflowCheck = await checkPSLOverflow(record.employeeId, attendanceDate, existing?._id);
          if (overflowCheck.isOverflow) {
            finalStatus = 'LWP';
            policyNote = '[Auto PSL Overflow] Converted to LWP due to 0 PSL balance.';
          }
        }

        // 1.5 RCD Limit & Gender check (1 RCD allowed per calendar month, only for female employees)
        if (record.status === 'REMOTE_COMFORT_DAY') {
          const emp = employeeMap.get(record.employeeId);
          if (emp?.genderFlag !== 'female') {
            finalStatus = 'LWP';
            policyNote = '[Auto RCD Restriction] Converted to LWP. Remote Comfort Day is only allowed for female employees.';
          } else {
            const { startDate: startOfMonth, endDate: endOfMonth } = getCycleBoundsForDate(attendanceDate);
            
            const rcdQuery: any = {
              employeeId: new mongoose.Types.ObjectId(record.employeeId),
              status: 'REMOTE_COMFORT_DAY',
              date: { $gte: startOfMonth, $lte: endOfMonth },
            };
            if (existing?._id) {
              rcdQuery._id = { $ne: new mongoose.Types.ObjectId(existing._id) };
            }
            const rcdCount = await Attendance.countDocuments(rcdQuery);
            if (rcdCount >= 1) {
              finalStatus = 'LWP';
              policyNote = '[Auto RCD Overflow] Converted to LWP due to 1 RCD limit reached for the month.';
            }
          }
        }

        // 1.75 Early Leave Limit check (1 Early Leave allowed per calendar month)
        if (record.status === 'EARLY_LEAVE') {
          const { startDate: startOfMonth, endDate: endOfMonth } = getCycleBoundsForDate(attendanceDate);
          
          const elQuery: any = {
            employeeId: new mongoose.Types.ObjectId(record.employeeId),
            status: 'EARLY_LEAVE',
            date: { $gte: startOfMonth, $lte: endOfMonth },
          };
          if (existing?._id) {
            elQuery._id = { $ne: new mongoose.Types.ObjectId(existing._id) };
          }
          const elCount = await Attendance.countDocuments(elQuery);
          if (elCount >= 1) {
            finalStatus = 'LWP';
            policyNote = '[Auto Early Leave Overflow] Converted to LWP due to 1 Early Leave limit reached for the month.';
          }
        }

        // 2. WFH Restriction check
        if (record.status === 'WFH') {
          const wfhCheck = await checkWFHRestriction(record.employeeId, attendanceDate);
          if (wfhCheck.isRestricted) {
            finalStatus = 'LWP';
            policyNote = `[Locked WFH Privilege] Converted to LWP. ${wfhCheck.reason || 'WFH restricted due to previous violations.'}`;
          }
        }

        const historyEntry = {
          status: finalStatus as any,
          updatedBy: new mongoose.Types.ObjectId(authUser.userId) as any,
          updatedAt: new Date(),
          notes: ((record.notes || '') + (policyNote ? ` ${policyNote}` : '')).trim(),
        };

        let result;
        if (existing) {
          existing.status = finalStatus as any;
          existing.markedBy = new mongoose.Types.ObjectId(authUser.userId) as any;
          existing.notes = ((record.notes || '') + (policyNote ? ` ${policyNote}` : '')).trim();
          if (!existing.history) existing.history = [];
          existing.history.push(historyEntry as any);
          result = await existing.save();
        } else {
          result = await Attendance.create({
            employeeId: record.employeeId,
            date: attendanceDate,
            status: finalStatus as any,
            markedBy: new mongoose.Types.ObjectId(authUser.userId) as any,
            notes: ((record.notes || '') + (policyNote ? ` ${policyNote}` : '')).trim(),
            history: [historyEntry],
          });
        }

        // 3. WFH Restriction and Compliance Alert self-healing check (creates or clears locks in real-time)
        await runWFHRestrictionCheck(record.employeeId, attendanceDate);

        // 4. Sandwich policy scan (heals/applies dynamically, handles summaries + balance calculations too!)
        await runSandwichCheck(record.employeeId, attendanceDate, authUser.userId);

        // 5. Automatic live Roster Tier calculation update in real-time
        const { cycleMonth, cycleYear } = getCycleBoundsForDate(attendanceDate);
        await runTierCalculationForEmployee(
          record.employeeId,
          cycleYear,
          cycleMonth - 1, // 0-indexed month
          true, // forceReRun to compute real-time
          authUser.userId
        );

        results.push(result);
      } catch (err) {
        errors.push({
          employeeId: record.employeeId,
          date: record.date,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      created: results.length,
      errors: errors.length > 0 ? errors : undefined,
    }, { status: errors.length > 0 ? 207 : 200 });
  } catch (error) {
    console.error('Mark attendance error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
