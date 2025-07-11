import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  handleTestNotification,
  notifyTaskCompleted,
  notifyTaskApproved,
  notifyTaskReturned,
  notifyTaskBlocked
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

// Endpoint para probar notificaciones de cambio de estado
app.post('/api/telegram/test-status', async (req, res) => {
  const { notificationType, taskId, subtaskId, approvedBy, reason } = req.body;
  
  try {
    let success = false;
    
    switch (notificationType) {
      case 'completed':
        success = await notifyTaskCompleted(taskId, subtaskId);
        break;
      case 'approved':
        success = await notifyTaskApproved(taskId, subtaskId, approvedBy);
        break;
      case 'returned':
        success = await notifyTaskReturned(taskId, subtaskId, approvedBy, reason);
        break;
      case 'blocked':
        success = await notifyTaskBlocked(taskId, subtaskId, approvedBy, reason);
        break;
      default:
        return res.status(400).json({ success: false, error: 'Tipo de notificación no válido' });
    }
    
    if (success) {
      return res.status(200).json({ success: true, message: 'Notificación de prueba enviada correctamente' });
    } else {
      return res.status(500).json({ success: false, error: 'No se pudo enviar la notificación' });
    }
  } catch (error) {
    console.error('Error en test-status:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
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