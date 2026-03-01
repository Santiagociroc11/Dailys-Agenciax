import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const acctImportBatchSchema = new mongoose.Schema(
  {
    ...idField,
    batch_ref: { type: String, required: true, unique: true },
    journal_entry_ids: [{ type: String, ref: 'AcctJournalEntry' }],
    created_by: { type: String, default: null, ref: 'User' },
    created_count: { type: Number, default: 0 },
    skipped_count: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'acct_import_batches',
  }
);

acctImportBatchSchema.index({ createdAt: -1 });
acctImportBatchSchema.index({ created_by: 1 });

export type AcctImportBatchDoc = InferSchemaType<typeof acctImportBatchSchema> & { id: string };
export const AcctImportBatch = mongoose.model<AcctImportBatchDoc>(
  'AcctImportBatch',
  acctImportBatchSchema
);
