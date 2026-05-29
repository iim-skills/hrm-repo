import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import Employee from '@/lib/models/Employee';
import WFHRestriction from '@/lib/models/WFHRestriction';
import { generateMonthlySummary, calculateLeaveBalance } from '@/lib/automation';
import { runSandwichCheck } from '@/lib/policyEngines';
import { getCycleBoundsForDate } from '@/lib/cycleUtils';

// POST /api/automation/run - trigger scheduled maintenance automation
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || (authUser.role !== 'hr' && authUser.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized: HR or Admin access required' }, { status: 403 });
    }

    await dbConnect();

    const body = await request.json().catch(() => ({}));
    const { action } = body;

    const today = new Date();
    const currentCycle = getCycleBoundsForDate(today);
    const currentYear = currentCycle.cycleYear;
    const currentMonth = currentCycle.cycleMonth - 1; // 0-indexed

    // 1. Action: run-all or run-balances
    // Triggers recalculation/allocation of PSL balances and monthly aggregates for all active employees
    const employees = await Employee.find({ isActive: true }).lean();
    let processedCount = 0;

    for (const emp of employees) {
      // Recalculate summary & balance
      await generateMonthlySummary(emp._id, currentYear, currentMonth);
      await calculateLeaveBalance(emp._id, currentYear, currentMonth);

      // Perform a general sandwich check scan for today's context
      await runSandwichCheck(emp._id, today, authUser.userId);

      processedCount++;
    }

    // 2. Action: cleanup-restrictions
    // Deletes WFH restrictions that are past their restrictedUntil timestamp
    const deleteResult = await WFHRestriction.deleteMany({
      restrictedUntil: { $lt: new Date() }
    });

    return NextResponse.json({
      success: true,
      message: 'Automation execution completed successfully.',
      details: {
        employeesProcessed: processedCount,
        expiredRestrictionsCleared: deleteResult.deletedCount,
        targetMonth: currentMonth + 1,
        targetYear: currentYear
      }
    });
  } catch (error) {
    console.error('Automation POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
