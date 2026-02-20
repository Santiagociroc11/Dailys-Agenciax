import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './lib/mongoose.js';
import { handleDbQuery, handleDbRpc } from './api/db.js';
import { 
  handleTestNotification, 
  sendAdminNotification, 
  sendBudgetAlert,
  sendTelegramMessage,
  createDeadlineReminderMessage,
  createDailySummaryMessage,
    createTaskCompletedMessage,
    createTaskBlockedMessage,
    createTaskInReviewMessage,
    createTaskApprovedMessage,
    createTaskReturnedMessage,
    createTaskReassignedMessage,
  getTimeInfo,
  notifyMultipleUsersTaskAvailable,
  notifyUsersTaskInReview
} from './api/telegram.js';

const app = express();
const port = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(express.json());

// Obtener __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// API de base de datos (MongoDB)
app.post('/api/db/query', handleDbQuery);
app.post('/api/db/rpc', handleDbRpc);

// Invalidar caché de app_settings tras actualizar configuración
app.post('/api/settings/invalidate-cache', async (_req, res) => {
  try {
    const { invalidateSetting } = await import('./lib/db/appSettingsCache.js');
    invalidateSetting('admin_telegram_chat_id');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error al invalidar caché' });
  }
});

// Endpoint para notificaciones de prueba
app.post('/api/telegram/test', handleTestNotification);

// Endpoint para probar notificaciones de administrador
app.post('/api/telegram/test-admin', async (req, res) => {
  try {
    // Simular información de tiempo para la prueba
    const timeInfo = {
      assignedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 horas atrás
      completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 horas atrás
      inReviewAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutos atrás
      approvedAt: new Date().toISOString() // Ahora
    };

    const message = createTaskApprovedMessage(
      "Tarea de prueba - Sistema de login",
      "Juan Pérez", 
      "Proyecto de prueba",
      "Área de Desarrollo",
      "Admin de Prueba",
      false,
      undefined,
      timeInfo
    );
    
    const success = await sendAdminNotification(message);
    
    if (success) {
      return res.status(200).json({ 
        success: true, 
        message: 'Notificación de prueba enviada a administradores con información de tiempo.' 
      });
    } else {
      return res.status(500).json({ 
        success: false, 
        error: 'No se pudo enviar la notificación. Verifica que haya un ID de admin configurado.' 
      });
    }
  } catch (error) {
    console.error('Error en test-admin endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor.' 
    });
  }
});

// Endpoint para notificaciones de administrador cuando las tareas son completadas/bloqueadas
app.post('/api/telegram/admin-notification', async (req, res) => {
  try {
    const { 
      taskTitle, 
      userName, 
      previousUserName,
      newUserName,
      projectName, 
      areaName,
      status, 
      blockReason, 
      returnFeedback,
      adminName,
      isSubtask = false, 
      parentTaskTitle,
      taskId // Nuevo parámetro para obtener información de tiempo
    } = req.body;

    // Validar parámetros requeridos
    if (!taskTitle || !projectName || !status) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan parámetros requeridos: taskTitle, projectName, status' 
      });
    }

    // Validar que el status sea válido
    if (!['completed', 'blocked', 'in_review', 'approved', 'returned', 'reassigned'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'El status debe ser "completed", "blocked", "in_review", "approved", "returned" o "reassigned"' 
      });
    }

    // Validaciones específicas por estado
    if (status !== 'reassigned' && !userName) {
      return res.status(400).json({ 
        success: false, 
        error: 'El parámetro userName es requerido para este status' 
      });
    }

    if (status === 'reassigned' && (!previousUserName || !newUserName)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Los parámetros previousUserName y newUserName son requeridos cuando status es "reassigned"' 
      });
    }

    // Validaciones específicas por estado
    if (status === 'blocked' && !blockReason) {
      return res.status(400).json({ 
        success: false, 
        error: 'El parámetro blockReason es requerido cuando status es "blocked"' 
      });
    }

    if (status === 'returned' && !returnFeedback) {
      return res.status(400).json({ 
        success: false, 
        error: 'El parámetro returnFeedback es requerido cuando status es "returned"' 
      });
    }

    // Obtener información de tiempo si tenemos el ID de la tarea
    let timeInfo = {};
    if (taskId) {
      console.log(`[SERVER] Obteniendo información de tiempo para ${isSubtask ? 'subtask' : 'task'} ID: ${taskId}, status: ${status}`);
      try {
        timeInfo = await getTimeInfo(taskId, isSubtask, status);
        console.log(`[SERVER] Información de tiempo obtenida:`, timeInfo);
      } catch (error) {
        console.warn('No se pudo obtener información de tiempo:', error);
        // Continuar sin información de tiempo si hay error
      }
    } else {
      console.warn('[SERVER] No se proporcionó taskId para obtener información de tiempo');
    }

    // Crear el mensaje apropiado según el estado
    let message;
    switch (status) {
      case 'completed':
        message = createTaskCompletedMessage(taskTitle, userName, projectName, areaName || 'Sin área', isSubtask, parentTaskTitle, timeInfo);
        break;
      case 'blocked':
        message = createTaskBlockedMessage(taskTitle, userName, projectName, areaName || 'Sin área', blockReason, isSubtask, parentTaskTitle, timeInfo);
        break;
      case 'in_review':
        message = createTaskInReviewMessage(taskTitle, userName, projectName, areaName || 'Sin área', adminName || 'Administrador', isSubtask, parentTaskTitle, timeInfo);
        break;
      case 'approved':
        message = createTaskApprovedMessage(taskTitle, userName, projectName, areaName || 'Sin área', adminName || 'Administrador', isSubtask, parentTaskTitle, timeInfo);
        break;
      case 'returned':
        message = createTaskReturnedMessage(taskTitle, userName, projectName, areaName || 'Sin área', returnFeedback, adminName || 'Administrador', isSubtask, parentTaskTitle, timeInfo);
        break;
      case 'reassigned':
        message = createTaskReassignedMessage(taskTitle, previousUserName, newUserName, projectName, areaName || 'Sin área', adminName || 'Administrador', isSubtask, parentTaskTitle);
        break;
      default:
        return res.status(400).json({ 
          success: false, 
          error: 'Status no reconocido' 
        });
    }

    // Enviar la notificación
    const success = await sendAdminNotification(message);

    if (success) {
      return res.status(200).json({ 
        success: true, 
        message: 'Notificación de administrador enviada correctamente.' 
      });
    } else {
      return res.status(500).json({ 
        success: false, 
        error: 'No se pudo enviar la notificación. Es posible que no haya un ID de admin configurado.' 
      });
    }

  } catch (error) {
    console.error('Error en admin-notification endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor.' 
    });
  }
});

// Endpoint para notificaciones de usuarios cuando sus tareas van a revisión
app.post('/api/telegram/user-task-in-review', async (req, res) => {
  try {
    const { 
      userIds, 
      taskTitle, 
      projectName,
      adminName,
      isSubtask = false,
      parentTaskTitle,
      timeInfo
    } = req.body;

    // Validar parámetros requeridos
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'El parámetro userIds es requerido y debe ser un array no vacío' 
      });
    }

    if (!taskTitle || !projectName || !adminName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Los parámetros taskTitle, projectName y adminName son requeridos' 
      });
    }

    console.log(`[SERVER] Enviando notificaciones de tarea en revisión. Admin: ${adminName}, Users: ${userIds.length}, Task: ${taskTitle}`);

    // Enviar las notificaciones
    const successCount = await notifyUsersTaskInReview(
      userIds, 
      taskTitle, 
      projectName, 
      adminName,
      isSubtask, 
      parentTaskTitle,
      timeInfo
    );

    return res.status(200).json({ 
      success: true, 
      message: `Notificaciones de revisión enviadas correctamente.`,
      sentCount: successCount,
      totalUsers: userIds.length
    });

  } catch (error) {
    console.error('Error en user-task-in-review endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor.' 
    });
  }
});

// Endpoint para recordatorios de vencimiento (para cron)
app.post('/api/telegram/deadline-reminders', async (req, res) => {
  try {
    const { Task, Subtask, Project, User } = await import('./models/index.js');
    const days = (req.body?.days as number) ?? 1;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const targetStr = targetDate.toISOString().split('T')[0];

    const tasksDue = await Task.find({
      status: { $nin: ['approved'] },
      deadline: { $gte: new Date(targetStr + 'T00:00:00'), $lt: new Date(targetStr + 'T23:59:59') },
    })
      .select('id title deadline project_id')
      .lean()
      .exec();

    const subtasksDue = await Subtask.find({
      status: { $nin: ['approved'] },
      deadline: { $gte: new Date(targetStr + 'T00:00:00'), $lt: new Date(targetStr + 'T23:59:59') },
    })
      .select('id title deadline task_id')
      .lean()
      .exec();

    const taskIdsForSubs = subtasksDue.map((s: { task_id: string }) => s.task_id);
    const parentTasksForSubs = await Task.find({ id: { $in: taskIdsForSubs } }).select('id title project_id').lean().exec();
    const parentTaskMap = new Map(parentTasksForSubs.map((t: { id: string; title: string; project_id: string }) => [t.id, t]));
    const projectIds = [...new Set([...tasksDue.map((t: { project_id: string }) => t.project_id), ...parentTasksForSubs.map((t: { project_id: string }) => t.project_id)])].filter(Boolean);
    const projects = await Project.find({ id: { $in: projectIds } }).select('id name').lean().exec();
    const projectMap = new Map(projects.map((p: { id: string; name: string }) => [p.id, p.name]));

    let sentCount = 0;
    for (const t of tasksDue) {
      const userIds = (t as { assigned_users?: string[] }).assigned_users || [];
      const projectName = projectMap.get(t.project_id) || 'Sin proyecto';
      const deadlineStr = new Date(t.deadline).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
      const msg = createDeadlineReminderMessage(t.title, projectName, deadlineStr, days, false);
      for (const uid of userIds) {
        const u = await User.findOne({ id: uid, telegram_chat_id: { $ne: null } }).select('telegram_chat_id').lean().exec();
        if (u?.telegram_chat_id) {
          const ok = await sendTelegramMessage(u.telegram_chat_id, msg);
          if (ok) sentCount++;
        }
      }
    }
    for (const s of subtasksDue) {
      const userId = (s as { assigned_to?: string }).assigned_to;
      if (!userId) continue;
      const parentTask = parentTaskMap.get(s.task_id);
      const projectName = parentTask?.project_id ? projectMap.get(parentTask.project_id) || 'Sin proyecto' : 'Sin proyecto';
      const deadlineStr = new Date(s.deadline).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
      const msg = createDeadlineReminderMessage(s.title, projectName, deadlineStr, days, true, parentTask?.title);
      const u = await User.findOne({ id: userId, telegram_chat_id: { $ne: null } }).select('telegram_chat_id').lean().exec();
      if (u?.telegram_chat_id) {
        const ok = await sendTelegramMessage(u.telegram_chat_id, msg);
        if (ok) sentCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Recordatorios enviados.`,
      remindersSent: sentCount,
      tasksChecked: tasksDue.length + subtasksDue.length,
    });
  } catch (error) {
    console.error('Error en deadline-reminders:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor.' });
  }
});

// Endpoint para resumen diario (tareas que vencen hoy) - para cron
app.post('/api/telegram/daily-summary', async (req, res) => {
  try {
    const { Task, Subtask, Project, User } = await import('./models/index.js');
    const today = new Date().toISOString().split('T')[0];
    const todayStart = new Date(today + 'T00:00:00');
    const todayEnd = new Date(today + 'T23:59:59');

    const usersWithTelegram = await User.find({ telegram_chat_id: { $ne: null } })
      .select('id name telegram_chat_id')
      .lean()
      .exec();

    let sentCount = 0;
    for (const user of usersWithTelegram) {
      const tasksDue = await Task.find({
        assigned_users: user.id,
        status: { $nin: ['approved'] },
        deadline: { $gte: todayStart, $lte: todayEnd },
      })
        .select('title project_id')
        .lean()
        .exec();

      const subtasksDue = await Subtask.find({
        assigned_to: user.id,
        status: { $nin: ['approved'] },
        deadline: { $gte: todayStart, $lte: todayEnd },
      })
        .select('title task_id')
        .lean()
        .exec();

      const projectIds = [...new Set(tasksDue.map((t: { project_id: string }) => t.project_id).filter(Boolean))];
      const projects = await Project.find({ id: { $in: projectIds } }).select('id name').lean().exec();
      const projectMap = new Map(projects.map((p: { id: string; name: string }) => [p.id, p.name]));

      const taskList: string[] = [];
      tasksDue.forEach((t: { title: string; project_id: string }) => {
        taskList.push(`${t.title} (${projectMap.get(t.project_id) || 'Proyecto'})`);
      });
      subtasksDue.forEach((s: { title: string }) => {
        taskList.push(s.title);
      });

      const total = taskList.length;
      const msg = createDailySummaryMessage(user.name || user.email || 'Usuario', total, taskList.slice(0, 10));
      const ok = await sendTelegramMessage(user.telegram_chat_id, msg);
      if (ok) sentCount++;
    }

    return res.status(200).json({
      success: true,
      message: 'Resumen diario enviado.',
      usersNotified: sentCount,
      totalUsers: usersWithTelegram.length,
    });
  } catch (error) {
    console.error('Error en daily-summary:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor.' });
  }
});

// Endpoint para verificar presupuestos y enviar alertas por Telegram (para cron)
app.post('/api/telegram/budget-check', async (req, res) => {
  try {
    const { Project, TaskWorkAssignment } = await import('./models/index.js');
    const threshold = (req.body?.threshold as number) ?? 80; // % a partir del cual alertar (default 80)

    const projects = await Project.find({
      is_archived: false,
      budget_hours: { $exists: true, $ne: null, $gt: 0 },
    })
      .select('id name budget_hours')
      .lean()
      .exec();

    const pipeline = [
      { $match: { project_id: { $ne: null }, actual_duration: { $exists: true, $gt: 0 } } },
      { $group: { _id: '$project_id', total_minutes: { $sum: '$actual_duration' } } },
    ];
    const hoursResults = await TaskWorkAssignment.aggregate(pipeline).exec();
    const hoursMap = new Map<string, number>();
    hoursResults.forEach((r: { _id: string; total_minutes: number }) => {
      hoursMap.set(r._id, Math.round((r.total_minutes / 60) * 100) / 100);
    });

    let sentCount = 0;
    for (const p of projects) {
      const consumed = hoursMap.get(p.id) ?? 0;
      const percent = Math.round((consumed / (p.budget_hours as number)) * 100);
      if (percent >= threshold) {
        const ok = await sendBudgetAlert(p.name, consumed, p.budget_hours as number, percent);
        if (ok) sentCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Verificación de presupuestos completada.`,
      alertsSent: sentCount,
      projectsChecked: projects.length,
    });
  } catch (error) {
    console.error('Error en budget-check endpoint:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor.',
    });
  }
});

// Endpoint para notificaciones de tareas disponibles
app.post('/api/telegram/task-available', async (req, res) => {
  try {
    const { 
      userIds, 
      taskTitle, 
      projectName,
      reason,
      isSubtask = false,
      parentTaskTitle
    } = req.body;

    // Validar parámetros requeridos
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'El parámetro userIds es requerido y debe ser un array no vacío' 
      });
    }

    if (!taskTitle || !projectName || !reason) {
      return res.status(400).json({ 
        success: false, 
        error: 'Los parámetros taskTitle, projectName y reason son requeridos' 
      });
    }

    // Validar que el reason sea válido
    const validReasons = ['unblocked', 'returned', 'sequential_dependency_completed', 'created_available', 'reassigned'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ 
        success: false, 
        error: `El parámetro reason debe ser uno de: ${validReasons.join(', ')}` 
      });
    }

    console.log(`[SERVER] Enviando notificaciones de tarea disponible. Reason: ${reason}, Users: ${userIds.length}, Task: ${taskTitle}`);

    // Enviar las notificaciones
    const successCount = await notifyMultipleUsersTaskAvailable(
      userIds, 
      taskTitle, 
      projectName, 
      reason, 
      isSubtask, 
      parentTaskTitle
    );

    return res.status(200).json({ 
      success: true, 
      message: `Notificaciones enviadas correctamente.`,
      sentCount: successCount,
      totalUsers: userIds.length
    });

  } catch (error) {
    console.error('Error en task-available endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor.' 
    });
  }
});

// Servir la aplicación de React
const clientBuildPath = path.join(__dirname, '..');
app.use(express.static(clientBuildPath));

// Servir index.html para cualquier otra ruta (manejo de rutas de React)
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error('❌ Error conectando a MongoDB:', err);
    process.exit(1);
  }); 