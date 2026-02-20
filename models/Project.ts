import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const projectSchema = new mongoose.Schema(
  {
    ...idField,
    name: { type: String, required: true },
    description: { type: String, default: null },
    start_date: { type: Date, required: true },
    deadline: { type: Date, required: true },
    created_by: { type: String, required: true, ref: 'User' },
    is_archived: { type: Boolean, default: false },
    archived_at: { type: Date, default: null },
    restricted_access: { type: Boolean, default: false },
    client_id: { type: String, default: null, ref: 'Client' },
    budget_hours: { type: Number, default: null },
    budget_amount: { type: Number, default: null },
  },
  {
    timestamps: true,
    collection: 'projects',
  }
);

projectSchema.index({ created_by: 1 });
projectSchema.index({ created_at: -1 });

export type ProjectDoc = InferSchemaType<typeof projectSchema> & { id: string };
export const Project = mongoose.model<ProjectDoc>('Project', projectSchema);
