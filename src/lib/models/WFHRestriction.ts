import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWFHRestrictionDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  restrictedUntil: Date;
  reason: string;
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
  },
  {
    timestamps: true,
  }
);

WFHRestrictionSchema.index({ employeeId: 1 });

const WFHRestriction: Model<IWFHRestrictionDocument> =
  mongoose.models.WFHRestriction ||
  mongoose.model<IWFHRestrictionDocument>('WFHRestriction', WFHRestrictionSchema, 'wfh_restrictions');

export default WFHRestriction;
