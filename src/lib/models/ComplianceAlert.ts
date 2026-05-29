import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IComplianceAlertDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  type: 'SANDWICH' | 'LWP_ALERT' | 'HALF_DAY_VIOLATION';
  date: Date;
  message: string;
  resolved: boolean;
  resolvedBy: mongoose.Types.ObjectId | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ComplianceAlertSchema = new Schema<IComplianceAlertDocument>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    type: {
      type: String,
      enum: ['SANDWICH', 'LWP_ALERT', 'HALF_DAY_VIOLATION'],
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    resolved: {
      type: Boolean,
      default: false,
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

ComplianceAlertSchema.index({ employeeId: 1, type: 1, date: 1 }, { unique: true });

const ComplianceAlert: Model<IComplianceAlertDocument> =
  mongoose.models.ComplianceAlert ||
  mongoose.model<IComplianceAlertDocument>('ComplianceAlert', ComplianceAlertSchema, 'compliance_alerts');

export default ComplianceAlert;
