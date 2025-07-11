const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown';
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

// Función para obtener el ID de chat de administradores
export async function getAdminTelegramChatId(): Promise<string | null> {
  try {
    const { supabase } = await import('../src/lib/supabase.js');
    
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'admin_telegram_chat_id')
      .single();

    if (error) {
      console.error('Error al obtener ID de chat de administradores:', error);
      return null;
    }

    return data?.value?.id || null;
  } catch (error) {
    console.error('Error al obtener configuración de administradores:', error);
    return null;
  }
}

// Función para obtener información de usuario y proyecto
export async function getTaskNotificationContext(taskId: string, subtaskId?: string): Promise<{
  taskTitle: string;
  projectName: string;
  userName: string;
  userEmail: string;
  taskType: 'task' | 'subtask';
} | null> {
  try {
    const { supabase } = await import('../src/lib/supabase.js');
    
    if (subtaskId) {
      // Es una subtarea
      const { data, error } = await supabase
        .from('subtasks')
        .select(`
          title,
          task_id,
          assigned_to,
          tasks!inner (
            title,
            project_id,
            projects (name)
          ),
          users!inner (
            name,
            email
          )
        `)
        .eq('id', subtaskId)
        .single();

      if (error || !data) {
        console.error('Error al obtener contexto de subtarea:', error);
        return null;
      }

      return {
        taskTitle: data.title,
        projectName: data.tasks?.projects?.name || 'Sin proyecto',
        userName: data.users?.name || 'Usuario desconocido',
        userEmail: data.users?.email || '',
        taskType: 'subtask'
      };
    } else {
      // Es una tarea principal
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          title,
          project_id,
          assigned_users,
          projects (name)
        `)
        .eq('id', taskId)
        .single();

      if (error || !data) {
        console.error('Error al obtener contexto de tarea:', error);
        return null;
      }

      // Obtener información del primer usuario asignado
      let userName = 'Usuario desconocido';
      let userEmail = '';
      
      if (data.assigned_users && data.assigned_users.length > 0) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', data.assigned_users[0])
          .single();

        if (!userError && userData) {
          userName = userData.name;
          userEmail = userData.email;
        }
      }

      return {
        taskTitle: data.title,
        projectName: data.projects?.name || 'Sin proyecto',
        userName,
        userEmail,
        taskType: 'task'
      };
    }
  } catch (error) {
    console.error('Error al obtener contexto de notificación:', error);
    return null;
  }
}

// Función para notificar cuando una tarea se completa
export async function notifyTaskCompleted(taskId: string, subtaskId?: string): Promise<boolean> {
  try {
    const adminChatId = await getAdminTelegramChatId();
    if (!adminChatId) {
      console.log('No hay ID de chat de administradores configurado');
      return false;
    }

    const context = await getTaskNotificationContext(taskId, subtaskId);
    if (!context) {
      console.error('No se pudo obtener contexto de la tarea');
      return false;
    }

    const taskTypeText = context.taskType === 'subtask' ? 'Subtarea' : 'Tarea';
    const message = `
🎉 <b>${taskTypeText} Completada</b>

📋 <b>${taskTypeText}:</b> ${context.taskTitle}
📁 <b>Proyecto:</b> ${context.projectName}
👤 <b>Usuario:</b> ${context.userName}
📧 <b>Email:</b> ${context.userEmail}
⏰ <b>Hora:</b> ${new Date().toLocaleString('es-ES')}

<i>La ${taskTypeText.toLowerCase()} ha sido marcada como completada y está esperando revisión.</i>
`;

    return await sendTelegramMessage(adminChatId, message);
  } catch (error) {
    console.error('Error al notificar tarea completada:', error);
    return false;
  }
}

// Función para notificar cuando una tarea se aprueba
export async function notifyTaskApproved(taskId: string, subtaskId?: string, approvedBy?: string): Promise<boolean> {
  try {
    const adminChatId = await getAdminTelegramChatId();
    if (!adminChatId) {
      console.log('No hay ID de chat de administradores configurado');
      return false;
    }

    const context = await getTaskNotificationContext(taskId, subtaskId);
    if (!context) {
      console.error('No se pudo obtener contexto de la tarea');
      return false;
    }

    // Obtener información del administrador que aprobó
    let adminName = 'Administrador';
    if (approvedBy) {
      try {
        const { supabase } = await import('../src/lib/supabase.js');
        const { data: adminData } = await supabase
          .from('users')
          .select('name')
          .eq('id', approvedBy)
          .single();
        
        if (adminData) {
          adminName = adminData.name;
        }
      } catch (error) {
        console.error('Error al obtener nombre del administrador:', error);
      }
    }

    const taskTypeText = context.taskType === 'subtask' ? 'Subtarea' : 'Tarea';
    const message = `
✅ <b>${taskTypeText} Aprobada</b>

📋 <b>${taskTypeText}:</b> ${context.taskTitle}
📁 <b>Proyecto:</b> ${context.projectName}
👤 <b>Usuario:</b> ${context.userName}
👨‍💼 <b>Aprobada por:</b> ${adminName}
⏰ <b>Hora:</b> ${new Date().toLocaleString('es-ES')}

<i>La ${taskTypeText.toLowerCase()} ha sido aprobada exitosamente.</i>
`;

    return await sendTelegramMessage(adminChatId, message);
  } catch (error) {
    console.error('Error al notificar tarea aprobada:', error);
    return false;
  }
}

// Función para notificar cuando una tarea se devuelve
export async function notifyTaskReturned(taskId: string, subtaskId?: string, returnedBy?: string, reason?: string): Promise<boolean> {
  try {
    const adminChatId = await getAdminTelegramChatId();
    if (!adminChatId) {
      console.log('No hay ID de chat de administradores configurado');
      return false;
    }

    const context = await getTaskNotificationContext(taskId, subtaskId);
    if (!context) {
      console.error('No se pudo obtener contexto de la tarea');
      return false;
    }

    // Obtener información del administrador que devolvió
    let adminName = 'Administrador';
    if (returnedBy) {
      try {
        const { supabase } = await import('../src/lib/supabase.js');
        const { data: adminData } = await supabase
          .from('users')
          .select('name')
          .eq('id', returnedBy)
          .single();
        
        if (adminData) {
          adminName = adminData.name;
        }
      } catch (error) {
        console.error('Error al obtener nombre del administrador:', error);
      }
    }

    const taskTypeText = context.taskType === 'subtask' ? 'Subtarea' : 'Tarea';
    const message = `
🔄 <b>${taskTypeText} Devuelta</b>

📋 <b>${taskTypeText}:</b> ${context.taskTitle}
📁 <b>Proyecto:</b> ${context.projectName}
👤 <b>Usuario:</b> ${context.userName}
👨‍💼 <b>Devuelta por:</b> ${adminName}
⏰ <b>Hora:</b> ${new Date().toLocaleString('es-ES')}

${reason ? `💬 <b>Motivo:</b> ${reason}` : ''}

<i>La ${taskTypeText.toLowerCase()} ha sido devuelta al usuario para correcciones.</i>
`;

    return await sendTelegramMessage(adminChatId, message);
  } catch (error) {
    console.error('Error al notificar tarea devuelta:', error);
    return false;
  }
}

// Función para notificar cuando una tarea se bloquea
export async function notifyTaskBlocked(taskId: string, subtaskId?: string, blockedBy?: string, reason?: string): Promise<boolean> {
  try {
    const adminChatId = await getAdminTelegramChatId();
    if (!adminChatId) {
      console.log('No hay ID de chat de administradores configurado');
      return false;
    }

    const context = await getTaskNotificationContext(taskId, subtaskId);
    if (!context) {
      console.error('No se pudo obtener contexto de la tarea');
      return false;
    }

    // Obtener información de quien bloqueó (puede ser admin o usuario)
    let blockedByName = 'Usuario';
    if (blockedBy) {
      try {
        const { supabase } = await import('../src/lib/supabase.js');
        const { data: userData } = await supabase
          .from('users')
          .select('name, role')
          .eq('id', blockedBy)
          .single();
        
        if (userData) {
          blockedByName = userData.name;
        }
      } catch (error) {
        console.error('Error al obtener nombre del usuario:', error);
      }
    }

    const taskTypeText = context.taskType === 'subtask' ? 'Subtarea' : 'Tarea';
    const message = `
🚫 <b>${taskTypeText} Bloqueada</b>

📋 <b>${taskTypeText}:</b> ${context.taskTitle}
📁 <b>Proyecto:</b> ${context.projectName}
👤 <b>Usuario:</b> ${context.userName}
🔒 <b>Bloqueada por:</b> ${blockedByName}
⏰ <b>Hora:</b> ${new Date().toLocaleString('es-ES')}

${reason ? `💬 <b>Motivo:</b> ${reason}` : ''}

<i>La ${taskTypeText.toLowerCase()} ha sido bloqueada y requiere atención.</i>
`;

    return await sendTelegramMessage(adminChatId, message);
  } catch (error) {
    console.error('Error al notificar tarea bloqueada:', error);
    return false;
  }
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