import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const acctJournalEntrySchema = new mongoose.Schema(
  {
    ...idField,
    date: { type: Date, required: true },
    description: { type: String, default: '' },
    reference: { type: String, default: '' },
    created_by: { type: String, default: null, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'acct_journal_entries',
  }
);

acctJournalEntrySchema.index({ date: -1 });

export type AcctJournalEntryDoc = InferSchemaType<typeof acctJournalEntrySchema> & { id: string };
export const AcctJournalEntry = mongoose.model<AcctJournalEntryDoc>(
  'AcctJournalEntry',
  acctJournalEntrySchema
);
