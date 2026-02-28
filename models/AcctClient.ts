import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const acctClientSchema = new mongoose.Schema(
  {
    ...idField,
    name: { type: String, required: true },
    sort_order: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'acct_clients',
  }
);

acctClientSchema.index({ name: 1 });
acctClientSchema.index({ sort_order: 1 });

export type AcctClientDoc = InferSchemaType<typeof acctClientSchema> & { id: string };
export const AcctClient = mongoose.model<AcctClientDoc>('AcctClient', acctClientSchema);
