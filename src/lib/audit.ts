/**
 * Utilidad para registrar cambios en el log de auditoría.
 * Llamar después de cada operación create/update/delete relevante.
 */
import { supabase } from './supabase';

export interface AuditEntry {
  user_id: string;
  entity_type: string;
  entity_id: string;
  action: 'create' | 'update' | 'delete';
  field_name?: string;
  old_value?: unknown;
  new_value?: unknown;
  summary?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await supabase.from('audit_log').insert([
      {
        id: crypto.randomUUID(),
        ...entry,
      },
    ]);
  } catch (err) {
    console.error('[Audit] Error al registrar:', err);
  }
}
