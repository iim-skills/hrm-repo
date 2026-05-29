import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import dbConnect from '@/lib/db';
import Employee from '@/lib/models/Employee';
import User from '@/lib/models/User';
import { getAuthUser } from '@/lib/auth';

// GET /api/employees — list employees (role-filtered)
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const department = searchParams.get('department') || '';
    const getManagersOnly = searchParams.get('managersOnly') === 'true';
    const skip = (page - 1) * limit;

    // Build query based on role
    const query: Record<string, any> = {};
    const andConditions: any[] = [];

    if (authUser.role === 'manager') {
      if (getManagersOnly) {
        // Manager is fetching manager/HR/Admin list to populate option dropdowns
        andConditions.push({ role: { $in: ['manager', 'hr', 'admin'] } });
      } else {
        // Manager sees only their team AND themselves
        andConditions.push({
          $or: [
            { managerId: authUser.userId },
            { _id: authUser.employeeId }
          ]
        });
      }
    } else if (authUser.role === 'employee') {
      // Employee sees only themselves
      andConditions.push({ _id: authUser.employeeId });
    }
    // Admin and HR see everything — no filter

    if (search) {
      andConditions.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ]
      });
    }

    if (department) {
      andConditions.push({ department });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    const [employees, total] = await Promise.all([
      Employee.find(query).sort({ name: 1 }).skip(skip).limit(limit).lean(),
      Employee.countDocuments(query),
    ]);

    // Fetch corresponding User documents to associate manager User IDs with Employee records
    const employeeIds = employees.map(e => e._id);
    const users = await User.find({ employeeId: { $in: employeeIds } }).select('employeeId').lean();
    const userMap = new Map(users.map(u => [u.employeeId.toString(), u._id.toString()]));

    const employeesWithUserId = employees.map(e => ({
      ...e,
      userId: userMap.get(e._id.toString()) || null,
    }));

    // Get all unique departments for filter dropdown
    const departments = await Employee.distinct('department');

    return NextResponse.json({
      employees: employeesWithUserId,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      departments,
    });
  } catch (error) {
    console.error('Get employees error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/employees — create employee (HR and Manager)
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (authUser.role !== 'admin' && authUser.role !== 'hr' && authUser.role !== 'manager') {
      return NextResponse.json({ error: 'Unauthorized: Admin, HR or Manager access required' }, { status: 403 });
    }

    await dbConnect();

    const body = await request.json();
    const { name, email, password, department, genderFlag, joiningDate, currentRosterTier, managerId, role, isActive } = body;

    // Validate required fields
    if (!name || !email || !password || !department || !genderFlag || !joiningDate || !role) {
      return NextResponse.json({ error: 'All required fields must be provided' }, { status: 400 });
    }

    // Validate password
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // Check for duplicate email
    const existingEmployee = await Employee.findOne({ email: email.toLowerCase() });

    if (existingEmployee) {
      return NextResponse.json({ error: 'Employee with this email already exists' }, { status: 409 });
    }

    // Create employee record
    const employee = await Employee.create({
      name,
      email: email.toLowerCase(),
      department,
      genderFlag,
      joiningDate: new Date(joiningDate),
      currentRosterTier: currentRosterTier || 1,
      managerId: authUser.role === 'manager' ? (managerId || authUser.userId) : (managerId || null),
      role: authUser.role === 'manager' ? 'employee' : role,
      isActive: isActive !== undefined ? isActive : true,
    });

    // Create user account with provided password (hashed)
    const hashedPassword = await bcrypt.hash(password, 12);
    await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      role: authUser.role === 'manager' ? 'employee' : role,
      employeeId: employee._id,
      isActive: isActive !== undefined ? isActive : true,
    });

    return NextResponse.json({ employee }, { status: 201 });
  } catch (error) {
    console.error('Create employee error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
