# Flujos End-to-End: Tareas, Asignaciones y Devueltas

Documento que explica cómo funcionan los flujos completos de tareas desde la creación hasta la visualización del usuario.

---

## 1. Dos fuentes de datos distintas

El sistema usa **dos conceptos de "asignación"** que no siempre coinciden:

| Concepto | Tabla/Campo | ¿Qué representa? |
|----------|-------------|-------------------|
| **Asignación directa** | `tasks.assigned_users` / `subtasks.assigned_to` | Quién está asignado a la tarea (definido por admin/PM) |
| **Planificación diaria** | `task_work_assignments` | Qué tareas el usuario dijo que haría en un día concreto |

**Regla clave:** La vista de gestión del usuario (Asignadas hoy, Retrasadas, Devueltas, Bloqueadas) **solo muestra tareas que tienen entrada en `task_work_assignments`**.

---

## 2. Flujo A: Creación y asignación inicial (Admin/PM)

```
Tasks.tsx / Management / RPC create_task_with_subtasks
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  Se crean/actualizan:                                    │
│  • tasks (title, project_id, assigned_users, status)     │
│  • subtasks (title, task_id, assigned_to, status)        │
└─────────────────────────────────────────────────────────┘
         │
         │  ⚠️ NO se crea task_work_assignments
         │
         ▼
  Usuario tiene assigned_to en subtask
  pero NO aparece aún en "Asignadas hoy" / "Retrasadas"
```

**Archivos:** `Tasks.tsx`, `Management.tsx`, `api/db.ts` (RPC)

**Qué pasa:** El admin crea una tarea con subtareas y asigna a Daniel. La subtarea tiene `assigned_to = Daniel`. Pero **no se crea ninguna fila en `task_work_assignments`**.

---

## 3. Flujo B: Planificación en "Mi día" (Usuario)

```
Usuario entra a UserProjectView (pestaña Asignación)
         │
         ▼
fetchProjectTasksAndSubtasks()
  • Carga tasks con assigned_users
  • Carga subtasks con assigned_to
  • Excluye proyectos archivados
         │
         ▼
  taskItems = tareas disponibles para elegir en el calendario
         │
         ▼
Usuario selecciona tareas del calendario y hace clic en "Guardar"
         │
         ▼
handleSaveSelectedTasks()
  • Genera filas para task_work_assignments
  • user_id, date=hoy, task_type, task_id/subtask_id, project_id
  • status = "assigned"
  • upsert en task_work_assignments
         │
         ▼
  ✅ Ahora SÍ hay asignación en task_work_assignments
```

**Archivo:** `UserProjectView.tsx` → `handleSaveSelectedTasks()` (líneas ~1574-1627)

**Qué pasa:** Daniel entra a su vista de proyectos, ve las tareas asignadas a él, las selecciona en el calendario y guarda. **Solo entonces** se crean las filas en `task_work_assignments`. Esas tareas aparecerán en "Asignadas hoy".

---

## 4. Flujo C: Carga de lo que ve el usuario (Asignadas / Retrasadas / Devueltas)

```
Usuario entra a UserProjectView (pestaña Gestión)
         │
         ▼
fetchAssignedTasks()
  │
  ├─ 1. Consulta task_work_assignments
  │     • user_id = usuario actual
  │     • status NOT IN (completed, in_review, approved)
  │     • project_id en proyectos permitidos
  │
  ├─ 2. Extrae IDs: normalTaskIds, subtaskIds
  │
  ├─ 3. Busca tareas/subtareas devueltas
  │     • Solo entre esos IDs (subtaskIds)
  │     • status = "returned"
  │
  ├─ 4. Obtiene detalles de tasks/subtasks por ID
  │
  └─ 5. Clasifica en:
        • todayAssignedItems (date === hoy)
        • delayedAssignedItems (date < hoy)
        • returnedItems (status returned)
        • blockedItems (status blocked)
```

**Archivo:** `UserProjectView.tsx` → `fetchAssignedTasks()` (líneas ~1880-2234)

**Regla crítica:** Si una subtarea **no tiene** entrada en `task_work_assignments`, su ID no está en `subtaskIds` y **nunca se busca**. Por tanto, no aparece en ninguna lista (ni Asignadas hoy, ni Retrasadas, ni Devueltas).

---

## 5. Flujo D: Usuario completa una tarea

```
Usuario hace clic en "Completar" en el modal de la tarea
         │
         ▼
handleSubmitStatus()
  │
  ├─ 1. Actualiza tasks/subtasks (status → completed/in_review)
  ├─ 2. Busca assignment_id (getAssignmentId)
  │     • Por user_id, task_id/subtask_id, date
  │     • Si no hay: crea assignment on-the-fly (fix para tareas sin planificar)
  ├─ 3. Inserta work_session (duration_minutes, session_type: completion)
  ├─ 4. Actualiza task_work_assignments (actual_duration, status)
  └─ 5. Inserta status_history
```

**Archivo:** `UserProjectView.tsx` → `handleSubmitStatus()`

**Nota:** Si el usuario completa una tarea que nunca planificó, hay lógica para crear la asignación al vuelo. Pero eso solo aplica al completar, no al devolver.

---

## 6. Flujo E: PM devuelve una tarea

```
PM en Management hace clic en "Devolver" con feedback
         │
         ▼
handleStatusChange(targetStatus: 'returned')
  │
  ├─ 1. updateItemStatus() → tasks/subtasks
  │     • status = "returned"
  │     • feedback, returned_at
  │
  ├─ 2. updateTaskWorkAssignment()
  │     • Busca asignación por subtask_id/task_id + task_type
  │     • .single() → si no existe, ERROR
  │     • Si existe: update status = "pending"
  │
  └─ 3. Notificación Telegram al usuario
```

**Archivo:** `Management.tsx` → `updateTaskWorkAssignment()` (líneas ~2004-2057)

**Problema:** Si no hay asignación en `task_work_assignments`, la búsqueda falla. El código **no crea** la asignación; solo muestra error. La subtarea queda con `status=returned` pero sin asignación visible para el usuario.

---

## 7. Flujo F: Usuario desasigna una tarea de su día

```
Usuario quita una tarea del calendario (desasignar)
         │
         ▼
  DELETE de task_work_assignments
  • user_id, date, task_type, task_id/subtask_id
```

**Archivo:** `UserProjectView.tsx` (líneas ~3431-3441)

**Efecto:** La asignación se **elimina**. Si después el PM devuelve esa tarea, no habrá asignación que actualizar.

---

## 8. Flujo G: PM reasigna a otro usuario

```
PM en Management cambia el asignado de Daniel a María
         │
         ▼
handleUpdateAssignee()
  │
  ├─ 1. Actualiza subtask.assigned_to = María
  ├─ 2. Elimina task_work_assignments del usuario anterior (Daniel)
  └─ 3. (Opcional) Crea asignación para María
```

**Archivo:** `Management.tsx` (líneas ~1207-1260)

**Efecto:** Las asignaciones de Daniel se **borran**. Si luego se reasigna de vuelta a Daniel, no habrá asignación previa.

---

## 9. Diagrama resumen: cuándo existe task_work_assignment

```
                    ¿Existe task_work_assignment?
                                    │
    ┌───────────────────────────────┼───────────────────────────────┐
    │                               │                               │
    ▼                               ▼                               ▼
  SÍ (aparece)                  NO (no aparece)                 SE ELIMINA
    │                               │                               │
    • Usuario planificó          • Solo assigned_to              • Usuario desasignó
      en Mi día                    (nunca en Mi día)             • PM reasignó
    • Usuario completó sin       • Asignación eliminada           • Tarea eliminada
      planificar (fix)              al reasignar
```

---

## 10. Por qué una subtarea devuelta no aparece

Para que una subtarea devuelta aparezca al usuario se necesitan **ambas** cosas:

1. `subtasks.status = "returned"` ✅ (el PM lo pone al devolver)
2. Una fila en `task_work_assignments` con `status` pendiente ❌ (suele faltar)

**Causas típicas de que falte la asignación:**

| Causa | Explicación |
|-------|-------------|
| Nunca planificó en Mi día | Se asignó por Management/Tasks pero el usuario nunca la añadió a su día |
| Desasignó antes de que la devolvieran | La quitó del calendario; se borró la asignación |
| Reasignación | Se cambió el asignado y se eliminaron las asignaciones del anterior |
| Migración | Los datos en Supabase no tenían la asignación |

---

## 11. Archivos clave por flujo

| Flujo | Archivo | Función principal |
|-------|---------|-------------------|
| Crear tareas (sin assignments) | Tasks.tsx, Management.tsx, api/db.ts | handleCreateTask, RPCs |
| Crear assignments | UserProjectView.tsx | handleSaveSelectedTasks |
| Cargar vista usuario | UserProjectView.tsx | fetchAssignedTasks |
| Completar tarea | UserProjectView.tsx | handleSubmitStatus |
| Devolver tarea | Management.tsx | updateTaskWorkAssignment |
| Desasignar | UserProjectView.tsx | DELETE task_work_assignments |
| Reasignar | Management.tsx | handleUpdateAssignee |

---

## 12. Referencias

- `docs/FLUJO_TAREAS_USUARIO_END_TO_END.md` — Análisis detallado de fuentes de datos
- `docs/FLUJO_RETRABAJO_END_TO_END.md` — Tiempo de retrabajo en devueltas
- `docs/FLUJO_TAREAS_ATRASADAS.md` — Criterios de retrasada
- `docs/REGLAS_ACCESO_USUARIO.md` — Proyectos permitidos
