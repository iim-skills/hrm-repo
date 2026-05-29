import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Employee from '@/lib/models/Employee';
import User from '@/lib/models/User';
import { getAuthUser } from '@/lib/auth';

// GET /api/employees/[id] — get single employee
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await dbConnect();
    const { id } = await params;

    const employee = await Employee.findById(id).lean();
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Role-based access check
    if (authUser.role === 'employee' && employee._id.toString() !== authUser.employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (authUser.role === 'manager' && employee.managerId?.toString() !== authUser.userId) {
      // Manager can also view their own profile
      if (employee._id.toString() !== authUser.employeeId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    return NextResponse.json({ employee });
  } catch (error) {
    console.error('Get employee error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/employees/[id] — update employee (HR only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (authUser.role !== 'admin' && authUser.role !== 'hr' && authUser.role !== 'manager') {
      return NextResponse.json({ error: 'Unauthorized: Admin, HR or Manager access required' }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;

    const body = await request.json();
    const { name, email, department, genderFlag, joiningDate, currentRosterTier, managerId, role, isActive } = body;

    const employee = await Employee.findById(id);
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Secure check for manager edits
    if (authUser.role === 'manager') {
      const isSelf = authUser.employeeId && authUser.employeeId.toString() === id;
      const isTeam = employee.managerId && employee.managerId.toString() === authUser.userId;
      if (!isSelf && !isTeam) {
        return NextResponse.json({ error: 'Unauthorized: You can only edit your own profile or your team members' }, { status: 403 });
      }
    }

    // Check for duplicate email (exclude current)
    if (email) {
      const duplicate = await Employee.findOne({
        _id: { $ne: id },
        email: email.toLowerCase(),
      });

      if (duplicate) {
        return NextResponse.json({ error: 'Employee with this email already exists' }, { status: 409 });
      }
    }

    // Update employee
    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      {
        ...(name && { name }),
        ...(email && { email: email.toLowerCase() }),
        ...(department && { department }),
        ...(genderFlag && { genderFlag }),
        ...(joiningDate && { joiningDate: new Date(joiningDate) }),
        ...(currentRosterTier && { currentRosterTier }),
        ...(managerId !== undefined && { managerId: managerId || null }),
        ...(role && { role }),
        ...(isActive !== undefined && { isActive }),
      },
      { new: true }
    );

    // Sync user record if role or email changed
    if (email || role || isActive !== undefined) {
      await User.findOneAndUpdate(
        { employeeId: id },
        {
          ...(email && { email: email.toLowerCase() }),
          ...(role && { role }),
          ...(isActive !== undefined && { isActive }),
        }
      );
    }

    return NextResponse.json({ employee: updatedEmployee });
  } catch (error) {
    console.error('Update employee error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/employees/[id] — soft delete (HR only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (authUser.role !== 'admin' && authUser.role !== 'hr') {
      return NextResponse.json({ error: 'Unauthorized: Admin or HR access required' }, { status: 403 });
    }

    await dbConnect();
    const { id } = await params;

    const employee = await Employee.findById(id);
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Soft delete: deactivate instead of removing
    await Employee.findByIdAndUpdate(id, { isActive: false });
    await User.findOneAndUpdate({ employeeId: id }, { isActive: false });

    return NextResponse.json({ success: true, message: 'Employee deactivated' });
  } catch (error) {
    console.error('Delete employee error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
