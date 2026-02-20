import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const clientSchema = new mongoose.Schema(
  {
    ...idField,
    name: { type: String, required: true },
    contact: { type: String, default: null },
    email: { type: String, default: null },
    hourly_rate: { type: Number, default: null },
  },
  {
    timestamps: true,
    collection: 'clients',
  }
);

clientSchema.index({ name: 1 });

export type ClientDoc = InferSchemaType<typeof clientSchema> & { id: string };
export const Client = mongoose.model<ClientDoc>('Client', clientSchema);
