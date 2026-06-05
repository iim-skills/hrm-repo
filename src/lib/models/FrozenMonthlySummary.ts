import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFrozenMonthlySummaryDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
  presentCount: number;
  pslCount: number;
  halfDayCount: number;
  wfhCount: number;
  lwpCount: number;
  plannedLeaveCount: number;
  offDayCount: number;
  totalWorkingDays: number;
  attendanceRate: number;
  frozenAt: Date;
  frozenBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const FrozenMonthlySummarySchema = new Schema<IFrozenMonthlySummaryDocument>(
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
    plannedLeaveCount: {
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
    frozenAt: {
      type: Date,
      default: Date.now,
    },
    frozenBy: {
      type: String,
      default: 'SYSTEM',
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate frozen monthly summaries per employee per month
FrozenMonthlySummarySchema.index({ employeeId: 1, year: 1, month: 1 }, { unique: true });

const FrozenMonthlySummary: Model<IFrozenMonthlySummaryDocument> =
  mongoose.models.FrozenMonthlySummary ||
  mongoose.model<IFrozenMonthlySummaryDocument>('FrozenMonthlySummary', FrozenMonthlySummarySchema, 'frozen_monthly_summaries');

export default FrozenMonthlySummary;
