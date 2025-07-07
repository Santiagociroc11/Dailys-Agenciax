import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

const ADMIN_TELEGRAM_ID_KEY = 'admin_telegram_chat_id';

const Settings = () => {
  const [telegramId, setTelegramId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchAdminId = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', ADMIN_TELEGRAM_ID_KEY)
        .single();
      
      if (data && data.value) {
        setTelegramId((data.value as any)?.id || '');
      }
      if (error && error.code !== 'PGRST116') { // Ignore 'no rows found'
        console.error('Error fetching admin Telegram ID:', error);
        toast.error('Error al cargar la configuración.');
      }
      setIsLoading(false);
    };

    fetchAdminId();
  }, []);

  const handleSave = async () => {
    setIsLoading(true);
    const { error } = await supabase.from('app_settings').upsert({
      key: ADMIN_TELEGRAM_ID_KEY,
      value: { id: telegramId },
    });

    if (error) {
      toast.error('Error al guardar el ID de Telegram.');
      console.error('Error saving admin Telegram ID:', error);
    } else {
      toast.success('¡Configuración guardada correctamente!');
    }
    setIsLoading(false);
  };
  
  const sendTestNotification = async () => {
    if (!telegramId) {
        toast.error('Por favor, guarda un ID de chat antes de enviar una prueba.');
        return;
    }
    try {
        const response = await fetch('/api/telegram/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId: telegramId,
                message: '¡Esta es una notificación de prueba desde Dailys! 🎉'
            }),
        });
        const result = await response.json();
        if (result.success) {
            toast.success('¡Notificación de prueba enviada!');
        } else {
            toast.error(`Error al enviar la prueba: ${result.error}`);
        }
    } catch (error) {
        toast.error('Error de red al enviar la notificación de prueba.');
        console.error(error);
    }
  };


  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Configuración de Administrador</h1>
      <div className="space-y-4">
        <div>
          <label htmlFor="telegramId" className="block text-sm font-medium text-gray-700 mb-1">
            ID del Chat de Telegram para Notificaciones Globales
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Este ID se usará para enviar notificaciones importantes a un grupo o canal de administradores.
          </p>
          <input
            id="telegramId"
            type="text"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
            placeholder="Ej: -1001234567890"
            disabled={isLoading}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
            <button 
              onClick={handleSave} 
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Guardando...' : 'Guardar'}
            </button>
            <button 
              onClick={sendTestNotification} 
              disabled={!telegramId || isLoading}
              className="px-4 py-2 bg-gray-200 text-gray-800 border border-gray-300 rounded-md hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              Enviar Notificación de Prueba
            </button>
        </div>
      </div>
    </div>
  );
};

export default Settings; 