import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMonthlyAttendanceSummaryDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
  presentCount: number;
  pslCount: number;
  halfDayCount: number;
  wfhCount: number;
  lwpCount: number;
  offDayCount: number;
  totalWorkingDays: number;
  attendanceRate: number;
  createdAt: Date;
  updatedAt: Date;
}

const MonthlyAttendanceSummarySchema = new Schema<IMonthlyAttendanceSummaryDocument>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    month: {
      type: Number,
      required: true,
      min: 0,
      max: 11,
    },
    presentCount: {
      type: Number,
      default: 0,
    },
    pslCount: {
      type: Number,
      default: 0,
    },
    halfDayCount: {
      type: Number,
      default: 0,
    },
    wfhCount: {
      type: Number,
      default: 0,
    },
    lwpCount: {
      type: Number,
      default: 0,
    },
    offDayCount: {
      type: Number,
      default: 0,
    },
    totalWorkingDays: {
      type: Number,
      default: 0,
    },
    attendanceRate: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicates: one summary per employee per month
MonthlyAttendanceSummarySchema.index({ employeeId: 1, year: 1, month: 1 }, { unique: true });

const MonthlyAttendanceSummary: Model<IMonthlyAttendanceSummaryDocument> =
  mongoose.models.MonthlyAttendanceSummary ||
  mongoose.model<IMonthlyAttendanceSummaryDocument>('MonthlyAttendanceSummary', MonthlyAttendanceSummarySchema, 'monthly_attendance_summaries');

export default MonthlyAttendanceSummary;
