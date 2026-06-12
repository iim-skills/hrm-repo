import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import Employee from '@/lib/models/Employee';
import LeaveBalance from '@/lib/models/LeaveBalance';
import { recalculateForward } from '@/lib/automation';

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || (authUser.role !== 'hr' && authUser.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized: HR or Admin access required' }, { status: 403 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = parseInt(searchParams.get('year') || String(now.getUTCFullYear()), 10);
    const month = parseInt(searchParams.get('month') || String(now.getUTCMonth()), 10);

    // Fetch all active employees
    const employees = await Employee.find({ isActive: true }).sort({ name: 1 }).lean();

    // Fetch existing leave balances for this year and month
    const balances = await LeaveBalance.find({ year, month }).lean();
    const balanceMap = new Map(balances.map(b => [b.employeeId.toString(), b]));

    const data = employees.map(emp => {
      const existing = balanceMap.get(emp._id.toString());
      return {
        employeeId: emp._id,
        name: emp.name,
        email: emp.email,
        department: emp.department,
        carriedForward: existing !== undefined && existing.carriedForward !== undefined ? existing.carriedForward : 1.0,
        isCarriedForwardManual: existing?.isCarriedForwardManual || false,
        currentBalance: existing?.balance ?? null
      };
    });

    return NextResponse.json({
      success: true,
      year,
      month,
      employees: data
    });
  } catch (error) {
    console.error('Leave Carry Forward GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || (authUser.role !== 'hr' && authUser.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized: HR or Admin access required' }, { status: 403 });
    }

    await dbConnect();

    const body = await request.json();
    const { year, month, updates } = body;

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: 'Updates must be an array' }, { status: 400 });
    }

    console.log(`Manually setting carry-forward PSL for month=${month}, year=${year}...`);

    const updatePromises = updates.map(async (update) => {
      const { employeeId, carriedForward } = update;
      const parsedVal = parseFloat(carriedForward);
      if (isNaN(parsedVal)) return;

      // Skip recalculation if value is already manually set to the same value
      const existing = await LeaveBalance.findOne({ employeeId, year, month }).lean();
      if (existing && existing.carriedForward === parsedVal && existing.isCarriedForwardManual) {
        return;
      }

      // Find or create a temporary skeleton LeaveBalance so calculateLeaveBalance can see the manual override
      await LeaveBalance.findOneAndUpdate(
        { employeeId, year, month },
        {
          $set: {
            carriedForward: parsedVal,
            isCarriedForwardManual: true
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Trigger recalculation forward to propagate balance changes
      await recalculateForward(employeeId, year, month);
    });

    await Promise.all(updatePromises);

    return NextResponse.json({
      success: true,
      message: 'All carry forward PSL values successfully updated and propagated.'
    });
  } catch (error) {
    console.error('Leave Carry Forward POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
