import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITierHistoryDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
  tier: number; // 1, 2, 3
  reason: string;
  isFallback: boolean;
  calculatedAt: Date;
  calculatedBy: string; // e.g. User ID or 'SYSTEM'
  createdAt: Date;
  updatedAt: Date;
}

const TierHistorySchema = new Schema<ITierHistoryDocument>(
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
    calculatedAt: {
      type: Date,
      default: Date.now,
    },
    calculatedBy: {
      type: String,
      default: 'SYSTEM',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying a specific employee's history quickly
TierHistorySchema.index({ employeeId: 1, year: -1, month: -1 });

const TierHistory: Model<ITierHistoryDocument> =
  mongoose.models.TierHistory ||
  mongoose.model<ITierHistoryDocument>('TierHistory', TierHistorySchema, 'tier_history');

export default TierHistory;
