import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import Employee from '@/lib/models/Employee';
import EmployeeTier from '@/lib/models/EmployeeTier';
import TierHistory from '@/lib/models/TierHistory';
import FrozenMonthlySummary from '@/lib/models/FrozenMonthlySummary';
import { runTierCalculationForEmployee } from '@/lib/policyEngines';
import { getCycleBoundsForDate } from '@/lib/cycleUtils';

// GET /api/automation/tiers - Fetch tier information (history, stats, or listings)
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const history = searchParams.get('history') === 'true';
    const stats = searchParams.get('stats') === 'true';
    const force = searchParams.get('force') === 'true';
    
    const today = new Date();
    const currentCycle = getCycleBoundsForDate(today);
    let year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : currentCycle.cycleYear;
    let month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : currentCycle.cycleMonth - 1;

    if (isNaN(year) || isNaN(month) || month < 0 || month > 11) {
      return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 });
    }

    // 1. Return 6-Month History for Employee/HR
    if (history) {
      let targetEmployeeId = searchParams.get('employeeId');
      
      if (authUser.role === 'employee') {
        targetEmployeeId = authUser.employeeId?.toString() || '';
      } else if (authUser.role === 'manager') {
        if (!targetEmployeeId) {
          targetEmployeeId = authUser.employeeId?.toString() || '';
        } else if (targetEmployeeId !== authUser.employeeId?.toString()) {
          // Check if employee reports to this manager
          const isReport = await Employee.findOne({ _id: targetEmployeeId, managerId: authUser.userId });
          if (!isReport) {
            return NextResponse.json({ error: 'Unauthorized: Managers can only view their own or direct report histories.' }, { status: 403 });
          }
        }
      } else {
        if (!targetEmployeeId) {
          targetEmployeeId = authUser.employeeId?.toString() || '';
        }
      }

      if (!targetEmployeeId || !mongoose.Types.ObjectId.isValid(targetEmployeeId)) {
        return NextResponse.json({ error: 'Invalid or missing employeeId' }, { status: 400 });
      }

      // Fetch last 6 months of tier history
      const historyRecords = await EmployeeTier.find({
        employeeId: new mongoose.Types.ObjectId(targetEmployeeId),
      })
        .sort({ year: -1, month: -1 })
        .limit(6)
        .lean();

      return NextResponse.json({ success: true, history: historyRecords });
    }

    // 2. Return Aggregate Statistics for HR Dashboard
    if (stats) {
      if (authUser.role !== 'hr' && authUser.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized: HR or Admin access required' }, { status: 403 });
      }

      // Group current employee tiers by tier level
      const tierCounts = await EmployeeTier.aggregate([
        { $match: { year, month } },
        { $group: { _id: '$tier', count: { $sum: 1 } } }
      ]);

      const distribution = {
        tier1: 0,
        tier2: 0,
        tier3: 0,
        total: 0
      };

      for (const group of tierCounts) {
        if (group._id === 1) distribution.tier1 = group.count;
        if (group._id === 2) distribution.tier2 = group.count;
        if (group._id === 3) distribution.tier3 = group.count;
      }
      distribution.total = distribution.tier1 + distribution.tier2 + distribution.tier3;

      // Fallback: If no calculations run yet, use currentRosterTier on active employees
      if (distribution.total === 0) {
        const empTiers = await Employee.aggregate([
          { $match: { isActive: true } },
          { $group: { _id: '$currentRosterTier', count: { $sum: 1 } } }
        ]);
        for (const grp of empTiers) {
          const tierVal = grp._id || 1;
          if (tierVal === 1) distribution.tier1 = grp.count;
          if (tierVal === 2) distribution.tier2 = grp.count;
          if (tierVal === 3) distribution.tier3 = grp.count;
        }
        distribution.total = distribution.tier1 + distribution.tier2 + distribution.tier3;
      }

      return NextResponse.json({ success: true, stats: distribution });
    }

    // 3. Return Listings of Roster Tiers
    if (authUser.role !== 'hr' && authUser.role !== 'admin' && authUser.role !== 'manager') {
      return NextResponse.json({ error: 'Unauthorized: HR, Admin or Manager access required' }, { status: 403 });
    }

    // Fetch active employees including managerId (Role-scoped query for managers)
    let employees;
    if (authUser.role === 'manager') {
      employees = await Employee.find({
        isActive: true,
        $or: [
          { managerId: authUser.userId },
          { _id: authUser.employeeId }
        ]
      }).select('name email department currentRosterTier managerId').lean();
    } else {
      employees = await Employee.find({ isActive: true }).select('name email department currentRosterTier managerId').lean();
    }
    
    // Fetch already calculated tiers and summaries for selected month to avoid redundant heavy writes
    let calculatedTiers = await EmployeeTier.find({ year, month }).lean();
    let frozenSummaries = await FrozenMonthlySummary.find({ year, month }).lean();

    const tierMap = new Map(calculatedTiers.map(t => [t.employeeId.toString(), t]));
    const summaryMap = new Map(frozenSummaries.map(s => [s.employeeId.toString(), s]));

    // Automatically calculate/refresh tiers for either missing employees or all employees if forced
    const operatorId = authUser.userId || 'SYSTEM';

    if (force) {
      for (const emp of employees) {
        try {
          await runTierCalculationForEmployee(emp._id, year, month, true, operatorId);
        } catch (err) {
          console.error(`Error forcing tier calculation for employee ${emp.name}:`, err);
        }
      }

      // Re-fetch calculations to include the newly calculated tiers and summaries
      calculatedTiers = await EmployeeTier.find({ year, month }).lean();
      frozenSummaries = await FrozenMonthlySummary.find({ year, month }).lean();

      tierMap.clear();
      calculatedTiers.forEach(t => tierMap.set(t.employeeId.toString(), t));

      summaryMap.clear();
      frozenSummaries.forEach(s => summaryMap.set(s.employeeId.toString(), s));
    } else {
      const missingEmployees = employees.filter(emp => !tierMap.has(emp._id.toString()));

      if (missingEmployees.length > 0) {
        for (const emp of missingEmployees) {
          try {
            await runTierCalculationForEmployee(emp._id, year, month, false, operatorId);
          } catch (err) {
            console.error(`Error auto-calculating tier for missing employee ${emp.name}:`, err);
          }
        }

        // Re-fetch calculations to include the newly calculated missing tiers and summaries
        calculatedTiers = await EmployeeTier.find({ year, month }).lean();
        frozenSummaries = await FrozenMonthlySummary.find({ year, month }).lean();

        tierMap.clear();
        calculatedTiers.forEach(t => tierMap.set(t.employeeId.toString(), t));

        summaryMap.clear();
        frozenSummaries.forEach(s => summaryMap.set(s.employeeId.toString(), s));
      }
    }

    const listings = employees.map(emp => {
      const empIdStr = emp._id.toString();
      const calcTier = tierMap.get(empIdStr);
      const frozenSum = summaryMap.get(empIdStr);

      return {
        employee: emp,
        calculatedTier: calcTier ? calcTier.tier : null,
        reason: calcTier ? calcTier.reason : 'No tier calculated yet',
        isFallback: calcTier ? calcTier.isFallback : false,
        frozenSummary: frozenSum || null,
        updatedAt: calcTier ? calcTier.updatedAt : null,
      };
    });

    return NextResponse.json({
      success: true,
      listings,
      year,
      month
    });

  } catch (error) {
    console.error('Tiers GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
