import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const templateSubtaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: null },
    estimated_duration: { type: Number, required: true, default: 30 },
    sequence_order: { type: Number, default: null },
  },
  { _id: false }
);

const templateTaskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: null },
    estimated_duration: { type: Number, required: true, default: 60 },
    priority: { type: String, default: 'medium' },
    is_sequential: { type: Boolean, default: false },
    subtasks: { type: [templateSubtaskSchema], default: [] },
  },
  { _id: false }
);

const projectTemplateSchema = new mongoose.Schema(
  {
    ...idField,
    name: { type: String, required: true },
    description: { type: String, default: null },
    created_by: { type: String, required: true, ref: 'User' },
    source_project_id: { type: String, default: null, ref: 'Project' },
    tasks: { type: [templateTaskSchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'project_templates',
  }
);

projectTemplateSchema.index({ created_by: 1 });
projectTemplateSchema.index({ created_at: -1 });

export type ProjectTemplateDoc = InferSchemaType<typeof projectTemplateSchema> & { id: string };
export const ProjectTemplate = mongoose.model<ProjectTemplateDoc>('ProjectTemplate', projectTemplateSchema);
