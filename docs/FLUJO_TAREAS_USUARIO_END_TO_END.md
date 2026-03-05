# Análisis end-to-end: flujo de tareas y usuario

Documentación completa del flujo end-to-end de tareas y usuarios, basada exclusivamente en el análisis del código.

---

## 1. Modelo de datos

```
tasks ──┬── subtasks
        └── task_work_assignments (task_type=task)
subtasks ─── task_work_assignments (task_type=subtask)
task_work_assignments ─── work_sessions (assignment_id)
projects ─── tasks (project_id)
users ─── task_work_assignments (user_id)
```

- **tasks** / **subtasks**: estado en la entidad (`assigned_users`, `assigned_to`, `status`)
- **task_work_assignments**: asignación diaria (`user_id`, `date`, `task_id`/`subtask_id`, `estimated_duration`, `actual_duration`, `status`)
- **work_sessions**: sesiones de trabajo (`assignment_id`, `duration_minutes`, `session_type`: `progress`|`completion`|`block`)

---

## 2. Creación de task_work_assignments

| Origen | Archivo | Líneas | Condición |
|--------|---------|--------|-----------|
| Usuario planifica en Mi día | `src/pages/UserProjectView.tsx` | 1594-1644 | `handleSaveSelectedTasks()` – upsert con `date=hoy` |
| Usuario completa sin asignación previa | `src/pages/UserProjectView.tsx` | 2572-2598 | `getAssignmentId` null + status `completed`/`in_progress` |
| Usuario programa próxima sesión | `src/pages/UserProjectView.tsx` | 2637-2674 | status `in_progress` + `nextWorkDate` |

**No se crean** al:
- Crear tareas en `src/pages/Tasks.tsx` (668-962)
- Crear proyecto desde plantilla en `api/db.ts` (697-754)
- Asignar usuarios en `src/pages/Projects.tsx`

---

## 3. Cambios de estado: quién actualiza qué

### 3.1 UserProjectView – modal de estado (flujo principal)

**Función:** `handleSubmitStatus()` en `src/pages/UserProjectView.tsx` (2532-2703)

| Paso | Tabla | Acción |
|------|-------|--------|
| 1 | tasks/subtasks | `update status` |
| 2 | task_work_assignments | `update status` (por `user_id`, `task_type`, `task_id`/`subtask_id`) |
| 3 | work_sessions | `insert` (si hay `assignmentId`) |
| 4 | task_work_assignments | `update actual_duration` si status `completed` o `in_review` |
| 5 | status_history | `insert` |

**Único flujo que:**
- Crea `work_sessions`
- Actualiza `actual_duration`

### 3.2 UserProjectView – actualización rápida (código muerto)

**Función:** `handleUpdateTaskStatus()` en `src/pages/UserProjectView.tsx` (1810-1894)

- No se usa en ningún sitio (linter: "declared but its value is never read")
- Si se usara: actualiza tasks/subtasks y task_work_assignments con `.eq("date", today)`
- No crea `work_sessions` ni actualiza `actual_duration`

### 3.3 Management – admin

**Función:** `updateItemStatus()` en `src/pages/Management.tsx` (649-1096)

| Acción | tasks/subtasks | task_work_assignments | work_sessions | actual_duration |
|--------|----------------|----------------------|---------------|-----------------|
| approved, in_review, completed | Sí | No | No | No |
| returned | Sí | Sí (vía `updateTaskWorkAssignment`) | No | No |
| blocked → pending | Sí | Sí (elimina) | No | No |

### 3.4 Tasks – admin

**Función:** `handleStatusUpdate()` en `src/pages/Tasks.tsx` (964-980)

- Solo actualiza `subtasks.status`
- No toca `task_work_assignments`, `work_sessions` ni `actual_duration`

---

## 4. Control de Horas – fuentes de datos

**Archivo:** `src/pages/DailyHoursControl.tsx` (88-348)

| Variable | Query | Filtro |
|----------|-------|--------|
| todayAssignments | task_work_assignments | `date = hoy` |
| overdueAssignments | task_work_assignments | `date < hoy`, status no en completed/in_review/approved |
| reworkRecords | status_history | `previous_status=returned`, `new_status` in completed/in_review, `changed_at` hoy |
| workEvents | work_events | `date = hoy` |
| reworkSessions | work_sessions | `session_type=completion`, `created_at` hoy |

### Cálculo de Ejecutado

```
Ejecutado = actualMinutesToday + reworkMinutes
```

- **actualMinutesToday**: suma de `actual_duration` de `todayAssignments` (assignments con `date = hoy`)
- **reworkMinutes**: suma de `duration_minutes` de `reworkSessions` cuyos `assignment_id` pertenecen a assignments con `date < hoy`

### Cálculo de Hoy

- **assignedTodayCount** / **assignedTodayMinutes**: assignments con `created_at` entre inicio y fin del día

### Filtros

- Solo proyectos con `is_archived = false`
- Solo usuarios con `is_active !== false`

---

## 5. Rutas y vistas del usuario

| Ruta | Vista | Rol | Fuente principal |
|------|-------|-----|------------------|
| /user/mi-dia | MiDiaView | Usuario | task_work_assignments (status no final) |
| /user/projects/:projectId | UserProjectView | Usuario | task_work_assignments + tasks/subtasks |
| /management | Management | Admin | tasks/subtasks |
| /tasks | Tasks | Admin | tasks/subtasks |
| /daily-hours | DailyHoursControl | Admin | task_work_assignments + work_sessions + work_events |

---

## 6. Flujo completo

1. **Creación**: Tasks.tsx / Projects crean tasks + subtasks. NO crean task_work_assignments.
2. **Planificación**: Usuario va a UserProjectView (Mi día), selecciona tareas, guarda → `handleSaveSelectedTasks` hace upsert en task_work_assignments con date=hoy.
3. **Completar**: Usuario abre modal de estado → `handleSubmitStatus` actualiza tasks/subtasks, task_work_assignments, crea work_sessions, actualiza actual_duration.
4. **Alternativos**: Management (aprobar/devolver) solo actualiza tasks/subtasks; Tasks handleStatusUpdate solo actualiza subtasks. Ninguno crea work_sessions ni actualiza actual_duration.
5. **Control de Horas**: Lee todayAssignments (date=hoy), reworkSessions (completion de hoy para date<hoy), work_events. Ejecutado = actual_duration + reworkMinutes.

---

## 7. Casos donde no aparece Ejecutado ni Hoy

| Caso | Motivo |
|------|--------|
| Usuario completa desde Management | Management no crea `work_sessions` ni actualiza `actual_duration` |
| Admin cambia status desde Tasks | Tasks solo actualiza `subtasks`, no `task_work_assignments` |
| Usuario nunca planificó en Mi día | Sin assignment previo, se crea on-the-fly al completar (fix aplicado) |
| Usuario completa tarea con `date` de día anterior | Assignment con `date < hoy` → tiempo va a `reworkMinutes` (sí aparece en Ejecutado) |

---

## 8. Resumen de archivos relevantes

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/pages/UserProjectView.tsx` | Crear assignments, work_sessions, actual_duration (único flujo completo) |
| `src/pages/Management.tsx` | Cambiar status tasks/subtasks; devolver → update assignment; aprobar → no toca assignments |
| `src/pages/Tasks.tsx` | Crear tareas; cambiar status subtasks (sin assignments) |
| `src/pages/DailyHoursControl.tsx` | Leer todayAssignments, reworkSessions, work_events |
| `src/pages/MiDiaView.tsx` | Mostrar assignments pendientes del usuario |
