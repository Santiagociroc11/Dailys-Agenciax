# Flujo End-to-End: Reportar tiempo de retrabajo en tareas devueltas

## Resumen

**Sí, la persona puede reportar tiempo de retrabajo** cuando completa una actividad devuelta. El flujo estaba roto por un bug que ya se corrigió.

---

## 1. Flujo del usuario

1. **Tarea devuelta** → El PM/revisor devuelve una tarea con feedback. La tarea aparece en la sección "Devueltas" del usuario.
2. **Usuario abre** → Vista de Gestión → pestaña correspondiente (Asignadas hoy, Retrasadas, **Devueltas**).
3. **Usuario hace clic** en "✅ Completar" sobre la tarea devuelta.
4. **Modal** → Se abre el modal de estado con campos para:
   - Entregables/resultados
   - **Duración real** (obligatorio)
   - Razón de duración si difiere del estimado
5. **Usuario envía** → El tiempo reportado se guarda en `work_sessions` y se actualiza `actual_duration` en la asignación.

---

## 2. Bug corregido (getAssignmentId)

### Problema

`getAssignmentId` buscaba la asignación solo con `date = hoy`. Pero las tareas devueltas tienen `assignment.date` = **fecha original** de asignación (ej. hace 3 días).

### Consecuencia

- `getAssignmentId(..., today)` devolvía `null`
- No se creaba `work_session`
- El tiempo de retrabajo no se registraba
- El Control de Horas no mostraba el tiempo de retrabajo

### Solución

`getAssignmentId` ahora:

1. Busca primero con `date = hoy`
2. Si no encuentra, busca con `date = assignment_date` (fecha de la asignación)
3. Si no encuentra, busca sin filtrar por fecha (tareas devueltas/retrasadas)

En `handleSubmitStatus` se pasa `taskForStatusUpdate?.assignment_date` como fallback.

---

## 3. Datos involucrados

| Tabla | Uso |
|-------|-----|
| `task_work_assignments` | Asignación: `user_id`, `task_id`/`subtask_id`, `date` (fecha original), `status`, `actual_duration` |
| `work_sessions` | Sesión de trabajo: `assignment_id`, `duration_minutes`, `session_type` ('completion' para completar), `created_at` |
| `status_history` | Historial: `returned` → `completed`/`in_review` hoy = retrabajo |

---

## 4. Control de Horas

El Control de Horas suma el tiempo de retrabajo cuando:

- `work_sessions` con `session_type = 'completion'` y `created_at` = hoy
- `task_work_assignments.date` < hoy (es decir, asignación de días anteriores)

Ese tiempo se suma al total del día y se muestra en la barra (segmento naranja) y en la columna Retrabajos.

---

## 5. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/pages/UserProjectView.tsx` | `getAssignmentId` con fallback por `assignment_date` y búsqueda sin fecha |
| `src/pages/UserProjectView.tsx` | `handleSubmitStatus` pasa `assignment_date` a `getAssignmentId` |
| `src/pages/DailyHoursControl.tsx` | (Ya implementado) Suma `work_sessions` de hoy para asignaciones con `date < hoy` |
