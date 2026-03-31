import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const channelSchema = new mongoose.Schema(
  {
    ...idField,
    name: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['project', 'custom', 'dm'],
    },
    project_id: { type: String, default: null },
    description: { type: String, default: null },
    members: { type: [String], default: [] },
    created_by: { type: String, required: true },
    is_archived: { type: Boolean, default: false },
    last_message_at: { type: Date, default: null },
    /** Clave estable para buscar DM entre dos usuarios: "id1|id2" ordenados lexicográficamente */
    dm_pair_key: { type: String, default: null, sparse: true },
  },
  {
    timestamps: true,
    collection: 'channels',
  }
);

channelSchema.index({ type: 1, project_id: 1 });
channelSchema.index({ members: 1 });
channelSchema.index({ last_message_at: -1 });
channelSchema.index({ dm_pair_key: 1 }, { unique: true, sparse: true });

export type ChannelDoc = InferSchemaType<typeof channelSchema> & { id: string };
export const Channel = mongoose.model<ChannelDoc>('Channel', channelSchema);
