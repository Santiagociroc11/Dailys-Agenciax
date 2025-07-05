import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { 
    Settings, 
    Send, 
    Users, 
    Shield, 
    MessageSquare, 
    CheckCircle, 
    AlertCircle, 
    Info,
    Bot,
    Copy,
    ExternalLink
} from 'lucide-react';

const AdminSettings = () => {
    const [adminChatId, setAdminChatId] = useState('');
    const [loading, setLoading] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const [isConfigured, setIsConfigured] = useState(false);
    const [showInstructions, setShowInstructions] = useState(false);

    useEffect(() => {
        const fetchAdminChatId = async () => {
            const { data, error } = await supabase
                .from('app_metadata')
                .select('value')
                .eq('key', 'telegram_admin_chat_id')
                .single();

            if (data && data.value) {
                setAdminChatId(data.value);
                setIsConfigured(true);
            }
        };

        fetchAdminChatId();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { error } = await supabase
            .from('app_metadata')
            .upsert({ key: 'telegram_admin_chat_id', value: adminChatId }, { onConflict: 'key' });

        if (error) {
            toast.error('Error al guardar la configuración');
            console.error(error);
        } else {
            toast.success('Configuración guardada correctamente');
            setIsConfigured(true);
        }
        setLoading(false);
    };

    const handleTestNotification = async () => {
        if (!adminChatId) {
            toast.error('Primero debes configurar el Chat ID del grupo');
            return;
        }

        setTestLoading(true);
        try {
            const response = await fetch('http://localhost:3000/test-notification', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chatId: adminChatId
                })
            });

            const result = await response.json();

            if (result.success) {
                toast.success('Notificación de prueba enviada al grupo de administradores');
            } else {
                toast.error(result.error || 'Error al enviar la notificación de prueba');
            }
        } catch (error) {
            toast.error('Error de conexión con el servidor del bot');
        }
        setTestLoading(false);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copiado al portapapeles');
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <Settings className="w-6 h-6 text-blue-600" />
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900">Configuración de Administrador</h1>
                    </div>
                    <p className="text-gray-600">
                        Configura las notificaciones de Telegram para el grupo de administradores
                    </p>
                </div>

                {/* Status Card */}
                <div className={`mb-6 p-4 rounded-lg border-l-4 ${
                    isConfigured 
                        ? 'bg-green-50 border-green-400' 
                        : 'bg-yellow-50 border-yellow-400'
                }`}>
                    <div className="flex items-center">
                        {isConfigured ? (
                            <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                        ) : (
                            <AlertCircle className="w-5 h-5 text-yellow-500 mr-3" />
                        )}
                        <div>
                            <p className={`font-medium ${
                                isConfigured ? 'text-green-800' : 'text-yellow-800'
                            }`}>
                                {isConfigured 
                                    ? 'Configuración completada' 
                                    : 'Configuración pendiente'
                                }
                            </p>
                            <p className={`text-sm ${
                                isConfigured ? 'text-green-600' : 'text-yellow-600'
                            }`}>
                                {isConfigured 
                                    ? 'Las notificaciones están configuradas y listas para usar' 
                                    : 'Completa la configuración para recibir notificaciones'
                                }
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Configuration Form */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-indigo-100 rounded-lg">
                                <MessageSquare className="w-5 h-5 text-indigo-600" />
                            </div>
                            <h2 className="text-xl font-semibold text-gray-900">
                                Configuración del Grupo
                            </h2>
                        </div>

                        <form onSubmit={handleSave} className="space-y-6">
                            <div>
                                <label htmlFor="adminChatId" className="block text-sm font-medium text-gray-700 mb-2">
                                    Chat ID del Grupo de Administradores
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        id="adminChatId"
                                        value={adminChatId}
                                        onChange={(e) => setAdminChatId(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                        placeholder="-1001234567890"
                                    />
                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                                        <Users className="w-5 h-5 text-gray-400" />
                                    </div>
                                </div>
                                <p className="text-sm text-gray-500 mt-2">
                                    El ID del grupo de Telegram donde se enviarán las notificaciones de administración
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    disabled={loading || !adminChatId}
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                            Guardando...
                                        </>
                                    ) : (
                                        <>
                                            <Shield className="w-4 h-4" />
                                            Guardar Configuración
                                        </>
                                    )}
                                </button>
                                
                                {isConfigured && (
                                    <button
                                        type="button"
                                        onClick={handleTestNotification}
                                        disabled={testLoading}
                                        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                                    >
                                        {testLoading ? (
                                            <>
                                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                                Enviando...
                                            </>
                                        ) : (
                                            <>
                                                <Send className="w-4 h-4" />
                                                Probar
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>

                    {/* Instructions */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <Info className="w-5 h-5 text-blue-600" />
                            </div>
                            <h2 className="text-xl font-semibold text-gray-900">
                                Instrucciones
                            </h2>
                        </div>

                        <div className="space-y-4">
                            <div className="p-4 bg-blue-50 rounded-lg">
                                <h3 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                                    <Bot className="w-4 h-4" />
                                    1. Habla con el Bot
                                </h3>
                                <p className="text-sm text-blue-800 mb-3">
                                    Inicia una conversación con el bot para obtener tu Chat ID automáticamente
                                </p>
                                <button
                                    onClick={() => window.open('https://t.me/YOUR_BOT_USERNAME', '_blank')}
                                    className="text-xs bg-blue-200 hover:bg-blue-300 text-blue-800 px-3 py-1 rounded-full flex items-center gap-1 transition-colors"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    Abrir Bot
                                </button>
                            </div>

                            <div className="p-4 bg-green-50 rounded-lg">
                                <h3 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    2. Crear Grupo de Administradores
                                </h3>
                                <p className="text-sm text-green-800 mb-3">
                                    Crea un grupo en Telegram y añade tu bot como administrador
                                </p>
                                <div className="text-xs text-green-700 space-y-1">
                                    <p>• Crea un nuevo grupo en Telegram</p>
                                    <p>• Añade tu bot al grupo</p>
                                    <p>• Hazlo administrador del grupo</p>
                                    <p>• Envía el comando /start en el grupo</p>
                                </div>
                            </div>

                            <div className="p-4 bg-purple-50 rounded-lg">
                                <h3 className="font-medium text-purple-900 mb-2 flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4" />
                                    3. Obtener Chat ID del Grupo
                                </h3>
                                <p className="text-sm text-purple-800 mb-3">
                                    El bot te proporcionará el Chat ID automáticamente
                                </p>
                                <div className="text-xs text-purple-700 space-y-1">
                                    <p>• Envía /start en el grupo</p>
                                    <p>• El bot responderá con el Chat ID del grupo</p>
                                    <p>• Copia el ID y pégalo en el formulario de arriba</p>
                                    <p>• También puedes usar /info para más detalles</p>
                                </div>
                            </div>

                            <div className="p-4 bg-amber-50 rounded-lg">
                                <h3 className="font-medium text-amber-900 mb-2">
                                    💡 Comandos Útiles del Bot
                                </h3>
                                <div className="text-sm text-amber-800 space-y-1">
                                    <p><code>/start</code> - Obtener Chat ID básico</p>
                                    <p><code>/info</code> - Información detallada del chat</p>
                                    <p><code>/help</code> - Ver todos los comandos</p>
                                    <p><code>/status</code> - Verificar que el bot funciona</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Server Status */}
                <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-gray-100 rounded-lg">
                            <Bot className="w-5 h-5 text-gray-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900">
                            Estado del Servidor
                        </h2>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-2">
                            Asegúrate de que el servidor del bot esté ejecutándose:
                        </p>
                        <div className="bg-gray-800 text-green-400 p-3 rounded-md font-mono text-sm">
                            <div>cd telegram-bot-server</div>
                            <div>npm run dev</div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                            El servidor debe estar corriendo en http://localhost:3000
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminSettings; 