const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown';
}

// Función para escapar caracteres HTML especiales
function escapeHtml(text: string | null | undefined): string {
  if (!text || text === null || text === undefined) return '';
  
  const stringText = String(text);
  return stringText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Función adicional para escapar duraciones y otros textos que pueden contener símbolos especiales
function escapeDurationText(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&/g, '&amp;');
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
    return "&lt; 1m"; // Escape the < symbol for HTML
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
    const { db } = await import('../lib/db/serverDb.js');

    const { data: historyRaw, error } = await db
      .from('status_history')
      .select('*')
      .eq(isSubtask ? 'subtask_id' : 'task_id', itemId)
      .order('changed_at', { ascending: true });

    if (error) {
      console.error('Error obteniendo historial de estados:', error);
      return {};
    }

    type HistoryRecord = { new_status?: string; changed_at?: string; changed_by?: string };
    const history: HistoryRecord[] = Array.isArray(historyRaw) ? historyRaw as HistoryRecord[] : (historyRaw ? [historyRaw as HistoryRecord] : []);

    const timeInfo: {
      assignedAt?: string;
      completedAt?: string;
      inReviewAt?: string;
      approvedAt?: string;
      returnedAt?: string;
      blockedAt?: string;
    } = {};

    console.log(`[TIME INFO] Historial completo encontrado:`, history.map((h) => `${h.new_status} - ${h.changed_at} - ${h.changed_by || 'sistema'}`));

    // Buscar fechas específicas en el historial
    // Para calcular tiempo de revisión correctamente cuando hay múltiples ciclos de completed -> in_review
    let completions: Array<{date: string, changedBy: string}> = [];
    let reviews: Array<{date: string, changedBy: string}> = [];
    
    history.forEach((record) => {
      if ((record.new_status === 'assigned' || record.new_status === 'in_progress') && !timeInfo.assignedAt && record.changed_at) {
        timeInfo.assignedAt = record.changed_at;
        console.log(`[TIME INFO] Primera asignación encontrada: ${record.changed_at} por ${record.changed_by || 'sistema'}`);
      } else if (record.new_status === 'completed' && record.changed_at) {
        completions.push({date: record.changed_at, changedBy: record.changed_by || 'sistema'});
        if (!timeInfo.completedAt) {
          timeInfo.completedAt = record.changed_at;
          console.log(`[TIME INFO] Primera completación encontrada: ${record.changed_at} por ${record.changed_by || 'sistema'}`);
        }
      } else if (record.new_status === 'in_review' && record.changed_at) {
        reviews.push({date: record.changed_at, changedBy: record.changed_by || 'sistema'});
        if (!timeInfo.inReviewAt) {
          timeInfo.inReviewAt = record.changed_at;
          console.log(`[TIME INFO] Primera puesta en revisión encontrada: ${record.changed_at} por ${record.changed_by || 'sistema'}`);
        }
      } else if (record.new_status === 'approved' && !timeInfo.approvedAt) {
        timeInfo.approvedAt = record.changed_at;
        console.log(`[TIME INFO] Primera aprobación encontrada: ${record.changed_at} por ${record.changed_by || 'sistema'}`);
      } else if (record.new_status === 'returned' && !timeInfo.returnedAt) {
        timeInfo.returnedAt = record.changed_at;
        console.log(`[TIME INFO] Primera devolución encontrada: ${record.changed_at} por ${record.changed_by || 'sistema'}`);
      } else if (record.new_status === 'blocked' && !timeInfo.blockedAt) {
        timeInfo.blockedAt = record.changed_at;
        console.log(`[TIME INFO] Primer bloqueo encontrado: ${record.changed_at} por ${record.changed_by || 'sistema'}`);
      }
    });

    // Para el cálculo del tiempo de revisión, necesitamos encontrar la completación correcta
    // que corresponde al ciclo ACTUAL de revisión (considerando devoluciones)
    if (currentStatus === 'in_review' && reviews.length > 0 && completions.length > 0) {
      // Encontrar la ÚLTIMA revisión (ciclo actual, no la primera histórica)
      const sortedReviews = reviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const currentReviewTime = new Date(sortedReviews[0].date).getTime();
      
      console.log(`[TIME INFO] Revisión actual (última): ${sortedReviews[0].date} por ${sortedReviews[0].changedBy}`);
      
      // Encontrar la última completación que ocurrió ANTES de esta revisión actual
      const validCompletions = completions.filter(comp => 
        new Date(comp.date).getTime() < currentReviewTime
      ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      if (validCompletions.length > 0) {
        const relevantCompletion = validCompletions[0];
        
        // Actualizar timeInfo con los valores correctos para el ciclo actual
        timeInfo.inReviewAt = sortedReviews[0].date;
        timeInfo.completedAt = relevantCompletion.date;
        
        console.log(`[TIME INFO] Ciclo actual - Completado: ${relevantCompletion.date} por ${relevantCompletion.changedBy}`);
        console.log(`[TIME INFO] Ciclo actual - En revisión: ${sortedReviews[0].date} por ${sortedReviews[0].changedBy}`);
      } else {
        console.log(`[TIME INFO] No se encontró completación válida antes de la revisión actual: ${sortedReviews[0].date}`);
        // Si no hay completación antes de la revisión actual, podría ser un error en el flujo
        timeInfo.completedAt = undefined;
        timeInfo.inReviewAt = sortedReviews[0].date;
      }
    } else if (currentStatus === 'in_review' && timeInfo.inReviewAt) {
      // Fallback: usar la lógica original si no tenemos arrays completos
      console.log(`[TIME INFO] Usando lógica de fallback con primera revisión: ${timeInfo.inReviewAt}`);
    }
    
    console.log(`[TIME INFO] Completaciones encontradas:`, completions.map(c => `${c.date} por ${c.changedBy}`));
    console.log(`[TIME INFO] Revisiones encontradas:`, reviews.map(r => `${r.date} por ${r.changedBy}`));

    // Si no hay suficiente información del historial, intentar obtener desde task_work_assignments
    if (!timeInfo.assignedAt || !timeInfo.completedAt) {
      try {
        const { data: workDataRaw, error: workError } = await db
          .from('task_work_assignments')
          .select('date, created_at, end_time, status, updated_at')
          .eq(isSubtask ? 'subtask_id' : 'task_id', itemId)
          .eq('task_type', isSubtask ? 'subtask' : 'task')
          .single();

        const workData = workDataRaw as { created_at?: string; end_time?: string; status?: string; updated_at?: string } | null;
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

  // Validate message content before sending
  if (!message || message.trim().length === 0) {
    console.error('❌ [TELEGRAM] Error: El mensaje está vacío');
    return false;
  }

  // Check for potential HTML issues
  const htmlTagRegex = /<[^>]*>/g;
  const matches = message.match(htmlTagRegex);
  if (matches) {
    console.log(`[TELEGRAM] HTML tags encontrados en el mensaje:`, matches);
    
    // Check for empty tags that might cause parsing errors
    const emptyTagRegex = /<[^>]*><\/[^>]*>|<[^>]*\/>/g;
    const emptyMatches = message.match(emptyTagRegex);
    if (emptyMatches) {
      console.warn(`⚠️ [TELEGRAM] Tags HTML vacíos detectados que podrían causar errores:`, emptyMatches);
    }
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
      
      // Log the problematic area around byte offset if available
      if (error.description && error.description.includes('byte offset')) {
        const offsetMatch = error.description.match(/byte offset (\d+)/);
        if (offsetMatch) {
          const offset = parseInt(offsetMatch[1]);
          const start = Math.max(0, offset - 50);
          const end = Math.min(message.length, offset + 50);
          console.error('❌ [TELEGRAM] Área problemática del mensaje:', 
            `"${message.substring(start, end)}" (offset ${offset})`);
        }
      }
      
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
    const { db } = await import('../lib/db/serverDb.js');

    const { data, error } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'admin_telegram_chat_id')
      .single();

    if (error) {
      if (error.message && !error.message.includes('no rows')) {
        console.error('Error al obtener ID de admin de Telegram:', error);
      }
      return null;
    }

    const settingsData = data as { value?: { id?: string } } | null;
    if (settingsData?.value && typeof settingsData.value === 'object' && settingsData.value.id) {
      return settingsData.value.id;
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
  // Ensure all required parameters have safe values
  const safeTaskTitle = taskTitle || 'Tarea sin título';
  const safeUserName = userName || 'Usuario desconocido';
  const safeProjectName = projectName || 'Proyecto sin nombre';
  const safeAreaName = areaName || 'Sin área';
  
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${escapeHtml(parentTaskTitle)}` : '';
  
  // Calcular tiempo de trabajo si tenemos la información
  let timeWorked = '';
  console.log(`[MESSAGE] Creando mensaje para tarea completada. TimeInfo recibido:`, timeInfo);
  
  if (timeInfo?.assignedAt && timeInfo?.completedAt) {
    const duration = formatDuration(timeInfo.assignedAt, timeInfo.completedAt);
    timeWorked = `\n⏱️ <b>Tiempo de trabajo:</b> ${escapeDurationText(duration)}`;
    console.log(`[MESSAGE] Tiempo calculado: ${duration} (de ${timeInfo.assignedAt} a ${timeInfo.completedAt})`);
  } else {
    console.log(`[MESSAGE] No se pudo calcular tiempo. AssignedAt: ${timeInfo?.assignedAt}, CompletedAt: ${timeInfo?.completedAt}`);
  }
  
  return `🎉 <b>TAREA COMPLETADA</b>

👤 <b>Usuario:</b> ${escapeHtml(safeUserName)}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${escapeHtml(safeTaskTitle)}${parentInfo}
🏢 <b>Proyecto:</b> ${escapeHtml(safeProjectName)}
🏷️ <b>Área:</b> ${escapeHtml(safeAreaName)}${timeWorked}

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
  // Ensure all required parameters have safe values
  const safeTaskTitle = taskTitle || 'Tarea sin título';
  const safeUserName = userName || 'Usuario desconocido';
  const safeProjectName = projectName || 'Proyecto sin nombre';
  const safeAreaName = areaName || 'Sin área';
  const safeBlockReason = blockReason || 'No especificado';
  
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${escapeHtml(parentTaskTitle)}` : '';
  
  // Calcular tiempo trabajado antes del bloqueo
  let timeWorked = '';
  if (timeInfo?.assignedAt && timeInfo?.blockedAt) {
    const duration = formatDuration(timeInfo.assignedAt, timeInfo.blockedAt);
    timeWorked = `\n⏱️ <b>Tiempo trabajado antes del bloqueo:</b> ${escapeDurationText(duration)}`;
  }
  
  return `🚫 <b>TAREA BLOQUEADA</b>

👤 <b>Usuario:</b> ${escapeHtml(safeUserName)}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${escapeHtml(safeTaskTitle)}${parentInfo}
🏢 <b>Proyecto:</b> ${escapeHtml(safeProjectName)}
🏷️ <b>Área:</b> ${escapeHtml(safeAreaName)}${timeWorked}

⚠️ <b>Motivo del bloqueo:</b> ${escapeHtml(safeBlockReason)}

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
  // Ensure all required parameters have safe values
  const safeTaskTitle = taskTitle || 'Tarea sin título';
  const safeUserName = userName || 'Usuario desconocido';
  const safeProjectName = projectName || 'Proyecto sin nombre';
  const safeAreaName = areaName || 'Sin área';
  const safeAdminName = adminName || 'Administrador';
  
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${escapeHtml(parentTaskTitle)}` : '';
  
  // Calcular tiempo desde completada hasta puesta en revisión
  let reviewTime = '';
  if (timeInfo?.completedAt && timeInfo?.inReviewAt) {
    const duration = formatDuration(timeInfo.completedAt, timeInfo.inReviewAt);
    reviewTime = `\n⏱️ <b>Tiempo hasta revisión:</b> ${escapeDurationText(duration)}`;
  }
  
  return `🔍 <b>TAREA EN REVISIÓN</b>

👤 <b>Usuario:</b> ${escapeHtml(safeUserName)}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${escapeHtml(safeTaskTitle)}${parentInfo}
🏢 <b>Proyecto:</b> ${escapeHtml(safeProjectName)}
🏷️ <b>Área:</b> ${escapeHtml(safeAreaName)}
👩‍💼 <b>Admin:</b> ${escapeHtml(safeAdminName)}${reviewTime}

📋 La ${taskType} ha sido puesta en revisión por ${escapeHtml(safeAdminName)}.`;
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
  // Ensure all required parameters have safe values
  const safeTaskTitle = taskTitle || 'Tarea sin título';
  const safeUserName = userName || 'Usuario desconocido';
  const safeProjectName = projectName || 'Proyecto sin nombre';
  const safeAreaName = areaName || 'Sin área';
  const safeAdminName = adminName || 'Administrador';
  
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${escapeHtml(parentTaskTitle)}` : '';
  
  // Calcular tiempo de revisión y tiempo total
  let timeDetails = '';
  if (timeInfo?.inReviewAt && timeInfo?.approvedAt) {
    const reviewDuration = formatDuration(timeInfo.inReviewAt, timeInfo.approvedAt);
    timeDetails += `\n⏱️ <b>Tiempo de revisión:</b> ${escapeDurationText(reviewDuration)}`;
  }
  
  if (timeInfo?.assignedAt && timeInfo?.approvedAt) {
    const totalDuration = formatDuration(timeInfo.assignedAt, timeInfo.approvedAt);
    timeDetails += `\n🏁 <b>Tiempo total del ciclo:</b> ${escapeDurationText(totalDuration)}`;
  }
  
  return `✅ <b>TAREA APROBADA</b>

👤 <b>Usuario:</b> ${escapeHtml(safeUserName)}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${escapeHtml(safeTaskTitle)}${parentInfo}
🏢 <b>Proyecto:</b> ${escapeHtml(safeProjectName)}
🏷️ <b>Área:</b> ${escapeHtml(safeAreaName)}
👩‍💼 <b>Admin:</b> ${escapeHtml(safeAdminName)}${timeDetails}

🎉 La ${taskType} ha sido aprobada por ${escapeHtml(safeAdminName)} y está finalizada.`;
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
  // Ensure all required parameters have safe values
  const safeTaskTitle = taskTitle || 'Tarea sin título';
  const safeUserName = userName || 'Usuario desconocido';
  const safeProjectName = projectName || 'Proyecto sin nombre';
  const safeAreaName = areaName || 'Sin área';
  const safeReturnFeedback = returnFeedback || 'Sin feedback especificado';
  const safeAdminName = adminName || 'Administrador';
  
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${escapeHtml(parentTaskTitle)}` : '';
  
  // Calcular tiempo de revisión antes de devolver
  let reviewTime = '';
  if (timeInfo?.inReviewAt && timeInfo?.returnedAt) {
    const duration = formatDuration(timeInfo.inReviewAt, timeInfo.returnedAt);
    reviewTime = `\n⏱️ <b>Tiempo en revisión:</b> ${escapeDurationText(duration)}`;
  }
  
  return `🔄 <b>TAREA DEVUELTA</b>

👤 <b>Usuario:</b> ${escapeHtml(safeUserName)}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${escapeHtml(safeTaskTitle)}${parentInfo}
🏢 <b>Proyecto:</b> ${escapeHtml(safeProjectName)}
🏷️ <b>Área:</b> ${escapeHtml(safeAreaName)}
👩‍💼 <b>Admin:</b> ${escapeHtml(safeAdminName)}${reviewTime}

📝 <b>Feedback:</b> ${escapeHtml(safeReturnFeedback)}

🔧 La ${taskType} ha sido devuelta por ${escapeHtml(safeAdminName)} al usuario para correcciones.`;
}

// Función para crear mensaje de notificación de reasignación para administradores
export function createTaskReassignedMessage(
  taskTitle: string,
  previousUserName: string,
  newUserName: string,
  projectName: string,
  areaName: string,
  adminName: string,
  isSubtask: boolean = false,
  parentTaskTitle?: string
): string {
  const safeTaskTitle = taskTitle || 'Tarea sin título';
  const safePreviousUserName = previousUserName || 'Usuario desconocido';
  const safeNewUserName = newUserName || 'Usuario desconocido';
  const safeProjectName = projectName || 'Proyecto sin nombre';
  const safeAreaName = areaName || 'Sin área';
  const safeAdminName = adminName || 'Administrador';
  
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${escapeHtml(parentTaskTitle)}` : '';
  
  return `👤 <b>TAREA REASIGNADA</b>

👩‍💼 <b>Admin:</b> ${escapeHtml(safeAdminName)}
${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${escapeHtml(safeTaskTitle)}${parentInfo}
🏢 <b>Proyecto:</b> ${escapeHtml(safeProjectName)}
🏷️ <b>Área:</b> ${escapeHtml(safeAreaName)}

👤 <b>Responsable anterior:</b> ${escapeHtml(safePreviousUserName)}
👤 <b>Nuevo responsable:</b> ${escapeHtml(safeNewUserName)}

La ${taskType} ha sido reasignada por ${escapeHtml(safeAdminName)}.`;
}

// Función para crear mensaje de notificación de tarea disponible
export function createTaskAvailableMessage(
  taskTitle: string, 
  projectName: string,
  reason: 'unblocked' | 'returned' | 'sequential_dependency_completed' | 'created_available' | 'reassigned',
  isSubtask: boolean = false,
  parentTaskTitle?: string
): string {
  // Ensure all required parameters have safe values
  const safeTaskTitle = taskTitle || 'Tarea sin título';
  const safeProjectName = projectName || 'Proyecto sin nombre';
  
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
    case 'reassigned':
      reasonText = 'Has sido asignado a esta tarea';
      icon = '👤';
      break;
  }
  
  return `${icon} <b>TAREA DISPONIBLE</b>

${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${escapeHtml(safeTaskTitle)}${parentInfo}
🏢 <b>Proyecto:</b> ${escapeHtml(safeProjectName)}

💡 <b>Motivo:</b> ${reasonText}

🚀 Puedes asignar esta ${taskType} en tu panel de trabajo.`;
}

// Función para crear mensaje de notificación cuando una tarea del usuario va a revisión
export function createUserTaskInReviewMessage(
  taskTitle: string,
  projectName: string,
  adminName: string,
  isSubtask: boolean = false,
  parentTaskTitle?: string,
  timeInfo?: { completedAt?: string; inReviewAt?: string }
): string {
  const safeTaskTitle = taskTitle || 'Tarea sin título';
  const safeProjectName = projectName || 'Proyecto sin nombre';
  const safeAdminName = adminName || 'Administrador';
  
  const taskType = isSubtask ? 'subtarea' : 'tarea';
  const parentInfo = isSubtask && parentTaskTitle ? `\n📋 <b>Tarea principal:</b> ${escapeHtml(parentTaskTitle)}` : '';
  
  // Calcular tiempo desde completada hasta puesta en revisión
  let reviewTime = '';
  if (timeInfo?.completedAt && timeInfo?.inReviewAt) {
    const duration = formatDuration(timeInfo.completedAt, timeInfo.inReviewAt);
    reviewTime = `\n⏱️ <b>Tiempo hasta revisión:</b> ${escapeDurationText(duration)}`;
  }
  
  return `🔍 <b>TU TAREA ESTÁ EN REVISIÓN</b>

${isSubtask ? '🔸' : '📋'} <b>${taskType.charAt(0).toUpperCase() + taskType.slice(1)}:</b> ${escapeHtml(safeTaskTitle)}${parentInfo}
🏢 <b>Proyecto:</b> ${escapeHtml(safeProjectName)}
👩‍💼 <b>Revisada por:</b> ${escapeHtml(safeAdminName)}${reviewTime}

✨ Tu ${taskType} ha sido puesta en revisión por ${escapeHtml(safeAdminName)}. Te notificaremos cuando sea aprobada o si necesita correcciones.`;
}

// Función para notificar a usuarios específicos cuando sus tareas van a revisión
export async function notifyUsersTaskInReview(
  userIds: string[],
  taskTitle: string,
  projectName: string,
  adminName: string,
  isSubtask: boolean = false,
  parentTaskTitle?: string,
  timeInfo?: { completedAt?: string; inReviewAt?: string }
): Promise<number> {
  if (!userIds || userIds.length === 0) {
    return 0;
  }

  try {
    const { db } = await import('../lib/db/serverDb.js');

    const { data: usersRaw, error: usersError } = await db
      .from('users')
      .select('id, telegram_chat_id, name, email')
      .in('id', userIds)
      .not('telegram_chat_id', 'is', null);

    if (usersError || !usersRaw) {
      console.error('Error obteniendo usuarios para notificación de revisión:', usersError);
      return 0;
    }

    type UserRecord = { telegram_chat_id?: string | null; name?: string; email?: string };
    const users: UserRecord[] = Array.isArray(usersRaw) ? (usersRaw as UserRecord[]) : (usersRaw ? [usersRaw as UserRecord] : []);

    // Crear mensaje
    const message = createUserTaskInReviewMessage(
      taskTitle, 
      projectName, 
      adminName, 
      isSubtask, 
      parentTaskTitle, 
      timeInfo
    );

    let successCount = 0;

    // Enviar a cada usuario
    for (const user of users) {
      if (user.telegram_chat_id) {
        const success = await sendTelegramMessage(user.telegram_chat_id, message);
        if (success) {
          console.log(`✅ Notificación de revisión enviada a ${user.name || user.email}`);
          successCount++;
        } else {
          console.error(`❌ Error enviando notificación de revisión a ${user.name || user.email}`);
        }
      }
    }

    return successCount;
  } catch (error) {
    console.error('Error en notifyUsersTaskInReview:', error);
    return 0;
  }
}

// Función para notificar a un usuario específico sobre tarea disponible
export async function notifyTaskAvailable(
  userId: string,
  taskTitle: string,
  projectName: string,
  reason: 'unblocked' | 'returned' | 'sequential_dependency_completed' | 'created_available' | 'reassigned',
  isSubtask: boolean = false,
  parentTaskTitle?: string
): Promise<boolean> {
  try {
    const { db } = await import('../lib/db/serverDb.js');

    const { data: userDataRaw, error: userError } = await db
      .from('users')
      .select('telegram_chat_id, name, email')
      .eq('id', userId)
      .single();

    if (userError || !userDataRaw) {
      console.error('Error obteniendo datos del usuario:', userError);
      return false;
    }

    const userData = userDataRaw as { telegram_chat_id?: string | null; name?: string; email?: string };
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

// Función para notificar a múltiples usuarios sobre tarea disponible con retry
export async function notifyMultipleUsersTaskAvailable(
  userIds: string[],
  taskTitle: string,
  projectName: string,
  reason: 'unblocked' | 'returned' | 'sequential_dependency_completed' | 'created_available' | 'reassigned',
  isSubtask: boolean = false,
  parentTaskTitle?: string
): Promise<number> {
  let successCount = 0;
  
  for (const userId of userIds) {
    const success = await notifyTaskAvailableWithRetry(userId, taskTitle, projectName, reason, isSubtask, parentTaskTitle);
    if (success) {
      successCount++;
    }
    // Pequeña pausa entre notificaciones para evitar rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`Notificaciones de tarea disponible enviadas: ${successCount}/${userIds.length}`);
  return successCount;
}

// Función con sistema de retry para notificaciones
export async function notifyTaskAvailableWithRetry(
  userId: string,
  taskTitle: string,
  projectName: string,
  reason: 'unblocked' | 'returned' | 'sequential_dependency_completed' | 'created_available' | 'reassigned',
  isSubtask: boolean = false,
  parentTaskTitle?: string,
  maxRetries: number = 3
): Promise<boolean> {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const success = await notifyTaskAvailable(userId, taskTitle, projectName, reason, isSubtask, parentTaskTitle);
      
      if (success) {
        if (attempt > 1) {
          console.log(`✅ [RETRY] Notificación exitosa en intento ${attempt}/${maxRetries} para usuario ${userId}`);
        }
        return true;
      } else {
        lastError = new Error('Notification failed');
      }
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ [RETRY] Intento ${attempt}/${maxRetries} falló para usuario ${userId}:`, error);
    }
    
    // Esperar antes del siguiente intento (backoff exponencial)
    if (attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 segundos
      console.log(`🔄 [RETRY] Esperando ${delay}ms antes del siguiente intento...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.error(`❌ [RETRY] Falló notificación después de ${maxRetries} intentos para usuario ${userId}:`, lastError);
  return false;
}

// Función para envío robusto de notificaciones con manejo de errores mejorado
export async function sendNotificationRobust(
  endpoint: string,
  payload: any,
  description: string,
  maxRetries: number = 2
): Promise<boolean> {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        if (attempt > 1) {
          console.log(`✅ [ROBUST] ${description} exitosa en intento ${attempt}/${maxRetries}`);
        }
        return true;
      } else {
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        
        // Si es error 4xx, no reintentamos (error del cliente)
        if (response.status >= 400 && response.status < 500) {
          console.error(`❌ [ROBUST] Error de cliente para ${description}: ${response.status}`);
          break;
        }
      }
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ [ROBUST] Intento ${attempt}/${maxRetries} falló para ${description}:`, error);
    }
    
    // Esperar antes del siguiente intento
    if (attempt < maxRetries) {
      const delay = 1000 * attempt; // 1s, 2s, 3s...
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.error(`❌ [ROBUST] Falló ${description} después de ${maxRetries} intentos:`, lastError);
  return false;
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