import { supabase } from './supabase-client.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown';
  message_thread_id?: string;
}

export async function sendTelegramMessage(chatId: string, message: string, threadId?: string, requestId?: string): Promise<boolean> {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      requestId: requestId || 'N/A',
      timestamp: new Date().toISOString(),
      flow: 'telegram_api',
      step,
      ...data
    }, null, 2));
  };
  
  log('start', { chatId, has_thread_id: !!threadId });

  try {
    if (!TELEGRAM_BOT_TOKEN) {
      log('error', { details: 'Telegram bot token not configured' });
      throw new Error('Telegram bot token not configured');
    }

    const telegramMessage: TelegramMessage = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    };

    if (threadId) {
      telegramMessage.message_thread_id = threadId;
    }

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(telegramMessage)
    });

    if (!response.ok) {
      const error = await response.json();
      log('error', { context: 'Telegram API returned non-OK response', details: error });
      throw new Error(`Telegram API error: ${JSON.stringify(error)}`);
    }

    log('success');
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('fatal_error', { details: errorMessage, stack: error instanceof Error ? error.stack : '' });
    return false;
  }
}

export async function sendTestNotification(chatId: string, userId?: string, threadId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!TELEGRAM_BOT_TOKEN) {
      return { success: false, error: 'Bot de Telegram no configurado en el servidor' };
    }

    if (!chatId || !chatId.trim()) {
      return { success: false, error: 'Chat ID requerido' };
    }

    // Get current time
    const formattedTime = new Date().toLocaleString('es-ES');

    const testMessage = `🧪 <b>Notificación de Prueba</b>\n\n` +
      `✅ ¡Tu configuración de Telegram está funcionando correctamente!\n\n` +
      `📅 Fecha de prueba: ${formattedTime}\n` +
      `🔔 Ahora recibirás notificaciones automáticas del sistema.\n\n` +
      `💡 <i>Este es un mensaje de prueba generado desde la configuración de tu cuenta.</i>`;

    const success = await sendTelegramMessage(chatId, testMessage, threadId);

    if (success) {
      // Log test notification if userId is provided
      if (userId) {
        try {
          await supabase
            .from('telegram_notifications')
            .insert([{
              user_id: userId,
              message: testMessage,
              status: 'sent',
              error_message: null,
              created_at: new Date().toISOString()
            }]);
        } catch (dbError) {
          console.log('Could not log test notification to database:', dbError);
          // Continue anyway, the message was sent successfully
        }
      }
      
      return { success: true };
    } else {
      return { success: false, error: 'No se pudo enviar el mensaje. Verifica que el Chat ID sea correcto y que hayas iniciado una conversación con el bot.' };
    }

  } catch (error) {
    console.error('Error sending test notification:', error);
    return { success: false, error: 'Error interno del servidor al enviar la notificación' };
  }
}

export async function notifyTaskAssignment(
  userId: string, 
  taskData: any,
  requestId?: string
): Promise<void> {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      requestId: requestId || 'N/A',
      timestamp: new Date().toISOString(),
      flow: 'task_notification',
      step,
      ...data
    }, null, 2));
  };

  log('start', { userId, task_name: taskData.name, task_id: taskData.id });

  try {
    // Get user's telegram chat ID
    log('query_user_settings_start');
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('telegram_chat_id, name, email')
      .eq('id', userId)
      .single();
      
    log('query_user_settings_end', { has_data: !!user, has_error: !!userError, error_details: userError?.message });

    if (userError || !user?.telegram_chat_id) {
      log('error', { 
        context: 'Could not retrieve user or Telegram Chat ID is missing', 
        user_id: userId, 
        details: userError?.message 
      });
      return;
    }

    // Get admin chat ID for admin notifications
    const { data: adminConfig } = await supabase
      .from('app_metadata')
      .select('value')
      .eq('key', 'telegram_admin_chat_id')
      .single();

    // Format deadline if exists
    const deadlineText = taskData.deadline ? 
      `📅 Fecha límite: ${new Date(taskData.deadline).toLocaleDateString('es-ES')}\n` : '';

    // User notification message
    const userMessage = `🎯 <b>Nueva Tarea Asignada</b>\n\n` +
      `📋 Tarea: ${taskData.name}\n` +
      `📝 Descripción: ${taskData.description || 'Sin descripción'}\n` +
      `⭐ Prioridad: ${taskData.priority || 'Normal'}\n` +
      deadlineText +
      `📊 Estado: ${taskData.status || 'Pendiente'}\n\n` +
      `💡 <i>Revisa tu panel de tareas para más detalles.</i>`;

    // Admin notification message
    const adminMessage = `🔔 <b>Notificación de Asignación</b>\n\n` +
      `👤 Usuario: ${user.name} (${user.email})\n` +
      `📋 Tarea: ${taskData.name}\n` +
      `⭐ Prioridad: ${taskData.priority || 'Normal'}\n` +
      deadlineText +
      `🎯 <i>Tarea asignada y notificación enviada al usuario.</i>`;

    log('message_formatted', { user_message_length: userMessage.length, admin_message_length: adminMessage.length });

    // Send notification to user
    const userSuccess = await sendTelegramMessage(user.telegram_chat_id, userMessage, undefined, requestId);

    // Send notification to admin group if configured
    let adminSuccess = true;
    if (adminConfig?.value) {
      adminSuccess = await sendTelegramMessage(adminConfig.value, adminMessage, undefined, requestId);
    }

    log('database_log_start', { user_status: userSuccess ? 'sent' : 'failed', admin_status: adminSuccess ? 'sent' : 'failed' });
    
    // Log notification attempt
    try {
      await supabase
        .from('telegram_notifications')
        .insert([{
          user_id: userId,
          message: userMessage,
          status: userSuccess ? 'sent' : 'failed',
          error_message: userSuccess ? null : 'Failed to send Telegram message to user',
          created_at: new Date().toISOString()
        }]);
    } catch (dbError) {
      log('database_log_error', { details: dbError });
    }
    
    log('database_log_end');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('fatal_error', { details: errorMessage, stack: error instanceof Error ? error.stack : '' });
  }
}

export async function notifyTaskStatusChange(
  userId: string, 
  taskData: any,
  oldStatus: string,
  newStatus: string,
  requestId?: string
): Promise<void> {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      requestId: requestId || 'N/A',
      timestamp: new Date().toISOString(),
      flow: 'status_change_notification',
      step,
      ...data
    }, null, 2));
  };

  log('start', { userId, task_name: taskData.name, old_status: oldStatus, new_status: newStatus });

  try {
    // Get user's telegram chat ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('telegram_chat_id, name, email')
      .eq('id', userId)
      .single();

    if (userError || !user?.telegram_chat_id) {
      log('error', { 
        context: 'Could not retrieve user or Telegram Chat ID is missing', 
        user_id: userId, 
        details: userError?.message 
      });
      return;
    }

    // Get admin chat ID for admin notifications
    const { data: adminConfig } = await supabase
      .from('app_metadata')
      .select('value')
      .eq('key', 'telegram_admin_chat_id')
      .single();

    // Choose appropriate emoji and message based on status
    let emoji = '🔄';
    let statusText = newStatus;
    
    switch (newStatus.toLowerCase()) {
      case 'completed':
      case 'completada':
        emoji = '✅';
        statusText = 'Completada';
        break;
      case 'in_progress':
      case 'en_progreso':
        emoji = '🔄';
        statusText = 'En Progreso';
        break;
      case 'approved':
      case 'aprobada':
        emoji = '🎉';
        statusText = 'Aprobada';
        break;
      case 'returned':
      case 'devuelta':
        emoji = '↩️';
        statusText = 'Devuelta';
        break;
      case 'blocked':
      case 'bloqueada':
        emoji = '🚫';
        statusText = 'Bloqueada';
        break;
    }

    // User notification message
    const userMessage = `${emoji} <b>Estado de Tarea Actualizado</b>\n\n` +
      `📋 Tarea: ${taskData.name}\n` +
      `📊 Estado anterior: ${oldStatus}\n` +
      `📊 Nuevo estado: ${statusText}\n\n` +
      `💡 <i>Revisa tu panel de tareas para más detalles.</i>`;

    // Admin notification message
    const adminMessage = `${emoji} <b>Cambio de Estado de Tarea</b>\n\n` +
      `👤 Usuario: ${user.name}\n` +
      `📋 Tarea: ${taskData.name}\n` +
      `📊 ${oldStatus} → ${statusText}\n\n` +
      `🔔 <i>Notificación enviada al usuario.</i>`;

    // Send notifications
    const userSuccess = await sendTelegramMessage(user.telegram_chat_id, userMessage, undefined, requestId);
    
    let adminSuccess = true;
    if (adminConfig?.value) {
      adminSuccess = await sendTelegramMessage(adminConfig.value, adminMessage, undefined, requestId);
    }

    // Log notification attempt
    try {
      await supabase
        .from('telegram_notifications')
        .insert([{
          user_id: userId,
          message: userMessage,
          status: userSuccess ? 'sent' : 'failed',
          error_message: userSuccess ? null : 'Failed to send Telegram message to user',
          created_at: new Date().toISOString()
        }]);
    } catch (dbError) {
      log('database_log_error', { details: dbError });
    }

    log('notifications_sent', { user_success: userSuccess, admin_success: adminSuccess });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('fatal_error', { details: errorMessage, stack: error instanceof Error ? error.stack : '' });
  }
}

export async function notifyTaskAvailable(
  userId: string, 
  taskData: any,
  requestId?: string
): Promise<void> {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      requestId: requestId || 'N/A',
      timestamp: new Date().toISOString(),
      flow: 'task_available_notification',
      step,
      ...data
    }, null, 2));
  };

  log('start', { userId, task_name: taskData.title || taskData.name, task_id: taskData.id });

  try {
    // Get user's telegram chat ID
    log('query_user_settings_start');
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('telegram_chat_id, name, email')
      .eq('id', userId)
      .single();
      
    log('query_user_settings_end', { has_data: !!user, has_error: !!userError, error_details: userError?.message });

    if (userError || !user?.telegram_chat_id) {
      log('error', { 
        context: 'Could not retrieve user or Telegram Chat ID is missing', 
        user_id: userId, 
        details: userError?.message 
      });
      return;
    }

    // Format deadline if exists
    const deadlineText = taskData.deadline ? 
      `📅 Fecha límite: ${new Date(taskData.deadline).toLocaleDateString('es-ES')}\n` : '';

    // Format duration
    const durationText = taskData.estimated_duration ? 
      `⏱️ Duración estimada: ${taskData.estimated_duration} horas\n` : '';

    // User notification message
    const userMessage = `🎯 <b>¡Nueva Tarea Disponible!</b>\n\n` +
      `📋 Tarea: ${taskData.title || taskData.name}\n` +
      `📝 Descripción: ${taskData.description || 'Sin descripción'}\n` +
      `⭐ Prioridad: ${taskData.priority === 'high' ? 'Alta' : taskData.priority === 'medium' ? 'Media' : 'Baja'}\n` +
      durationText +
      deadlineText +
      `📁 Proyecto: ${taskData.projectName || 'Sin proyecto'}\n\n` +
      `🚀 <i>¡Asígnate esta tarea para comenzar a trabajar!</i>\n\n` +
      `💡 Ve a tu panel de tareas para asignártela.`;

    log('message_formatted', { user_message_length: userMessage.length });

    // Send notification to user
    const userSuccess = await sendTelegramMessage(user.telegram_chat_id, userMessage, undefined, requestId);

    log('database_log_start', { user_status: userSuccess ? 'sent' : 'failed' });
    
    // Log notification attempt
    try {
      await supabase
        .from('telegram_notifications')
        .insert([{
          user_id: userId,
          message: userMessage,
          status: userSuccess ? 'sent' : 'failed',
          error_message: userSuccess ? null : 'Failed to send Telegram message to user',
          created_at: new Date().toISOString()
        }]);
    } catch (dbError) {
      log('database_log_error', { details: dbError });
    }
    
    log('database_log_end');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('fatal_error', { details: errorMessage, stack: error instanceof Error ? error.stack : '' });
  }
}

export async function notifyTaskReturned(
  userId: string, 
  taskData: any,
  returnReason?: string,
  requestId?: string
): Promise<void> {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      requestId: requestId || 'N/A',
      timestamp: new Date().toISOString(),
      flow: 'task_returned_notification',
      step,
      ...data
    }, null, 2));
  };

  log('start', { userId, task_name: taskData.title || taskData.name, task_id: taskData.id });

  try {
    // Get user's telegram chat ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('telegram_chat_id, name, email')
      .eq('id', userId)
      .single();

    if (userError || !user?.telegram_chat_id) {
      log('error', { 
        context: 'Could not retrieve user or Telegram Chat ID is missing', 
        user_id: userId, 
        details: userError?.message 
      });
      return;
    }

    // Format return reason if provided
    const reasonText = returnReason ? 
      `📝 <b>Motivo de devolución:</b> ${returnReason}\n\n` : '';

    // User notification message
    const userMessage = `↩️ <b>Tarea Devuelta para Corrección</b>\n\n` +
      `📋 Tarea: ${taskData.title || taskData.name}\n` +
      `📊 Estado: Devuelta para revisión\n` +
      `📁 Proyecto: ${taskData.projectName || 'Sin proyecto'}\n\n` +
      reasonText +
      `🔧 <b>Próximos pasos:</b>\n` +
      `• Revisa los comentarios del revisor\n` +
      `• Realiza las correcciones necesarias\n` +
      `• Cambia el estado a "En progreso" para continuar\n` +
      `• Vuelve a entregar cuando esté lista\n\n` +
      `💪 <i>¡No te desanimes! Esto es parte del proceso de mejora.</i>`;

    // Send notification to user
    const userSuccess = await sendTelegramMessage(user.telegram_chat_id, userMessage, undefined, requestId);

    // Log notification attempt
    try {
      await supabase
        .from('telegram_notifications')
        .insert([{
          user_id: userId,
          message: userMessage,
          status: userSuccess ? 'sent' : 'failed',
          error_message: userSuccess ? null : 'Failed to send Telegram message to user',
          created_at: new Date().toISOString()
        }]);
    } catch (dbError) {
      log('database_log_error', { details: dbError });
    }

    log('notifications_sent', { user_success: userSuccess });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('fatal_error', { details: errorMessage, stack: error instanceof Error ? error.stack : '' });
  }
}

export async function notifyTaskApproved(
  userId: string, 
  taskData: any,
  approvalComment?: string,
  requestId?: string
): Promise<void> {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      requestId: requestId || 'N/A',
      timestamp: new Date().toISOString(),
      flow: 'task_approved_notification',
      step,
      ...data
    }, null, 2));
  };

  log('start', { userId, task_name: taskData.title || taskData.name, task_id: taskData.id });

  try {
    // Get user's telegram chat ID
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('telegram_chat_id, name, email')
      .eq('id', userId)
      .single();

    if (userError || !user?.telegram_chat_id) {
      log('error', { 
        context: 'Could not retrieve user or Telegram Chat ID is missing', 
        user_id: userId, 
        details: userError?.message 
      });
      return;
    }

    // Format approval comment if provided
    const commentText = approvalComment ? 
      `💬 <b>Comentario del revisor:</b> ${approvalComment}\n\n` : '';

    // User notification message
    const userMessage = `🎉 <b>¡Tarea Aprobada!</b>\n\n` +
      `📋 Tarea: ${taskData.title || taskData.name}\n` +
      `✅ Estado: Aprobada\n` +
      `📁 Proyecto: ${taskData.projectName || 'Sin proyecto'}\n\n` +
      commentText +
      `🏆 <b>¡Excelente trabajo!</b>\n` +
      `• Tu tarea ha sido aprobada exitosamente\n` +
      `• El trabajo cumple con todos los requisitos\n` +
      `• Puedes continuar con nuevas tareas disponibles\n\n` +
      `🚀 <i>¡Sigue así! Tu calidad de trabajo es excepcional.</i>`;

    // Send notification to user
    const userSuccess = await sendTelegramMessage(user.telegram_chat_id, userMessage, undefined, requestId);

    // Log notification attempt
    try {
      await supabase
        .from('telegram_notifications')
        .insert([{
          user_id: userId,
          message: userMessage,
          status: userSuccess ? 'sent' : 'failed',
          error_message: userSuccess ? null : 'Failed to send Telegram message to user',
          created_at: new Date().toISOString()
        }]);
    } catch (dbError) {
      log('database_log_error', { details: dbError });
    }

    log('notifications_sent', { user_success: userSuccess });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('fatal_error', { details: errorMessage, stack: error instanceof Error ? error.stack : '' });
  }
}

export async function notifyAdminTaskSubmitted(
  userId: string, 
  taskData: any,
  submissionNotes?: string,
  requestId?: string
): Promise<void> {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      requestId: requestId || 'N/A',
      timestamp: new Date().toISOString(),
      flow: 'admin_task_submitted_notification',
      step,
      ...data
    }, null, 2));
  };

  log('start', { userId, task_name: taskData.title || taskData.name, task_id: taskData.id });

  try {
    // Get user info
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', userId)
      .single();

    if (userError) {
      log('error', { 
        context: 'Could not retrieve user info', 
        user_id: userId, 
        details: userError?.message 
      });
      return;
    }

    // Get admin chat ID
    const { data: adminConfig } = await supabase
      .from('app_metadata')
      .select('value')
      .eq('key', 'telegram_admin_chat_id')
      .single();

    if (!adminConfig?.value) {
      log('error', { context: 'Admin chat ID not configured' });
      return;
    }

    // Format submission notes if provided
    const notesText = submissionNotes ? 
      `📝 <b>Notas de entrega:</b> ${submissionNotes}\n\n` : '';

    // Admin notification message
    const adminMessage = `📋 <b>Tarea Entregada para Revisión</b>\n\n` +
      `👤 Usuario: ${user.name} (${user.email})\n` +
      `📋 Tarea: ${taskData.title || taskData.name}\n` +
      `📅 Entregada: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}\n` +
      `⭐ Prioridad: ${taskData.priority === 'high' ? 'Alta' : taskData.priority === 'medium' ? 'Media' : 'Baja'}\n` +
      `📁 Proyecto: ${taskData.projectName || 'Sin proyecto'}\n\n` +
      notesText +
      `🔍 <b>Acción requerida:</b>\n` +
      `• Revisar el trabajo entregado\n` +
      `• Aprobar o devolver con comentarios\n` +
      `• Cambiar estado en el panel de gestión\n\n` +
      `⏰ <i>Pendiente de revisión administrativa.</i>`;

    // Send notification to admin
    const adminSuccess = await sendTelegramMessage(adminConfig.value, adminMessage, undefined, requestId);

    log('notifications_sent', { admin_success: adminSuccess });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('fatal_error', { details: errorMessage, stack: error instanceof Error ? error.stack : '' });
  }
}

export async function notifyAdminTaskApproved(
  userId: string, 
  taskData: any,
  approvedBy: string,
  requestId?: string
): Promise<void> {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      requestId: requestId || 'N/A',
      timestamp: new Date().toISOString(),
      flow: 'admin_task_approved_notification',
      step,
      ...data
    }, null, 2));
  };

  log('start', { userId, task_name: taskData.title || taskData.name, task_id: taskData.id, approved_by: approvedBy });

  try {
    // Get user info
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', userId)
      .single();

    if (userError) {
      log('error', { 
        context: 'Could not retrieve user info', 
        user_id: userId, 
        details: userError?.message 
      });
      return;
    }

    // Get admin chat ID
    const { data: adminConfig } = await supabase
      .from('app_metadata')
      .select('value')
      .eq('key', 'telegram_admin_chat_id')
      .single();

    if (!adminConfig?.value) {
      log('error', { context: 'Admin chat ID not configured' });
      return;
    }

    // Admin notification message
    const adminMessage = `✅ <b>Tarea Aprobada</b>\n\n` +
      `👤 Usuario: ${user.name} (${user.email})\n` +
      `📋 Tarea: ${taskData.title || taskData.name}\n` +
      `👨‍💼 Aprobada por: ${approvedBy}\n` +
      `📅 Fecha: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}\n` +
      `📁 Proyecto: ${taskData.projectName || 'Sin proyecto'}\n\n` +
      `📊 <b>Resumen:</b>\n` +
      `• Tarea completada exitosamente\n` +
      `• Usuario notificado de la aprobación\n` +
      `• Trabajo cumple con los estándares de calidad\n\n` +
      `🎯 <i>Proceso completado correctamente.</i>`;

    // Send notification to admin
    const adminSuccess = await sendTelegramMessage(adminConfig.value, adminMessage, undefined, requestId);

    log('notifications_sent', { admin_success: adminSuccess });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('fatal_error', { details: errorMessage, stack: error instanceof Error ? error.stack : '' });
  }
}

export async function notifyAdminTaskBlocked(
  userId: string, 
  taskData: any,
  blockReason?: string,
  requestId?: string
): Promise<void> {
  const log = (step: string, data: Record<string, any> = {}) => {
    console.log(JSON.stringify({
      requestId: requestId || 'N/A',
      timestamp: new Date().toISOString(),
      flow: 'admin_task_blocked_notification',
      step,
      ...data
    }, null, 2));
  };

  log('start', { userId, task_name: taskData.title || taskData.name, task_id: taskData.id });

  try {
    // Get user info
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', userId)
      .single();

    if (userError) {
      log('error', { 
        context: 'Could not retrieve user info', 
        user_id: userId, 
        details: userError?.message 
      });
      return;
    }

    // Get admin chat ID
    const { data: adminConfig } = await supabase
      .from('app_metadata')
      .select('value')
      .eq('key', 'telegram_admin_chat_id')
      .single();

    if (!adminConfig?.value) {
      log('error', { context: 'Admin chat ID not configured' });
      return;
    }

    // Format block reason if provided
    const reasonText = blockReason ? 
      `📝 <b>Motivo del bloqueo:</b> ${blockReason}\n\n` : '';

    // Admin notification message
    const adminMessage = `🚫 <b>Tarea Bloqueada por Usuario</b>\n\n` +
      `👤 Usuario: ${user.name} (${user.email})\n` +
      `📋 Tarea: ${taskData.title || taskData.name}\n` +
      `📅 Bloqueada: ${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES')}\n` +
      `⭐ Prioridad: ${taskData.priority === 'high' ? 'Alta' : taskData.priority === 'medium' ? 'Media' : 'Baja'}\n` +
      `📁 Proyecto: ${taskData.projectName || 'Sin proyecto'}\n\n` +
      reasonText +
      `⚠️ <b>Acción requerida:</b>\n` +
      `• Revisar el motivo del bloqueo\n` +
      `• Contactar al usuario para resolver impedimentos\n` +
      `• Determinar si la tarea debe ser reasignada\n` +
      `• Resolver el problema reportado\n\n` +
      `🔍 <i>Requiere atención administrativa inmediata.</i>`;

    // Send notification to admin
    const adminSuccess = await sendTelegramMessage(adminConfig.value, adminMessage, undefined, requestId);

    log('notifications_sent', { admin_success: adminSuccess });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log('fatal_error', { details: errorMessage, stack: error instanceof Error ? error.stack : '' });
  }
} 