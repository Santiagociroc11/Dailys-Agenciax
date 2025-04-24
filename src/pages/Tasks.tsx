import React from 'react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, X, Users, Clock, ChevronUp, ChevronDown, FolderOpen } from 'lucide-react';
import { format } from 'date-fns';
import TaskStatusDisplay from '../components/TaskStatusDisplay';


interface Task {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  deadline: string;
  estimated_duration: number;
  priority: 'low' | 'medium' | 'high';
  is_sequential: boolean;
  created_at: string;
  created_by: string;
  project_id: string | null;
  status?: string;
  assigned_to?: string;
  assigned_users?: string[];
}

interface Subtask {
  id: string;
  title: string;
  description: string | null;
  estimated_duration: number;
  sequence_order: number | null;
  assigned_to: string;
  status: 'pending' | 'in_progress' | 'completed' | 'approved';
  task_id: string;
  start_date: string | null;
  deadline: string | null;
  created_by?: string;
  created_at?: string;
}

interface User {
  id: string;
  email: string;
  name?: string;
  assigned_projects?: string[];
}

interface NewTask {
  title: string;
  description: string;
  start_date: string;
  deadline: string;
  estimated_duration: number;
  priority: 'low' | 'medium' | 'high';
  is_sequential: boolean;
  assigned_to: string[];
  subtasks: {
    title: string;
    description: string;
    estimated_duration: number;
    assigned_to: string;
    start_date: string;
    deadline: string;
  }[];
  project_id: string | null;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  start_date?: string;
  deadline?: string;
  created_by?: string;
  created_at?: string;
}

function Tasks() {
  const { isAdmin, user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasks, setSubtasks] = useState<Record<string, Subtask[]>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [showSubtaskDetailModal, setShowSubtaskDetailModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedSubtask, setSelectedSubtask] = useState<Subtask | null>(null);
  const [editedTask, setEditedTask] = useState<any>(null);
  const [editedSubtask, setEditedSubtask] = useState<any>(null);
  const [editedSubtasks, setEditedSubtasks] = useState<Record<string, any>>({});
  const [editMode, setEditMode] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  });
  const [newTask, setNewTask] = useState<NewTask>({
    title: '',
    description: '',
    start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    estimated_duration: 30,
    priority: 'medium',
    is_sequential: false,
    assigned_to: [],
    subtasks: [],
    project_id: null,
  });
  const [error, setError] = useState('');
  const [projectSelected, setProjectSelected] = useState(false);
  const [selectedProjectDates, setSelectedProjectDates] = useState<{
    start_date: string;
    deadline: string;
  } | null>(null);

  useEffect(() => {
    fetchTasks();
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [selectedProject]);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, email, assigned_projects, name');

        if (usersError) throw usersError;
        setUsers(usersData || []);
      } catch (error) {
        console.error('Error al cargar usuarios:', error);
      }
    }

    if (isAdmin) {
      fetchUsers();
    }
    fetchSubtasks();
  }, [isAdmin]);

  async function fetchProjects() {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error al cargar los proyectos:', error);
    }
  }

  async function fetchTasks() {
    try {
      let query = supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (selectedProject) {
        query = query.eq('project_id', selectedProject);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error al cargar las tareas:', error);
    } finally {
      setLoading(false);
      }
    }

    async function fetchSubtasks() {
      try {
        console.log('Fetching subtasks...');
        const { data: subtasksData, error: subtasksError } = await supabase
          .from('subtasks')
          .select('*');

        if (subtasksError) {
          console.error('Error fetching subtasks:', subtasksError);
          throw subtasksError;
        }

        console.log('Subtasks data received:', subtasksData);
      const groupedSubtasks = (subtasksData || []).reduce((acc: Record<string, Subtask[]>, subtask: Subtask) => {
          acc[subtask.task_id] = [...(acc[subtask.task_id] || []), subtask];
          return acc;
        }, {} as Record<string, Subtask[]>);
        console.log('Grouped subtasks:', groupedSubtasks);
        setSubtasks(groupedSubtasks);
      } catch (error) {
        console.error('Error al cargar subtareas:', error);
      }
    }

  useEffect(() => {
    if (newTask.subtasks.length > 0) {
      const totalDuration = newTask.subtasks.reduce(
        (sum, subtask) => sum + (subtask.estimated_duration || 0), 
        0
      );
      setNewTask(prev => ({
        ...prev,
        estimated_duration: totalDuration
      }));
    }
  }, [newTask.subtasks]);

  useEffect(() => {
    // Only update main task assignees from subtasks if subtasks exist
    if (newTask.subtasks.length > 0) {
      const assignedUsers = [...new Set(
        newTask.subtasks
          .map(subtask => subtask.assigned_to)
          .filter(userId => userId)
      )];
      
      setNewTask(prev => ({
        ...prev,
        assigned_to: assignedUsers
      }));
    }
    // If no subtasks, don't automatically clear assigned_to 
    // else {
    //   setNewTask(prev => ({ ...prev, assigned_to: [] }));
    // }
  }, [newTask.subtasks]);

  // Función para obtener los usuarios disponibles para un proyecto específico
  function getAvailableUsers(projectId: string | null): User[] {
    if (!projectId) return users;
    
    // El creador del proyecto
    const projectCreatorId = projects.find(p => p.id === projectId)?.created_by;
    
    // Usuarios que tienen asignado este proyecto en su array de assigned_projects
    return users.filter(u => 
      u.assigned_projects?.includes(projectId) || 
      u.id === projectCreatorId
    );
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError('');

    // Validar que se haya seleccionado un proyecto
    if (!newTask.project_id) {
      setError('Debes seleccionar un proyecto antes de crear una tarea.');
      return;
    }

    // Validation: Prevent multiple assignees if no subtasks
    if (newTask.subtasks.length === 0 && newTask.assigned_to.length > 1) {
      setError('Las tareas principales sin subtareas solo pueden tener un usuario asignado. Para asignar múltiples usuarios, crea subtareas individuales para cada responsabilidad específica. En caso de reuniones o decisiones conjuntas, asigna un responsable principal que coordine la actividad.');
      return;
    }

    try {
      let taskToCreate = { ...newTask };
      
      // --- Determine final assigned users based on subtasks presence --- 
      let finalAssignedUsers: string[];

      if (taskToCreate.subtasks.length > 0) {
        // Logic when subtasks exist (current behavior)
        const assignedSubtaskUsers = [...new Set(
          taskToCreate.subtasks
            .map(subtask => subtask.assigned_to)
            .filter(userId => userId && userId.trim() !== '')
        )];
        finalAssignedUsers = assignedSubtaskUsers.length > 0 ? assignedSubtaskUsers : [user.id]; // Default to creator if no one assigned in subtasks
        
        // Adjust main task start/end dates based on subtasks
        const earliestStart = taskToCreate.subtasks.reduce(
          (earliest, subtask) => {
            if (!subtask.start_date) return earliest;
            return subtask.start_date < earliest ? subtask.start_date : earliest;
          },
          taskToCreate.subtasks[0]?.start_date || taskToCreate.start_date
        );
        
        const latestDeadline = taskToCreate.subtasks.reduce(
          (latest, subtask) => {
            if (!subtask.deadline) return latest;
            return subtask.deadline > latest ? subtask.deadline : latest;
          },
          taskToCreate.subtasks[0]?.deadline || taskToCreate.deadline
        );
        
        // Update taskToCreate with adjusted dates
        taskToCreate = {
          ...taskToCreate,
          start_date: earliestStart,
          deadline: latestDeadline
        };
      } else {
        // Logic when NO subtasks exist 
        finalAssignedUsers = taskToCreate.assigned_to.length === 1
          ? [taskToCreate.assigned_to[0]] // Use the single selected user
          : [user.id]; // Default to creator if none selected (or multiple were erroneously selected before validation)
      }

      // --- Construct final task data for insertion ---
      const taskData = {
        title: taskToCreate.title,
        description: taskToCreate.description,
        start_date: taskToCreate.start_date,
        deadline: taskToCreate.deadline,
        estimated_duration: taskToCreate.estimated_duration,
        priority: taskToCreate.priority,
        is_sequential: taskToCreate.is_sequential,
        created_by: user.id,
        assigned_users: finalAssignedUsers, // Use the determined assignees
        project_id: taskToCreate.project_id
      };

      console.log("Enviando datos de tarea:", taskData);

      const { data, error } = await supabase
        .from('tasks')
        .insert([taskData])
        .select();
      
      if (error) {
        console.error("Error detallado:", error);
        throw error;
      }
      
      if (data && data[0]) {
        const taskId = data[0].id;
        
        if (newTask.subtasks.length > 0) {
          const subtasksToInsert = newTask.subtasks.map((subtask, index) => {
            const assignedTo = subtask.assigned_to && subtask.assigned_to.trim() !== '' 
              ? subtask.assigned_to 
              : user.id;
            
            return {
            task_id: taskId,
            title: subtask.title,
              description: subtask.description || '',
              estimated_duration: subtask.estimated_duration || 0,
              sequence_order: index + 1,
              assigned_to: assignedTo,
              status: 'pending',
              start_date: subtask.start_date || null,
              deadline: subtask.deadline || null
            };
          });

          console.log("Enviando datos de subtareas:", subtasksToInsert);

          const { error: subtaskError } = await supabase
            .from('subtasks')
            .insert(subtasksToInsert);

          if (subtaskError) {
            console.error("Error detallado de subtareas:", subtaskError);
            throw subtaskError;
          }
        }

        await fetchTasks();
        await fetchSubtasks();

      setTasks([...(data || []), ...tasks]);
      setShowModal(false);
      setNewTask({
        title: '',
        description: '',
        start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        estimated_duration: 30,
        priority: 'medium',
        is_sequential: false,
          assigned_to: [],
        subtasks: [],
          project_id: null,
      });
      }
    } catch (error) {
      console.error('Error al crear la tarea:', error);
      setError('Error al crear la tarea. Por favor, inténtalo de nuevo.');
    }
  }

  async function handleStatusUpdate(subtaskId: string, newStatus: 'pending' | 'in_progress' | 'completed' | 'approved') {
    try {
      console.log('Updating subtask status:', { subtaskId, newStatus });
      
      // Primero, obtener la subtarea para conocer su task_id
      const { data: subtaskData, error: subtaskFetchError } = await supabase
        .from('subtasks')
        .select(`*, tasks(project_id)`)
        .eq('id', subtaskId)
        .single();
        
      if (subtaskFetchError) {
        console.error('Error fetching subtask info:', subtaskFetchError);
        throw subtaskFetchError;
      }
      
      if (!subtaskData?.tasks?.project_id) {
        console.error('No se encontró el project_id para esta subtarea');
        throw new Error('No se encontró el project_id para esta subtarea');
      }
      
      // Actualizar el estado con el filtro de task_id (que indirectamente filtra por proyecto)
      const { error } = await supabase
        .from('subtasks')
        .update({ status: newStatus })
        .eq('id', subtaskId)
        .eq('task_id', subtaskData.task_id);

      if (error) {
        console.error('Error updating subtask status:', error);
        throw error;
      }
      console.log('Status updated successfully');
      await fetchSubtasks();
    } catch (error) {
      console.error('Error al actualizar el estado:', error);
    }
  }

  async function handleUpdateTask() {
    if (!selectedTask || !editedTask) return;
    
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          title: editedTask.title,
          description: editedTask.description,
          start_date: editedTask.start_date,
          deadline: editedTask.deadline,
          estimated_duration: editedTask.estimated_duration,
          priority: editedTask.priority,
          is_sequential: editedTask.is_sequential,
          project_id: editedTask.project_id,
          assigned_users: editedTask.assigned_users
        })
        .eq('id', selectedTask.id);
      
      if (error) {
        console.error("Error al actualizar la tarea:", error);
        throw error;
      }
      
      await fetchTasks();
      setShowTaskDetailModal(false);
    } catch (error) {
      console.error('Error al actualizar la tarea:', error);
      setError('Error al actualizar la tarea. Por favor, inténtalo de nuevo.');
    }
  }
  
  async function handleUpdateSubtask() {
    if (!selectedSubtask || !editedSubtask) return;
    
    try {
        const { error } = await supabase
          .from('subtasks')
        .update({
          title: editedSubtask.title,
          description: editedSubtask.description,
          estimated_duration: editedSubtask.estimated_duration,
          sequence_order: editedSubtask.sequence_order,
          assigned_to: editedSubtask.assigned_to,
          start_date: editedSubtask.start_date,
          deadline: editedSubtask.deadline,
          status: editedSubtask.status
        })
        .eq('id', selectedSubtask.id);

        if (error) {
        console.error("Error al actualizar la subtarea:", error);
          throw error;
        }
      
      await fetchSubtasks();
      setShowSubtaskDetailModal(false);
    } catch (error) {
      console.error('Error al actualizar la subtarea:', error);
      setError('Error al actualizar la subtarea. Por favor, inténtalo de nuevo.');
    }
  }
  
  async function handleDeleteTask() {
    if (!selectedTask) return;
    
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta tarea y todas sus subtareas? Esta acción no se puede deshacer.')) {
      return;
    }
    
    try {
      const { error: subtasksError } = await supabase
        .from('subtasks')
        .delete()
        .eq('task_id', selectedTask.id);
      
      if (subtasksError) {
        console.error("Error al eliminar subtareas:", subtasksError);
        throw subtasksError;
      }
      
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', selectedTask.id);
      
      if (error) {
        console.error("Error al eliminar la tarea:", error);
        throw error;
      }
      
      await fetchTasks();
      await fetchSubtasks();
      setShowTaskDetailModal(false);
    } catch (error) {
      console.error('Error al eliminar la tarea:', error);
      setError('Error al eliminar la tarea. Por favor, inténtalo de nuevo.');
    }
  }
  
  async function handleDeleteSubtask() {
    if (!selectedSubtask) return;
    
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta subtarea? Esta acción no se puede deshacer.')) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from('subtasks')
        .delete()
        .eq('id', selectedSubtask.id);
      
      if (error) {
        console.error("Error al eliminar la subtarea:", error);
        throw error;
      }
      
      await fetchSubtasks();
      setShowSubtaskDetailModal(false);
    } catch (error) {
      console.error('Error al eliminar la subtarea:', error);
      setError('Error al eliminar la subtarea. Por favor, inténtalo de nuevo.');
    }
  }

  async function handleCompleteTaskUpdate() {
    if (!selectedTask || !editedTask) return;
    
    try {
      const { error: taskError } = await supabase
        .from('tasks')
        .update({
          title: editedTask.title,
          description: editedTask.description,
          start_date: editedTask.start_date,
          deadline: editedTask.deadline,
          estimated_duration: editedTask.estimated_duration,
          priority: editedTask.priority,
          is_sequential: editedTask.is_sequential,
          project_id: editedTask.project_id
        })
        .eq('id', selectedTask.id);
      
      if (taskError) {
        console.error("Error al actualizar la tarea:", taskError);
        throw taskError;
      }
      
      const subtasksToUpdate = Object.entries(editedSubtasks).map(([id, data]) => ({
        id,
        sequence_order: data.sequence_order,
        assigned_to: data.assigned_to
      }));
      
      for (const subtask of subtasksToUpdate) {
        const { error: subtaskError } = await supabase
          .from('subtasks')
          .update({
            sequence_order: subtask.sequence_order,
            assigned_to: subtask.assigned_to
          })
          .eq('id', subtask.id);
        
        if (subtaskError) {
          console.error(`Error al actualizar la subtarea ${subtask.id}:`, subtaskError);
          throw subtaskError;
        }
      }
      
      await fetchTasks();
      await fetchSubtasks();
      setShowTaskDetailModal(false);
      setEditMode(false);
      setEditedSubtasks({});
      
    } catch (error) {
      console.error('Error al actualizar la tarea y subtareas:', error);
      setError('Error al actualizar. Por favor, inténtalo de nuevo.');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const getPriorityText = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'Alta';
      case 'medium':
        return 'Media';
      case 'low':
        return 'Baja';
      default:
        return priority;
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tareas</h1>
          <p className="text-gray-600">Gestiona tus tareas y asignaciones</p>
        </div>
        <div className="flex gap-2">
        {isAdmin && (
            <>
 
          <button
            onClick={() => {
              console.log('Opening modal, current state:', {
                showModal: false,
                newTask,
                users,
              });
              setShowModal(true);
              console.log('Modal opened, new state:', {
                showModal: true,
                newTask,
                users,
              });
            }}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Nueva Tarea
          </button>
            </>
          )}
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm font-medium text-gray-700">Filtrar por proyecto:</label>
          <select
            value={selectedProject || ''}
            onChange={(e) => {
              setSelectedProject(e.target.value || null);
            }}
            className="p-2 border rounded-md"
          >
            <option value="">Todos los proyectos</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setSelectedProject(null);
              fetchTasks();
            }}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            Limpiar filtro
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        {tasks.length > 0 ? (
          tasks.map((task) => (
          <div
            key={task.id}
            className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <h2 
                    className="text-lg font-semibold text-gray-900 cursor-pointer hover:text-indigo-600"
                    onClick={() => {
                      setSelectedTask(task);
                      setEditedTask({
                        title: task.title,
                        description: task.description || '',
                        start_date: task.start_date ? task.start_date.replace(" ", "T").substring(0, 16) : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                        deadline: task.deadline ? task.deadline.replace(" ", "T").substring(0, 16) : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                        estimated_duration: task.estimated_duration,
                        priority: task.priority,
                        is_sequential: task.is_sequential,
                        project_id: task.project_id || null,
                        status: task.status,
                        created_by: task.created_by,
                        created_at: task.created_at,
                        assigned_to: task.assigned_to,
                        assigned_users: task.assigned_users
                      });
                      setShowTaskDetailModal(true);
                    }}
                  >
                    {task.title}
                  </h2>
                  {task.project_id && (
                    <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                      {projects.find(p => p.id === task.project_id)?.name}
                    </span>
                  )}
                </div>
              <span className={`px-2 py-1 rounded text-sm ${
                task.priority === 'high' 
                  ? 'bg-red-100 text-red-800'
                  : task.priority === 'medium'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-green-100 text-green-800'
              }`}>
                {getPriorityText(task.priority)}
              </span>
            </div>
            {task.description && (
              <p className="text-gray-600 mb-3">{task.description}</p>
            )}
              <div className="flex items-center text-sm text-gray-500 mb-3">
              <span>Fecha límite: {new Date(task.deadline).toLocaleDateString()}</span>
              <span className="mx-2">•</span>
              <span>{task.estimated_duration} minutos</span>
              {task.is_sequential && (
                <>
                  <span className="mx-2">•</span>
                  <span>Secuencial</span>
                </>
              )}
            </div>
            
            {/* Mostrar usuarios asignados a la tarea principal */}
            <div className="flex items-center mb-3">
              <Users className="w-4 h-4 mr-1 text-indigo-500" />
              <span className="text-sm text-gray-600 mr-1">Asignados:</span>
              {task.assigned_users ? (
                <div className="flex flex-wrap gap-1">
                  {Array.isArray(task.assigned_users) ? 
                    task.assigned_users.map(userId => (
                      <span key={userId} className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded text-xs">
                        {users.find(u => u.id === userId)?.name || userId}
                      </span>
                    ))
                    : 
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded text-xs">
                      {users.find(u => u.id === String(task.assigned_users))?.name || task.assigned_users}
                    </span>
                  }
                </div>
              ) : task.assigned_to ? (
                <div className="flex flex-wrap gap-1">
                  {Array.isArray(task.assigned_to) ? 
                    task.assigned_to.map(userId => (
                      <span key={userId} className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded text-xs">
                        {users.find(u => u.id === userId)?.name || userId}
                      </span>
                    ))
                    : 
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded text-xs">
                      {users.find(u => u.id === String(task.assigned_to))?.name || task.assigned_to}
                    </span>
                  }
                </div>
              ) : (
                <span className="text-xs text-gray-500">Sin asignaciones</span>
              )}
            </div>
              
              {subtasks[task.id]?.length > 0 && (
                <div className="mt-2">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Subtareas:</h3>
                  <div className="space-y-2 pl-4 border-l-2 border-indigo-100">
                          {subtasks[task.id]
                            .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))
                      .map((subtask, index) => {
                        const canUpdateStatus = !isAdmin && (subtask.assigned_to === user?.id);
                        const isAssignedToCurrentUser = subtask.assigned_to === user?.id;
                        
                        return (
                          <div
                            key={subtask.id}
                            className={`bg-gray-50 p-3 rounded-md transition-all ${
                              isAssignedToCurrentUser ? 'border-l-4 border-indigo-400' : ''
                            }`}
                          >
                            <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                <div className="flex items-center mb-1">
                                  {task.is_sequential && subtask.sequence_order && (
                                    <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded mr-2">
                                      Orden: {subtask.sequence_order}
                                    </span>
                                  )}
                                  <h4 
                                    className="font-medium cursor-pointer hover:text-indigo-600"
                                    onClick={() => {
                                      setSelectedSubtask(subtask);
                                      setEditedSubtask({
                                        title: subtask.title,
                                        description: subtask.description || '',
                                        estimated_duration: subtask.estimated_duration,
                                        sequence_order: subtask.sequence_order || 0,
                                        assigned_to: subtask.assigned_to || '',
                                        status: subtask.status || 'pending',
                                        start_date: subtask.start_date ? subtask.start_date.replace(" ", "T").substring(0, 16) : null,
                                        deadline: subtask.deadline ? subtask.deadline.replace(" ", "T").substring(0, 16) : null,
                                        task_id: subtask.task_id,
                                        created_by: subtask.created_by,
                                        created_at: subtask.created_at
                                      });
                                      setShowSubtaskDetailModal(true);
                                    }}
                                  >
                                    {subtask.title}
                                  </h4>
                                </div>
                                
                                      {subtask.description && (
                                  <p className="text-sm text-gray-600 mt-1">{subtask.description}</p>
                                )}
                                
                                <div className="flex flex-wrap items-center text-xs text-gray-500 mt-2 gap-x-3 gap-y-1">
                                  <div className="flex items-center">
                                    <Clock className="w-3 h-3 mr-1" />
                                    <span>{subtask.estimated_duration} min</span>
                                  </div>
                                  
                                  {subtask.start_date && (
                                    <div className="flex items-center">
                                      <span>Inicio: {new Date(subtask.start_date).toLocaleDateString()}</span>
                                    </div>
                                  )}
                                  
                                  {subtask.deadline && (
                                    <div className="flex items-center">
                                      <span>Fin: {new Date(subtask.deadline).toLocaleDateString()}</span>
                                      </div>
                                  )}
                                  
                                  <div className="flex items-center">
                                    <span className={`font-medium ${
                                      subtask.status === 'completed' || subtask.status === 'approved' ? 'text-green-600' : 
                                      subtask.status === 'in_progress' ? 'text-blue-600' : 'text-gray-600'
                                    }`}>
                                      {subtask.status === 'completed' || subtask.status === 'approved' ? 'Completada' : 
                                       subtask.status === 'in_progress' ? 'En progreso' : 'Pendiente'}
                                    </span>
                                    </div>
                                  
                                  <div className="flex items-center text-indigo-600">
                                    <span>Asignada a: {users.find(u => u.id === subtask.assigned_to)?.name || 'No asignada'}</span>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center">
                                {task.is_sequential && isAdmin && (
                                  <div className="flex flex-col mr-2">
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          console.log('Moviendo subtarea hacia arriba:', subtask.id);
                                          
                                          const orderedSubtasks = [...subtasks[task.id]].sort(
                                            (a, b) => (a.sequence_order || 0) - (b.sequence_order || 0)
                                          );
                                          
                                          const currentIndex = orderedSubtasks.findIndex(s => s.id === subtask.id);
                                          
                                          if (currentIndex <= 0) {
                                            console.log('Ya es la primera subtarea');
                                            return;
                                          }
                                          
                                          const prevSubtask = orderedSubtasks[currentIndex - 1];
                                          
                                          console.log('Intercambiando con:', prevSubtask.id);
                                          console.log('Órdenes actuales:', {
                                            actual: subtask.sequence_order,
                                            anterior: prevSubtask.sequence_order
                                          });
                                          
                                          const tempOrder = -999;
                                          const currentOrder = subtask.sequence_order || 0;
                                          const prevOrder = prevSubtask.sequence_order || 0;
                                          
                                          await supabase
                                            .from('subtasks')
                                            .update({ sequence_order: tempOrder })
                                            .eq('id', subtask.id);
                                          
                                          await supabase
                                            .from('subtasks')
                                            .update({ sequence_order: currentOrder })
                                            .eq('id', prevSubtask.id);
                                          
                                          await supabase
                                            .from('subtasks')
                                            .update({ sequence_order: prevOrder })
                                            .eq('id', subtask.id);
                                          
                                          console.log('Intercambio finalizado');
                                          
                                          await fetchSubtasks();
                                        } catch (error) {
                                          console.error('Error al mover la subtarea:', error);
                                        }
                                      }}
                                      className="text-gray-500 hover:text-gray-700 disabled:opacity-50 p-1"
                                      disabled={index === 0}
                                    >
                                      <ChevronUp className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          console.log('Moviendo subtarea hacia abajo:', subtask.id);
                                          
                                          const orderedSubtasks = [...subtasks[task.id]].sort(
                                            (a, b) => (a.sequence_order || 0) - (b.sequence_order || 0)
                                          );
                                          
                                          const currentIndex = orderedSubtasks.findIndex(s => s.id === subtask.id);
                                          
                                          if (currentIndex === -1 || currentIndex >= orderedSubtasks.length - 1) {
                                            console.log('Ya es la última subtarea');
                                            return;
                                          }
                                          
                                          const nextSubtask = orderedSubtasks[currentIndex + 1];
                                          
                                          console.log('Intercambiando con:', nextSubtask.id);
                                          console.log('Órdenes actuales:', {
                                            actual: subtask.sequence_order,
                                            siguiente: nextSubtask.sequence_order
                                          });
                                          
                                          const tempOrder = 9999;
                                          const currentOrder = subtask.sequence_order || 0;
                                          const nextOrder = nextSubtask.sequence_order || 0;
                                          
                                          await supabase
                                            .from('subtasks')
                                            .update({ sequence_order: tempOrder })
                                            .eq('id', subtask.id);
                                          
                                          await supabase
                                            .from('subtasks')
                                            .update({ sequence_order: currentOrder })
                                            .eq('id', nextSubtask.id);
                                          
                                          await supabase
                                            .from('subtasks')
                                            .update({ sequence_order: nextOrder })
                                            .eq('id', subtask.id);
                                          
                                          console.log('Intercambio finalizado');
                                          
                                          await fetchSubtasks();
                                        } catch (error) {
                                          console.error('Error al mover la subtarea:', error);
                                        }
                                      }}
                                      className="text-gray-500 hover:text-gray-700 disabled:opacity-50 p-1"
                                      disabled={index === subtasks[task.id].length - 1}
                                    >
                                      <ChevronDown className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                                
                                {canUpdateStatus && (
                                      <select
                                        value={subtask.status}
                                        onChange={(e) => handleStatusUpdate(subtask.id, e.target.value as 'pending' | 'in_progress' | 'completed')}
                                    className="ml-2 text-sm border rounded-md px-2 py-1"
                                      >
                                        <option value="pending">Pendiente</option>
                                        <option value="in_progress">En Progreso</option>
                                        <option value="completed">Completada</option>
                                        <option value="approved">Aprobada</option>
                                      </select>
                                    )}
                                
                                {isAdmin && (
                                  <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                                    subtask.status === 'completed' || subtask.status === 'approved' ? 'bg-green-100 text-green-800' : 
                                    subtask.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {subtask.status === 'completed' || subtask.status === 'approved' ? 'Completada' : 
                                     subtask.status === 'in_progress' ? 'En progreso' : 'Pendiente'}
                                  </span>
                                    )}
                                  </div>
                                </div>
                        </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {selectedProject 
                ? "No se encontraron tareas para este proyecto" 
                : "No se encontraron tareas"}
            </p>
          </div>
        )}
      </div>


      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">Crear Nueva Tarea</h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setProjectSelected(false);
                  setNewTask({
                    title: '',
                    description: '',
                    start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                    deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                    estimated_duration: 30,
                    priority: 'medium',
                    is_sequential: false,
                    assigned_to: [],
                    subtasks: [],
                    project_id: null,
                  });
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="p-6 overflow-y-auto">
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                  {error}
                </div>
              )}
              
              <div className="space-y-4">
                {!projectSelected ? (
                  <div className="bg-indigo-50 p-6 rounded-lg border border-indigo-100">
                    <h3 className="text-lg font-medium text-indigo-700 mb-4">Selecciona un proyecto</h3>
                    <p className="text-sm text-indigo-600 mb-4">Para comenzar, selecciona el proyecto al que pertenecerá esta tarea.</p>
                    
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Proyecto <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={newTask.project_id || ''}
                        onChange={(e) => {
                          const projectId = e.target.value || null;
                          setNewTask({ ...newTask, project_id: projectId });
                          
                          if (projectId) {
                            const selectedProject = projects.find(p => p.id === projectId);
                            if (selectedProject) {
                              // Ajustar fechas de la tarea según el proyecto
                              const projectStartDate = selectedProject.start_date || format(new Date(), "yyyy-MM-dd'T'HH:mm");
                              const projectEndDate = selectedProject.deadline || format(new Date(), "yyyy-MM-dd'T'HH:mm");
                              
                              setSelectedProjectDates({
                                start_date: projectStartDate.replace(" ", "T").substring(0, 16),
                                deadline: projectEndDate.replace(" ", "T").substring(0, 16)
                              });
                              
                              setNewTask(prev => ({
                                ...prev,
                                start_date: projectStartDate.replace(" ", "T").substring(0, 16),
                                deadline: projectEndDate.replace(" ", "T").substring(0, 16)
                              }));
                            }
                          } else {
                            setSelectedProjectDates(null);
                          }
                        }}
                        className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        required
                      >
                        <option value="">Seleccionar proyecto</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          if (!newTask.project_id) {
                            setError('Debes seleccionar un proyecto antes de continuar.');
                            return;
                          }
                          setProjectSelected(true);
                          setError('');
                        }}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center"
                      >
                        Continuar
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="bg-gray-50 p-3 rounded-lg mb-4 flex items-center justify-between">
                      <div className="flex items-center">
                        <FolderOpen className="w-5 h-5 text-indigo-600 mr-2" />
                        <span className="font-medium">Proyecto seleccionado: </span>
                        <span className="ml-2">{projects.find(p => p.id === newTask.project_id)?.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setProjectSelected(false);
                        }}
                        className="text-sm text-indigo-600 hover:text-indigo-800"
                      >
                        Cambiar
                      </button>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Título <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newTask.title}
                        onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                        className="w-full p-2 border rounded-md"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Descripción
                      </label>
                      <textarea
                        value={newTask.description}
                        onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                        className="w-full p-2 border rounded-md"
                        rows={3}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Fecha de inicio <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="datetime-local"
                          value={newTask.start_date}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            setNewTask({ ...newTask, start_date: newValue });
                            
                            // Cerrar automáticamente el datepicker ajustando el foco
                            e.target.blur();
                          }}
                          className="w-full p-2 border rounded-md"
                          min={selectedProjectDates?.start_date}
                          max={selectedProjectDates?.deadline}
                          required
                        />
                        {selectedProjectDates && (
                          <p className="text-xs text-gray-500 mt-1">
                            Debe estar entre {new Date(selectedProjectDates.start_date).toLocaleString()} y {new Date(selectedProjectDates.deadline).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Fecha límite <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="datetime-local"
                          value={newTask.deadline}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            setNewTask({ ...newTask, deadline: newValue });
                            
                            // Cerrar automáticamente el datepicker ajustando el foco
                            e.target.blur();
                          }}
                          className="w-full p-2 border rounded-md"
                          min={newTask.start_date}
                          max={selectedProjectDates?.deadline}
                          required
                        />
                        {selectedProjectDates && (
                          <p className="text-xs text-gray-500 mt-1">
                            No puede ser posterior a {new Date(selectedProjectDates.deadline).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Duración estimada (minutos) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          value={newTask.estimated_duration}
                          onChange={(e) => setNewTask({ ...newTask, estimated_duration: Number(e.target.value) })}
                          className="w-full p-2 border rounded-md"
                          min="1"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Prioridad <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={newTask.priority}
                          onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as 'low' | 'medium' | 'high' })}
                          className="w-full p-2 border rounded-md"
                        >
                          <option value="low">Baja</option>
                          <option value="medium">Media</option>
                          <option value="high">Alta</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="flex items-center mb-4">
                        <input
                          type="checkbox"
                        id="sequential"
                          checked={newTask.is_sequential}
                        onChange={(e) => setNewTask({ ...newTask, is_sequential: e.target.checked })}
                        className="mr-2"
                      />
                      <label htmlFor="sequential" className="text-sm text-gray-700">
                        Tareas secuenciales (las subtareas deben completarse en orden)
                      </label>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Asignar a
                      </label>
                      <div className="flex flex-wrap gap-2 p-3 border border-gray-200 rounded-md bg-gray-50 max-h-36 overflow-y-auto">
                        {getAvailableUsers(newTask.project_id).map((user) => (
                          <div key={user.id} className="flex items-center space-x-2 bg-white px-3 py-2 rounded shadow-sm">
                            <input
                              type="checkbox"
                              id={`assign-${user.id}`}
                              checked={newTask.assigned_to.includes(user.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewTask({
                                    ...newTask,
                                    assigned_to: [...newTask.assigned_to, user.id],
                                  });
                                } else {
                                  setNewTask({
                                    ...newTask,
                                    assigned_to: newTask.assigned_to.filter((id) => id !== user.id),
                                  });
                                }
                              }}
                            />
                            <label htmlFor={`assign-${user.id}`} className="text-sm text-gray-700">
                              {user.name || user.name}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="border-t mt-6 pt-6">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Subtareas</h3>
                      <div className="space-y-4">
                      {newTask.subtasks.map((subtask, index) => (
                          <div
                            key={`new-subtask-${index}`}
                            className="mb-4 p-4 bg-gray-50 rounded-md border border-gray-200"
                          >
                          <div className="flex justify-between items-center mb-2">
                              <div className="flex items-center">
                                <div className="mr-2">
                                  <input
                                    type="number"
                                    value={index + 1}
                                    onChange={(e) => {
                                      const newPosition = parseInt(e.target.value) - 1;
                                      if (newPosition < 0 || newPosition >= newTask.subtasks.length) return;
                                      
                                      const updatedSubtasks = [...newTask.subtasks];
                                      const movedSubtask = updatedSubtasks.splice(index, 1)[0];
                                      updatedSubtasks.splice(newPosition, 0, movedSubtask);
                                      setNewTask({ ...newTask, subtasks: updatedSubtasks });
                                    }}
                                    className="w-12 p-1 border rounded text-center"
                                    min="1"
                                    max={newTask.subtasks.length}
                                  />
                                </div>
                                <h4 className="font-medium">Subtarea {index + 1}</h4>
                              </div>
                            <button
                              type="button"
                              onClick={() => {
                                const updatedSubtasks = [...newTask.subtasks];
                                updatedSubtasks.splice(index, 1);
                                setNewTask({ ...newTask, subtasks: updatedSubtasks });
                              }}
                              className="text-red-600 hover:text-red-800"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Título <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={subtask.title}
                                  onChange={(e) => {
                                    const updatedSubtasks = [...newTask.subtasks];
                                    updatedSubtasks[index] = { ...subtask, title: e.target.value };
                                    setNewTask({ ...newTask, subtasks: updatedSubtasks });
                                  }}
                                  placeholder="Título de la subtarea"
                                  className="w-full p-2 border rounded-md"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Descripción
                                </label>
                                <textarea
                                  value={subtask.description}
                                  onChange={(e) => {
                                    const updatedSubtasks = [...newTask.subtasks];
                                    updatedSubtasks[index] = { ...subtask, description: e.target.value };
                                    setNewTask({ ...newTask, subtasks: updatedSubtasks });
                                  }}
                                  placeholder="Descripción de la subtarea"
                                  className="w-full p-2 border rounded-md"
                                  rows={2}
                                />
                              </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Duración (minutos) <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="number"
                                  value={subtask.estimated_duration}
                                  onChange={(e) => {
                                    const updatedSubtasks = [...newTask.subtasks];
                                      updatedSubtasks[index] = { ...subtask, estimated_duration: Number(e.target.value) };
                                    setNewTask({ ...newTask, subtasks: updatedSubtasks });
                                  }}
                                  className="w-full p-2 border rounded-md"
                                  min="1"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  Asignar a <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={subtask.assigned_to || ''}
                                  onChange={(e) => {
                                    const updatedSubtasks = [...newTask.subtasks];
                                    updatedSubtasks[index] = { ...subtask, assigned_to: e.target.value };
                                    setNewTask({ ...newTask, subtasks: updatedSubtasks });
                                  }}
                                  className="w-full p-2 border rounded-md"
                                  required
                                >
                                  <option value="">Seleccionar usuario</option>
                                  {getAvailableUsers(newTask.project_id).map((user) => (
                                    <option key={user.id} value={user.id}>
                                      {user.name || user.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Fecha de inicio <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="datetime-local"
                                    value={subtask.start_date}
                                    onChange={(e) => {
                                      const newStartDate = e.target.value;
                                      if (newStartDate < newTask.start_date) {
                                        alert("La fecha de inicio de la subtarea no puede ser anterior a la fecha de inicio de la tarea principal.");
                                        return;
                                      }
                                      
                                      const updatedSubtasks = [...newTask.subtasks];
                                      updatedSubtasks[index] = { ...subtask, start_date: newStartDate };
                                      setNewTask({ ...newTask, subtasks: updatedSubtasks });
                                      
                                      // Cerrar datepicker
                                      e.target.blur();
                                    }}
                                    className="w-full p-2 border rounded-md"
                                    min={newTask.start_date}
                                    max={newTask.deadline}
                                    required
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Fecha límite <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="datetime-local"
                                    value={subtask.deadline}
                                    onChange={(e) => {
                                      const newDeadline = e.target.value;
                                      if (newDeadline > newTask.deadline) {
                                        alert("La fecha límite de la subtarea no puede ser posterior a la fecha límite de la tarea principal.");
                                        return;
                                      }
                                      
                                      if (newDeadline < subtask.start_date) {
                                        alert("La fecha límite no puede ser anterior a la fecha de inicio de la subtarea.");
                                        return;
                                      }
                                      
                                      const updatedSubtasks = [...newTask.subtasks];
                                      updatedSubtasks[index] = { ...subtask, deadline: newDeadline };
                                      setNewTask({ ...newTask, subtasks: updatedSubtasks });
                                      
                                      // Cerrar datepicker
                                      e.target.blur();
                                    }}
                                    className="w-full p-2 border rounded-md"
                                    min={subtask.start_date}
                                    max={newTask.deadline}
                                    required
                                  />
                                </div>
                              </div>
                          </div>
                        </div>
                      ))}
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => {
                          setNewTask({
                            ...newTask,
                            subtasks: [
                              ...newTask.subtasks,
                              {
                                title: '',
                                description: '',
                                estimated_duration: 30,
                                assigned_to: '',
                                start_date: newTask.start_date,
                                deadline: newTask.deadline,
                              },
                            ],
                          });
                        }}
                        className="mt-2 flex items-center text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-2 rounded-md"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Agregar Subtarea
                      </button>
                    </div>
                  </>
                )}
              </div>
            <div className="p-6 border-t mt-auto">
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setProjectSelected(false);
                    setNewTask({
                      title: '',
                      description: '',
                      start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                      deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                      estimated_duration: 30,
                      priority: 'medium',
                      is_sequential: false,
                      assigned_to: [],
                      subtasks: [],
                      project_id: null,
                    });
                  }}
                  className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                {projectSelected && (
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                  >
                    Crear Tarea
                  </button>
                )}
              </div>
            </div>
            </form>
          </div>
        </div>
      )}

      {showTaskDetailModal && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">
                {editMode ? "Editar Tarea" : "Detalles de Tarea"}
              </h2>
              <button
                onClick={() => {
                  setShowTaskDetailModal(false);
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
                    Título
                  </label>
                  {editMode ? (
                    <input
                      type="text"
                      value={editedTask.title}
                      onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
                      className="w-full p-2 border rounded-md"
                      disabled={!isAdmin}
                    />
                  ) : (
                    <p className="p-2 bg-gray-50 rounded-md">{selectedTask.title}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  {editMode ? (
                    <textarea
                      value={editedTask.description}
                      onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
                      className="w-full p-2 border rounded-md"
                      rows={3}
                      disabled={!isAdmin}
                    />
                  ) : (
                    <p className="p-2 bg-gray-50 rounded-md whitespace-pre-line min-h-[4rem]">
                      {selectedTask.description || "Sin descripción"}
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
                        value={editedTask.start_date}
                        onChange={(e) => setEditedTask({ ...editedTask, start_date: e.target.value })}
                        className="w-full p-2 border rounded-md"
                        disabled={!isAdmin}
                      />
                    ) : (
                      <p className="p-2 bg-gray-50 rounded-md">
                        {new Date(selectedTask.start_date).toLocaleString()}
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
                        value={editedTask.deadline}
                        onChange={(e) => setEditedTask({ ...editedTask, deadline: e.target.value })}
                        className="w-full p-2 border rounded-md"
                        disabled={!isAdmin}
                      />
                    ) : (
                      <p className="p-2 bg-gray-50 rounded-md">
                        {new Date(selectedTask.deadline).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Duración estimada (minutos)
                    </label>
                    {editMode ? (
                      <input
                        type="number"
                        value={editedTask.estimated_duration}
                        onChange={(e) => setEditedTask({ ...editedTask, estimated_duration: parseInt(e.target.value) })}
                        className="w-full p-2 border rounded-md"
                        min="1"
                        disabled={!isAdmin}
                      />
                    ) : (
                      <p className="p-2 bg-gray-50 rounded-md">
                        {selectedTask.estimated_duration} minutos
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Prioridad
                    </label>
                    {editMode ? (
                      <select
                        value={editedTask.priority}
                        onChange={(e) => setEditedTask({ ...editedTask, priority: e.target.value })}
                        className="w-full p-2 border rounded-md"
                        disabled={!isAdmin}
                      >
                        <option value="low">Baja</option>
                        <option value="medium">Media</option>
                        <option value="high">Alta</option>
                      </select>
                    ) : (
                      <p className={`p-2 rounded-md ${
                        selectedTask.priority === 'high' ? 'bg-red-50 text-red-800' : 
                        selectedTask.priority === 'medium' ? 'bg-yellow-50 text-yellow-800' : 
                        'bg-green-50 text-green-800'
                      }`}>
                        {getPriorityText(selectedTask.priority)}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="flex items-center">
                    {editMode ? (
                      <>
                        <input
                          type="checkbox"
                          checked={editedTask.is_sequential}
                          onChange={(e) => setEditedTask({ ...editedTask, is_sequential: e.target.checked })}
                          className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 mr-2"
                          disabled={!isAdmin}
                        />
                        <span className="text-sm text-gray-700">Las subtareas deben completarse en orden secuencial</span>
                      </>
                    ) : (
                      <div className="p-2 bg-gray-50 rounded-md">
                        {selectedTask.is_sequential ? 
                          "Las subtareas deben completarse en orden secuencial" : 
                          "Las subtareas pueden completarse en cualquier orden"}
                      </div>
                    )}
                  </label>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Información adicional</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="block text-gray-500">Creada por:</span>
                      <span>{users.find(u => u.id === selectedTask.created_by)?.name || 'Desconocido'}</span>
                    </div>
                    <div>
                      <span className="block text-gray-500">Fecha de creación:</span>
                      <span>{new Date(selectedTask.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                
                {/* Mostrar usuarios asignados en el modal de detalles */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Usuarios asignados:</h3>
                  
                  {editMode && isAdmin && (!subtasks[selectedTask.id] || subtasks[selectedTask.id].length === 0) ? (
                    <div className="bg-gray-50 p-4 rounded-md">
                      <p className="text-sm text-gray-600 mb-3">Selecciona los usuarios para esta tarea:</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {getAvailableUsers(selectedTask.project_id).map((user) => (
                          <div key={user.id} className="flex items-center space-x-2 bg-white px-3 py-2 rounded shadow-sm">
                            <input
                              type="checkbox"
                              id={`assign-task-${user.id}`}
                              checked={
                                editedTask.assigned_users 
                                  ? Array.isArray(editedTask.assigned_users) 
                                    ? editedTask.assigned_users.includes(user.id)
                                    : editedTask.assigned_users === user.id
                                  : false
                              }
                              onChange={(e) => {
                                let newAssignedUsers: string[] = Array.isArray(editedTask.assigned_users) 
                                  ? [...editedTask.assigned_users]
                                  : editedTask.assigned_users 
                                    ? [String(editedTask.assigned_users)] 
                                    : [];
                                
                                if (e.target.checked) {
                                  if (!newAssignedUsers.includes(user.id)) {
                                    newAssignedUsers.push(user.id);
                                  }
                                } else {
                                  newAssignedUsers = newAssignedUsers.filter(id => id !== user.id);
                                }
                                
                                setEditedTask({
                                  ...editedTask,
                                  assigned_users: newAssignedUsers
                                });
                              }}
                              className="form-checkbox h-4 w-4 text-indigo-600 rounded"
                            />
                            <label htmlFor={`assign-task-${user.id}`} className="text-sm text-gray-700">
                              {user.name || user.email}
                            </label>
                          </div>
                        ))}
                      </div>
                      {(!editedTask.assigned_users || 
                        (Array.isArray(editedTask.assigned_users) && editedTask.assigned_users.length === 0)) && (
                        <p className="text-xs text-amber-600 mt-2">
                          Nota: Si no asignas usuarios, la tarea quedará sin asignar.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedTask.assigned_users ? (
                        Array.isArray(selectedTask.assigned_users) ? 
                          selectedTask.assigned_users.map(userId => (
                            <span key={userId} className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm">
                              {users.find(u => u.id === userId)?.name || userId}
                            </span>
                          ))
                          : 
                          <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm">
                            {users.find(u => u.id === String(selectedTask.assigned_users))?.name || selectedTask.assigned_users}
                          </span>
                      ) : selectedTask.assigned_to ? (
                        Array.isArray(selectedTask.assigned_to) ? 
                          selectedTask.assigned_to.map(userId => (
                            <span key={userId} className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm">
                              {users.find(u => u.id === userId)?.name || userId}
                            </span>
                          ))
                          : 
                          <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm">
                            {users.find(u => u.id === String(selectedTask.assigned_to))?.name || selectedTask.assigned_to}
                          </span>
                      ) : (
                        <span className="text-gray-500">No hay usuarios asignados</span>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Subtareas asociadas:</h3>
                  <div className="space-y-2">
                    {subtasks[selectedTask.id]?.length > 0 ? (
                      <div>
                        {editMode ? (
                          <div className="bg-gray-50 p-4 rounded-md">
                            <p className="text-sm text-gray-600 mb-3">Puedes cambiar el orden y asignación de las subtareas:</p>
                            <div className="space-y-4">
                              {subtasks[selectedTask.id]
                                .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))
                                .map((subtask, index) => {
                                  if (!editedSubtasks[subtask.id]) {
                                    setEditedSubtasks(prev => ({
                                      ...prev,
                                      [subtask.id]: {
                                        sequence_order: subtask.sequence_order || index + 1,
                                        assigned_to: subtask.assigned_to
                                      }
                                    }));
                                  }
                                  
                                  return (
                                    <div key={subtask.id} className="flex items-center gap-3 border border-gray-200 p-3 rounded-md">
                                      <div className="flex-none w-16">
                                        <div className="flex gap-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const currentOrder = editedSubtasks[subtask.id]?.sequence_order || subtask.sequence_order || index + 1;
                                              if (currentOrder <= 1) return;
                                              
                                              setEditedSubtasks(prev => ({
                                                ...prev,
                                                [subtask.id]: {
                                                  ...prev[subtask.id],
                                                  sequence_order: currentOrder - 1
                                                }
                                              }));
                                            }}
                                            className="p-1 text-gray-500 hover:text-gray-700"
                                            disabled={(editedSubtasks[subtask.id]?.sequence_order || subtask.sequence_order) <= 1}
                                          >
                                            <ChevronUp className="w-4 h-4" />
                                          </button>
                                          <input
                                            type="number"
                                            min="1"
                                            value={editedSubtasks[subtask.id]?.sequence_order || subtask.sequence_order || index + 1}
                                            onChange={(e) => {
                                              const newOrder = parseInt(e.target.value) || 1;
                                              setEditedSubtasks(prev => ({
                                                ...prev,
                                                [subtask.id]: {
                                                  ...prev[subtask.id],
                                                  sequence_order: newOrder
                                                }
                                              }));
                                            }}
                                            className="w-10 p-1 border rounded-md text-center"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const currentOrder = editedSubtasks[subtask.id]?.sequence_order || subtask.sequence_order || index + 1;
                                              setEditedSubtasks(prev => ({
                                                ...prev,
                                                [subtask.id]: {
                                                  ...prev[subtask.id],
                                                  sequence_order: currentOrder + 1
                                                }
                                              }));
                                            }}
                                            className="p-1 text-gray-500 hover:text-gray-700"
                                          >
                                            <ChevronDown className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </div>
                                      <div className="flex-1">
                                        <p className="font-medium">{subtask.title}</p>
                                        <p className="text-xs text-gray-500">
                                          {subtask.status === 'completed' || subtask.status === 'approved' ? 'Completada' : 
                                          subtask.status === 'in_progress' ? 'En progreso' : 'Pendiente'}
                                        </p>
                                      </div>
                                      <div className="flex-none w-48">
                                        <select
                                          value={editedSubtasks[subtask.id]?.assigned_to || subtask.assigned_to}
                                          onChange={(e) => {
                                            setEditedSubtasks(prev => ({
                                              ...prev,
                                              [subtask.id]: {
                                                ...prev[subtask.id],
                                                assigned_to: e.target.value
                                              }
                                            }));
                                          }}
                                          className="w-full p-1 text-sm border rounded-md"
                                        >
                                          <option value="">Sin asignar</option>
                                          {getAvailableUsers(selectedTask?.project_id || null).map((user) => (
                                            <option key={user.id} value={user.id}>
                                              {user.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                            <div className="mt-3 text-xs text-gray-500">
                              Los cambios en el orden se aplicarán al guardar la tarea.
                            </div>
                          </div>
                        ) : (
                          subtasks[selectedTask.id]
                            .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))
                            .map((subtask) => (
                              <div key={subtask.id} className="bg-gray-50 p-2 rounded-md flex justify-between items-center">
                                <div>
                                  <span className="font-medium">{subtask.title}</span>
                                  {subtask.sequence_order && (
                                    <span className="ml-2 text-xs text-gray-500">Orden: {subtask.sequence_order}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-indigo-600">
                                    {users.find(u => u.id === subtask.assigned_to)?.name || "No asignada"}
                                  </span>
                                  <span className={`text-xs px-2 py-1 rounded ${
                                    subtask.status === 'completed' || subtask.status === 'approved' ? 'bg-green-100 text-green-800' : 
                                    subtask.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {subtask.status === 'completed' || subtask.status === 'approved' ? 'Completada' : 
                                    subtask.status === 'in_progress' ? 'En progreso' : 'Pendiente'}
                                  </span>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-500">Esta tarea no tiene subtareas asociadas.</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Proyecto
                  </label>
                  {editMode ? (
                    <select
                      value={editedTask.project_id || ''}
                      onChange={(e) => setEditedTask({ ...editedTask, project_id: e.target.value || null })}
                      className="w-full p-2 border rounded-md"
                      disabled={!isAdmin}
                    >
                      <option value="">Sin proyecto</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="p-2 bg-gray-50 rounded-md">
                      {selectedTask.project_id 
                        ? projects.find(p => p.id === selectedTask.project_id)?.name
                        : "No asignado a proyecto"}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6 border-t mt-auto flex justify-between">
              {editMode && isAdmin && (
                <button
                  type="button"
                  onClick={handleDeleteTask}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Eliminar Tarea
                </button>
              )}
              <div className="flex justify-end space-x-3">
                {editMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditMode(false);
                        setEditedTask({
                          title: selectedTask.title,
                          description: selectedTask.description || '',
                          start_date: selectedTask.start_date ? selectedTask.start_date.replace(" ", "T").substring(0, 16) : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                          deadline: selectedTask.deadline ? selectedTask.deadline.replace(" ", "T").substring(0, 16) : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                          estimated_duration: selectedTask.estimated_duration,
                          priority: selectedTask.priority,
                          is_sequential: selectedTask.is_sequential,
                          project_id: selectedTask.project_id || null,
                          status: selectedTask.status,
                          created_by: selectedTask.created_by,
                          created_at: selectedTask.created_at,
                          assigned_to: selectedTask.assigned_to,
                          assigned_users: selectedTask.assigned_users
                        });
                      }}
                      className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={handleCompleteTaskUpdate}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                      >
                        Guardar Cambios
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowTaskDetailModal(false)}
                      className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Cerrar
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setEditMode(true)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
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

      {showSubtaskDetailModal && selectedSubtask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">
                {editMode ? "Editar Subtarea" : "Detalles de Subtarea"}
              </h2>
              <button
                onClick={() => {
                  setShowSubtaskDetailModal(false);
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
                    Título
                  </label>
                  {editMode ? (
                    <input
                      type="text"
                      value={editedSubtask.title}
                      onChange={(e) => setEditedSubtask({ ...editedSubtask, title: e.target.value })}
                      className="w-full p-2 border rounded-md"
                      disabled={!isAdmin}
                    />
                  ) : (
                    <p className="p-2 bg-gray-50 rounded-md">{selectedSubtask.title}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  {editMode ? (
                    <textarea
                      value={editedSubtask.description}
                      onChange={(e) => setEditedSubtask({ ...editedSubtask, description: e.target.value })}
                      className="w-full p-2 border rounded-md"
                      rows={3}
                      disabled={!isAdmin}
                    />
                  ) : (
                    <p className="p-2 bg-gray-50 rounded-md whitespace-pre-line min-h-[4rem]">
                      {selectedSubtask.description || "Sin descripción"}
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
                        value={editedSubtask.start_date}
                        onChange={(e) => setEditedSubtask({ ...editedSubtask, start_date: e.target.value })}
                        className="w-full p-2 border rounded-md"
                        disabled={!isAdmin}
                      />
                    ) : (
                      <p className="p-2 bg-gray-50 rounded-md">
                        {selectedSubtask.start_date ? new Date(selectedSubtask.start_date).toLocaleString() : "No establecida"}
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
                        value={editedSubtask.deadline}
                        onChange={(e) => setEditedSubtask({ ...editedSubtask, deadline: e.target.value })}
                        className="w-full p-2 border rounded-md"
                        disabled={!isAdmin}
                      />
                    ) : (
                      <p className="p-2 bg-gray-50 rounded-md">
                        {selectedSubtask.deadline ? new Date(selectedSubtask.deadline).toLocaleString() : "No establecida"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Duración estimada (minutos)
                    </label>
                    {editMode ? (
                      <input
                        type="number"
                        value={editedSubtask.estimated_duration}
                        onChange={(e) => setEditedSubtask({ ...editedSubtask, estimated_duration: parseInt(e.target.value) })}
                        className="w-full p-2 border rounded-md"
                        min="1"
                        disabled={!isAdmin}
                      />
                    ) : (
                      <p className="p-2 bg-gray-50 rounded-md">
                        {selectedSubtask.estimated_duration} minutos
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Número de orden
                    </label>
                    {editMode ? (
                      <input
                        type="number"
                        value={editedSubtask.sequence_order || 0}
                        onChange={(e) => setEditedSubtask({ ...editedSubtask, sequence_order: parseInt(e.target.value) })}
                        className="w-full p-2 border rounded-md"
                        min="1"
                        disabled={!isAdmin}
                      />
                    ) : (
                      <p className="p-2 bg-gray-50 rounded-md">
                        {selectedSubtask.sequence_order || "No establecido"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Asignado a
                    </label>
                    {editMode ? (
                      <select
                        value={editedSubtask.assigned_to}
                        onChange={(e) => setEditedSubtask({ ...editedSubtask, assigned_to: e.target.value })}
                        className="w-full p-2 border rounded-md"
                        disabled={!isAdmin}
                      >
                        <option value="">Sin asignar</option>
                        {getAvailableUsers(tasks.find(t => t.id === selectedSubtask?.task_id)?.project_id || null).map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="p-2 bg-gray-50 rounded-md">
                        {users.find(u => u.id === selectedSubtask.assigned_to)?.name || "No asignada"}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Estado
                    </label>
                    {editMode ? (
                      <select
                        value={editedSubtask.status}
                        onChange={(e) => setEditedSubtask({ ...editedSubtask, status: e.target.value })}
                        className="w-full p-2 border rounded-md"
                        disabled={isAdmin || (selectedSubtask.assigned_to !== user?.id)}
                      >
                        <option value="pending">Pendiente</option>
                        <option value="in_progress">En Progreso</option>
                        <option value="completed">Completada</option>
                        <option value="approved">Aprobada</option>
                      </select>
                    ) : (
                      <p className={`p-2 rounded-md ${
                        selectedSubtask.status === 'completed' || selectedSubtask.status === 'approved' ? 'bg-green-100 text-green-800' : 
                        selectedSubtask.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {selectedSubtask.status === 'completed' || selectedSubtask.status === 'approved' ? 'Completada' : 
                         selectedSubtask.status === 'in_progress' ? 'En progreso' : 'Pendiente'}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Tarea principal</h3>
                  <div className="p-2 bg-gray-50 rounded-md">
                    {tasks.find(t => t.id === selectedSubtask.task_id)?.title || 'Tarea desconocida'}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t mt-auto flex justify-between">
              {editMode && isAdmin && (
                <button
                  type="button"
                  onClick={handleDeleteSubtask}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Eliminar Subtarea
                </button>
              )}
              <div className="flex justify-end space-x-3">
                {editMode ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditMode(false);
                        setEditedSubtask({
                          title: selectedSubtask.title,
                          description: selectedSubtask.description || '',
                          estimated_duration: selectedSubtask.estimated_duration,
                          sequence_order: selectedSubtask.sequence_order || 0,
                          assigned_to: selectedSubtask.assigned_to || '',
                          status: selectedSubtask.status || 'pending',
                          start_date: selectedSubtask.start_date ? selectedSubtask.start_date.replace(" ", "T").substring(0, 16) : null,
                          deadline: selectedSubtask.deadline ? selectedSubtask.deadline.replace(" ", "T").substring(0, 16) : null,
                          task_id: selectedSubtask.task_id,
                          created_by: selectedSubtask.created_by,
                          created_at: selectedSubtask.created_at
                        });
                      }}
                      className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    {(isAdmin || selectedSubtask.assigned_to === user?.id) && (
                      <button
                        type="button"
                        onClick={handleUpdateSubtask}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                      >
                        Guardar Cambios
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSubtaskDetailModal(false);
                        setEditMode(false);
                      }}
                      className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Cerrar
                    </button>
                    {(isAdmin || selectedSubtask.assigned_to === user?.id) && (
                      <button
                        type="button"
                        onClick={() => setEditMode(true)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
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

export default Tasks;