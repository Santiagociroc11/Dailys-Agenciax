# Análisis: Angelrudas15@gmail.com - Horas ejecutadas en cero

## Resumen

El usuario Luis Angel Rudas (Angelrudas15@gmail.com) tenía 8 horas de actividades retrasadas, entregó hoy, y en el Control de Horas aparecía 0 en Ejecutado.

## Hallazgos del diagnóstico

### Datos del usuario
- **ID:** 507c4cc9-23af-45e4-9280-4b8a4b4aec11
- **is_active:** activo (undefined = se considera activo)

### Asignaciones
- **Hoy (date = hoy):** 0 asignaciones
- **Retrasadas pendientes:** 0 (porque ya entregó)
- **Retrasadas ya entregadas:** 2 asignaciones con `actual_duration` total 1980 min (33 h)
  - Una de 2025-11-06 (60 min)
  - Una de 2026-03-03 (1920 min) - entregada hoy

### work_sessions
- **Sesiones completion creadas hoy:** 1 sesión con 1440 min (24 h)
- **createdAt:** Thu Mar 05 2026 12:10:42 GMT-0500

## Causa raíz

El Control de Horas filtraba `work_sessions` por el campo **`created_at`**, pero los documentos en MongoDB (Mongoose con `timestamps: true`) usan **`createdAt`**. La consulta devolvía 0 resultados aunque las sesiones existían.

## Corrección aplicada

En `src/pages/DailyHoursControl.tsx` se cambió el filtro de:
- `.gte('created_at', todayStartISO).lte('created_at', todayEndISO)`
a:
- `.gte('createdAt', todayStartISO).lte('createdAt', todayEndISO)`

Con este cambio, las horas de rework (entregas de actividades retrasadas) se contabilizan correctamente en Ejecutado.

## Script de diagnóstico

Para analizar otros usuarios con el mismo problema:

```bash
npx tsx scripts/diagnostico-horas-ejecutadas.ts <email>
```
