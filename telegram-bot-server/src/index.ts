import express from 'express';
import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import path from 'path';
import { sendTelegramMessage, sendTestNotification, notifyTaskAssignment, notifyTaskStatusChange, notifyTaskAvailable, notifyTaskReturned, notifyTaskApproved, notifyAdminTaskSubmitted, notifyAdminTaskApproved, notifyAdminTaskBlocked } from './telegram-api.js';

// Load environment variables
dotenv.config();

const app = express();
app.use(bodyParser.json());

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.ADMIN_GROUP_CHAT_ID;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN not found in environment variables');
  process.exit(1);
}

// Create data directory for storing users
const DATA_DIR = path.join(__dirname, '../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LOCK_FILE = path.join(DATA_DIR, 'bot.lock');

// Ensure data directory exists
async function ensureDataDirectory() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Check if another instance is running
async function checkLock() {
  try {
    await fs.access(LOCK_FILE);
    const stats = await fs.stat(LOCK_FILE);
    const now = new Date();
    const lockAge = (now.getTime() - stats.mtime.getTime()) / 1000;
    
    if (lockAge < 60) {
      console.error('Another bot instance is already running');
      process.exit(1);
    }
    
    await fs.unlink(LOCK_FILE);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.error('Error checking lock file:', err);
      process.exit(1);
    }
  }
}

// Create lock file
async function createLock() {
  try {
    await fs.writeFile(LOCK_FILE, process.pid.toString());
  } catch (err) {
    console.error('Error creating lock file:', err);
    process.exit(1);
  }
}

// Remove lock file on exit
async function cleanup() {
  try {
    await fs.unlink(LOCK_FILE);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.error('Error removing lock file:', err);
    }
  }
}

// Store user chat IDs
async function saveUser(chatId: number, username?: string) {
  try {
    let users: any = {};
    try {
      const data = await fs.readFile(USERS_FILE, 'utf8');
      users = JSON.parse(data);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    users[chatId] = {
      username,
      registeredAt: new Date().toISOString()
    };

    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (err) {
    console.error('Error saving user:', err);
  }
}

// Initialize bot
let bot: TelegramBot;

async function initializeBot() {
  await ensureDataDirectory();
  await checkLock();
  await createLock();

  bot = new TelegramBot(token, { 
    polling: true,
    filepath: false
  });

  // Error handling
  bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
    if (error.message.includes('terminated by other getUpdates')) {
      console.log('Detected conflict with another instance, shutting down...');
      cleanup().then(() => process.exit(1));
    }
  });

  bot.on('error', (error) => {
    console.error('Bot error:', error);
  });

  // Helper function to get chat information
  function getChatInfo(msg: any) {
    const chatId = msg.chat.id;
    const messageThreadId = msg.message_thread_id;
    const chatType = msg.chat.type;
    const isTopicMessage = messageThreadId !== undefined;
    
    return {
      chatId,
      chatType,
      isPrivate: chatType === 'private',
      isGroup: chatType === 'group' || chatType === 'supergroup',
      isChannel: chatType === 'channel',
      messageThreadId,
      isTopicMessage,
      chatTitle: msg.chat.title,
      username: msg.from?.username
    };
  }

  // Handle /start command
  bot.onText(/\/start/, async (msg) => {
    const info = getChatInfo(msg);
    
    await saveUser(info.chatId, info.username);

    let message = `¡Hola! 👋\n\n`;
    
    if (info.isPrivate) {
      message += `📱 <b>Chat Privado Detectado</b>\n\n` +
        `Tu Chat ID es: <code>${info.chatId}</code>\n\n` +
        `🔧 <b>¿Cómo usar este ID?</b>\n` +
        `1. Copia este ID (toca para seleccionar)\n` +
        `2. Ve a la configuración de tu cuenta en la aplicación\n` +
        `3. Pega el ID en el campo "Mi Chat ID de Telegram"\n` +
        `4. ¡Listo! Recibirás notificaciones aquí\n\n` +
        `💡 <i>Usa /info para más detalles</i>`;
    } else if (info.isGroup) {
      message += `👥 <b>Grupo Detectado</b>\n` +
        `Nombre: ${info.chatTitle}\n\n` +
        `Chat ID del Grupo: <code>${info.chatId}</code>\n\n` +
        `🔧 <b>Para administradores:</b>\n` +
        `Este ID se usa para configurar notificaciones del grupo de administradores.\n`;
      
      if (info.isTopicMessage) {
        message += `📋 <b>Tema Detectado</b>\n` +
          `Thread ID: <code>${info.messageThreadId}</code>\n\n` +
          `Para notificaciones en este tema específico:\n` +
          `• Chat ID: <code>${info.chatId}</code>\n` +
          `• Thread ID: <code>${info.messageThreadId}</code>`;
      } else {
        message += `\n💡 <i>Para notificaciones en un tema específico, usa /start dentro del tema.</i>`;
      }
    }

    bot.sendMessage(info.chatId, message, { 
      parse_mode: 'HTML',
      message_thread_id: info.messageThreadId
    });
  });

  // Handle /info command
  bot.onText(/\/info/, async (msg) => {
    const info = getChatInfo(msg);
    
    let message = `ℹ️ <b>Información del Chat</b>\n\n`;
    
    if (info.isPrivate) {
      message += `📱 <b>Tipo:</b> Chat Privado\n` +
        `👤 <b>Usuario:</b> @${info.username || 'Sin username'}\n` +
        `🆔 <b>Chat ID:</b> <code>${info.chatId}</code>\n\n` +
        `✅ <b>Para configurar notificaciones personales:</b>\n` +
        `1. Copia tu Chat ID: <code>${info.chatId}</code>\n` +
        `2. Ve a "Mi Configuración" en la aplicación\n` +
        `3. Pega el ID en "Mi Chat ID de Telegram"\n` +
        `4. Guarda la configuración\n\n` +
        `🔔 <b>¿Qué notificaciones recibirás?</b>\n` +
        `• Tareas asignadas\n` +
        `• Recordatorios de fechas límite\n` +
        `• Cambios de estado en tus tareas\n` +
        `• Aprobaciones y comentarios`;
    } else if (info.isGroup) {
      message += `👥 <b>Tipo:</b> ${info.chatType === 'supergroup' ? 'Supergrupo' : 'Grupo'}\n` +
        `📝 <b>Nombre:</b> ${info.chatTitle}\n` +
        `🆔 <b>Chat ID:</b> <code>${info.chatId}</code>\n`;
      
      if (info.isTopicMessage) {
        message += `📋 <b>Tema:</b> Sí\n` +
          `🧵 <b>Thread ID:</b> <code>${info.messageThreadId}</code>\n\n` +
          `✅ <b>Para notificaciones en este tema:</b>\n` +
          `• Chat ID: <code>${info.chatId}</code>\n` +
          `• Thread ID: <code>${info.messageThreadId}</code>\n\n` +
          `💡 <i>Necesitarás ambos IDs para configurar notificaciones específicas del tema.</i>`;
      } else {
        message += `📋 <b>Tema:</b> No (mensaje general del grupo)\n\n` +
          `✅ <b>Para notificaciones generales del grupo:</b>\n` +
          `Usa solo el Chat ID: <code>${info.chatId}</code>\n\n` +
          `🔧 <b>Para administradores:</b>\n` +
          `Este ID se configura en "Configuración de Administrador" para recibir notificaciones del sistema.\n\n` +
          `💡 <i>Para tema específico, envía /info desde dentro del tema.</i>`;
      }
    } else if (info.isChannel) {
      message += `📢 <b>Tipo:</b> Canal\n` +
        `📝 <b>Nombre:</b> ${info.chatTitle}\n` +
        `🆔 <b>Chat ID:</b> <code>${info.chatId}</code>`;
    }
    
    message += `\n\n🔧 <b>Uso:</b> Copia los IDs mostrados arriba para configurar las notificaciones en tu cuenta.`;

    bot.sendMessage(info.chatId, message, { 
      parse_mode: 'HTML',
      message_thread_id: info.messageThreadId
    });
  });

  // Handle /help command
  bot.onText(/\/help/, (msg) => {
    const info = getChatInfo(msg);
    const message = `🤖 <b>Comandos disponibles:</b>\n\n` +
      `• /start - Información básica y Chat ID\n` +
      `• /info - Información detallada del chat actual\n` +
      `• /help - Ver esta ayuda\n` +
      `• /status - Verificar si el bot está activo\n\n` +
      `🔧 <b>¿Cómo configurar notificaciones?</b>\n\n` +
      `<b>Para usuarios:</b>\n` +
      `1. Habla conmigo en privado\n` +
      `2. Usa /start para obtener tu Chat ID\n` +
      `3. Configúralo en "Mi Configuración"\n\n` +
      `<b>Para administradores:</b>\n` +
      `1. Añádeme a tu grupo de administradores\n` +
      `2. Usa /start en el grupo\n` +
      `3. Configura el Chat ID en "Configuración de Administrador"\n\n` +
      `💡 <b>Tip:</b> Usa /info para obtener información completa sobre grupos y temas.`;

    bot.sendMessage(info.chatId, message, { 
      parse_mode: 'HTML',
      message_thread_id: info.messageThreadId
    });
  });

  // Handle /status command
  bot.onText(/\/status/, (msg) => {
    const info = getChatInfo(msg);
    bot.sendMessage(info.chatId, '✅ ¡El bot está activo y funcionando correctamente!\n\n🔔 Sistema de notificaciones operativo.', {
      message_thread_id: info.messageThreadId
    });
  });

  console.log('🤖 Bot started successfully!');
  console.log('📱 Users can now chat with the bot to get their Chat IDs');
}

// Express routes
app.get('/', (req, res) => {
  res.send('🤖 Telegram Bot Server is running!\n\n📱 Chat with the bot to get your Chat ID');
});

// Legacy endpoint for basic notifications (backwards compatibility)
interface NotificationPayload {
    message: string;
    userId: string;
}

app.post('/notify', async (req, res) => {
    const { message, userId } = req.body as NotificationPayload;

    if (!message || !userId) {
        return res.status(400).send('Missing message or userId in request body');
    }

    try {
        const success = await sendTelegramMessage(userId, message);
        
        if (success) {
            console.log(`✅ Basic notification sent to user ${userId}`);
            res.status(200).send('Notification sent successfully');
        } else {
            res.status(500).send('Failed to send notification');
        }
    } catch (error) {
        console.error('❌ Error sending basic notification:', error);
        res.status(500).send('Error sending notification');
    }
});

// Test notification endpoint
interface TestNotificationPayload {
    chatId: string;
    userId?: string;
    threadId?: string;
}

app.post('/test-notification', async (req, res) => {
    const { chatId, userId, threadId } = req.body as TestNotificationPayload;

    if (!chatId) {
        return res.status(400).json({ success: false, error: 'Missing chatId in request body' });
    }

    try {
        const result = await sendTestNotification(chatId, userId, threadId);
        res.status(200).json(result);
    } catch (error) {
        console.error('❌ Error sending test notification:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Task assignment notification endpoint
interface TaskAssignmentPayload {
    userId: string;
    taskData: {
        id: string;
        name: string;
        description?: string;
        priority?: string;
        deadline?: string;
        status?: string;
    };
    requestId?: string;
}

app.post('/notify-task-assignment', async (req, res) => {
    const { userId, taskData, requestId } = req.body as TaskAssignmentPayload;

    if (!userId || !taskData || !taskData.name) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: userId, taskData.name' 
        });
    }

    try {
        await notifyTaskAssignment(userId, taskData, requestId);
        res.status(200).json({ success: true, message: 'Task assignment notification sent' });
    } catch (error) {
        console.error('❌ Error sending task assignment notification:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Task status change notification endpoint
interface TaskStatusChangePayload {
    userId: string;
    taskData: {
        id: string;
        name: string;
        description?: string;
    };
    oldStatus: string;
    newStatus: string;
    requestId?: string;
}

app.post('/notify-task-status-change', async (req, res) => {
    const { userId, taskData, oldStatus, newStatus, requestId } = req.body as TaskStatusChangePayload;

    if (!userId || !taskData || !taskData.name || !oldStatus || !newStatus) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: userId, taskData.name, oldStatus, newStatus' 
        });
    }

    try {
        await notifyTaskStatusChange(userId, taskData, oldStatus, newStatus, requestId);
        res.status(200).json({ success: true, message: 'Task status change notification sent' });
    } catch (error) {
        console.error('❌ Error sending task status change notification:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Task available notification endpoint
interface TaskAvailablePayload {
    userId: string;
    taskData: {
        id: string;
        name: string;
        description?: string;
        priority?: string;
        deadline?: string;
        payment?: string;
    };
    requestId?: string;
}

app.post('/notify-task-available', async (req, res) => {
    const { userId, taskData, requestId } = req.body as TaskAvailablePayload;

    if (!userId || !taskData || !taskData.name) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: userId, taskData.name' 
        });
    }

    try {
        await notifyTaskAvailable(userId, taskData, requestId);
        res.status(200).json({ success: true, message: 'Task available notification sent' });
    } catch (error) {
        console.error('❌ Error sending task available notification:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Task returned notification endpoint
interface TaskReturnedPayload {
    userId: string;
    taskData: {
        id: string;
        name: string;
        description?: string;
    };
    returnReason?: string;
    requestId?: string;
}

app.post('/notify-task-returned', async (req, res) => {
    const { userId, taskData, returnReason, requestId } = req.body as TaskReturnedPayload;

    if (!userId || !taskData || !taskData.name) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: userId, taskData.name' 
        });
    }

    try {
        await notifyTaskReturned(userId, taskData, returnReason, requestId);
        res.status(200).json({ success: true, message: 'Task returned notification sent' });
    } catch (error) {
        console.error('❌ Error sending task returned notification:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Task approved notification endpoint
interface TaskApprovedPayload {
    userId: string;
    taskData: {
        id: string;
        name: string;
        description?: string;
        payment?: string;
    };
    approvalComment?: string;
    requestId?: string;
}

app.post('/notify-task-approved', async (req, res) => {
    const { userId, taskData, approvalComment, requestId } = req.body as TaskApprovedPayload;

    if (!userId || !taskData || !taskData.name) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: userId, taskData.name' 
        });
    }

    try {
        await notifyTaskApproved(userId, taskData, approvalComment, requestId);
        res.status(200).json({ success: true, message: 'Task approved notification sent' });
    } catch (error) {
        console.error('❌ Error sending task approved notification:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Admin task submitted notification endpoint
interface AdminTaskSubmittedPayload {
    userId: string;
    taskData: {
        id: string;
        name: string;
        description?: string;
        priority?: string;
    };
    submissionNotes?: string;
    requestId?: string;
}

app.post('/notify-admin-task-submitted', async (req, res) => {
    const { userId, taskData, submissionNotes, requestId } = req.body as AdminTaskSubmittedPayload;

    if (!userId || !taskData || !taskData.name) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: userId, taskData.name' 
        });
    }

    try {
        await notifyAdminTaskSubmitted(userId, taskData, submissionNotes, requestId);
        res.status(200).json({ success: true, message: 'Admin task submitted notification sent' });
    } catch (error) {
        console.error('❌ Error sending admin task submitted notification:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Admin task approved notification endpoint
interface AdminTaskApprovedPayload {
    userId: string;
    taskData: {
        id: string;
        name: string;
        description?: string;
        payment?: string;
    };
    approvedBy: string;
    requestId?: string;
}

app.post('/notify-admin-task-approved', async (req, res) => {
    const { userId, taskData, approvedBy, requestId } = req.body as AdminTaskApprovedPayload;

    if (!userId || !taskData || !taskData.name || !approvedBy) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: userId, taskData.name, approvedBy' 
        });
    }

    try {
        await notifyAdminTaskApproved(userId, taskData, approvedBy, requestId);
        res.status(200).json({ success: true, message: 'Admin task approved notification sent' });
    } catch (error) {
        console.error('❌ Error sending admin task approved notification:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Admin task blocked notification endpoint
interface AdminTaskBlockedPayload {
    userId: string;
    taskData: {
        id: string;
        name: string;
        description?: string;
        priority?: string;
    };
    blockReason?: string;
    requestId?: string;
}

app.post('/notify-admin-task-blocked', async (req, res) => {
    const { userId, taskData, blockReason, requestId } = req.body as AdminTaskBlockedPayload;

    if (!userId || !taskData || !taskData.name) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: userId, taskData.name' 
        });
    }

    try {
        await notifyAdminTaskBlocked(userId, taskData, blockReason, requestId);
        res.status(200).json({ success: true, message: 'Admin task blocked notification sent' });
    } catch (error) {
        console.error('❌ Error sending admin task blocked notification:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Start the server and bot
const port = process.env.PORT || 3000;

async function startServer() {
    try {
        await initializeBot();
        
        app.listen(port, () => {
            console.log(`🚀 Server is running on port ${port}`);
            console.log(`📡 Bot is polling for messages`);
            console.log(`🔗 API endpoints:`);
            console.log(`   • POST /notify - Basic notifications`);
            console.log(`   • POST /test-notification - Test notifications`);
            console.log(`   • POST /notify-task-assignment - Task assignment notifications`);
            console.log(`   • POST /notify-task-status-change - Task status change notifications`);
            console.log(`   • POST /notify-task-available - Task available notifications`);
            console.log(`   • POST /notify-task-returned - Task returned notifications`);
            console.log(`   • POST /notify-task-approved - Task approved notifications`);
            console.log(`   • POST /notify-admin-task-submitted - Admin task submitted notifications`);
            console.log(`   • POST /notify-admin-task-approved - Admin task approved notifications`);
            console.log(`   • POST /notify-admin-task-blocked - Admin task blocked notifications`);
        });

        // Handle cleanup on exit
        process.on('SIGINT', () => {
            console.log('🛑 Shutting down bot and server...');
            cleanup().then(() => process.exit(0));
        });

        process.on('SIGTERM', () => {
            console.log('🛑 Shutting down bot and server...');
            cleanup().then(() => process.exit(0));
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer(); 