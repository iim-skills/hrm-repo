import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import User from '@/lib/models/User';
import { sendMail } from '@/lib/mailer';

export async function POST(req: Request) {
  try {
    await dbConnect();
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't leak whether user exists or not, but for internal HR apps it's usually fine.
      // We will return success anyway, or you can choose to return an error.
      // Let's return success to avoid email enumeration, or error since it's an internal app.
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Set expiry to 15 minutes from now
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 15);

    user.resetOtp = otp;
    user.resetOtpExpiry = expiry;
    await user.save();

    // Send email
    const subject = 'Your Password Reset OTP';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #4f46e5; text-align: center;">Password Reset Request</h2>
        <p>Hello,</p>
        <p>We received a request to reset your password for your HR Management account.</p>
        <p>Your 6-digit One-Time Password (OTP) is:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1e293b; background: #f1f5f9; padding: 10px 20px; border-radius: 6px;">${otp}</span>
        </div>
        <p>This OTP is valid for <strong>15 minutes</strong>. If you did not request a password reset, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
        <p style="font-size: 12px; color: #64748b; text-align: center;">HR Management System</p>
      </div>
    `;

    const emailResult = await sendMail(user.email, subject, html);

    if (!emailResult.success) {
      return NextResponse.json({ error: 'Failed to send email. Please try again later.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'OTP sent to your email.' }, { status: 200 });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
