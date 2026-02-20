import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit, Trash2, X, Building2, Mail, User, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

interface Client {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  hourly_rate: number | null;
}

export default function Clients() {
  const { isAdmin } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentClient, setCurrentClient] = useState<Client>({
    id: '',
    name: '',
    contact: null,
    email: null,
    hourly_rate: null,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchClients();
  }, []);

  async function fetchClients() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name');

      if (error) throw error;
      setClients(data || []);
    } catch (err) {
      console.error('Error fetching clients:', err);
      toast.error('Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    try {
      if (modalMode === 'create') {
        const { error } = await supabase.from('clients').insert([
          {
            name: currentClient.name,
            contact: currentClient.contact || null,
            email: currentClient.email || null,
            hourly_rate: currentClient.hourly_rate ? Number(currentClient.hourly_rate) : null,
          },
        ]);

        if (error) throw error;
        toast.success('Cliente creado correctamente');
      } else {
        const { error } = await supabase
          .from('clients')
          .update({
            name: currentClient.name,
            contact: currentClient.contact || null,
            email: currentClient.email || null,
            hourly_rate: currentClient.hourly_rate ? Number(currentClient.hourly_rate) : null,
          })
          .eq('id', currentClient.id);

        if (error) throw error;
        toast.success('Cliente actualizado correctamente');
      }

      setShowModal(false);
      setCurrentClient({ id: '', name: '', contact: null, email: null, hourly_rate: null });
      fetchClients();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      setError(msg);
      toast.error(msg);
    }
  }

  async function handleDelete(clientId: string) {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este cliente? Los proyectos vinculados quedarán sin cliente.')) {
      return;
    }

    try {
      const { error } = await supabase.from('clients').delete().eq('id', clientId);

      if (error) throw error;
      toast.success('Cliente eliminado');
      setClients(clients.filter((c) => c.id !== clientId));
    } catch (err) {
      console.error('Error deleting client:', err);
      toast.error('Error al eliminar el cliente');
    }
  }

  function openEditModal(client: Client) {
    setCurrentClient(client);
    setModalMode('edit');
    setShowModal(true);
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h2 className="text-lg font-medium text-yellow-800">Acceso Restringido</h2>
          <p className="text-yellow-700">Solo los administradores pueden gestionar clientes.</p>
        </div>
      </div>
    );
  }

  if (loading && clients.length === 0) {
    return (
      <div className="p-6 animate-pulse">
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="h-8 bg-gray-200 rounded w-40 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-56" />
          </div>
          <div className="h-10 bg-gray-200 rounded w-28" />
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b flex gap-4">
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="h-4 bg-gray-200 rounded w-32" />
            <div className="h-4 bg-gray-200 rounded w-24" />
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="p-4 border-b flex gap-4">
              <div className="h-4 bg-gray-200 rounded w-8" />
              <div className="h-4 bg-gray-200 rounded w-32" />
              <div className="h-4 bg-gray-200 rounded w-48" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-600">Gestiona los clientes para facturación y reportes</p>
        </div>
        <button
          onClick={() => {
            setCurrentClient({ id: '', name: '', contact: null, email: null, hourly_rate: null });
            setModalMode('create');
            setShowModal(true);
          }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nuevo Cliente
        </button>
      </div>

      {clients.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No hay clientes registrados. Crea uno para comenzar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map((client) => (
            <div key={client.id} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-5 border-b">
                <div className="flex justify-between items-start">
                  <h2 className="text-xl font-semibold text-gray-800">{client.name}</h2>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => openEditModal(client)}
                      className="text-gray-500 hover:text-indigo-600"
                      title="Editar cliente"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(client.id)}
                      className="text-gray-500 hover:text-red-600"
                      title="Eliminar cliente"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-5 space-y-2">
                {client.contact && (
                  <div className="flex items-center text-gray-600">
                    <User className="w-4 h-4 mr-2 text-gray-400" />
                    <span>{client.contact}</span>
                  </div>
                )}
                {client.email && (
                  <div className="flex items-center text-gray-600">
                    <Mail className="w-4 h-4 mr-2 text-gray-400" />
                    <span className="truncate">{client.email}</span>
                  </div>
                )}
                {client.hourly_rate != null && (
                  <div className="flex items-center text-gray-600">
                    <DollarSign className="w-4 h-4 mr-2 text-gray-400" />
                    <span>{client.hourly_rate} €/h</span>
                  </div>
                )}
                {!client.contact && !client.email && client.hourly_rate == null && (
                  <p className="text-gray-400 text-sm">Sin datos adicionales</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold">
                {modalMode === 'create' ? 'Nuevo Cliente' : 'Editar Cliente'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-4 space-y-4">
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={currentClient.name}
                  onChange={(e) => setCurrentClient({ ...currentClient, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contacto</label>
                <input
                  type="text"
                  value={currentClient.contact || ''}
                  onChange={(e) => setCurrentClient({ ...currentClient, contact: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={currentClient.email || ''}
                  onChange={(e) => setCurrentClient({ ...currentClient, email: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tarifa por hora (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={currentClient.hourly_rate ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCurrentClient({ ...currentClient, hourly_rate: v ? parseFloat(v) : null });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  placeholder="Opcional"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  {modalMode === 'create' ? 'Crear' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
