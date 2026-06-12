import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ILeaveBalanceDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
  allocated: number;
  used: number;
  carriedForward: number;
  balance: number;
  isCarriedForwardManual?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveBalanceSchema = new Schema<ILeaveBalanceDocument>(
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
    allocated: {
      type: Number,
      default: 0,
    },
    used: {
      type: Number,
      default: 0,
    },
    carriedForward: {
      type: Number,
      default: 0,
    },
    balance: {
      type: Number,
      default: 0,
    },
    isCarriedForwardManual: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicates: one leave balance per employee per month
LeaveBalanceSchema.index({ employeeId: 1, year: 1, month: 1 }, { unique: true });

if (mongoose.models && mongoose.models.LeaveBalance) {
  delete (mongoose.models as any).LeaveBalance;
}

const LeaveBalance: Model<ILeaveBalanceDocument> =
  mongoose.model<ILeaveBalanceDocument>('LeaveBalance', LeaveBalanceSchema, 'leave_balances');

export default LeaveBalance;
