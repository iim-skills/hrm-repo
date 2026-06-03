import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWFHRestrictionDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  restrictedUntil: Date;
  reason: string;
  isOverridden: boolean;
  overriddenBy: mongoose.Types.ObjectId | null;
  overrideReason: string;
  createdAt: Date;
  updatedAt: Date;
}

const WFHRestrictionSchema = new Schema<IWFHRestrictionDocument>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    restrictedUntil: {
      type: Date,
      required: true,
    },
    reason: {
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

WFHRestrictionSchema.index({ employeeId: 1 });

// Force recompilation in dev
if (process.env.NODE_ENV !== 'production') {
  delete mongoose.models.WFHRestriction;
}

const WFHRestriction: Model<IWFHRestrictionDocument> =
  mongoose.models.WFHRestriction ||
  mongoose.model<IWFHRestrictionDocument>('WFHRestriction', WFHRestrictionSchema, 'wfh_restrictions');

export default WFHRestriction;
