# Reglas de acceso de usuario

Documento de referencia para la lógica centralizada en `src/lib/userAccess.ts`.

## Proyectos permitidos

Un usuario puede ver un proyecto si cumple **al menos una** de estas condiciones:

1. **assigned_projects**: El proyecto está en `users.assigned_projects`.
2. **task_work_assignments**: Tiene asignaciones pendientes en ese proyecto (estado distinto de `completed`, `in_review`, `approved`).
3. **Subtareas asignadas**: Tiene subtareas asignadas (`subtasks.assigned_to`) en ese proyecto cuyo estado no es `approved`.

Además, el proyecto no debe estar archivado (`projects.is_archived = false`).

## Estados de tareas/subtareas

### Estados finales (horas contabilizadas)

- `completed`
- `in_review`
- `approved`

Usados en: Dashboard (métricas de horas), consultas de tareas entregadas.

### Estados trabajables

- `pending`
- `in_progress`
- `in_review`
- `returned`
- `assigned`

Usados en: DailyHoursControl (actividades disponibles), filtros de tareas en curso.

### Estados de asignación pendiente

- `pending`
- `assigned`
- `in_progress`
- `blocked`
- `returned`

Usados en: `task_work_assignments` para determinar si el usuario tiene trabajo pendiente en un proyecto.

## Impersonación

- Al impersonar, `isAdmin = false` (se usa la vista del usuario impersonado).
- Se usa siempre el `user` del usuario impersonado.
- `assigned_projects` se refresca desde la BD al iniciar impersonación.

## Refresco de datos

- Al cargar la app desde `localStorage`, se refresca `assigned_projects` desde la BD.
- Esto evita que el usuario vea datos desactualizados tras cambios en la asignación.
