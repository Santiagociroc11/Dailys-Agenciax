import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const phaseSchema = new mongoose.Schema(
  {
    ...idField,
    project_id: { type: String, required: true, ref: 'Project' },
    name: { type: String, required: true },
    order: { type: Number, required: true, default: 0 },
  },
  {
    timestamps: true,
    collection: 'phases',
  }
);

phaseSchema.index({ project_id: 1 });
phaseSchema.index({ project_id: 1, order: 1 });

export type PhaseDoc = InferSchemaType<typeof phaseSchema> & { id: string };
export const Phase = mongoose.model<PhaseDoc>('Phase', phaseSchema);
