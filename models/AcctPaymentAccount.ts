import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const acctPaymentAccountSchema = new mongoose.Schema(
  {
    ...idField,
    name: { type: String, required: true },
    currency: { type: String, default: 'USD' },
  },
  {
    timestamps: true,
    collection: 'acct_payment_accounts',
  }
);

export type AcctPaymentAccountDoc = InferSchemaType<typeof acctPaymentAccountSchema> & { id: string };
export const AcctPaymentAccount = mongoose.model<AcctPaymentAccountDoc>(
  'AcctPaymentAccount',
  acctPaymentAccountSchema
);
