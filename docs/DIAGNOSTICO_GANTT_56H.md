# Diagnóstico: 56 horas en Gantt Semanal (EDICION DE VSL CERO DOLOR)

## Resumen

El Gantt Semanal mostraba **56h** (32h martes + 24h jueves) para la tarea "EDICION DE VSL CERO DOLOR". El diagnóstico interno revela **doble conteo** del mismo trabajo.

---

## Datos reales en base de datos

### task_work_assignments
- **1 asignación** con `date: 2026-03-03` (martes)
- `estimated_duration`: 480 min (8h)
- `actual_duration`: 1920 min (32h)
- `status`: completed

### work_sessions (2 sesiones para esa asignación)
| Tipo       | duration_minutes | Creada (createdAt)   |
|------------|------------------|----------------------|
| progress   | 480 min (8h)     | 2026-03-04 00:33:58  |
| completion | 1440 min (24h)   | 2026-03-05 17:10:42  |
| **Total**  | **1920 min (32h)** |                      |

### status_history
- **1 registro** `completed` el 2026-03-05 17:10:42
- `metadata.duracion_real`: 1440 min (24h)

---

## Cómo el Gantt calcula las 56h

### 1. work_sessions → Martes (32h)
`getWorkSessionsForGantt` agrupa las sesiones por **`assignment.date`**, no por cuándo se creó la sesión.

- Las 2 work_sessions tienen `assignment.date = 2026-03-03`
- Suma: 480 + 1440 = **1920 min (32h)** → se muestran el **martes 03**

### 2. getOffScheduleWork → Jueves (24h)
`getOffScheduleWork` busca `status_history` con `new_status: completed` en la semana. Si el día de finalización **no estaba planificado**, suma `metadata.duracion_real` como "EXTRA".

- La tarea se completó el **jueves 05** (2026-03-05)
- El jueves no tenía sesión planificada
- Suma: **1440 min (24h)** → se muestran el **jueves 05** como "EXTRA"

### Total mostrado: 32h + 24h = **56h**

---

## Problema: doble conteo

El mismo trabajo se cuenta **dos veces**:

1. **work_sessions**: la sesión `completion` (1440 min) se agrupa bajo `assignment.date` = martes → **24h el martes**
2. **getOffScheduleWork**: el `status_history` completed (duracion_real 1440 min) se suma al jueves → **24h el jueves**

Las 24h de la finalización aparecen tanto en martes (vía work_sessions) como en jueves (vía offSchedule). El trabajo real es **32h en total**, no 56h.

Además, **32h en un solo día** no es posible; las horas se atribuyen al día de la asignación, no al día en que realmente se trabajó.

---

## Script de diagnóstico

```bash
npx tsx scripts/diagnostico-gantt-56h.ts [email] [titulo-busqueda]
# Ejemplo:
npx tsx scripts/diagnostico-gantt-56h.ts Angelrudas15@gmail.com "VSL CERO DOLOR"
```

---

## Posibles correcciones

1. **Evitar doble conteo en getOffScheduleWork**: No sumar `duracion_real` si ya existe work_session de tipo `completion` para esa tarea en la semana (o si el total de work_sessions ya cubre ese trabajo).

2. **Agrupar work_sessions por fecha real**: En lugar de `assignment.date`, usar la fecha de creación de la sesión (`createdAt`) para asignar las horas al día correcto. Así las 24h de completion irían al jueves y no al martes.

3. **Excluir offSchedule cuando hay work_sessions**: Si `taskGroup.workSessions` tiene datos, no sumar además el offSchedule para esa tarea (o restar la parte ya contada).
