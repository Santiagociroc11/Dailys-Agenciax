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

const templatePhaseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
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
    phase_name: { type: String, default: null },
    subtasks: { type: [templateSubtaskSchema], default: [] },
    checklist: { type: [checklistItemSchema], default: [] },
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
    phases: { type: [templatePhaseSchema], default: [] },
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
