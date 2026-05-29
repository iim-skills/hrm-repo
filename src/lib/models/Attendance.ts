import mongoose, { Schema, Document, Model } from 'mongoose';

export type AttendanceStatus =
  | 'PRESENT'
  | 'PAID_SICK_LEAVE'
  | 'WFH'
  | 'REMOTE_COMFORT_DAY'
  | 'HALF_DAY'
  | 'SCHEDULE_OFF'
  | 'LWP'
  | 'LATE'
  | 'EARLY_LEAVE'
  | 'PLANNED_LEAVE'
  | 'RESTRICTED_HOLIDAY';

export interface IAttendanceUpdateHistory {
  status: AttendanceStatus;
  updatedBy: mongoose.Types.ObjectId;
  updatedAt: Date;
  notes: string;
}

export interface IAttendanceDocument extends Document {
  employeeId: mongoose.Types.ObjectId;
  date: Date;
  status: AttendanceStatus;
  markedBy: mongoose.Types.ObjectId;
  notes: string;
  history: IAttendanceUpdateHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema = new Schema<IAttendanceDocument>(
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
    status: {
      type: String,
      enum: [
        'PRESENT',
        'PAID_SICK_LEAVE',
        'WFH',
        'REMOTE_COMFORT_DAY',
        'HALF_DAY',
        'SCHEDULE_OFF',
        'LWP',
        'LATE',
        'EARLY_LEAVE',
        'PLANNED_LEAVE',
        'RESTRICTED_HOLIDAY',
      ],
      required: true,
    },
    markedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    history: [
      {
        status: { type: String, required: true },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        updatedAt: { type: Date, default: Date.now },
        notes: { type: String, default: '' },
      }
    ],
  },
  {
    timestamps: true,
  }
);

// Unique index: one attendance record per employee per date
AttendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

if (mongoose.models && mongoose.models.Attendance) {
  delete (mongoose.models as any).Attendance;
}

const Attendance: Model<IAttendanceDocument> =
  mongoose.model<IAttendanceDocument>('Attendance', AttendanceSchema);

export default Attendance;
