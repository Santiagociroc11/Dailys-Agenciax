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
    hourly_rate: { type: Number, default: null }, // Tarifa por hora (freelancers). Si vacío, se usa monthly_salary/160
    monthly_salary: { type: Number, default: null }, // Sueldo mensual fijo (empleados). Base para costes si no hay hourly_rate
    currency: { type: String, default: 'COP' }, // Moneda (COP, USD, etc.)
    payment_account: { type: String, default: null }, // Cuenta bancaria para pagos de nómina
  },
  {
    timestamps: true,
    collection: 'users',
  }
);

export type UserDoc = InferSchemaType<typeof userSchema> & { id: string };
export const User = mongoose.model<UserDoc>('User', userSchema);
