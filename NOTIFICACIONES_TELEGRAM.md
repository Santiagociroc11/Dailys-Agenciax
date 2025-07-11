# 🔔 Sistema de Notificaciones de Telegram para Cambios de Estado de Tareas

## Descripción General

Se ha implementado un sistema completo de notificaciones automáticas vía Telegram que alertará a los administradores cuando ocurran cambios importantes en el estado de las tareas. Este sistema permite un seguimiento en tiempo real del progreso de las tareas y facilita la supervisión del equipo.

## 📋 Eventos que Generan Notificaciones

### 1. **Tarea Completada** 🎉
- **Cuándo se activa**: Cuando un usuario marca una tarea o subtarea como "completada"
- **Quién la recibe**: Administradores
- **Información incluida**:
  - Nombre de la tarea/subtarea
  - Proyecto al que pertenece
  - Usuario que la completó
  - Email del usuario
  - Hora de completación
  - Mensaje: "La tarea ha sido marcada como completada y está esperando revisión"

### 2. **Tarea Aprobada** ✅
- **Cuándo se activa**: Cuando un administrador aprueba una tarea o subtarea
- **Quién la recibe**: Administradores
- **Información incluida**:
  - Nombre de la tarea/subtarea
  - Proyecto al que pertenece
  - Usuario que la completó
  - Administrador que la aprobó
  - Hora de aprobación
  - Mensaje: "La tarea ha sido aprobada exitosamente"

### 3. **Tarea Devuelta** 🔄
- **Cuándo se activa**: Cuando un administrador devuelve una tarea para correcciones
- **Quién la recibe**: Administradores
- **Información incluida**:
  - Nombre de la tarea/subtarea
  - Proyecto al que pertenece
  - Usuario asignado
  - Administrador que la devolvió
  - Motivo de la devolución
  - Hora de devolución
  - Mensaje: "La tarea ha sido devuelta al usuario para correcciones"

### 4. **Tarea Bloqueada** 🚫
- **Cuándo se activa**: Cuando una tarea es bloqueada (por admin o usuario)
- **Quién la recibe**: Administradores
- **Información incluida**:
  - Nombre de la tarea/subtarea
  - Proyecto al que pertenece
  - Usuario asignado
  - Persona que bloqueó la tarea
  - Motivo del bloqueo
  - Hora de bloqueo
  - Mensaje: "La tarea ha sido bloqueada y requiere atención"

## 🔧 Configuración del Sistema

### Requisitos Previos
1. **Bot de Telegram Configurado**: El bot `@agenciaxbot` debe estar funcionando
2. **ID de Chat de Administradores**: Debe estar configurado en la tabla `app_settings`
3. **Token del Bot**: Variable de entorno `TELEGRAM_BOT_TOKEN` configurada

### Configuración en la Aplicación
1. **Para Administradores**:
   - Ir a **Settings** → **Configuración de Administrador**
   - Obtener el ID de chat del bot `@agenciaxbot`
   - Configurar el ID en el campo correspondiente
   - Probar las notificaciones usando los botones de prueba

2. **Para Usuarios** (opcional):
   - Ir a **User Settings** → **Configuración de Notificaciones**
   - Configurar su ID personal si desean recibir notificaciones individuales

## 🎯 Puntos de Integración

### Donde Se Envían las Notificaciones

#### 1. **Management.tsx** (Administradores)
- Función `updateItemStatus()`: Envía notificaciones cuando los administradores cambian estados
- Función `checkAndApproveParentTask()`: Notifica aprobaciones automáticas de tareas padre
- Estados monitoreados: `approved`, `returned`, `blocked`

#### 2. **UserProjectView.tsx** (Usuarios)
- Función `handleSubmitStatus()`: Envía notificaciones cuando usuarios cambian estados
- Estados monitoreados: `completed`, `blocked`

#### 3. **Tasks.tsx** (Administradores y Usuarios)
- Función `handleStatusUpdate()`: Envía notificaciones para cambios de estado de subtareas
- Estados monitoreados: `completed`

## 🛠️ Funciones Principales

### Funciones de Notificación
```typescript
// Notificar tarea completada
notifyTaskCompleted(taskId: string, subtaskId?: string)

// Notificar tarea aprobada
notifyTaskApproved(taskId: string, subtaskId?: string, approvedBy?: string)

// Notificar tarea devuelta
notifyTaskReturned(taskId: string, subtaskId?: string, returnedBy?: string, reason?: string)

// Notificar tarea bloqueada
notifyTaskBlocked(taskId: string, subtaskId?: string, blockedBy?: string, reason?: string)
```

### Funciones Auxiliares
```typescript
// Obtener ID de chat de administradores
getAdminTelegramChatId(): Promise<string | null>

// Obtener contexto de la tarea para notificaciones
getTaskNotificationContext(taskId: string, subtaskId?: string): Promise<NotificationContext | null>

// Enviar mensaje de Telegram
sendTelegramMessage(chatId: string, message: string): Promise<boolean>
```

## 📱 Formato de los Mensajes

### Ejemplo de Notificación - Tarea Completada
```
🎉 Tarea Completada

📋 Tarea: Diseño del logotipo
📁 Proyecto: Branding Corporativo
👤 Usuario: Juan Pérez
📧 Email: juan.perez@example.com
⏰ Hora: 15/01/2025 14:30:25

La tarea ha sido marcada como completada y está esperando revisión.
```

### Ejemplo de Notificación - Tarea Devuelta
```
🔄 Tarea Devuelta

📋 Tarea: Diseño del logotipo
📁 Proyecto: Branding Corporativo
👤 Usuario: Juan Pérez
👨‍💼 Devuelta por: Admin Principal
⏰ Hora: 15/01/2025 15:45:10

💬 Motivo: Necesita ajustes en los colores según las especificaciones del cliente

La tarea ha sido devuelta al usuario para correcciones.
```

## 🧪 Pruebas del Sistema

### Pruebas Disponibles en Settings
- **Prueba General**: Envía un mensaje básico para verificar conectividad
- **Prueba de Tarea Completada**: Simula notificación de tarea completada
- **Prueba de Tarea Aprobada**: Simula notificación de tarea aprobada
- **Prueba de Tarea Devuelta**: Simula notificación de tarea devuelta
- **Prueba de Tarea Bloqueada**: Simula notificación de tarea bloqueada

### Endpoint de Prueba
```
POST /api/telegram/test-status
{
  "notificationType": "completed|approved|returned|blocked",
  "taskId": "test-task-id",
  "subtaskId": "test-subtask-id", // opcional
  "approvedBy": "admin-id", // opcional
  "reason": "Motivo de la acción" // opcional
}
```

## 🔐 Seguridad y Manejo de Errores

### Características de Seguridad
- **Validación de Tokens**: Verificación del token del bot antes de enviar
- **Manejo de Errores**: Los errores de notificación no interrumpen las operaciones principales
- **Logs Detallados**: Registro de todos los intentos de envío y errores

### Manejo de Fallos
- Si las notificaciones fallan, la operación principal (cambio de estado) continúa
- Errores se registran en consola para debugging
- No se exponen datos sensibles en las notificaciones

## 📊 Casos de Uso Principales

### 1. **Supervisión en Tiempo Real**
- Los administradores reciben notificaciones instantáneas cuando los usuarios completan tareas
- Permite respuesta rápida para revisiones y aprobaciones

### 2. **Gestión de Calidad**
- Notificaciones de devoluciones incluyen motivos específicos
- Facilita el seguimiento de problemas recurrentes

### 3. **Resolución de Bloqueos**
- Alertas inmediatas cuando las tareas se bloquean
- Incluye motivos para facilitar la resolución

### 4. **Seguimiento de Progreso**
- Visibilidad completa del flujo de trabajo
- Histórico implícito a través de las notificaciones

## 🔄 Flujo de Trabajo Típico

1. **Usuario completa tarea** → **Notificación a administradores**
2. **Administrador revisa** → **Aprueba/Devuelve** → **Notificación correspondiente**
3. **Si se devuelve** → **Usuario corrige** → **Vuelve a completar** → **Ciclo continúa**
4. **Si se bloquea** → **Notificación inmediata** → **Resolución del bloqueo**

## 🚀 Beneficios del Sistema

### Para Administradores
- **Supervisión Proactiva**: No necesitan revisar constantemente la plataforma
- **Respuesta Rápida**: Reciben alertas inmediatas de cambios importantes
- **Trazabilidad**: Histórico completo de cambios a través de notificaciones

### Para el Equipo
- **Transparencia**: Todos los cambios importantes se notifican
- **Comunicación Mejorada**: Los motivos de devoluciones/bloqueos se comunican claramente
- **Eficiencia**: Menos tiempo perdido esperando feedback

### Para la Organización
- **Productividad**: Aceleración del flujo de trabajo
- **Calidad**: Mejor seguimiento y control de calidad
- **Responsabilidad**: Mayor accountability en el proceso

## 📝 Notas Importantes

1. **Configuración Obligatoria**: Las notificaciones solo funcionan si hay un ID de chat configurado
2. **Dependencia Externa**: Requiere conectividad a Internet y acceso a la API de Telegram
3. **Datos Sensibles**: No se envían datos sensibles, solo información básica de las tareas
4. **Redundancia**: El sistema está diseñado para no fallar las operaciones principales si las notificaciones fallan

## 🔧 Mantenimiento y Soporte

### Logs a Monitorear
- `Console.log`: Éxitos de envío de notificaciones
- `Console.error`: Errores de conectividad o configuración
- `Toast notifications`: Feedback visual para usuarios

### Problemas Comunes
- **Token no configurado**: Verificar variable de entorno `TELEGRAM_BOT_TOKEN`
- **ID de chat no configurado**: Verificar configuración en Settings
- **Bot bloqueado**: Verificar que el bot no esté bloqueado por Telegram
- **Conectividad**: Verificar conexión a Internet y acceso a api.telegram.org

## 🎯 Próximos Pasos Recomendados

1. **Configurar alertas de error**: Implementar notificaciones cuando el sistema de notificaciones falle
2. **Métricas de uso**: Tracking de notificaciones enviadas y recibidas
3. **Personalización**: Permitir personalizar tipos de notificaciones por administrador
4. **Escalación**: Implementar escalación automática para tareas no revisadas
5. **Integración móvil**: Aprovechar las notificaciones push de Telegram para móviles 