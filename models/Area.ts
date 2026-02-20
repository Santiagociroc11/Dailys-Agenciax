import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const areaSchema = new mongoose.Schema(
  {
    ...idField,
    name: { type: String, required: true, unique: true },
    description: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: 'areas',
  }
);

export type AreaDoc = InferSchemaType<typeof areaSchema> & { id: string };
export const Area = mongoose.model<AreaDoc>('Area', areaSchema);
