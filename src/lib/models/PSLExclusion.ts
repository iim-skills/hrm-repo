import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPSLExclusionDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PSLExclusionSchema = new Schema<IPSLExclusionDocument>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

const PSLExclusion: Model<IPSLExclusionDocument> =
  mongoose.models.PSLExclusion || mongoose.model<IPSLExclusionDocument>('PSLExclusion', PSLExclusionSchema);

export default PSLExclusion;
