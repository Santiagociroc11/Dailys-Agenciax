import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  handleTestNotification, 
  sendAdminNotification, 
  createTaskCompletedMessage, 
  createTaskBlockedMessage,
  createTaskInReviewMessage,
  createTaskApprovedMessage,
  createTaskReturnedMessage,
  getTimeInfo
} from './api/telegram.js';

const app = express();
const port = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(express.json());

// Obtener __dirname en módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    if (!taskTitle || !userName || !projectName || !status) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan parámetros requeridos: taskTitle, userName, projectName, status' 
      });
    }

    // Validar que el status sea válido
    if (!['completed', 'blocked', 'in_review', 'approved', 'returned'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'El status debe ser "completed", "blocked", "in_review", "approved" o "returned"' 
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

// Servir la aplicación de React
const clientBuildPath = path.join(__dirname, '..');
app.use(express.static(clientBuildPath));

// Servir index.html para cualquier otra ruta (manejo de rutas de React)
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
}); 