import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import ComplianceAlert from '@/lib/models/ComplianceAlert';
import SandwichFlag from '@/lib/models/SandwichFlag';
import WFHRestriction from '@/lib/models/WFHRestriction';
import Attendance from '@/lib/models/Attendance';
import Employee from '@/lib/models/Employee';
import User from '@/lib/models/User';
import { generateMonthlySummary, calculateLeaveBalance } from '@/lib/automation';
import { reScanAllComplianceRules, runTierCalculationForEmployee } from '@/lib/policyEngines';
import { getCycleBoundsForDate } from '@/lib/cycleUtils';

// GET /api/compliance - fetch alerts, sandwich conversions, restrictions, and risk list
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || (authUser.role !== 'hr' && authUser.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized: HR or Admin access required' }, { status: 403 });
    }

    await dbConnect();

    // Check for rescan trigger
    const { searchParams } = new URL(request.url);
    const rescan = searchParams.get('rescan') === 'true';
    if (rescan) {
      await reScanAllComplianceRules(authUser.userId);
    }

    // Fetch alerts
    const alerts = await ComplianceAlert.find({})
      .populate('employeeId', 'name department')
      .sort({ createdAt: -1 })
      .lean();

    // Fetch sandwich flags
    const sandwichFlags = await SandwichFlag.find({})
      .populate('employeeId', 'name department')
      .populate('overriddenBy', 'email')
      .sort({ date: -1 })
      .lean();

    // Fetch WFH restrictions
    const wfhRestrictions = await WFHRestriction.find({
      restrictedUntil: { $gte: new Date() }
    })
      .populate('employeeId', 'name department')
      .populate('overriddenBy', 'email')
      .sort({ restrictedUntil: 1 })
      .lean();

    // Dynamically calculate employees "at risk"
    // At risk means: employees with sandwich flags, active WFH restrictions, or LWP > 2 in the current month
    const activeRestrictionsEmployeeIds = wfhRestrictions.filter(r => !r.isOverridden).map(r => r.employeeId?._id || r.employeeId);
    const activeSandwichEmployeeIds = sandwichFlags.filter(f => !f.isOverridden).map(f => f.employeeId?._id || f.employeeId);

    // Get all employees
    const allEmployees = await Employee.find({ isActive: true }).lean();
    const atRiskList = [];

    // Check attendance for current cycle LWP count
    const now = new Date();
    const { startDate: startOfMonth } = getCycleBoundsForDate(now);
    
    for (const emp of allEmployees) {
      const rawLwpCount = await Attendance.countDocuments({
        employeeId: emp._id,
        date: { $gte: startOfMonth },
        status: 'LWP'
      });

      const activeSandwichCount = await SandwichFlag.countDocuments({
        employeeId: emp._id,
        date: { $gte: startOfMonth },
        isOverridden: false
      });

      const lwpCount = rawLwpCount + activeSandwichCount;

      const isRestricted = activeRestrictionsEmployeeIds.some(id => id.toString() === emp._id.toString());
      const hasSandwich = activeSandwichEmployeeIds.some(id => id.toString() === emp._id.toString());

      if (lwpCount > 1 || isRestricted || hasSandwich) {
        atRiskList.push({
          _id: emp._id,
          name: emp.name,
          department: emp.department,
          lwpCount,
          isRestricted,
          hasSandwich,
          riskLevel: lwpCount > 3 || (isRestricted && hasSandwich) ? 'HIGH' : 'MEDIUM'
        });
      }
    }

    return NextResponse.json({
      success: true,
      alerts,
      sandwichFlags,
      wfhRestrictions,
      atRiskEmployees: atRiskList
    });
  } catch (error) {
    console.error('Compliance GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/compliance - override a sandwich policy penalty
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || (authUser.role !== 'hr' && authUser.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized: HR or Admin access required' }, { status: 403 });
    }

    await dbConnect();

    const body = await request.json();
    const { sandwichFlagId, overrideReason } = body;

    if (!sandwichFlagId || !overrideReason) {
      return NextResponse.json({ error: 'sandwichFlagId and overrideReason are required' }, { status: 400 });
    }

    const flag = await SandwichFlag.findById(sandwichFlagId);
    if (!flag) {
      return NextResponse.json({ error: 'Sandwich flag not found' }, { status: 404 });
    }

    if (flag.isOverridden) {
      return NextResponse.json({ error: 'Sandwich flag is already overridden' }, { status: 400 });
    }

    const dbUser = await User.findById(authUser.userId).lean();
    const userEmail = dbUser?.email || 'Admin/HR';

    // 1. Update the SandwichFlag document
    flag.isOverridden = true;
    flag.overrideReason = overrideReason;
    flag.overriddenBy = new mongoose.Types.ObjectId(authUser.userId) as any;
    await flag.save();

    // 2. Revert the Attendance record back to its original status
    const attendanceDate = new Date(flag.date);
    attendanceDate.setUTCHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      employeeId: flag.employeeId,
      date: attendanceDate
    });

    if (attendance) {
      const originalStatus = flag.originalStatus;
      attendance.status = originalStatus as any;
      attendance.notes = `[Overridden by ${userEmail}] Reason: ${overrideReason}`;
      if (!attendance.history) attendance.history = [];
      attendance.history.push({
        status: originalStatus as any,
        updatedBy: new mongoose.Types.ObjectId(authUser.userId) as any,
        updatedAt: new Date(),
        notes: `Sandwich penalty overridden by Admin/HR. Reverted to ${originalStatus}. Reason: ${overrideReason}`
      });
      await attendance.save();
    }

    // 3. Delete the ComplianceAlert associated with this sandwich violation
    await ComplianceAlert.deleteOne({
      employeeId: flag.employeeId,
      type: 'SANDWICH',
      date: flag.date
    });

    // 4. Recalculate monthly aggregates and balances for the custom cycle
    const { cycleMonth, cycleYear } = getCycleBoundsForDate(attendanceDate);
    await generateMonthlySummary(flag.employeeId, cycleYear, cycleMonth - 1);
    await calculateLeaveBalance(flag.employeeId, cycleYear, cycleMonth - 1);

    // 5. Automatic live Roster Tier calculation update in real-time
    await runTierCalculationForEmployee(
      flag.employeeId,
      cycleYear,
      cycleMonth - 1, // 0-indexed month
      true, // forceReRun to compute real-time
      authUser.userId
    );

    return NextResponse.json({
      success: true,
      message: 'Sandwich policy penalty successfully overridden.',
      flag
    });
  } catch (error) {
    console.error('Compliance POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
