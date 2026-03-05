# Análisis: Actividades Extra que los usuarios pueden crear

## 1. ¿Qué son las "Actividades Adicionales"?

Los usuarios pueden crear **actividades propias** (reuniones, dailies, descansos, etc.) desde la vista de Gestión en `UserProjectView`. Estas se guardan en la tabla **`work_events`**.

### Ubicación en la UI
- **Ruta:** `/user/projects/:projectId` o `/user/projects/all`
- **Pestaña:** "Actividades" (junto a Sin avances, Con avances, Completadas, etc.)
- **Botón:** "➕ Nueva Actividad"

### Esquema `work_events`

| Campo        | Tipo   | Descripción                          |
|-------------|--------|--------------------------------------|
| `user_id`   | UUID   | Usuario que crea la actividad        |
| `date`      | string | Fecha (YYYY-MM-DD)                    |
| `title`     | string | Título (ej: "Daily Standup")          |
| `description` | string | Descripción opcional                |
| `start_time` | string | Hora inicio (HH:MM)                 |
| `end_time`  | string | Hora fin (HH:MM)                      |
| `event_type`| string | Tipo: meeting, daily, review, planning, training, break, other |
| `project_id`| UUID   | Opcional, puede ser null              |

**Duración:** Se calcula como `end_time - start_time` (minutos).

---

## 2. Flujo de creación

1. Usuario entra a Gestión → pestaña "Actividades"
2. Clic en "➕ Nueva Actividad"
3. Modal: título, tipo, hora inicio/fin, descripción
4. Se guarda en `work_events` con `user_id`, `date` (hoy), `start_time`, `end_time`
5. Aparece en "Actividades Adicionales de la Semana" y en el Gantt semanal

---

## 3. Relación con el Control de Horas

### Situación actual

El **Control de Horas** (`DailyHoursControl`) solo considera:
- `task_work_assignments` (tareas/subtareas de proyectos)

**No incluye** `work_events` (actividades adicionales).

### Consecuencia

Si un usuario:
- Planifica 6h en tareas (`task_work_assignments`)
- Crea 2h de reuniones/dailies en "Actividades Adicionales" (`work_events`)

El Control de Horas mostrará **6h** (o menos si no llega a 8h), aunque en realidad tenga **8h** contando reuniones.

---

## 4. Dónde se usan `work_events`

| Lugar                    | Uso                                                                 |
|--------------------------|---------------------------------------------------------------------|
| UserProjectView – Gantt  | Se mezclan con tareas en el Gantt semanal como tipo `event`        |
| UserProjectView – Actividades | Lista de actividades de la semana con duración                 |
| Modal eventos del día    | Crear/editar eventos para el día actual                             |

---

## 5. Propuesta: incluir `work_events` en Control de Horas

Para que el PM vea el **total real** de horas planificadas (tareas + actividades extras):

1. **Consultar** `work_events` donde `date = hoy`
2. **Calcular** minutos por usuario: `(end_time - start_time)` por evento
3. **Sumar** a las horas ya mostradas de `task_work_assignments`
4. **Mostrar** en la UI:
   - Columna "Extras" con horas de `work_events`
   - O integrar en la barra de progreso (ej. tercer color: púrpura para actividades extras)

### Filtro por proyectos

`work_events` tiene `project_id` opcional (puede ser null). Criterio coherente con el resto:
- Si `project_id` es null → incluir (actividad genérica)
- Si `project_id` está en proyectos activos → incluir
- Si `project_id` está en proyecto archivado → excluir

---

## 6. Resumen

| Fuente                    | Tabla                    | Control de Horas actual |
|---------------------------|--------------------------|--------------------------|
| Tareas/subtareas proyectos | `task_work_assignments` | ✅ Sí                     |
| Actividades adicionales  | `work_events`            | ❌ No                     |

**Recomendación:** Incluir `work_events` del día en el Control de Horas para reflejar el total real de horas planificadas por usuario.
