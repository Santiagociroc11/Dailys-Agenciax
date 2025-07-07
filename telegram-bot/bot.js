import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno desde el directorio padre
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("¡Error! El token del bot de Telegram no está configurado en tu archivo .env");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
👋 ¡Hola! Soy el bot auxiliar de Dailys.

Tu ID de chat de Telegram es: \`${chatId}\`

Copia y pega este ID en la configuración de notificaciones de la aplicación Dailys para empezar a recibir alertas.

Si quieres obtener el ID de un **grupo**:
1. Añádeme a tu grupo de Telegram.
2. Escribe \`/id\` en el chat del grupo.
3. Te responderé con el ID del chat del grupo.
  `;
  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
});

bot.onText(/\/id/, (msg) => {
  const chatId = msg.chat.id;
  const groupMessage = `
✅ El ID de este chat de grupo es: \`${chatId}\`

Copia y pega este ID en la configuración de notificaciones de Dailys.
  `;
  bot.sendMessage(chatId, groupMessage, { parse_mode: 'Markdown' });
});

console.log('🤖 Bot de ayuda de Telegram está activo...'); 