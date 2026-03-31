import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true },
    user_ids: { type: [String], default: [] },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    ...idField,
    channel_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true },
    content: { type: String, required: true },
    /** ID del mensaje raíz del hilo; null = mensaje principal del canal */
    thread_id: { type: String, default: null },
    reply_count: { type: Number, default: 0 },
    mentions: { type: [String], default: [] },
    reactions: { type: [reactionSchema], default: [] },
    is_edited: { type: Boolean, default: false },
    edited_at: { type: Date, default: null },
    is_deleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: 'messages',
  }
);

messageSchema.index({ channel_id: 1, createdAt: -1 });
messageSchema.index({ thread_id: 1, createdAt: 1 });
messageSchema.index({ channel_id: 1, thread_id: 1 });

export type MessageDoc = InferSchemaType<typeof messageSchema> & { id: string };
export const Message = mongoose.model<MessageDoc>('Message', messageSchema);
