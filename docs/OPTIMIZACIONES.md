# Optimizaciones recomendadas

## 1. CRÍTICO – Seguridad: contraseñas en texto plano

**Problema**: Las contraseñas se guardan y comparan en texto plano. Es un riesgo grave.

**Solución**: Usar bcrypt en el backend.

```typescript
// Al crear/actualizar usuario: hash con bcrypt
// Al login: comparar con bcrypt.compare()
```

- Añadir `bcrypt` al proyecto
- Crear endpoint `/api/auth/login` y `/api/auth/register` en el backend
- Nunca exponer contraseñas al frontend; el backend valida y devuelve token/sesión

---

## 2. Script de migración – operaciones en lote

**Problema**: Se usa `findOneAndUpdate` en un bucle (N consultas por tabla).

**Solución**: Usar `bulkWrite` con operaciones `updateOne` + `upsert: true`.

```typescript
await Model.bulkWrite(
  rows.map((r) => ({
    updateOne: {
      filter: { id: r.id },
      update: { $set: transform(r) },
      upsert: true,
    },
  }))
);
```

**Impacto**: Migración mucho más rápida (p. ej. 10x en tablas grandes).

---

## 3. Upsert en `queryExecutor` – operaciones en lote

**Problema**: `executeUpsert` hace un `findOneAndUpdate` por cada elemento del array.

**Solución**: Usar `bulkWrite` cuando hay varios items.

```typescript
if (items.length > 1) {
  const ops = items.map((record) => ({
    updateOne: {
      filter: buildFilter(record, keys),
      update: { $set: record },
      upsert: true,
    },
  }));
  await model.bulkWrite(ops);
}
```

---

## 4. `executeUpdate` – evitar segundo `find`

**Problema**: Tras `updateMany` se hace otro `find` para devolver los documentos actualizados.

**Solución**: 
- Si no se necesita el resultado completo, no hacer el segundo `find`
- O usar `updateMany` con `returnDocuments` (según versión de Mongoose) si se requiere

---

## 5. Frontend – code splitting

**Problema**: Bundle de ~992 KB; todo se carga al inicio.

**Solución**: Lazy loading de rutas.

```typescript
// En el router
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Tasks = lazy(() => import('./pages/Tasks'));
// etc.
```

**Impacto**: Menor tiempo de carga inicial y mejor FCP.

---

## 6. API – validación y límites

**Problema**: No hay validación de body ni límite de tamaño.

**Solución**:
- Añadir `express.json({ limit: '100kb' })`
- Validar estructura de `QueryRequest` (p. ej. con Zod)
- Rechazar tablas u operaciones no permitidas

---

## 7. Caché para datos frecuentes

**Problema**: `app_settings` y listas de usuarios se consultan muchas veces.

**Solución**: Caché en memoria con TTL corto (p. ej. 60 s) para:
- `getAdminTelegramId()`
- Listas de usuarios en dropdowns

---

## 8. Índices compuestos

**Problema**: Algunas consultas podrían beneficiarse de índices compuestos.

**Solución**: Añadir índices como:

```javascript
// task_work_assignments: consultas por usuario + fecha + estado
{ user_id: 1, date: 1, status: 1 }

// status_history: consultas por tarea/subtarea + fecha
{ task_id: 1, changed_at: 1 }
{ subtask_id: 1, changed_at: 1 }
```

---

## 9. Eliminar dependencia de Supabase

**Problema**: `@supabase/supabase-js` sigue en `package.json` aunque ya no se usa en la app.

**Solución**: Moverla a `devDependencies` o eliminarla; el script de migración puede usar `npx supabase` o un cliente HTTP directo si hace falta.

---

## 10. `resolveJoinFilters` – consultas en paralelo

**Problema**: Los filtros de join se resuelven en secuencia.

**Solución**: Resolver en paralelo con `Promise.all` cuando haya varios filtros de join.

---

---

# Lógica de negocio y metodología

## 11. Componentes gigantes (God components)

**Problema**: `UserProjectView.tsx` (~7.000 líneas), `Management.tsx` (~4.500 líneas). Lógica de negocio, estado, UI y acceso a datos mezclados.

**Solución**: Dividir por responsabilidad:
- **Hooks**: `useAssignedTasks`, `useTaskStatusUpdate`, `useWorkEvents`
- **Subcomponentes**: `TaskCard`, `TaskList`, `StatusModal`, `WorkEventForm`
- **Servicios**: `taskService`, `assignmentService` (ver punto 13)

---

## 12. Tipos duplicados

**Problema**: `Task`, `Subtask`, `Project` definidos 4+ veces (UserProjectView, Tasks, Management, Projects) con pequeñas variaciones.

**Solución**: Tipos de dominio centralizados en `src/domain/` o `src/types/`:

```
src/types/
  task.ts      → Task, Subtask, TaskStatus, TaskNotes
  project.ts   → Project
  user.ts      → User, UserWithAreas
  index.ts     → re-exports
```

---

## 13. Sin capa de servicios / casos de uso

**Problema**: Los componentes llaman directamente a `supabase.from()`. La lógica de negocio (transiciones de estado, validaciones, reglas secuenciales) está dispersa en los componentes.

**Solución**: Capa de aplicación con servicios o casos de uso:

```
src/services/  (o src/application/)
  taskService.ts       → updateTaskStatus, createTask, assignTask
  assignmentService.ts → createDailyAssignments, removeAssignment
  metricsService.ts    → getUserMetrics, getProjectMetrics (extraer de metrics.ts)
```

Cada servicio encapsula reglas de negocio y orquesta las llamadas a la API/DB.

---

## 14. Máquina de estados para status

**Problema**: Las transiciones de estado (pending → assigned → completed → in_review → approved) no están definidas explícitamente. Cada componente valida a su manera.

**Solución**: Definir transiciones permitidas en un solo lugar:

```typescript
// src/domain/taskStatus.ts
const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['assigned', 'blocked'],
  assigned: ['in_progress', 'blocked'],
  in_progress: ['completed', 'blocked'],
  completed: ['in_review'],
  in_review: ['approved', 'returned'],
  returned: ['in_progress'],
  blocked: ['assigned', 'in_progress'],
  approved: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from]?.includes(to) ?? false;
}
```

---

## 15. Validación centralizada

**Problema**: Validaciones repartidas (fechas, duraciones, campos obligatorios) sin esquemas reutilizables.

**Solución**: Usar Zod (o similar) para esquemas de validación:

```typescript
// src/schemas/task.ts
export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  estimated_duration: z.number().positive(),
  deadline: z.string().datetime(),
  // ...
});
```

---

## 16. metrics.ts como orquestador

**Problema**: `metrics.ts` (~1.100 líneas) mezcla fetching, transformación y cálculo de métricas.

**Solución**: Separar en:
- **Repositorios/queries**: obtener datos crudos
- **Calculadores**: `calculateCompletionRate()`, `calculateUtilization()`
- **Orquestador**: `getUserMetrics()` que compone ambos

---

## 17. Arquitectura por capas (opcional)

Para escalar mejor, una estructura tipo Clean/Hexagonal:

```
src/
  domain/          → Entidades, reglas, tipos (sin dependencias externas)
  application/     → Casos de uso, servicios
  infrastructure/  → API client, adaptadores
  presentation/    → Componentes, hooks, páginas
```

No es obligatorio aplicarlo todo de golpe; se puede ir migrando por módulos (p. ej. empezar por Tasks).

---

## Prioridad sugerida (lógica y metodología)

| Prioridad | Optimización           | Esfuerzo | Impacto   |
|----------|------------------------|----------|-----------|
| P1       | Tipos centralizados    | Bajo     | Alto      |
| P1       | Máquina de estados     | Bajo     | Alto      |
| P2       | Capa de servicios      | Alto     | Muy alto  |
| P2       | Dividir UserProjectView| Alto     | Alto      |
| P2       | Dividir Management     | Alto     | Alto      |
| P3       | Refactor metrics.ts    | Medio    | Medio     |
| P3       | Validación con Zod     | Medio    | Medio     |
| P4       | Arquitectura por capas | Alto     | Largo plazo |

---

## Prioridad sugerida (técnicas – resumen)

| Prioridad | Optimización              | Esfuerzo | Impacto   |
|----------|---------------------------|----------|-----------|
| P0       | Contraseñas con bcrypt    | Medio    | Crítico   |
| P1       | Migración con bulkWrite   | Bajo     | Alto      |
| P1       | Upsert con bulkWrite      | Bajo     | Alto      |
| P2       | Code splitting frontend   | Medio    | Alto      |
| P2       | Validación API            | Bajo     | Medio     |
| P3       | Caché app_settings        | Bajo     | Medio     |
| P3       | Índices compuestos        | Bajo     | Medio     |
| P4       | Join filters en paralelo  | Bajo     | Bajo      |
