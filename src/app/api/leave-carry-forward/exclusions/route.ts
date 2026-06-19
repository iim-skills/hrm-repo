import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import Employee from '@/lib/models/Employee';
import PSLExclusion from '@/lib/models/PSLExclusion';
import { recalculateForward } from '@/lib/automation';

// GET /api/leave-carry-forward/exclusions
// Returns all active employees and their current excludeFromPSL status by querying PSLExclusion
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== 'hr') {
      return NextResponse.json({ error: 'Unauthorized: HR access required' }, { status: 403 });
    }

    await dbConnect();

    // Fetch all active employees
    const employees = await Employee.find({ isActive: true }).sort({ name: 1 }).lean();

    // Fetch all exclusions
    const exclusions = await PSLExclusion.find().lean();
    const excludedIds = new Set(exclusions.map(ex => ex.employeeId.toString()));

    const data = employees.map(emp => ({
      employeeId: emp._id.toString(),
      name: emp.name,
      email: emp.email,
      department: emp.department,
      excludeFromPSL: excludedIds.has(emp._id.toString())
    }));

    return NextResponse.json({
      success: true,
      employees: data
    });
  } catch (error) {
    console.error('Exclusions GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/leave-carry-forward/exclusions
// Updates excludeFromPSL status (adding/removing from PSLExclusion) and triggers forward propagation
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== 'hr') {
      return NextResponse.json({ error: 'Unauthorized: HR access required' }, { status: 403 });
    }

    await dbConnect();

    const body = await request.json();
    const { updates } = body;

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: 'Updates must be an array' }, { status: 400 });
    }

    console.log(`Updating PSL accrual exclusions in separate collection...`);

    // Get current exclusions
    const existingExclusions = await PSLExclusion.find().lean();
    const currentlyExcluded = new Set(existingExclusions.map(x => x.employeeId.toString()));

    const updatePromises = updates.map(async (update) => {
      const { employeeId, excludeFromPSL } = update;
      const nextExclude = !!excludeFromPSL;
      const prevExclude = currentlyExcluded.has(employeeId);

      if (prevExclude === nextExclude) return; // No change, skip

      if (nextExclude) {
        // Exclude: Add to collection
        await PSLExclusion.findOneAndUpdate(
          { employeeId },
          { employeeId },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else {
        // Include: Remove from collection
        await PSLExclusion.deleteOne({ employeeId });
      }

      // Recalculate forward starting from the current month going forward
      const now = new Date();
      const currentYear = now.getUTCFullYear();
      const currentMonth = now.getUTCMonth();
      
      console.log(`Triggering forward recalculation for employee=${employeeId} from year=${currentYear}, month=${currentMonth} due to exclusion toggle...`);
      await recalculateForward(employeeId, currentYear, currentMonth);
    });

    await Promise.all(updatePromises);

    return NextResponse.json({
      success: true,
      message: 'PSL exclusion settings successfully updated and propagated.'
    });
  } catch (error) {
    console.error('Exclusions POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
