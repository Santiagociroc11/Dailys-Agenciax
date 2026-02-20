# Recordatorios de vencimiento

## Estado actual

Ya existe un sistema de recordatorios por Telegram:

### Endpoints disponibles

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/telegram/deadline-reminders` | POST | Envía recordatorios de tareas/subtareas que vencen en N días |
| `/api/telegram/daily-summary` | POST | Envía resumen diario de tareas que vencen hoy a cada usuario |

### Cómo funciona `deadline-reminders`

- **Body**: `{ "days": 1 }` — días hacia adelante (1 = mañana, 0 = hoy).
- Busca tareas y subtareas con `deadline` en esa fecha y estado distinto de `approved`.
- Envía un mensaje por Telegram a cada usuario asignado que tenga `telegram_chat_id`.
- Requiere `TELEGRAM_BOT_TOKEN` en `.env`.

### Cómo funciona `daily-summary`

- Busca tareas/subtareas que vencen **hoy**.
- Agrupa por usuario y envía un resumen a cada uno por Telegram.

---

## Configuración recomendada (cron)

Ejecutar un cron diario para recordatorios:

```bash
# Ejemplo: todos los días a las 8:00 AM
0 8 * * * curl -X POST https://tu-dominio.com/api/telegram/deadline-reminders -H "Content-Type: application/json" -d '{"days":1}'
```

Para resumen diario (tareas que vencen hoy):

```bash
# Ejemplo: todos los días a las 7:00 AM
0 7 * * * curl -X POST https://tu-dominio.com/api/telegram/daily-summary
```

---

## Propuestas de mejora

### 1. Configuración en `app_settings`

Guardar preferencias para no hardcodear días ni horarios:

```json
{
  "key": "reminders_config",
  "value": {
    "days_before": [1, 3],
    "cron_hour": 8,
    "enabled": true,
    "channels": ["telegram"]
  }
}
```

El endpoint leería esta config y enviaría recordatorios para 1 y 3 días antes.

### 2. Banner al iniciar sesión

Mostrar en el dashboard un aviso de tareas que vencen hoy o en los próximos 3 días:

- Endpoint: `GET /api/tasks/upcoming-deadlines?days=3`
- Componente: banner o modal en `Dashboard.tsx` o `MiDiaView.tsx`
- Solo para el usuario autenticado (sus tareas asignadas)

### 3. Notificaciones por email (opcional)

Si se añade servicio de email (SendGrid, Resend, etc.):

- Configurar canal `email` en `reminders_config`
- Enviar recordatorios por email además de (o en lugar de) Telegram

### 4. Recordatorios para admins

Enviar a un chat de admin (ya usado en otras notificaciones) un resumen de todas las tareas que vencen en N días, para supervisión.

---

## Resumen

| Funcionalidad | Estado |
|---------------|--------|
| Recordatorios por Telegram (N días) | ✅ Implementado |
| Resumen diario por Telegram | ✅ Implementado |
| Config en `app_settings` | ⏳ Propuesto |
| Banner al iniciar sesión | ⏳ Propuesto |
| Email | ⏳ Opcional |
| Resumen para admins | ⏳ Opcional |
