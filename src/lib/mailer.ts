import nodemailer from 'nodemailer';

const host = process.env.MAIL_HOST || '';
const port = parseInt(process.env.MAIL_PORT || '587', 10);
const user = process.env.MAIL_USER || '';
const pass = process.env.MAIL_PASS || '';
const adminEmail = process.env.ADMIN_EMAIL || user;

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465, // true for 465, false for other ports
  auth: {
    user,
    pass,
  },
});

export const sendMail = async (to: string, subject: string, html: string) => {
  try {
    const info = await transporter.sendMail({
      from: `"HR Management" <${adminEmail}>`,
      to,
      subject,
      html,
    });
    console.log('Message sent: %s', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error };
  }
};
