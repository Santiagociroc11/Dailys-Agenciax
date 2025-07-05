# 🤖 Telegram Bot Server

Este es un servidor Node.js que maneja un bot de Telegram interactivo para obtener Chat IDs y enviar notificaciones del sistema con integración completa a Supabase.

## ✨ Características

- **Bot interactivo** con comandos `/start`, `/info`, `/help`, `/status`
- **Detección automática** de chats privados, grupos y canales
- **API REST** para enviar notificaciones especializadas
- **Integración con Supabase** para gestión de usuarios y logs
- **Almacenamiento de usuarios** en archivo JSON
- **Prevención de instancias múltiples** con sistema de bloqueo
- **Soporte para temas** en supergrupos de Telegram
- **Logging detallado** con requestId para trazabilidad
- **Notificaciones especializadas** para asignación y cambios de estado de tareas

## 🚀 Instalación

1. **Instalar dependencias:**
```bash
npm install
```

2. **Crear archivo de configuración:**
Crea un archivo `.env` en la raíz del directorio `telegram-bot-server` con el siguiente contenido:
```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=tu_token_del_bot_aqui

# Admin Group Chat ID (opcional - para notificaciones de admin)
ADMIN_GROUP_CHAT_ID=tu_chat_id_del_grupo_admin_aqui

# Supabase Configuration
SUPABASE_URL=tu_url_de_supabase
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_de_supabase

# Server Port
PORT=3000
```

3. **Configurar variables de entorno:**
- Reemplaza `tu_token_del_bot_aqui` con el token de tu bot
- Reemplaza `tu_chat_id_del_grupo_admin_aqui` con el Chat ID de tu grupo de administradores (opcional)
- Configura las credenciales de Supabase para la integración con la base de datos
- El puerto por defecto es 3000, puedes cambiarlo si es necesario

## 🔧 Configuración del Bot de Telegram

### 1. Crear el Bot
1. Habla con [@BotFather](https://t.me/BotFather) en Telegram
2. Envía `/newbot`
3. Sigue las instrucciones para crear tu bot
4. Guarda el token que te proporciona

### 2. Configurar el Bot
1. Opcional: Configura el nombre y descripción del bot
2. Opcional: Añade comandos con `/setcommands`:
```
start - Obtener Chat ID básico
info - Información detallada del chat
help - Ver todos los comandos
status - Verificar estado del bot
```

## 🎮 Comandos del Bot

| Comando | Descripción |
|---------|-------------|
| `/start` | Obtiene el Chat ID del chat actual con instrucciones |
| `/info` | Información detallada del chat (tipo, ID, thread ID si aplica) |
| `/help` | Muestra todos los comandos disponibles |
| `/status` | Verifica que el bot está funcionando |

## 🏃‍♂️ Uso

### Desarrollo Local
```bash
npm run dev
```

### Producción Local
```bash
npm run build
npm start
```

### 🐳 Despliegue con Docker

#### Opción 1: Docker Compose (Recomendado)
```bash
# 1. Clonar el repositorio
git clone <tu-repositorio>
cd telegram-bot-server

# 2. Crear archivo .env con tus configuraciones
cp .env.example .env
# Editar .env con tus variables

# 3. Construir y ejecutar con Docker Compose
docker-compose up -d

# 4. Ver logs
docker-compose logs -f telegram-bot

# 5. Detener el servicio
docker-compose down
```

#### Opción 2: Docker Manual
```bash
# 1. Construir la imagen
docker build -t telegram-bot-server .

# 2. Ejecutar el contenedor
docker run -d \
  --name telegram-bot \
  -p 3000:3000 \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/logs:/app/logs \
  --restart unless-stopped \
  telegram-bot-server

# 3. Ver logs
docker logs -f telegram-bot

# 4. Detener el contenedor
docker stop telegram-bot
docker rm telegram-bot
```

#### Comandos Útiles de Docker
```bash
# Ver estado del contenedor
docker-compose ps

# Reiniciar el servicio
docker-compose restart telegram-bot

# Ver logs en tiempo real
docker-compose logs -f

# Entrar al contenedor para debugging
docker-compose exec telegram-bot sh

# Actualizar la aplicación
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Limpiar imágenes no utilizadas
docker system prune -f
```

### 🔧 Variables de Entorno para Docker

Crea un archivo `.env` en la raíz del directorio `telegram-bot-server`:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=tu_token_del_bot_aqui
ADMIN_GROUP_CHAT_ID=tu_chat_id_del_grupo_admin_aqui

# Supabase Configuration
SUPABASE_URL=tu_url_de_supabase
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_de_supabase

# Server Configuration
PORT=3000
NODE_ENV=production

# Optional: Logging level
LOG_LEVEL=info
```

## 📡 API Endpoints

### GET /
- **Descripción:** Verificar que el servidor está funcionando
- **Respuesta:** Mensaje de estado

### POST /notify (Legacy)
- **Descripción:** Enviar notificación básica a un usuario
- **Body:**
```json
{
  "message": "Tu mensaje aquí",
  "userId": "123456789"
}
```
- **Respuesta:** Confirmación de envío

### POST /test-notification
- **Descripción:** Enviar notificación de prueba con formato mejorado
- **Body:**
```json
{
  "chatId": "123456789",
  "userId": "user-uuid-optional",
  "threadId": "thread-id-optional"
}
```
- **Respuesta:** `{ "success": boolean, "error": string }`

### POST /notify-task-assignment
- **Descripción:** Notificar asignación de nueva tarea
- **Body:**
```json
{
  "userId": "user-uuid",
  "taskData": {
    "id": "task-id",
    "name": "Nombre de la tarea",
    "description": "Descripción opcional",
    "priority": "Alta",
    "deadline": "2024-01-15",
    "status": "Pendiente"
  },
  "requestId": "request-id-optional"
}
```
- **Respuesta:** `{ "success": boolean, "message": string }`

### POST /notify-task-status-change
- **Descripción:** Notificar cambio de estado de tarea
- **Body:**
```json
{
  "userId": "user-uuid",
  "taskData": {
    "id": "task-id",
    "name": "Nombre de la tarea",
    "description": "Descripción opcional"
  },
  "oldStatus": "En Progreso",
  "newStatus": "Completada",
  "requestId": "request-id-optional"
}
```
- **Respuesta:** `{ "success": boolean, "message": string }`

## 🗄️ Integración con Base de Datos

El servidor se integra con Supabase y requiere las siguientes tablas:

### Tabla `users`
```sql
-- Columna adicional requerida
ALTER TABLE users ADD COLUMN telegram_chat_id TEXT;
```

### Tabla `app_metadata`
```sql
CREATE TABLE app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabla `telegram_notifications` (opcional)
```sql
CREATE TABLE telegram_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  message TEXT NOT NULL,
  status TEXT NOT NULL, -- 'sent' or 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 📁 Estructura de Archivos

```
telegram-bot-server/
├── src/
│   ├── index.ts              # Servidor principal con bot y API
│   ├── telegram-api.ts       # Funciones especializadas de Telegram
│   └── supabase-client.ts    # Cliente de Supabase
├── data/
│   ├── users.json            # Base de datos local de usuarios del bot
│   └── bot.lock              # Archivo de bloqueo (temporal)
├── dist/                     # Código compilado
├── package.json
├── tsconfig.json
└── README.md
```

## 🔐 Seguridad

- **Archivo de bloqueo:** Previene múltiples instancias del bot
- **Validación de entrada:** Verifica parámetros en endpoints
- **Manejo de errores:** Captura y registra errores apropiadamente
- **Almacenamiento seguro:** Integración con Supabase usando service role key
- **Logs estructurados:** Tracking completo con requestId para auditoría

## 🛠️ Desarrollo

### Scripts Disponibles
- `npm run dev` - Ejecutar en modo desarrollo con recarga automática
- `npm run build` - Compilar TypeScript a JavaScript
- `npm start` - Ejecutar versión compilada

### Logs
El servidor proporciona logs detallados en formato JSON:
- ✅ Notificaciones enviadas exitosamente
- ❌ Errores de envío con stack traces
- 🤖 Estado del bot y polling
- 📱 Interacciones de usuarios
- 🔍 Trazabilidad completa con requestId

### Ejemplo de Log
```json
{
  "requestId": "req-123",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "flow": "task_notification",
  "step": "start",
  "userId": "user-uuid",
  "task_name": "Revisar documentos"
}
```

## 🚨 Solución de Problemas

### El bot no responde
1. Verifica que el token sea correcto
2. Asegúrate de que el bot esté iniciado (`/start` con @BotFather)
3. Revisa los logs del servidor

### Error "Another instance is running"
1. Detén todas las instancias del servidor
2. Elimina el archivo `data/bot.lock`
3. Reinicia el servidor

### Notificaciones no llegan
1. Verifica que el Chat ID sea correcto
2. Asegúrate de que el usuario haya iniciado el bot
3. Revisa los logs para errores específicos
4. Verifica la configuración de Supabase

### Errores de base de datos
1. Verifica las credenciales de Supabase en `.env`
2. Asegúrate de que las tablas requeridas existan
3. Verifica que el service role key tenga los permisos necesarios

## 📞 Soporte

Para obtener ayuda:
1. Revisa los logs del servidor (formato JSON estructurado)
2. Verifica la configuración del bot y base de datos
3. Prueba los comandos manualmente con el bot
4. Usa los endpoints de prueba para verificar conectividad

## 🔄 Actualizaciones

Para actualizar el bot:
1. Detén el servidor
2. Actualiza el código
3. Ejecuta `npm install` si hay nuevas dependencias
4. Ejecuta las migraciones de base de datos si es necesario
5. Reinicia el servidor

---

¡Tu sistema completo de notificaciones de Telegram está listo para usar! 🎉 