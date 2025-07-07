import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const UserSettings = () => {
  const [telegramId, setTelegramId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const fetchUserTelegramId = async () => {
      if (!user) return;
      setIsLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('telegram_chat_id')
        .eq('id', user.id)
        .single();

      if (data) {
        setTelegramId(data.telegram_chat_id || '');
      }
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user Telegram ID:', error);
        toast.error('Error al cargar tu ID de Telegram.');
      }
      setIsLoading(false);
    };

    fetchUserTelegramId();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setIsLoading(true);
    const { error } = await supabase
      .from('users')
      .update({ telegram_chat_id: telegramId })
      .eq('id', user.id);

    if (error) {
      toast.error('Error al guardar tu ID de Telegram.');
      console.error('Error saving user Telegram ID:', error);
    } else {
      toast.success('¡ID de Telegram guardado correctamente!');
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
                message: `¡Hola ${user?.name}! Esta es una notificación de prueba desde Dailys. 👋`
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
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Tu Configuración de Notificaciones</h1>
      
      {/* Instrucciones paso a paso */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-green-800 mb-4">
          🔔 Cómo activar tus notificaciones de Telegram (Súper fácil)
        </h2>
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">1</div>
            <div>
              <p className="font-medium text-gray-800">Abre Telegram en tu teléfono</p>
              <p className="text-sm text-gray-600">
                Busca el bot: <span className="font-mono bg-gray-100 px-2 py-1 rounded text-blue-600">@agenciaxbot</span>
                <br />
                <span className="text-xs text-gray-500">O haz clic aquí para abrir directamente: </span>
                <a href="https://t.me/agenciaxbot" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                  https://t.me/agenciaxbot
                </a>
              </p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">2</div>
            <div>
              <p className="font-medium text-gray-800">Escribe <span className="font-mono bg-gray-100 px-2 py-1 rounded">/start</span> y envía el mensaje</p>
              <p className="text-sm text-gray-600">El bot te dirá tu ID de chat (guárdalo, lo necesitarás)</p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">3</div>
            <div>
              <p className="font-medium text-gray-800">Copia el número que te dio el bot</p>
              <p className="text-sm text-gray-600">Se verá algo así: <span className="font-mono bg-gray-100 px-2 py-1 rounded">123456789</span></p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">4</div>
            <div>
              <p className="font-medium text-gray-800">Pega el número en el campo de abajo y haz clic en "Guardar"</p>
              <p className="text-sm text-gray-600">¡Ya está! Ahora recibirás notificaciones de tus tareas 🎉</p>
            </div>
          </div>
        </div>
        
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>💡 Tip:</strong> Usa el botón "Enviar Notificación de Prueba" para verificar que todo funciona correctamente.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="telegramId" className="block text-sm font-medium text-gray-700 mb-1">
            Tu ID de Chat Personal de Telegram
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Usa este campo para recibir notificaciones personales sobre tus tareas y proyectos.
          </p>
          <input
            id="telegramId"
            type="text"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
            placeholder="Ej: 123456789 (copia el número que te dio el bot)"
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

export default UserSettings; 