import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  try {
    await dbConnect();
    const { email, otp, newPassword } = await req.json();

    if (!email || !otp || !newPassword) {
      return NextResponse.json({ error: 'Email, OTP, and new password are required' }, { status: 400 });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return NextResponse.json({ error: 'User not found or Invalid OTP' }, { status: 400 });
    }

    if (!user.resetOtp || user.resetOtp !== otp) {
      return NextResponse.json({ error: 'Invalid or expired OTP' }, { status: 400 });
    }

    if (!user.resetOtpExpiry || user.resetOtpExpiry < new Date()) {
      return NextResponse.json({ error: 'OTP has expired' }, { status: 400 });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    user.password = hashedPassword;
    
    // Clear OTP fields
    user.resetOtp = undefined;
    user.resetOtpExpiry = undefined;
    
    await user.save();

    return NextResponse.json({ success: true, message: 'Password has been reset successfully.' }, { status: 200 });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
