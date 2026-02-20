import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';
import { registerSubtaskHooks } from './middleware/subtaskHooks.js';

const subtaskSchema = new mongoose.Schema(
  {
    ...idField,
    task_id: { type: String, required: true, ref: 'Task' },
    title: { type: String, required: true },
    description: { type: String, default: null },
    estimated_duration: { type: Number, required: true },
    sequence_order: { type: Number, default: null },
    assigned_to: { type: String, required: true, ref: 'User' },
    status: { type: String, required: true, default: 'pending' },
    start_date: { type: Date, required: true, default: Date.now },
    deadline: { type: Date, required: true, default: Date.now },
    status_history: { type: mongoose.Schema.Types.Mixed, default: [] },
    review_comments: { type: String, default: null },
    notes: { type: mongoose.Schema.Types.Mixed, default: {} },
    checklist: {
      type: [
        {
          id: { type: String, required: true },
          title: { type: String, required: true },
          checked: { type: Boolean, default: false },
          order: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    feedback: { type: mongoose.Schema.Types.Mixed, default: null },
    returned_at: { type: Date, default: null },
    is_billable: { type: Boolean, default: true },
    comments: {
      type: [
        {
          id: { type: String, required: true },
          user_id: { type: String, required: true },
          content: { type: String, required: true },
          created_at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'subtasks',
  }
);

subtaskSchema.index({ task_id: 1 });
subtaskSchema.index({ status: 1 });

registerSubtaskHooks(subtaskSchema);

export type SubtaskDoc = InferSchemaType<typeof subtaskSchema> & { id: string };
export const Subtask = mongoose.model<SubtaskDoc>('Subtask', subtaskSchema);
