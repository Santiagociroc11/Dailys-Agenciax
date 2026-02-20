import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const workEventSchema = new mongoose.Schema(
  {
    ...idField,
    user_id: { type: String, required: true, ref: 'User' },
    date: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    start_time: { type: String, required: true },
    end_time: { type: String, required: true },
    event_type: { type: String, required: true },
    project_id: { type: String, default: null, ref: 'Project' },
  },
  {
    timestamps: true,
    collection: 'work_events',
  }
);

workEventSchema.index({ user_id: 1, date: 1 });

export type WorkEventDoc = InferSchemaType<typeof workEventSchema> & {
  id: string;
};
export const WorkEvent = mongoose.model<WorkEventDoc>(
  'WorkEvent',
  workEventSchema
);
