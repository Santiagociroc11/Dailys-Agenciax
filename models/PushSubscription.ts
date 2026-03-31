import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const pushSubscriptionSchema = new mongoose.Schema(
  {
    ...idField,
    user_id: { type: String, required: true },
    /** URL única del servicio de push del navegador */
    endpoint: { type: String, required: true, unique: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
    /** Ruta base para abrir el chat al pulsar la notificación */
    chat_base_path: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: 'push_subscriptions',
  }
);

pushSubscriptionSchema.index({ user_id: 1 });

export type PushSubscriptionDoc = InferSchemaType<typeof pushSubscriptionSchema> & { id: string };
export const PushSubscription = mongoose.model<PushSubscriptionDoc>('PushSubscription', pushSubscriptionSchema);
