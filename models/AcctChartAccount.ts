import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const acctChartAccountSchema = new mongoose.Schema(
  {
    ...idField,
    code: { type: String, required: true },
    name: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['asset', 'liability', 'equity', 'income', 'expense'],
    },
    parent_id: { type: String, default: null, ref: 'AcctChartAccount' },
    is_header: { type: Boolean, default: false },
    sort_order: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'acct_chart_accounts',
  }
);

acctChartAccountSchema.index({ type: 1 });
acctChartAccountSchema.index({ parent_id: 1 });
acctChartAccountSchema.index({ code: 1 }, { unique: true });

export type AcctChartAccountDoc = InferSchemaType<typeof acctChartAccountSchema> & { id: string };
export const AcctChartAccount = mongoose.model<AcctChartAccountDoc>(
  'AcctChartAccount',
  acctChartAccountSchema
);
