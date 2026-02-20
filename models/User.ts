import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const userSchema = new mongoose.Schema(
  {
    ...idField,
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true, default: 'user' },
    assigned_projects: { type: [String], default: [] },
    phone: { type: String, default: null },
    telegram_chat_id: { type: String, default: null },
    hourly_rate: { type: Number, default: null }, // Tarifa por hora (para cálculo de costes)
    currency: { type: String, default: 'COP' }, // Moneda (COP, USD, etc.)
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

export type UserDoc = InferSchemaType<typeof userSchema> & { id: string };
export const User = mongoose.model<UserDoc>('User', userSchema);
