# Reportes de actividad faltantes

Documento que lista las acciones que **no se registran** en el Reporte de actividad (`/activity`) y qué habría que implementar para cubrirlas.

> **Estado:** Implementado (marzo 2025). Las acciones descritas ya se registran en `status_history`.

---

## 1. Estado actual: qué SÍ se registra

El Reporte de actividad usa la tabla `status_history`. Actualmente registra:

| Actividad | Dónde se inserta | Etiqueta |
|-----------|------------------|----------|
| Planificación del día | UserProjectView `handleSaveSelectedTasks` | Planificación del día |
| En progreso | UserProjectView `handleSubmitStatus` | En progreso |
| Entrega | UserProjectView `handleSubmitStatus` | Entrega |
| En revisión | Management `handleStatusChange` | En revisión |
| Aprobado | Management `handleStatusChange` | Aprobado |
| Devuelto | Management `handleStatusChange` | Devuelto |
| Bloqueado | UserProjectView / Management | Bloqueado |

---

## 2. Acciones que FALTAN por registrar

### 2.1 Asignación (admin/PM)

**Qué es:** Cuando el admin o PM crea una tarea y asigna a un usuario (`assigned_to` / `assigned_users`), o cuando cambia el asignado desde Management.

**Dónde ocurre:**
- `Tasks.tsx` – creación de tareas con subtareas asignadas
- `Management.tsx` – edición de asignado (si existe ese flujo)
- RPC `create_task_with_subtasks` en `api/db.ts`

**Por qué importa:** Hoy no hay trazabilidad de quién asignó qué tarea a quién. Solo se ve cuando el usuario planifica su día.

**Implementación sugerida:**
- Insertar en `status_history` con `new_status: 'assigned_by_admin'` cuando se crea/actualiza `assigned_to` o `assigned_users`.
- `metadata`: `{ assigned_to: userId }` o `{ assigned_users: [userId] }`.

---

### 2.2 Desasignar del día (usuario)

**Qué es:** Cuando el usuario quita una tarea de su calendario ("Mi día").

**Dónde ocurre:** `UserProjectView.tsx` → `handleUnassignTask` (aprox. líneas 3415–3484).

**Por qué importa:** Se pierde el historial de que el usuario decidió no trabajar esa tarea ese día.

**Implementación sugerida:**
- Insertar en `status_history` con `new_status: 'unassigned_from_day'` antes del `DELETE` de `task_work_assignments`.
- `changed_by`: usuario actual.
- `metadata`: `{ date, reason: 'user_removed' }`.

---

### 2.3 Desasignar del día (admin/PM)

**Qué es:** Cuando el PM usa "Desasignar del día" en Management para quitar una tarea del día de un usuario.

**Dónde ocurre:** `Management.tsx` → `handleUnassignFromDay` (aprox. líneas 2133–2202).

**Por qué importa:** Permite ver cuándo el PM intervino para reorganizar el día de alguien.

**Implementación sugerida:**
- Insertar en `status_history` con `new_status: 'unassigned_from_day'` antes del `DELETE`.
- `changed_by`: admin/PM actual.
- `metadata`: `{ date, affected_user_id, reason: 'admin_removed' }`.

---

### 2.4 Reasignación

**Qué es:** Cuando el PM cambia el asignado de una tarea (ej. de Daniel a María).

**Dónde ocurre:** `Management.tsx` → `handleUpdateAssignee` (aprox. líneas 1099–1265).

**Por qué importa:** Es un cambio importante de responsabilidad que hoy no queda registrado en el reporte de actividad.

**Implementación sugerida:**
- Insertar en `status_history` con `new_status: 'reassigned'`.
- `changed_by`: admin/PM.
- `metadata`: `{ previous_user_id, new_user_id }`.

---

## 3. Resumen de implementación

| # | Acción | Archivo | Función | `new_status` propuesto |
|---|--------|---------|---------|------------------------|
| 1 | Asignación (admin) | Tasks.tsx, Management.tsx, api/db.ts | Crear tarea, asignar | `assigned_by_admin` |
| 2 | Desasignar del día (usuario) | UserProjectView.tsx | handleUnassignTask | `unassigned_from_day` |
| 3 | Desasignar del día (admin) | Management.tsx | handleUnassignFromDay | `unassigned_from_day` |
| 4 | Reasignación | Management.tsx | handleUpdateAssignee | `reassigned` |

---

## 4. Cambios necesarios en el Reporte de actividad

Tras añadir los inserts en `status_history`, hay que:

1. **ActivityReport.tsx** – Añadir etiquetas en `ACTIVITY_LABELS`:
   - `assigned_by_admin`: "Asignación (admin)"
   - `unassigned_from_day`: "Desasignado del día"
   - `reassigned`: "Reasignación"

2. **api/db.ts** – Añadir las mismas etiquetas en `get_activity_log` (RPC).

3. **Filtro por tipo** – Incluir las nuevas opciones en el selector de tipo de actividad.

---

## 5. Consideración: distinguir desasignación usuario vs admin

Para diferenciar "usuario se quitó la tarea" de "admin le quitó la tarea", se puede:

- **Opción A:** Usar el mismo `new_status: 'unassigned_from_day'` y distinguir por `metadata.reason` (`user_removed` vs `admin_removed`). En el reporte se podría mostrar "Desasignado del día (usuario)" o "Desasignado del día (admin)" según ese campo.
- **Opción B:** Usar dos valores distintos: `unassigned_from_day_user` y `unassigned_from_day_admin`.

La opción A es más flexible y evita multiplicar tipos en el filtro.

---

## 6. No incluido (por diseño)

| Acción | Motivo |
|--------|--------|
| Actividades adicionales (`work_events`) | Son otra entidad; el reporte se centra en tareas/subtareas. Podría ser un reporte aparte. |
| Edición de título/descripción/deadline | Más propio de Auditoría (`/audits`) que de flujo de trabajo. |
| Creación de tarea (sin asignar) | Tasks ya usa `logAudit` para create; aparece en Auditoría. |

---

## 7. Referencias

- `docs/FLUJOS_END_TO_END_COMPLETO.md` – Flujos de tareas y asignaciones
- `src/pages/ActivityReport.tsx` – UI del reporte
- `api/db.ts` – RPC `get_activity_log`
