import mongoose, { InferSchemaType } from 'mongoose';
import { idField } from './schemas/base.js';

const auditLogSchema = new mongoose.Schema(
  {
    ...idField,
    user_id: { type: String, required: true, ref: 'User' },
    entity_type: { type: String, required: true }, // 'task' | 'subtask' | 'user' | 'project' | 'assignment' | etc.
    entity_id: { type: String, required: true },
    action: { type: String, required: true }, // 'create' | 'update' | 'delete'
    field_name: { type: String, default: null },
    old_value: { type: mongoose.Schema.Types.Mixed, default: null },
    new_value: { type: mongoose.Schema.Types.Mixed, default: null },
    summary: { type: String, default: null }, // Descripción legible del cambio
  },
  {
    timestamps: true,
    collection: 'audit_log',
  }
);

auditLogSchema.index({ entity_type: 1, entity_id: 1 });
auditLogSchema.index({ user_id: 1 });
auditLogSchema.index({ created_at: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema> & { id: string };
export const AuditLog = mongoose.model<AuditLogDoc>('AuditLog', auditLogSchema);
