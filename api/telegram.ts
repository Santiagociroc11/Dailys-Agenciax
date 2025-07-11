const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown';
}

// Función para formatear duración en formato legible
export function formatDuration(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  
  if (diffMs < 0) return "Tiempo inválido";
  
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  const parts = [];
  
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  
  if (parts.length === 0) {
    return "< 1m";
  }
  
  return parts.join(' ');
}

// Función para obtener información de tiempo desde la base de datos
export async function getTimeInfo(itemId: string, isSubtask: boolean, currentStatus: string): Promise<{
  assignedAt?: string;
  completedAt?: string;
  inReviewAt?: string;
  approvedAt?: string;
  returnedAt?: string;
  blockedAt?: string;
}> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Variables de entorno de Supabase no configuradas');
      return {};
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Obtener historial de estados
    const { data: history, error } = await supabase
      .from('status_history')
      .select('*')
      .eq(isSubtask ? 'subtask_id' : 'task_id', itemId)
      .order('changed_at', { ascending: true });

    if (error) {
      console.error('Error obteniendo historial de estados:', error);
      return {};
    }

    const timeInfo: any = {};

    // Buscar fechas específicas en el historial
    history?.forEach((record: any) => {
      if (record.new_status === 'assigned' || record.new_status === 'in_progress') {
        timeInfo.assignedAt = record.changed_at;
      } else if (record.new_status === 'completed') {
        timeInfo.completedAt = record.changed_at;
      } else if (record.new_status === 'in_review') {
        timeInfo.inReviewAt = record.changed_at;
      } else if (record.new_status === 'approved') {
        timeInfo.approvedAt = record.changed_at;
      } else if (record.new_status === 'returned') {
        timeInfo.returnedAt = record.changed_at;
      } else if (record.new_status === 'blocked') {
        timeInfo.blockedAt = record.changed_at;
      }
    });

    return timeInfo;
  } catch (error) {
    console.error('Error obteniendo información de tiempo:', error);
    return {};
  }
}

export async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('Error: El token del bot de Telegram no está configurado.');
    return false;
  }

  const telegramMessage: TelegramMessage = {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML'
  };

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(telegramMessage)
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Error en la API de Telegram:', error);
      return false;
    }
    
    console.log(`Mensaje de Telegram enviado a ${chatId}`);
    return true;

  } catch (error) {
    console.error('Error al enviar mensaje de Telegram:', error);
    return false;
  }
}

// Función para obtener el ID de chat de admin desde app_settings
export async function getAdminTelegramId(): Promise<string | null> {
  try {
    // Usando import dinámico para evitar problemas de dependencias circulares
    const { createClient } = await import('@supabase/supabase-js');
    
    // En el servidor, usar las variables sin prefijo VITE_
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Variables de entorno de Supabase no configuradas');
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'admin_telegram_chat_id')
      .single();

    if (error) {
      if (error.code !== 'PGRST116') { // Ignorar "no rows found"
        console.error('Error al obtener ID de admin de Telegram:', error);
      }
      return null;
    }

    if (data && data.value && typeof data.value === 'object' && data.value.id) {
      return data.value.id;
    }

    return null;
  } catch (error) {
    console.error('Error al conectar con la base de datos para obtener admin ID:', error);
    return null;
  }
}

// Función para enviar notificaciones a administradores
export async function sendAdminNotification(message: string): Promise<boolean> {
  try {
    const adminChatId = await getAdminTelegramId();
    
    if (!adminChatId) {
      console.warn('No hay ID de chat de admin configurado. Saltando notificación.');
      return false;
    }

    return await sendTelegramMessage(adminChatId, message);
  } catch (error) {
    console.error('Error al enviar notificación a admin:', error);
    return false;
  }
}

// Función para crear mensaje de notificación de tarea completada
export function createTaskCompletedMessage(
  taskTitle: string, 
  userName: string, 
  projectName: string,
  areaName: string,
  isSubtask: boolean = false,
  parentTaskTitle?: string
): string {
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${parentTaskTitle}` : '';
  
  return `🎉 <b>TAREA COMPLETADA</b>

👤 <b>Usuario:</b> ${userName}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${taskTitle}${parentInfo}
🏢 <b>Proyecto:</b> ${projectName}
🏷️ <b>Área:</b> ${areaName}

✅ La ${taskType} ha sido marcada como completada y está lista para revisión.`;
}

// Función para crear mensaje de notificación de tarea bloqueada
export function createTaskBlockedMessage(
  taskTitle: string, 
  userName: string, 
  projectName: string,
  areaName: string,
  blockReason: string,
  isSubtask: boolean = false,
  parentTaskTitle?: string
): string {
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${parentTaskTitle}` : '';
  
  return `🚫 <b>TAREA BLOQUEADA</b>

👤 <b>Usuario:</b> ${userName}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${taskTitle}${parentInfo}
🏢 <b>Proyecto:</b> ${projectName}
🏷️ <b>Área:</b> ${areaName}

⚠️ <b>Motivo del bloqueo:</b> ${blockReason}

🔧 Esta ${taskType} requiere atención administrativa para poder continuar.`;
}

// Función para crear mensaje de notificación de tarea en revisión
export function createTaskInReviewMessage(
  taskTitle: string, 
  userName: string, 
  projectName: string,
  areaName: string,
  adminName: string,
  isSubtask: boolean = false,
  parentTaskTitle?: string
): string {
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${parentTaskTitle}` : '';
  
  return `🔍 <b>TAREA EN REVISIÓN</b>

👤 <b>Usuario:</b> ${userName}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${taskTitle}${parentInfo}
🏢 <b>Proyecto:</b> ${projectName}
🏷️ <b>Área:</b> ${areaName}
👩‍💼 <b>Admin:</b> ${adminName}

📋 La ${taskType} ha sido puesta en revisión por ${adminName}.`;
}

// Función para crear mensaje de notificación de tarea aprobada
export function createTaskApprovedMessage(
  taskTitle: string, 
  userName: string, 
  projectName: string,
  areaName: string,
  adminName: string,
  isSubtask: boolean = false,
  parentTaskTitle?: string
): string {
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${parentTaskTitle}` : '';
  
  return `✅ <b>TAREA APROBADA</b>

👤 <b>Usuario:</b> ${userName}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${taskTitle}${parentInfo}
🏢 <b>Proyecto:</b> ${projectName}
🏷️ <b>Área:</b> ${areaName}
👩‍💼 <b>Admin:</b> ${adminName}

🎉 La ${taskType} ha sido aprobada por ${adminName} y está finalizada.`;
}

// Función para crear mensaje de notificación de tarea devuelta
export function createTaskReturnedMessage(
  taskTitle: string, 
  userName: string, 
  projectName: string,
  areaName: string,
  returnFeedback: string,
  adminName: string,
  isSubtask: boolean = false,
  parentTaskTitle?: string
): string {
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${parentTaskTitle}` : '';
  
  return `🔄 <b>TAREA DEVUELTA</b>

👤 <b>Usuario:</b> ${userName}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${taskTitle}${parentInfo}
🏢 <b>Proyecto:</b> ${projectName}
🏷️ <b>Área:</b> ${areaName}
👩‍💼 <b>Admin:</b> ${adminName}

📝 <b>Feedback:</b> ${returnFeedback}

🔧 La ${taskType} ha sido devuelta por ${adminName} al usuario para correcciones.`;
}

export async function handleTestNotification(req: any, res: any) {
    const { chatId, message } = req.body;
  
    if (!chatId || !message) {
      return res.status(400).json({ success: false, error: 'Faltan los parámetros chatId y message.' });
    }
  
    try {
      const success = await sendTelegramMessage(chatId, message);
  
      if (success) {
        return res.status(200).json({ success: true, message: 'Mensaje de prueba enviado correctamente.' });
      } else {
        return res.status(500).json({ success: false, error: 'No se pudo enviar el mensaje de prueba.' });
      }
    } catch (error) {
      console.error('Error en handleTestNotification:', error);
      return res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
} 