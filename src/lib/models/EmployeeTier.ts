import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEmployeeTierDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
  tier: number; // 1, 2, 3
  reason: string;
  isFallback: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeTierSchema = new Schema<IEmployeeTierDocument>(
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
    tier: {
      type: Number,
      required: true,
      min: 1,
      max: 3,
    },
    reason: {
      type: String,
      required: true,
    },
    isFallback: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicates: exactly one tier record per employee per month
EmployeeTierSchema.index({ employeeId: 1, year: 1, month: 1 }, { unique: true });

const EmployeeTier: Model<IEmployeeTierDocument> =
  mongoose.models.EmployeeTier ||
  mongoose.model<IEmployeeTierDocument>('EmployeeTier', EmployeeTierSchema, 'employee_tiers');

export default EmployeeTier;
