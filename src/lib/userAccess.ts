/**
 * Lógica centralizada de acceso para usuarios.
 * Fuente única de verdad: qué proyectos puede ver un usuario y qué estados se consideran en cada contexto.
 * Ver docs/REGLAS_ACCESO_USUARIO.md
 */

import { supabase } from './supabase';

/** Estados que indican tarea/subtask finalizada (entregada, revisada o aprobada) */
export const FINAL_STATUSES = ['completed', 'in_review', 'approved'] as const;

/** Estados en los que el usuario puede trabajar (pendiente, en progreso, en revisión, devuelta, asignada) */
export const WORKABLE_STATUSES = ['pending', 'in_progress', 'in_review', 'returned', 'assigned'] as const;

/** Estados que NO están finalizados (para filtrar asignaciones pendientes) */
export const PENDING_ASSIGNMENT_STATUSES = ['pending', 'assigned', 'in_progress', 'blocked', 'returned'] as const;

/**
 * Obtiene los IDs de proyectos que un usuario puede ver.
 * Incluye: assigned_projects + proyectos con task_work_assignments pendientes + proyectos con subtareas asignadas.
 * Solo proyectos no archivados.
 */
export async function getAllowedProjectIds(
  userId: string,
  assignedProjects: string[] = []
): Promise<string[]> {
  const base = new Set<string>(assignedProjects ?? []);

  const [assignmentsRes, subtasksRes] = await Promise.all([
    supabase
      .from('task_work_assignments')
      .select('project_id')
      .eq('user_id', userId)
      .not('status', 'in', "('completed','in_review','approved')"),
    supabase
      .from('subtasks')
      .select('task_id, tasks!inner(project_id)')
      .eq('assigned_to', userId)
      .not('status', 'in', "('approved')"),
  ]);

  const fromAssignments = [...new Set((assignmentsRes.data || []).map((r) => r.project_id).filter(Boolean))] as string[];
  fromAssignments.forEach((id) => base.add(id));

  const fromSubtasks = (subtasksRes.data || [])
    .map((s) => (s.tasks as { project_id?: string })?.project_id)
    .filter(Boolean) as string[];
  fromSubtasks.forEach((id) => base.add(id));

  const allIds = Array.from(base);
  if (allIds.length === 0) return [];

  const { data: activeProjects } = await supabase
    .from('projects')
    .select('id')
    .in('id', allIds)
    .eq('is_archived', false);

  return (activeProjects || []).map((p) => p.id);
}

/** Comprueba si un status es final (entregada/revisada/aprobada) */
export function isFinalStatus(status: string): boolean {
  return FINAL_STATUSES.includes(status as (typeof FINAL_STATUSES)[number]);
}

/** Comprueba si un status permite trabajar en la actividad */
export function isWorkableStatus(status: string): boolean {
  return WORKABLE_STATUSES.includes(status as (typeof WORKABLE_STATUSES)[number]);
}
