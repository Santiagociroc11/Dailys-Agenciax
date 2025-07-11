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

  const sendStatusNotificationTest = async (notificationType: string) => {
    if (!telegramId) {
        toast.error('Por favor, guarda un ID de chat antes de enviar una prueba.');
        return;
    }
    try {
        const response = await fetch('/api/telegram/test-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                notificationType,
                taskId: 'test-task-id',
                subtaskId: notificationType === 'completed' ? 'test-subtask-id' : undefined,
                approvedBy: 'admin-test-id',
                reason: notificationType === 'returned' ? 'Esta es una razón de prueba para devolver la tarea' : 
                        notificationType === 'blocked' ? 'Esta es una razón de prueba para bloquear la tarea' : undefined
            }),
        });
        const result = await response.json();
        if (result.success) {
            toast.success(`¡Notificación de ${notificationType} enviada!`);
        } else {
            toast.error(`Error al enviar la notificación: ${result.error}`);
        }
    } catch (error) {
        toast.error('Error de red al enviar la notificación de prueba.');
        console.error(error);
    }
  };


  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Configuración de Administrador</h1>
      
      {/* Estado de configuración */}
      {telegramId ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
              <h2 className="text-lg font-semibold text-green-800">
                ✅ Notificaciones Configuradas
              </h2>
            </div>
            <span className="text-sm text-green-600 bg-green-100 px-3 py-1 rounded-full">
              Activo
            </span>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-green-700">
              <strong>ID configurado:</strong> <span className="font-mono bg-green-100 px-2 py-1 rounded">{telegramId}</span>
            </p>
            <p className="text-sm text-green-600">
              Las notificaciones globales del sistema se están enviando correctamente.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <div className="flex items-center mb-2">
            <div className="w-3 h-3 bg-orange-500 rounded-full mr-3"></div>
            <h2 className="text-lg font-semibold text-orange-800">
              ⚠️ Configuración Pendiente
            </h2>
          </div>
          <p className="text-sm text-orange-700">
            No hay notificaciones de Telegram configuradas. Configure un ID para recibir alertas importantes del sistema.
          </p>
        </div>
      )}
      
      {/* Instrucciones paso a paso - Solo si no está configurado */}
      {!telegramId && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-blue-800 mb-4">
          📋 Cómo configurar las notificaciones de Telegram (Paso a paso)
        </h2>
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">1</div>
            <div>
              <p className="font-medium text-gray-800">Abre Telegram en tu teléfono o computadora</p>
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
            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">2</div>
            <div>
              <p className="font-medium text-gray-800">Escribe el comando <span className="font-mono bg-gray-100 px-2 py-1 rounded">/start</span></p>
              <p className="text-sm text-gray-600">El bot te dará tu ID de chat automáticamente</p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">3</div>
            <div>
              <p className="font-medium text-gray-800">Copia el ID y pégalo en el campo de abajo</p>
              <p className="text-sm text-gray-600">Para chat personal: será un número positivo (ej: 123456789)</p>
              <p className="text-sm text-gray-600">Para grupo: será un número negativo (ej: -1001234567890)</p>
            </div>
          </div>
          
          <div className="flex items-start space-x-3">
            <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">4</div>
            <div>
              <p className="font-medium text-gray-800">Haz clic en "Guardar" y luego "Enviar Notificación de Prueba"</p>
              <p className="text-sm text-gray-600">¡Listo! Ya recibirás notificaciones importantes del sistema</p>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Aviso importante para el administrador */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <h3 className="font-medium text-amber-800 mb-2">💡 Información del bot:</h3>
        <p className="text-sm text-amber-700">
          Comparte este enlace con todos los usuarios del sistema: 
          <a href="https://t.me/agenciaxbot" target="_blank" rel="noopener noreferrer" className="font-mono bg-amber-100 px-2 py-1 rounded text-amber-800 hover:underline ml-1">
            https://t.me/agenciaxbot
          </a>
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="telegramId" className="block text-sm font-medium text-gray-700 mb-1">
            {telegramId ? 'Modificar ID del Chat de Telegram' : 'ID del Chat de Telegram para Notificaciones Globales'}
          </label>
          <p className="text-xs text-gray-500 mb-2">
            {telegramId 
              ? 'Puedes cambiar el ID si necesitas usar un chat o canal diferente.'
              : 'Este ID se usará para enviar notificaciones importantes a un grupo o canal de administradores.'
            }
          </p>
          <input
            id="telegramId"
            type="text"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
            placeholder="Ej: -1001234567890 (para grupo) o 123456789 (para chat personal)"
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
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isLoading ? 'Guardando...' : (telegramId ? 'Actualizar Configuración' : 'Guardar Configuración')}
            </button>
            <button 
              onClick={sendTestNotification} 
              disabled={!telegramId || isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {telegramId ? '🧪 Probar Notificación' : 'Enviar Notificación de Prueba'}
            </button>
        </div>
      </div>

      {/* Sección de pruebas de notificaciones de cambio de estado */}
      {telegramId && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            🔔 Pruebas de Notificaciones de Cambio de Estado
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Prueba las notificaciones automáticas que se envían cuando cambian los estados de las tareas:
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={() => sendStatusNotificationTest('completed')}
              disabled={!telegramId || isLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 text-sm"
            >
              🎉 Probar: Tarea Completada
            </button>
            
            <button 
              onClick={() => sendStatusNotificationTest('approved')}
              disabled={!telegramId || isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 text-sm"
            >
              ✅ Probar: Tarea Aprobada
            </button>
            
            <button 
              onClick={() => sendStatusNotificationTest('returned')}
              disabled={!telegramId || isLoading}
              className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 text-sm"
            >
              🔄 Probar: Tarea Devuelta
            </button>
            
            <button 
              onClick={() => sendStatusNotificationTest('blocked')}
              disabled={!telegramId || isLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 text-sm"
            >
              🚫 Probar: Tarea Bloqueada
            </button>
          </div>
          
          <p className="text-xs text-gray-500 mt-4">
            Estas son notificaciones de prueba que usan datos simulados. Las notificaciones reales se envían automáticamente cuando ocurren cambios en las tareas.
          </p>
        </div>
      )}
    </div>
  );
};

export default Settings; 