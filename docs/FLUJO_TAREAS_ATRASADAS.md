# Flujo de tareas atrasadas / retrasadas (end-to-end)

Este documento describe cómo se identifican y muestran las tareas que el usuario dijo que haría en un día pasado y siguen pendientes (sin avances o con avances).

---

## 1. Fuente de datos: `task_work_assignments`

Todas las vistas de tareas asignadas parten de esta tabla:

| Campo | Descripción |
|-------|-------------|
| `user_id` | Usuario asignado |
| `date` | **Fecha para la que el usuario planificó trabajar** (ej: "2026-03-03") |
| `task_id` / `subtask_id` | Tarea o subtarea |
| `task_type` | `"task"` o `"subtask"` |
| `status` | `pending`, `assigned`, `in_progress`, `completed`, `in_review`, `approved`, `returned`, `blocked` |
| `project_id` | Proyecto (puede ser NULL en datos legacy) |
| `estimated_duration` | Minutos estimados |

**Definición de "retrasada":** Una asignación está retrasada cuando `date` es **anterior a hoy** y el `status` no es final (`completed`, `in_review`, `approved`).

---

## 2. Vistas del usuario

### 2.1 Mi día (`MiDiaView.tsx`)

**Ruta:** `/user/mi-dia`

**Flujo:**
1. Consulta `task_work_assignments` del usuario con `status` distinto de `completed`, `in_review`, `approved`.
2. Filtra por proyectos activos (`project_id` en proyectos no archivados).
3. Agrupa por rango de días desde la fecha asignada:
   - **Hoy** (0 días)
   - **1-2 días**
   - **3-7 días**
   - **8-14 días**
   - **15+ días**

**Criterio de retraso:**
```javascript
const getDaysSinceAssigned = (dateStr) => differenceInDays(hoy, fechaAsignada);
const isDelayed = (days) => days > 0;  // Cualquier día pasado = retrasada
```

**Visual:** Las tareas con `days > 0` se marcan en rojo y muestran "X días retrasada".

---

### 2.2 Gestión de tareas (`UserProjectView.tsx`)

**Ruta:** `/user/projects/:projectId` o `/user/projects/all`

**Flujo:**
1. Consulta `task_work_assignments` del usuario (excluyendo `completed`, `in_review`, `approved`).
2. Filtra por proyecto(s) permitidos.
3. Para cada asignación, clasifica en:
   - **Asignadas hoy:** `assignment.date === today`
   - **Retrasadas:** `assignment.date` existe y es **anterior a hoy**
   - **Devueltas:** `status === "returned"` en tasks/subtasks
   - **Bloqueadas:** `status === "blocked"`

**Código relevante (líneas ~2104-2117 y ~2192-2206):**
```javascript
if (assignment?.date === today) {
  todayAssignedItems.push(formattedTask);
} else if (assignment?.date) {
  // Es una tarea retrasada
  delayedAssignedItems.push(formattedTask);
  totalDelayTime += durationHours;
  const daysSinceAssignment = differenceInDays(new Date(), parseISO(assignment.date));
  // ...
}
```

**Subsecciones en la UI:**
- **Sin avances:** `filteredDelayedTaskItems.filter(task => !taskProgress[task.id] || taskProgress[task.id].length === 0)`
- **Con avances:** `filteredDelayedTaskItems.filter(task => taskProgress[task.id]?.length > 0)`

**Origen de "avances" (`taskProgress`):**
- Se obtiene de `status_history` donde `new_status === "in_progress"`.
- Cada registro de avance es un cambio de estado a `in_progress`.
- Se carga con `loadTaskProgressForKanban()` cuando el usuario entra a la pestaña de gestión.

---

### 2.3 Dashboard (admin)

**Ruta:** `/dashboard`

**Métrica "Atrasadas" (equipo):**
```javascript
overdueTasks = userAssignments.filter(a => 
  a.date < todayStr && !['completed', 'approved'].includes(a.status)
).length;
```

**Métrica "Atrasadas" (usuario individual):**
- Usa `allUserSubtasks` (subtasks asignadas al usuario).
- Criterio: `deadline` de la tarea/subtask ya pasó y status no es `completed`/`approved`.
- Aquí "atrasada" = **deadline vencido**, no la fecha de asignación en `task_work_assignments`.

---

## 3. Resumen de criterios

| Vista | "Retrasada" / "Atrasada" |
|-------|---------------------------|
| **Mi día** | `assignment.date` < hoy |
| **Gestión (UserProjectView)** | `assignment.date` < hoy |
| **Dashboard equipo** | `assignment.date` < hoy |
| **Dashboard usuario** | `task.deadline` < hoy (usa deadline, no date) |

---

## 4. "Sin avances"

En UserProjectView, una tarea retrasada "sin avances" es aquella que:
- Tiene `assignment.date` en el pasado.
- No tiene registros en `status_history` con `new_status = "in_progress"`.

Los avances se registran cuando el usuario cambia el estado a "En progreso" (o similar) desde el modal de la tarea. Eso inserta en `status_history`.

---

## 5. Flujo completo del usuario

```
1. Usuario entra a "Mi día"
   → Ve sus asignaciones pendientes agrupadas por "Hoy", "1-2 días", etc.
   → Las de días pasados aparecen en rojo como "retrasadas"

2. Usuario entra a "Gestión" (proyectos)
   → Ve pestañas: "Sin avances" | "Con avances"
   → "Sin avances": retrasadas + asignadas hoy que no tienen status_history in_progress
   → "Con avances": retrasadas + asignadas hoy que SÍ tienen avances en status_history

3. Usuario trabaja en una tarea
   → Cambia estado a "En progreso" → se inserta en status_history
   → La tarea pasa de "Sin avances" a "Con avances"

4. Usuario completa la tarea
   → Status → completed → la asignación ya no aparece en pendientes
   → Ya no cuenta como retrasada
```

---

## 6. Posibles inconsistencias

1. **Dashboard usuario vs resto:** El dashboard individual usa `deadline` de la tarea; las demás vistas usan `assignment.date`. Pueden no coincidir.
2. **project_id NULL:** Si `task_work_assignments.project_id` es NULL, MiDiaView las excluye (filtra por proyectos activos). UserProjectView las excluye si se filtra por `project_id`.
3. **Avances:** Solo se consideran avances los cambios a `in_progress` en `status_history`. Las sesiones en `work_sessions` no se usan para "avances" en la UI de gestión (sí para tiempo ejecutado).
