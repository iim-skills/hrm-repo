import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import MonthlyAttendanceSummary from '@/lib/models/MonthlyAttendanceSummary';
import LeaveBalance from '@/lib/models/LeaveBalance';
import Employee from '@/lib/models/Employee';
import WFHRestriction from '@/lib/models/WFHRestriction';
import SandwichFlag from '@/lib/models/SandwichFlag';
import { generateMonthlySummary, calculateLeaveBalance } from '@/lib/automation';
import { getCycleBounds, getCycleBoundsForDate } from '@/lib/cycleUtils';

// GET /api/attendance/summary — Fetch monthly summary + leave balance for employee
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const today = new Date();

    let year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : today.getFullYear();
    let month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : today.getMonth();

    let targetEmployeeId = searchParams.get('employeeId');

    // Security check: Employees can only view their own summary
    if (authUser.role === 'employee') {
      targetEmployeeId = authUser.employeeId?.toString() || '';
    } else if (authUser.role === 'manager') {
      // Manager can view queried employee only if it's themselves OR their direct report
      if (!targetEmployeeId) {
        targetEmployeeId = authUser.employeeId?.toString() || '';
      } else if (targetEmployeeId !== authUser.employeeId?.toString()) {
        const isReport = await Employee.findOne({ _id: targetEmployeeId, managerId: authUser.userId });
        if (!isReport) {
          return NextResponse.json({ error: 'Unauthorized: Managers can only view their own or direct report summaries.' }, { status: 403 });
        }
      }
    } else {
      // Admin and HR can view queried employee
      if (!targetEmployeeId) {
        targetEmployeeId = authUser.employeeId?.toString() || '';
      }
    }

    if (!targetEmployeeId || !mongoose.Types.ObjectId.isValid(targetEmployeeId)) {
      return NextResponse.json({ error: 'Invalid or missing employeeId' }, { status: 400 });
    }

    if (isNaN(year) || isNaN(month) || month < 0 || month > 11) {
      return NextResponse.json({ error: 'Invalid year or month parameters' }, { status: 400 });
    }

    // Limit queries to May 2026 onwards
    if (year < 2026) year = 2026;
    if (year === 2026 && month < 4) {
      month = 4; // May (0-indexed)
    }

    // Clamp future months to the current cycle
    const currentCycle = getCycleBoundsForDate(new Date());
    if (year > currentCycle.cycleYear || (year === currentCycle.cycleYear && month > currentCycle.cycleMonth - 1)) {
      year = currentCycle.cycleYear;
      month = currentCycle.cycleMonth - 1;
    }

    const empObjId = new mongoose.Types.ObjectId(targetEmployeeId);

    // Always generate summary and calculate leave balance dynamically to prevent stale data
    const summary = await generateMonthlySummary(empObjId, year, month);
    const balance = await calculateLeaveBalance(empObjId, year, month, true);

    // Fetch active WFH restrictions covering the current date
    const wfhRestriction = await WFHRestriction.findOne({
      employeeId: empObjId,
      restrictedUntil: { $gte: new Date() },
      isOverridden: { $ne: true }
    }).lean();

    // Fetch sandwich flags for the selected cycle
    const { startDate, endDate } = getCycleBounds(year, month + 1);
    const sandwichFlags = await SandwichFlag.find({
      employeeId: empObjId,
      date: { $gte: startDate, $lte: endDate },
      isOverridden: false
    }).lean();

    return NextResponse.json({
      success: true,
      employeeId: targetEmployeeId,
      year,
      month,
      summary,
      balance,
      sandwichFlags: sandwichFlags.map(sf => sf.date.toISOString()),
      wfhRestriction: wfhRestriction ? {
        restrictedUntil: wfhRestriction.restrictedUntil,
        reason: wfhRestriction.reason
      } : null
    });
  } catch (error) {
    console.error('Fetch monthly summary error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
