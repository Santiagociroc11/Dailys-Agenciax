# Guía: Cómo poner costos en todo el sistema

Esta guía explica cómo configurar y usar los costos en Dailys-Agenciax, desde la nómina hasta proyectos, reportes y alertas.

---

## 1. Requisitos previos

Para que los costos funcionen en todo el sistema necesitas:

1. **Usuarios con tarifa configurada**: Cada miembro del equipo debe tener `monthly_salary` (sueldo mensual) **o** `hourly_rate` (tarifa por hora).
2. **Registro de horas**: Los usuarios deben registrar horas en las tareas (`task_work_assignments` con `actual_duration`).

---

## 2. Configurar usuarios (paso obligatorio)

### Dónde
**Usuarios** → Editar cada usuario → sección "Nómina y pagos"

### Qué configurar
- **Salario mensual**: Para empleados con sueldo fijo. El coste por hora se calcula como `monthly_salary / 160`.
- **Tarifa por hora**: Para freelancers o facturación por hora. El coste = `horas × hourly_rate`.
- **Moneda**: COP, USD, EUR, etc.
- **Cuenta de pago**: Para nómina (opcional).

### Regla
- Si el usuario tiene **hourly_rate** > 0 → se usa para calcular coste por hora.
- Si no tiene hourly_rate pero tiene **monthly_salary** > 0 → se usa `monthly_salary/160` como tarifa efectiva por hora.
- Si no tiene ninguno → no se calcula coste para ese usuario.

---

## 3. Dónde aparecen los costos en el sistema

| Ubicación | Qué muestra |
|-----------|-------------|
| **Dashboard** | Nómina activa total del equipo, alertas de presupuesto con coste y presupuesto monto |
| **Nómina** | Nómina activa, total pagado por año, beneficiarios con montos |
| **Proyectos** | Coste real por proyecto en tarjeta y en modal de detalle |
| **Clientes** | Proyectos vinculados y coste total por cliente |
| **Reportes → Resumen** | Coste por cliente en el período |
| **Reportes → Facturación** | Coste por usuario, coste por cliente, coste por área |
| **Alertas de presupuesto** | Horas consumidas vs budget_hours, coste consumido y presupuesto monto |

---

## 4. Flujo de datos

```
Usuarios (monthly_salary / hourly_rate)
    ↓
task_work_assignments (user_id, actual_duration, project_id)
    ↓
Cálculos:
  - Nómina: suma de salarios o tarifas × 160h
  - Coste por proyecto: Σ (horas_usuario × tarifa_usuario) por proyecto
  - Coste por usuario: horas × tarifa en el período
  - Coste por área: igual, agrupado por área
```

---

## 5. Funcionalidades de costos

### Coste consumido por proyecto
- **RPC**: `get_project_cost_consumed`
- **Métrica**: `getProjectCostConsumed()`
- **Uso**: En la tarjeta y modal de cada proyecto se muestra "Coste real: X COP".

### Coste por cliente
- **RPC**: `get_cost_by_client` (con start_date y end_date)
- **Métrica**: `getCostByClient(startDate, endDate)`
- **Uso**: En Clientes se muestran proyectos y coste total. En Reportes (Resumen y Facturación) se muestra coste por cliente en el período.

El coste se calcula como: para cada asignación de trabajo en proyectos del cliente, `horas × tarifa del usuario`. Si el usuario tiene salario mensual, se usa `monthly_salary/160` como tarifa efectiva.

---

## 6. Próximos pasos posibles

1. **Alertas de presupuesto por coste**: Si el proyecto tiene `budget_amount`, comparar con el coste consumido y alertar cuando se supere.
2. **Coste en tareas**: Mostrar coste estimado (estimated_duration × tarifa) y coste real en cada tarea.
3. **Coste en Management**: Columna de coste en el kanban o en el detalle de tareas.
4. **Exportar costes por proyecto**: En Reportes, añadir vista de coste por proyecto en el período.

---

## 7. Resumen rápido

1. Ve a **Usuarios** y configura `monthly_salary` o `hourly_rate` para cada miembro del equipo.
2. Asegúrate de que el equipo registre horas en las tareas (actual_duration).
3. Los costos aparecerán automáticamente en: Dashboard, Nómina, Proyectos y Reportes.
