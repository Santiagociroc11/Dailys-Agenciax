import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const acctEntitySchema = new mongoose.Schema(
  {
    ...idField,
    name: { type: String, required: true },
    type: { type: String, required: true, enum: ['project', 'agency', 'internal'] },
    client_id: { type: String, default: null, ref: 'AcctClient' },
    sort_order: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'acct_entities',
  }
);

acctEntitySchema.index({ type: 1 });
acctEntitySchema.index({ client_id: 1 });
acctEntitySchema.index({ sort_order: 1 });

export type AcctEntityDoc = InferSchemaType<typeof acctEntitySchema> & { id: string };
export const AcctEntity = mongoose.model<AcctEntityDoc>('AcctEntity', acctEntitySchema);
