import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format, isWithinInterval, parseISO, differenceInDays, isBefore, isAfter, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  estimated_duration: number;
  start_date: string;
  deadline: string;
  status: string;
  is_sequential: boolean;
  project_id: string;
  assigned_users?: string[];
  type?: 'task' | 'subtask';
  original_id?: string;
  subtask_title?: string;
}

interface Subtask {
  id: string;
  title: string;
  description: string | null;
  estimated_duration: number;
  sequence_order: number | null;
  assigned_to: string;
  status: string;
  task_id: string;
  start_date: string | null;
  deadline: string | null;
  task_title?: string;
  tasks?: {
    title: string;
    is_sequential: boolean;
    project_id: string;
  };
}

interface Project {
  id: string;
  name: string;
}

// Función para calcular y formatear el tiempo restante o pasado
function getTimeIndicator(dateStr: string | null, isStartDate: boolean): { text: string; color: string } {
  if (!dateStr) return { text: "", color: "" };
  
  const today = new Date();
  // Comparamos solo fechas sin tiempo
  const todayWithoutTime = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const date = new Date(dateStr);
  const dateWithoutTime = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = differenceInDays(dateWithoutTime, todayWithoutTime);
  
  // Para fechas de inicio
  if (isStartDate) {
    // Si la fecha es hoy
    if (diffDays === 0) {
      return { 
        text: "Inicia hoy", 
        color: "text-green-600 font-medium" 
      };
    }
    // Si la fecha de inicio ya pasó
    else if (isBefore(dateWithoutTime, todayWithoutTime)) {
      const daysPassed = Math.abs(diffDays);
      return { 
        text: `Iniciada hace ${daysPassed} día${daysPassed !== 1 ? 's' : ''}`, 
        color: "text-blue-600"
      };
    } 
    // Si la fecha de inicio es en el futuro
    else {
      return { 
        text: `Inicia en ${diffDays} día${diffDays !== 1 ? 's' : ''}`, 
        color: "text-gray-600" 
      };
    }
  } 
  // Para fechas de fin
  else {
    // Si la fecha es hoy
    if (diffDays === 0) {
      return { 
        text: "Vence hoy", 
        color: "text-yellow-600 font-medium" 
      };
    }
    // Si la fecha límite ya pasó (atrasada)
    else if (isBefore(dateWithoutTime, todayWithoutTime)) {
      const daysLate = Math.abs(diffDays);
      return { 
        text: `Atrasada por ${daysLate} día${daysLate !== 1 ? 's' : ''}`, 
        color: "text-red-600 font-medium" 
      };
    } 
    // Si vence en menos de 3 días
    else if (diffDays <= 3) {
      return { 
        text: `Vence en ${diffDays} día${diffDays !== 1 ? 's' : ''}`, 
        color: "text-yellow-600" 
      };
    } 
    // Si la fecha límite es en el futuro (más de 3 días)
    else {
      return { 
        text: `Vence en ${diffDays} día${diffDays !== 1 ? 's' : ''}`, 
        color: "text-gray-600" 
      };
    }
  }
}

export default function UserProjectView() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'asignacion' | 'gestion'>('asignacion');
  const [project, setProject] = useState<Project | null>(null);
  const [taskItems, setTaskItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [totalEstimatedDuration, setTotalEstimatedDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedTaskDetails, setSelectedTaskDetails] = useState<Task | null>(null);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [sortBy, setSortBy] = useState<'deadline' | 'priority' | 'duration'>('deadline');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (projectId) {
      fetchProject();
      fetchProjectTasksAndSubtasks();
    }
  }, [projectId]);

  useEffect(() => {
    // Calculate total duration of selected tasks
    const total = selectedTasks.reduce((acc, taskId) => {
      const task = taskItems.find(t => t.id === taskId);
      return acc + (task?.estimated_duration || 0);
    }, 0);
    // Convertir total de minutos a horas
    const totalHours = Math.round((total / 60) * 100) / 100;
    setTotalEstimatedDuration(totalHours);
  }, [selectedTasks, taskItems]);

  useEffect(() => {
    // Ordenar tareas cuando cambie solo el criterio de ordenamiento
    if (taskItems.length > 0) {
      // Clonar para no mutar el estado original
      const itemsToSort = [...taskItems];
      
      const sortedItems = itemsToSort.sort((a, b) => {
        if (sortBy === 'deadline') {
          const dateA = a.deadline ? new Date(a.deadline) : new Date(9999, 11, 31);
          const dateB = b.deadline ? new Date(b.deadline) : new Date(9999, 11, 31);
          return sortOrder === 'asc' ? 
            dateA.getTime() - dateB.getTime() : 
            dateB.getTime() - dateA.getTime();
        } 
        else if (sortBy === 'priority') {
          const priorityValues = { high: 3, medium: 2, low: 1 };
          const priorityA = priorityValues[a.priority] || 0;
          const priorityB = priorityValues[b.priority] || 0;
          return sortOrder === 'asc' ? 
            priorityA - priorityB : 
            priorityB - priorityA;
        }
        else if (sortBy === 'duration') {
          return sortOrder === 'asc' ? 
            a.estimated_duration - b.estimated_duration : 
            b.estimated_duration - a.estimated_duration;
        }
        return 0;
      });
      
      // Usamos una clave de referencia para evitar un bucle infinito
      const sortedTasksString = JSON.stringify(sortedItems.map(t => t.id));
      const currentTasksString = JSON.stringify(taskItems.map(t => t.id));
      
      if (sortedTasksString !== currentTasksString) {
        setTaskItems(sortedItems);
      }
    }
  }, [sortBy, sortOrder]);

  async function fetchProject() {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', projectId)
        .single();

      if (error) throw error;
      setProject(data);
    } catch (error) {
      console.error('Error fetching project:', error);
    }
  }

  async function fetchProjectTasksAndSubtasks() {
    if (!user) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      const today = new Date();
      const formattedToday = format(today, 'yyyy-MM-dd');
      
      // 1. Obtener todas las tareas del proyecto
      const { data: allTasksData, error: allTasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .not('status', 'in', '(approved)')  // Excluir tareas aprobadas
        .order('deadline', { ascending: true });
        
      if (allTasksError) {
        console.error('Error al cargar todas las tareas:', allTasksError);
        setError('Error al cargar tareas. Por favor, intenta de nuevo.');
        throw allTasksError;
      }
      
      // 2. Obtener tareas del proyecto asignadas al usuario
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .contains('assigned_users', [user.id])
        .not('status', 'in', '(approved)')  // Excluir tareas aprobadas
        .order('deadline', { ascending: true });
        
      if (taskError) {
        console.error('Error al cargar tareas:', taskError);
        setError('Error al cargar tareas. Por favor, intenta de nuevo.');
        throw taskError;
      }
      
      console.log('Tareas cargadas:', taskData);
      
      // 3. Obtener todas las subtareas del proyecto
      const { data: allSubtasksData, error: allSubtasksError } = await supabase
        .from('subtasks')
        .select(`
          *,
          tasks (
            id, title, is_sequential, project_id
          )
        `)
        .eq('tasks.project_id', projectId)
        .not('status', 'in', '(completed, approved)')  // Excluir subtareas completadas y aprobadas
        .order('sequence_order', { ascending: true });
      
      if (allSubtasksError) {
        console.error('Error al cargar todas las subtareas:', allSubtasksError);
        setError('Error al cargar subtareas. Por favor, intenta de nuevo.');
        throw allSubtasksError;
      }
      
      // 4. Obtener subtareas asignadas al usuario para este proyecto
      const { data: subtaskData, error: subtaskError } = await supabase
        .from('subtasks')
        .select(`
          *,
          tasks (
            id, title, is_sequential, project_id
          )
        `)
        .eq('assigned_to', user.id)
        .eq('tasks.project_id', projectId)
        .not('status', 'in', '(completed, approved)')  // Excluir subtareas completadas y aprobadas
        .order('sequence_order', { ascending: true });
        
      if (subtaskError) {
        console.error('Error al cargar subtareas:', subtaskError);
        setError('Error al cargar subtareas. Por favor, intenta de nuevo.');
        throw subtaskError;
      }
      
      // Log detallado para analizar estructura
      console.log('Detalle completo de la primera subtarea:', subtaskData && subtaskData.length > 0 ? 
        JSON.stringify(subtaskData[0], null, 2) : 'No hay subtareas');
      
      console.log('Subtareas cargadas:', subtaskData);

      // Si no hay datos, terminar aquí
      if (!allTasksData?.length) {
        console.log('No se encontraron tareas para este proyecto');
        setTaskItems([]);
        setLoading(false);
        return;
      }
      
      // 5. Identificar tareas que tienen subtareas
      const tasksWithSubtasks = new Set();
      allSubtasksData?.forEach(subtask => {
        tasksWithSubtasks.add(subtask.task_id);
      });
      
      console.log('Tareas con subtareas:', tasksWithSubtasks);
      
      // 6. Filtrar tareas asignadas al usuario que NO tienen subtareas
      const tasksWithoutSubtasksItems = taskData?.filter(task => !tasksWithSubtasks.has(task.id)) || [];
      
      // 7. Procesar subtareas para mostrar solo las relevantes
      // Agrupar subtareas por tarea_id
      const taskToSubtasks: Record<string, Subtask[]> = {};
      subtaskData?.forEach(subtask => {
        console.log('Procesando subtarea:', {
          id: subtask.id,
          title: subtask.title,
          task: subtask.tasks
        });
        
        if (!taskToSubtasks[subtask.task_id]) {
          taskToSubtasks[subtask.task_id] = [];
        }
        
        // Asegurar que el título de la tarea principal está disponible
        const processedSubtask = {
          ...subtask,
          task_title: subtask.tasks?.title || 'Tarea sin título'
        };
        
        taskToSubtasks[subtask.task_id].push(processedSubtask);
      });
      
      // 8. Para cada tarea, determinar qué subtareas mostrar
      const relevantSubtasks: Subtask[] = [];
      Object.keys(taskToSubtasks).forEach(taskId => {
        const subtasks = taskToSubtasks[taskId];
        const taskInfo = subtasks[0]?.tasks;
        
        if (taskInfo && taskInfo.is_sequential) {
          // Para tareas secuenciales, solo mostrar la siguiente subtarea desbloqueada
          
          // Obtener todas las subtareas de esta tarea (incluyendo las de otros usuarios)
          const allSubtasksForTask = allSubtasksData?.filter(s => s.task_id === taskId) || [];
          
          // Ordenar por sequence_order
          const sortedAllSubtasks = [...allSubtasksForTask].sort((a, b) => 
            (a.sequence_order || 0) - (b.sequence_order || 0)
          );
          
          // Encontrar el índice de la primera subtarea no completada
          const nextIncompleteIndex = sortedAllSubtasks.findIndex(s => 
            s.status !== 'completed' && s.status !== 'approved'
          );
          
          if (nextIncompleteIndex >= 0) {
            // Obtener la siguiente subtarea desbloqueada
            const nextSubtask = sortedAllSubtasks[nextIncompleteIndex];
            
            // Solo mostrar si está asignada a este usuario
            if (nextSubtask.assigned_to === user.id) {
              relevantSubtasks.push(nextSubtask);
            }
          }
        } else {
          // Para tareas no secuenciales, incluir todas las subtareas asignadas al usuario
          relevantSubtasks.push(...subtasks);
        }
      });
      
      // 9. Filtrar subtareas por rango de fecha (si tienen fecha)
      const dateFilteredSubtasks = relevantSubtasks.filter(subtask => {
        // Si no tiene fechas, lo incluimos siempre
        if (!subtask.start_date && !subtask.deadline) return true;
        
        // Si tiene fecha de inicio pero es en el futuro, lo incluimos igual
        // Esto permite ver tareas futuras también
        return true;
      });
      
      // 10. Convertir subtareas al formato de tarea para mostrarlas
      const subtasksAsTaskItems: Task[] = dateFilteredSubtasks.map(subtask => {
        console.log('Datos de subtarea:', {
          id: subtask.id,
          title: subtask.title,
          task_title: subtask.task_title,
          task_info: subtask.tasks
        });
        
        return {
          id: `subtask-${subtask.id}`,
          original_id: subtask.id,
          title: subtask.title,
          subtask_title: subtask.tasks?.title || subtask.task_title || "Tarea principal",
          description: subtask.description,
          priority: 'medium', // Las subtareas no tienen prioridad, asignamos una por defecto
          estimated_duration: subtask.estimated_duration,
          start_date: subtask.start_date || '',
          deadline: subtask.deadline || '',
          status: subtask.status,
          is_sequential: false,
          project_id: projectId || '',
          type: 'subtask'
        };
      });
      
      // 11. Convertir tareas al formato de tarea para mostrarlas
      const tasksAsTaskItems: Task[] = tasksWithoutSubtasksItems.map(task => ({
        id: task.id,
        original_id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        estimated_duration: task.estimated_duration,
        start_date: task.start_date,
        deadline: task.deadline,
        status: task.status,
        is_sequential: task.is_sequential,
        project_id: task.project_id,
        type: 'task'
      }));
      
      // 12. Combinar y ordenar por fecha límite y prioridad
      const allTasks = [...tasksAsTaskItems, ...subtasksAsTaskItems];
      
      // Log para depuración
      console.log('Detalles de las tareas a mostrar:', {
        tasksWithoutSubtasks: tasksWithoutSubtasksItems.length,
        subtareas: subtasksAsTaskItems.length,
        total: allTasks.length,
        tasksQueryInfo: {
          project_id: projectId,
          user_id: user.id,
          'contains(assigned_users)': [user.id]
        }
      });
      
      // Ordenar según el criterio actual
      const sortedTasks = [...allTasks].sort((a, b) => {
        if (sortBy === 'deadline') {
          const dateA = a.deadline ? new Date(a.deadline) : new Date(9999, 11, 31);
          const dateB = b.deadline ? new Date(b.deadline) : new Date(9999, 11, 31);
          return sortOrder === 'asc' ? 
            dateA.getTime() - dateB.getTime() : 
            dateB.getTime() - dateA.getTime();
        } 
        else if (sortBy === 'priority') {
          const priorityValues = { high: 3, medium: 2, low: 1 };
          const priorityA = priorityValues[a.priority] || 0;
          const priorityB = priorityValues[b.priority] || 0;
          return sortOrder === 'asc' ? 
            priorityA - priorityB : 
            priorityB - priorityA;
        }
        else if (sortBy === 'duration') {
          return sortOrder === 'asc' ? 
            a.estimated_duration - b.estimated_duration : 
            b.estimated_duration - a.estimated_duration;
        }
        return 0;
      });
      
      setTaskItems(sortedTasks);
    } catch (error) {
      console.error('Error fetching tasks and subtasks:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleTaskSelection(taskId: string) {
    setSelectedTasks(prev => {
      if (prev.includes(taskId)) {
        return prev.filter(id => id !== taskId);
      } else {
        return [...prev, taskId];
      }
    });
  }
  
  function handleViewTaskDetails(task: Task) {
    setSelectedTaskDetails(task);
    setShowTaskDetailModal(true);
  }

  function closeTaskDetailModal() {
    setShowTaskDetailModal(false);
    setSelectedTaskDetails(null);
  }
  
  function handleSort(criteria: 'deadline' | 'priority' | 'duration') {
    if (sortBy === criteria) {
      // Si ya estamos ordenando por este criterio, cambiar la dirección
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // Si es un nuevo criterio, establecerlo y usar dirección ascendente por defecto
      setSortBy(criteria);
      setSortOrder('asc');
    }
  }

  function getPriorityBadge(priority: 'low' | 'medium' | 'high') {
    const colors = {
      high: 'bg-red-100 text-red-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-green-100 text-green-800'
    };
    
    const labels = {
      high: 'Alta',
      medium: 'Media',
      low: 'Baja'
    };
    
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${colors[priority]}`}>
        {labels[priority]}
      </span>
    );
  }
  
  function handleSaveButton() {
    if (selectedTasks.length === 0) return;
    setShowConfirmModal(true);
  }
  
  async function handleSaveSelection() {
    if (!user || selectedTasks.length === 0) return;
    
    setShowConfirmModal(false);
    setSaving(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Convertir IDs de subtareas a sus originales para guardar en la BD
      const tasksToSave = selectedTasks.map(taskId => {
        // Si es una subtarea, extraer el ID original
        if (taskId.startsWith('subtask-')) {
          const task = taskItems.find(t => t.id === taskId);
          return task?.original_id || '';
        }
        return taskId;
      }).filter(id => id !== '');
      
      // Check if there's already a record for today
      const { data: existingData, error: fetchError } = await supabase
        .from('daily_tasks')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .single();
      
      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }
      
      if (existingData) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('daily_tasks')
          .update({
            tasks: tasksToSave,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingData.id);
          
        if (updateError) throw updateError;
      } else {
        // Create new record
        const { error: insertError } = await supabase
          .from('daily_tasks')
          .insert([{
            user_id: user.id,
            date: today,
            tasks: tasksToSave,
            created_at: new Date().toISOString()
          }]);
          
        if (insertError) throw insertError;
      }
      
      // Navigate to daily tasks view
      navigate('/user/daily');
    } catch (error) {
      console.error('Error saving daily tasks:', error);
      alert('Error al guardar las tareas. Por favor, intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{project?.name || 'Cargando proyecto...'}</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex -mb-px">
          <button
            className={`mr-4 py-2 px-4 font-medium ${
              activeTab === 'asignacion'
                ? 'border-b-2 border-yellow-500 text-yellow-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('asignacion')}
          >
            ASIGNACION
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              activeTab === 'gestion'
                ? 'border-b-2 border-yellow-500 text-yellow-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('gestion')}
          >
            GESTION
          </button>
        </div>
      </div>

      {activeTab === 'asignacion' && (
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold">LISTADO DE ACTIVIDADES PARA ASIGNAR</h2>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-md">
              {error}
            </div>
          )}

          {/* Opciones de ordenamiento */}
          <div className="mb-4 p-3 bg-white rounded-md shadow-sm border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-2">Ordenar actividades por:</p>
            <div className="flex items-center flex-wrap gap-2">
              <button 
                className={`px-4 py-2 text-sm rounded-md flex items-center ${
                  sortBy === 'deadline' 
                    ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
                }`}
                onClick={() => handleSort('deadline')}
              >
                Fecha límite
                {sortBy === 'deadline' && (
                  <span className="ml-1">
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </button>
              <button 
                className={`px-4 py-2 text-sm rounded-md flex items-center ${
                  sortBy === 'priority' 
                    ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
                }`}
                onClick={() => handleSort('priority')}
              >
                Prioridad
                {sortBy === 'priority' && (
                  <span className="ml-1">
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </button>
              <button 
                className={`px-4 py-2 text-sm rounded-md flex items-center ${
                  sortBy === 'duration' 
                    ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
                }`}
                onClick={() => handleSort('duration')}
              >
                Duración
                {sortBy === 'duration' && (
                  <span className="ml-1">
                    {sortOrder === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Task list container */}
          <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden mb-6">
            {/* Task list header */}
            <div className="grid grid-cols-6 gap-4 p-3 border-b-2 border-gray-300 font-medium text-gray-700 bg-gray-50">
              <div className="text-center">#</div>
              <div>ACTIVIDAD</div>
              <div>DESCRIPCION</div>
              <div>INICIO</div>
              <div>FIN</div>
              <div>DURACIÓN</div>
            </div>

            {/* Task list */}
            <div className="divide-y divide-gray-200">
              {loading ? (
                <div className="py-8 text-center text-gray-500 bg-white">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-800 mx-auto mb-2"></div>
                  <p>Cargando tareas...</p>
                </div>
              ) : taskItems.length > 0 ? (
                taskItems.map((task) => (
                  <div key={task.id} className="grid grid-cols-6 gap-4 py-3 items-center bg-white hover:bg-gray-50 px-3">
                    <div className="text-center">
                      <input
                        type="checkbox"
                        checked={selectedTasks.includes(task.id)}
                        onChange={() => handleTaskSelection(task.id)}
                        className="h-5 w-5 text-yellow-500 rounded border-gray-300 focus:ring-yellow-500"
                      />
                    </div>
                    <div className="font-medium">
                      {task.type === 'subtask' ? (
                        <div>
                          <div className="text-sm text-gray-700 font-medium mb-1">
                            <span className="inline-block mr-2">T.P:</span>
                            {task.subtask_title || "Sin tarea principal"}
                          </div>
                          <div 
                            className="cursor-pointer hover:text-indigo-600 mb-1"
                            onClick={() => handleViewTaskDetails(task)}
                          >
                            {task.title}
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">Subtarea</span>
                            {getPriorityBadge(task.priority)}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div 
                            className="cursor-pointer hover:text-indigo-600 mb-1 text-base"
                            onClick={() => handleViewTaskDetails(task)}
                          >
                            {task.title}
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            {getPriorityBadge(task.priority)}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 truncate">
                      {task.description || '-'}
                    </div>
                    <div className="text-sm text-gray-700">
                      {task.start_date ? (
                        <>
                          <div>{format(new Date(task.start_date), 'dd/MM/yyyy')}</div>
                          {/* Indicador de tiempo para fecha de inicio */}
                          {getTimeIndicator(task.start_date, true).text && (
                            <div className={`text-xs mt-1 ${getTimeIndicator(task.start_date, true).color}`}>
                              {getTimeIndicator(task.start_date, true).text}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-700">
                      {task.deadline ? (
                        <>
                          <div>{format(new Date(task.deadline), 'dd/MM/yyyy')}</div>
                          {/* Indicador de tiempo para fecha de fin */}
                          {getTimeIndicator(task.deadline, false).text && (
                            <div className={`text-xs mt-1 ${getTimeIndicator(task.deadline, false).color}`}>
                              {getTimeIndicator(task.deadline, false).text}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                    <div className="text-sm font-medium">
                      {Math.round((task.estimated_duration / 60) * 100) / 100} HORA{Math.round((task.estimated_duration / 60) * 100) / 100 !== 1 ? 'S' : ''}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center bg-white">
                  <p className="text-gray-500 mb-2">No hay tareas asignadas para este proyecto.</p>
                  <p className="text-sm text-gray-400">Verifica que tengas asignadas tareas o subtareas en este proyecto.</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer with total duration and save button */}
          <div className="mt-6 p-4 bg-white rounded-md shadow-sm border border-gray-200 flex justify-between items-center">
            <div className="text-sm">
              <p className="text-gray-600">DURACIÓN TOTAL DEL DÍA</p>
              <p className="font-bold text-lg mt-1">{totalEstimatedDuration} HORA{totalEstimatedDuration !== 1 ? 'S' : ''}</p>
            </div>
            <button
              onClick={handleSaveButton}
              disabled={selectedTasks.length === 0 || saving}
              className="bg-yellow-500 text-white px-6 py-2 rounded-md font-medium 
                        hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 
                        disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? 'GUARDANDO...' : 'GUARDAR SELECCIÓN'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'gestion' && (
        <div className="py-6 text-center text-gray-500">
          <p>Funcionalidad de gestión en desarrollo...</p>
        </div>
      )}

      {/* Modal de confirmación de guardar tareas */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium">Confirmar asignación de tareas</h3>
              <button 
                onClick={() => setShowConfirmModal(false)}
                className="text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="px-6 py-4">
              <p className="mb-4 text-gray-700">Estás a punto de asignar estas {selectedTasks.length} tareas para el día de hoy ({format(new Date(), 'dd/MM/yyyy')}). ¿Deseas continuar?</p>
              
              <div className="mb-4 p-3 bg-gray-50 rounded-md max-h-60 overflow-y-auto">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Resumen de tareas seleccionadas:</h4>
                <ul className="divide-y divide-gray-200">
                  {selectedTasks.map(taskId => {
                    const task = taskItems.find(t => t.id === taskId);
                    if (!task) return null;
                    
                    return (
                      <li key={taskId} className="py-2">
                        <div className="flex items-start">
                          <div className="flex-shrink-0">
                            {task.type === 'subtask' ? (
                              <span className="inline-block w-6 h-6 rounded-full bg-indigo-100 text-indigo-800 text-xs font-medium flex items-center justify-center">
                                S
                              </span>
                            ) : (
                              <span className="inline-block w-6 h-6 rounded-full bg-blue-100 text-blue-800 text-xs font-medium flex items-center justify-center">
                                T
                              </span>
                            )}
                          </div>
                          <div className="ml-3">
                            <p className="text-sm font-medium text-gray-900">{task.title}</p>
                            {task.type === 'subtask' && task.subtask_title && (
                              <p className="text-xs text-gray-500">
                                Tarea principal: {task.subtask_title}
                              </p>
                            )}
                            <div className="mt-1 flex items-center space-x-2">
                              {task.deadline && (
                                <span className="text-xs text-gray-500">
                                  Vence: {format(new Date(task.deadline), 'dd/MM/yyyy')}
                                </span>
                              )}
                              <span className="text-xs text-gray-500">
                                Duración: {Math.round((task.estimated_duration / 60) * 100) / 100} h
                              </span>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
              
              <div className="bg-yellow-50 p-3 rounded-md mb-4">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-yellow-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm font-medium text-yellow-800">
                    Tiempo total estimado: {totalEstimatedDuration} hora{totalEstimatedDuration !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="px-6 py-3 bg-gray-50 flex justify-end space-x-3 border-t border-gray-200">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveSelection}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-yellow-500 border border-transparent rounded-md shadow-sm hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando...' : 'Confirmar y guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalles de tarea */}
      {showTaskDetailModal && selectedTaskDetails && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium">
                {selectedTaskDetails.type === 'subtask' && selectedTaskDetails.subtask_title ? 
                  `${selectedTaskDetails.subtask_title} - ${selectedTaskDetails.title}` : 
                  selectedTaskDetails.title
                }
              </h3>
              <button 
                onClick={closeTaskDetailModal}
                className="text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="px-6 py-4">
              {/* Tipo de tarea */}
              <div className="mb-4">
                <span className={`px-2 py-1 text-xs rounded-full ${
                  selectedTaskDetails.type === 'subtask' ? 
                  'bg-indigo-100 text-indigo-800' : 
                  'bg-blue-100 text-blue-800'
                }`}>
                  {selectedTaskDetails.type === 'subtask' ? 'Subtarea' : 'Tarea'}
                </span>
                
                {/* Mostrar tarea principal solo para subtareas */}
                {selectedTaskDetails.type === 'subtask' && selectedTaskDetails.subtask_title && (
                  <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                    Tarea principal: {selectedTaskDetails.subtask_title}
                  </span>
                )}
                
                {selectedTaskDetails.priority && (
                  <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                    selectedTaskDetails.priority === 'high' ? 'bg-red-100 text-red-800' :
                    selectedTaskDetails.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    Prioridad: {
                      selectedTaskDetails.priority === 'high' ? 'Alta' :
                      selectedTaskDetails.priority === 'medium' ? 'Media' : 'Baja'
                    }
                  </span>
                )}
                
                <span className={`ml-2 px-2 py-1 text-xs rounded-full ${
                  selectedTaskDetails.status === 'pending' ? 'bg-gray-100 text-gray-800' :
                  selectedTaskDetails.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                  selectedTaskDetails.status === 'completed' ? 'bg-green-100 text-green-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  Estado: {
                    selectedTaskDetails.status === 'pending' ? 'Pendiente' :
                    selectedTaskDetails.status === 'in_progress' ? 'En progreso' :
                    selectedTaskDetails.status === 'completed' ? 'Completada' :
                    selectedTaskDetails.status
                  }
                </span>
              </div>
              
              {/* Descripción */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Descripción:</h4>
                <p className="text-gray-600">
                  {selectedTaskDetails.description || 'Sin descripción'}
                </p>
              </div>
              
              {/* Fechas con indicadores */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Fecha de inicio:</h4>
                  {selectedTaskDetails.start_date ? (
                    <div>
                      <p className="text-gray-600">
                        {format(new Date(selectedTaskDetails.start_date), 'dd/MM/yyyy')}
                      </p>
                      {/* Indicador de tiempo */}
                      <p className={`text-xs mt-1 ${getTimeIndicator(selectedTaskDetails.start_date, true).color}`}>
                        {getTimeIndicator(selectedTaskDetails.start_date, true).text}
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-500">No especificada</p>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Fecha límite:</h4>
                  {selectedTaskDetails.deadline ? (
                    <div>
                      <p className="text-gray-600">
                        {format(new Date(selectedTaskDetails.deadline), 'dd/MM/yyyy')}
                      </p>
                      {/* Indicador de tiempo */}
                      <p className={`text-xs mt-1 ${getTimeIndicator(selectedTaskDetails.deadline, false).color}`}>
                        {getTimeIndicator(selectedTaskDetails.deadline, false).text}
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-500">No especificada</p>
                  )}
                </div>
              </div>
              
              {/* Duración estimada */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Duración estimada:</h4>
                <p className="text-gray-600">
                  {Math.round((selectedTaskDetails.estimated_duration / 60) * 100) / 100} horas
                </p>
              </div>
              
              {/* Proyecto */}
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-1">Proyecto:</h4>
                <p className="text-blue-600">
                  {project?.name || 'No especificado'}
                </p>
              </div>
              
              {/* Secuencial */}
              {selectedTaskDetails.type === 'task' && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Tipo de ejecución:</h4>
                  <p className="text-gray-600">
                    {selectedTaskDetails.is_sequential ? 'Secuencial' : 'Paralela'}
                  </p>
                </div>
              )}
            </div>
            
            <div className="px-6 py-3 bg-gray-50 text-right border-t border-gray-200">
              <button
                onClick={closeTaskDetailModal}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 