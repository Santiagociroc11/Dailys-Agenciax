import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const workSessionSchema = new mongoose.Schema(
  {
    ...idField,
    assignment_id: { type: String, required: true, ref: 'TaskWorkAssignment' },
    start_time: { type: Date, required: true },
    end_time: { type: Date, required: true },
    duration_minutes: { type: Number, required: true },
    notes: { type: String, default: '' },
    session_type: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: 'work_sessions',
  }
);

workSessionSchema.index({ assignment_id: 1 });

export type WorkSessionDoc = InferSchemaType<typeof workSessionSchema> & {
  id: string;
};
export const WorkSession = mongoose.model<WorkSessionDoc>(
  'WorkSession',
  workSessionSchema
);
