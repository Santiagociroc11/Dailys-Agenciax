import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { 
    Settings, 
    Send, 
    User, 
    MessageSquare, 
    CheckCircle, 
    AlertCircle, 
    Info,
    Bot,
    Copy,
    ExternalLink,
    Bell,
    Shield,
    Smartphone
} from 'lucide-react';

const UserSettings = () => {
    const { user } = useAuth();
    const [chatId, setChatId] = useState('');
    const [loading, setLoading] = useState(false);
    const [testLoading, setTestLoading] = useState(false);
    const [isConfigured, setIsConfigured] = useState(false);

    useEffect(() => {
        const fetchUserChatId = async () => {
            if (user) {
                const { data, error } = await supabase
                    .from('users')
                    .select('telegram_chat_id')
                    .eq('id', user.id)
                    .single();

                if (data && data.telegram_chat_id) {
                    setChatId(data.telegram_chat_id);
                    setIsConfigured(true);
                }
            }
        };

        fetchUserChatId();
    }, [user]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if(user) {
            const { error } = await supabase
                .from('users')
                .update({ telegram_chat_id: chatId })
                .eq('id', user.id);

            if (error) {
                toast.error('Error al guardar la configuración');
                console.error(error);
            } else {
                toast.success('Configuración guardada correctamente');
                setIsConfigured(true);
            }
        }
        setLoading(false);
    };

    const handleTestNotification = async () => {
        if (!chatId) {
            toast.error('Primero debes configurar tu Chat ID');
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
                    chatId: chatId,
                    userId: user?.id
                })
            });

            const result = await response.json();

            if (result.success) {
                toast.success('Notificación de prueba enviada a tu Telegram');
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
                        <div className="p-2 bg-green-100 rounded-lg">
                            <Settings className="w-6 h-6 text-green-600" />
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900">Mi Configuración</h1>
                    </div>
                    <p className="text-gray-600">
                        Configura tus notificaciones personales de Telegram
                    </p>
                </div>

                {/* User Info Card */}
                <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-100 rounded-full">
                            <User className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">{user?.name}</h2>
                            <p className="text-gray-500">{user?.email}</p>
                        </div>
                    </div>
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
                                    ? 'Notificaciones configuradas' 
                                    : 'Notificaciones no configuradas'
                                }
                            </p>
                            <p className={`text-sm ${
                                isConfigured ? 'text-green-600' : 'text-yellow-600'
                            }`}>
                                {isConfigured 
                                    ? 'Recibirás notificaciones en tu Telegram personal' 
                                    : 'Configura tu Chat ID para recibir notificaciones'
                                }
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Configuration Form */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <Bell className="w-5 h-5 text-green-600" />
                            </div>
                            <h2 className="text-xl font-semibold text-gray-900">
                                Configuración Personal
                            </h2>
                        </div>

                        <form onSubmit={handleSave} className="space-y-6">
                            <div>
                                <label htmlFor="userChatId" className="block text-sm font-medium text-gray-700 mb-2">
                                    Mi Chat ID de Telegram
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        id="userChatId"
                                        value={chatId}
                                        onChange={(e) => setChatId(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                                        placeholder="1234567890"
                                    />
                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                                        <Smartphone className="w-5 h-5 text-gray-400" />
                                    </div>
                                </div>
                                <p className="text-sm text-gray-500 mt-2">
                                    Tu ID personal de Telegram donde recibirás las notificaciones
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    disabled={loading || !chatId}
                                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
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
                                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
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
                                ¿Cómo obtener mi Chat ID?
                            </h2>
                        </div>

                        <div className="space-y-4">
                            <div className="p-4 bg-blue-50 rounded-lg">
                                <h3 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                                    <Bot className="w-4 h-4" />
                                    Método Principal: Habla con el Bot
                                </h3>
                                <p className="text-sm text-blue-800 mb-3">
                                    La forma más fácil de obtener tu Chat ID
                                </p>
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => window.open('https://t.me/YOUR_BOT_USERNAME', '_blank')}
                                            className="text-xs bg-blue-200 hover:bg-blue-300 text-blue-800 px-3 py-1 rounded-full flex items-center gap-1 transition-colors"
                                        >
                                            <ExternalLink className="w-3 h-3" />
                                            Abrir Bot
                                        </button>
                                    </div>
                                    <div className="text-xs text-blue-700 space-y-1">
                                        <p>1. Haz clic en "Abrir Bot" arriba</p>
                                        <p>2. Envía el comando /start</p>
                                        <p>3. El bot te responderá con tu Chat ID</p>
                                        <p>4. Copia el ID y pégalo en el formulario</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-green-50 rounded-lg">
                                <h3 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4" />
                                    Comandos Útiles del Bot
                                </h3>
                                <p className="text-sm text-green-800 mb-3">
                                    Comandos que puedes usar con el bot
                                </p>
                                <div className="text-xs text-green-700 space-y-1">
                                    <p><code>/start</code> - Obtener tu Chat ID</p>
                                    <p><code>/info</code> - Información detallada</p>
                                    <p><code>/help</code> - Ver ayuda completa</p>
                                    <p><code>/status</code> - Verificar que funciona</p>
                                </div>
                            </div>

                            <div className="p-4 bg-purple-50 rounded-lg">
                                <h3 className="font-medium text-purple-900 mb-2 flex items-center gap-2">
                                    <Copy className="w-4 h-4" />
                                    Método Alternativo: @userinfobot
                                </h3>
                                <p className="text-sm text-purple-800 mb-3">
                                    Si prefieres usar otro bot
                                </p>
                                <div className="space-y-2">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => window.open('https://t.me/userinfobot', '_blank')}
                                            className="text-xs bg-purple-200 hover:bg-purple-300 text-purple-800 px-3 py-1 rounded-full flex items-center gap-1 transition-colors"
                                        >
                                            <ExternalLink className="w-3 h-3" />
                                            Abrir @userinfobot
                                        </button>
                                    </div>
                                    <div className="text-xs text-purple-700 space-y-1">
                                        <p>1. Haz clic en el enlace de arriba</p>
                                        <p>2. Envía cualquier mensaje al bot</p>
                                        <p>3. El bot te responderá con tu Chat ID</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-amber-50 rounded-lg">
                                <h3 className="font-medium text-amber-900 mb-2">
                                    💡 Nota Importante
                                </h3>
                                <p className="text-sm text-amber-800">
                                    Tu Chat ID personal es solo números (ejemplo: 1234567890). No incluye guiones como los grupos.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Privacy & Security */}
                <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-gray-100 rounded-lg">
                            <Shield className="w-5 h-5 text-gray-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900">
                            Privacidad y Seguridad
                        </h2>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="space-y-3">
                            <div className="flex items-start gap-3">
                                <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-gray-900">Información segura</p>
                                    <p className="text-xs text-gray-600">Tu Chat ID se almacena de forma segura y encriptada</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-gray-900">Solo notificaciones del sistema</p>
                                    <p className="text-xs text-gray-600">Recibirás únicamente notificaciones relacionadas con tus tareas</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-medium text-gray-900">Control total</p>
                                    <p className="text-xs text-gray-600">Puedes cambiar o eliminar tu configuración en cualquier momento</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserSettings; 