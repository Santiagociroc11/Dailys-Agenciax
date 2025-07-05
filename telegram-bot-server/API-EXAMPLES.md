# 📡 API de Notificaciones de Telegram - Ejemplos de Uso

Esta documentación muestra cómo usar cada endpoint del sistema de notificaciones de Telegram para el sistema de gestión de tareas y proyectos.

## 🔗 Base URL
```
http://localhost:3000
```

## 📋 Estados de Tareas en el Sistema

El sistema maneja los siguientes estados:
- **pending**: Pendiente (sin asignar)
- **assigned**: Asignada (asignada a usuario)
- **in_progress**: En progreso (usuario trabajando)
- **completed**: Completada (entregada por usuario)
- **blocked**: Bloqueada (impedimento reportado)
- **in_review**: En revisión (pendiente de aprobación)
- **returned**: Devuelta (requiere correcciones)
- **approved**: Aprobada (trabajo finalizado)

## 📋 Endpoints Disponibles

### 1. **Notificaciones para Usuarios**

#### 🎯 Tarea Disponible
**Endpoint:** `POST /notify-task-available`

Notifica a un usuario cuando hay una nueva tarea disponible para asignarse.

```javascript
// Ejemplo de uso
const response = await fetch('http://localhost:3000/notify-task-available', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user-uuid-123',
    taskData: {
      id: 'task-456',
      title: 'Diseñar interfaz de usuario para dashboard',
      description: 'Crear mockups y prototipos para el nuevo dashboard administrativo',
      priority: 'high', // 'high', 'medium', 'low'
      deadline: '2024-01-25',
      estimated_duration: 8, // horas
      projectName: 'Sistema de Gestión'
    },
    requestId: 'req-789' // Opcional para trazabilidad
  })
});

const result = await response.json();
// { success: true, message: 'Task available notification sent' }
```

**Mensaje que recibe el usuario:**
```
🎯 ¡Nueva Tarea Disponible!

📋 Tarea: Diseñar interfaz de usuario para dashboard
📝 Descripción: Crear mockups y prototipos para el nuevo dashboard administrativo
⭐ Prioridad: Alta
⏱️ Duración estimada: 8 horas
📅 Fecha límite: 25/1/2024
📁 Proyecto: Sistema de Gestión

🚀 ¡Asígnate esta tarea para comenzar a trabajar!

💡 Ve a tu panel de tareas para asignártela.
```

#### ↩️ Tarea Devuelta
**Endpoint:** `POST /notify-task-returned`

Notifica a un usuario cuando su tarea entregada ha sido devuelta para corrección.

```javascript
const response = await fetch('http://localhost:3000/notify-task-returned', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user-uuid-123',
    taskData: {
      id: 'task-456',
      title: 'Diseñar interfaz de usuario para dashboard',
      projectName: 'Sistema de Gestión'
    },
    returnReason: 'Los mockups necesitan ajustes en la paleta de colores y el diseño responsive requiere optimización para móviles',
    requestId: 'req-790'
  })
});
```

**Mensaje que recibe el usuario:**
```
↩️ Tarea Devuelta para Corrección

📋 Tarea: Diseñar interfaz de usuario para dashboard
📊 Estado: Devuelta para revisión
📁 Proyecto: Sistema de Gestión

📝 Motivo de devolución: Los mockups necesitan ajustes en la paleta de colores y el diseño responsive requiere optimización para móviles

🔧 Próximos pasos:
• Revisa los comentarios del revisor
• Realiza las correcciones necesarias
• Cambia el estado a "En progreso" para continuar
• Vuelve a entregar cuando esté lista

💪 ¡No te desanimes! Esto es parte del proceso de mejora.
```

#### 🎉 Tarea Aprobada
**Endpoint:** `POST /notify-task-approved`

Notifica a un usuario cuando su tarea ha sido aprobada.

```javascript
const response = await fetch('http://localhost:3000/notify-task-approved', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user-uuid-123',
    taskData: {
      id: 'task-456',
      title: 'Diseñar interfaz de usuario para dashboard',
      projectName: 'Sistema de Gestión'
    },
    approvalComment: 'Excelente trabajo! El diseño cumple perfectamente con los requisitos y la implementación responsive es impecable.',
    requestId: 'req-791'
  })
});
```

**Mensaje que recibe el usuario:**
```
🎉 ¡Tarea Aprobada!

📋 Tarea: Diseñar interfaz de usuario para dashboard
✅ Estado: Aprobada
📁 Proyecto: Sistema de Gestión

💬 Comentario del revisor: Excelente trabajo! El diseño cumple perfectamente con los requisitos y la implementación responsive es impecable.

🏆 ¡Excelente trabajo!
• Tu tarea ha sido aprobada exitosamente
• El trabajo cumple con todos los requisitos
• Puedes continuar con nuevas tareas disponibles

🚀 ¡Sigue así! Tu calidad de trabajo es excepcional.
```

### 2. **Notificaciones para Administradores**

#### 📋 Tarea Entregada para Revisión
**Endpoint:** `POST /notify-admin-task-submitted`

Notifica a los administradores cuando un usuario entrega una tarea completada.

```javascript
const response = await fetch('http://localhost:3000/notify-admin-task-submitted', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user-uuid-123',
    taskData: {
      id: 'task-456',
      title: 'Diseñar interfaz de usuario para dashboard',
      priority: 'high',
      projectName: 'Sistema de Gestión'
    },
    submissionNotes: 'Diseños entregados en Figma con todas las variantes responsive. Incluye guía de estilos y componentes reutilizables.',
    requestId: 'req-792'
  })
});
```

**Mensaje que reciben los administradores:**
```
📋 Tarea Entregada para Revisión

👤 Usuario: Juan Pérez (juan@email.com)
📋 Tarea: Diseñar interfaz de usuario para dashboard
📅 Entregada: 20/1/2024 14:30:00
⭐ Prioridad: Alta
📁 Proyecto: Sistema de Gestión

📝 Notas de entrega: Diseños entregados en Figma con todas las variantes responsive. Incluye guía de estilos y componentes reutilizables.

🔍 Acción requerida:
• Revisar el trabajo entregado
• Aprobar o devolver con comentarios
• Cambiar estado en el panel de gestión

⏰ Pendiente de revisión administrativa.
```

#### ✅ Tarea Aprobada (Notificación Admin)
**Endpoint:** `POST /notify-admin-task-approved`

Notifica a los administradores cuando una tarea ha sido aprobada.

```javascript
const response = await fetch('http://localhost:3000/notify-admin-task-approved', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user-uuid-123',
    taskData: {
      id: 'task-456',
      title: 'Diseñar interfaz de usuario para dashboard',
      projectName: 'Sistema de Gestión'
    },
    approvedBy: 'María García - UX Lead',
    requestId: 'req-793'
  })
});
```

**Mensaje que reciben los administradores:**
```
✅ Tarea Aprobada

👤 Usuario: Juan Pérez (juan@email.com)
📋 Tarea: Diseñar interfaz de usuario para dashboard
👨‍💼 Aprobada por: María García - UX Lead
📅 Fecha: 20/1/2024 15:45:00
📁 Proyecto: Sistema de Gestión

📊 Resumen:
• Tarea completada exitosamente
• Usuario notificado de la aprobación
• Trabajo cumple con los estándares de calidad

🎯 Proceso completado correctamente.
```

#### 🚫 Tarea Bloqueada
**Endpoint:** `POST /notify-admin-task-blocked`

Notifica a los administradores cuando un usuario bloquea una tarea.

```javascript
const response = await fetch('http://localhost:3000/notify-admin-task-blocked', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user-uuid-123',
    taskData: {
      id: 'task-456',
      title: 'Diseñar interfaz de usuario para dashboard',
      priority: 'high',
      projectName: 'Sistema de Gestión'
    },
    blockReason: 'No tengo acceso a los wireframes actualizados y el cliente no ha respondido a las consultas sobre los requisitos específicos',
    requestId: 'req-794'
  })
});
```

**Mensaje que reciben los administradores:**
```
🚫 Tarea Bloqueada por Usuario

👤 Usuario: Juan Pérez (juan@email.com)
📋 Tarea: Diseñar interfaz de usuario para dashboard
📅 Bloqueada: 20/1/2024 16:20:00
⭐ Prioridad: Alta
📁 Proyecto: Sistema de Gestión

📝 Motivo del bloqueo: No tengo acceso a los wireframes actualizados y el cliente no ha respondido a las consultas sobre los requisitos específicos

⚠️ Acción requerida:
• Revisar el motivo del bloqueo
• Contactar al usuario para resolver impedimentos
• Determinar si la tarea debe ser reasignada
• Resolver el problema reportado

🔍 Requiere atención administrativa inmediata.
```

## 🔧 Endpoints Existentes (Compatibilidad)

### 📨 Notificación de Prueba
**Endpoint:** `POST /test-notification`

```javascript
const response = await fetch('http://localhost:3000/test-notification', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    chatId: '123456789',
    userId: 'user-uuid-123', // Opcional
    threadId: '456' // Opcional para grupos con temas
  })
});
```

### 🎯 Asignación de Tarea (Legacy)
**Endpoint:** `POST /notify-task-assignment`

```javascript
const response = await fetch('http://localhost:3000/notify-task-assignment', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user-uuid-123',
    taskData: {
      id: 'task-456',
      name: 'Diseñar interfaz de usuario para dashboard',
      description: 'Crear mockups y prototipos para el nuevo dashboard',
      priority: 'high',
      deadline: '2024-01-25',
      status: 'assigned'
    },
    requestId: 'req-795'
  })
});
```

### 🔄 Cambio de Estado (Legacy)
**Endpoint:** `POST /notify-task-status-change`

```javascript
const response = await fetch('http://localhost:3000/notify-task-status-change', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user-uuid-123',
    taskData: {
      id: 'task-456',
      name: 'Diseñar interfaz de usuario para dashboard'
    },
    oldStatus: 'in_progress',
    newStatus: 'completed',
    requestId: 'req-796'
  })
});
```

## 📊 Respuestas de la API

### ✅ Respuesta Exitosa
```json
{
  "success": true,
  "message": "Task available notification sent"
}
```

### ❌ Respuesta de Error
```json
{
  "success": false,
  "error": "Missing required fields: userId, taskData.title"
}
```

## 🔍 Códigos de Estado HTTP

| Código | Descripción |
|--------|-------------|
| 200 | Notificación enviada exitosamente |
| 400 | Datos de entrada inválidos |
| 500 | Error interno del servidor |

## 🧪 Flujo de Trabajo Completo

### Ejemplo de flujo típico de una tarea:

```javascript
// 1. Notificar tarea disponible a usuarios elegibles
await fetch('http://localhost:3000/notify-task-available', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user-123',
    taskData: {
      id: 'task-456',
      title: 'Implementar sistema de autenticación',
      description: 'Desarrollar módulo de login con JWT',
      priority: 'high',
      estimated_duration: 12,
      deadline: '2024-02-01',
      projectName: 'App Móvil'
    }
  })
});

// 2. Usuario trabaja en la tarea y la entrega (estado: completed)
// Sistema automáticamente notifica a admin
await fetch('http://localhost:3000/notify-admin-task-submitted', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user-123',
    taskData: {
      id: 'task-456',
      title: 'Implementar sistema de autenticación',
      priority: 'high',
      projectName: 'App Móvil'
    },
    submissionNotes: 'Implementación completa con tests unitarios y documentación'
  })
});

// 3A. Si el admin aprueba la tarea
await fetch('http://localhost:3000/notify-task-approved', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user-123',
    taskData: {
      id: 'task-456',
      title: 'Implementar sistema de autenticación',
      projectName: 'App Móvil'
    },
    approvalComment: 'Implementación sólida y bien documentada!'
  })
});

// Y notificar a otros admins
await fetch('http://localhost:3000/notify-admin-task-approved', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user-123',
    taskData: {
      id: 'task-456',
      title: 'Implementar sistema de autenticación',
      projectName: 'App Móvil'
    },
    approvedBy: 'Carlos Rodríguez - Tech Lead'
  })
});

// 3B. O si necesita correcciones
await fetch('http://localhost:3000/notify-task-returned', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user-123',
    taskData: {
      id: 'task-456',
      title: 'Implementar sistema de autenticación',
      projectName: 'App Móvil'
    },
    returnReason: 'Falta validación de tokens y manejo de refresh tokens'
  })
});

// 4. Si el usuario encuentra impedimentos
await fetch('http://localhost:3000/notify-admin-task-blocked', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user-123',
    taskData: {
      id: 'task-456',
      title: 'Implementar sistema de autenticación',
      priority: 'high',
      projectName: 'App Móvil'
    },
    blockReason: 'No tengo acceso al servidor de desarrollo para probar la integración'
  })
});
```

## 🛠️ Configuración Requerida

### Variables de Entorno
```env
TELEGRAM_BOT_TOKEN=tu_token_aqui
SUPABASE_URL=tu_url_supabase
SUPABASE_SERVICE_ROLE_KEY=tu_service_key
```

### Base de Datos
- Tabla `users` con columna `telegram_chat_id`
- Tabla `app_metadata` con configuración `telegram_admin_chat_id`
- Tabla `telegram_notifications` para logging (opcional)

### Estructura de Datos de Tareas
```typescript
interface TaskData {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  estimated_duration?: number; // en horas
  deadline?: string; // ISO date string
  projectName?: string;
  status?: string;
}
```

---

¡Tu sistema de notificaciones de Telegram está listo para el flujo completo de gestión de tareas! 🚀 