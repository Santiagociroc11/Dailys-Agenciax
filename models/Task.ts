import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';
import { registerTaskHooks } from './middleware/taskHooks.js';

const taskSchema = new mongoose.Schema(
  {
    ...idField,
    title: { type: String, required: true },
    description: { type: String, default: null },
    start_date: { type: Date, required: true },
    deadline: { type: Date, required: true },
    estimated_duration: { type: Number, required: true },
    priority: { type: String, required: true, default: 'medium' },
    is_sequential: { type: Boolean, default: false },
    created_by: { type: String, required: true, ref: 'User' },
    assigned_users: { type: [String], default: [] },
    project_id: { type: String, default: null, ref: 'Project' },
    status: { type: String, required: true, default: 'pending' },
    status_history: { type: mongoose.Schema.Types.Mixed, default: [] },
    review_comments: { type: String, default: null },
    notes: { type: String, default: null },
    feedback: { type: mongoose.Schema.Types.Mixed, default: null },
    returned_at: { type: Date, default: null },
    is_billable: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: 'tasks',
  }
);

taskSchema.index({ project_id: 1 });
taskSchema.index({ status: 1 });

registerTaskHooks(taskSchema);

export type TaskDoc = InferSchemaType<typeof taskSchema> & { id: string };
export const Task = mongoose.model<TaskDoc>('Task', taskSchema);
