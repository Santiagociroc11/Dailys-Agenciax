import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format, isWithinInterval, parseISO, differenceInDays, isBefore, isAfter, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import TaskStatusDisplay from '../components/TaskStatusDisplay';

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
  assignment_date?: string;
  notes?: string | TaskNotes;
}

// Interfaz para los metadatos de las notas de las tareas
interface TaskNotes {
  notes?: string;
  entregables?: string;
  duracion_real?: number;
  unidad_original?: 'minutes' | 'hours';
  razon_duracion?: string;
  razon_bloqueo?: string;
  returned_feedback?: string;  // Retroalimentación al devolver una tarea
  returned_at?: string;        // Fecha de devolución
  returned_by?: string;        // Usuario que devolvió la tarea
  [key: string]: any; // Para permitir otras propiedades
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
  subtask_id: string;
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
    <div>
      <div className="mb-8 grid grid-cols-3 gap-4">
        {/* Subtarea anterior */}
        <div>
          <h5 className="text-xs font-medium text-gray-500 mb-1">TAREA ANTERIOR:</h5>
          {previousSubtask ? (
            <div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${previousSubtask.status === 'completed' ? 'bg-green-500' :
                  previousSubtask.status === 'in_progress' ? 'bg-yellow-500' :
                    'bg-gray-400'
                  }`}></div>
                <p className="text-sm font-medium text-gray-700">{previousSubtask.title}</p>
                <TaskStatusDisplay status={previousSubtask.status} className="text-xs px-2 py-0.5" />
              </div>
              {previousSubtask.assigned_to && (
                <div className="mt-1 ml-4 text-xs text-gray-500 flex items-center">
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Asignada a: &nbsp;<span className="font-medium text-blue-600">{previousSubtask?.assigned_to ? subtaskUsers[previousSubtask.assigned_to] || 'Usuario' : 'No asignado'}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">No hay tarea anterior en la secuencia</p>
          )}
        </div>

        {/* Tarea actual */}
        <div>
          <h5 className="text-xs font-medium text-blue-600 mb-1">TAREA ACTUAL:</h5>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
            <p className="text-sm font-medium text-blue-800">{selectedTaskDetails.title}</p>
          </div>
          {selectedTaskDetails.type === 'subtask' && selectedTaskDetails.assigned_users && selectedTaskDetails.assigned_users[0] && (
            <div className="mt-1 ml-4 text-xs text-gray-500 flex items-center">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Asignada a: &nbsp;<span className="font-medium text-blue-600">{selectedTaskDetails.assigned_users[0] ? subtaskUsers[selectedTaskDetails.assigned_users[0]] || 'Usuario' : 'No asignado'}</span>
            </div>
          )}
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
                <TaskStatusDisplay status={nextSubtask.status} className="text-xs px-2 py-0.5" />
              </div>
              {nextSubtask.assigned_to && (
                <div className="mt-1 ml-4 text-xs text-gray-500 flex items-center">
                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Asignada a: &nbsp;<span className="font-medium text-blue-600">{nextSubtask?.assigned_to ? subtaskUsers[nextSubtask.assigned_to] || 'Usuario' : 'No asignado'}</span>
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
  const { user } = useAuth();
  const { projectId } = useParams();
  const navigate = useNavigate();

  // Estados para datos principales
  const [project, setProject] = useState<Project | null>(null);
  const [taskItems, setTaskItems] = useState<Task[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [assignedTaskItems, setAssignedTaskItems] = useState<Task[]>([]);
  const [delayedTaskItems, setDelayedTaskItems] = useState<Task[]>([]);
  const [returnedTaskItems, setReturnedTaskItems] = useState<Task[]>([]);  // Lista para tareas devueltas
  const [completedTaskItems, setCompletedTaskItems] = useState<Task[]>([]);
  const [dailyTasksIds, setDailyTasksIds] = useState<string[] | null>(null);

  // Estados para UI
  const [activeTab, setActiveTab] = useState('asignacion');
  const [activeGestionSubTab, setActiveGestionSubTab] = useState('pendientes');
  const [sortBy, setSortBy] = useState<'deadline' | 'priority' | 'duration'>('deadline');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Estados para carga
  const [loading, setLoading] = useState(true);
  const [isDataInitialized, setIsDataInitialized] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [loadingCompleted, setLoadingCompleted] = useState(false);

  // Estados para cálculos
  const [totalEstimatedDuration, setTotalEstimatedDuration] = useState(0);
  const [totalAssignedTime, setTotalAssignedTime] = useState(0);
  const [totalDelayedTime, setTotalDelayedTime] = useState(0);
  const [totalDelayedDays, setTotalDelayedDays] = useState(0);

  // Estados para modales
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showReturnedFeedbackModal, setShowReturnedFeedbackModal] = useState(false);
  const [selectedReturnedTask, setSelectedReturnedTask] = useState<Task | null>(null);

  // Estados para detalles de tareas y subtareas
  const [selectedTaskDetails, setSelectedTaskDetails] = useState<Task | null>(null);
  const [previousSubtask, setPreviousSubtask] = useState<Subtask | null>(null);
  const [nextSubtask, setNextSubtask] = useState<Subtask | null>(null);
  const [subtaskUsers, setSubtaskUsers] = useState<Record<string, string>>({});

  // Estados para actualización de estado
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('completed');
  const [statusDetails, setStatusDetails] = useState('');
  const [actualDuration, setActualDuration] = useState<number>(0);
  const [durationUnit, setDurationUnit] = useState<'minutes' | 'hours'>('minutes');
  const [durationReason, setDurationReason] = useState('');
  const [statusError, setStatusError] = useState<string | null>(null);

  // Estado para guardar
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) {
      // Resetear estados importantes al cambiar de proyecto
      setLoading(true);
      setError(null);
      setTaskItems([]);

      console.log('📌 [DEBUG] Iniciando carga de proyecto ID:', projectId);
      // Primero cargar el proyecto y las tareas diarias
      fetchProject();

      // Cargar tareas diarias de forma asíncrona
      const loadData = async () => {
        try {
          await fetchTodaysDailyTasks();
        } catch (error) {
          console.error('Error cargando tareas diarias:', error);
          // Si falla, asegurar que podamos continuar
          setDailyTasksIds([]);
          setLoading(false);
        }
      };
      loadData();
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId && dailyTasksIds !== undefined) {
      console.log('🔄 [DEBUG] dailyTasksIds actualizados:', dailyTasksIds?.length || 0);

      // Activar explícitamente el estado de filtrado desde el inicio
      setIsFiltering(true);

      // Pequeño retraso para asegurar que la UI muestre el estado de carga
      setTimeout(() => {
        // Iniciar el proceso de carga
        fetchProjectTasksAndSubtasks();
        fetchAssignedTasks();
        fetchCompletedTasks(); // Cargar también las completadas para verificar duplicados
      }, 50);
    }
  }, [projectId, dailyTasksIds]);

  useEffect(() => {
    if (activeTab === 'gestion' && activeGestionSubTab === 'completadas' && projectId && user) {
      console.log('🔄 [DEBUG] Recargando tareas completadas por cambio de tab');
      fetchCompletedTasks();
    }
  }, [activeTab, activeGestionSubTab, projectId, user]);

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

  useEffect(() => {
    // Este efecto se activa cuando cambian las tareas o el estado de filtrado
    if (!isFiltering && taskItems.length > 0 && isDataInitialized) {
      console.log('🔄 [DEBUG] Verificación final de datos:', {
        totalTareas: taskItems.length,
        filtrando: isFiltering,
        inicializado: isDataInitialized
      });

      // Realizar una última comprobación para asegurar que solo mostramos las tareas que deberían estar visibles
      // Esta es una segunda capa de verificación para evitar parpadeos
      const dailyTasksSet = new Set(dailyTasksIds || []);

      // Verificar si hay alguna tarea que debería estar filtrada pero se está mostrando
      const shouldFilter = taskItems.some(task => {
        const isSubtask = task.type === 'subtask';
        const idToCompare = isSubtask && task.original_id
          ? `subtask-${task.original_id}`
          : task.id;

        return dailyTasksSet.has(idToCompare);
      });

      // Si encontramos alguna tarea que debería filtrarse, volver a activar el filtrado
      if (shouldFilter) {
        console.log('⚠️ [DEBUG] Se detectaron tareas que deberían estar filtradas, re-ejecutando filtrado');
        setIsFiltering(true);

        // Asíncrono para permitir que la UI muestre el estado de filtrado
        setTimeout(() => {
          // Filtrar de nuevo
          const properlyFilteredTasks = taskItems.filter(task => {
            const isSubtask = task.type === 'subtask';
            const idToCompare = isSubtask && task.original_id
              ? `subtask-${task.original_id}`
              : task.id;

            return !dailyTasksSet.has(idToCompare);
          });

          // Actualizar el estado con las tareas correctamente filtradas
          setTaskItems(properlyFilteredTasks);

          // Desactivar el estado de filtrado
          setTimeout(() => {
            setIsFiltering(false);
          }, 50);
        }, 50);
      }
    }
  }, [taskItems, isFiltering, isDataInitialized, dailyTasksIds]);

  useEffect(() => {
    if (activeTab === 'gestion' && activeGestionSubTab === 'pendientes') {
      // Verificar si hay tareas que aparecen en ambas listas (pendientes y completadas)
      const pendingTasks = [...assignedTaskItems, ...delayedTaskItems];
      const duplicates = pendingTasks.filter(pendingTask =>
        completedTaskItems.some(completedTask => completedTask.id === pendingTask.id)
      );

      if (duplicates.length > 0) {
        console.log('⚠️ [DUPLICADOS] Tareas que aparecen tanto en pendientes como completadas:',
          duplicates.map(t => ({ id: t.id, title: t.title, status: t.status }))
        );
      }
    }
  }, [activeTab, activeGestionSubTab, assignedTaskItems, delayedTaskItems, completedTaskItems]);

  useEffect(() => {
    // Log de conteo de tareas en cada cambio de las listas
    console.log('📊 [TAREAS] Estado actual de las listas:', {
      pendientes: assignedTaskItems.length,
      retrasadas: delayedTaskItems.length,
      completadas: completedTaskItems.length,
      pendientesIds: assignedTaskItems.map(t => t.id),
      completadasIds: completedTaskItems.map(t => t.id),
    });
  }, [assignedTaskItems, delayedTaskItems, completedTaskItems]);

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
        .select('task_id, task_type, status, subtask_id')
        .eq('user_id', user.id)
        .eq('date', today);

      if (error) {
        console.error('Error al cargar tareas diarias:', error);
        setDailyTasksIds([]);
        return;
      }

      // Asegurar el formato correcto de IDs para el filtrado
      const formattedIds = data.map(item => {
        // Formato especial para subtareas
        const formattedId = item.task_type === 'subtask'
          ? `subtask-${item.subtask_id}`
          : item.task_id;

        // Loguear cada ID para verificar formato
        console.log(`📍 [DEBUG] Formateando ID de tarea diaria: tipo=${item.task_type}, original=${item.task_id} → formateado=${formattedId}, estado=${item.status}`);

        return formattedId;
      });

      console.log('📅 [DEBUG] Tareas asignadas para hoy:', {
        fecha: today,
        totalTareas: formattedIds.length,
        ids: formattedIds,
        datosOriginales: data
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
      setIsDataInitialized(true);
      return;
    }

    try {
      setLoading(true);
      setIsFiltering(true); // Indicar que estamos en proceso de filtrado
      setError(null);
      const today = new Date();
      const formattedToday = format(today, 'yyyy-MM-dd');

      console.log('🔍 [DEBUG] Iniciando fetchProjectTasksAndSubtasks...');

      // 1. Obtener todas las tareas del proyecto
      const { data: allTasksData, error: allTasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .not('status', 'in', '(approved, assigned)')  // Excluir tareas aprobadas y asignadas
        .order('deadline', { ascending: true });

      if (allTasksError) {
        console.error('Error al cargar todas las tareas:', allTasksError);
        setError('Error al cargar tareas. Por favor, intenta de nuevo.');
        throw allTasksError;
      }

      // 2. Obtener todas las tareas del proyecto asignadas al usuario (independientemente del estado)
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .contains('assigned_users', [user.id])
        .not('status', 'in', '(approved, completed)')  // Excluimos solo las completamente terminadas
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
        .not('status', 'in', '(completed, approved, assigned)')  // Excluir subtareas completadas, aprobadas y asignadas
        .order('sequence_order', { ascending: true });

      if (allSubtasksError) {
        console.error('Error al cargar todas las subtareas:', allSubtasksError);
        setError('Error al cargar subtareas. Por favor, intenta de nuevo.');
        throw allSubtasksError;
      }

      // 4. Obtener todas las subtareas asignadas al usuario para este proyecto
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
        .not('status', 'in', '(approved, completed)')  // Excluimos solo las completamente terminadas
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

      // 9. Incluir todas las subtareas relevantes sin filtrar por fecha
      // Ya no aplicamos ningún filtro de fecha aquí, mostramos todas las subtareas relevantes
      const allRelevantSubtasks = relevantSubtasks;

      // 10. Convertir subtareas al formato de tarea para mostrarlas
      const subtasksAsTaskItems: Task[] = allRelevantSubtasks.map(subtask => {
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

      // 12. Filtrado principal: Mostrar TODAS las tareas disponibles para este proyecto EXCEPTO las que ya están asignadas para hoy
      // Este es ahora el único filtro - no filtramos por fecha ni por estado, solo quitamos las que ya están asignadas hoy
      const allTasksWithoutAssigned = [...tasksAsTaskItems, ...subtasksAsTaskItems].filter(task => {
        // Determinar el ID correcto para la comparación (con el formato exacto)
        const isSubtask = task.type === 'subtask';
        const idToCompare = isSubtask && task.original_id
          ? `subtask-${task.original_id}`
          : task.id;

        // Verificar si esta tarea ya está asignada hoy
        const isAlreadyAssigned = dailyTasksIds?.includes(idToCompare) || false;
        
        // También verificar el estado de la tarea
        const isAssignedStatus = task.status === 'assigned' || task.status === 'in_progress';

        // SUPER IMPORTANTE: log detallado para depuración
        console.log(`🔍 [DEBUG] Verificando tarea: ${task.title} (${idToCompare})`, {
          isSubtask,
          id: task.id,
          originalId: task.original_id,
          idToCompare,
          estaAsignada: isAlreadyAssigned,
          estadoAsignado: isAssignedStatus,
          estado: task.status,
          dailyTasksIds
        });

        // Retornar el resultado de la comparación (false significa que se filtra = no aparece)
        // No mostrar si está ya asignada o si tiene estado assigned/in_progress
        return !isAlreadyAssigned && !isAssignedStatus;
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

      // Actualizar el estado en un único lote para evitar renderizados parciales
      console.log('✅ [DEBUG] Finalizando fetchProjectTasksAndSubtasks. Tareas filtradas:', sortedTasks.length);

      // Actualizar los datos pero mantener isFiltering=true hasta después del renderizado
      setTaskItems(sortedTasks);
      setIsDataInitialized(true);

      // Usar setTimeout para asegurar que el DOM se actualice antes de quitar el estado de filtrado
      setTimeout(() => {
        setIsFiltering(false);
        setLoading(false);
      }, 50);

    } catch (error) {
      console.error('❌ [DEBUG] Error en fetchProjectTasksAndSubtasks:', error);
      setError('Error al cargar tareas. Por favor, intenta de nuevo.');
      setIsDataInitialized(true);
      setIsFiltering(false);
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
      toast.error('Por favor, selecciona al menos una tarea para asignar');
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
      toast.error('Por favor, selecciona al menos una tarea para asignar');
      return;
    }

    if (!user || !projectId) {
      toast.error('Información de usuario o proyecto no disponible');
      return;
    }

    setSaving(true);

    // Log the selected tasks that will be saved
    console.log('Tareas seleccionadas para guardar:', selectedTasks);

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

        console.log('Procesando tarea:', { id: taskId, title: task.title, type: task.type });

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
        const task = taskItems.find(t => t.id === taskId)!
        const isSubtask = task.type === 'subtask'
        const originalId = isSubtask
          ? task.id.replace('subtask-', '')
          : task.id

        return {
          user_id: user.id,
          date: today,
          task_type: isSubtask ? 'subtask' : 'task',
          task_id: isSubtask ? null : originalId,
          subtask_id: isSubtask ? originalId : null,
          project_id: task.project_id,
          estimated_duration: task.estimated_duration,
          status: 'assigned',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      })

      // 4. Insertar en task_work_assignments

      // 4.1 Upsert solo tareas
      const taskRows = tasksToSave.filter(r => r.task_id !== null);
      if (taskRows.length) {
        const { error: err1 } = await supabase
          .from('task_work_assignments')
          .upsert(taskRows, {
            onConflict: 'user_id,date,task_type,task_id'
          });
        if (err1) throw err1;
      }

      // 4.2 Upsert solo subtareas
      const subtaskRows = tasksToSave
        .filter(r => r.subtask_id !== null)
        .map(r => {
          // crea un nuevo objeto sin la propiedad task_id
          const { task_id, ...onlySub } = r;
          return onlySub;
        });

      await supabase
        .from('task_work_assignments')
        .upsert(subtaskRows, {
          onConflict: 'user_id,date,task_type,subtask_id'
        });

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
      
      // Forzar una segunda actualización para asegurar que la UI refleje el cambio de estado
      setTimeout(async () => {
        await fetchProjectTasksAndSubtasks();
      }, 500);

      // Mostrar mensaje de éxito
      toast.success('Tareas asignadas correctamente');
    } catch (error) {
      console.error('Error saving daily tasks:', error);
      toast.error('Error al guardar las tareas. Por favor, intenta de nuevo.');
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

      // Construir la consulta base
      const query = supabase
        .from('task_work_assignments')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
          ...(newStatus === 'completed' ? { end_time: new Date().toISOString() } : {})
        })
        .eq('user_id', user.id)
        .eq('date', today)
        .eq('task_type', taskType);
      
      // Extender la consulta según el tipo de tarea
      const { error: assignmentUpdateError } = isSubtask 
        ? await query.eq('subtask_id', originalId)
        : await query.eq('task_id', originalId);

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
      toast.success(`Estado actualizado a: ${newStatus}`);
    } catch (error) {
      console.error('Error al actualizar estado:', error);
      toast.error('Error al actualizar el estado. Por favor, intenta de nuevo.');
    }
  }

  // Función para cargar las tareas asignadas para hoy
  async function fetchAssignedTasks() {
    if (!user || !projectId) {
      setAssignedTaskItems([]);
      setDelayedTaskItems([]);
      setReturnedTaskItems([]);
      setLoadingAssigned(false);
      return;
    }

    if (!dailyTasksIds || dailyTasksIds.length === 0) {
      setAssignedTaskItems([]);
      setDelayedTaskItems([]);
      setReturnedTaskItems([]);
      setLoadingAssigned(false);
      return;
    }

    setLoadingAssigned(true);

    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      // 1. Primero, obtener todas las asignaciones de trabajo desde task_work_assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from('task_work_assignments')
        .select('*')
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .not('status', 'eq', 'completed'); // Excluir las tareas completadas

      if (assignmentsError) {
        console.error('Error al cargar asignaciones:', assignmentsError);
        setAssignedTaskItems([]);
        setDelayedTaskItems([]);
        setReturnedTaskItems([]);
        setLoadingAssigned(false);
        return;
      }

      // 2. Obtener IDs de tareas y subtareas
      const normalTaskIds = assignments
        .filter(a => a.task_type === 'task' && a.task_id !== null)
        .map(a => a.task_id);

      const subtaskIds = assignments
        .filter(a => a.task_type === 'subtask' && a.subtask_id !== null)
        .map(a => a.subtask_id);

      // 3. Buscar tareas devueltas en la tabla tasks
      let returnedTasks = null;
      let returnedTasksError = null;
      
      if (normalTaskIds.length > 0) {
        const result = await supabase
          .from('tasks')
          .select('*')
          .in('id', normalTaskIds)
          .eq('status', 'returned');
          
        returnedTasks = result.data;
        returnedTasksError = result.error;
      }

      if (returnedTasksError) {
        console.error('Error al cargar tareas devueltas:', returnedTasksError);
      }

      // 4. Buscar subtareas devueltas en la tabla subtasks
      let returnedSubtasks = null;
      let returnedSubtasksError = null;
      
      if (subtaskIds.length > 0) {
        const result = await supabase
          .from('subtasks')
          .select(`
            *,
            tasks (
              id, title, is_sequential, project_id
            )
          `)
          .in('id', subtaskIds)
          .eq('status', 'returned');
          
        returnedSubtasks = result.data;
        returnedSubtasksError = result.error;
      }

      if (returnedSubtasksError) {
        console.error('Error al cargar subtareas devueltas:', returnedSubtasksError);
      }

      // 5. Crear un mapa de tareas/subtareas devueltas para fácil acceso
      const returnedItemsMap = new Map();

      // Mapear tareas devueltas
      returnedTasks?.forEach(task => {
        returnedItemsMap.set(task.id, {
          status: 'returned',
          notes: task.notes
        });
      });

      // Mapear subtareas devueltas
      returnedSubtasks?.forEach(subtask => {
        returnedItemsMap.set(subtask.id, {
          status: 'returned',
          notes: subtask.notes
        });
      });

      console.log('🔍 [DEBUG] Tareas devueltas encontradas:', {
        tareas: returnedTasks?.length || 0,
        subtareas: returnedSubtasks?.length || 0,
        total: returnedItemsMap.size
      });

      // Array para todas las tareas asignadas
      let allAssignedItems: Task[] = [];
      let todayAssignedItems: Task[] = [];
      let delayedAssignedItems: Task[] = [];
      let returnedItems: Task[] = []; // Nueva lista para tareas devueltas
      let totalPendingTime = 0;
      let totalDelayTime = 0;
      let totalDelayDays = 0;
      let delayCount = 0;

      // ... resto del código como antes para obtener detalles de tareas normales ...

      // Obtener detalles de tareas normales
      if (normalTaskIds.length > 0) {
        const { data: taskData, error: taskError } = await supabase
          .from('tasks')
          .select('*')
          .in('id', normalTaskIds);

        if (taskError) {
          console.error('Error al cargar tareas asignadas:', taskError);
        } else if (taskData && taskData.length > 0) {
          console.log('📊 [DEBUG] Detalles de tareas asignadas cargadas:', taskData);
          const formattedTasks = taskData.map(task => {
            // Buscar la asignación correspondiente para obtener status actualizado
            const assignment = assignments.find(a =>
              a.task_id === task.id && a.task_type === 'task'
            );

            // Verificar si esta tarea está en la lista de devueltas
            const returnedInfo = returnedItemsMap.get(task.id);

            // Usar el estado de la tarea si está devuelta, de lo contrario usar el estado de la asignación
            const taskStatus = returnedInfo ? 'returned' : (assignment?.status || task.status);

            // Usar las notas de la tarea si está devuelta
            const taskNotes = returnedInfo ? returnedInfo.notes : assignment?.notes;

            const formattedTask: Task = {
              id: task.id,
              original_id: task.id,
              title: task.title,
              description: task.description,
              priority: task.priority,
              estimated_duration: task.estimated_duration,
              start_date: task.start_date,
              deadline: task.deadline,
              status: taskStatus, // Usar el estado actualizado
              is_sequential: task.is_sequential,
              project_id: task.project_id,
              type: 'task',
              assignment_date: assignment?.date || today,
              notes: taskNotes || null
            };

            // Calcular duración estimada en horas
            const durationHours = Math.round((task.estimated_duration / 60) * 100) / 100;

            // Clasificar según el estado
            if (formattedTask.status !== 'completed' && formattedTask.status !== 'approved') {
              totalPendingTime += durationHours;

              // Priorizar las tareas devueltas
              if (formattedTask.status === 'returned') {
                returnedItems.push(formattedTask);
              }
              // Después clasificar por fecha
              else if (assignment?.date === today) {
                todayAssignedItems.push(formattedTask);
              } else if (assignment?.date) {
                // Es una tarea retrasada
                delayedAssignedItems.push(formattedTask);
                totalDelayTime += durationHours;

                // Calcular días de retraso
                const assignmentDate = parseISO(assignment.date);
                const daysSinceAssignment = differenceInDays(new Date(), assignmentDate);
                if (daysSinceAssignment > 0) {
                  totalDelayDays += daysSinceAssignment;
                  delayCount++;
                }
              }
            }

            return formattedTask;
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
          console.log('📊 [DEBUG] Detalles de subtareas asignadas cargadas:', subtaskData);
          const formattedSubtasks = subtaskData.map(subtask => {
            // Buscar la asignación correspondiente para obtener status actualizado
            const assignment = assignments.find(a =>
              a.subtask_id === subtask.id && a.task_type === 'subtask'
            );

            // Verificar si esta subtarea está en la lista de devueltas
            const returnedInfo = returnedItemsMap.get(subtask.id);

            // Usar el estado de la subtarea si está devuelta, de lo contrario usar el estado de la asignación
            const subtaskStatus = returnedInfo ? 'returned' : (assignment?.status || subtask.status);

            // Usar las notas de la subtarea si está devuelta
            const subtaskNotes = returnedInfo ? returnedInfo.notes : assignment?.notes;

            const formattedSubtask: Task = {
              id: `subtask-${subtask.id}`,
              original_id: subtask.id,
              title: subtask.title,
              subtask_title: subtask.tasks?.title || "Tarea principal",
              description: subtask.description,
              priority: 'medium', // Type assertion
              estimated_duration: subtask.estimated_duration,
              start_date: subtask.start_date || '',
              deadline: subtask.deadline || '',
              status: subtaskStatus, // Usar el estado actualizado
              is_sequential: false,
              project_id: subtask.tasks?.project_id || '',
              type: 'subtask',
              assignment_date: assignment?.date || today,
              notes: subtaskNotes || null
            };

            // Calcular duración estimada en horas
            const durationHours = Math.round((subtask.estimated_duration / 60) * 100) / 100;

            // Clasificar según el estado
            if (formattedSubtask.status !== 'completed' && formattedSubtask.status !== 'approved') {
              totalPendingTime += durationHours;

              // Priorizar las tareas devueltas
              if (formattedSubtask.status === 'returned') {
                returnedItems.push(formattedSubtask);
              }
              // Después clasificar por fecha
              else if (assignment?.date === today) {
                todayAssignedItems.push(formattedSubtask);
              } else if (assignment?.date) {
                // Es una subtarea retrasada
                delayedAssignedItems.push(formattedSubtask);
                totalDelayTime += durationHours;

                // Calcular días de retraso
                const assignmentDate = parseISO(assignment.date);
                const daysSinceAssignment = differenceInDays(new Date(), assignmentDate);
                if (daysSinceAssignment > 0) {
                  totalDelayDays += daysSinceAssignment;
                  delayCount++;
                }
              }
            }

            return formattedSubtask;
          });

          allAssignedItems = [...allAssignedItems, ...formattedSubtasks];
        }
      }

      // Calcular el promedio de días de retraso
      const avgDelayDays = delayCount > 0 ? Math.round(totalDelayDays / delayCount) : 0;

      console.log("Tareas devueltas:", returnedItems.length);
      console.log("Tareas de hoy:", todayAssignedItems.length);
      console.log("Tareas retrasadas:", delayedAssignedItems.length, "con", avgDelayDays, "días promedio");

      // Actualizar estados
      setAssignedTaskItems(todayAssignedItems);
      setDelayedTaskItems(delayedAssignedItems);
      setReturnedTaskItems(returnedItems);
      setTotalAssignedTime(totalPendingTime);
      setTotalDelayedTime(totalDelayTime);
      setTotalDelayedDays(avgDelayDays);

      // Verificar y eliminar tareas que ya están en completadas
      if (completedTaskItems.length > 0) {
        console.log('🔍 [FETCH ASSIGNED] Verificando posibles duplicados con tareas completadas');
        removeCompletedFromPendingLists(completedTaskItems);
      }
    } catch (error) {
      console.error('Error al cargar tareas asignadas:', error);
    } finally {
      setLoadingAssigned(false);
    }
  }

  // Añadir función para manejar el modal de estado antes de la función fetchAssignedTasks()
  // Función para abrir el modal de actualización de estado
  function handleOpenStatusModal(taskId: string) {
    // Encontrar la tarea seleccionada para obtener la duración estimada y estado actual
    let selectedTask;
    let isEditing = false;

    // Buscar primero en tareas pendientes
    selectedTask = [...assignedTaskItems, ...delayedTaskItems].find(task => task.id === taskId);

    // Si no está en las tareas pendientes, buscar en las completadas
    if (!selectedTask) {
      selectedTask = completedTaskItems.find(task => task.id === taskId);
      isEditing = selectedTask?.status === 'completed';
    }

    const estimatedDuration = selectedTask ? selectedTask.estimated_duration : 0;

    // Si estamos editando una tarea completada, extraer los datos de las notas
    let actualDuration = estimatedDuration;
    let durUnit: 'minutes' | 'hours' = 'minutes';
    let details = '';
    let durReason = '';

    if (isEditing && selectedTask?.notes) {
      const metadata = typeof selectedTask.notes === 'object' ? selectedTask.notes : {};
      details = metadata.entregables || metadata.notes || '';
      actualDuration = metadata.duracion_real || estimatedDuration;
      durUnit = metadata.unidad_original || 'minutes';
      durReason = metadata.razon_duracion || '';
    }

    setSelectedTaskId(taskId);
    setSelectedStatus(isEditing ? 'completed' : 'completed');
    setStatusDetails(details);
    setActualDuration(actualDuration);
    setDurationUnit(durUnit);
    setDurationReason(durReason);
    setStatusError(null);
    setShowStatusModal(true);
  }

  // Función para manejar el envío del formulario de estado
  // Helper para actualizar el estado de una tarea padre tras completar todas sus subtareas
  async function updateParentTaskStatus(parentId: string) {
    try {
      // Consultar todas las subtareas
      const { data: subtasks, error: subError } = await supabase
        .from('subtasks')
        .select('status')
        .eq('task_id', parentId);
      if (subError) throw subError;

      // ¿Todas completadas o aprobadas?
      const allDone = subtasks!.every(s => ['completed', 'approved'].includes(s.status));
      const newStatus = allDone ? 'completed' : 'in_progress';

      // Actualizar la tarea padre
      const { error: taskError } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', parentId);
      if (taskError) throw taskError;
    } catch (e) {
      console.error('Error actualizando tarea padre:', e);
    }
  }

  async function handleSubmitStatus() {
    // 1️⃣ Validaciones tempranas
    if (!selectedTaskId)
      return setStatusError('Por favor, selecciona la tarea');
    if (!selectedStatus)
      return setStatusError('Por favor, selecciona un estado válido');
    if (['completed', 'blocked'].includes(selectedStatus) && !statusDetails.trim())
      return setStatusError(
        selectedStatus === 'completed'
          ? 'Por favor, detalla los entregables o resultados'
          : 'Por favor, explica el motivo del bloqueo'
      );
    if (selectedStatus === 'completed' && actualDuration <= 0)
      return setStatusError('Por favor, indica el tiempo real que te tomó completar la tarea');

    console.log('🔄 [SUBMIT STATUS] Iniciando actualización de estado:', {
      taskId: selectedTaskId,
      newStatus: selectedStatus,
      isInPendingList: assignedTaskItems.some(t => t.id === selectedTaskId),
      isInDelayedList: delayedTaskItems.some(t => t.id === selectedTaskId),
      isInReturnedList: returnedTaskItems.some(t => t.id === selectedTaskId),
      isInCompletedList: completedTaskItems.some(t => t.id === selectedTaskId)
    });

    // 2️⃣ Preparar IDs y tipos
    const isSubtask = selectedTaskId.startsWith('subtask-');
    const originalId = isSubtask
      ? selectedTaskId.replace('subtask-', '')
      : selectedTaskId;
    const table = isSubtask ? 'subtasks' : 'tasks';
    const taskType = isSubtask ? 'subtask' : 'task';
    const today = format(new Date(), 'yyyy-MM-dd');
    const durationMin = durationUnit === 'hours'
      ? Math.round(actualDuration * 60)
      : actualDuration;

    // 3️⃣ Construir objeto de metadata
    const metadata: any = {
      notes: statusDetails,
      ...(selectedStatus === 'completed'
        ? { entregables: statusDetails, duracion_real: durationMin, unidad_original: durationUnit, razon_duracion: durationReason }
        : { razon_bloqueo: statusDetails }
      )
    };

    try {
      // 4️⃣ Actualizar tanto la tabla de tasks/subtasks como task_work_assignments
      // Esto es especialmente importante para las tareas devueltas
      const promises = [
        // Actualizar la tabla de tasks o subtasks
        supabase
          .from(table)
          .update({
            status: selectedStatus,
            notes: typeof metadata === 'string' ? metadata : JSON.stringify(metadata)
          })
          .eq('id', originalId),

        // Actualizar la asignación en task_work_assignments
        supabase
          .from('task_work_assignments')
          .update({
            status: selectedStatus,
            updated_at: new Date().toISOString(),
            notes: metadata,              // SIN JSON.stringify
            ...(selectedStatus === 'completed'
              ? { end_time: new Date().toISOString(), actual_duration: durationMin }
              : {})
          })
          .eq('user_id', user!.id)
          .eq('task_type', taskType)
          .eq(isSubtask ? 'subtask_id' : 'task_id', originalId)
          .select()
      ];

      // Ejecutar todas las actualizaciones en paralelo
      const [taskRes, assignRes] = await Promise.all(promises);

      if (taskRes.error || assignRes.error) {
        throw taskRes.error || assignRes.error;
      }

      console.log('✅ [SUBMIT STATUS] Actualizaciones de BD completadas:', {
        taskId: selectedTaskId,
        taskResult: taskRes,
        assignmentResult: assignRes
      });

      // 5️⃣ Si era subtarea completada, actualiza la tarea padre
      if (isSubtask && selectedStatus === 'completed') {
        const { data: { task_id: parentId } = {} } = await supabase
          .from('subtasks')
          .select('task_id')
          .eq('id', originalId)
          .single();
        if (parentId) await updateParentTaskStatus(parentId);
      }

      // 6️⃣ Refrescar estado local
      // Determinar de qué lista proviene la tarea
      const isInReturned = returnedTaskItems.some(t => t.id === selectedTaskId);
      const isInAssigned = assignedTaskItems.some(t => t.id === selectedTaskId);
      const isInDelayed = delayedTaskItems.some(t => t.id === selectedTaskId);

      if (selectedStatus === 'completed') {
        // Si la tarea se marcó como completada, removerla de todas las listas de pendientes
        if (isInReturned) {
          setReturnedTaskItems(prev => prev.filter(t => t.id !== selectedTaskId));
        }
        if (isInAssigned) {
          setAssignedTaskItems(prev => prev.filter(t => t.id !== selectedTaskId));
        }
        if (isInDelayed) {
          setDelayedTaskItems(prev => prev.filter(t => t.id !== selectedTaskId));
        }

        // Recargar las tareas completadas para incluir la nueva
        fetchCompletedTasks();
      } else {
        // Si se marcó con otro estado, actualizar el estado en la lista correspondiente
        if (isInReturned) {
          setReturnedTaskItems(prev =>
            prev.map(t => t.id === selectedTaskId ? { ...t, status: selectedStatus, notes: metadata } : t)
          );
        }
        if (isInAssigned) {
          setAssignedTaskItems(prev => prev.map(t => t.id === selectedTaskId ? { ...t, status: selectedStatus, notes: metadata } : t)
          );
        }
        if (isInDelayed) {
      setDelayedTaskItems(prev =>
            prev.map(t => t.id === selectedTaskId ? { ...t, status: selectedStatus, notes: metadata } : t)
      );
        }
      }

      console.log('✅ [SUBMIT STATUS] Estado local actualizado correctamente');
      setShowStatusModal(false);

      // Toast de éxito
      toast.success(`Tarea ${selectedStatus === 'completed' ? 'completada' : 'actualizada'} con éxito!`);

    } catch (error) {
      console.error('❌ [SUBMIT STATUS] Error:', error);
      setStatusError('Error al actualizar el estado. Inténtalo de nuevo.');
    }
  }

  async function fetchCompletedTasks() {
    console.log('📥 [FETCH COMPLETED] Inicio de fetchCompletedTasks');

    if (!user || !projectId) {
      setCompletedTaskItems([]);
      setLoadingCompleted(false);
      return;
    }

    try {
      setLoadingCompleted(true);
      const { data: completedTaskAssignments, error: assignmentsError } = await supabase
        .from('task_work_assignments')
        .select('*')
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .eq('status', 'completed');

      if (assignmentsError) {
        console.error('Error al cargar tareas completadas:', assignmentsError);
        setCompletedTaskItems([]);
        setLoadingCompleted(false);
        return;
      }

      // Registrar las IDs de las tareas completadas según la base de datos
      console.log('🔍 [FETCH COMPLETED] Tareas completadas en BD:', {
        total: completedTaskAssignments?.length || 0,
        ids: completedTaskAssignments?.map(t => t.task_id) || []
      });

      // Array para todas las tareas completadas
      let allCompletedItems: Task[] = [];

      // IDs de tareas y subtareas completadas
      const normalTaskIds = completedTaskAssignments
        .filter(a => a.task_type === 'task' && a.task_id !== null)
        .map(a => a.task_id);

      const subtaskIds = completedTaskAssignments
        .filter(a => a.task_type === 'subtask' && a.subtask_id !== null)
        .map(a => a.subtask_id);

      // Obtener detalles de tareas completadas
      if (normalTaskIds.length > 0) {
        const { data: taskData, error: taskError } = await supabase
          .from('tasks')
          .select('*')
          .in('id', normalTaskIds);

        if (taskError) {
          console.error('Error al cargar tareas completadas:', taskError);
        } else if (taskData && taskData.length > 0) {
          const formattedTasks = taskData.map(task => {
            // Buscar la asignación correspondiente para obtener metadata
            const assignment = completedTaskAssignments.find(a =>
              a.task_id === task.id && a.task_type === 'task'
            );

            return {
              id: task.id,
              original_id: task.id,
              title: task.title,
              description: task.description,
              priority: task.priority as 'low' | 'medium' | 'high',
              estimated_duration: task.estimated_duration,
              start_date: task.start_date,
              deadline: task.deadline,
              status: 'completed',
              is_sequential: task.is_sequential,
              project_id: task.project_id,
              type: 'task' as const,
              assignment_date: assignment?.date || '',
              notes: assignment?.notes || task.notes || '',
            };
          });

          allCompletedItems = [...allCompletedItems, ...formattedTasks];
        }
      }

      // Obtener detalles de subtareas completadas
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
          console.error('Error al cargar subtareas completadas:', subtaskError);
        } else if (subtaskData && subtaskData.length > 0) {
          const formattedSubtasks = subtaskData.map(subtask => {
            // Buscar la asignación correspondiente para obtener metadata
            const assignment = completedTaskAssignments.find(a =>
              a.subtask_id === subtask.id && a.task_type === 'subtask'
            );

            return {
              id: `subtask-${subtask.id}`,
              original_id: subtask.id,
              title: subtask.title,
              subtask_title: subtask.tasks?.title || "Tarea principal",
              description: subtask.description,
              priority: 'medium' as const,
              estimated_duration: subtask.estimated_duration,
              start_date: subtask.start_date || '',
              deadline: subtask.deadline || '',
              status: 'completed',
              is_sequential: false,
              project_id: subtask.tasks?.project_id || '',
              type: 'subtask' as const,
              assignment_date: assignment?.date || '',
              notes: assignment?.notes || subtask.notes || '',
            };
          });

          allCompletedItems = [...allCompletedItems, ...formattedSubtasks];
        }
      }

      // Ordenar por fecha de asignación (más recientes primero)
      const sortedCompletedItems = allCompletedItems.sort((a, b) => {
        if (!a.assignment_date) return 1;
        if (!b.assignment_date) return -1;
        return new Date(b.assignment_date).getTime() - new Date(a.assignment_date).getTime();
      });

      setCompletedTaskItems(sortedCompletedItems);

      // Después de actualizar las tareas completadas, eliminar duplicados de listas pendientes
      removeCompletedFromPendingLists(sortedCompletedItems);

      console.log('✅ [FETCH COMPLETED] Fin de fetchCompletedTasks - Tareas cargadas:', sortedCompletedItems.length);
    } catch (error) {
      console.error('Error al cargar tareas completadas:', error);
    } finally {
      setLoadingCompleted(false);
    }
  }

  // Función para eliminar tareas completadas de las listas de pendientes
  function removeCompletedFromPendingLists(completedTasks: Task[]) {
    const completedIds = new Set(completedTasks.map(task => task.id));

    // Verificar si hay tareas en las listas de pendientes que ya están en completadas
    const duplicatesInAssigned = assignedTaskItems.filter(task => completedIds.has(task.id));
    const duplicatesInDelayed = delayedTaskItems.filter(task => completedIds.has(task.id));
    const duplicatesInReturned = returnedTaskItems.filter(task => completedIds.has(task.id));

    if (duplicatesInAssigned.length > 0 || duplicatesInDelayed.length > 0 || duplicatesInReturned.length > 0) {
      console.log('🧹 [CLEAN] Eliminando tareas completadas de listas pendientes:', {
        enAsignadas: duplicatesInAssigned.map(t => t.id),
        enRetrasadas: duplicatesInDelayed.map(t => t.id)
      });

      // Filtrar las listas para quitar las tareas completadas
      setAssignedTaskItems(prev => prev.filter(task => !completedIds.has(task.id)));
      setDelayedTaskItems(prev => prev.filter(task => !completedIds.has(task.id)));
    }
  }

  const handleDailyTasksChange = (newDailyTasksIds: string[]) => {
    console.log('🔄 [DEBUG] dailyTasksIds actualizados:', newDailyTasksIds?.length || 0);
    setDailyTasksIds(newDailyTasksIds);
  };

  // Función para ver la retroalimentación de una tarea devuelta
  async function handleViewReturnedFeedback(task: Task) {
    setSelectedReturnedTask(task);

    try {
      console.log('🔍 [DEBUG] Obteniendo datos de retroalimentación para:', task.id);

      // Crear un objeto para las notas actualizadas
      let updatedNotes: TaskNotes = {};

      // Si la tarea ya tiene notas como objeto, usarlas como base
      if (task.notes && typeof task.notes === 'object') {
        updatedNotes = { ...task.notes };
      }

      if (task.type === 'subtask' && task.original_id) {
        // Si es una subtarea, obtener datos adicionales de la tabla subtasks
        const { data, error } = await supabase
          .from('subtasks')
          .select('*')
          .eq('id', task.original_id)
          .single();

        if (error) {
          console.error('Error al obtener datos de retroalimentación de subtask:', error);
        } else if (data) {
          console.log('✅ [DEBUG] Datos de retroalimentación obtenidos de subtask:', data);

          // Verifica si feedback está disponible y es un objeto
          if (data.feedback) {
            let feedbackData = data.feedback;

            // Si feedback es un string pero parece JSON, intenta parsearlo
            if (typeof data.feedback === 'string' &&
              (data.feedback.startsWith('{') || data.feedback.startsWith('['))) {
              try {
                feedbackData = JSON.parse(data.feedback);
                console.log('Feedback parseado correctamente:', feedbackData);
              } catch (parseError) {
                console.error('Error al parsear feedback JSON:', parseError);
                // Usar como string simple si falla el parseo
                feedbackData = { feedback: data.feedback };
              }
            } else if (typeof data.feedback === 'object') {
              // Ya es un objeto, usarlo como está
              console.log('Feedback ya es un objeto:', feedbackData);
            } else {
              // Es un string simple, crear un objeto con él
              feedbackData = { feedback: data.feedback };
            }

            // Extraer los datos del feedback
            if (typeof feedbackData === 'object') {
              if (feedbackData.feedback) {
                updatedNotes.returned_feedback = feedbackData.feedback;
              }
              if (feedbackData.reviewed_at) {
                updatedNotes.returned_at = feedbackData.reviewed_at;
              }
              if (feedbackData.reviewed_by) {
                updatedNotes.returned_by = feedbackData.reviewed_by;
              }
            }
          }

          // También revisar campos específicos si existen
          if (data.returned_feedback) {
            updatedNotes.returned_feedback = data.returned_feedback;
          }
          if (data.returned_at) {
            updatedNotes.returned_at = data.returned_at;
          }
          if (data.returned_by) {
            updatedNotes.returned_by = data.returned_by;
          }

          // También revisar el campo 'notes'
          if (data.notes) {
            let notesObj = data.notes;

            // Si es un string que parece JSON, intentar parsearlo
            if (typeof data.notes === 'string' &&
              (data.notes.startsWith('{') || data.notes.startsWith('['))) {
              try {
                notesObj = JSON.parse(data.notes);
              } catch (parseError) {
                console.error('Error al parsear notes JSON:', parseError);
                // Usar como string simple si falla
                notesObj = { notes: data.notes };
              }
            }

            // Si ahora es un objeto, extraer la información
            if (typeof notesObj === 'object') {
              if (notesObj.returned_feedback) {
                updatedNotes.returned_feedback = notesObj.returned_feedback;
              }
              if (notesObj.returned_at) {
                updatedNotes.returned_at = notesObj.returned_at;
              }
              if (notesObj.returned_by) {
                updatedNotes.returned_by = notesObj.returned_by;
              }
            }
          }
        }
      } else {
        // Lógica similar para tareas normales
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', task.original_id || task.id)
          .single();

        if (error) {
          console.error('Error al obtener datos de retroalimentación de task:', error);
        } else if (data) {
          console.log('✅ [DEBUG] Datos de retroalimentación obtenidos de task:', data);

          // Verifica si feedback está disponible y es un objeto
          if (data.feedback) {
            let feedbackData = data.feedback;

            // Si feedback es un string pero parece JSON, intenta parsearlo
            if (typeof data.feedback === 'string' &&
              (data.feedback.startsWith('{') || data.feedback.startsWith('['))) {
              try {
                feedbackData = JSON.parse(data.feedback);
                console.log('Feedback parseado correctamente:', feedbackData);
              } catch (parseError) {
                console.error('Error al parsear feedback JSON:', parseError);
                // Usar como string simple si falla el parseo
                feedbackData = { feedback: data.feedback };
              }
            } else if (typeof data.feedback === 'object') {
              // Ya es un objeto, usarlo como está
              console.log('Feedback ya es un objeto:', feedbackData);
            } else {
              // Es un string simple, crear un objeto con él
              feedbackData = { feedback: data.feedback };
            }

            // Extraer los datos del feedback
            if (typeof feedbackData === 'object') {
              if (feedbackData.feedback) {
                updatedNotes.returned_feedback = feedbackData.feedback;
              }
              if (feedbackData.reviewed_at) {
                updatedNotes.returned_at = feedbackData.reviewed_at;
              }
              if (feedbackData.reviewed_by) {
                updatedNotes.returned_by = feedbackData.reviewed_by;
              }
            }
          }

          // También revisar campos específicos si existen
          if (data.returned_feedback) {
            updatedNotes.returned_feedback = data.returned_feedback;
          }
          if (data.returned_at) {
            updatedNotes.returned_at = data.returned_at;
          }
          if (data.returned_by) {
            updatedNotes.returned_by = data.returned_by;
          }

          // También revisar el campo 'notes'
          if (data.notes) {
            let notesObj = data.notes;

            // Si es un string que parece JSON, intentar parsearlo
            if (typeof data.notes === 'string' &&
              (data.notes.startsWith('{') || data.notes.startsWith('['))) {
              try {
                notesObj = JSON.parse(data.notes);
              } catch (parseError) {
                console.error('Error al parsear notes JSON:', parseError);
                // Usar como string simple si falla
                notesObj = { notes: data.notes };
              }
            }

            // Si ahora es un objeto, extraer la información
            if (typeof notesObj === 'object') {
              if (notesObj.returned_feedback) {
                updatedNotes.returned_feedback = notesObj.returned_feedback;
              }
              if (notesObj.returned_at) {
                updatedNotes.returned_at = notesObj.returned_at;
              }
              if (notesObj.returned_by) {
                updatedNotes.returned_by = notesObj.returned_by;
              }
            }
          }
        }
      }

      // Debug de las notas actualizadas antes de guardarlas
      console.log('📝 [DEBUG] Notas actualizadas para mostrar:', updatedNotes);

      // Actualizar la tarea seleccionada con las notas actualizadas
      setSelectedReturnedTask({
        ...task,
        notes: updatedNotes
      });
    } catch (error) {
      console.error('Error al procesar datos de retroalimentación:', error);
    }

    // Mostrar el modal
    setShowReturnedFeedbackModal(true);
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

          {/* Información de tiempo ya ocupado */}
          {totalAssignedTime > 0 && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
              <h3 className="text-md font-medium text-blue-800 mb-2">Tiempo ya ocupado:</h3>
              <div className="flex flex-wrap gap-3">
                <div className="px-3 py-2 bg-white rounded shadow-sm">
                  <span className="text-sm text-gray-500">Total asignado</span>
                  <p className="text-lg font-bold text-blue-600">{totalAssignedTime.toFixed(1)} horas</p>
                </div>
                {totalDelayedTime > 0 && (
                  <div className="px-3 py-2 bg-white rounded shadow-sm">
                    <span className="text-sm text-gray-500">Retrasadas</span>
                    <p className="text-lg font-bold text-red-600">{totalDelayedTime.toFixed(1)} horas</p>
                    <span className="text-xs text-red-500">Promedio {totalDelayedDays} días de retraso</span>
                  </div>
                )}
                <div className="px-3 py-2 bg-white rounded shadow-sm">
                  <span className="text-sm text-gray-500">Proyectado con selección</span>
                  <p className="text-lg font-bold text-purple-600">{(totalAssignedTime + totalEstimatedDuration).toFixed(1)} horas</p>
                </div>
              </div>
            </div>
          )}

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
              {loading || isFiltering ? (
                <div className="py-8 text-center text-gray-500 bg-white">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-800 mx-auto mb-2"></div>
                  <p>{isFiltering ? 'Filtrando tareas...' : 'Cargando tareas...'}</p>
                </div>
              ) : isDataInitialized && taskItems.length > 0 ? (
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
                  <p className="text-gray-500 mb-2">No hay tareas disponibles para asignar.</p>
                  <p className="text-sm text-gray-400">
                    {error ? error : "Todas las tareas ya están asignadas o no hay tareas pendientes en este proyecto."}
                  </p>
                  <pre className="mt-2 text-xs text-left bg-gray-100 p-2 rounded max-w-md mx-auto overflow-auto">
                    Estado de inicialización: {isDataInitialized ? 'Completada' : 'Pendiente'}
                    {'\n'}Estado de carga: {loading ? 'Cargando' : 'Completado'}
                    {'\n'}Error: {error || 'Ninguno'}
                    {'\n'}Tareas cargadas: {taskItems.length}
                  </pre>
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
            <p className="text-sm text-gray-600 mt-1">Administra las tareas que has asignado para trabajar</p>
          </div>

          {/* Sub pestañas para gestión */}
          <div className="mb-6 bg-white rounded-md shadow-sm border border-gray-200 p-4">
            <div className="flex border-b border-gray-200 mb-4">
              <button
                className={`mr-4 py-2 px-4 font-medium ${activeGestionSubTab === 'pendientes'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
                onClick={() => setActiveGestionSubTab('pendientes')}
              >
                Tareas Pendientes
              </button>
              <button
                className={`py-2 px-4 font-medium ${activeGestionSubTab === 'completadas'
                  ? 'border-b-2 border-green-500 text-green-600'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
                onClick={() => setActiveGestionSubTab('completadas')}
              >
                Tareas Completadas
              </button>
            </div>
          </div>

          {activeGestionSubTab === 'pendientes' && (
            <>
              {/* Sección de tareas devueltas (ATENCIÓN INMEDIATA) */}
              {returnedTaskItems.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center mb-2">
                    <div className="w-4 h-4 bg-orange-500 rounded-full mr-2"></div>
                    <h3 className="text-lg font-semibold text-orange-700">ATENCIÓN INMEDIATA: Tareas Devueltas</h3>
                  </div>

                  <div className="bg-orange-50 rounded-md shadow-sm border border-orange-200 overflow-hidden mb-6">
                    {/* Task list header */}
                    <div className="grid grid-cols-8 gap-4 p-3 border-b-2 border-orange-300 font-medium text-orange-800 bg-orange-100">
                      <div>ACTIVIDAD</div>
                      <div>DESCRIPCION</div>
                      <div>INICIO</div>
                      <div>FIN</div>
                      <div>DURACIÓN</div>
                      <div>ESTADO</div>
                      <div>DEVOLUCIÓN</div>
                      <div>ACCIONES</div>
                    </div>

                    {/* Task list for returned tasks */}
                    <div className="divide-y divide-orange-200">
                      {returnedTaskItems.map((task) => (
                        <div key={task.id} className="grid grid-cols-8 gap-4 py-3 items-center bg-white hover:bg-orange-50 px-3">
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
                                  <span className="ml-2 px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full inline-flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    Devuelta
                                  </span>
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
                                  <span className="ml-2 px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full inline-flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    Devuelta
                                  </span>
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
                            <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800">
                              Devuelta
                            </span>
                          </div>
                          <div>
                            <button
                              onClick={() => handleViewReturnedFeedback(task)}
                              className="px-3 py-1 bg-orange-600 text-white text-sm rounded-md hover:bg-orange-700 transition-colors"
                            >
                              Ver Feedback
                            </button>
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleOpenStatusModal(task.id)}
                              className="px-3 py-1 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 transition-colors"
                            >
                              Actualizar Estado
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

          {/* Sección de tareas retrasadas (Urgentes) */}
          {delayedTaskItems.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center mb-2">
                <div className="w-4 h-4 bg-red-500 rounded-full mr-2"></div>
                <h3 className="text-lg font-semibold text-red-700">URGENTE: Tareas Retrasadas</h3>
              </div>

              <div className="bg-red-50 rounded-md shadow-sm border border-red-200 overflow-hidden mb-6">
                {/* Task list header */}
                <div className="grid grid-cols-8 gap-4 p-3 border-b-2 border-red-300 font-medium text-red-800 bg-red-100">
                  <div>ACTIVIDAD</div>
                  <div>DESCRIPCION</div>
                  <div>INICIO</div>
                  <div>FIN</div>
                  <div>DURACIÓN</div>
                  <div>ESTADO</div>
                  <div>RETRASO</div>
                  <div>ACCIONES</div>
                </div>

                {/* Task list for delayed tasks */}
                <div className="divide-y divide-red-200">
                  {delayedTaskItems.map((task) => {
                    // Calcular días de retraso
                    const assignmentDate = task.assignment_date ? parseISO(task.assignment_date) : new Date();
                    const daysSinceAssignment = differenceInDays(new Date(), assignmentDate);

                    return (
                      <div key={task.id} className="grid grid-cols-8 gap-4 py-3 items-center bg-white hover:bg-red-50 px-3">
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
                        <div className="text-sm font-medium text-red-600">
                          {daysSinceAssignment <= 0 ? 'Hoy' : `${daysSinceAssignment} día${daysSinceAssignment !== 1 ? 's' : ''}`}
                          {task.assignment_date && (
                            <div className="text-xs text-gray-500">
                              Asignada: {format(parseISO(task.assignment_date), 'dd/MM/yyyy')}
                            </div>
                          )}
                        </div>
                        <div>
                          <button
                            onClick={() => handleOpenStatusModal(task.id)}
                            className="px-3 py-1 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 transition-colors"
                          >
                            Actualizar Estado
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Task list container para tareas asignadas de hoy */}
          <div className="mb-2">
            <div className="flex items-center mb-2">
              <div className="w-4 h-4 bg-blue-500 rounded-full mr-2"></div>
              <h3 className="text-lg font-semibold text-blue-700">Tareas Para Hoy</h3>
            </div>
          </div>

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
                  <p>Cargando tareas...</p>
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
                                {/* Indicador para tareas devueltas */}
                                {task.status === 'returned' && (
                                  <span className="ml-2 px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full inline-flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    Devuelta
                                  </span>
                                )}
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
                                {/* Indicador para tareas devueltas */}
                                {task.status === 'returned' && (
                                  <span className="ml-2 px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full inline-flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    Devuelta
                                  </span>
                                )}
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
                      <TaskStatusDisplay status={task.status} />
                    </div>
                        <div className="flex space-x-2">
                      <button
                        onClick={() => handleOpenStatusModal(task.id)}
                        className="px-3 py-1 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 transition-colors"
                      >
                        Actualizar Estado
                      </button>
                          {/* Botón para ver retroalimentación si la tarea fue devuelta */}
                          {task.status === 'returned' && task.notes && typeof task.notes === 'object' && task.notes.returned_feedback && (
                            <button
                              onClick={() => handleViewReturnedFeedback(task)}
                              className="px-3 py-1 bg-orange-600 text-white text-sm rounded-md hover:bg-orange-700 transition-colors"
                            >
                              Ver Feedback
                            </button>
                          )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center bg-white">
                  <p className="text-gray-500 mb-2">No hay tareas asignadas para hoy.</p>
                  {delayedTaskItems.length > 0 ? (
                    <p className="text-sm text-red-500 font-medium">Pero tienes {delayedTaskItems.length} tareas retrasadas arriba que requieren atención.</p>
                  ) : (
                    <p className="text-sm text-gray-400">Selecciona tareas en la pestaña "ASIGNACION" para trabajar en ellas.</p>
                  )}
                </div>
              )}
            </div>
          </div>
            </>
          )}

          {activeGestionSubTab === 'completadas' && (
            <>
              <div className="mb-2">
                <div className="flex items-center mb-2">
                  <div className="w-4 h-4 bg-green-500 rounded-full mr-2"></div>
                  <h3 className="text-lg font-semibold text-green-700">Tareas Completadas</h3>
                </div>
              </div>

              <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden mb-6">
                {/* Task list header */}
                <div className="grid grid-cols-8 gap-4 p-3 border-b-2 border-gray-300 font-medium text-gray-700 bg-gray-50">
                  <div>ACTIVIDAD</div>
                  <div>DESCRIPCION</div>
                  <div>FECHA FIN</div>
                  <div>DURACIÓN EST.</div>
                  <div>DURACIÓN REAL</div>
                  <div>RESULTADO</div>
                  <div>FECHA</div>
                  <div>ACCIONES</div>
                </div>

                {/* Task list for completed tasks */}
                <div className="divide-y divide-gray-200">
                  {loadingCompleted ? (
                    <div className="py-8 text-center text-gray-500 bg-white">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-800 mx-auto mb-2"></div>
                      <p>Cargando tareas completadas...</p>
                    </div>
                  ) : completedTaskItems.length > 0 ? (
                    completedTaskItems.map((task) => {
                      // Extraer información de notas (que contiene metadata)
                      const metadata = typeof task.notes === 'object' ? task.notes : {};
                      const entregables = metadata.entregables || (typeof task.notes === 'string' ? task.notes : '-');
                      const duracionReal = metadata.duracion_real || task.estimated_duration;
                      const completionDate = task.assignment_date || '-';

                      return (
                        <div key={task.id} className="grid grid-cols-8 gap-4 py-3 items-center bg-white hover:bg-gray-50 px-3">
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
                            {task.deadline ? format(new Date(task.deadline), 'dd/MM/yyyy') : '-'}
                          </div>
                          <div className="text-sm font-medium">
                            {Math.round((task.estimated_duration / 60) * 100) / 100} HORA{Math.round((task.estimated_duration / 60) * 100) / 100 !== 1 ? 'S' : ''}
                          </div>
                          <div className="text-sm font-medium text-green-600">
                            {Math.round((duracionReal / 60) * 100) / 100} HORA{Math.round((duracionReal / 60) * 100) / 100 !== 1 ? 'S' : ''}
                          </div>
                          <div className="text-sm text-gray-700 max-h-16 overflow-y-auto">
                            {entregables}
                          </div>
                          <div className="text-sm text-gray-700">
                            {completionDate !== '-' ? format(new Date(completionDate), 'dd/MM/yyyy') : '-'}
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleViewTaskDetails(task)}
                              className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                            >
                              Ver Entrega
                            </button>
                            <button
                              onClick={() => handleOpenStatusModal(task.id)}
                              className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
                            >
                              Editar
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center bg-white">
                      <p className="text-gray-500 mb-2">No hay tareas completadas para mostrar.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Resumen de tiempos - mostrar solo en la pestaña de pendientes */}
          {activeGestionSubTab === 'pendientes' && assignedTaskItems.length > 0 && (
            <div className="mt-6 p-4 bg-white rounded-md shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium mb-3">Resumen de trabajo</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-sm text-gray-600">Tareas para hoy</p>
                  <p className="text-xl font-bold">{assignedTaskItems.length}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-sm text-gray-600">Tareas retrasadas</p>
                  <p className="text-xl font-bold text-red-600">
                    {delayedTaskItems.length}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-sm text-gray-600">Completadas totales</p>
                  <p className="text-xl font-bold text-green-600">
                    {assignedTaskItems.filter(t => t.status === 'completed').length +
                      delayedTaskItems.filter(t => t.status === 'completed').length}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-sm text-gray-600">Tiempo total</p>
                  <p className="text-xl font-bold">
                    {totalAssignedTime.toFixed(1)} HORAS
                  </p>
                </div>
              </div>

              {totalDelayedTime > 0 && (
                <div className="mt-3 p-3 bg-red-50 rounded-md border border-red-200">
                  <p className="text-sm text-red-800 font-medium">
                    ⚠️ Tienes {totalDelayedTime.toFixed(1)} horas de trabajo retrasado con un promedio de {totalDelayedDays} día(s) de retraso.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Resumen de tareas completadas - mostrar solo en la pestaña de completadas */}
          {activeGestionSubTab === 'completadas' && completedTaskItems.length > 0 && (
            <div className="mt-6 p-4 bg-white rounded-md shadow-sm border border-gray-200">
              <h3 className="text-lg font-medium mb-3">Resumen de tareas completadas</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-sm text-gray-600">Total completadas</p>
                  <p className="text-xl font-bold text-green-600">{completedTaskItems.length}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-sm text-gray-600">Tiempo estimado total</p>
                  <p className="text-xl font-bold">
                    {completedTaskItems.reduce((sum, task) => {
                      return sum + Math.round((task.estimated_duration / 60) * 100) / 100;
                    }, 0).toFixed(1)} HORAS
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <p className="text-sm text-gray-600">Tiempo real total</p>
                  <p className="text-xl font-bold text-green-600">
                    {completedTaskItems.reduce((sum, task) => {
                      const metadata = typeof task.notes === 'object' ? task.notes : {};
                      const duracionReal = metadata.duracion_real || task.estimated_duration;
                      return sum + Math.round((duracionReal / 60) * 100) / 100;
                    }, 0).toFixed(1)} HORAS
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

              {/* Información de entrega para tareas completadas */}
              {selectedTaskDetails.status === 'completed' && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
                  <h4 className="text-md font-medium text-green-800 mb-2">Información de Entrega:</h4>

                  {/* Metadata de notas */}
                  {(() => {
                    const metadata = typeof selectedTaskDetails.notes === 'object' ? selectedTaskDetails.notes : {};
                    const entregables = metadata.entregables || (typeof selectedTaskDetails.notes === 'string' ? selectedTaskDetails.notes : '-');
                    const duracionReal = metadata.duracion_real || selectedTaskDetails.estimated_duration;
                    const unidad = metadata.unidad_original || 'minutes';
                    const razonDuracion = metadata.razon_duracion || '';

                    return (
                      <div className="space-y-3">
                        <div>
                          <h5 className="text-sm font-medium text-green-700 mb-1">Entregables:</h5>
                          <p className="text-sm bg-white p-2 rounded border border-green-200 whitespace-pre-wrap">
                            {entregables}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <h5 className="text-sm font-medium text-green-700 mb-1">Tiempo Estimado:</h5>
                            <p className="text-sm font-bold">
                              {Math.round((selectedTaskDetails.estimated_duration / 60) * 100) / 100} horas
                            </p>
                          </div>
                          <div>
                            <h5 className="text-sm font-medium text-green-700 mb-1">Tiempo Real:</h5>
                            <p className="text-sm font-bold">
                              {Math.round((duracionReal / 60) * 100) / 100} horas
                              {duracionReal > selectedTaskDetails.estimated_duration && (
                                <span className="ml-2 text-xs text-orange-600">
                                  (Exceso: {Math.round(((duracionReal - selectedTaskDetails.estimated_duration) / 60) * 100) / 100} h)
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {razonDuracion && (
                          <div>
                            <h5 className="text-sm font-medium text-green-700 mb-1">Razón de Variación:</h5>
                            <p className="text-sm bg-white p-2 rounded border border-green-200">
                              {razonDuracion}
                            </p>
                          </div>
                        )}

                        {selectedTaskDetails.assignment_date && (
                          <div>
                            <h5 className="text-sm font-medium text-green-700 mb-1">Fecha de Entrega:</h5>
                            <p className="text-sm font-medium">
                              {format(new Date(selectedTaskDetails.assignment_date), 'dd/MM/yyyy')}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
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

      {/* Modal de actualización de estado */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium">
                {selectedStatus === 'completed' && completedTaskItems.some(t => t.id === selectedTaskId)
                  ? 'Editar tarea completada'
                  : returnedTaskItems.some(t => t.id === selectedTaskId)
                    ? 'Actualizar tarea devuelta'
                    : 'Actualizar estado de tarea'}
              </h3>
              <button
                onClick={() => setShowStatusModal(false)}
                className="text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4">
              {/* Panel informativo para tareas devueltas */}
              {returnedTaskItems.some(t => t.id === selectedTaskId) && (
                <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                  <h4 className="text-sm font-medium text-orange-800 mb-1">Motivo de la devolución:</h4>
                  <div className="whitespace-pre-wrap text-sm">
                    {(() => {
                      // Obtener la retroalimentación si existe
                      const feedback = typeof selectedReturnedTask?.notes === 'object'
                        ? selectedReturnedTask?.notes?.returned_feedback
                        : null;

                      if (feedback) {
                        return feedback;
                      } else {
                        // Consultar directamente en la base de datos si no hay retroalimentación en las notas
                        return (
                          <div>
                            <p>No se encontró retroalimentación específica para esta tarea.</p>
                            <p className="mt-2 text-orange-700">Esta tarea fue marcada como "Devuelta" y requiere revisión.</p>
                          </div>
                        );
                      }
                    })()}
                  </div>

                  {selectedReturnedTask?.notes &&
                    typeof selectedReturnedTask?.notes === 'object' &&
                    selectedReturnedTask?.notes?.returned_at && (
                      <p className="text-sm text-gray-500 mt-1">
                        Devuelta el {format(new Date(selectedReturnedTask?.notes?.returned_at), 'dd/MM/yyyy HH:mm')}
                        {selectedReturnedTask?.notes?.returned_by && (
                          <span> por {
                            // Si el ID parece un UUID, obtener el nombre del usuario
                            selectedReturnedTask?.notes?.returned_by.includes('-') ?
                              (() => {
                                // Intentar encontrar el usuario en la lista de usuarios del proyecto
                                const userId = selectedReturnedTask?.notes?.returned_by;
                                // Devolver un componente que carga el nombre del usuario
                                return (
                                  <UserNameDisplay userId={userId} />
                                );
                              })() :
                              // Si no es un UUID, mostrar directamente (podría ser un nombre)
                              selectedReturnedTask?.notes?.returned_by
                          }</span>
                        )}
                      </p>
                    )}
                </div>
              )}

              {/* Sección de selección de estado - solo mostrar si no es edición de tarea completada */}
              {!completedTaskItems.some(t => t.id === selectedTaskId) && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estado de la tarea:
                </label>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className={`px-4 py-2 rounded-md text-sm font-medium 
                              ${selectedStatus === 'completed' ? 'bg-green-100 text-green-800 border-2 border-green-500' : 'bg-gray-100 text-gray-800 border border-gray-300'}`}
                    onClick={() => setSelectedStatus('completed')}
                  >
                      Completada
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-2 rounded-md text-sm font-medium 
                              ${selectedStatus === 'blocked' ? 'bg-red-100 text-red-800 border-2 border-red-500' : 'bg-gray-100 text-gray-800 border border-gray-300'}`}
                    onClick={() => setSelectedStatus('blocked')}
                  >
                      Bloqueada
                    </button>
                    </div>
                  </div>
              )}

              {/* Detalles según el estado seleccionado */}
              {selectedStatus === 'completed' ? (
                <div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                      {completedTaskItems.some(t => t.id === selectedTaskId)
                        ? 'Editar entregables o resultados:'
                        : 'Detalla los entregables o resultados:'}
                </label>
                <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-yellow-500 focus:border-yellow-500"
                      rows={3}
                  value={statusDetails}
                  onChange={(e) => setStatusDetails(e.target.value)}
                      placeholder="Ejemplos: Terminé la implementación del módulo X, Corregí el error en Y, etc."
                    />
              </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Duración real de la tarea:
                    </label>
                    <div className="flex items-center">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 mr-2"
                        value={actualDuration}
                        onChange={(e) => setActualDuration(Number(e.target.value))}
                      />
                      <select
                        className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-yellow-500 focus:border-yellow-500"
                        value={durationUnit}
                        onChange={(e) => setDurationUnit(e.target.value as 'minutes' | 'hours')}
                      >
                        <option value="minutes">Minutos</option>
                        <option value="hours">Horas</option>
                      </select>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ¿Por qué tomó este tiempo? (opcional)
                    </label>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-yellow-500 focus:border-yellow-500"
                      rows={2}
                      value={durationReason}
                      onChange={(e) => setDurationReason(e.target.value)}
                      placeholder="Ejemplos: Fue más complejo de lo esperado, Hubo cambios en los requerimientos, etc."
                    />
                  </div>
                </div>
              ) : (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Detalla por qué está bloqueada:
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-yellow-500 focus:border-yellow-500"
                    rows={3}
                    value={statusDetails}
                    onChange={(e) => setStatusDetails(e.target.value)}
                    placeholder="Ejemplos: Estoy esperando respuesta de X, Falta información sobre Y, etc."
                  />
                </div>
              )}

              {statusError && (
                <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-md">
                  {statusError}
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-gray-50 flex justify-end space-x-3 border-t border-gray-200">
              <button
                onClick={() => setShowStatusModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-yellow-500"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitStatus}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 
                       ${selectedStatus === 'completed' ? 'bg-green-600 focus:ring-green-500' : 'bg-red-600 focus:ring-red-500'}`}
              >
                {returnedTaskItems.some(t => t.id === selectedTaskId)
                  ? selectedStatus === 'completed' ? 'Marcar como Corregida' : 'Marcar como Bloqueada'
                  : completedTaskItems.some(t => t.id === selectedTaskId)
                    ? 'Guardar Cambios'
                    : selectedStatus === 'completed' ? 'Marcar como Completada' : 'Marcar como Bloqueada'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para ver retroalimentación de tareas devueltas */}
      {showReturnedFeedbackModal && selectedReturnedTask && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium text-orange-700">
                Retroalimentación de Tarea Devuelta
              </h3>
              <button
                onClick={() => setShowReturnedFeedbackModal(false)}
                className="text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4">
              <div className="mb-4">
                <h4 className="text-md font-medium text-gray-800 mb-1">
                  {selectedReturnedTask?.title}
                  {selectedReturnedTask?.type === 'subtask' && selectedReturnedTask?.subtask_title && (
                    <span className="ml-2 text-sm text-gray-500">
                      (Subtarea de {selectedReturnedTask?.subtask_title})
                    </span>
                  )}
                </h4>
                <div className="text-sm text-gray-600">
                  {selectedReturnedTask?.description}
                </div>
              </div>

              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                <h4 className="text-sm font-medium text-orange-800 mb-1">Motivo de la devolución:</h4>
                <div className="whitespace-pre-wrap text-sm">
                  {(() => {
                    try {
                      // Verificar si hay retroalimentación disponible
                      const notes = selectedReturnedTask?.notes;
                      let feedback = '';

                      if (notes && typeof notes === 'object' && notes.returned_feedback) {
                        // Si la retroalimentación es un objeto, convertirlo a string legible
                        if (typeof notes.returned_feedback === 'object') {
                          try {
                            feedback = JSON.stringify(notes.returned_feedback, null, 2);
                          } catch (e) {
                            feedback = "Error al mostrar retroalimentación detallada.";
                          }
                        } else {
                          // Si es un string, usarlo directamente
                          feedback = String(notes.returned_feedback);
                        }

                        return feedback;
                      } else {
                        // Si no hay retroalimentación específica
                        return (
                          <div>
                            <p>No se encontró retroalimentación específica para esta tarea.</p>
                            <p className="mt-2 text-orange-700">Esta tarea fue marcada como "Devuelta" y requiere revisión.</p>
    </div>
                        );
                      }
                    } catch (error) {
                      console.error("Error al procesar la retroalimentación:", error);
                      return <p>Error al cargar la retroalimentación. Por favor, inténtelo de nuevo.</p>;
                    }
                  })()}
                </div>

                {selectedReturnedTask?.notes &&
                  typeof selectedReturnedTask?.notes === 'object' &&
                  selectedReturnedTask?.notes.returned_at && (
                    <div className="mt-3 text-xs text-gray-600">
                      Devuelta el {format(new Date(selectedReturnedTask?.notes.returned_at), 'dd/MM/yyyy HH:mm')}
                      {selectedReturnedTask?.notes.returned_by && (
                        <span> por {
                          // Si el ID parece un UUID, obtener el nombre del usuario
                          selectedReturnedTask?.notes?.returned_by.includes('-') ?
                            (() => {
                              // Intentar encontrar el usuario en la lista de usuarios del proyecto
                              const userId = selectedReturnedTask?.notes?.returned_by;
                              // Devolver un componente que carga el nombre del usuario
                              return (
                                <UserNameDisplay userId={userId} />
                              );
                            })() :
                            // Si no es un UUID, mostrar directamente (podría ser un nombre)
                            selectedReturnedTask?.notes?.returned_by
                        }</span>
                      )}
                    </div>
                  )}
              </div>

              <div className="mt-5 border-t border-gray-200 pt-4">
                <p className="text-sm text-gray-700 mb-3">
                  Para marcar esta tarea como completada, actualiza su estado desde la opción "Actualizar Estado".
                </p>
                <button
                  onClick={() => {
                    setShowReturnedFeedbackModal(false);
                    handleOpenStatusModal(selectedReturnedTask?.id);
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 transition-colors"
                >
                  Actualizar Estado Ahora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Añadir este componente cerca del inicio del archivo, después de las interfaces
function UserNameDisplay({ userId }: { userId: string }) {
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    async function fetchUserName() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', userId)
          .single();

        if (error) {
          console.error('Error al buscar nombre de usuario:', error);
          setUserName('Usuario');
        } else if (data) {
          // Usar el nombre completo si existe, sino el email, y si no hay ninguno, mostrar 'Usuario'
          setUserName(data.full_name || data.email || 'Usuario');
        } else {
          setUserName('Usuario');
        }
      } catch (error) {
        console.error('Error al cargar nombre de usuario:', error);
        setUserName('Usuario');
      }
    }

    if (userId) {
      fetchUserName();
    } else {
      setUserName('Usuario');
    }
  }, [userId]);

  return (
    <span className="font-medium">{userName || userId}</span>
  );
} 