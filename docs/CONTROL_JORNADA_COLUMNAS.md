# Análisis de utilidad de columnas - Control de Jornada

## Resumen por columna

| Columna | Utilidad | Descripción | ¿Mantener? |
|---------|----------|-------------|------------|
| **Persona** | Alta | Identifica al usuario. Incluye resumen: tareas hoy, retrasadas y extras. Esencial para saber quién es cada fila. | ✅ Sí |
| **Estado** | Alta | Badge (En meta / Por debajo / Sin planificar / Con retrasos). Da el diagnóstico rápido: prioridad de atención. | ✅ Sí |
| **Progreso Jornada** | Alta | Barra visual que desglosa de dónde vienen las horas: planificado antes, asignado hoy, extras, retrabajos, retrasos. Permite ver si el problema es falta de asignación o de ejecución. | ✅ Sí |
| **Planificado** | Alta | Total de horas planificadas vs meta (8h). Métrica principal para saber si la jornada está cubierta. | ✅ Sí |
| **Ejecutado** | Media-Alta | Tiempo ya reportado/completado hoy. Útil para ver avance real vs planificado. | ✅ Sí |
| **Hoy** | Media | Horas y cantidad de tareas asignadas hoy mismo. Ayuda a distinguir trabajo pre-planificado vs asignación del día. | ✅ Sí |
| **Extras** | Media | Reuniones, dailies, descansos. Explica por qué alguien puede tener menos tiempo para tareas core. | ✅ Sí |
| **Retrasos** | Alta | Tareas de días anteriores sin completar. Indica cuellos de botella y carga acumulada. | ✅ Sí |
| **Retrabajos** | Media | Tareas devueltas que se corrigieron hoy. Señal de calidad y rework. | ✅ Sí |
| **Actividades disponibles** | Alta (nueva) | Subtareas que el usuario puede trabajar ahora (no bloqueadas por secuencia). Permite distinguir: "no tiene trabajo" vs "no se le ha asignado hoy". | ✅ Sí |

## Interpretación de "Actividades disponibles"

- **0 disponibles**: El usuario no tiene subtareas pendientes para trabajar (o están bloqueadas por dependencias).
- **> 0 disponibles y planificado bajo**: Hay trabajo disponible pero no se le asignó hoy para la jornada → problema de planificación.
- **> 0 disponibles y planificado OK**: Tiene trabajo y está planificado. Si ejecutado bajo, puede ser tema de ejecución o priorización.

## Columnas que podrían ser opcionales

- **Hoy**: Si solo se usa para planificación general, podría combinarse con "Planificado" en un tooltip. Se mantiene por claridad.
- **Extras**: Si la mayoría de equipos no usa work_events, podría ocultarse. Se mantiene por flexibilidad.
