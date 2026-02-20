import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const areaUserAssignmentSchema = new mongoose.Schema(
  {
    ...idField,
    user_id: { type: String, required: true, ref: 'User' },
    area_id: { type: String, required: true, ref: 'Area' },
  },
  {
    timestamps: true,
    collection: 'area_user_assignments',
  }
);

areaUserAssignmentSchema.index({ user_id: 1, area_id: 1 }, { unique: true });
areaUserAssignmentSchema.index({ user_id: 1 });
areaUserAssignmentSchema.index({ area_id: 1 });

export type AreaUserAssignmentDoc = InferSchemaType<
  typeof areaUserAssignmentSchema
> & { id: string };
export const AreaUserAssignment = mongoose.model<AreaUserAssignmentDoc>(
  'AreaUserAssignment',
  areaUserAssignmentSchema
);
