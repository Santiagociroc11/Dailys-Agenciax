import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const acctTransactionSchema = new mongoose.Schema(
  {
    ...idField,
    date: { type: Date, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    type: { type: String, required: true, enum: ['income', 'expense', 'transfer'] },
    entity_id: { type: String, default: null, ref: 'AcctEntity' },
    category_id: { type: String, default: null, ref: 'AcctCategory' },
    payment_account_id: { type: String, required: true, ref: 'AcctPaymentAccount' },
    description: { type: String, default: '' },
    created_by: { type: String, default: null, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'acct_transactions',
  }
);

acctTransactionSchema.index({ date: -1 });
acctTransactionSchema.index({ entity_id: 1 });
acctTransactionSchema.index({ payment_account_id: 1 });
acctTransactionSchema.index({ category_id: 1 });

export type AcctTransactionDoc = InferSchemaType<typeof acctTransactionSchema> & { id: string };
export const AcctTransaction = mongoose.model<AcctTransactionDoc>(
  'AcctTransaction',
  acctTransactionSchema
);
