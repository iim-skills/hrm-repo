import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import MonthlyAttendanceSummary from '@/lib/models/MonthlyAttendanceSummary';
import LeaveBalance from '@/lib/models/LeaveBalance';
import Employee from '@/lib/models/Employee';
import WFHRestriction from '@/lib/models/WFHRestriction';
import { generateMonthlySummary, calculateLeaveBalance } from '@/lib/automation';

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

    // Limit queries to April 2026 onwards
    if (year < 2026 || (year === 2026 && month < 3)) {
      year = 2026;
      month = 3; // April (0-indexed)
    }

    const empObjId = new mongoose.Types.ObjectId(targetEmployeeId);

    // Always generate summary and calculate leave balance dynamically to prevent stale data
    const summary = await generateMonthlySummary(empObjId, year, month);
    const balance = await calculateLeaveBalance(empObjId, year, month);

    // Fetch active WFH restrictions covering the current date
    const wfhRestriction = await WFHRestriction.findOne({
      employeeId: empObjId,
      restrictedUntil: { $gte: new Date() }
    }).lean();

    return NextResponse.json({
      success: true,
      employeeId: targetEmployeeId,
      year,
      month,
      summary,
      balance,
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
