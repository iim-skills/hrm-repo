import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ILateOverrideRequestDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  date: Date;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  resolvedBy: mongoose.Types.ObjectId | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const LateOverrideRequestSchema = new Schema<ILateOverrideRequestDocument>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

LateOverrideRequestSchema.index({ employeeId: 1, date: 1 }, { unique: true });

const LateOverrideRequest: Model<ILateOverrideRequestDocument> =
  mongoose.models.LateOverrideRequest ||
  mongoose.model<ILateOverrideRequestDocument>('LateOverrideRequest', LateOverrideRequestSchema, 'late_override_requests');

export default LateOverrideRequest;
