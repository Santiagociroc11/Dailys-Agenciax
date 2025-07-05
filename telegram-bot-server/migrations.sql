-- Migraciones para el Sistema de Notificaciones de Telegram
-- Ejecuta estos comandos en el Editor SQL de tu proyecto de Supabase

-- 1. Crear tabla app_metadata para configuración global
CREATE TABLE IF NOT EXISTS public.app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentario para la tabla
COMMENT ON TABLE public.app_metadata IS 'Almacena configuraciones generales de la aplicación como pares clave-valor.';

-- 2. Añadir columna telegram_chat_id a la tabla users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT NULL;

-- Comentario para la nueva columna
COMMENT ON COLUMN public.users.telegram_chat_id IS 'Almacena el ID de chat de Telegram del usuario para notificaciones personales.';

-- 3. Crear tabla telegram_notifications para logging (opcional pero recomendada)
CREATE TABLE IF NOT EXISTS public.telegram_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentarios para la tabla de notificaciones
COMMENT ON TABLE public.telegram_notifications IS 'Registro de notificaciones de Telegram enviadas a los usuarios.';
COMMENT ON COLUMN public.telegram_notifications.user_id IS 'ID del usuario que recibió la notificación.';
COMMENT ON COLUMN public.telegram_notifications.message IS 'Contenido del mensaje enviado.';
COMMENT ON COLUMN public.telegram_notifications.status IS 'Estado del envío: sent (enviado) o failed (falló).';
COMMENT ON COLUMN public.telegram_notifications.error_message IS 'Mensaje de error si el envío falló.';

-- 4. Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_telegram_notifications_user_id 
ON public.telegram_notifications(user_id);

CREATE INDEX IF NOT EXISTS idx_telegram_notifications_created_at 
ON public.telegram_notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_telegram_notifications_status 
ON public.telegram_notifications(status);

CREATE INDEX IF NOT EXISTS idx_users_telegram_chat_id 
ON public.users(telegram_chat_id);

-- 5. Configurar RLS (Row Level Security) si es necesario
-- Nota: Ajusta estas políticas según tus necesidades de seguridad

-- Habilitar RLS en la tabla de notificaciones
ALTER TABLE public.telegram_notifications ENABLE ROW LEVEL SECURITY;

-- Política para que los usuarios solo puedan ver sus propias notificaciones
CREATE POLICY "Users can view their own notifications" ON public.telegram_notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Política para que el servicio pueda insertar notificaciones
CREATE POLICY "Service can insert notifications" ON public.telegram_notifications
  FOR INSERT WITH CHECK (true);

-- 6. Insertar configuración inicial (opcional)
-- Puedes insertar configuraciones iniciales aquí si las necesitas
-- INSERT INTO public.app_metadata (key, value) VALUES 
--   ('telegram_admin_chat_id', 'tu_chat_id_aqui');

-- Verificación: Consultas para verificar que todo se creó correctamente
-- Ejecuta estas consultas después de aplicar las migraciones:

-- SELECT table_name, column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('app_metadata', 'telegram_notifications', 'users')
-- ORDER BY table_name, ordinal_position;

-- SELECT * FROM public.app_metadata LIMIT 5;
-- SELECT COUNT(*) FROM public.telegram_notifications;
-- SELECT telegram_chat_id FROM public.users WHERE telegram_chat_id IS NOT NULL LIMIT 5; 