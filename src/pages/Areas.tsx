import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logAudit } from '../lib/audit';
import { getCostByArea } from '../lib/metrics';
import { Plus, Edit, Trash2, X, Users, DollarSign } from 'lucide-react';
import { Area, AreaWithUsers } from '../types/Area';

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date();
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

export default function Areas() {
  const { isAdmin, user: currentUser } = useAuth();
  const [areas, setAreas] = useState<AreaWithUsers[]>([]);
  const [costByArea, setCostByArea] = useState<Record<string, { cost: number; currency: string; hours: number }>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [currentArea, setCurrentArea] = useState<Area>({ id: '', name: '', description: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [showAssignUsersModal, setShowAssignUsersModal] = useState(false);
  const [selectedAreaForUsers, setSelectedAreaForUsers] = useState<Area | null>(null);

  useEffect(() => {
    fetchAreas();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (areas.length > 0) fetchAreaCosts();
  }, [areas.length]);

  async function fetchAreaCosts() {
    try {
      const { start, end } = getMonthRange();
      const costs = await getCostByArea(start, end);
      const map: Record<string, { cost: number; currency: string; hours: number }> = {};
      costs.forEach((c) => {
        map[c.area_id] = { cost: c.total_cost, currency: c.currency, hours: c.total_hours };
      });
      setCostByArea(map);
    } catch (err) {
      console.error('Error fetching area costs:', err);
    }
  }

  async function fetchAreas() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('areas')
        .select('*')
        .order('name');

      if (error) throw error;

      // Fetch users for each area
      const areasWithUsers = await Promise.all((data || []).map(async (area) => {
        const { data: usersData, error: usersError } = await supabase
          .rpc('get_users_by_area', { area_uuid: area.id });

        if (usersError) throw usersError;

        return {
          ...area,
          users: usersData || []
        };
      }));

      setAreas(areasWithUsers);
    } catch (error) {
      console.error('Error fetching areas:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsers() {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email');

      if (error) throw error;

      setAllUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }

  async function handleCreateArea(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      if (modalMode === 'create') {
        const { data, error } = await supabase
          .from('areas')
          .insert([
            {
              name: currentArea.name,
              description: currentArea.description || null
            }
          ])
          .select()
          .single();

        if (error) throw error;
        if (currentUser?.id && data) {
          const area = data as { id?: string; name?: string };
          await logAudit({
            user_id: currentUser.id,
            entity_type: 'area',
            entity_id: area.id || '',
            action: 'create',
            summary: `Área creada: ${area.name || currentArea.name}`,
          });
        }
        setSuccess('Área creada exitosamente');
      } else {
        const { error } = await supabase
          .from('areas')
          .update({
            name: currentArea.name,
            description: currentArea.description || null
          })
          .eq('id', currentArea.id);

        if (error) throw error;
        if (currentUser?.id) {
          await logAudit({
            user_id: currentUser.id,
            entity_type: 'area',
            entity_id: currentArea.id,
            action: 'update',
            summary: `Área actualizada: ${currentArea.name}`,
          });
        }
        setSuccess('Área actualizada exitosamente');
      }

      setTimeout(() => {
        setShowModal(false);
        setCurrentArea({ id: '', name: '', description: '' });
        setSuccess('');
        fetchAreas();
      }, 1500);
    } catch (error: any) {
      console.error('Error saving area:', error);
      setError(error.message || 'Ha ocurrido un error al guardar el área');
    }
  }

  async function handleDeleteArea(areaId: string) {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta área? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('areas')
        .delete()
        .eq('id', areaId);

      if (error) throw error;
      const areaName = areas.find(a => a.id === areaId)?.name;
      if (currentUser?.id) {
        await logAudit({
          user_id: currentUser.id,
          entity_type: 'area',
          entity_id: areaId,
          action: 'delete',
          summary: `Área eliminada: ${areaName || areaId}`,
        });
      }
      setAreas(areas.filter(area => area.id !== areaId));
    } catch (error) {
      console.error('Error deleting area:', error);
      alert('Error al eliminar el área');
    } finally {
      setLoading(false);
    }
  }

  function openEditModal(area: Area) {
    setCurrentArea(area);
    setModalMode('edit');
    setShowModal(true);
  }

  async function openAssignUsersModal(area: Area) {
    setSelectedAreaForUsers(area);
    
    // Get current assigned users
    try {
      const { data, error } = await supabase
        .rpc('get_users_by_area', { area_uuid: area.id });

      if (error) throw error;

      setSelectedUsers(data ? data.map((user: any) => user.user_id) : []);
      setShowAssignUsersModal(true);
    } catch (error) {
      console.error('Error fetching area users:', error);
    }
  }

  async function handleAssignUsers(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAreaForUsers) return;

    try {
      setLoading(true);
      
      // First, remove all existing assignments
      const { error: deleteError } = await supabase
        .from('area_user_assignments')
        .delete()
        .eq('area_id', selectedAreaForUsers.id);

      if (deleteError) throw deleteError;

      // Then, add new assignments
      if (selectedUsers.length > 0) {
        const assignments = selectedUsers.map(userId => ({
          user_id: userId,
          area_id: selectedAreaForUsers.id
        }));

        const { error: insertError } = await supabase
          .from('area_user_assignments')
          .insert(assignments);

        if (insertError) throw insertError;
      }

      setSuccess('Usuarios asignados correctamente');
      setTimeout(() => {
        setShowAssignUsersModal(false);
        setSelectedAreaForUsers(null);
        setSelectedUsers([]);
        setSuccess('');
        fetchAreas();
      }, 1500);
    } catch (error) {
      console.error('Error assigning users:', error);
      setError('Error al asignar usuarios');
    } finally {
      setLoading(false);
    }
  }

  function toggleUserSelection(userId: string) {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter(id => id !== userId));
    } else {
      setSelectedUsers([...selectedUsers, userId]);
    }
  }

  if (loading && areas.length === 0) {
    return (
      <div className="p-6 animate-pulse">
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="h-8 bg-gray-200 rounded w-32 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-56" />
          </div>
          <div className="h-10 bg-gray-200 rounded w-28" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 space-y-4">
              <div className="h-6 bg-gray-200 rounded w-3/4" />
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="flex gap-2">
                <div className="h-8 bg-gray-200 rounded w-20" />
                <div className="h-8 bg-gray-200 rounded w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalByCurrency = Object.values(costByArea).reduce(
    (acc, c) => {
      acc[c.currency] = (acc[c.currency] || 0) + c.cost;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Áreas de Trabajo</h1>
          <p className="text-gray-600">Administra las áreas de trabajo y sus miembros</p>
        </div>
        <button
          onClick={() => {
            setCurrentArea({ id: '', name: '', description: '' });
            setModalMode('create');
            setShowModal(true);
          }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nueva Área
        </button>
      </div>

      {Object.keys(totalByCurrency).length > 0 && (
        <div className="mb-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200 flex items-center gap-3">
          <DollarSign className="w-8 h-8 text-indigo-600" />
          <div>
            <p className="text-sm font-medium text-indigo-700">Coste total por áreas (este mes)</p>
            <p className="text-2xl font-bold text-indigo-900">
              {Object.entries(totalByCurrency).map(([cur, tot], i) => (
                <span key={cur}>
                  {i > 0 && ' · '}
                  {tot.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {cur}
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      {areas.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-500">No hay áreas de trabajo definidas. Crea una nueva área para comenzar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {areas.map((area) => (
            <div key={area.id} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-5 border-b">
                <div className="flex justify-between items-start">
                  <h2 className="text-xl font-semibold text-gray-800">{area.name}</h2>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => openEditModal(area)}
                      className="text-gray-500 hover:text-indigo-600"
                      title="Editar área"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteArea(area.id)}
                      className="text-gray-500 hover:text-red-600"
                      title="Eliminar área"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                {area.description && (
                  <p className="mt-2 text-gray-600">{area.description}</p>
                )}
              </div>
              <div className="p-5">
                {costByArea[area.id] && costByArea[area.id].cost > 0 && (
                  <div className="mb-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                    <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
                      <DollarSign className="w-4 h-4" />
                      Coste este mes: {costByArea[area.id].cost.toLocaleString('es-CO', { maximumFractionDigits: 0 })} {costByArea[area.id].currency}
                    </div>
                    <p className="text-xs text-indigo-600 mt-0.5">
                      {costByArea[area.id].hours.toFixed(1)}h trabajadas
                    </p>
                  </div>
                )}
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium text-gray-700">Miembros ({area.users.length})</h3>
                  <button
                    onClick={() => openAssignUsersModal(area)}
                    className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center"
                  >
                    <Users className="w-4 h-4 mr-1" />
                    Gestionar
                  </button>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {area.users.length === 0 ? (
                    <p className="text-gray-500 text-sm">No hay miembros asignados a esta área</p>
                  ) : (
                    area.users.map(user => (
                      <div key={user.user_id} className="flex items-center p-2 bg-gray-50 rounded">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center mr-3">
                          <span className="text-indigo-600 font-medium">{user.user_name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="overflow-hidden">
                          <p className="font-medium text-gray-800 truncate">{user.user_name}</p>
                          <p className="text-xs text-gray-500 truncate">{user.user_email}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for creating/editing areas */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">
                {modalMode === 'create' ? 'Crear Nueva Área' : 'Editar Área'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleCreateArea} className="p-6">
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded">
                  {success}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del Área
                  </label>
                  <input
                    type="text"
                    value={currentArea.name}
                    onChange={(e) => setCurrentArea({ ...currentArea, name: e.target.value })}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción (Opcional)
                  </label>
                  <textarea
                    value={currentArea.description || ''}
                    onChange={(e) => setCurrentArea({ ...currentArea, description: e.target.value })}
                    className="w-full p-2 border rounded-md h-24"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                >
                  {modalMode === 'create' ? 'Crear Área' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for assigning users to an area */}
      {showAssignUsersModal && selectedAreaForUsers && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">
                Asignar Usuarios - {selectedAreaForUsers.name}
              </h2>
              <button
                onClick={() => setShowAssignUsersModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleAssignUsers} className="p-6">
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              {success && (
                <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded">
                  {success}
                </div>
              )}
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  Selecciona los usuarios que deseas asignar a esta área:
                </p>
                <div className="max-h-60 overflow-y-auto border rounded-md divide-y">
                  {allUsers.map(user => (
                    <div
                      key={user.id}
                      className={`flex items-center p-3 cursor-pointer hover:bg-gray-50 ${
                        selectedUsers.includes(user.id) ? 'bg-indigo-50' : ''
                      }`}
                      onClick={() => toggleUserSelection(user.id)}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center mr-3 ${
                        selectedUsers.includes(user.id)
                          ? 'bg-indigo-600 border-indigo-600'
                          : 'border-gray-300'
                      }`}>
                        {selectedUsers.includes(user.id) && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">{user.name}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAssignUsersModal(false)}
                  className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  disabled={loading}
                >
                  {loading ? 'Guardando...' : 'Guardar Asignaciones'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
} 