import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleTestNotification, sendAdminNotification, createTaskCompletedMessage, createTaskBlockedMessage } from './api/telegram.js';

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
    const message = createTaskCompletedMessage(
      "Tarea de prueba",
      "Usuario de prueba", 
      "Proyecto de prueba",
      false
    );
    
    const success = await sendAdminNotification(message);
    
    if (success) {
      return res.status(200).json({ 
        success: true, 
        message: 'Notificación de prueba enviada a administradores.' 
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
      status, 
      blockReason, 
      isSubtask = false, 
      parentTaskTitle 
    } = req.body;

    // Validar parámetros requeridos
    if (!taskTitle || !userName || !projectName || !status) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan parámetros requeridos: taskTitle, userName, projectName, status' 
      });
    }

    // Validar que el status sea válido
    if (!['completed', 'blocked'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'El status debe ser "completed" o "blocked"' 
      });
    }

    // Si es bloqueada, validar que haya razón del bloqueo
    if (status === 'blocked' && !blockReason) {
      return res.status(400).json({ 
        success: false, 
        error: 'El parámetro blockReason es requerido cuando status es "blocked"' 
      });
    }

    // Crear el mensaje apropiado según el estado
    let message;
    if (status === 'completed') {
      message = createTaskCompletedMessage(taskTitle, userName, projectName, isSubtask, parentTaskTitle);
    } else {
      message = createTaskBlockedMessage(taskTitle, userName, projectName, blockReason, isSubtask, parentTaskTitle);
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