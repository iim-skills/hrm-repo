import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import WFHRestriction from '@/lib/models/WFHRestriction';

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || (authUser.role !== 'admin' && authUser.role !== 'hr')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    
    const { restrictionId, reason } = await request.json();
    if (!restrictionId || !reason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const restriction = await WFHRestriction.findById(restrictionId);
    if (!restriction) {
      return NextResponse.json({ error: 'Restriction not found' }, { status: 404 });
    }

    if (restriction.isOverridden) {
      return NextResponse.json({ error: 'Restriction is already overridden' }, { status: 400 });
    }

    restriction.isOverridden = true;
    restriction.overriddenBy = new mongoose.Types.ObjectId(authUser.userId);
    restriction.overrideReason = reason;

    await restriction.save();

    return NextResponse.json({ success: true, message: 'WFH Restriction successfully overridden' });

  } catch (error) {
    console.error('POST /api/compliance/wfh-override error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
