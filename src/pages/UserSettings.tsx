import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { apiUrl } from '../lib/apiBase';

const UserSettings = () => {
  const [telegramId, setTelegramId] = useState('');
  const [paymentAccount, setPaymentAccount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const fetchUserSettings = async () => {
      if (!user) return;
      setIsLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('telegram_chat_id, payment_account')
        .eq('id', user.id)
        .single();

      if (data) {
        setTelegramId(data.telegram_chat_id || '');
        setPaymentAccount(data.payment_account || '');
      }
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user settings:', error);
        toast.error('Error al cargar tu configuración.');
      }
      setIsLoading(false);
    };

    fetchUserSettings();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setIsLoading(true);
    const { error } = await supabase
      .from('users')
      .update({ telegram_chat_id: telegramId, payment_account: paymentAccount.trim() || null })
      .eq('id', user.id);

    if (error) {
      toast.error('Error al guardar la configuración.');
      console.error('Error saving user settings:', error);
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
        const response = await fetch(apiUrl('/api/telegram/test'), {
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
      <h1 className="text-2xl font-bold mb-6">Tu Configuración</h1>
      
      {/* Estado de configuración personal */}
      {telegramId ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
              <h2 className="text-lg font-semibold text-green-800">
                🔔 Notificaciones Activadas
              </h2>
            </div>
            <span className="text-sm text-green-600 bg-green-100 px-3 py-1 rounded-full">
              Configurado
            </span>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-green-700">
              <strong>Tu ID de Telegram:</strong> <span className="font-mono bg-green-100 px-2 py-1 rounded">{telegramId}</span>
            </p>
            <p className="text-sm text-green-600">
              ¡Perfecto! Recibirás notificaciones sobre tus tareas y proyectos directamente en Telegram. 🎉
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <div className="flex items-center mb-2">
            <div className="w-3 h-3 bg-orange-500 rounded-full mr-3"></div>
            <h2 className="text-lg font-semibold text-orange-800">
              📵 Sin Notificaciones
            </h2>
          </div>
          <p className="text-sm text-orange-700">
            No tienes notificaciones de Telegram configuradas. ¡Configúralas ahora para no perderte ninguna actualización importante!
          </p>
        </div>
      )}
      
      {/* Instrucciones paso a paso - Solo si no está configurado */}
      {!telegramId && (
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
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="telegramId" className="block text-sm font-medium text-gray-700 mb-1">
            {telegramId ? 'Cambiar tu ID de Telegram' : 'Tu ID de Chat Personal de Telegram'}
          </label>
          <p className="text-xs text-gray-500 mb-2">
            {telegramId 
              ? 'Si quieres cambiar el chat donde recibes las notificaciones, actualiza tu ID aquí.'
              : 'Usa este campo para recibir notificaciones personales sobre tus tareas y proyectos.'
            }
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
        <div>
          <label htmlFor="paymentAccount" className="block text-sm font-medium text-gray-700 mb-1">
            Cuenta de pago
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Cuenta bancaria donde deseas recibir los pagos de nómina (ej: Banco X - Cuenta ahorros 123456789).
          </p>
          <input
            id="paymentAccount"
            type="text"
            value={paymentAccount}
            onChange={(e) => setPaymentAccount(e.target.value)}
            placeholder="Ej: Banco X - Cuenta ahorros 123456789"
            disabled={isLoading}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
            <button 
              onClick={handleSave} 
              disabled={isLoading}
              className={`px-4 py-2 text-white rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed ${
                telegramId 
                  ? 'bg-orange-600 hover:bg-orange-700' 
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isLoading ? 'Guardando...' : (telegramId ? 'Guardar cambios' : 'Activar Notificaciones')}
            </button>
            <button 
              onClick={sendTestNotification} 
              disabled={!telegramId || isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {telegramId ? '🧪 Probar Notificación' : 'Enviar Notificación de Prueba'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default UserSettings; 