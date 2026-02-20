# Optimizaciones funcionales y de negocio

Propuestas para aumentar la **utilidad** y el **valor** de Dailys para la agencia, desde la perspectiva del negocio y los usuarios.

---

## 1. Entidad Cliente

**Situación**: Solo existen Proyectos. En una agencia, los proyectos suelen pertenecer a un cliente.

**Propuesta**: Añadir entidad **Cliente** (nombre, contacto, tarifa/hora opcional). Los proyectos se vinculan a un cliente.

**Valor**: 
- Reportes por cliente
- Facturación por cliente
- Historial de trabajo con cada cliente

---

## 2. Vinculación con facturación

**Situación**: Se registran horas (estimated_duration, actual_duration) pero no hay salida para facturación.

**Propuesta**: 
- Exportar horas por cliente/proyecto en formato CSV o PDF listo para facturar
- Marcar tareas como "facturable" o "no facturable" (ej: reuniones internas)
- Tarifa por proyecto o por cliente (opcional)

**Valor**: Reducir trabajo manual al cerrar facturas; menos errores.

---

## 3. Presupuesto por proyecto

**Situación**: No hay presupuesto ni alertas de sobrecoste.

**Propuesta**: 
- Campo "horas presupuestadas" o "presupuesto" por proyecto
- Indicador cuando las horas reales superan el presupuesto (ej: 80%, 100%, 120%)
- Alertas en Dashboard o por Telegram

**Valor**: Detectar desvíos antes de que el proyecto se cierre.

---

## 4. Plantillas de proyectos

**Situación**: Proyectos repetitivos (ej: mismo tipo de campaña) se crean desde cero.

**Propuesta**: 
- Crear "plantillas" con estructura de tareas y subtareas predefinida
- Al crear proyecto, opción "Usar plantilla" que copia la estructura
- Plantillas por tipo (ej: "Campaña digital", "Redes sociales")

**Valor**: Menos tiempo en configuración; consistencia entre proyectos similares.

---

## 5. Archivos adjuntos en tareas

**Situación**: Los entregables se describen en texto; no hay adjuntos.

**Propuesta**: Permitir adjuntar archivos a tareas/subtareas (entregables, bocetos, referencias).

**Valor**: Todo el contexto en un solo sitio; menos búsqueda en correos o drives.

---

## 6. Filtros por período en reportes

**Situación**: Los reportes muestran datos "actuales" sin filtro de fechas.

**Propuesta**: 
- Selector de período (esta semana, este mes, último mes, rango personalizado)
- Comparar períodos (ej: este mes vs mes anterior)

**Valor**: Análisis de tendencias; reportes para reuniones de cierre de mes.

---

## 7. Recordatorios de vencimiento

**Situación**: Las notificaciones de Telegram cubren cambios de estado, no vencimientos.

**Propuesta**: 
- Notificación X días antes del deadline (configurable)
- Resumen diario: "Tienes N tareas que vencen hoy"

**Valor**: Menos tareas vencidas por olvido.

---

## 8. Rol Project Manager (PM)

**Situación**: Solo Admin y User. El admin tiene todo el control.

**Propuesta**: Rol **PM** que puede:
- Gestionar proyectos asignados (crear tareas, asignar, aprobar)
- Ver reportes de sus proyectos
- Sin acceso a usuarios, áreas ni configuración global

**Valor**: Delegar sin dar acceso total; escalar la operación.

---

## 9. Vista "Mi día" para usuarios

**Situación**: El usuario entra a `/user` y debe elegir proyecto. No hay vista global de "mis tareas hoy".

**Propuesta**: 
- Vista "Mi día" o "Resumen" con todas las tareas asignadas hoy, de todos los proyectos
- Acceso rápido a la tarea en la que está trabajando

**Valor**: Menos clics; foco en el trabajo del día.

---

## 10. Vista de capacidad del equipo

**Situación**: No hay forma rápida de ver quién tiene disponibilidad.

**Propuesta**: 
- Vista "Carga de trabajo" por semana: horas asignadas vs horas disponibles por persona
- Indicador de sobrecarga o subutilización
- Ayudar a distribuir trabajo de forma equilibrada

**Valor**: Mejor asignación; evitar cuellos de botella.

---

## 11. Múltiples aprobadores (opcional)

**Situación**: Un solo admin aprueba. En equipos grandes puede ser cuello de botella.

**Propuesta**: 
- Asignar "revisores" por proyecto o por área
- Solo los revisores asignados pueden aprobar/devolver
- Cola de revisión visible para el revisor

**Valor**: Distribuir la carga de revisión; aprobaciones más rápidas.

---

## 12. Historial de cambios (auditoría)

**Situación**: status_history registra cambios de estado; no hay registro de otros cambios.

**Propuesta**: 
- Log de cambios relevantes: quién modificó qué y cuándo (reasignación, cambio de deadline, edición de descripción)
- Consultable en la tarea o en un panel de auditoría

**Valor**: Trazabilidad; resolver dudas sobre cambios pasados.

---

## 13. Objetivos / criterios de éxito del proyecto

**Situación**: No hay definición explícita de "éxito" del proyecto.

**Propuesta**: 
- Campo "Objetivo" o "Entregable principal" por proyecto
- Indicador de avance hacia ese objetivo (manual o basado en tareas completadas)
- Cierre formal del proyecto con checklist

**Valor**: Claridad sobre qué significa "terminar" un proyecto.

---

## Prioridad sugerida (valor de negocio)

| Prioridad | Funcionalidad              | Esfuerzo | Impacto en negocio     |
|----------|----------------------------|----------|------------------------|
| P1       | Entidad Cliente            | Medio    | Alto (base para facturación) |
| P1       | Exportar horas para facturar| Bajo     | Alto (ahorro de tiempo)      |
| P1       | Filtros por período en reportes | Bajo | Alto (toma de decisiones)     |
| P2       | Plantillas de proyectos    | Medio    | Alto (eficiencia)            |
| P2       | Vista "Mi día"             | Bajo     | Alto (experiencia usuario)    |
| P2       | Recordatorios de vencimiento | Bajo    | Medio                          |
| P3       | Presupuesto por proyecto   | Medio    | Alto (control financiero)     |
| P3       | Rol Project Manager        | Medio    | Alto (escalabilidad)          |
| P3       | Vista de capacidad         | Medio    | Medio (asignación equilibrada) |
| P4       | Archivos adjuntos          | Alto     | Medio                          |
| P4       | Múltiples aprobadores      | Medio    | Medio (equipos grandes)        |
| P4       | Auditoría / historial      | Medio    | Medio (trazabilidad)           |
