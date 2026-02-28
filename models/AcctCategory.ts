import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const acctCategorySchema = new mongoose.Schema(
  {
    ...idField,
    name: { type: String, required: true },
    type: { type: String, required: true, enum: ['income', 'expense'] },
    parent_id: { type: String, default: null, ref: 'AcctCategory' },
  },
  {
    timestamps: true,
    collection: 'acct_categories',
  }
);

acctCategorySchema.index({ type: 1 });
acctCategorySchema.index({ parent_id: 1 });

export type AcctCategoryDoc = InferSchemaType<typeof acctCategorySchema> & { id: string };
export const AcctCategory = mongoose.model<AcctCategoryDoc>('AcctCategory', acctCategorySchema);
