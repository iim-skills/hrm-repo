import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISandwichFlagDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  date: Date;
  originalStatus: string;
  isOverridden: boolean;
  overriddenBy: mongoose.Types.ObjectId | null;
  overrideReason: string;
  createdAt: Date;
  updatedAt: Date;
}

const SandwichFlagSchema = new Schema<ISandwichFlagDocument>(
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
    originalStatus: {
      type: String,
      required: true,
    },
    isOverridden: {
      type: Boolean,
      default: false,
    },
    overriddenBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    overrideReason: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

SandwichFlagSchema.index({ employeeId: 1, date: 1 }, { unique: true });

const SandwichFlag: Model<ISandwichFlagDocument> =
  mongoose.models.SandwichFlag ||
  mongoose.model<ISandwichFlagDocument>('SandwichFlag', SandwichFlagSchema, 'sandwich_flags');

export default SandwichFlag;
