import React from 'react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, X, Calendar, Clock, Users } from 'lucide-react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { es } from 'date-fns/locale';
import TaskStatusDisplay from '../components/TaskStatusDisplay';

interface Project {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  deadline: string;
  created_at: string;
  created_by: string;
  restricted_access?: boolean;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  estimated_duration: number;
  deadline: string;
  project_id: string;
  status: string;
}

interface User {
  id: string;
  email: string;
  assigned_projects?: string[];
}

function Projects() {
  const { isAdmin, user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Record<string, Task[]>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [projectUsers, setProjectUsers] = useState<Record<string, string[]>>({});
  const [userProjectAssignments, setUserProjectAssignments] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [editedProject, setEditedProject] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    involved_users: [] as string[]
  });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);
  
  useEffect(() => {
    fetchUsers();
  }, [isAdmin]);

  async function fetchUsers() {
    if (!isAdmin) return;
    
    try {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, email, assigned_projects, name');

      if (usersError) throw usersError;
      setUsers(usersData || []);
      
      // Crear un mapa de usuario -> proyectos asignados
      const projectAssignments: Record<string, string[]> = {};
      usersData?.forEach(user => {
        projectAssignments[user.id] = user.assigned_projects || [];
      });
      setUserProjectAssignments(projectAssignments);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    }
  }

  async function fetchProjects() {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
      
      // Fetch tasks for each project
      for (const project of (data || [])) {
        fetchProjectTasks(project.id);
        fetchProjectUsers(project.id);
      }
      
    } catch (error) {
      console.error('Error al cargar los proyectos:', error);
    } finally {
      setLoading(false);
    }
  }
  
  async function fetchProjectTasks(projectId: string) {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId);
      
      if (error) throw error;
      
      setTasks(prev => ({
        ...prev,
        [projectId]: data || []
      }));
    } catch (error) {
      console.error(`Error al cargar tareas del proyecto ${projectId}:`, error);
    }
  }

  async function fetchProjectUsers(projectId: string) {
    try {
      const { data, error } = await supabase
        .from('project_users')
        .select('user_id')
        .eq('project_id', projectId);
      
      if (error) throw error;
      
      setProjectUsers(prev => ({
        ...prev,
        [projectId]: data?.map(item => item.user_id) || []
      }));
    } catch (error) {
      console.error(`Error al cargar usuarios del proyecto ${projectId}:`, error);
    }
  }

  // Función para obtener los usuarios que tienen acceso a un proyecto
  function getUsersWithAccessToProject(projectId: string): User[] {
    return users.filter(u => 
      userProjectAssignments[u.id]?.includes(projectId) || 
      projects.find(p => p.id === projectId)?.created_by === u.id
    );
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError('');

    // Validar que se hayan seleccionado usuarios
    if (newProject.involved_users.length === 0) {
      setError('Debes seleccionar al menos un usuario involucrado en el proyecto.');
      return;
    }

    try {
      // Create the project
      const { data, error } = await supabase
        .from('projects')
        .insert([
          {
            name: newProject.name,
            description: newProject.description,
            start_date: newProject.start_date,
            deadline: newProject.deadline,
            created_by: user.id,
          },
        ])
        .select();

      if (error) throw error;

      // Añadir usuarios involucrados (ahora es obligatorio)
      if (data && data[0]) {
        const projectId = data[0].id;
        
        // Always include the creator
        const uniqueUsers = [...new Set([...newProject.involved_users, user.id])];
        
        for (const userId of uniqueUsers) {
          // Obtener proyectos actuales del usuario
          const { data: userData, error: getUserError } = await supabase
            .from('users')
            .select('assigned_projects')
            .eq('id', userId)
            .single();
            
          if (getUserError) {
            console.error("Error al obtener usuario:", getUserError);
            continue;
          }
          
          const currentProjects = userData.assigned_projects || [];
          
          // Añadir el nuevo proyecto si no está ya asignado
          if (!currentProjects.includes(projectId)) {
            const { error: updateError } = await supabase
              .from('users')
              .update({ 
                assigned_projects: [...currentProjects, projectId] 
              })
              .eq('id', userId);
              
            if (updateError) {
              console.error("Error al actualizar usuario:", updateError);
            }
          }
        }
      }

      await fetchProjects();
      await fetchUsers(); // Actualizar los usuarios para tener los assigned_projects actualizados
      setShowModal(false);
      setNewProject({
        name: '',
        description: '',
        start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        involved_users: []
      });
    } catch (error) {
      console.error('Error al crear el proyecto:', error);
      setError('Error al crear el proyecto. Por favor, inténtalo de nuevo.');
    }
  }
  
  async function handleUpdateProject() {
    if (!selectedProject || !editedProject) return;
    
    // Validar que se hayan seleccionado usuarios
    if (editedProject.involved_users.length === 0) {
      setError('Debes seleccionar al menos un usuario involucrado en el proyecto.');
      return;
    }
    
    try {
      // Update project basic info
      const { error } = await supabase
        .from('projects')
        .update({
          name: editedProject.name,
          description: editedProject.description,
          start_date: editedProject.start_date,
          deadline: editedProject.deadline
        })
        .eq('id', selectedProject.id);
      
      if (error) {
        console.error("Error al actualizar el proyecto:", error);
        throw error;
      }
      
      // Handle project users assignments
      // 1. Obtener todos los usuarios que actualmente tienen este proyecto
      const usersWithAccess = users.filter(u => 
        userProjectAssignments[u.id]?.includes(selectedProject.id)
      );
      
      // 2. Para cada usuario que ahora debería tener acceso (siempre incluir al creador)
      const uniqueInvolvedUsers = [...new Set([...editedProject.involved_users, selectedProject.created_by])];
      
      for (const userId of uniqueInvolvedUsers) {
        if (!userProjectAssignments[userId]?.includes(selectedProject.id)) {
          // Agregar el proyecto al usuario si no lo tiene
          const { data: userData, error: getUserError } = await supabase
            .from('users')
            .select('assigned_projects')
            .eq('id', userId)
            .single();
            
          if (getUserError) {
            console.error("Error al obtener usuario:", getUserError);
            continue;
          }
          
          const currentProjects = userData.assigned_projects || [];
          
          const { error: updateError } = await supabase
            .from('users')
            .update({ 
              assigned_projects: [...currentProjects, selectedProject.id] 
            })
            .eq('id', userId);
            
          if (updateError) {
            console.error("Error al actualizar usuario:", updateError);
          }
        }
      }
      
      // 3. Para cada usuario que actualmente tiene acceso
      for (const userWithAccess of usersWithAccess) {
        // Si ya no debe tener acceso, quitar el proyecto (excepto el creador)
        if (!uniqueInvolvedUsers.includes(userWithAccess.id)) { 
          
          const currentProjects = userProjectAssignments[userWithAccess.id] || [];
          const updatedProjects = currentProjects.filter(id => id !== selectedProject.id);
          
          const { error: updateError } = await supabase
            .from('users')
            .update({ 
              assigned_projects: updatedProjects 
            })
            .eq('id', userWithAccess.id);
            
          if (updateError) {
            console.error("Error al actualizar usuario:", updateError);
          }
        }
      }
      
      await fetchProjects();
      await fetchUsers(); // Actualizar los usuarios para tener los assigned_projects actualizados
      setShowDetailModal(false);
      setEditMode(false);
    } catch (error) {
      console.error('Error al actualizar el proyecto:', error);
      setError('Error al actualizar el proyecto. Por favor, inténtalo de nuevo.');
    }
  }
  
  async function handleDeleteProject() {
    if (!selectedProject) return;
    
    if (!window.confirm('¿Estás seguro de que deseas eliminar este proyecto y todas sus tareas asociadas? Esta acción no se puede deshacer.')) {
      return;
    }
    
    try {
      // First delete all task work assignments related to this project
      const { error: workAssignmentsError } = await supabase
        .from('task_work_assignments')
        .delete()
        .eq('project_id', selectedProject.id);
      
      if (workAssignmentsError) {
        console.error("Error al eliminar asignaciones de trabajo del proyecto:", workAssignmentsError);
        throw workAssignmentsError;
      }
      
      // Second delete all tasks associated with this project
      const { error: tasksError } = await supabase
        .from('tasks')
        .delete()
        .eq('project_id', selectedProject.id);
      
      if (tasksError) {
        console.error("Error al eliminar tareas del proyecto:", tasksError);
        throw tasksError;
      }
      
      // Then delete the project itself
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', selectedProject.id);
      
      if (error) {
        console.error("Error al eliminar el proyecto:", error);
        throw error;
      }
      
      // Remove project from assigned_projects array for all users
      for (const usr of users) {
        if (userProjectAssignments[usr.id]?.includes(selectedProject.id)) {
          const currentProjects = userProjectAssignments[usr.id] || [];
          const updatedProjects = currentProjects.filter((id: string) => id !== selectedProject.id);
          
          const { error: updateError } = await supabase
            .from('users')
            .update({ 
              assigned_projects: updatedProjects 
            })
            .eq('id', usr.id);
            
          if (updateError) {
            console.error("Error al actualizar asignaciones de usuario:", updateError);
          }
        }
      }
      
      await fetchProjects();
      setShowDetailModal(false);
      
      // Mostrar mensaje de éxito
      alert('Proyecto eliminado correctamente');
    } catch (error) {
      console.error('Error al eliminar el proyecto:', error);
      setError('Error al eliminar el proyecto. Por favor, inténtalo de nuevo.');
      
      // Mostrar mensaje de error más claro
      alert('No se pudo eliminar el proyecto. Puede que existan otras dependencias en la base de datos.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }
  
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proyectos</h1>
          <p className="text-gray-600">Gestiona tus proyectos y sus tareas asociadas</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowModal(true)}
              className="bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 flex items-center"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nuevo Proyecto
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.length > 0 ? (
          projects.map((project) => {
            // Calcular estadísticas del proyecto
            const projectTasks = tasks[project.id] || [];
            const totalTasks = projectTasks.length;
            const completedTasks = projectTasks.filter(t => t.status === 'completed' || t.status === 'approved').length;
            const pendingTasks = projectTasks.filter(t => t.status === 'pending' || t.status === 'assigned').length;
            const blockedTasks = projectTasks.filter(t => t.status === 'blocked').length;
            const inReviewTasks = projectTasks.filter(t => t.status === 'in_review').length;
            
            // Calcular porcentaje de progreso
            const progressPercentage = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
            
            // Determinar color de la barra de progreso
            let progressColor = 'bg-emerald-500';
            if (progressPercentage < 25) {
              progressColor = 'bg-red-500';
            } else if (progressPercentage < 75) {
              progressColor = 'bg-yellow-500';
            }
            
            return (
              <div
                key={project.id}
                className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <h2 
                    className="text-xl font-semibold text-gray-900 cursor-pointer hover:text-emerald-600"
                    onClick={() => {
                      setSelectedProject(project);
                      setEditedProject({
                        name: project.name,
                        description: project.description || '',
                        start_date: project.start_date ? project.start_date.replace(" ", "T").substring(0, 16) : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                        deadline: project.deadline ? project.deadline.replace(" ", "T").substring(0, 16) : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                        restricted_access: project.restricted_access || false,
                        involved_users: getUsersWithAccessToProject(project.id).map(u => u.id)
                      });
                      setShowDetailModal(true);
                    }}
                  >
                    {project.name}
                  </h2>
                </div>
                
                {project.description && (
                  <p className="text-gray-600 mb-4 line-clamp-2">{project.description}</p>
                )}
                
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-700">Progreso</span>
                    <span className="text-sm font-medium text-gray-700">{progressPercentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div className={`${progressColor} h-2.5 rounded-full`} style={{ width: `${progressPercentage}%` }}></div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-gray-50 p-2 rounded text-center">
                    <span className="block text-xl font-bold text-emerald-600">{completedTasks}</span>
                    <span className="text-xs text-gray-500">Completadas</span>
                  </div>
                  <div className="bg-gray-50 p-2 rounded text-center">
                    <span className="block text-xl font-bold text-gray-600">{totalTasks}</span>
                    <span className="text-xs text-gray-500">Total</span>
                  </div>
                  <div className="bg-gray-50 p-2 rounded text-center">
                    <span className="block text-xl font-bold text-yellow-600">{pendingTasks}</span>
                    <span className="text-xs text-gray-500">Pendientes</span>
                  </div>
                  <div className="bg-gray-50 p-2 rounded text-center">
                    <span className="block text-xl font-bold text-red-600">{blockedTasks}</span>
                    <span className="text-xs text-gray-500">Bloqueadas</span>
                  </div>
                </div>
                
                <div className="flex flex-col space-y-2 mb-4">
                  <div className="flex items-center text-sm text-gray-500">
                    <Calendar className="w-4 h-4 mr-2" />
                    <span>Inicio: {new Date(project.start_date).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-500">
                    <Calendar className="w-4 h-4 mr-2" />
                    <span>Fin: {new Date(project.deadline).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-500">
                    <Users className="w-4 h-4 mr-2" />
                    <span>Creado por: {users.find(u => u.id === project.created_by)?.name || 'Desconocido'}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-500">
                    <Users className="w-4 h-4 mr-2" />
                    <span>Involucrados: {getUsersWithAccessToProject(project.id).length || 1} usuarios</span>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Tareas recientes ({totalTasks})</h3>
                  {projectTasks.length > 0 ? (
                    <ul className="space-y-2">
                      {projectTasks.slice(0, 3).map(task => (
                        <li key={task.id} className="text-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <div className={`w-2 h-2 rounded-full mr-2 ${
                                task.priority === 'high' ? 'bg-red-500' :
                                task.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                              }`}></div>
                              <span className="truncate">{task.title}</span>
                            </div>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              task.status === 'completed' || task.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                              task.status === 'blocked' ? 'bg-red-100 text-red-800' :
                              task.status === 'in_review' ? 'bg-blue-100 text-blue-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {task.status === 'completed' ? 'Completada' :
                               task.status === 'approved' ? 'Aprobada' :
                               task.status === 'blocked' ? 'Bloqueada' :
                               task.status === 'in_review' ? 'En revisión' :
                               task.status === 'returned' ? 'Devuelta' :
                               task.status === 'assigned' ? 'Asignada' : 'Pendiente'}
                            </span>
                          </div>
                        </li>
                      ))}
                      {projectTasks.length > 3 && (
                        <li className="text-xs text-gray-500 italic">
                          Y {projectTasks.length - 3} tareas más...
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No hay tareas asociadas a este proyecto.</p>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full text-center py-12">
            <p className="text-gray-500">No se encontraron proyectos.</p>
            {isAdmin && (
              <button
                onClick={() => setShowModal(true)}
                className="mt-4 text-emerald-600 hover:text-emerald-700 flex items-center mx-auto"
              >
                <Plus className="w-5 h-5 mr-2" />
                Crear mi primer proyecto
              </button>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">Crear Nuevo Proyecto</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="p-6 overflow-y-auto">
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del Proyecto
                  </label>
                  <input
                    type="text"
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  <textarea
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                    className="w-full p-2 border rounded-md"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha de inicio
                    </label>
                    <input
                      type="datetime-local"
                      value={newProject.start_date}
                      onChange={(e) => setNewProject({ ...newProject, start_date: e.target.value })}
                      className="w-full p-2 border rounded-md"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha límite
                    </label>
                    <input
                      type="datetime-local"
                      value={newProject.deadline}
                      onChange={(e) => setNewProject({ ...newProject, deadline: e.target.value })}
                      className="w-full p-2 border rounded-md"
                      required
                    />
                  </div>
                </div>
                <div className="mt-3 border-t pt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <span className="mr-1">Usuarios involucrados:</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="max-h-40 overflow-y-auto border rounded-md p-2">
                    {users.map((u) => (
                      <div key={u.id} className="flex items-center py-1">
                        <input
                          type="checkbox"
                          id={`user-${u.id}`}
                          checked={newProject.involved_users.includes(u.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewProject({
                                ...newProject,
                                involved_users: [...newProject.involved_users, u.id]
                              });
                            } else {
                              setNewProject({
                                ...newProject,
                                involved_users: newProject.involved_users.filter((id: string) => id !== u.id)
                              });
                            }
                          }}
                          className="mr-2"
                        />
                        <label htmlFor={`user-${u.id}`} className="text-sm">
                          {u.name}
                        </label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Nota: Tú serás incluido automáticamente como involucrado.
                  </p>
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
                  className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                >
                  Crear Proyecto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDetailModal && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">
                {editMode ? "Editar Proyecto" : "Detalles del Proyecto"}
              </h2>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setEditMode(false);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del Proyecto
                  </label>
                  {editMode ? (
                    <input
                      type="text"
                      value={editedProject.name}
                      onChange={(e) => setEditedProject({ ...editedProject, name: e.target.value })}
                      className="w-full p-2 border rounded-md"
                      disabled={!isAdmin}
                    />
                  ) : (
                    <p className="p-2 bg-gray-50 rounded-md">{selectedProject.name}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  {editMode ? (
                    <textarea
                      value={editedProject.description}
                      onChange={(e) => setEditedProject({ ...editedProject, description: e.target.value })}
                      className="w-full p-2 border rounded-md"
                      rows={3}
                      disabled={!isAdmin}
                    />
                  ) : (
                    <p className="p-2 bg-gray-50 rounded-md whitespace-pre-line min-h-[4rem]">
                      {selectedProject.description || "Sin descripción"}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha de inicio
                    </label>
                    {editMode ? (
                      <input
                        type="datetime-local"
                        value={editedProject.start_date}
                        onChange={(e) => setEditedProject({ ...editedProject, start_date: e.target.value })}
                        className="w-full p-2 border rounded-md"
                        disabled={!isAdmin}
                      />
                    ) : (
                      <p className="p-2 bg-gray-50 rounded-md">
                        {new Date(selectedProject.start_date).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha límite
                    </label>
                    {editMode ? (
                      <input
                        type="datetime-local"
                        value={editedProject.deadline}
                        onChange={(e) => setEditedProject({ ...editedProject, deadline: e.target.value })}
                        className="w-full p-2 border rounded-md"
                        disabled={!isAdmin}
                      />
                    ) : (
                      <div>
                        <p className="p-2 bg-gray-50 rounded-md">
                          {new Date(selectedProject.deadline).toLocaleString()}
                        </p>
                        <div className={`mt-2 flex items-center text-sm ${
                          isPast(new Date(selectedProject.deadline)) 
                            ? 'text-red-600' 
                            : 'text-emerald-600'
                        }`}>
                          <Clock className="w-4 h-4 mr-1" />
                          {isPast(new Date(selectedProject.deadline)) 
                            ? `Vencido hace ${formatDistanceToNow(new Date(selectedProject.deadline), { locale: es })}`
                            : `Tiempo restante: ${formatDistanceToNow(new Date(selectedProject.deadline), { locale: es, addSuffix: false })}`
                          }
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {isAdmin && editMode && (
                  <div className="mt-3 border-t pt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                      <span className="mr-1">Usuarios involucrados:</span>
                      <span className="text-red-500">*</span>
                    </label>
                    <div className="max-h-40 overflow-y-auto border rounded-md p-2">
                      {users.map((u) => (
                        <div key={u.id} className="flex items-center py-1">
                          <input
                            type="checkbox"
                            id={`edit-user-${u.id}`}
                            checked={editedProject.involved_users?.includes(u.id) || u.id === selectedProject.created_by}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditedProject({
                                  ...editedProject,
                                  involved_users: [...(editedProject.involved_users || []), u.id]
                                });
                              } else {
                                if (u.id !== selectedProject.created_by) {
                                  setEditedProject({
                                    ...editedProject,
                                    involved_users: (editedProject.involved_users || []).filter((id: string) => id !== u.id)
                                  });
                                }
                              }
                            }}
                            className="mr-2"
                            disabled={u.id === selectedProject.created_by} // El creador siempre está involucrado
                          />
                          <label htmlFor={`edit-user-${u.id}`} className="text-sm">
                            {u.name}
                            {u.id === selectedProject.created_by ? " (Creador)" : ""}
                          </label>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Nota: El creador del proyecto está incluido automáticamente como involucrado.
                    </p>
                  </div>
                )}
                
                {!editMode && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Usuarios involucrados</h3>
                    <div className="bg-gray-50 p-3 rounded-md">
                      {getUsersWithAccessToProject(selectedProject.id).length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {getUsersWithAccessToProject(selectedProject.id).map(usr => (
                            <span key={usr.id} className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded-full text-xs">
                              {usr.name} {usr.id === selectedProject.created_by ? "(Creador)" : ""}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">Solo el creador tiene acceso a este proyecto.</p>
                      )}
                    </div>
                  </div>
                )}
                
                {!editMode && (
                  <>
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h3 className="text-lg font-medium text-gray-700 mb-4">Progreso del Proyecto</h3>
                      
                      {(() => {
                        // Calcular estadísticas del proyecto
                        const projectTasks = tasks[selectedProject.id] || [];
                        const totalTasks = projectTasks.length;
                        const completedTasks = projectTasks.filter(t => t.status === 'completed' || t.status === 'approved').length;
                        const pendingTasks = projectTasks.filter(t => t.status === 'pending' || t.status === 'assigned').length;
                        const blockedTasks = projectTasks.filter(t => t.status === 'blocked').length;
                        const inReviewTasks = projectTasks.filter(t => t.status === 'in_review').length;
                        const returnedTasks = projectTasks.filter(t => t.status === 'returned').length;
                        
                        // Calcular porcentaje de progreso
                        const progressPercentage = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
                        
                        // Determinar color de la barra de progreso
                        let progressColor = 'bg-emerald-500';
                        if (progressPercentage < 25) {
                          progressColor = 'bg-red-500';
                        } else if (progressPercentage < 75) {
                          progressColor = 'bg-yellow-500';
                        }
                        
                        return (
                          <>
                            <div className="mb-6">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-medium text-gray-700">Progreso General</span>
                                <span className="text-sm font-medium text-gray-700">{progressPercentage}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2.5">
                                <div
                                  className={`${progressColor} h-2.5 rounded-full transition-all duration-500`}
                                  style={{ width: `${progressPercentage}%` }}
                                ></div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-4 mb-6">
                              <div className="bg-emerald-50 p-4 rounded-lg text-center">
                                <span className="block text-2xl font-bold text-emerald-600">{completedTasks}</span>
                                <span className="text-sm text-emerald-700">Completadas</span>
                              </div>
                              <div className="bg-yellow-50 p-4 rounded-lg text-center">
                                <span className="block text-2xl font-bold text-yellow-600">{pendingTasks}</span>
                                <span className="text-sm text-yellow-700">Pendientes</span>
                              </div>
                              <div className="bg-red-50 p-4 rounded-lg text-center">
                                <span className="block text-2xl font-bold text-red-600">{blockedTasks}</span>
                                <span className="text-sm text-red-700">Bloqueadas</span>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mb-6">
                              <div className="bg-blue-50 p-4 rounded-lg text-center">
                                <span className="block text-2xl font-bold text-blue-600">{inReviewTasks}</span>
                                <span className="text-sm text-blue-700">En Revisión</span>
                              </div>
                              <div className="bg-orange-50 p-4 rounded-lg text-center">
                                <span className="block text-2xl font-bold text-orange-600">{returnedTasks}</span>
                                <span className="text-sm text-orange-700">Devueltas</span>
                              </div>
                            </div>
                            
                            <div className="bg-gray-50 p-4 rounded-lg text-center">
                              <span className="block text-2xl font-bold text-gray-600">{totalTasks}</span>
                              <span className="text-sm text-gray-700">Total de Tareas</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </>
                )}
                
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Información adicional</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="block text-gray-500">Creado por:</span>
                      <span>{users.find(u => u.id === selectedProject.created_by)?.name || 'Desconocido'}</span>
                    </div>
                    <div>
                      <span className="block text-gray-500">Fecha de creación:</span>
                      <span>{new Date(selectedProject.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h3 className="text-lg font-medium text-gray-700 mb-2">Tareas asociadas</h3>
                  {tasks[selectedProject.id]?.length > 0 ? (
                    <div className="space-y-3">
                      {tasks[selectedProject.id].map(task => (
                        <div key={task.id} className="bg-gray-50 p-3 rounded-md">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-medium">{task.title}</h4>
                              {task.description && <p className="text-sm text-gray-600 mt-1">{task.description}</p>}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className={`px-2 py-1 rounded text-xs ${
                                task.priority === 'high' 
                                  ? 'bg-red-100 text-red-800'
                                  : task.priority === 'medium'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {task.priority === 'high' ? 'Alta' : 
                                 task.priority === 'medium' ? 'Media' : 'Baja'}
                              </span>
                              <span className={`px-2 py-1 rounded text-xs ${
                                task.status === 'completed' || task.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                                task.status === 'blocked' ? 'bg-red-100 text-red-800' :
                                task.status === 'in_review' ? 'bg-blue-100 text-blue-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {task.status === 'completed' ? 'Completada' :
                                 task.status === 'approved' ? 'Aprobada' :
                                 task.status === 'blocked' ? 'Bloqueada' :
                                 task.status === 'in_review' ? 'En revisión' :
                                 task.status === 'returned' ? 'Devuelta' :
                                 task.status === 'assigned' ? 'Asignada' : 'Pendiente'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center text-xs text-gray-500 mt-2">
                            <Clock className="w-3 h-3 mr-1" />
                            <span>{task.estimated_duration} minutos</span>
                            <span className="mx-2">•</span>
                            <span>Fecha límite: {new Date(task.deadline).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500">No hay tareas asociadas a este proyecto.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6 border-t mt-auto flex justify-between">
              {editMode && isAdmin && (
                <button
                  type="button"
                  onClick={handleDeleteProject}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Eliminar Proyecto
                </button>
              )}
              <div className="flex justify-end space-x-3">
                {editMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditMode(false);
                        setEditedProject({
                          name: selectedProject.name,
                          description: selectedProject.description || '',
                          start_date: selectedProject.start_date ? selectedProject.start_date.replace(" ", "T").substring(0, 16) : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                          deadline: selectedProject.deadline ? selectedProject.deadline.replace(" ", "T").substring(0, 16) : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                          restricted_access: selectedProject.restricted_access || false,
                          involved_users: getUsersWithAccessToProject(selectedProject.id).map(u => u.id)
                        });
                      }}
                      className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={handleUpdateProject}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                      >
                        Guardar Cambios
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowDetailModal(false)}
                      className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Cerrar
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setEditMode(true)}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                      >
                        Editar
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Projects; 