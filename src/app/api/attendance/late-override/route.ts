import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import LateOverrideRequest from '@/lib/models/LateOverrideRequest';
import Attendance from '@/lib/models/Attendance';
import { getAuthUser } from '@/lib/auth';

// GET: Fetch requests
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await dbConnect();

    const url = new URL(request.url);
    const queryEmployeeId = url.searchParams.get('employeeId');
    const status = url.searchParams.get('status');
    const query: any = {};

    if (status) query.status = status;

    if (queryEmployeeId) {
      if (authUser.role === 'employee' && queryEmployeeId !== authUser.employeeId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
      query.employeeId = queryEmployeeId;
    } else {
      if (authUser.role === 'employee' || authUser.role === 'manager') {
        query.employeeId = authUser.employeeId;
      }
    }

    const requests = await LateOverrideRequest.find(query)
      .sort({ createdAt: -1 })
      .populate('employeeId', 'name email department')
      .populate('resolvedBy', 'email role')
      .lean();

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Fetch Late Override Requests error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Employee creates a new request
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { date, reason, employeeId } = await request.json();
    if (!date || !reason) {
      return NextResponse.json({ error: 'Date and reason are required' }, { status: 400 });
    }

    let targetEmployeeId = authUser.employeeId;
    if (employeeId && employeeId !== authUser.employeeId) {
      if (authUser.role === 'employee') {
        return NextResponse.json({ error: 'Unauthorized to request override for another user' }, { status: 403 });
      }
      targetEmployeeId = employeeId;
    }

    await dbConnect();
    const dateObj = new Date(date);
    dateObj.setUTCHours(0, 0, 0, 0);

    // Verify the attendance is indeed LATE
    const attendance = await Attendance.findOne({
      employeeId: targetEmployeeId,
      date: dateObj,
    });

    if (!attendance || attendance.status !== 'LATE') {
      return NextResponse.json({ error: 'Can only request override for LATE attendance' }, { status: 400 });
    }

    // Check if a request already exists
    const existing = await LateOverrideRequest.findOne({
      employeeId: targetEmployeeId,
      date: dateObj,
    });

    if (existing) {
      return NextResponse.json({ error: 'A request already exists for this date' }, { status: 400 });
    }

    const newRequest = await LateOverrideRequest.create({
      employeeId: targetEmployeeId,
      date: dateObj,
      reason,
      status: 'PENDING',
    });

    return NextResponse.json({ success: true, request: newRequest });
  } catch (error) {
    console.error('Create Late Override Request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT: Admin/HR resolves a request
export async function PUT(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (authUser.role !== 'admin' && authUser.role !== 'hr') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { requestId, status } = await request.json();
    if (!requestId || !['APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    await dbConnect();

    const overrideReq = await LateOverrideRequest.findById(requestId);
    if (!overrideReq) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    
    if (overrideReq.status !== 'PENDING') {
      return NextResponse.json({ error: 'Request is already resolved' }, { status: 400 });
    }

    overrideReq.status = status;
    overrideReq.resolvedBy = authUser.userId as any;
    overrideReq.resolvedAt = new Date();
    await overrideReq.save();

    // If approved, update attendance to PRESENT
    if (status === 'APPROVED') {
      await Attendance.findOneAndUpdate(
        {
          employeeId: overrideReq.employeeId,
          date: overrideReq.date,
        },
        {
          status: 'PRESENT',
          $push: {
            history: {
              status: 'PRESENT',
              updatedBy: authUser.userId,
              notes: 'Late override approved',
            }
          }
        }
      );
    }

    return NextResponse.json({ success: true, request: overrideReq });
  } catch (error) {
    console.error('Resolve Late Override Request error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
