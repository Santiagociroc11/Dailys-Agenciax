import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const checklistItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const templateSubtaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: null },
    estimated_duration: { type: Number, required: true, default: 30 },
    sequence_order: { type: Number, default: null },
    checklist: { type: [checklistItemSchema], default: [] },
  },
  { _id: false }
);

const taskTemplateSchema = new mongoose.Schema(
  {
    ...idField,
    name: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: null },
    estimated_duration: { type: Number, required: true, default: 60 },
    priority: { type: String, default: 'medium' },
    is_sequential: { type: Boolean, default: false },
    subtasks: { type: [templateSubtaskSchema], default: [] },
    checklist: { type: [checklistItemSchema], default: [] },
    created_by: { type: String, required: true, ref: 'User' },
    source_task_id: { type: String, default: null, ref: 'Task' },
  },
  {
    timestamps: true,
    collection: 'task_templates',
  }
);

taskTemplateSchema.index({ created_by: 1 });
taskTemplateSchema.index({ created_at: -1 });

export type TaskTemplateDoc = InferSchemaType<typeof taskTemplateSchema> & { id: string };
export const TaskTemplate = mongoose.model<TaskTemplateDoc>('TaskTemplate', taskTemplateSchema);
