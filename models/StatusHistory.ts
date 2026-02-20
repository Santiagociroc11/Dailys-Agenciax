import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const statusHistorySchema = new mongoose.Schema(
  {
    ...idField,
    task_id: { type: String, default: null, ref: 'Task' },
    subtask_id: { type: String, default: null, ref: 'Subtask' },
    changed_at: { type: Date, required: true, default: Date.now },
    changed_by: { type: String, default: null, ref: 'User' },
    previous_status: { type: String, default: null },
    new_status: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    collection: 'status_history',
  }
);

statusHistorySchema.index({ task_id: 1 });
statusHistorySchema.index({ subtask_id: 1 });
statusHistorySchema.index({ changed_at: 1 });

export type StatusHistoryDoc = InferSchemaType<
  typeof statusHistorySchema
> & { id: string };
export const StatusHistory = mongoose.model<StatusHistoryDoc>(
  'StatusHistory',
  statusHistorySchema
);
