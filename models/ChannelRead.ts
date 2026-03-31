import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const channelReadSchema = new mongoose.Schema(
  {
    ...idField,
    user_id: { type: String, required: true },
    channel_id: { type: String, required: true },
    last_read_at: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: 'channel_reads',
  }
);

channelReadSchema.index({ user_id: 1, channel_id: 1 }, { unique: true });

export type ChannelReadDoc = InferSchemaType<typeof channelReadSchema> & { id: string };
export const ChannelRead = mongoose.model<ChannelReadDoc>('ChannelRead', channelReadSchema);
