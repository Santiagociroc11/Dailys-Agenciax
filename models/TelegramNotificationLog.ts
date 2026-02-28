import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const telegramNotificationLogSchema = new mongoose.Schema(
  {
    ...idField,
    type: {
      type: String,
      required: true,
      enum: [
        'test',
        'admin-notification',
        'task-available',
        'user-task-in-review',
        'deadline-reminder',
        'daily-summary',
        'budget-alert',
      ],
    },
    recipient: { type: String, required: true },
    recipient_label: { type: String, default: null },
    status: {
      type: String,
      required: true,
      enum: ['success', 'failed', 'skipped'],
    },
    details: { type: String, default: null },
    error: { type: String, default: null },
  },
  {
    timestamps: true,
    collection: 'telegram_notification_log',
  }
);

// Índices para consultas eficientes
telegramNotificationLogSchema.index({ createdAt: -1 });
telegramNotificationLogSchema.index({ type: 1, createdAt: -1 });
telegramNotificationLogSchema.index({ status: 1, createdAt: -1 });
telegramNotificationLogSchema.index({ recipient: 1, createdAt: -1 });

// TTL: eliminar documentos con más de 30 días
telegramNotificationLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);

export type TelegramNotificationLogDoc = InferSchemaType<typeof telegramNotificationLogSchema> & {
  id: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export const TelegramNotificationLog = mongoose.model<TelegramNotificationLogDoc>(
  'TelegramNotificationLog',
  telegramNotificationLogSchema
);
