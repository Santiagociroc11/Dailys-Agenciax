import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const payrollPaymentSchema = new mongoose.Schema(
  {
    ...idField,
    period_start: { type: Date, required: true },
    period_end: { type: Date, required: true },
    total_amount: { type: Number, required: true },
    currency: { type: String, default: 'COP' },
    paid_at: { type: Date, default: Date.now },
    notes: { type: String, default: null },
    created_by: { type: String, default: null, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'payroll_payments',
  }
);

payrollPaymentSchema.index({ period_start: -1 });
payrollPaymentSchema.index({ paid_at: -1 });

export type PayrollPaymentDoc = InferSchemaType<typeof payrollPaymentSchema> & { id: string };
export const PayrollPayment = mongoose.model<PayrollPaymentDoc>(
  'PayrollPayment',
  payrollPaymentSchema
);
