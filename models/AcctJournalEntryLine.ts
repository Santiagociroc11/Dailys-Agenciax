import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const acctJournalEntryLineSchema = new mongoose.Schema(
  {
    ...idField,
    journal_entry_id: { type: String, required: true, ref: 'AcctJournalEntry' },
    account_id: { type: String, required: true, ref: 'AcctChartAccount' },
    entity_id: { type: String, default: null, ref: 'AcctEntity' },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    description: { type: String, default: '' },
    currency: { type: String, default: 'USD' },
  },
  {
    timestamps: true,
    collection: 'acct_journal_entry_lines',
  }
);

acctJournalEntryLineSchema.index({ journal_entry_id: 1 });
acctJournalEntryLineSchema.index({ account_id: 1 });
acctJournalEntryLineSchema.index({ entity_id: 1 });

export type AcctJournalEntryLineDoc = InferSchemaType<typeof acctJournalEntryLineSchema> & { id: string };
export const AcctJournalEntryLine = mongoose.model<AcctJournalEntryLineDoc>(
  'AcctJournalEntryLine',
  acctJournalEntryLineSchema
);
