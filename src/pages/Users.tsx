import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logAudit } from '../lib/audit';
import { Users as UsersIcon, Plus, X, Trash2, AlertTriangle, LogIn } from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  telegram_chat_id?: string;
  hourly_rate?: number | null;
  monthly_salary?: number | null;
  currency?: string;
  payment_account?: string | null;
}

export default function Users() {
  const { isAdmin, user: currentUser, impersonateUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({ 
    name: '', 
    email: '', 
    password: '', 
    isAdmin: false,
    countryCode: '+57', 
    phone: '' 
  });
  const [error, setError] = useState('');
  const [userPasswords, setUserPasswords] = useState<Record<string, string>>({});
  const [passwordVisibility, setPasswordVisibility] = useState<Record<string, boolean>>({});
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState('');
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editUser, setEditUser] = useState({
    id: '',
    name: '',
    email: '',
    countryCode: '+57',
    phone: '',
    role: 'user',
    telegram_chat_id: '',
    hourly_rate: '' as string | number,
    monthly_salary: '' as string | number,
    currency: 'COP',
    payment_account: '',
  });
  const [editSuccess, setEditSuccess] = useState('');
  const [editError, setEditError] = useState('');
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [reassignUserId, setReassignUserId] = useState<string>('');

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, phone, password, telegram_chat_id, hourly_rate, monthly_salary, currency, payment_account');

      if (error) throw error;

      setUsers(data || []);
      
      const passwords: Record<string, string> = {};
      (data || []).forEach(user => {
        passwords[user.id] = user.password || '';
      });
      
      setUserPasswords(passwords);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    try {
      const fullPhone = newUser.phone ? `${newUser.countryCode}${newUser.phone}` : null;
      
      const { data, error } = await supabase
        .from('users')
        .insert([{
          name: newUser.name,
          email: newUser.email,
          password: newUser.password,
          role: newUser.isAdmin ? 'admin' : 'user',
          phone: fullPhone
        }])
        .select()
        .single();

      if (error) throw error;

      if (currentUser?.id && data) {
        await logAudit({
          user_id: currentUser.id,
          entity_type: 'user',
          entity_id: data.id,
          action: 'create',
          summary: `Usuario creado: ${data.name} (${data.email})`,
        });
      }

      await fetchUsers();
      setShowModal(false);
      setNewUser({ 
        name: '', 
        email: '', 
        password: '', 
        isAdmin: false,
        countryCode: '+57',
        phone: '' 
      });
    } catch (error) {
      console.error('Error al crear usuario:', error);
      setError('Error al crear el usuario. Por favor, inténtalo de nuevo.');
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      if (currentUser?.id) {
        await logAudit({
          user_id: currentUser.id,
          entity_type: 'user',
          entity_id: userId,
          action: 'update',
          field_name: 'role',
          new_value: newRole,
          summary: `Rol cambiado a ${newRole}`,
        });
      }
      await fetchUsers();
    } catch (error) {
      console.error('Error al actualizar rol:', error);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordChangeError('');
    setPasswordChangeSuccess('');
    
    if (!selectedUserId || !newPassword.trim()) {
      setPasswordChangeError('Por favor, ingresa una contraseña válida.');
      return;
    }
    
    try {
      const { error } = await supabase
        .from('users')
        .update({ password: newPassword })
        .eq('id', selectedUserId);
      
      if (error) throw error;
      
      setUserPasswords(prev => ({
        ...prev,
        [selectedUserId]: newPassword
      }));
      
      setPasswordChangeSuccess('Contraseña actualizada con éxito.');
      setTimeout(() => {
        setShowChangePasswordModal(false);
        setNewPassword('');
        setSelectedUserId(null);
        setSelectedUserName('');
        setPasswordChangeSuccess('');
      }, 1500);
    } catch (error) {
      console.error('Error al cambiar la contraseña:', error);
      setPasswordChangeError('Error al cambiar la contraseña. Por favor, inténtalo de nuevo.');
    }
  }

  function togglePasswordVisibility(userId: string) {
    setPasswordVisibility(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    setEditError('');
    setEditSuccess('');

    try {
      const fullPhone = editUser.phone ? `${editUser.countryCode}${editUser.phone}` : null;
      
      const updateData: Record<string, unknown> = {
        name: editUser.name,
        email: editUser.email,
        phone: fullPhone,
        role: editUser.role,
        telegram_chat_id: editUser.telegram_chat_id || null,
      };
      const hourlyRate = editUser.hourly_rate === '' || editUser.hourly_rate === null ? null : Number(editUser.hourly_rate);
      const monthlySalary = editUser.monthly_salary === '' || editUser.monthly_salary === null ? null : Number(editUser.monthly_salary);
      if (hourlyRate !== undefined) updateData.hourly_rate = hourlyRate;
      if (monthlySalary !== undefined) updateData.monthly_salary = monthlySalary;
      updateData.currency = editUser.currency || 'COP';
      updateData.payment_account = editUser.payment_account?.trim() || null;

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', editUser.id);

      if (error) throw error;

      if (currentUser?.id) {
        await logAudit({
          user_id: currentUser.id,
          entity_type: 'user',
          entity_id: editUser.id,
          action: 'update',
          summary: `Usuario actualizado: ${editUser.name}`,
        });
      }

      // Update the password if it was changed
      if (newPassword && selectedUserId === editUser.id) {
        const { error: passwordError } = await supabase
          .from('users')
          .update({ password: newPassword })
          .eq('id', editUser.id);
          
        if (passwordError) throw passwordError;
        
        setUserPasswords(prev => ({
          ...prev,
          [editUser.id]: newPassword
        }));
        
        setNewPassword('');
      }

      setEditSuccess('Usuario actualizado con éxito.');
      await fetchUsers();
      
      setTimeout(() => {
        setShowEditUserModal(false);
        setEditSuccess('');
      }, 1500);
    } catch (error) {
      console.error('Error al actualizar usuario:', error);
      setEditError('Error al actualizar el usuario. Por favor, inténtalo de nuevo.');
    }
  }

  function openEditUserModal(user: User) {
    // Parse phone number to separate country code and number
    let countryCode = '+57';
    let phoneNumber = '';
    
    if (user.phone) {
      // Find the country code by checking for common prefixes
      const countryCodes = ['+1', '+57', '+44', '+33', '+49', '+52', '+57', '+54', '+56', '+51'];
      const foundCode = countryCodes.find(code => user.phone?.startsWith(code));
      
      if (foundCode) {
        countryCode = foundCode;
        phoneNumber = user.phone.substring(foundCode.length);
      } else {
        phoneNumber = user.phone;
      }
    }
    
    setEditUser({
      id: user.id,
      name: user.name,
      email: user.email,
      countryCode,
      phone: phoneNumber,
      role: user.role,
      telegram_chat_id: user.telegram_chat_id || '',
      hourly_rate: user.hourly_rate ?? '',
      monthly_salary: user.monthly_salary ?? '',
      currency: user.currency || 'COP',
      payment_account: user.payment_account || '',
    });
    
    setShowEditUserModal(true);
  }

  async function handleDeleteUser() {
    if (!editUser.id) return;
    
    setDeleteError('');
    
    // Cannot delete yourself
    if (editUser.id === currentUser?.id) {
      setDeleteError('No puedes eliminar tu propio usuario.');
      return;
    }
    
    // Check if a user to reassign tasks has been selected
    if (!reassignUserId) {
      setDeleteError('Debes seleccionar un usuario para reasignar las tareas.');
      return;
    }
    
    try {
      setLoading(true);
      
      // 1. Reassign all tasks where the user is in assigned_users array
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('id, assigned_users')
        .contains('assigned_users', [editUser.id]);
      
      if (tasksError) throw tasksError;
      
      // Process task reassignments
      if (tasksData && tasksData.length > 0) {
        for (const task of tasksData) {
          const updatedAssignedUsers = task.assigned_users.filter((id: string) => id !== editUser.id);
          if (!updatedAssignedUsers.includes(reassignUserId)) {
            updatedAssignedUsers.push(reassignUserId);
          }
          
          const { error: updateError } = await supabase
            .from('tasks')
            .update({ assigned_users: updatedAssignedUsers })
            .eq('id', task.id);
          
          if (updateError) throw updateError;
        }
      }
      
      // 2. Reassign all subtasks assigned to this user
      const { error: subtasksError } = await supabase
        .from('subtasks')
        .update({ assigned_to: reassignUserId })
        .eq('assigned_to', editUser.id);
      
      if (subtasksError) throw subtasksError;
      
      // 3. Reassign task work assignments
      const { error: workAssignmentsError } = await supabase
        .from('task_work_assignments')
        .update({ user_id: reassignUserId })
        .eq('user_id', editUser.id);
      
      if (workAssignmentsError) throw workAssignmentsError;
      
      // 4. Remove user from any projects' assigned_projects
      const { data: projectsData, error: projectsSelectError } = await supabase
        .from('users')
        .select('id, assigned_projects')
        .eq('id', reassignUserId)
        .single();
      
      if (projectsSelectError) throw projectsSelectError;
      
      // Get projects assigned to the user being deleted
      const { data: deletedUserData, error: deletedUserError } = await supabase
        .from('users')
        .select('assigned_projects')
        .eq('id', editUser.id)
        .single();
      
      if (deletedUserError) throw deletedUserError;
      
      if (deletedUserData?.assigned_projects && deletedUserData.assigned_projects.length > 0) {
        // Add the deleted user's projects to the reassigned user if they don't already have them
        const currentReassignProjects = projectsData?.assigned_projects || [];
        const projectsToAdd = deletedUserData.assigned_projects.filter(
          (projectId: string) => !currentReassignProjects.includes(projectId)
        );
        
        if (projectsToAdd.length > 0) {
          const updatedProjects = [...currentReassignProjects, ...projectsToAdd];
          
          const { error: projectsUpdateError } = await supabase
            .from('users')
            .update({ assigned_projects: updatedProjects })
            .eq('id', reassignUserId);
          
          if (projectsUpdateError) throw projectsUpdateError;
        }
      }
      
      // 5. Finally, delete the user
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', editUser.id);
      
      if (deleteError) throw deleteError;

      if (currentUser?.id) {
        await logAudit({
          user_id: currentUser.id,
          entity_type: 'user',
          entity_id: editUser.id,
          action: 'delete',
          summary: `Usuario eliminado: ${editUser.name} (${editUser.email})`,
        });
      }
      
      // Close modals and refresh user list
      setShowDeleteConfirmation(false);
      setShowEditUserModal(false);
      await fetchUsers();
      
    } catch (error) {
      console.error('Error al eliminar usuario:', error);
      setDeleteError('Error al eliminar el usuario y reasignar sus tareas. Por favor, inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="h-8 bg-gray-200 rounded w-32 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-48" />
          </div>
          <div className="h-10 bg-gray-200 rounded w-28" />
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-4 border-b flex gap-4">
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="h-4 bg-gray-200 rounded w-32" />
            <div className="h-4 bg-gray-200 rounded w-24" />
          </div>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="p-4 border-b flex gap-4 items-center">
              <div className="h-8 w-8 bg-gray-200 rounded-full" />
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
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h1>
          <p className="text-gray-600">Administra los usuarios y sus roles</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nuevo Usuario
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Usuario
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Correo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Teléfono
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Telegram
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <UsersIcon className="h-5 w-5 text-gray-400 mr-3" />
                    <div className="text-sm font-medium text-gray-900">{user.name}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {user.email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {user.phone || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {user.telegram_chat_id ? (
                      <div className="flex items-center text-green-700">
                        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.789l3.01-14.2c.309-1.239-.473-1.8-1.282-1.434z"/>
                        </svg>
                        <span className="text-xs font-medium">Conectado</span>
                      </div>
                    ) : (
                      <div className="flex items-center text-gray-400">
                        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.789l3.01-14.2c.309-1.239-.473-1.8-1.282-1.434z"/>
                        </svg>
                        <span className="text-xs">No conectado</span>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    user.role === 'admin' 
                      ? 'bg-purple-100 text-purple-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {user.role === 'admin' ? 'Administrador' : 'Usuario'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <div className="flex flex-col space-y-2">
                    <button
                      onClick={() => openEditUserModal(user)}
                      className="w-full text-xs px-2 py-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Editar usuario
                    </button>
                    {isAdmin && currentUser?.id !== user.id && (
                      <button
                        onClick={() => impersonateUser(user)}
                        className="w-full text-xs px-2 py-1.5 bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100 transition-colors flex items-center justify-center"
                      >
                        <LogIn className="h-3.5 w-3.5 mr-1" />
                        Iniciar sesión como
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">Crear Nuevo Usuario</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="p-6">
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono
                  </label>
                  <div className="flex">
                    <select
                      value={newUser.countryCode}
                      onChange={(e) => setNewUser({ ...newUser, countryCode: e.target.value })}
                      className="w-24 p-2 border rounded-l-md bg-gray-50"
                    >
                      <option value="+57">+57 🇨🇴</option>
                      <option value="+1">+1 🇺🇸</option>
                      <option value="+44">+44 🇬🇧</option>
                      <option value="+33">+33 🇫🇷</option>
                      <option value="+49">+49 🇩🇪</option>
                      <option value="+52">+52 🇲🇽</option>
                      <option value="+54">+54 🇦🇷</option>
                      <option value="+56">+56 🇨🇱</option>
                      <option value="+51">+51 🇵🇪</option>
                    </select>
                    <input
                      type="tel"
                      value={newUser.phone}
                      onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                      className="flex-1 p-2 border-y border-r rounded-r-md"
                      placeholder="600123456"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña
                  </label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={newUser.isAdmin}
                      onChange={(e) => setNewUser({ ...newUser, isAdmin: e.target.checked })}
                      className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 mr-2"
                    />
                    <span className="text-sm text-gray-700">Crear como administrador</span>
                  </label>
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
                  Crear Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showChangePasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h2 className="text-xl font-semibold text-gray-800">
                Cambiar Contraseña
                {selectedUserName && <span className="text-indigo-600 ml-1">- {selectedUserName}</span>}
              </h2>
              <button
                onClick={() => {
                  setShowChangePasswordModal(false);
                  setNewPassword('');
                  setPasswordChangeError('');
                  setPasswordChangeSuccess('');
                  setShowNewPassword(false);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="p-5">
              {passwordChangeError && (
                <div className="mb-4 bg-red-50 border-l-4 border-red-400 text-red-700 p-4 rounded-r">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm">{passwordChangeError}</p>
                    </div>
                  </div>
                </div>
              )}
              {passwordChangeSuccess && (
                <div className="mb-4 bg-green-50 border-l-4 border-green-400 text-green-700 p-4 rounded-r">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm">{passwordChangeSuccess}</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nueva Contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full p-2 border border-gray-300 rounded-md pr-10 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                      required
                      placeholder="Ingresa la nueva contraseña"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Recomendación: Usa una combinación de letras, números y símbolos.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePasswordModal(false);
                    setNewPassword('');
                    setPasswordChangeError('');
                    setPasswordChangeSuccess('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditUserModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-semibold text-gray-800 truncate pr-2">
                Editar usuario
                {editUser.name && <span className="text-indigo-600 font-normal"> · {editUser.name}</span>}
              </h2>
              <button
                onClick={() => {
                  setShowEditUserModal(false);
                  setEditError('');
                  setEditSuccess('');
                  setNewPassword('');
                }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditUser} className="flex flex-col min-h-0">
              <div className="overflow-y-auto flex-1 px-5 py-4">
                {editError && (
                  <div className="mb-3 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                    <svg className="h-4 w-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p>{editError}</p>
                  </div>
                )}
                {editSuccess && (
                  <div className="mb-3 flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 rounded-lg text-sm">
                    <svg className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <p>{editSuccess}</p>
                  </div>
                )}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Nombre</label>
                      <input
                        type="text"
                        value={editUser.name}
                        onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Correo</label>
                      <input
                        type="email"
                        value={editUser.email}
                        onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Teléfono</label>
                      <div className="flex">
                        <select
                          value={editUser.countryCode}
                          onChange={(e) => setEditUser({ ...editUser, countryCode: e.target.value })}
                          className="w-16 px-2 py-2 text-sm border border-gray-200 rounded-l-lg bg-gray-50"
                        >
                          <option value="+57">+57</option>
                          <option value="+1">+1</option>
                          <option value="+44">+44</option>
                          <option value="+52">+52</option>
                          <option value="+54">+54</option>
                        </select>
                        <input
                          type="tel"
                          value={editUser.phone}
                          onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })}
                          className="flex-1 px-3 py-2 text-sm border border-l-0 border-gray-200 rounded-r-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          placeholder="600123456"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Rol</label>
                      <select
                        value={editUser.role}
                        onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      >
                        <option value="user">Usuario</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Telegram (ID de chat)</label>
                    <input
                      type="text"
                      value={editUser.telegram_chat_id}
                      onChange={(e) => setEditUser({ ...editUser, telegram_chat_id: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      placeholder="123456789 — vacío para desactivar"
                    />
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-2">Nómina y pagos</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Sueldo mensual</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={editUser.monthly_salary === '' ? '' : editUser.monthly_salary}
                          onChange={(e) => setEditUser({ ...editUser, monthly_salary: e.target.value === '' ? '' : Number(e.target.value) })}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          placeholder="3.000.000"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Tarifa/hora</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editUser.hourly_rate === '' ? '' : editUser.hourly_rate}
                          onChange={(e) => setEditUser({ ...editUser, hourly_rate: e.target.value === '' ? '' : Number(e.target.value) })}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          placeholder="Freelancers"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Moneda</label>
                        <select
                          value={editUser.currency}
                          onChange={(e) => setEditUser({ ...editUser, currency: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        >
                          <option value="COP">COP</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Cuenta de pago</label>
                        <input
                          type="text"
                          value={editUser.payment_account}
                          onChange={(e) => setEditUser({ ...editUser, payment_account: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          placeholder="Banco - Cuenta"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-2">Seguridad</p>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Nueva contraseña</label>
                        <div className="relative">
                          <input
                            type={showNewPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => {
                              setNewPassword(e.target.value);
                              setSelectedUserId(editUser.id);
                            }}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg pr-10 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            placeholder="Dejar vacío para no cambiar"
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                          >
                            {showNewPassword ? (
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Contraseña actual</label>
                        <div className="relative">
                          <input
                            type={passwordVisibility[editUser.id] ? "text" : "password"}
                            value={userPasswords[editUser.id] || ''}
                            readOnly
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg pr-10 bg-gray-50"
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                            onClick={() => togglePasswordVisibility(editUser.id)}
                          >
                            {passwordVisibility[editUser.id] ? (
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex justify-between items-center gap-3 shrink-0 bg-gray-50/50">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirmation(true)}
                  className="px-3 py-2 text-sm border border-red-200 rounded-lg text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Eliminar
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditUserModal(false);
                      setEditError('');
                      setEditSuccess('');
                      setNewPassword('');
                    }}
                    className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center p-5 border-b border-gray-100">
              <h2 className="text-xl font-semibold text-red-600 flex items-center">
                <AlertTriangle className="w-6 h-6 mr-2" />
                Eliminar Usuario
              </h2>
              <button
                onClick={() => setShowDeleteConfirmation(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-5">
              {deleteError && (
                <div className="mb-4 bg-red-50 border-l-4 border-red-400 text-red-700 p-4 rounded-r">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm">{deleteError}</p>
                    </div>
                  </div>
                </div>
              )}
              
              <p className="text-gray-700 mb-4">
                ¿Estás seguro de que deseas eliminar al usuario <span className="font-semibold">{editUser.name}</span>?
              </p>
              
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-yellow-400" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                      Esta acción es irreversible. Todas las tareas, subtareas y asignaciones de trabajo de este usuario deben ser transferidas a otro usuario.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selecciona usuario para transferir las tareas
                </label>
                <select
                  value={reassignUserId}
                  onChange={(e) => setReassignUserId(e.target.value)}
                  className="block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  <option value="">Selecciona un usuario</option>
                  {users
                    .filter(u => u.id !== editUser.id) // Exclude the user being deleted
                    .map(user => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))
                  }
                </select>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirmation(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDeleteUser}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  disabled={!reassignUserId || loading}
                >
                  {loading ? 'Procesando...' : 'Confirmar Eliminación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}