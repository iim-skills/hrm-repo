import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import Employee from '@/lib/models/Employee';
import { getAuthUser } from '@/lib/auth';

export async function GET() {
  try {
    const payload = await getAuthUser();

    if (!payload) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await dbConnect();

    const user = await User.findById(payload.userId).select('-password');
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const employee = await Employee.findById(user.employeeId);

    return NextResponse.json({
      userId: user._id.toString(),
      role: user.role,
      employeeId: user.employeeId.toString(),
      email: user.email,
      name: employee?.name || 'Unknown',
    });
  } catch (error) {
    console.error('Auth me error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
