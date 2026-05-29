import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEmployeeDocument extends Document {
  name: string;
  email: string;
  department: string;
  genderFlag: 'male' | 'female' | 'other';
  joiningDate: Date;
  currentRosterTier: number;
  managerId: mongoose.Types.ObjectId | null;
  role: 'admin' | 'hr' | 'manager' | 'employee';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeSchema = new Schema<IEmployeeDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    genderFlag: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: true,
    },
    joiningDate: {
      type: Date,
      required: true,
    },
    currentRosterTier: {
      type: Number,
      default: 1,
      min: 1,
      max: 3,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    role: {
      type: String,
      enum: ['admin', 'hr', 'manager', 'employee'],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Employee: Model<IEmployeeDocument> =
  mongoose.models.Employee || mongoose.model<IEmployeeDocument>('Employee', EmployeeSchema);

export default Employee;
