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