const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown';
}

// Función para escapar caracteres HTML especiales
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  
  const parts: string[] = [];
  
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

    const timeInfo: {
      assignedAt?: string;
      completedAt?: string;
      inReviewAt?: string;
      approvedAt?: string;
      returnedAt?: string;
      blockedAt?: string;
    } = {};

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

    // Si no hay suficiente información del historial, intentar obtener desde task_work_assignments
    if (!timeInfo.assignedAt || !timeInfo.completedAt) {
      try {
        const { data: workData, error: workError } = await supabase
          .from('task_work_assignments')
          .select('date, created_at, end_time, status, updated_at')
          .eq(isSubtask ? 'subtask_id' : 'task_id', itemId)
          .eq('task_type', isSubtask ? 'subtask' : 'task')
          .single();

        if (!workError && workData) {
          // Usar la fecha de creación como fecha de asignación si no la tenemos
          if (!timeInfo.assignedAt && workData.created_at) {
            timeInfo.assignedAt = workData.created_at;
            console.log(`[TIME INFO] Usando created_at de work_assignment como assignedAt: ${workData.created_at}`);
          }
          
          // Usar end_time si existe y el estado es completado
          if (!timeInfo.completedAt && workData.end_time) {
            timeInfo.completedAt = workData.end_time;
            console.log(`[TIME INFO] Usando end_time de work_assignment como completedAt: ${workData.end_time}`);
          }
          
          // Como última opción, usar updated_at si el estado es completado y no tenemos end_time
          if (!timeInfo.completedAt && workData.status === 'completed' && workData.updated_at) {
            timeInfo.completedAt = workData.updated_at;
            console.log(`[TIME INFO] Usando updated_at de work_assignment como completedAt: ${workData.updated_at}`);
          }
        }
      } catch (workError) {
        console.warn('No se pudo obtener información de work assignments:', workError);
      }
    }

    console.log(`[TIME INFO] Información final para ${isSubtask ? 'subtask' : 'task'} ${itemId}:`, timeInfo);

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
    console.log(`[TELEGRAM] Enviando mensaje a ${chatId}, longitud: ${message.length} caracteres`);
    
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(telegramMessage)
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ [TELEGRAM] Error en la API de Telegram:', error);
      console.error('❌ [TELEGRAM] Mensaje que causó el error:', message.substring(0, 500) + '...');
      return false;
    }
    
    console.log(`✅ [TELEGRAM] Mensaje enviado exitosamente a ${chatId}`);
    return true;

  } catch (error) {
    console.error('❌ [TELEGRAM] Error de red al enviar mensaje:', error);
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
  parentTaskTitle?: string,
  timeInfo?: { assignedAt?: string; completedAt?: string }
): string {
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${escapeHtml(parentTaskTitle)}` : '';
  
  // Calcular tiempo de trabajo si tenemos la información
  let timeWorked = '';
  console.log(`[MESSAGE] Creando mensaje para tarea completada. TimeInfo recibido:`, timeInfo);
  
  if (timeInfo?.assignedAt && timeInfo?.completedAt) {
    const duration = formatDuration(timeInfo.assignedAt, timeInfo.completedAt);
    timeWorked = `\n⏱️ <b>Tiempo de trabajo:</b> ${duration}`;
    console.log(`[MESSAGE] Tiempo calculado: ${duration} (de ${timeInfo.assignedAt} a ${timeInfo.completedAt})`);
  } else {
    console.log(`[MESSAGE] No se pudo calcular tiempo. AssignedAt: ${timeInfo?.assignedAt}, CompletedAt: ${timeInfo?.completedAt}`);
  }
  
  return `🎉 <b>TAREA COMPLETADA</b>

👤 <b>Usuario:</b> ${escapeHtml(userName)}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${escapeHtml(taskTitle)}${parentInfo}
🏢 <b>Proyecto:</b> ${escapeHtml(projectName)}
🏷️ <b>Área:</b> ${escapeHtml(areaName)}${timeWorked}

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
  parentTaskTitle?: string,
  timeInfo?: { assignedAt?: string; blockedAt?: string }
): string {
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${escapeHtml(parentTaskTitle)}` : '';
  
  // Calcular tiempo trabajado antes del bloqueo
  let timeWorked = '';
  if (timeInfo?.assignedAt && timeInfo?.blockedAt) {
    const duration = formatDuration(timeInfo.assignedAt, timeInfo.blockedAt);
    timeWorked = `\n⏱️ <b>Tiempo trabajado antes del bloqueo:</b> ${duration}`;
  }
  
  return `🚫 <b>TAREA BLOQUEADA</b>

👤 <b>Usuario:</b> ${escapeHtml(userName)}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${escapeHtml(taskTitle)}${parentInfo}
🏢 <b>Proyecto:</b> ${escapeHtml(projectName)}
🏷️ <b>Área:</b> ${escapeHtml(areaName)}${timeWorked}

⚠️ <b>Motivo del bloqueo:</b> ${escapeHtml(blockReason)}

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
  parentTaskTitle?: string,
  timeInfo?: { completedAt?: string; inReviewAt?: string }
): string {
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${escapeHtml(parentTaskTitle)}` : '';
  
  // Calcular tiempo desde completada hasta puesta en revisión
  let reviewTime = '';
  if (timeInfo?.completedAt && timeInfo?.inReviewAt) {
    const duration = formatDuration(timeInfo.completedAt, timeInfo.inReviewAt);
    reviewTime = `\n⏱️ <b>Tiempo hasta revisión:</b> ${duration}`;
  }
  
  return `🔍 <b>TAREA EN REVISIÓN</b>

👤 <b>Usuario:</b> ${escapeHtml(userName)}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${escapeHtml(taskTitle)}${parentInfo}
🏢 <b>Proyecto:</b> ${escapeHtml(projectName)}
🏷️ <b>Área:</b> ${escapeHtml(areaName)}
👩‍💼 <b>Admin:</b> ${escapeHtml(adminName)}${reviewTime}

📋 La ${taskType} ha sido puesta en revisión por ${escapeHtml(adminName)}.`;
}

// Función para crear mensaje de notificación de tarea aprobada
export function createTaskApprovedMessage(
  taskTitle: string, 
  userName: string, 
  projectName: string,
  areaName: string,
  adminName: string,
  isSubtask: boolean = false,
  parentTaskTitle?: string,
  timeInfo?: { inReviewAt?: string; approvedAt?: string; assignedAt?: string }
): string {
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${escapeHtml(parentTaskTitle)}` : '';
  
  // Calcular tiempo de revisión y tiempo total
  let timeDetails = '';
  if (timeInfo?.inReviewAt && timeInfo?.approvedAt) {
    const reviewDuration = formatDuration(timeInfo.inReviewAt, timeInfo.approvedAt);
    timeDetails += `\n⏱️ <b>Tiempo de revisión:</b> ${reviewDuration}`;
  }
  
  if (timeInfo?.assignedAt && timeInfo?.approvedAt) {
    const totalDuration = formatDuration(timeInfo.assignedAt, timeInfo.approvedAt);
    timeDetails += `\n🏁 <b>Tiempo total del ciclo:</b> ${totalDuration}`;
  }
  
  return `✅ <b>TAREA APROBADA</b>

👤 <b>Usuario:</b> ${escapeHtml(userName)}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${escapeHtml(taskTitle)}${parentInfo}
🏢 <b>Proyecto:</b> ${escapeHtml(projectName)}
🏷️ <b>Área:</b> ${escapeHtml(areaName)}
👩‍💼 <b>Admin:</b> ${escapeHtml(adminName)}${timeDetails}

🎉 La ${taskType} ha sido aprobada por ${escapeHtml(adminName)} y está finalizada.`;
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
  parentTaskTitle?: string,
  timeInfo?: { inReviewAt?: string; returnedAt?: string }
): string {
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${escapeHtml(parentTaskTitle)}` : '';
  
  // Calcular tiempo de revisión antes de devolver
  let reviewTime = '';
  if (timeInfo?.inReviewAt && timeInfo?.returnedAt) {
    const duration = formatDuration(timeInfo.inReviewAt, timeInfo.returnedAt);
    reviewTime = `\n⏱️ <b>Tiempo en revisión:</b> ${duration}`;
  }
  
  return `🔄 <b>TAREA DEVUELTA</b>

👤 <b>Usuario:</b> ${escapeHtml(userName)}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${escapeHtml(taskTitle)}${parentInfo}
🏢 <b>Proyecto:</b> ${escapeHtml(projectName)}
🏷️ <b>Área:</b> ${escapeHtml(areaName)}
👩‍💼 <b>Admin:</b> ${escapeHtml(adminName)}${reviewTime}

📝 <b>Feedback:</b> ${escapeHtml(returnFeedback)}

🔧 La ${taskType} ha sido devuelta por ${escapeHtml(adminName)} al usuario para correcciones.`;
}

// Función para crear mensaje de notificación de tarea disponible
export function createTaskAvailableMessage(
  taskTitle: string, 
  projectName: string,
  reason: 'unblocked' | 'returned' | 'sequential_dependency_completed' | 'created_available',
  isSubtask: boolean = false,
  parentTaskTitle?: string
): string {
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${escapeHtml(parentTaskTitle)}` : '';
  
  let reasonText = '';
  let icon = '🔔';
  
  switch (reason) {
    case 'unblocked':
      reasonText = 'La tarea ha sido desbloqueada y está disponible para trabajar';
      icon = '🔓';
      break;
    case 'returned':
      reasonText = 'La tarea ha sido devuelta y está disponible para correcciones';
      icon = '🔄';
      break;
    case 'sequential_dependency_completed':
      reasonText = 'Las dependencias previas se han completado y ahora puedes trabajar en esta tarea';
      icon = '⏭️';
      break;
    case 'created_available':
      reasonText = 'Una nueva tarea está disponible para trabajar';
      icon = '✨';
      break;
  }
  
  return `${icon} <b>TAREA DISPONIBLE</b>

${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${escapeHtml(taskTitle)}${parentInfo}
🏢 <b>Proyecto:</b> ${escapeHtml(projectName)}

💡 <b>Motivo:</b> ${reasonText}

🚀 Puedes asignar esta ${taskType} en tu panel de trabajo.`;
}

// Función para notificar a un usuario específico sobre tarea disponible
export async function notifyTaskAvailable(
  userId: string,
  taskTitle: string,
  projectName: string,
  reason: 'unblocked' | 'returned' | 'sequential_dependency_completed' | 'created_available',
  isSubtask: boolean = false,
  parentTaskTitle?: string
): Promise<boolean> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Variables de entorno de Supabase no configuradas');
      return false;
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Obtener telegram_chat_id del usuario
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('telegram_chat_id, name, email')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      console.error('Error obteniendo datos del usuario:', userError);
      return false;
    }

    if (!userData.telegram_chat_id) {
      console.log(`Usuario ${userData.name || userData.email} no tiene telegram_chat_id configurado. Saltando notificación.`);
      return false;
    }

    // Crear y enviar mensaje
    const message = createTaskAvailableMessage(taskTitle, projectName, reason, isSubtask, parentTaskTitle);
    const success = await sendTelegramMessage(userData.telegram_chat_id, message);

    if (success) {
      console.log(`✅ Notificación de tarea disponible enviada a ${userData.name || userData.email}`);
    } else {
      console.error(`❌ Error enviando notificación de tarea disponible a ${userData.name || userData.email}`);
    }

    return success;
  } catch (error) {
    console.error('Error en notifyTaskAvailable:', error);
    return false;
  }
}

// Función para notificar a múltiples usuarios sobre tarea disponible
export async function notifyMultipleUsersTaskAvailable(
  userIds: string[],
  taskTitle: string,
  projectName: string,
  reason: 'unblocked' | 'returned' | 'sequential_dependency_completed' | 'created_available',
  isSubtask: boolean = false,
  parentTaskTitle?: string
): Promise<number> {
  let successCount = 0;
  
  for (const userId of userIds) {
    const success = await notifyTaskAvailable(userId, taskTitle, projectName, reason, isSubtask, parentTaskTitle);
    if (success) {
      successCount++;
    }
    // Pequeña pausa entre notificaciones para evitar rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`Notificaciones de tarea disponible enviadas: ${successCount}/${userIds.length}`);
  return successCount;
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