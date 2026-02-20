import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const taskWorkAssignmentSchema = new mongoose.Schema(
  {
    ...idField,
    user_id: { type: String, required: true, ref: 'User' },
    date: { type: String, required: true },
    task_id: { type: String, required: true, ref: 'Task' },
    task_type: { type: String, required: true },
    project_id: { type: String, default: null, ref: 'Project' },
    subtask_id: { type: String, default: null, ref: 'Subtask' },
    estimated_duration: { type: Number, required: true },
    actual_duration: { type: Number, default: null },
    status: { type: String, required: true, default: 'pending' },
    start_time: { type: Date, default: null },
    end_time: { type: Date, default: null },
    notes: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  {
    timestamps: true,
    collection: 'task_work_assignments',
  }
);

taskWorkAssignmentSchema.index(
  { user_id: 1, date: 1, task_id: 1, task_type: 1 },
  { unique: true }
);
taskWorkAssignmentSchema.index({ user_id: 1, date: 1 });
taskWorkAssignmentSchema.index({ status: 1 });
taskWorkAssignmentSchema.index({ project_id: 1 });
taskWorkAssignmentSchema.index({ task_id: 1 });

export type TaskWorkAssignmentDoc = InferSchemaType<
  typeof taskWorkAssignmentSchema
> & { id: string };
export const TaskWorkAssignment = mongoose.model<TaskWorkAssignmentDoc>(
  'TaskWorkAssignment',
  taskWorkAssignmentSchema
);
