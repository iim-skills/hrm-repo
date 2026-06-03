import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUserDocument extends Document {
  email: string;
  password: string;
  role: 'admin' | 'hr' | 'manager' | 'employee';
  employeeId: mongoose.Types.ObjectId;
  isActive: boolean;
  resetOtp?: string;
  resetOtpExpiry?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'hr', 'manager', 'employee'],
      required: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    resetOtp: {
      type: String,
    },
    resetOtpExpiry: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const User: Model<IUserDocument> =
  mongoose.models.User || mongoose.model<IUserDocument>('User', UserSchema);

export default User;
