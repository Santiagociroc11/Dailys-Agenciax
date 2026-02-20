import React from 'react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logAudit } from '../lib/audit';
import { Plus, X, Calendar, Clock, Users, Archive, ArchiveRestore, FileStack, Copy, GripVertical, Trash2 } from 'lucide-react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import TaskStatusDisplay from '../components/TaskStatusDisplay';
import { getProjectHoursConsumed } from '../lib/metrics';

interface Project {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  deadline: string;
  created_at: string;
  created_by: string;
  restricted_access?: boolean;
  is_archived?: boolean;
  archived_at?: string;
  client_id?: string | null;
  budget_hours?: number | null;
  budget_amount?: number | null;
}

interface Client {
  id: string;
  name: string;
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

interface Subtask {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'in_review' | 'returned' | 'approved';
  task_id: string;
}

interface User {
  id: string;
  email: string;
  assigned_projects?: string[];
  name?: string;
}

function Projects() {
  const { isAdmin, user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userProjectAssignments, setUserProjectAssignments] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [editedProject, setEditedProject] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    involved_users: [] as string[],
    client_id: null as string | null,
    budget_hours: null as number | null,
    budget_amount: null as number | null,
  });
  const [hoursConsumedByProject, setHoursConsumedByProject] = useState<Record<string, number>>({});
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string | null; tasks: unknown[]; phases?: { name: string; order: number }[] }[]>([]);
  const [useTemplateMode, setUseTemplateMode] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [error, setError] = useState('');
  const [phases, setPhases] = useState<{ id: string; name: string; order: number }[]>([]);
  const [newPhaseName, setNewPhaseName] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    async function loadClients() {
      const { data } = await supabase.from('clients').select('id, name').order('name');
      setClients(data || []);
    }
    loadClients();
  }, []);

  useEffect(() => {
    async function loadTemplates() {
      const { data } = await supabase.from('project_templates').select('id, name, description, tasks, phases').order('name');
      setTemplates(data || []);
    }
    loadTemplates();
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [isAdmin]);

  useEffect(() => {
    async function fetchPhases() {
      if (!selectedProject?.id) {
        setPhases([]);
        return;
      }
      const { data } = await supabase
        .from('phases')
        .select('id, name, order')
        .eq('project_id', selectedProject.id)
        .order('order', { ascending: true });
      setPhases((data || []) as { id: string; name: string; order: number }[]);
    }
    fetchPhases();
  }, [selectedProject?.id]);

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

  async function fetchData() {
    setLoading(true);
    try {
      const projectsPromise = supabase.from('projects').select('*').eq('is_archived', false).order('created_at', { ascending: false });
      const archivedProjectsPromise = supabase.from('projects').select('*').eq('is_archived', true).order('archived_at', { ascending: false });
      const tasksPromise = supabase.from('tasks').select('*');
      const subtasksPromise = supabase.from('subtasks').select('id, task_id, status');
      
      const [
        { data: projectsData, error: projectsError }, 
        { data: archivedProjectsData, error: archivedProjectsError },
        { data: tasksData, error: tasksError }, 
        { data: subtasksData, error: subtasksError }
      ] = await Promise.all([
        projectsPromise,
        archivedProjectsPromise,
        tasksPromise,
        subtasksPromise,
      ]);

      const hoursMap = await getProjectHoursConsumed();
      setHoursConsumedByProject(hoursMap);

      if (projectsError) throw projectsError;
      setProjects(projectsData || []);
      
      if (archivedProjectsError) throw archivedProjectsError;
      setArchivedProjects(archivedProjectsData || []);
      
      if (tasksError) throw tasksError;
      setTasks(tasksData || []);
      
      if (subtasksError) throw subtasksError;
      setSubtasks(subtasksData || []);
      
    } catch (error) {
      console.error('Error al cargar los datos del proyecto:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPhase() {
    if (!selectedProject || !newPhaseName.trim()) return;
    try {
      const { data, error } = await supabase.rpc('create_phase', {
        project_id: selectedProject.id,
        name: newPhaseName.trim(),
        order: phases.length,
      });
      if (error) throw error;
      const created = data as { id: string; name: string; order: number };
      setPhases([...phases, created]);
      setNewPhaseName('');
      toast.success('Fase añadida');
    } catch (err) {
      console.error('Error al crear fase:', err);
      toast.error('Error al crear fase');
    }
  }

  // Función para obtener los usuarios que tienen acceso a un proyecto
  function getUsersWithAccessToProject(projectId: string): User[] {
    return users.filter(u => 
      userProjectAssignments[u.id]?.includes(projectId) || 
      projects.find(p => p.id === projectId)?.created_by === u.id
    );
  }

  // Función para archivar un proyecto
  async function handleCreateTemplateFromProject() {
    if (!selectedProject || !user) return;
    const name = newTemplateName.trim() || selectedProject.name + ' (plantilla)';
    try {
      const { data, error } = await supabase.rpc('create_template_from_project', {
        project_id: selectedProject.id,
        template_name: name,
        created_by: user.id,
      });
      if (error) throw error;
      setShowCreateTemplateModal(false);
      if (user?.id && data) {
        const tpl = data as { id?: string; name?: string };
        await logAudit({
          user_id: user.id,
          entity_type: 'project_template',
          entity_id: tpl.id || '',
          action: 'create',
          summary: `Plantilla creada: ${tpl.name || name}`,
        });
      }
      setNewTemplateName('');
      setShowDetailModal(false);
      const { data: updated } = await supabase.from('project_templates').select('id, name, description, tasks').order('name');
      setTemplates(updated || []);
      toast.success('Plantilla creada correctamente');
    } catch (err) {
      console.error('Error al crear plantilla:', err);
      toast.error('Error al crear la plantilla');
    }
  }

  async function handleArchiveProject(projectId: string) {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ 
          is_archived: true, 
          archived_at: new Date().toISOString() 
        })
        .eq('id', projectId);

      if (error) throw error;
      const projectName = projects.find(p => p.id === projectId)?.name;
      if (user?.id) {
        await logAudit({
          user_id: user.id,
          entity_type: 'project',
          entity_id: projectId,
          action: 'update',
          summary: `Proyecto archivado: ${projectName || projectId}`,
        });
      }
      // Actualizar la lista local
      setProjects(projects.filter(p => p.id !== projectId));
      toast.success('Proyecto archivado correctamente');
    } catch (error) {
      console.error('Error al archivar el proyecto:', error);
      toast.error('Error al archivar el proyecto');
    }
  }

  // Función para desarchivar un proyecto
  async function handleUnarchiveProject(projectId: string) {
    try {
      const { error } = await supabase
        .from('projects')
        .update({ 
          is_archived: false, 
          archived_at: null 
        })
        .eq('id', projectId);

      if (error) throw error;
      const projectName = archivedProjects.find(p => p.id === projectId)?.name;
      if (user?.id) {
        await logAudit({
          user_id: user.id,
          entity_type: 'project',
          entity_id: projectId,
          action: 'update',
          summary: `Proyecto desarchivado: ${projectName || projectId}`,
        });
      }
      // Recargar los datos para mostrar el proyecto desarchivado
      fetchData();
      toast.success('Proyecto desarchivado correctamente');
    } catch (error) {
      console.error('Error al desarchivar el proyecto:', error);
      toast.error('Error al desarchivar el proyecto');
    }
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

    // Crear desde plantilla
    if (useTemplateMode && selectedTemplateId) {
      try {
        const { data: rpcData, error: rpcError } = await supabase.rpc('create_project_from_template', {
          template_id: selectedTemplateId,
          project_name: newProject.name,
          description: newProject.description,
          start_date: newProject.start_date,
          deadline: newProject.deadline,
          created_by: user.id,
          involved_users: newProject.involved_users,
          client_id: newProject.client_id,
          budget_hours: newProject.budget_hours,
          budget_amount: newProject.budget_amount,
        });
        if (rpcError) throw rpcError;
        if (!rpcData) throw new Error('No se creó el proyecto');
        if (user?.id && rpcData) {
          const proj = rpcData as { id?: string; name?: string };
          await logAudit({
            user_id: user.id,
            entity_type: 'project',
            entity_id: proj.id || '',
            action: 'create',
            summary: `Proyecto creado desde plantilla: ${proj.name || newProject.name}`,
          });
        }
        await fetchData();
        await fetchUsers();
        setShowModal(false);
        setUseTemplateMode(false);
        setSelectedTemplateId(null);
        setNewProject({ name: '', description: '', start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"), deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"), involved_users: [], client_id: null, budget_hours: null, budget_amount: null });
        toast.success('Proyecto creado desde plantilla correctamente');
      } catch (err) {
        console.error('Error al crear proyecto desde plantilla:', err);
        setError('Error al crear el proyecto desde la plantilla. Por favor, inténtalo de nuevo.');
      }
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
            client_id: newProject.client_id || null,
            budget_hours: newProject.budget_hours ?? null,
            budget_amount: newProject.budget_amount ?? null,
          },
        ])
        .select();

      if (error) throw error;

      if (user?.id && data?.[0]) {
        await logAudit({
          user_id: user.id,
          entity_type: 'project',
          entity_id: data[0].id,
          action: 'create',
          summary: `Proyecto creado: ${newProject.name}`,
        });
      }

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
            } else {
              // 🔔 Notificar al usuario sobre tareas disponibles en el nuevo proyecto
              try {
                // Obtener tareas pendientes del proyecto que están disponibles
                const { data: availableTasks } = await supabase
                  .from('tasks')
                  .select('id, title, assigned_users, is_sequential')
                  .eq('project_id', projectId)
                  .eq('status', 'pending');
                
                const { data: availableSubtasks } = await supabase
                  .from('subtasks')
                  .select('id, title, assigned_to, task_id, sequence_order, tasks!inner(title, is_sequential, project_id)')
                  .eq('status', 'pending')
                  .eq('assigned_to', userId)
                  .eq('tasks.project_id', projectId);
                
                let tasksToNotify = [];
                
                // Verificar tareas principales disponibles para el usuario
                if (availableTasks) {
                  const userTasks = availableTasks.filter(task => 
                    task.assigned_users && task.assigned_users.includes(userId)
                  );
                  
                  for (const task of userTasks) {
                    // Verificar si la tarea no tiene subtareas (está directamente disponible)
                    const { data: taskSubtasks } = await supabase
                      .from('subtasks')
                      .select('id')
                      .eq('task_id', task.id)
                      .limit(1);
                    
                    if (!taskSubtasks || taskSubtasks.length === 0) {
                      tasksToNotify.push({
                        title: task.title,
                        isSubtask: false
                      });
                    }
                  }
                }
                
                // Verificar subtareas disponibles para el usuario
                if (availableSubtasks) {
                  for (const subtask of availableSubtasks) {
                    let isAvailable = true;
                    
                    // Si es secuencial, verificar dependencias
                    if (subtask.tasks.is_sequential && subtask.sequence_order && subtask.sequence_order > 1) {
                      const { data: previousSubtasks } = await supabase
                        .from('subtasks')
                        .select('status, sequence_order')
                        .eq('task_id', subtask.task_id)
                        .lt('sequence_order', subtask.sequence_order);
                      
                      if (previousSubtasks) {
                        // Agrupar por nivel y verificar que todos estén aprobados
                        const groupedByLevel = previousSubtasks.reduce((acc, st) => {
                          const level = st.sequence_order || 0;
                          if (!acc[level]) acc[level] = [];
                          acc[level].push(st);
                          return acc;
                        }, {} as Record<number, any[]>);
                        
                        for (const level in groupedByLevel) {
                          if (parseInt(level) < subtask.sequence_order) {
                            const levelSubtasks = groupedByLevel[level];
                            if (!levelSubtasks.every(st => st.status === 'approved')) {
                              isAvailable = false;
                              break;
                            }
                          }
                        }
                      }
                    }
                    
                    if (isAvailable) {
                      tasksToNotify.push({
                        title: subtask.title,
                        isSubtask: true,
                        parentTaskTitle: subtask.tasks.title
                      });
                    }
                  }
                }
                
                // Enviar notificaciones si hay tareas disponibles
                if (tasksToNotify.length > 0) {
                  const projectData = projects.find(p => p.id === projectId);
                  const projectName = projectData?.name || "Proyecto sin nombre";
                  
                  for (const taskInfo of tasksToNotify) {
                    fetch('/api/telegram/task-available', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        userIds: [userId],
                        taskTitle: taskInfo.title,
                        projectName: projectName,
                        reason: 'created_available',
                        isSubtask: taskInfo.isSubtask,
                        parentTaskTitle: taskInfo.parentTaskTitle
                      })
                    }).then(response => {
                      if (response.ok) {
                        console.log(`✅ [NOTIFICATION] Notificación de proyecto asignado enviada: ${taskInfo.title}`);
                      }
                    }).catch(error => {
                      console.error('🚨 [NOTIFICATION] Error enviando notificación de proyecto asignado:', error);
                    });
                  }
                  
                  console.log(`🔔 [PROJECT_ASSIGNMENT] Usuario asignado a proyecto con ${tasksToNotify.length} tareas disponibles`);
                }
              } catch (notificationError) {
                console.error('🚨 [NOTIFICATION] Error en notificaciones de asignación de proyecto:', notificationError);
              }
            }
          }
        }
      }

      await fetchData();
      await fetchUsers(); // Actualizar los usuarios para tener los assigned_projects actualizados
      setShowModal(false);
      setNewProject({
        name: '',
        description: '',
        start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        involved_users: [],
        client_id: null,
        budget_hours: null,
        budget_amount: null,
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
          deadline: editedProject.deadline,
          client_id: editedProject.client_id ?? null,
          budget_hours: editedProject.budget_hours ?? null,
          budget_amount: editedProject.budget_amount ?? null,
        })
        .eq('id', selectedProject.id);
      
      if (error) {
        console.error("Error al actualizar el proyecto:", error);
        throw error;
      }
      if (user?.id) {
        await logAudit({
          user_id: user.id,
          entity_type: 'project',
          entity_id: selectedProject.id,
          action: 'update',
          summary: `Proyecto actualizado: ${editedProject.name}`,
        });
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
      
      await fetchData();
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
      // 1. Primero eliminar las asignaciones de trabajo
      const { error: workAssignmentsError } = await supabase
        .from('task_work_assignments')
        .delete()
        .eq('project_id', selectedProject.id);
      
      if (workAssignmentsError) {
        console.error("Error al eliminar asignaciones de trabajo:", workAssignmentsError);
        throw workAssignmentsError;
      }
      
      // 2. Obtener todas las tareas del proyecto
      const { data: projectTasks, error: tasksQueryError } = await supabase
        .from('tasks')
        .select('id')
        .eq('project_id', selectedProject.id);
      
      if (tasksQueryError) {
        console.error("Error al consultar tareas del proyecto:", tasksQueryError);
        throw tasksQueryError;
      }
      
      // 3. Eliminar fases del proyecto
      const { error: phasesError } = await supabase
        .from('phases')
        .delete()
        .eq('project_id', selectedProject.id);
      if (phasesError) {
        console.error('Error al eliminar fases:', phasesError);
      }

      // 4. Si hay tareas, eliminar primero sus subtareas
      if (projectTasks && projectTasks.length > 0) {
        const taskIds = projectTasks.map(task => task.id);
        
        // Eliminar subtareas asociadas a estas tareas
        const { error: subtasksError } = await supabase
          .from('subtasks')
          .delete()
          .in('task_id', taskIds);
        
        if (subtasksError) {
          console.error("Error al eliminar subtareas:", subtasksError);
          throw subtasksError;
        }
        
        // 5. Ahora eliminar las tareas
        const { error: tasksError } = await supabase
          .from('tasks')
          .delete()
          .eq('project_id', selectedProject.id);
        
        if (tasksError) {
          console.error("Error al eliminar tareas:", tasksError);
          throw tasksError;
        }
      }
      
      // 6. Finalmente eliminar el proyecto
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', selectedProject.id);
      
      if (error) {
        console.error("Error al eliminar el proyecto:", error);
        throw error;
      }
      
      // 7. Actualizar asignaciones de usuario
      for (const usr of users) {
        if (userProjectAssignments[usr.id]?.includes(selectedProject.id)) {
          const currentProjects = userProjectAssignments[usr.id] || [];
          const updatedProjects = currentProjects.filter((id) => id !== selectedProject.id);
          
          const { error: updateError } = await supabase
            .from('users')
            .update({ assigned_projects: updatedProjects })
            .eq('id', usr.id);
            
          if (updateError) {
            console.error("Error al actualizar asignaciones de usuario:", updateError);
          }
        }
      }
      
      await fetchData();
      setShowDetailModal(false);
      alert('Proyecto eliminado correctamente');
    } catch (error) {
      console.error('Error al eliminar el proyecto:', error);
      setError('Error al eliminar el proyecto. Por favor, inténtalo de nuevo.');
      alert('No se pudo eliminar el proyecto. Error: ' + JSON.stringify(error));
    }
  }

  if (loading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="h-8 bg-gray-200 rounded w-48 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-64" />
          </div>
          <div className="h-10 bg-gray-200 rounded w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 space-y-4">
              <div className="h-6 bg-gray-200 rounded w-3/4" />
              <div className="h-4 bg-gray-200 rounded w-full" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
              <div className="flex gap-2 pt-2">
                <div className="h-8 bg-gray-200 rounded w-20" />
                <div className="h-8 bg-gray-200 rounded w-20" />
              </div>
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
          <h1 className="text-2xl font-bold text-gray-900">Proyectos</h1>
          <p className="text-gray-600">Gestiona tus proyectos y sus tareas asociadas</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`px-4 py-2 rounded-md flex items-center transition-colors ${
              showArchived 
                ? 'bg-orange-100 text-orange-700 border border-orange-200' 
                : 'bg-gray-100 text-gray-700 border border-gray-200'
            }`}
          >
            {showArchived ? <ArchiveRestore className="w-4 h-4 mr-2" /> : <Archive className="w-4 h-4 mr-2" />}
            {showArchived ? 'Ver Activos' : `Ver Archivados (${archivedProjects.length})`}
          </button>
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
        {(showArchived ? archivedProjects : projects).length > 0 ? (
          (showArchived ? archivedProjects : projects).map((project) => {
            // Calcular estadísticas del proyecto de forma profunda
            const projectTasks = tasks.filter(t => t.project_id === project.id);
            const allTaskIds = new Set(projectTasks.map(t => t.id));
            
            const standaloneTasks = projectTasks.filter(t => !subtasks.some(st => st.task_id === t.id));
            const projectSubtasks = subtasks.filter(st => allTaskIds.has(st.task_id));

            const totalWorkUnits = standaloneTasks.length + projectSubtasks.length;

            const approvedUnits = standaloneTasks.filter(t => t.status === 'approved').length + 
                                  projectSubtasks.filter(st => st.status === 'approved').length;

            const completedUnits = standaloneTasks.filter(t => t.status === 'completed').length + 
                                   projectSubtasks.filter(st => st.status === 'completed').length;
            
            const inProgressUnits = standaloneTasks.filter(t => ['in_progress', 'assigned'].includes(t.status)).length + 
                                    projectSubtasks.filter(st => ['in_progress', 'assigned'].includes(st.status)).length;
            
            const pendingUnits = standaloneTasks.filter(t => t.status === 'pending').length +
                                 projectSubtasks.filter(st => st.status === 'pending').length;

            const blockedUnits = standaloneTasks.filter(t => t.status === 'blocked').length + 
                                 projectSubtasks.filter(st => st.status === 'blocked').length;

            const inReviewUnits = standaloneTasks.filter(t => t.status === 'in_review').length + 
                                    projectSubtasks.filter(st => st.status === 'in_review').length;

            const returnedUnits = standaloneTasks.filter(t => t.status === 'returned').length + 
                                    projectSubtasks.filter(st => st.status === 'returned').length;

            const approvedPercentage = totalWorkUnits > 0 ? (approvedUnits / totalWorkUnits) * 100 : 0;
            const completedAndApprovedPercentage = totalWorkUnits > 0 ? ((approvedUnits + completedUnits) / totalWorkUnits) * 100 : 0;
            
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
                        involved_users: getUsersWithAccessToProject(project.id).map(u => u.id),
                        client_id: project.client_id ?? null,
                        budget_hours: project.budget_hours ?? null,
                        budget_amount: project.budget_amount ?? null,
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
                
                {(project.budget_hours != null && project.budget_hours > 0) && (() => {
                  const hoursConsumed = hoursConsumedByProject[project.id] ?? 0;
                  const percentConsumed = Math.round((hoursConsumed / project.budget_hours!) * 100);
                  const status = percentConsumed >= 100 ? 'over' : percentConsumed >= 80 ? 'warning' : 'ok';
                  return (
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-gray-600 flex items-center">
                        <Clock className="w-4 h-4 mr-1" />
                        Presupuesto: {hoursConsumed.toFixed(1)}h / {project.budget_hours}h
                      </span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        status === 'over' ? 'bg-red-100 text-red-700' :
                        status === 'warning' ? 'bg-amber-100 text-amber-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {percentConsumed}% consumido
                      </span>
                    </div>
                  );
                })()}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-700">Progreso (Aprobado)</span>
                    <span className="text-sm font-semibold text-emerald-600">{Math.round(approvedPercentage)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 relative">
                    {/* Ghost bar for completed */}
                    <div
                      className="bg-yellow-300 h-2.5 rounded-full absolute top-0 left-0 transition-all duration-500"
                      style={{ width: `${completedAndApprovedPercentage}%` }}
                      title={`${Math.round(completedAndApprovedPercentage)}% completado (pendiente de revisión)`}
                    ></div>
                    {/* Main bar for approved */}
                    <div
                      className="bg-emerald-500 h-2.5 rounded-full absolute top-0 left-0 transition-all duration-500"
                      style={{ width: `${approvedPercentage}%` }}
                      title={`${Math.round(approvedPercentage)}% aprobado`}
                    ></div>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div className="bg-emerald-50 p-2 rounded">
                    <span className="block text-lg font-bold text-emerald-600">{approvedUnits}</span>
                    <span className="text-xs text-gray-500">Aprobadas</span>
                  </div>
                  <div className="bg-blue-50 p-2 rounded">
                    <span className="block text-lg font-bold text-blue-600">{inProgressUnits}</span>
                    <span className="text-xs text-gray-500">En Progreso</span>
                  </div>
                  <div className="bg-yellow-50 p-2 rounded">
                    <span className="block text-lg font-bold text-yellow-600">{pendingUnits}</span>
                    <span className="text-xs text-gray-500">Pendientes</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded">
                    <span className="block text-lg font-bold text-slate-600">{completedUnits}</span>
                    <span className="text-xs text-gray-500">Completadas</span>
                  </div>
                  <div className="bg-red-50 p-2 rounded">
                    <span className="block text-lg font-bold text-red-600">{blockedUnits}</span>
                    <span className="text-xs text-gray-500">Bloqueadas</span>
                  </div>
                  <div className="bg-gray-100 p-2 rounded">
                    <span className="block text-lg font-bold text-gray-800">{totalWorkUnits}</span>
                    <span className="text-xs text-gray-500">Total</span>
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
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Tareas recientes ({totalWorkUnits})</h3>
                  {projectTasks.length > 0 ? (
                    <ul className="space-y-2">
                      {projectTasks.slice(0, 3).map(task => (
                        <li key={task.id} className="text-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center min-w-0 mr-2">
                              <div className={`w-2 h-2 rounded-full mr-2 flex-shrink-0 ${
                                task.priority === 'high' ? 'bg-red-500' :
                                task.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                              }`}></div>
                              <span className="truncate">{task.title}</span>
                            </div>
                            <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
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
                
                {/* Botón de archivar/desarchivar proyecto */}
                {isAdmin && (
                  <div className="mt-4 pt-4 border-t">
                    {showArchived ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('¿Estás seguro de que quieres desarchivar este proyecto? Volverá a aparecer en las vistas principales.')) {
                            handleUnarchiveProject(project.id);
                          }
                        }}
                        className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 hover:text-green-700 transition-colors"
                      >
                        <ArchiveRestore className="w-4 h-4 mr-2" />
                        Desarchivar Proyecto
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('¿Estás seguro de que quieres archivar este proyecto? Las tareas asociadas no se mostrarán en las vistas principales.')) {
                            handleArchiveProject(project.id);
                          }
                        }}
                        className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 hover:text-orange-700 transition-colors"
                      >
                        <Archive className="w-4 h-4 mr-2" />
                        Archivar Proyecto
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="col-span-full text-center py-12">
            <p className="text-gray-500">
              {showArchived ? 'No hay proyectos archivados.' : 'No se encontraron proyectos.'}
            </p>
            {!showArchived && isAdmin && (
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
                onClick={() => { setShowModal(false); setUseTemplateMode(false); setSelectedTemplateId(null); }}
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
              <div className="mb-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setUseTemplateMode(!useTemplateMode); if (!useTemplateMode) setSelectedTemplateId(null); }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm ${useTemplateMode ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}
                >
                  <FileStack className="w-4 h-4" />
                  Usar plantilla
                </button>
                {useTemplateMode && templates.length > 0 && (
                  <select
                    value={selectedTemplateId || ''}
                    onChange={(e) => setSelectedTemplateId(e.target.value || null)}
                    className="flex-1 p-2 border rounded-md text-sm"
                  >
                    <option value="">Seleccionar plantilla...</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({(t.tasks || []).length} tareas)
                      </option>
                    ))}
                  </select>
                )}
              </div>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cliente
                  </label>
                  <select
                    value={newProject.client_id || ''}
                    onChange={(e) => setNewProject({ ...newProject, client_id: e.target.value || null })}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="">Sin cliente</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Presupuesto (horas)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="Opcional"
                      value={newProject.budget_hours ?? ''}
                      onChange={(e) => setNewProject({ ...newProject, budget_hours: e.target.value ? parseFloat(e.target.value) : null })}
                      className="w-full p-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Presupuesto (monto €)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Opcional"
                      value={newProject.budget_amount ?? ''}
                      onChange={(e) => setNewProject({ ...newProject, budget_amount: e.target.value ? parseFloat(e.target.value) : null })}
                      className="w-full p-2 border rounded-md"
                    />
                  </div>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cliente
                  </label>
                  {editMode ? (
                    <select
                      value={editedProject.client_id || ''}
                      onChange={(e) => setEditedProject({ ...editedProject, client_id: e.target.value || null })}
                      className="w-full p-2 border rounded-md"
                      disabled={!isAdmin}
                    >
                      <option value="">Sin cliente</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="p-2 bg-gray-50 rounded-md">
                      {selectedProject.client_id
                        ? clients.find((c) => c.id === selectedProject.client_id)?.name || 'Cliente'
                        : 'Sin cliente'}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Presupuesto (horas)
                    </label>
                    {editMode ? (
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="Opcional"
                        value={editedProject.budget_hours ?? ''}
                        onChange={(e) => setEditedProject({ ...editedProject, budget_hours: e.target.value ? parseFloat(e.target.value) : null })}
                        className="w-full p-2 border rounded-md"
                        disabled={!isAdmin}
                      />
                    ) : (
                      <p className="p-2 bg-gray-50 rounded-md">
                        {selectedProject.budget_hours != null ? `${selectedProject.budget_hours} h` : 'Sin definir'}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Presupuesto (monto €)
                    </label>
                    {editMode ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Opcional"
                        value={editedProject.budget_amount ?? ''}
                        onChange={(e) => setEditedProject({ ...editedProject, budget_amount: e.target.value ? parseFloat(e.target.value) : null })}
                        className="w-full p-2 border rounded-md"
                        disabled={!isAdmin}
                      />
                    ) : (
                      <p className="p-2 bg-gray-50 rounded-md">
                        {selectedProject.budget_amount != null ? `€${selectedProject.budget_amount.toLocaleString()}` : 'Sin definir'}
                      </p>
                    )}
                  </div>
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
                
                {phases.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Fases del proyecto</h3>
                    <div className="flex flex-wrap gap-2">
                      {phases.map((p, i) => (
                        <span key={p.id} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {i + 1}. {p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {isAdmin && !editMode && (
                  <div className="mt-4 pt-4 border-t">
                    <button
                      type="button"
                      onClick={() => { setNewTemplateName(selectedProject.name); setShowCreateTemplateModal(true); }}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100"
                    >
                      <Copy className="w-4 h-4" />
                      Crear plantilla desde este proyecto
                    </button>
                  </div>
                )}
                {isAdmin && editMode && (
                  <>
                  <div className="mt-3 border-t pt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Fases del proyecto</label>
                    <p className="text-xs text-gray-500 mb-2">Define las fases (ej: Concepción, Captación, Calentamiento) para organizar las tareas.</p>
                    <div className="space-y-2 mb-3">
                      {phases.map((p, i) => (
                        <div key={p.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                          <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-500 w-6">{i + 1}.</span>
                          <input
                            type="text"
                            value={p.name}
                            onChange={(e) => {
                              const updated = [...phases];
                              updated[i] = { ...updated[i], name: e.target.value };
                              setPhases(updated);
                            }}
                            onBlur={async () => {
                              const { error: rpcError } = await supabase.rpc('update_phase', {
                                phase_id: p.id,
                                name: phases[i].name,
                                order: p.order,
                              });
                              if (rpcError) toast.error('Error al actualizar fase');
                            }}
                            className="flex-1 p-1.5 text-sm border rounded"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm('¿Eliminar esta fase? Las tareas quedarán sin fase.')) return;
                              const { error: rpcError } = await supabase.rpc('delete_phase', { phase_id: p.id });
                              if (rpcError) toast.error('Error al eliminar fase');
                              else setPhases(phases.filter((ph) => ph.id !== p.id));
                            }}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            title="Eliminar fase"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newPhaseName}
                        onChange={(e) => setNewPhaseName(e.target.value)}
                        placeholder="Nombre de la fase"
                        className="flex-1 p-2 text-sm border rounded-md"
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPhase())}
                      />
                      <button
                        type="button"
                        onClick={handleAddPhase}
                        disabled={!newPhaseName.trim()}
                        className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Añadir fase
                      </button>
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
                  </>
                )}
                
                {!editMode && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h3 className="text-lg font-medium text-gray-700 mb-4">Progreso del Proyecto</h3>
                    
                    {(() => {
                      const projectTasks = tasks.filter(t => t.project_id === selectedProject.id);
                      const allTaskIds = new Set(projectTasks.map(t => t.id));
                      
                      const standaloneTasks = projectTasks.filter(t => !subtasks.some(st => st.task_id === t.id));
                      const projectSubtasks = subtasks.filter(st => allTaskIds.has(st.task_id));

                      const totalWorkUnits = standaloneTasks.length + projectSubtasks.length;

                      const approvedUnits = standaloneTasks.filter(t => t.status === 'approved').length + 
                                            projectSubtasks.filter(st => st.status === 'approved').length;
                      const completedUnits = standaloneTasks.filter(t => t.status === 'completed').length + 
                                             projectSubtasks.filter(st => st.status === 'completed').length;
                      const inReviewUnits = standaloneTasks.filter(t => t.status === 'in_review').length + 
                                            projectSubtasks.filter(st => st.status === 'in_review').length;
                      const returnedUnits = standaloneTasks.filter(t => t.status === 'returned').length + 
                                            projectSubtasks.filter(st => st.status === 'returned').length;
                      const blockedUnits = standaloneTasks.filter(t => t.status === 'blocked').length + 
                                           projectSubtasks.filter(st => st.status === 'blocked').length;

                      const pendingUnits = totalWorkUnits - approvedUnits - completedUnits - inReviewUnits - returnedUnits - blockedUnits;

                      const approvedPercentage = totalWorkUnits > 0 ? (approvedUnits / totalWorkUnits) * 100 : 0;
                      const completedAndApprovedPercentage = totalWorkUnits > 0 ? ((approvedUnits + completedUnits) / totalWorkUnits) * 100 : 0;
                      
                      return (
                        <>
                          <div className="mb-6">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-sm font-medium text-gray-700">Progreso General</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-4 relative">
                              <div
                                className="bg-yellow-300 h-4 rounded-full absolute top-0 left-0 flex items-center justify-end px-2 transition-all duration-500"
                                style={{ width: `${completedAndApprovedPercentage}%` }}
                              >
                                <span className="text-xs font-medium text-yellow-800">{Math.round(completedAndApprovedPercentage)}%</span>
                              </div>
                              <div
                                className="bg-emerald-500 h-4 rounded-full absolute top-0 left-0 flex items-center justify-end px-2 transition-all duration-500"
                                style={{ width: `${approvedPercentage}%` }}
                              >
                                <span className="text-xs font-bold text-white">{Math.round(approvedPercentage)}%</span>
                              </div>
                            </div>
                             <div className="flex justify-between mt-1 text-xs">
                              <span className="text-yellow-600">Completado</span>
                              <span className="text-emerald-600 font-semibold">Aprobado</span>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4 mb-6">
                            <div className="bg-emerald-50 p-4 rounded-lg text-center">
                              <span className="block text-2xl font-bold text-emerald-600">{approvedUnits}</span>
                              <span className="text-sm text-emerald-700">Aprobadas</span>
                            </div>
                            <div className="bg-yellow-50 p-4 rounded-lg text-center">
                              <span className="block text-2xl font-bold text-yellow-600">{completedUnits}</span>
                              <span className="text-sm text-yellow-700">Completadas</span>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg text-center">
                              <span className="block text-2xl font-bold text-gray-600">{totalWorkUnits}</span>
                              <span className="text-sm text-gray-700">Total Tareas</span>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-4 mb-6">
                             <div className="bg-blue-50 p-4 rounded-lg text-center">
                              <span className="block text-2xl font-bold text-blue-600">{inReviewUnits}</span>
                              <span className="text-sm text-blue-700">En Revisión</span>
                            </div>
                            <div className="bg-orange-50 p-4 rounded-lg text-center">
                              <span className="block text-2xl font-bold text-orange-600">{returnedUnits}</span>
                              <span className="text-sm text-orange-700">Devueltas</span>
                            </div>
                             <div className="bg-red-50 p-4 rounded-lg text-center">
                              <span className="block text-2xl font-bold text-red-600">{blockedUnits + pendingUnits < 0 ? 0 : blockedUnits + pendingUnits}</span>
                              <span className="text-sm text-red-700">Pendientes</span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
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
                  {tasks.filter(t => t.project_id === selectedProject.id).length > 0 ? (
                    <div className="space-y-3">
                      {tasks.filter(t => t.project_id === selectedProject.id).map(task => (
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

      {showCreateTemplateModal && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Crear plantilla desde proyecto</h3>
            <p className="text-sm text-gray-600 mb-4">
              Se guardará la estructura de tareas y subtareas de &quot;{selectedProject.name}&quot; como plantilla reutilizable.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la plantilla</label>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder={selectedProject.name + ' (plantilla)'}
                className="w-full p-2 border rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowCreateTemplateModal(false); setNewTemplateName(''); }}
                className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateTemplateFromProject}
                className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
              >
                Crear plantilla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Projects; 