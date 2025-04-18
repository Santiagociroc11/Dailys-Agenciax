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

// Add this function before the main component

function SubtaskSequenceDisplay({
  previousSubtask,
  selectedTaskDetails,
  nextSubtask,
  subtaskUsers
}: {
  previousSubtask: Subtask | null,
  selectedTaskDetails: Task,
  nextSubtask: Subtask | null,
  subtaskUsers: Record<string, string>
}) {
  return (
    <div className="mb-4">
      <h4 className="text-sm font-medium text-gray-700 mb-2">Secuencia de trabajo:</h4>

      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
        {/* Subtarea previa */}
        <div className="mb-3">
          <h5 className="text-xs font-medium text-gray-500 mb-1">TAREA ANTERIOR:</h5>
          {previousSubtask ? (
            <div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${previousSubtask.status === 'completed' ? 'bg-green-500' :
                    previousSubtask.status === 'in_progress' ? 'bg-yellow-500' :
                      'bg-gray-400'
                  }`}></div>
                <p className="text-sm font-medium text-gray-700">{previousSubtask.title}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${previousSubtask.status === 'completed' ? 'bg-green-100 text-green-800' :
                    previousSubtask.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                  }`}>
                  {previousSubtask.status === 'completed' ? 'Completada' :
                    previousSubtask.status === 'in_progress' ? 'En progreso' :
                      previousSubtask.status === 'pending' ? 'Pendiente' :
                        previousSubtask.status}
                </span>
              </div>
              {previousSubtask.assigned_to && (
                <div className="mt-1 ml-4 text-xs text-gray-500 flex items-center">
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Asignada a: &nbsp;<span className="font-medium text-blue-600">{subtaskUsers[nextSubtask.assigned_to] || 'Usuario'}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">No hay tarea anterior en la secuencia</p>
          )}
        </div>

        {/* Subtarea actual (referencia visual) */}
        <div className="mb-3 bg-yellow-50 p-2 rounded border-l-4 border-yellow-400">
          <h5 className="text-xs font-medium text-yellow-700 mb-1">TAREA ACTUAL:</h5>
          <p className="text-sm font-medium text-yellow-800">{selectedTaskDetails.title}</p>
        </div>

        {/* Subtarea siguiente */}
        <div>
          <h5 className="text-xs font-medium text-gray-500 mb-1">TAREA SIGUIENTE:</h5>
          {nextSubtask ? (
            <div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${nextSubtask.status === 'completed' ? 'bg-green-500' :
                    nextSubtask.status === 'in_progress' ? 'bg-yellow-500' :
                      'bg-gray-400'
                  }`}></div>
                <p className="text-sm font-medium text-gray-700">{nextSubtask.title}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${nextSubtask.status === 'completed' ? 'bg-green-100 text-green-800' :
                    nextSubtask.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                  }`}>
                  {nextSubtask.status === 'completed' ? 'Completada' :
                    nextSubtask.status === 'in_progress' ? 'En progreso' :
                      nextSubtask.status === 'pending' ? 'Pendiente' :
                        nextSubtask.status}
                </span>
              </div>
              {nextSubtask.assigned_to && (
                <div className="mt-1 ml-4 text-xs text-gray-500 flex items-center">
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Asignada a: &nbsp;<span className="font-medium text-blue-600">{subtaskUsers[nextSubtask.assigned_to] || 'Usuario'}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">No hay tarea siguiente en la secuencia</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UserProjectView() {
  const { projectId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'asignacion' | 'gestion'>('asignacion');
  const [project, setProject] = useState<Project | null>(null);
  const [taskItems, setTaskItems] = useState<Task[]>([]);
  const [assignedTaskItems, setAssignedTaskItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAssigned, setLoadingAssigned] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [totalEstimatedDuration, setTotalEstimatedDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedTaskDetails, setSelectedTaskDetails] = useState<Task | null>(null);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [sortBy, setSortBy] = useState<'deadline' | 'priority' | 'duration'>('deadline');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [dailyTasksIds, setDailyTasksIds] = useState<string[]>([]);
  const [previousSubtask, setPreviousSubtask] = useState<Subtask | null>(null);
  const [nextSubtask, setNextSubtask] = useState<Subtask | null>(null);
  const [subtaskUsers, setSubtaskUsers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (projectId) {
      fetchProject();
      fetchTodaysDailyTasks();
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId && dailyTasksIds !== undefined) {
      // Una vez que sabemos qué tareas están asignadas hoy, cargamos ambas listas
      fetchProjectTasksAndSubtasks();
      fetchAssignedTasks();
    }
  }, [projectId, dailyTasksIds]);

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

  // Función para cargar las tareas asignadas para hoy del usuario actual
  async function fetchTodaysDailyTasks() {
    if (!user) return;

    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      // Consultar task_work_assignments en lugar de daily_tasks
      const { data, error } = await supabase
        .from('task_work_assignments')
        .select('task_id, task_type')
        .eq('user_id', user.id)
        .eq('date', today);

      if (error) {
        console.error('Error al cargar tareas diarias:', error);
        setDailyTasksIds([]);
        return;
      }

      // Convertir al formato que espera la aplicación (mantiene compatibilidad con el código existente)
      const formattedIds = data.map(item => {
        if (item.task_type === 'subtask') {
          return `subtask-${item.task_id}`;
        }
        return item.task_id;
      });

      setDailyTasksIds(formattedIds || []);
    } catch (error) {
      console.error('Error al cargar tareas diarias:', error);
      setDailyTasksIds([]);
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
        .eq('status', 'pending')           // SOLO tareas en estado pendiente
        .order('deadline', { ascending: true });

      if (taskError) {
        console.error('Error al cargar tareas:', taskError);
        setError('Error al cargar tareas. Por favor, intenta de nuevo.');
        throw taskError;
      }

      console.log('Tareas pendientes cargadas:', taskData?.length);
      console.log('Detalle de tareas pendientes:', taskData?.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        deadline: t.deadline
      })));

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
        .eq('status', 'pending')           // SOLO subtareas en estado pendiente
        .order('sequence_order', { ascending: true });

      if (subtaskError) {
        console.error('Error al cargar subtareas:', subtaskError);
        setError('Error al cargar subtareas. Por favor, intenta de nuevo.');
        throw subtaskError;
      }

      console.log('Subtareas pendientes cargadas:', subtaskData?.length);
      console.log('Detalle de subtareas pendientes:', subtaskData?.map(s => ({
        id: s.id,
        title: s.title,
        status: s.status,
        task_id: s.task_id
      })));

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

      // 12. Combinar y filtrar tareas que YA están asignadas
      const allTasksWithoutAssigned = [...tasksAsTaskItems, ...subtasksAsTaskItems].filter(task => {
        if (task.type === 'subtask' && task.original_id) {
          return !dailyTasksIds.includes(task.original_id);
        }
        return !dailyTasksIds.includes(task.id);
      });

      // Log para depuración
      console.log('Detalles de las tareas a mostrar:', {
        tasksWithoutSubtasks: tasksWithoutSubtasksItems.length,
        subtareas: subtasksAsTaskItems.length,
        total: allTasksWithoutAssigned.length,
        tasksQueryInfo: {
          project_id: projectId,
          user_id: user.id,
          'contains(assigned_users)': [user.id]
        }
      });

      // Ordenar según el criterio actual
      const sortedTasks = [...allTasksWithoutAssigned].sort((a, b) => {
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

  async function handleViewTaskDetails(task: Task) {
    setSelectedTaskDetails(task);
    setShowTaskDetailModal(true);

    // Reset subtask info
    setPreviousSubtask(null);
    setNextSubtask(null);
    setSubtaskUsers({});

    // If it's a subtask, fetch related subtasks info
    if (task.type === 'subtask' && task.original_id) {
      try {
        // First, get the current subtask to know its parent task and sequence order
        const { data: currentSubtask, error: currentError } = await supabase
          .from('subtasks')
          .select('id, title, task_id, sequence_order, status')
          .eq('id', task.original_id)
          .single();

        if (currentError) {
          console.error('Error fetching current subtask details:', currentError);
          return;
        }

        if (currentSubtask && currentSubtask.task_id) {
          // Get all subtasks for this parent task
          const { data: relatedSubtasks, error: relatedError } = await supabase
            .from('subtasks')
            .select('id, title, sequence_order, status, assigned_to')
            .eq('task_id', currentSubtask.task_id)
            .order('sequence_order', { ascending: true });

          if (relatedError) {
            console.error('Error fetching related subtasks:', relatedError);
            return;
          }

          if (relatedSubtasks && relatedSubtasks.length > 0) {
            // Find the index of current subtask in the ordered list
            const currentIndex = relatedSubtasks.findIndex(s => s.id === task.original_id);

            if (currentIndex > 0) {
              // There is a previous subtask
              setPreviousSubtask(relatedSubtasks[currentIndex - 1]);
              console.log('Previous subtask:', relatedSubtasks[currentIndex - 1]);
            }

            if (currentIndex < relatedSubtasks.length - 1) {
              // There is a next subtask
              setNextSubtask(relatedSubtasks[currentIndex + 1]);
              console.log('Next subtask:', relatedSubtasks[currentIndex + 1]);
            }

            // Get user info for all related subtasks
            const assignedUserIds = relatedSubtasks
              .filter(s => s.assigned_to)
              .map(s => s.assigned_to);

            console.log('Assigned user IDs:', assignedUserIds);

            if (assignedUserIds.length > 0) {
              // Since neither users.user_metadata nor profiles table exists,
              // create a simplified user map with just the user IDs
              const userMap: Record<string, string> = {};
              assignedUserIds.forEach(id => {
                // Use a simple format that shows part of the ID for identification
                userMap[id] = `Usuario ${id.substring(0, 6)}`;
              });
              setSubtaskUsers(userMap);

              // Optionally, try to fetch at least basic user info if the table exists
              try {
                const { data: basicUsers } = await supabase
                  .from('users')
                  .select('id, name')
                  .in('id', assignedUserIds);

                if (basicUsers && basicUsers.length > 0) {
                  basicUsers.forEach(user => {
                    if (user.id && user.name) {
                      userMap[user.id] = user.name;
                    }
                  });
                  setSubtaskUsers({ ...userMap });
                }
              } catch (error) {
                console.log('Using basic user identifiers');
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching subtask sequence info:', error);
      }
    }
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

  function handleShowConfirmModal() {
    if (selectedTasks.length === 0) {
      alert('Por favor, selecciona al menos una tarea para asignar');
      return;
    }
    setShowConfirmModal(true);
  }

  function handleConfirmSave() {
    handleSaveSelectedTasks();
    setShowConfirmModal(false);
  }

  async function handleSaveSelectedTasks() {
    if (selectedTasks.length === 0) {
      alert('Por favor, selecciona al menos una tarea para asignar');
      return;
    }

    if (!user || !projectId) {
      alert('Información de usuario o proyecto no disponible');
      return;
    }

    setSaving(true);

    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      // Array para guardar IDs que necesitarán actualización de estado
      const taskIdsToUpdate: string[] = [];
      const subtaskIdsToUpdate: string[] = [];
      const parentTasksOfSubtasks = new Set<string>();

      // 1. Separar tareas y subtareas seleccionadas
      for (const taskId of selectedTasks) {
        const task = taskItems.find(t => t.id === taskId);
        if (!task) continue;

        if (task.type === 'subtask') {
          const originalId = task.id.replace('subtask-', '');
          subtaskIdsToUpdate.push(originalId);
        } else {
          taskIdsToUpdate.push(task.id);
        }
      }

      // 2. Obtener las tareas principales de las subtareas
      if (subtaskIdsToUpdate.length > 0) {
        const { data: subtasks, error: subtasksError } = await supabase
          .from('subtasks')
          .select('task_id')
          .in('id', subtaskIdsToUpdate);

        if (subtasksError) {
          console.error('Error al obtener tareas principales:', subtasksError);
        } else if (subtasks) {
          // Agregar los IDs de tareas principales al conjunto
          subtasks.forEach(subtask => {
            if (subtask.task_id) {
              parentTasksOfSubtasks.add(subtask.task_id);
            }
          });
        }
      }

      // 3. Generar las entradas para task_work_assignments
      const tasksToSave = selectedTasks.map(taskId => {
        const task = taskItems.find(t => t.id === taskId);
        if (!task) return null;

        const isSubtask = task.type === 'subtask';
        const originalId = isSubtask ? task.id.replace('subtask-', '') : task.id;

        return {
          user_id: user.id,
          date: today,
          task_id: originalId,
          task_type: isSubtask ? 'subtask' : 'task',
          project_id: task.project_id,
          estimated_duration: task.estimated_duration,
          status: 'assigned', // Todas las tareas y subtareas se asignan con estado "assigned"
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }).filter(task => task !== null);

      // 4. Insertar en task_work_assignments
      const { error } = await supabase
        .from('task_work_assignments')
        .upsert(tasksToSave, {
          onConflict: 'user_id,date,task_id,task_type',
          ignoreDuplicates: false // actualizar si ya existe
        });

      if (error) {
        console.error('Error al guardar tareas:', error);
        throw error;
      }

      console.log("Tareas guardadas:", tasksToSave.length);

      // 5. Actualizar estado de subtareas a "assigned"
      if (subtaskIdsToUpdate.length > 0) {
        const { data: updatedSubtasks, error: updateSubtaskError } = await supabase
          .from('subtasks')
          .update({ status: 'assigned' })
          .in('id', subtaskIdsToUpdate)
          .select('id, title, status');

        if (updateSubtaskError) {
          console.error('Error al actualizar estado de subtareas:', updateSubtaskError);
        } else {
          console.log(`${updatedSubtasks?.length || 0} subtareas actualizadas a estado 'assigned':`, updatedSubtasks);
        }
      }

      // 6. Actualizar estado de tareas principales sin subtareas a "assigned"
      if (taskIdsToUpdate.length > 0) {
        const { data: updatedTasks, error: updateTaskError } = await supabase
          .from('tasks')
          .update({ status: 'assigned' })
          .in('id', taskIdsToUpdate)
          .select('id, title, status');

        if (updateTaskError) {
          console.error('Error al actualizar estado de tareas:', updateTaskError);
        } else {
          console.log(`${updatedTasks?.length || 0} tareas actualizadas a estado 'assigned':`, updatedTasks);
        }
      }

      // 7. Actualizar estado de tareas principales que tienen subtareas asignadas a "in_progress"
      if (parentTasksOfSubtasks.size > 0) {
        const parentTaskIds = Array.from(parentTasksOfSubtasks);
        const { data: updatedParentTasks, error: updateParentError } = await supabase
          .from('tasks')
          .update({ status: 'in_progress' })
          .in('id', parentTaskIds)
          .select('id, title, status');

        if (updateParentError) {
          console.error('Error al actualizar estado de tareas principales:', updateParentError);
        } else {
          console.log(`${updatedParentTasks?.length || 0} tareas principales actualizadas a estado 'in_progress':`, updatedParentTasks);
        }
      }

      // Recargar los IDs de las tareas asignadas
      await fetchTodaysDailyTasks();

      // Limpiar las tareas seleccionadas
      setSelectedTasks([]);

      // Cambiar a la pestaña de gestión
      setActiveTab('gestion');

      // Actualizar ambas listas de tareas
      await fetchProjectTasksAndSubtasks();
      await fetchAssignedTasks();

      // Mostrar mensaje de éxito
      alert('Tareas asignadas correctamente');
    } catch (error) {
      console.error('Error saving daily tasks:', error);
      alert('Error al guardar las tareas. Por favor, intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  // Función para actualizar el estado de una tarea asignada
  async function handleUpdateTaskStatus(taskId: string, newStatus: string) {
    if (!user || !taskId) return;

    try {
      // Determinar si es tarea o subtarea
      const isSubtask = taskId.startsWith('subtask-');
      const originalId = isSubtask ? taskId.replace('subtask-', '') : taskId;
      const table = isSubtask ? 'subtasks' : 'tasks';

      // Actualizar el estado en la tabla de tareas/subtareas
      const { error: taskUpdateError } = await supabase
        .from(table)
        .update({ status: newStatus })
        .eq('id', originalId);

      if (taskUpdateError) throw taskUpdateError;

      // También actualizar en task_work_assignments
      const today = format(new Date(), 'yyyy-MM-dd');
      const taskType = isSubtask ? 'subtask' : 'task';

      const { error: assignmentUpdateError } = await supabase
        .from('task_work_assignments')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
          ...(newStatus === 'completed' ? { end_time: new Date().toISOString() } : {})
        })
        .eq('user_id', user.id)
        .eq('date', today)
        .eq('task_id', originalId)
        .eq('task_type', taskType);

      if (assignmentUpdateError) {
        console.error('Error al actualizar estado en asignaciones:', assignmentUpdateError);
      }

      // Si es una subtarea y se ha completado, verificar si todas las subtareas de la tarea principal están completadas
      if (isSubtask && newStatus === 'completed') {
        // Obtener el ID de la tarea principal
        const { data: subtaskData, error: subtaskError } = await supabase
          .from('subtasks')
          .select('task_id')
          .eq('id', originalId)
          .single();

        if (subtaskError) {
          console.error('Error al obtener tarea principal:', subtaskError);
        } else if (subtaskData && subtaskData.task_id) {
          const parentTaskId = subtaskData.task_id;

          // Verificar el estado de todas las subtareas de esta tarea principal
          const { data: allSubtasks, error: allSubtasksError } = await supabase
            .from('subtasks')
            .select('id, status')
            .eq('task_id', parentTaskId);

          if (allSubtasksError) {
            console.error('Error al verificar estado de subtareas:', allSubtasksError);
          } else if (allSubtasks && allSubtasks.length > 0) {
            // Verificar si todas las subtareas están completadas
            const allCompleted = allSubtasks.every(subtask =>
              subtask.status === 'completed' || subtask.status === 'approved'
            );

            // Si todas las subtareas están completadas, actualizar la tarea principal a completada
            if (allCompleted) {
              const { error: updateParentError } = await supabase
                .from('tasks')
                .update({ status: 'completed' })
                .eq('id', parentTaskId);

              if (updateParentError) {
                console.error('Error al actualizar estado de tarea principal:', updateParentError);
              } else {
                console.log('Tarea principal actualizada a completada:', parentTaskId);

                // También actualizar el estado local si la tarea principal está en la lista
                setAssignedTaskItems(prev =>
                  prev.map(task =>
                    task.id === parentTaskId
                      ? { ...task, status: 'completed' }
                      : task
                  )
                );
              }
            } else {
              // Si no todas están completadas, asegurar que la tarea principal esté en "in_progress"
              const { error: updateParentError } = await supabase
                .from('tasks')
                .update({ status: 'in_progress' })
                .eq('id', parentTaskId);

              if (updateParentError) {
                console.error('Error al actualizar estado de tarea principal:', updateParentError);
              }
            }
          }
        }
      }

      // Actualizar el estado local
      setAssignedTaskItems(prev =>
        prev.map(task =>
          task.id === taskId
            ? { ...task, status: newStatus }
            : task
        )
      );

      // Mensaje de confirmación
      alert(`Estado actualizado a: ${newStatus}`);
    } catch (error) {
      console.error('Error al actualizar estado:', error);
      alert('Error al actualizar el estado. Por favor, intenta de nuevo.');
    }
  }

  // Función para cargar las tareas asignadas para hoy
  async function fetchAssignedTasks() {
    if (!user || !projectId) {
      setAssignedTaskItems([]);
      setLoadingAssigned(false);
      return;
    }

    if (!dailyTasksIds || dailyTasksIds.length === 0) {
      setAssignedTaskItems([]);
      setLoadingAssigned(false);
      return;
    }

    setLoadingAssigned(true);

    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      // Obtener asignaciones desde task_work_assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from('task_work_assignments')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .eq('project_id', projectId);

      if (assignmentsError) {
        console.error('Error al cargar asignaciones:', assignmentsError);
        setAssignedTaskItems([]);
        setLoadingAssigned(false);
        return;
      }

      // Array para todas las tareas asignadas
      let allAssignedItems: Task[] = [];

      // IDs de tareas y subtareas
      const normalTaskIds = assignments
        .filter(a => a.task_type === 'task')
        .map(a => a.task_id);

      const subtaskIds = assignments
        .filter(a => a.task_type === 'subtask')
        .map(a => a.task_id);

      console.log("IDs buscando - Tareas:", normalTaskIds);
      console.log("IDs buscando - Subtareas:", subtaskIds);

      // Obtener detalles de tareas normales
      if (normalTaskIds.length > 0) {
        const { data: taskData, error: taskError } = await supabase
          .from('tasks')
          .select('*')
          .in('id', normalTaskIds);

        if (taskError) {
          console.error('Error al cargar tareas asignadas:', taskError);
        } else if (taskData && taskData.length > 0) {
          const formattedTasks = taskData.map(task => {
            // Buscar la asignación correspondiente para obtener status actualizado
            const assignment = assignments.find(a =>
              a.task_id === task.id && a.task_type === 'task'
            );

            return {
              id: task.id,
              original_id: task.id,
              title: task.title,
              description: task.description,
              priority: task.priority,
              estimated_duration: task.estimated_duration,
              start_date: task.start_date,
              deadline: task.deadline,
              status: assignment?.status || task.status, // Priorizar estado de la asignación
              is_sequential: task.is_sequential,
              project_id: task.project_id,
              type: 'task' as 'task' | 'subtask'  // Type assertion para evitar errores
            };
          });

          allAssignedItems = [...allAssignedItems, ...formattedTasks];
        }
      }

      // Obtener detalles de subtareas
      if (subtaskIds.length > 0) {
        const { data: subtaskData, error: subtaskError } = await supabase
          .from('subtasks')
          .select(`
            *,
            tasks (
              id, title, is_sequential, project_id
            )
          `)
          .in('id', subtaskIds);

        if (subtaskError) {
          console.error('Error al cargar subtareas asignadas:', subtaskError);
        } else if (subtaskData && subtaskData.length > 0) {
          const formattedSubtasks = subtaskData.map(subtask => {
            // Buscar la asignación correspondiente para obtener status actualizado
            const assignment = assignments.find(a =>
              a.task_id === subtask.id && a.task_type === 'subtask'
            );

            return {
              id: `subtask-${subtask.id}`,
              original_id: subtask.id,
              title: subtask.title,
              subtask_title: subtask.tasks?.title || "Tarea principal",
              description: subtask.description,
              priority: 'medium' as 'low' | 'medium' | 'high',  // Type assertion
              estimated_duration: subtask.estimated_duration,
              start_date: subtask.start_date || '',
              deadline: subtask.deadline || '',
              status: assignment?.status || subtask.status, // Priorizar estado de la asignación
              is_sequential: false,
              project_id: subtask.tasks?.project_id || '',
              type: 'subtask' as 'task' | 'subtask'  // Type assertion
            };
          });

          allAssignedItems = [...allAssignedItems, ...formattedSubtasks];
        }
      }

      console.log("Tareas asignadas cargadas:", allAssignedItems.length);
      setAssignedTaskItems(allAssignedItems);
    } catch (error) {
      console.error('Error al cargar tareas asignadas:', error);
    } finally {
      setLoadingAssigned(false);
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
            className={`mr-4 py-2 px-4 font-medium ${activeTab === 'asignacion'
                ? 'border-b-2 border-yellow-500 text-yellow-600'
                : 'text-gray-500 hover:text-gray-700'
              }`}
            onClick={() => setActiveTab('asignacion')}
          >
            ASIGNACION
          </button>
          <button
            className={`py-2 px-4 font-medium ${activeTab === 'gestion'
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
                className={`px-4 py-2 text-sm rounded-md flex items-center ${sortBy === 'deadline'
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
                className={`px-4 py-2 text-sm rounded-md flex items-center ${sortBy === 'priority'
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
                className={`px-4 py-2 text-sm rounded-md flex items-center ${sortBy === 'duration'
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
              onClick={handleShowConfirmModal}
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
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold">GESTIÓN DE TAREAS ASIGNADAS</h2>
            <p className="text-sm text-gray-600 mt-1">Administra las tareas que has asignado para trabajar hoy</p>
          </div>

          {/* Task list container para tareas asignadas */}
          <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden mb-6">
            {/* Task list header */}
            <div className="grid grid-cols-7 gap-4 p-3 border-b-2 border-gray-300 font-medium text-gray-700 bg-gray-50">
              <div>ACTIVIDAD</div>
              <div>DESCRIPCION</div>
              <div>INICIO</div>
              <div>FIN</div>
              <div>DURACIÓN</div>
              <div>ESTADO</div>
              <div>ACCIONES</div>
            </div>

            {/* Task list */}
            <div className="divide-y divide-gray-200">
              {loadingAssigned ? (
                <div className="py-8 text-center text-gray-500 bg-white">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-800 mx-auto mb-2"></div>
                  <p>Cargando tareas asignadas...</p>
                </div>
              ) : assignedTaskItems.length > 0 ? (
                assignedTaskItems.map((task) => (
                  <div key={task.id} className="grid grid-cols-7 gap-4 py-3 items-center bg-white hover:bg-gray-50 px-3">
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
                    <div>
                      <span className={`px-2 py-1 text-xs rounded-full ${task.status === 'pending' ? 'bg-gray-100 text-gray-800' :
                          task.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                            task.status === 'completed' ? 'bg-green-100 text-green-800' :
                              'bg-blue-100 text-blue-800'
                        }`}>
                        {task.status === 'pending' ? 'Pendiente' :
                          task.status === 'in_progress' ? 'En progreso' :
                            task.status === 'completed' ? 'Completada' :
                              task.status}
                      </span>
                    </div>
                    <div>
                      <select
                        className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                        value={task.status}
                        onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value)}
                      >
                        <option value="pending">Pendiente</option>
                        <option value="in_progress">En progreso</option>
                        <option value="completed">Completada</option>
                      </select>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center bg-white">
                  <p className="text-gray-500 mb-2">No hay tareas asignadas para hoy.</p>
                  <p className="text-sm text-gray-400">Selecciona tareas en la pestaña "ASIGNACION" para trabajar en ellas.</p>
                </div>
              )}
            </div>
          </div>

          {/* Resumen de tiempos */}
          {assignedTaskItems.length > 0 && (
            <div className="mt-6 p-4 bg-white rounded-md shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium mb-3">Resumen de trabajo</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-sm text-gray-600">Total de tareas</p>
                  <p className="text-xl font-bold">{assignedTaskItems.length}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-sm text-gray-600">Tareas completadas</p>
                  <p className="text-xl font-bold">
                    {assignedTaskItems.filter(t => t.status === 'completed').length}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-sm text-gray-600">Duración total</p>
                  <p className="text-xl font-bold">
                    {Math.round((assignedTaskItems.reduce((acc, t) => acc + t.estimated_duration, 0) / 60) * 100) / 100} HORAS
                  </p>
                </div>
              </div>
            </div>
          )}
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
                onClick={handleConfirmSave}
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
                <span className={`px-2 py-1 text-xs rounded-full ${selectedTaskDetails.type === 'subtask' ?
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
                  <span className={`ml-2 px-2 py-1 text-xs rounded-full ${selectedTaskDetails.priority === 'high' ? 'bg-red-100 text-red-800' :
                      selectedTaskDetails.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                    }`}>
                    Prioridad: {
                      selectedTaskDetails.priority === 'high' ? 'Alta' :
                        selectedTaskDetails.priority === 'medium' ? 'Media' : 'Baja'
                    }
                  </span>
                )}

                <span className={`ml-2 px-2 py-1 text-xs rounded-full ${selectedTaskDetails.status === 'pending' ? 'bg-gray-100 text-gray-800' :
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

              {/* Información de secuencia para subtareas */}
              {selectedTaskDetails.type === 'subtask' && (
                <SubtaskSequenceDisplay
                  previousSubtask={previousSubtask}
                  selectedTaskDetails={selectedTaskDetails}
                  nextSubtask={nextSubtask}
                  subtaskUsers={subtaskUsers}
                />
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