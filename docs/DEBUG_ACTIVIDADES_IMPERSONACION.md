# Debug: Actividades en "Ver como" vs sesión real + "Sin proyecto"

## Problema descrito

- **Ver como** (impersonación): no aparecen actividades disponibles
- **Iniciar sesión normalmente**: aparecen muchas actividades pendientes
- Algunas actividades muestran **"Sin proyecto"**

---

## Causa raíz (corregida)

### 1. Impersonación sin `assigned_projects`

Al usar "Iniciar sesión como" desde la lista de usuarios, el objeto del usuario no incluía `assigned_projects`. La vista de **Gestión de tareas** (`UserProjectView`) filtra las tareas por `user.assigned_projects` para usuarios no-admin. Sin ese campo, el filtro fallaba y no se mostraban tareas.

**Corrección aplicada:**
- `Users.tsx`: se incluye `assigned_projects` en el `select` al cargar usuarios
- `AuthContext.tsx`: al impersonar, se refresca el usuario desde la BD para tener `assigned_projects` actualizado

### 2. "Sin proyecto"

Aparece cuando `projectMap.get(project_id)` no encuentra el proyecto. Posibles causas:

| Causa | Dónde ocurre | Cómo verificar |
|-------|--------------|----------------|
| `project_id` nulo en `task_work_assignments` | Asignaciones de hoy (Mi día) | Ver columna `project_id` en la tabla |
| Proyecto eliminado o archivado | Tareas/subtareas | Comprobar que el proyecto exista y no esté archivado |
| Subtarea cuya tarea padre cambió de proyecto | Subtareas | Revisar `tasks.project_id` vs `task_work_assignments.project_id` |
| `project_id` desactualizado en asignaciones | Histórico | Triggers o migraciones pueden no haber actualizado todas las filas |

---

## Cómo hacer debug

### Paso 1: Verificar datos del usuario impersonado

En la consola del navegador (F12), tras impersonar:

```javascript
// Ver usuario actual
JSON.parse(localStorage.getItem('user'))

// Comprobar que assigned_projects existe y tiene IDs
// Ejemplo esperado: { id: "...", name: "...", assigned_projects: ["uuid1", "uuid2"], ... }
```

### Paso 2: Debug de "Sin proyecto" en Mi día

Añadir temporalmente en `MiDiaView.tsx` dentro de `fetchTodaysAssignments` (tras construir `projectMap`):

```javascript
// DEBUG: asignaciones con project_id no encontrado en projectMap
const sinProyecto = filteredAssignments.filter(a => {
  const pid = a.project_id;
  return !pid || !projectMap.has(pid);
});
if (sinProyecto.length > 0) {
  console.warn('[DEBUG Mi día] Asignaciones sin proyecto en projectMap:', sinProyecto);
  console.warn('projectMap keys:', [...projectMap.keys()]);
}
```

### Paso 3: Consulta SQL para asignaciones huérfanas

Ejecutar en Supabase SQL Editor:

```sql
-- Asignaciones de hoy con project_id nulo o proyecto inexistente/archivado
SELECT twa.id, twa.user_id, twa.task_id, twa.task_type, twa.subtask_id, twa.project_id, twa.date
FROM task_work_assignments twa
LEFT JOIN projects p ON p.id = twa.project_id
WHERE twa.date = CURRENT_DATE
  AND twa.status NOT IN ('completed', 'in_review', 'approved')
  AND (twa.project_id IS NULL OR p.id IS NULL OR p.is_archived = true);
```

### Paso 4: Verificar proyectos asignados al usuario

```sql
-- Reemplazar USER_ID por el id del usuario afectado
SELECT id, name, assigned_projects 
FROM users 
WHERE id = 'USER_ID';
```

### Paso 5: Logs en UserProjectView

En `UserProjectView.tsx`, dentro de `fetchProjectTasksAndSubtasks`, añadir al inicio:

```javascript
console.debug('[UserProjectView]', {
  userId: user?.id,
  isAdmin,
  allowedProjectIds,
  projectId,
  projectFilter: !isAll ? [projectId!] : allowedProjectIds,
});
```

---

## Resumen de archivos relevantes

| Archivo | Rol |
|---------|-----|
| `src/contexts/AuthContext.tsx` | Impersonación, `assigned_projects` al impersonar |
| `src/pages/Users.tsx` | Lista de usuarios, `assigned_projects` en el fetch |
| `src/pages/UserProjectView.tsx` | Gestión de tareas, filtro por `allowedProjectIds` |
| `src/pages/MiDiaView.tsx` | Mi día, asignaciones de hoy, `projectMap` → "Sin proyecto" |
| `task_work_assignments` | Tabla de asignaciones diarias, columna `project_id` |
