import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Clock, Users, Filter, X, ChevronDown, ChevronUp, FolderOpen, CheckCircle, AlertTriangle, ArrowRight, ArrowLeft, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { statusTextMap } from '../components/TaskStatusDisplay';
import TaskStatusDisplay from '../components/TaskStatusDisplay';
import RichTextDisplay from '../components/RichTextDisplay';
import { Area, AreaUserAssignment } from '../types/Area';

interface TaskFeedback {
  feedback?: string;
  rating?: number;
  reviewed_by?: string;
  reviewed_at?: string;
}

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
  status: 'pending' | 'assigned' | 'blocked' | 'completed' | 'in_review' | 'returned' | 'approved';
  feedback?: TaskFeedback | null;
  returned_at?: string;
  assigned_users?: string[];
  razon_bloqueo?: string;
  notes?: string | { [key: string]: any };
}

interface Subtask {
  id: string;
  title: string;
  description: string | null;
  estimated_duration: number;
  sequence_order: number | null;
  assigned_to: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'in_review' | 'returned' | 'approved';
  task_id: string;
  start_date: string | null;
  deadline: string | null;
  feedback?: TaskFeedback | null;
  returned_at?: string;
  notes?: string | { [key: string]: any };
}

interface Project {
  id: string;
  name: string;
}

interface User {
  id: string;
  email: string;
  name?: string;
  assigned_projects?: string[];
}

interface UserWithArea extends User {
  area?: Area;
}

// Define the column statuses
const columns = [
  { id: 'pending', name: statusTextMap['pending'].toUpperCase() },
  { id: 'assigned', name: statusTextMap['assigned'].toUpperCase() },
  { id: 'blocked', name: statusTextMap['blocked'].toUpperCase() },
  { id: 'completed', name: statusTextMap['completed'].toUpperCase() },
  { id: 'in_review', name: statusTextMap['in_review'].toUpperCase() },
  { id: 'returned', name: statusTextMap['returned'].toUpperCase() },
  { id: 'approved', name: statusTextMap['approved'].toUpperCase() }
];

const mainTaskColumns = [
  { id: 'main_pending', name: 'PENDIENTE' },
  { id: 'main_in_progress', name: 'EN PROCESO' },
  { id: 'main_blocked', name: 'BLOQUEADA' },
  { id: 'main_in_review', name: 'EN REVISIÓN' },
  { id: 'main_completed', name: 'COMPLETADA' }
];

// Helper function to parse notes and feedback
const getItemDetails = (item: Task | Subtask | null): {
  description: string | null;
  deliveryComments: string | null;
  blockReason: string | null;
  returnedFeedback: TaskFeedback | null;
  approvedFeedback: TaskFeedback | null;
  realDuration: number | null;
  timeBreakdown: {
    initial: number | null;
    rework: Array<{ tiempo: number; fecha_devolucion: string; motivo?: string }>;
    total: number | null;
  } | null;
} => {
  if (!item) {
    return {
      description: null,
      deliveryComments: null,
      blockReason: null,
      returnedFeedback: null,
      approvedFeedback: null,
      realDuration: null,
      timeBreakdown: null
    };
  }

  let description = item.description;
  let deliveryComments: string | null = null;
  let blockReason: string | null = null;
  let returnedFeedback: TaskFeedback | null = null;
  let approvedFeedback: TaskFeedback | null = null;
  let realDuration: number | null = null;
  let timeBreakdown: {
    initial: number | null;
    rework: Array<{ tiempo: number; fecha_devolucion: string; motivo?: string }>;
    total: number | null;
  } | null = null;
  
  const notes = item.notes;
  let parsedNotes: any = null;

  if (typeof notes === 'string') {
    try {
      parsedNotes = JSON.parse(notes);
    } catch (e) {
      // If it's not JSON, treat it as raw notes (could be delivery comments)
      // Avoid setting it directly if status isn't relevant
      if (item.status === 'completed' || item.status === 'in_review') {
         deliveryComments = notes;
      } else if (item.status === 'blocked') {
         blockReason = notes;
      }
    }
  } else if (typeof notes === 'object' && notes !== null) {
    parsedNotes = notes;
  }

  if (parsedNotes) {
    if (item.status === 'blocked' && parsedNotes.razon_bloqueo) {
      blockReason = parsedNotes.razon_bloqueo;
    }
    if ((item.status === 'completed' || item.status === 'in_review' || item.status === 'approved') && parsedNotes.entregables) {
      deliveryComments = typeof parsedNotes.entregables === 'string' 
        ? parsedNotes.entregables
        : JSON.stringify(parsedNotes.entregables, null, 2);
    }
     // Accept 'notes' field as potential delivery comments too
    if (!deliveryComments && parsedNotes.notes && (item.status === 'completed' || item.status === 'in_review' || item.status === 'approved')) {
        deliveryComments = typeof parsedNotes.notes === 'string'
            ? parsedNotes.notes
            : JSON.stringify(parsedNotes.notes, null, 2);
    }
    
    // Manejar estructura de tiempo con historial de devoluciones
    if (parsedNotes.duracion_inicial || parsedNotes.duracion_retrabajo || parsedNotes.duracion_total) {
      // Nueva estructura con historial
      timeBreakdown = {
        initial: parsedNotes.duracion_inicial || null,
        rework: parsedNotes.duracion_retrabajo || [],
        total: parsedNotes.duracion_total || null
      };
      realDuration = timeBreakdown.total;
    } else if (parsedNotes.duracion_real) {
      // Estructura legacy - migrar a nueva estructura si la tarea no ha sido devuelta
      realDuration = parsedNotes.duracion_real;
      timeBreakdown = {
        initial: parsedNotes.duracion_real,
        rework: [],
        total: parsedNotes.duracion_real
      };
    }
  }

  if (item.feedback) {
    if (item.status === 'returned') {
      returnedFeedback = item.feedback;
    } else if (item.status === 'approved') {
      approvedFeedback = item.feedback;
    }
  }

  return { description, deliveryComments, blockReason, returnedFeedback, approvedFeedback, realDuration, timeBreakdown };
};

const determineMainTaskStatus = (task: Task, subtasksOfTask: Subtask[]): string => {
  // If the task has subtasks, use the aggregation logic
  if (subtasksOfTask && subtasksOfTask.length > 0) {
    const allApproved = subtasksOfTask.every(st => st.status === 'approved');
    if (allApproved) {
      return 'main_completed';
    }

    const anyInReview = subtasksOfTask.some(st => st.status === 'in_review');
    if (anyInReview) {
      return 'main_in_review';
    }

    const anyBlockedOrReturned = subtasksOfTask.some(st => st.status === 'blocked' || st.status === 'returned');
    if (anyBlockedOrReturned) {
      return 'main_blocked';
    }
    
    // Solo considerar como "en proceso" si realmente han comenzado a trabajar
    const anyInProgress = subtasksOfTask.some(st => ['in_progress', 'completed', 'approved'].includes(st.status));
    if(anyInProgress) {
        return 'main_in_progress';
    }

    // Si todas las subtareas están pendientes (aunque tengan asignados), la tarea principal debe estar pendiente
    const allPending = subtasksOfTask.every(st => st.status === 'pending');
    if (allPending) {
      return 'main_pending';
    }
    
    return 'main_pending';
  }

  // If the task has NO subtasks, map its own status
  switch (task.status) {
    case 'approved':
      return 'main_completed';
    case 'in_review':
    case 'completed':
      return 'main_in_review';
    case 'blocked':
    case 'returned':
      return 'main_blocked';
    case 'assigned':
      return 'main_in_progress';
    case 'pending':
    default:
      return 'main_pending';
  }
};

function Management() {
  const { isAdmin, user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [userAreaAssignments, setUserAreaAssignments] = useState<AreaUserAssignment[]>([]);
  const [usersWithAreas, setUsersWithAreas] = useState<UserWithArea[]>([]);
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [groupByProject, setGroupByProject] = useState(true);
  const [groupByPriority, setGroupByPriority] = useState(false);
  const [groupByAssignee, setGroupByAssignee] = useState(false);
  const [groupByDeadline, setGroupByDeadline] = useState(false);
  const [view, setView] = useState<'subtasks' | 'main_tasks' | 'review'>('subtasks');
  const [processedMainTasks, setProcessedMainTasks] = useState<(Task & { 
    main_task_status: string;
    subtaskStats: {
      total: number;
      approved: number;
      completed: number;
    };
    approvedPercentage: number;
    completedAndApprovedPercentage: number;
  })[]>([]);
  const [reviewSubTab, setReviewSubTab] = useState<'ready_for_review' | 'in_review' | 'blocked'>('ready_for_review');
  
  // Estados para los modales
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showUnblockModal, setShowUnblockModal] = useState(false); // Nuevo modal para desbloquear
  const [showFeedbackDetailsModal, setShowFeedbackDetailsModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{id: string, type: 'task' | 'subtask', status: string} | null>(null);
  const [targetStatus, setTargetStatus] = useState('');
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(5);
  const [feedbackDetails, setFeedbackDetails] = useState<TaskFeedback | null>(null);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);
  const [detailsItem, setDetailsItem] = useState<{id: string, type: 'task' | 'subtask'} | null>(null);
  const [taskDetails, setTaskDetails] = useState<any>(null);
  const [relatedSubtasks, setRelatedSubtasks] = useState<Subtask[]>([]);
  const [previousSubtask, setPreviousSubtask] = useState<Subtask | null>(null);
  const [nextSubtask, setNextSubtask] = useState<Subtask | null>(null);
  const [deliveryComments, setDeliveryComments] = useState<string>('');
  const [newAssignee, setNewAssignee] = useState<string>(''); // Estado para el nuevo responsable
  const [isUpdatingAssignee, setIsUpdatingAssignee] = useState(false); // Estado para controlar la actualización

  // Agregar estos estados nuevos después de los estados existentes
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const processMainTasks = useCallback((allTasks: Task[], allSubtasks: Subtask[]) => {
    if (!allTasks) return;
    
    const tasksWithDetails = allTasks.map(task => {
        const relatedSubtasks = allSubtasks.filter(st => st.task_id === task.id);
        const main_task_status = determineMainTaskStatus(task, relatedSubtasks);

        const total = relatedSubtasks.length;
        const approved = relatedSubtasks.filter(st => st.status === 'approved').length;
        const completed = relatedSubtasks.filter(st => st.status === 'completed').length;
        
        const approvedPercentage = total > 0 ? (approved / total) * 100 : 0;
        const completedAndApprovedPercentage = total > 0 ? ((approved + completed) / total) * 100 : 0;
        
        return { 
          ...task, 
          main_task_status,
          subtaskStats: {
            total,
            approved,
            completed
          },
          approvedPercentage,
          completedAndApprovedPercentage,
        };
    });
    setProcessedMainTasks(tasksWithDetails);
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchUsers();
    fetchAreas();
    fetchData();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedProject, selectedPriority, selectedAssignee]);
  
  useEffect(() => {
    if (tasks.length > 0 || subtasks.length > 0) {
        processMainTasks(tasks, subtasks);
    }
  }, [tasks, subtasks, processMainTasks]);

  useEffect(() => {
    // Solo configurar el intervalo si autoRefresh está activado
    if (!autoRefresh) return;
    
    const refreshInterval = setInterval(() => {
      console.log('Auto-refrescando datos del tablero Kanban...');
      fetchData();
    }, 5000); // 5000 ms = 5 segundos
    
    // Limpiar el intervalo cuando el componente se desmonte o las dependencias cambien
    return () => clearInterval(refreshInterval);
  }, [autoRefresh, selectedProject, selectedPriority, selectedAssignee]);
  
  async function fetchProjects() {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('is_archived', false);

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error al cargar proyectos:', error);
    }
  }

  async function fetchUsers() {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name')
        .order('name');

      if (error) throw error;
      console.log('Usuarios cargados:', data?.length, data?.map(u => ({ id: u.id, name: u.name, email: u.email })));
      setUsers(data || []);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    }
  }

  async function fetchAreas() {
    try {
      // Fetch areas
      const { data: areasData, error: areasError } = await supabase
        .from('areas')
        .select('*');

      if (areasError) throw areasError;

      // Fetch user-area assignments
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('area_user_assignments')
        .select('*');

      if (assignmentsError) throw assignmentsError;

      setAreas(areasData || []);
      setUserAreaAssignments(assignmentsData || []);
    } catch (error) {
      console.error('Error al cargar áreas:', error);
    }
  }

  // Effect to combine users with their areas
  useEffect(() => {
    const usersWithAreasData: UserWithArea[] = users.map(user => {
      const userAssignment = userAreaAssignments.find(assignment => assignment.user_id === user.id);
      const userArea = userAssignment ? areas.find(area => area.id === userAssignment.area_id) : undefined;
      
      return {
        ...user,
        area: userArea
      };
    });
    setUsersWithAreas(usersWithAreasData);
  }, [users, areas, userAreaAssignments]);

  // Effect to expand all areas by default when switching to review view
  useEffect(() => {
    if (view === 'review' && areas.length > 0) {
      const allAreaIds = new Set([...areas.map(area => area.id), 'no_area']);
      setExpandedAreas(allAreaIds);
    }
  }, [view, areas]);

  async function fetchData() {
    if (refreshing) return; // Evitar múltiples llamadas simultáneas
    
    setRefreshing(true);
    try {
      // Fetch tasks with filter - excluyendo proyectos archivados
      let query = supabase
        .from('tasks')
        .select(`
          *,
          projects!inner(id, is_archived)
        `)
        .eq('projects.is_archived', false);
      
      if (selectedProject) {
        query = query.eq('project_id', selectedProject);
      }
      
      if (selectedPriority) {
        query = query.eq('priority', selectedPriority);
      }
      
      const { data: tasksData, error: tasksError } = await query;
      
      if (tasksError) throw tasksError;
      
      // Fetch subtasks - excluyendo proyectos archivados
      let subtasksQuery = supabase
        .from('subtasks')
        .select(`
          *,
          tasks!inner(
            id, project_id,
            projects!inner(id, is_archived)
          )
        `)
        .eq('tasks.projects.is_archived', false);
      
      // Si hay un proyecto seleccionado, filtrar subtareas por las tareas de ese proyecto
      if (selectedProject && tasksData) {
        const taskIds = tasksData.map(task => task.id);
        if (taskIds.length > 0) {
          subtasksQuery = subtasksQuery.in('task_id', taskIds);
        } else {
          // Si no hay tareas en el proyecto, no deberíamos mostrar subtareas
          setTasks([]);
          setSubtasks([]);
          setRefreshing(false);
          setLoading(false);
          return;
        }
      }
      
      if (selectedAssignee) {
        subtasksQuery = subtasksQuery.eq('assigned_to', selectedAssignee);
      }
      
      const { data: subtasksData, error: subtasksError } = await subtasksQuery;
      
      if (subtasksError) throw subtasksError;
      
      // Filtrar tareas basadas en las subtareas cuando hay un filtro de asignee
      let filteredTasks = tasksData || [];
      if (selectedAssignee && subtasksData) {
        const taskIds = new Set(subtasksData.map(subtask => subtask.task_id));
        filteredTasks = filteredTasks.filter(task => taskIds.has(task.id));
      }
      
      setTasks(filteredTasks);
      setSubtasks(subtasksData || []);
    } catch (error) {
      console.error('Error al cargar datos:', error);
      toast.error('No se pudieron cargar los datos.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  async function handleStatusChange(itemId: string, newStatus: string, isSubtask: boolean = false) {
    // Primero verificar el estado actual del elemento
    const table = isSubtask ? 'subtasks' : 'tasks';
    const currentItem = isSubtask 
      ? subtasks.find(s => s.id === itemId)
      : tasks.find(t => t.id === itemId);
    
    if (!currentItem) {
      toast.error('No se pudo encontrar el elemento seleccionado');
      return;
    }
    
    const currentStatus = currentItem.status;
    
    // Validar transiciones permitidas
    const allowedTransitions: Record<string, string[]> = {
      'completed': ['in_review'],
      'blocked': ['pending'], // <-- CAMBIO: De 'assigned' a 'pending'
      'in_review': ['returned', 'approved', 'completed']
    };
    
    // Verificar si la transición está permitida
    if (!allowedTransitions[currentStatus as keyof typeof allowedTransitions]?.includes(newStatus)) {
      toast.error(`No se puede cambiar de "${statusTextMap[currentStatus as keyof typeof statusTextMap] || currentStatus}" a "${statusTextMap[newStatus as keyof typeof statusTextMap] || newStatus}"`);
      return;
    }
    
    // Configurar el elemento seleccionado y el estado objetivo
    setSelectedItem({
      id: itemId,
      type: isSubtask ? 'subtask' : 'task',
      status: currentStatus
    });
    setTargetStatus(newStatus);
    
    // Mostrar el modal correspondiente según el nuevo estado
    if (newStatus === 'returned') {
      setShowFeedbackModal(true);
      return; // No actualizar hasta que se envíe el formulario
    } else if (newStatus === 'approved') {
      setShowApprovalModal(true);
      return; // No actualizar hasta que se envíe el formulario
    } else if (newStatus === 'in_review' || newStatus === 'completed' || newStatus === 'pending') {
      // Para 'in_review', 'completed' o 'pending' (desbloqueo) no necesitamos feedback, actualizamos directamente
      updateItemStatus(itemId, newStatus, isSubtask);
    }
  }
  
  // Función para actualizar el estado en la base de datos
  async function updateItemStatus(
    itemId: string, 
    newStatus: string, 
    isSubtask: boolean = false, 
    feedbackData: TaskFeedback | null = null,
    additionalData: any = null
  ) {
    const table = isSubtask ? 'subtasks' : 'tasks';
    
    // 1. Obtener el estado actual para registrarlo en el historial
    const { data: currentItem, error: fetchError } = await supabase
        .from(table)
        .select('status')
        .eq('id', itemId)
        .single();

    if (fetchError) {
        console.error(`[HISTORY] No se pudo obtener el estado actual para ${table}#${itemId}:`, fetchError);
        // Si no podemos obtener el estado anterior, no podemos registrar el historial, pero continuamos con la actualización.
    }
    const previousStatus = currentItem?.status || 'unknown';


    const updateData: any = { status: newStatus };

    if (feedbackData) {
      updateData.feedback = feedbackData;
    }

    try {
      const { data, error } = await supabase
        .from(table)
        .update(updateData)
        .eq('id', itemId)
        .select(isSubtask ? '*, task_id' : '*') // Solo seleccionar task_id para subtareas
        .single();

      if (error) throw error;
      
      // 2. Si se desbloquea una tarea (cambio de 'blocked' a 'pending'), eliminar task_work_assignments
      if (previousStatus === 'blocked' && newStatus === 'pending') {
        await removeTaskWorkAssignments(itemId, isSubtask ? 'subtask' : 'task');
        
        // 🔔 Notificar a usuarios que la tarea está disponible (desbloqueada)
        try {
          const taskData = data as any;
          let usersToNotify: string[] = [];
          let taskTitle = taskData.title;
          let projectName = "Proyecto sin nombre";
          let parentTaskTitle = undefined;
          
          if (isSubtask) {
            // Para subtareas, notificar al usuario asignado
            if (taskData.assigned_to) {
              usersToNotify = [taskData.assigned_to];
            }
            
            // Obtener título de tarea padre y proyecto
            const { data: parentTask } = await supabase
              .from('tasks')
              .select('title, project_id')
              .eq('id', taskData.task_id)
              .single();
              
            if (parentTask) {
              parentTaskTitle = parentTask.title;
              
              if (parentTask.project_id) {
                const { data: projectData } = await supabase
                  .from('projects')
                  .select('name')
                  .eq('id', parentTask.project_id)
                  .eq('is_archived', false)
                  .single();
                  
                if (projectData) {
                  projectName = projectData.name;
                }
              }
            }
          } else {
            // Para tareas principales, notificar a usuarios asignados
            if (taskData.assigned_users && taskData.assigned_users.length > 0) {
              usersToNotify = taskData.assigned_users;
            }
            
            // Obtener nombre del proyecto
            if (taskData.project_id) {
              const { data: projectData } = await supabase
                .from('projects')
                .select('name')
                .eq('id', taskData.project_id)
                .eq('is_archived', false)
                .single();
                
              if (projectData) {
                projectName = projectData.name;
              }
            }
          }
          
          // Enviar notificaciones de tarea disponible con retry
          if (usersToNotify.length > 0) {
            // Importar la función sendNotificationRobust dinámicamente
            import('../../api/telegram.js').then(({ sendNotificationRobust }) => {
              sendNotificationRobust(
                '/api/telegram/task-available',
                {
                  userIds: usersToNotify,
                  taskTitle: taskTitle,
                  projectName: projectName,
                  reason: 'unblocked',
                  isSubtask: isSubtask,
                  parentTaskTitle: parentTaskTitle
                },
                'Notificación de tarea desbloqueada'
              );
            }).catch(error => {
              console.error('🚨 [NOTIFICATION] Error al cargar función de notificación:', error);
            });
          }
        } catch (notificationError) {
          console.error('🚨 [NOTIFICATION] Error preparando notificación de tarea desbloqueada:', notificationError);
        }
      }
      
      // 3. Manejar el historial de estados
      if (previousStatus !== 'unknown' && user) {
        // CASOS ESPECIALES: Cuando un admin "cancela" un estado erróneo
        // debemos ELIMINAR el registro problemático en lugar de crear nuevos registros
        
        if (previousStatus === 'in_review' && newStatus === 'completed') {
          // Cancelar revisión: eliminar el registro de in_review
          console.log(`[HISTORY] Cancelando revisión: eliminando registro 'in_review' para ${table}#${itemId}`);
          
          const { error: deleteError } = await supabase
            .from('status_history')
            .delete()
            .eq(isSubtask ? 'subtask_id' : 'task_id', itemId)
            .eq('new_status', 'in_review')
            .order('changed_at', { ascending: false })
            .limit(1);

          if (deleteError) {
            console.error('⚠️ [HISTORY] No se pudo eliminar el registro de in_review:', deleteError);
          } else {
            console.log('✅ [HISTORY] Registro de in_review eliminado correctamente. Revisión cancelada.');
          }
        } else if (previousStatus === 'blocked' && newStatus === 'pending') {
          // Cancelar bloqueo: eliminar el registro de blocked
          console.log(`[HISTORY] Cancelando bloqueo: eliminando registro 'blocked' para ${table}#${itemId}`);
          
          const { error: deleteError } = await supabase
            .from('status_history')
            .delete()
            .eq(isSubtask ? 'subtask_id' : 'task_id', itemId)
            .eq('new_status', 'blocked')
            .order('changed_at', { ascending: false })
            .limit(1);

          if (deleteError) {
            console.error('⚠️ [HISTORY] No se pudo eliminar el registro de blocked:', deleteError);
          } else {
            console.log('✅ [HISTORY] Registro de blocked eliminado correctamente. Bloqueo cancelado.');
          }
        } else {
          // CASO NORMAL: Registrar el cambio de estado normalmente
          const historyRecord = {
              task_id: isSubtask ? (data as Subtask).task_id : itemId,
              subtask_id: isSubtask ? itemId : null,
              changed_by: user.id,
              previous_status: previousStatus,
              new_status: newStatus,
              metadata: feedbackData, // El feedback es una buena metadata para este evento
          };

          const { error: historyError } = await supabase
              .from('status_history')
              .insert([historyRecord]);

          if (historyError) {
              console.error('⚠️ [HISTORY] No se pudo registrar el cambio de estado en Management:', historyError);
          } else {
              console.log('✅ [HISTORY] Cambio de estado registrado con éxito desde Management.');
          }
        }
      }

            // 🔔 Enviar notificación a administradores para acciones administrativas
      if (['in_review', 'approved', 'returned'].includes(newStatus) && data) {
        try {
          // Obtener información del item actualizado
          const itemData = data as any;
          
          // Para subtareas, obtener información de la tarea padre
          let parentTaskTitle = undefined;
          let taskTitle = itemData.title;
          let projectName = "Proyecto sin nombre";
          let assignedUserName = "Usuario desconocido";
          let assignedUserAreaName = "Sin área";
          
          if (isSubtask) {
            // Obtener información de la tarea padre
            const { data: parentTask } = await supabase
              .from('tasks')
              .select('title, project_id')
              .eq('id', itemData.task_id)
              .single();
              
            if (parentTask) {
              parentTaskTitle = parentTask.title;
              
              // Obtener información del proyecto por separado
              if (parentTask.project_id) {
                const { data: projectData } = await supabase
                  .from('projects')
                  .select('name')
                  .eq('id', parentTask.project_id)
                  .eq('is_archived', false)
                  .single();
                  
                if (projectData) {
                  projectName = projectData.name;
                }
              }
            }
            
            // Obtener información del usuario asignado a la subtarea y su área
            if (itemData.assigned_to) {
              const { data: assignedUser } = await supabase
                .from('users')
                .select('name, email')
                .eq('id', itemData.assigned_to)
                .single();
                
              if (assignedUser) {
                assignedUserName = assignedUser.name || assignedUser.email;
              }

              // Obtener el área del usuario asignado
              try {
                const { data: userAreas } = await supabase
                  .rpc('get_areas_by_user', { user_uuid: itemData.assigned_to });
                
                if (userAreas && userAreas.length > 0) {
                  assignedUserAreaName = userAreas[0].area_name || "Sin área";
                }
              } catch (error) {
                console.error("Error obteniendo área del usuario asignado:", error);
              }
            }
          } else {
            // Para tareas principales, obtener información del proyecto
            if (itemData.project_id) {
              const { data: projectData } = await supabase
                .from('projects')
                .select('name')
                .eq('id', itemData.project_id)
                .single();
                
              if (projectData) {
                projectName = projectData.name;
              }
            }
            
            // Para tareas principales, obtener el primer usuario asignado y su área
            if (itemData.assigned_users && itemData.assigned_users.length > 0) {
              const firstUserId = itemData.assigned_users[0];
              
              const { data: assignedUser } = await supabase
                .from('users')
                .select('name, email')
                .eq('id', firstUserId)
                .single();
                
              if (assignedUser) {
                assignedUserName = assignedUser.name || assignedUser.email;
              }

              // Obtener el área del primer usuario asignado
              try {
                const { data: userAreas } = await supabase
                  .rpc('get_areas_by_user', { user_uuid: firstUserId });
                
                if (userAreas && userAreas.length > 0) {
                  assignedUserAreaName = userAreas[0].area_name || "Sin área";
                }
              } catch (error) {
                console.error("Error obteniendo área del usuario asignado:", error);
              }
            }
          }

          // Preparar datos para la notificación de acciones administrativas
          const notificationData = {
            taskTitle: taskTitle,
            userName: assignedUserName,
            projectName: projectName,
            areaName: assignedUserAreaName,
            status: newStatus,
            adminName: user?.name || user?.email || 'Administrador',
            isSubtask: isSubtask,
            parentTaskTitle: parentTaskTitle,
            taskId: itemId, // Agregar el ID del item para obtener información de tiempo
            ...(newStatus === 'returned' && feedbackData?.feedback ? { returnFeedback: feedbackData.feedback } : {})
          };

          // Enviar notificación asíncrona a admin (no bloquear el flujo del usuario)
          fetch('/api/telegram/admin-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(notificationData)
          }).then(response => {
            if (response.ok) {
              console.log(`✅ [NOTIFICATION] Notificación administrativa enviada para tarea ${newStatus}`);
            } else {
              console.warn(`⚠️ [NOTIFICATION] Error al enviar notificación administrativa: ${response.status}`);
            }
          }).catch(error => {
            console.error('🚨 [NOTIFICATION] Error al enviar notificación administrativa:', error);
          });

          // 🔔 NUEVA FUNCIONALIDAD: Notificar al usuario cuando su tarea va a revisión
          if (newStatus === 'in_review') {
            try {
              let usersToNotifyReview: string[] = [];
              
              if (isSubtask) {
                // Para subtareas, notificar al usuario asignado
                const { data: subtaskData } = await supabase
                  .from('subtasks')
                  .select('assigned_to')
                  .eq('id', itemId)
                  .single();
                  
                if (subtaskData?.assigned_to) {
                  usersToNotifyReview = [subtaskData.assigned_to];
                }
              } else {
                // Para tareas principales, notificar a todos los usuarios asignados
                const { data: taskData } = await supabase
                  .from('tasks')
                  .select('assigned_users')
                  .eq('id', itemId)
                  .single();
                  
                if (taskData?.assigned_users && taskData.assigned_users.length > 0) {
                  usersToNotifyReview = taskData.assigned_users;
                }
              }

              // Enviar notificaciones a usuarios afectados
              if (usersToNotifyReview.length > 0) {
                fetch('/api/telegram/user-task-in-review', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userIds: usersToNotifyReview,
                    taskTitle: taskTitle,
                    projectName: projectName,
                    adminName: user?.name || user?.email || 'Administrador',
                    isSubtask: isSubtask,
                    parentTaskTitle: parentTaskTitle
                  })
                }).then(response => {
                  if (response.ok) {
                    console.log(`✅ [USER-NOTIFICATION] Notificación de revisión enviada a ${usersToNotifyReview.length} usuario(s)`);
                  } else {
                    console.warn(`⚠️ [USER-NOTIFICATION] Error al enviar notificación de revisión a usuarios: ${response.status}`);
                  }
                }).catch(error => {
                  console.error('🚨 [USER-NOTIFICATION] Error al enviar notificación de revisión a usuarios:', error);
                });
              }
            } catch (userNotificationError) {
              console.error('🚨 [USER-NOTIFICATION] Error preparando notificación de revisión para usuarios:', userNotificationError);
            }
          }

        } catch (notificationError) {
          // No bloquear el flujo por errores de notificación
          console.error('🚨 [NOTIFICATION] Error preparando notificación administrativa:', notificationError);
        }
      }

      toast.success('Estado actualizado correctamente');

      // Actualizar la UI
      if (isSubtask) {
        setSubtasks(prev => prev.map(subtask => 
          subtask.id === itemId 
            ? { 
                ...subtask,
                ...updateData,
                status: newStatus as 'pending' | 'in_progress' | 'completed' | 'blocked' | 'in_review' | 'returned' | 'approved', 
                feedback: feedbackData || subtask.feedback 
              } 
            : subtask
        ));
      } else {
        setTasks(prev => prev.map(task => 
          task.id === itemId 
            ? { 
                ...task,
                ...updateData,
                status: newStatus as 'pending' | 'assigned' | 'blocked' | 'completed' | 'in_review' | 'returned' | 'approved',
                feedback: feedbackData || task.feedback 
              } 
            : task
        ));
      }
      
      // Si se aprobó una subtarea, verificar si la tarea padre debe ser aprobada y notificar dependencias
      if (isSubtask && newStatus === 'approved') {
        const parentTaskId = (data as Subtask)?.task_id;
        if (parentTaskId) {
          await checkAndApproveParentTask(parentTaskId);
          
          // 🔔 Verificar si hay dependencias secuenciales que ahora están disponibles
          try {
            const subtaskData = data as Subtask;
            await checkAndNotifySequentialDependencies(parentTaskId, subtaskData.sequence_order);
          } catch (error) {
            console.error('🚨 [NOTIFICATION] Error verificando dependencias secuenciales:', error);
          }
        }
      }

      // Cerrar modales
      setShowFeedbackModal(false);
      setShowApprovalModal(false);
      setSelectedItem(null);
      setFeedback('');
      setRating(5);
      
    } catch (error) {
      console.error('Error al actualizar estado:', error);
      toast.error('Error al actualizar el estado');
      // Recargar datos para asegurar consistencia
      fetchData();
    }
  }

  // Función para actualizar el responsable de una tarea o subtarea
  async function handleUpdateAssignee(itemId: string, isSubtask: boolean, newAssigneeId: string) {
    if (!newAssigneeId) {
      toast.error('Por favor selecciona un usuario');
      return;
    }

    setIsUpdatingAssignee(true);
    try {
      const table = isSubtask ? 'subtasks' : 'tasks';
      let taskTitle = '';
      let projectName = 'Proyecto sin nombre';
      let parentTaskTitle: string | undefined = undefined;
      let previousUserId: string | null = null;
      
      if (isSubtask) {
        // Para subtareas, obtener información antes de actualizar (incluyendo el usuario anterior)
        const { data: subtaskData, error: fetchError } = await supabase
          .from('subtasks')
          .select('title, task_id, assigned_to')
          .eq('id', itemId)
          .single();

        if (fetchError) throw fetchError;
        
        taskTitle = subtaskData.title;
        previousUserId = subtaskData.assigned_to;
        
        // Obtener información de la tarea padre
        if (subtaskData.task_id) {
          const { data: parentTaskData } = await supabase
            .from('tasks')
            .select('title, project_id')
            .eq('id', subtaskData.task_id)
            .single();
          
          if (parentTaskData) {
            parentTaskTitle = parentTaskData.title;
            
            // Obtener nombre del proyecto
            if (parentTaskData.project_id) {
              const { data: projectData } = await supabase
                .from('projects')
                .select('name')
                .eq('id', parentTaskData.project_id)
                .eq('is_archived', false)
                .single();
              
              if (projectData) {
                projectName = projectData.name;
              }
            }
          }
        }
        
        // Actualizar assigned_to
        const { error } = await supabase
          .from('subtasks')
          .update({ assigned_to: newAssigneeId })
          .eq('id', itemId);

        if (error) throw error;
      } else {
        // Para tareas principales, obtener información antes de actualizar
        const { data: currentTask, error: fetchError } = await supabase
          .from('tasks')
          .select('title, assigned_users, project_id')
          .eq('id', itemId)
          .single();

        if (fetchError) throw fetchError;

        taskTitle = currentTask.title;
        
        // Obtener el usuario anterior antes de actualizar
        if (currentTask.assigned_users && currentTask.assigned_users.length > 0) {
          previousUserId = currentTask.assigned_users[0];
        }
        
        // Obtener nombre del proyecto
        if (currentTask.project_id) {
          const { data: projectData } = await supabase
            .from('projects')
            .select('name')
            .eq('id', currentTask.project_id)
            .eq('is_archived', false)
            .single();
          
          if (projectData) {
            projectName = projectData.name;
          }
        }

        // Reemplazar el array con el nuevo usuario (o agregarlo si no existe)
        const updatedAssignedUsers = currentTask.assigned_users 
          ? [newAssigneeId] // Simplificar: asignar solo al nuevo usuario
          : [newAssigneeId];

        const { error } = await supabase
          .from('tasks')
          .update({ assigned_users: updatedAssignedUsers })
          .eq('id', itemId);

        if (error) throw error;
      }

      // 🗑️ Eliminar sesiones de trabajo y asignaciones del usuario anterior
      if (previousUserId && previousUserId !== newAssigneeId) {
        try {
          console.log(`[REASSIGN] Limpiando sesiones de trabajo del usuario anterior: ${previousUserId}`);
          
          // 1. Obtener los task_work_assignments del usuario anterior para esta tarea
          const assignmentQuery = supabase
            .from('task_work_assignments')
            .select('id')
            .eq('user_id', previousUserId)
            .eq('task_type', isSubtask ? 'subtask' : 'task');
          
          if (isSubtask) {
            assignmentQuery.eq('subtask_id', itemId);
          } else {
            assignmentQuery.eq('task_id', itemId);
          }
          
          const { data: assignments, error: assignmentsError } = await assignmentQuery;
          
          if (assignmentsError) {
            console.warn('[REASSIGN] Error al obtener task_work_assignments:', assignmentsError);
          } else if (assignments && assignments.length > 0) {
            const assignmentIds = assignments.map(a => a.id);
            
            // 2. Eliminar work_sessions asociados a estos assignments
            const { error: sessionsError } = await supabase
              .from('work_sessions')
              .delete()
              .in('assignment_id', assignmentIds);
            
            if (sessionsError) {
              console.warn('[REASSIGN] Error al eliminar work_sessions:', sessionsError);
            } else {
              console.log(`[REASSIGN] Eliminados ${assignments.length} work_sessions del usuario anterior`);
            }
            
            // 3. Eliminar task_work_assignments del usuario anterior
            const deleteQuery = supabase
              .from('task_work_assignments')
              .delete()
              .eq('user_id', previousUserId)
              .eq('task_type', isSubtask ? 'subtask' : 'task');
            
            if (isSubtask) {
              deleteQuery.eq('subtask_id', itemId);
            } else {
              deleteQuery.eq('task_id', itemId);
            }
            
            const { error: deleteError } = await deleteQuery;
            
            if (deleteError) {
              console.warn('[REASSIGN] Error al eliminar task_work_assignments:', deleteError);
            } else {
              console.log(`[REASSIGN] Eliminados task_work_assignments del usuario anterior`);
            }
          }
        } catch (cleanupError) {
          // No bloquear el flujo por errores de limpieza
          console.error('[REASSIGN] Error al limpiar sesiones del usuario anterior:', cleanupError);
        }
      }

      // Obtener información de usuarios para la notificación
      let previousUserName = 'No asignado';
      let newUserName = 'Usuario desconocido';
      let newUserAreaName = 'Sin área';
      
      // Obtener información del usuario anterior
      if (previousUserId) {
        const { data: previousUserData } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', previousUserId)
          .single();
        
        if (previousUserData) {
          previousUserName = previousUserData.name || previousUserData.email || 'Usuario desconocido';
        }
      }
      
      // Obtener información del nuevo usuario
      const { data: newUserData } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', newAssigneeId)
        .single();
      
      if (newUserData) {
        newUserName = newUserData.name || newUserData.email || 'Usuario desconocido';
      }
      
      // Obtener área del nuevo usuario
      try {
        const { data: userAreas } = await supabase
          .rpc('get_areas_by_user', { user_uuid: newAssigneeId });
        
        if (userAreas && userAreas.length > 0) {
          newUserAreaName = userAreas[0].area_name || 'Sin área';
        }
      } catch (error) {
        console.error("Error obteniendo área del nuevo usuario:", error);
      }

      // 🔔 Enviar notificación al nuevo usuario asignado
      try {
        fetch('/api/telegram/task-available', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userIds: [newAssigneeId],
            taskTitle: taskTitle,
            projectName: projectName,
            reason: 'reassigned',
            isSubtask: isSubtask,
            parentTaskTitle: parentTaskTitle
          })
        }).then(response => {
          if (response.ok) {
            console.log(`✅ [NOTIFICATION] Notificación de reasignación enviada al usuario ${newAssigneeId}`);
          } else {
            console.warn(`⚠️ [NOTIFICATION] Error al enviar notificación de reasignación: ${response.status}`);
          }
        }).catch(error => {
          console.error('🚨 [NOTIFICATION] Error al enviar notificación de reasignación:', error);
        });
      } catch (notificationError) {
        // No bloquear el flujo por errores de notificación
        console.error('🚨 [NOTIFICATION] Error preparando notificación de reasignación:', notificationError);
      }

      // 🔔 Enviar notificación al grupo de administradores
      try {
        const adminName = user?.name || user?.email || 'Administrador';
        
        fetch('/api/telegram/admin-notification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskTitle: taskTitle,
            previousUserName: previousUserName,
            newUserName: newUserName,
            projectName: projectName,
            areaName: newUserAreaName,
            adminName: adminName,
            isSubtask: isSubtask,
            parentTaskTitle: parentTaskTitle,
            status: 'reassigned'
          })
        }).then(response => {
          if (response.ok) {
            console.log(`✅ [NOTIFICATION] Notificación de reasignación enviada al grupo de administradores`);
          } else {
            console.warn(`⚠️ [NOTIFICATION] Error al enviar notificación de reasignación a administradores: ${response.status}`);
          }
        }).catch(error => {
          console.error('🚨 [NOTIFICATION] Error al enviar notificación de reasignación a administradores:', error);
        });
      } catch (adminNotificationError) {
        // No bloquear el flujo por errores de notificación
        console.error('🚨 [NOTIFICATION] Error preparando notificación de reasignación a administradores:', adminNotificationError);
      }

      toast.success('Responsable actualizado correctamente');
      
      // Actualizar la UI localmente
      if (isSubtask) {
        setSubtasks(prev => prev.map(subtask => 
          subtask.id === itemId 
            ? { ...subtask, assigned_to: newAssigneeId }
            : subtask
        ));
        // Actualizar también taskDetails si está abierto
        if (taskDetails && taskDetails.id === itemId) {
          setTaskDetails({ ...taskDetails, assigned_to: newAssigneeId });
        }
      } else {
        setTasks(prev => prev.map(task => 
          task.id === itemId 
            ? { ...task, assigned_users: [newAssigneeId] }
            : task
        ));
        // Actualizar también taskDetails si está abierto
        if (taskDetails && taskDetails.id === itemId) {
          setTaskDetails({ ...taskDetails, assigned_users: [newAssigneeId] });
        }
      }

      // Recargar datos para asegurar consistencia
      await fetchData();
      
      // Limpiar el selector
      setNewAssignee('');
    } catch (error) {
      console.error('Error al actualizar responsable:', error);
      toast.error('Error al actualizar el responsable');
    } finally {
      setIsUpdatingAssignee(false);
    }
  }

  // Función para eliminar tareas o subtareas
  async function handleDeleteItem(itemId: string, isSubtask: boolean) {
    const itemType = isSubtask ? 'subtarea' : 'tarea';
    
    if (!window.confirm(`¿Estás seguro de que deseas eliminar esta ${itemType}? Esta acción no se puede deshacer.`)) {
      return;
    }
    
    try {
      console.log(`🗑️ Iniciando eliminación de ${itemType}:`, itemId);
      
      const table = isSubtask ? 'subtasks' : 'tasks';
      
      // 1. Obtener todas las asignaciones de trabajo relacionadas
      console.log('🔍 Buscando asignaciones de trabajo...');
      let assignmentIds: string[] = [];
      
      if (isSubtask) {
        // Buscar por subtask_id
        const { data: assignments1, error: assignmentsError1 } = await supabase
          .from('task_work_assignments')
          .select('id')
          .eq('subtask_id', itemId);
        
        if (assignmentsError1) {
          console.error("❌ Error al buscar asignaciones por subtask_id:", assignmentsError1);
          throw assignmentsError1;
        }
        
        if (assignments1) {
          assignmentIds.push(...assignments1.map(a => a.id));
        }
        
        // También buscar por task_id con tipo subtask
        const { data: assignments2, error: assignmentsError2 } = await supabase
          .from('task_work_assignments')
          .select('id')
          .eq('task_id', itemId)
          .eq('task_type', 'subtask');
        
        if (assignmentsError2) {
          console.error("❌ Error al buscar asignaciones por task_id:", assignmentsError2);
          throw assignmentsError2;
        }
        
        if (assignments2) {
          assignmentIds.push(...assignments2.map(a => a.id));
        }
      } else {
        // Para tareas principales
        const { data: assignments, error: assignmentsError } = await supabase
          .from('task_work_assignments')
          .select('id')
          .eq('task_id', itemId)
          .eq('task_type', 'task');
        
        if (assignmentsError) {
          console.error("❌ Error al buscar asignaciones de trabajo:", assignmentsError);
          throw assignmentsError;
        }
        
        if (assignments) {
          assignmentIds.push(...assignments.map(a => a.id));
        }
        
        // También obtener asignaciones de subtareas
        const { data: subtasksToDelete, error: subtasksQueryError } = await supabase
          .from('subtasks')
          .select('id')
          .eq('task_id', itemId);
        
        if (subtasksQueryError) {
          console.error("❌ Error al consultar subtareas:", subtasksQueryError);
          throw subtasksQueryError;
        }
        
        if (subtasksToDelete && subtasksToDelete.length > 0) {
          for (const subtask of subtasksToDelete) {
            const { data: subtaskAssignments, error: subtaskAssignmentsError } = await supabase
              .from('task_work_assignments')
              .select('id')
              .eq('subtask_id', subtask.id);
            
            if (subtaskAssignmentsError) {
              console.error(`❌ Error al buscar asignaciones de subtarea ${subtask.id}:`, subtaskAssignmentsError);
            } else if (subtaskAssignments) {
              assignmentIds.push(...subtaskAssignments.map(a => a.id));
            }
          }
        }
      }
      
      // 2. Eliminar sesiones de trabajo relacionadas con las asignaciones
      if (assignmentIds.length > 0) {
        console.log(`🗑️ Eliminando ${assignmentIds.length} sesiones de trabajo...`);
        const { error: workSessionsError } = await supabase
          .from('work_sessions')
          .delete()
          .in('assignment_id', assignmentIds);
        
        if (workSessionsError) {
          console.error("❌ Error al eliminar sesiones de trabajo:", workSessionsError);
          throw workSessionsError;
        }
        console.log('✅ Sesiones de trabajo eliminadas');
      }
      
      // 3. Eliminar asignaciones de trabajo
      console.log('🗑️ Eliminando asignaciones de trabajo...');
      
      if (isSubtask) {
        // Eliminar por subtask_id
        const { error: workAssignmentsError1 } = await supabase
          .from('task_work_assignments')
          .delete()
          .eq('subtask_id', itemId);
        
        if (workAssignmentsError1) {
          console.error("❌ Error al eliminar asignaciones por subtask_id:", workAssignmentsError1);
          throw workAssignmentsError1;
        }
        
        // También eliminar por task_id cuando se refiere a esta subtarea
        const { error: workAssignmentsError2 } = await supabase
          .from('task_work_assignments')
          .delete()
          .eq('task_id', itemId)
          .eq('task_type', 'subtask');
        
        if (workAssignmentsError2) {
          console.error("❌ Error al eliminar asignaciones por task_id:", workAssignmentsError2);
          throw workAssignmentsError2;
        }
      } else {
        // Para tareas principales, primero eliminar asignaciones de subtareas
        const { data: subtasksToDelete, error: subtasksQueryError } = await supabase
          .from('subtasks')
          .select('id')
          .eq('task_id', itemId);
        
        if (subtasksQueryError) {
          console.error("❌ Error al consultar subtareas:", subtasksQueryError);
          throw subtasksQueryError;
        }
        
        if (subtasksToDelete && subtasksToDelete.length > 0) {
          for (const subtask of subtasksToDelete) {
            const { error: subtaskWorkError } = await supabase
              .from('task_work_assignments')
              .delete()
              .eq('subtask_id', subtask.id);
            
            if (subtaskWorkError) {
              console.error(`❌ Error al eliminar asignaciones de subtarea ${subtask.id}:`, subtaskWorkError);
              throw subtaskWorkError;
            }
          }
          
          // Eliminar las subtareas
          const { error: deleteSubtasksError } = await supabase
            .from('subtasks')
            .delete()
            .eq('task_id', itemId);
          
          if (deleteSubtasksError) {
            console.error("❌ Error al eliminar subtareas:", deleteSubtasksError);
            throw deleteSubtasksError;
          }
        }
        
        // Eliminar asignaciones de la tarea principal
        const { error: workAssignmentsError } = await supabase
          .from('task_work_assignments')
          .delete()
          .eq('task_id', itemId)
          .eq('task_type', 'task');
        
        if (workAssignmentsError) {
          console.error("❌ Error al eliminar asignaciones de trabajo:", workAssignmentsError);
          throw workAssignmentsError;
        }
      }
      
      console.log('✅ Asignaciones de trabajo eliminadas');
      
      // 4. Eliminar el item principal
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .eq('id', itemId);
      
      if (deleteError) {
        console.error(`❌ Error al eliminar ${itemType}:`, deleteError);
        throw deleteError;
      }
      
      console.log(`✅ ${itemType.charAt(0).toUpperCase() + itemType.slice(1)} eliminada exitosamente`);
      
      // 5. Actualizar el estado local
      if (isSubtask) {
        setSubtasks(prev => prev.filter(s => s.id !== itemId));
      } else {
        setTasks(prev => prev.filter(t => t.id !== itemId));
        // También filtrar las subtareas del estado local
        setSubtasks(prev => prev.filter(s => s.task_id !== itemId));
      }
      
      toast.success(`${itemType.charAt(0).toUpperCase() + itemType.slice(1)} eliminada correctamente`);
      
    } catch (error) {
      console.error(`💥 Error al eliminar ${itemType}:`, error);
      toast.error(`Error al eliminar la ${itemType}: ${error instanceof Error ? error.message : 'Por favor, inténtalo de nuevo.'}`);
    }
  }
  
  async function checkAndApproveParentTask(parentId: string) {
    try {
        // 1. Get parent task's current state
        const { data: parentTask, error: parentError } = await supabase
            .from('tasks')
            .select('status')
            .eq('id', parentId)
            .single();

        if (parentError || !parentTask) {
            console.error(`[Parent Check] Could not get parent task ${parentId}.`, parentError);
            return;
        }
        const previousStatus = parentTask.status;

        // 2. Check if all other subtasks are also approved
        const { data: subtasks, error: subError } = await supabase
            .from('subtasks')
            .select('status')
            .eq('task_id', parentId);

        if (subError) {
            console.error(`[Parent Check] Could not get subtasks for task ${parentId}.`, subError);
            return;
        }

        const allSubtasksApproved = subtasks!.every(s => s.status === 'approved');

        // 3. If all are approved and parent isn't, update and log.
        if (allSubtasksApproved && previousStatus !== 'approved') {
            const newStatus = 'approved';
            const { error: updateError } = await supabase
                .from('tasks')
                .update({ status: newStatus })
                .eq('id', parentId);
            
            if (updateError) throw updateError;
            
            // Log the implicit status change
            const historyRecord = {
                task_id: parentId,
                subtask_id: null,
                changed_by: user!.id,
                previous_status: previousStatus,
                new_status: newStatus,
                metadata: {
                    reason: 'All subtasks have been approved.',
                    triggering_action: 'subtask_approval'
                },
            };

            const { error: historyError } = await supabase
                .from('status_history')
                .insert([historyRecord]);

            if (historyError) {
                console.error('⚠️ [HISTORY] Could not log implicit parent task APPROVAL:', historyError);
            } else {
                console.log(`✅ [HISTORY] Implicit parent task approval from '${previousStatus}' to '${newStatus}' logged.`);
            }

            // Also update the UI for the main task list
            setTasks(prev => prev.map(task => 
                task.id === parentId 
                    ? { ...task, status: newStatus as any } 
                    : task
            ));
        }
    } catch (e) {
        console.error(`Error checking and approving parent task ${parentId}:`, e);
    }
  }

  // Función para verificar y notificar sobre dependencias secuenciales disponibles
  async function checkAndNotifySequentialDependencies(taskId: string, approvedSequenceOrder: number | null) {
    try {
      if (!approvedSequenceOrder) return;
      
      // Obtener información de la tarea para verificar si es secuencial
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('is_sequential, title, project_id')
        .eq('id', taskId)
        .single();
        
      if (taskError || !taskData || !taskData.is_sequential) {
        return; // No es secuencial o error
      }
      
      // Obtener todas las subtareas de esta tarea ordenadas por sequence_order
      const { data: allSubtasks, error: subtasksError } = await supabase
        .from('subtasks')
        .select('id, title, assigned_to, sequence_order, status')
        .eq('task_id', taskId)
        .order('sequence_order');
        
      if (subtasksError || !allSubtasks) {
        console.error('Error obteniendo subtareas:', subtasksError);
        return;
      }
      
      // Agrupar por sequence_order
      const subtasksByLevel = allSubtasks.reduce((acc, subtask) => {
        const level = subtask.sequence_order || 0;
        if (!acc[level]) acc[level] = [];
        acc[level].push(subtask);
        return acc;
      }, {} as Record<number, typeof allSubtasks>);
      
      // Verificar si el nivel que acabamos de aprobar está completamente aprobado
      const currentLevel = subtasksByLevel[approvedSequenceOrder];
      if (!currentLevel || !currentLevel.every(st => st.status === 'approved')) {
        return; // El nivel actual no está completamente aprobado aún
      }
      
      // Buscar el siguiente nivel que tenga subtareas pendientes
      const nextLevel = approvedSequenceOrder + 1;
      const nextLevelSubtasks = subtasksByLevel[nextLevel];
      
      if (!nextLevelSubtasks || nextLevelSubtasks.length === 0) {
        return; // No hay más niveles
      }
      
      // Verificar que todas las subtareas del siguiente nivel estén en estado 'pending'
      const pendingSubtasks = nextLevelSubtasks.filter(st => st.status === 'pending');
      
      if (pendingSubtasks.length === 0) {
        return; // No hay subtareas pendientes en el siguiente nivel
      }
      
      // Obtener información del proyecto
      let projectName = "Proyecto sin nombre";
      if (taskData.project_id) {
        const { data: projectData } = await supabase
          .from('projects')
          .select('name')
          .eq('id', taskData.project_id)
          .eq('is_archived', false)
          .single();
          
        if (projectData) {
          projectName = projectData.name;
        }
      }
      
      // Notificar a usuarios de subtareas que ahora están disponibles
      for (const subtask of pendingSubtasks) {
        if (subtask.assigned_to) {
          fetch('/api/telegram/task-available', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userIds: [subtask.assigned_to],
              taskTitle: subtask.title,
              projectName: projectName,
              reason: 'sequential_dependency_completed',
              isSubtask: true,
              parentTaskTitle: taskData.title
            })
          }).then(response => {
            if (response.ok) {
              console.log(`✅ [NOTIFICATION] Notificación de dependencia secuencial completada enviada para: ${subtask.title}`);
            } else {
              console.warn(`⚠️ [NOTIFICATION] Error al enviar notificación de dependencia secuencial: ${response.status}`);
            }
          }).catch(error => {
            console.error('🚨 [NOTIFICATION] Error al enviar notificación de dependencia secuencial:', error);
          });
        }
      }
      
      console.log(`🔓 [SEQUENTIAL] Nivel ${nextLevel} desbloqueado. Notificadas ${pendingSubtasks.length} subtareas.`);
      
    } catch (error) {
      console.error('Error en checkAndNotifySequentialDependencies:', error);
    }
  }

  // Función para manejar el envío del formulario de retroalimentación
  function handleFeedbackSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!selectedItem) return;
    
    if (targetStatus === 'returned' && !feedback.trim()) {
      toast.error('La retroalimentación es obligatoria para devolver una tarea');
      return;
    }
    
    const feedbackData: TaskFeedback = {
      feedback: feedback,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString()
    };
    
    // Para tareas devueltas, actualizamos datos adicionales
    const updateData: any = { 
      status: targetStatus,
      feedback: feedbackData,
      returned_at: new Date().toISOString()
    };
    
    // Si es 'returned', configuramos para que vuelva a aparecer como pendiente
    if (targetStatus === 'returned') {
      updateItemStatus(selectedItem.id, targetStatus, selectedItem.type === 'subtask', feedbackData, updateData);
      
      // Actualizar también el task_work_assignment para que aparezca como pendiente de nuevo
      updateTaskWorkAssignment(selectedItem.id, selectedItem.type === 'subtask' ? 'subtask' : 'task');
      
      // 🔔 Notificar al usuario que la tarea está disponible (devuelta)
      setTimeout(async () => {
        try {
          let usersToNotify: string[] = [];
          let taskTitle = '';
          let projectName = "Proyecto sin nombre";
          let parentTaskTitle = undefined;
          const isSubtask = selectedItem.type === 'subtask';
          
          if (isSubtask) {
            // Para subtareas, obtener datos y notificar al usuario asignado
            const { data: subtaskData } = await supabase
              .from('subtasks')
              .select('title, assigned_to, task_id')
              .eq('id', selectedItem.id)
              .single();
              
            if (subtaskData) {
              taskTitle = subtaskData.title;
              if (subtaskData.assigned_to) {
                usersToNotify = [subtaskData.assigned_to];
              }
              
              // Obtener título de tarea padre y proyecto
              const { data: parentTask } = await supabase
                .from('tasks')
                .select('title, project_id')
                .eq('id', subtaskData.task_id)
                .single();
                
              if (parentTask) {
                parentTaskTitle = parentTask.title;
                
                if (parentTask.project_id) {
                  const { data: projectData } = await supabase
                    .from('projects')
                    .select('name')
                    .eq('id', parentTask.project_id)
                    .eq('is_archived', false)
                    .single();
                    
                  if (projectData) {
                    projectName = projectData.name;
                  }
                }
              }
            }
          } else {
            // Para tareas principales, obtener datos y notificar a usuarios asignados
            const { data: taskData } = await supabase
              .from('tasks')
              .select('title, assigned_users, project_id')
              .eq('id', selectedItem.id)
              .single();
              
            if (taskData) {
              taskTitle = taskData.title;
              if (taskData.assigned_users && taskData.assigned_users.length > 0) {
                usersToNotify = taskData.assigned_users;
              }
              
              // Obtener nombre del proyecto
              if (taskData.project_id) {
                const { data: projectData } = await supabase
                  .from('projects')
                  .select('name')
                  .eq('id', taskData.project_id)
                  .eq('is_archived', false)
                  .single();
                  
                if (projectData) {
                  projectName = projectData.name;
                }
              }
            }
          }
          
          // Enviar notificaciones de tarea disponible
          if (usersToNotify.length > 0) {
            fetch('/api/telegram/task-available', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userIds: usersToNotify,
                taskTitle: taskTitle,
                projectName: projectName,
                reason: 'returned',
                isSubtask: isSubtask,
                parentTaskTitle: parentTaskTitle
              })
            }).then(response => {
              if (response.ok) {
                console.log(`✅ [NOTIFICATION] Notificación de tarea devuelta enviada`);
              } else {
                console.warn(`⚠️ [NOTIFICATION] Error al enviar notificación de tarea devuelta: ${response.status}`);
              }
            }).catch(error => {
              console.error('🚨 [NOTIFICATION] Error al enviar notificación de tarea devuelta:', error);
            });
          }
        } catch (notificationError) {
          console.error('🚨 [NOTIFICATION] Error preparando notificación de tarea devuelta:', notificationError);
        }
      }, 1000); // Esperar 1 segundo para que se complete updateTaskWorkAssignment
    } else {
      updateItemStatus(selectedItem.id, targetStatus, selectedItem.type === 'subtask', feedbackData);
    }
  }
  
  // Función para actualizar el task_work_assignment
  async function updateTaskWorkAssignment(itemId: string, itemType: 'task' | 'subtask') {
    try {
      // Obtener la asignación actual para acceder a las notas existentes
      const { data: assignmentData, error: fetchError } = await supabase
        .from('task_work_assignments')
        .select('id, notes')
        .eq(itemType === 'subtask' ? 'subtask_id' : 'task_id', itemId)
        .eq('task_type', itemType)
        .single();
      
      if (fetchError) {
        console.error('Error al buscar task_work_assignment:', fetchError);
        toast.error('Error al buscar la asignación de trabajo');
        return;
      }
      
      if (!assignmentData) {
        console.error('No se encontró la asignación de trabajo');
        toast.error('No se encontró la asignación de trabajo');
        return;
      }
      
      // Preparar las notas actualizadas
      let updatedNotes = assignmentData.notes || {};
      
      // Añadir la retroalimentación a las notas existentes
      updatedNotes = {
        ...updatedNotes,
        returned_feedback: feedback,
        returned_at: new Date().toISOString(),
        returned_by: user?.id
      };
      
      // Actualizar el estado en task_work_assignments
      const { error: updateError } = await supabase
        .from('task_work_assignments')
        .update({ 
          status: 'pending',  // Cambiar a pendiente de nuevo
          updated_at: new Date().toISOString(),
          notes: updatedNotes
        })
        .eq('id', assignmentData.id);
      
      if (updateError) {
        console.error('Error al actualizar task_work_assignment:', updateError);
        toast.error('Error al actualizar la asignación de trabajo');
      } else {
        console.log('Task work assignment actualizado correctamente');
      }
    } catch (err) {
      console.error('Error al actualizar task_work_assignment:', err);
      toast.error('Error al actualizar la asignación de trabajo');
    }
  }
  
  // Función para eliminar task_work_assignments al desbloquear
  async function removeTaskWorkAssignments(itemId: string, itemType: 'task' | 'subtask') {
    try {
      // Primero verificar si hay work_sessions asociados
      const { data: assignments, error: fetchError } = await supabase
        .from('task_work_assignments')
        .select('id')
        .eq(itemType === 'subtask' ? 'subtask_id' : 'task_id', itemId)
        .eq('task_type', itemType);
      
      if (fetchError) {
        console.warn('Error al obtener task_work_assignments:', fetchError);
        return; // Salir silenciosamente si no se pueden obtener
      }
      
      if (!assignments || assignments.length === 0) {
        console.log('No hay task_work_assignments para eliminar');
        return; // No hay nada que eliminar
      }
      
      // Verificar si alguno de estos assignments tiene work_sessions asociados
      const assignmentIds = assignments.map(a => a.id);
      const { data: workSessions, error: sessionsError } = await supabase
        .from('work_sessions')
        .select('assignment_id')
        .in('assignment_id', assignmentIds)
        .limit(1);
      
      if (sessionsError) {
        console.warn('Error al verificar work_sessions:', sessionsError);
        // Continuar intentando eliminar de todas formas
      }
      
      // Si hay work_sessions asociados, no eliminar (es normal cuando el usuario ya trabajó en la tarea)
      if (workSessions && workSessions.length > 0) {
        console.log('Hay work_sessions asociados, no se eliminarán los task_work_assignments (esto es normal)');
        return; // Salir silenciosamente, no es un error
      }
      
      // Si no hay work_sessions, proceder a eliminar
      const { error } = await supabase
        .from('task_work_assignments')
        .delete()
        .eq(itemType === 'subtask' ? 'subtask_id' : 'task_id', itemId)
        .eq('task_type', itemType);
      
      if (error) {
        // Si el error es por foreign key constraint, es esperado y no debemos mostrar error
        if (error.code === '23503') {
          console.log('No se pueden eliminar task_work_assignments porque tienen work_sessions asociados (esto es normal)');
          return; // Salir silenciosamente
        }
        console.error('Error al eliminar task_work_assignments:', error);
        // Solo mostrar error si no es un error de foreign key
        toast.error('Error al limpiar las asignaciones de trabajo');
      } else {
        console.log('Task work assignments eliminados correctamente al desbloquear');
      }
    } catch (err: any) {
      // Si el error es por foreign key constraint, es esperado
      if (err?.code === '23503') {
        console.log('No se pueden eliminar task_work_assignments porque tienen work_sessions asociados (esto es normal)');
        return; // Salir silenciosamente
      }
      console.error('Error al eliminar task_work_assignments:', err);
      // Solo mostrar error si no es un error de foreign key
      if (err?.code !== '23503') {
        toast.error('Error al limpiar las asignaciones de trabajo');
      }
    }
  }
  
  // Función para manejar el envío del formulario de aprobación
  function handleApprovalSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!selectedItem) return;
    
    const feedbackData: TaskFeedback = {
      feedback: feedback,
      rating: rating,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString()
    };
    
    updateItemStatus(selectedItem.id, targetStatus, selectedItem.type === 'subtask', feedbackData);
  }

  // Group tasks by project, priority, assignee, or deadline
  const groupItems = () => {
    let groupedItems: { [key: string]: { tasks: Task[], subtasks: Subtask[] } } = {};
    
    if (groupByProject) {
      // Group by project
      projects.forEach(project => {
        groupedItems[project.id] = {
          tasks: tasks.filter(task => task.project_id === project.id),
          subtasks: subtasks.filter(subtask => {
            const relatedTask = tasks.find(task => task.id === subtask.task_id);
            return relatedTask && relatedTask.project_id === project.id;
          })
        };
      });
      
      // Add "No Project" group
      groupedItems['no_project'] = {
        tasks: tasks.filter(task => !task.project_id),
        subtasks: subtasks.filter(subtask => {
          const relatedTask = tasks.find(task => task.id === subtask.task_id);
          return relatedTask && !relatedTask.project_id;
        })
      };
    } else if (groupByPriority) {
      // Group by priority
      const priorities = ['high', 'medium', 'low'];
      priorities.forEach(priority => {
        groupedItems[priority] = {
          tasks: tasks.filter(task => task.priority === priority),
          subtasks: subtasks.filter(subtask => {
            const relatedTask = tasks.find(task => task.id === subtask.task_id);
            return relatedTask && relatedTask.priority === priority;
          })
        };
      });
    } else if (groupByAssignee) {
      // Group by assignee (for subtasks)
      users.forEach(user => {
        const userSubtasks = subtasks.filter(subtask => subtask.assigned_to === user.id);
        const relatedTaskIds = new Set(userSubtasks.map(subtask => subtask.task_id));
        
        groupedItems[user.id] = {
          tasks: tasks.filter(task => relatedTaskIds.has(task.id)),
          subtasks: userSubtasks
        };
      });
      
      // Add "Unassigned" group
      groupedItems['unassigned'] = {
        tasks: [],
        subtasks: subtasks.filter(subtask => !subtask.assigned_to)
      };
    } else if (groupByDeadline) {
      // Group by deadline (today, this week, this month, later)
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');
      
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);
      const nextWeekStr = format(nextWeek, 'yyyy-MM-dd');
      
      const nextMonth = new Date(today);
      nextMonth.setMonth(today.getMonth() + 1);
      const nextMonthStr = format(nextMonth, 'yyyy-MM-dd');
      
      // Today's tasks
      groupedItems['today'] = {
        tasks: tasks.filter(task => task.deadline.startsWith(todayStr)),
        subtasks: subtasks.filter(subtask => subtask.deadline && subtask.deadline.startsWith(todayStr))
      };
      
      // This week's tasks
      groupedItems['this_week'] = {
        tasks: tasks.filter(task => 
          task.deadline > todayStr && task.deadline <= nextWeekStr
        ),
        subtasks: subtasks.filter(subtask => 
          subtask.deadline && subtask.deadline > todayStr && subtask.deadline <= nextWeekStr
        )
      };
      
      // This month's tasks
      groupedItems['this_month'] = {
        tasks: tasks.filter(task => 
          task.deadline > nextWeekStr && task.deadline <= nextMonthStr
        ),
        subtasks: subtasks.filter(subtask => 
          subtask.deadline && subtask.deadline > nextWeekStr && subtask.deadline <= nextMonthStr
        )
      };
      
      // Later tasks
      groupedItems['later'] = {
        tasks: tasks.filter(task => task.deadline > nextMonthStr),
        subtasks: subtasks.filter(subtask => subtask.deadline && subtask.deadline > nextMonthStr)
      };
      
      // No deadline
      groupedItems['no_deadline'] = {
        tasks: tasks.filter(task => !task.deadline),
        subtasks: subtasks.filter(subtask => !subtask.deadline)
      };
    } else {
      // No grouping, just one group with all items
      groupedItems['all'] = {
        tasks,
        subtasks
      };
    }
    
    return groupedItems;
  };

  const getGroupTitle = (groupId: string) => {
    if (groupByProject) {
      if (groupId === 'no_project') return 'Sin Proyecto';
      const project = projects.find(p => p.id === groupId);
      return project ? project.name : 'Proyecto Desconocido';
    } else if (groupByPriority) {
      const priorities: Record<string, string> = {
        'high': 'Alta Prioridad',
        'medium': 'Media Prioridad',
        'low': 'Baja Prioridad'
      };
      return priorities[groupId] || 'Prioridad Desconocida';
    } else if (groupByAssignee) {
      if (groupId === 'unassigned') return 'No Asignado';
      const assignee = users.find(u => u.id === groupId);
      return assignee ? assignee.name : 'Usuario Desconocido';
    } else if (groupByDeadline) {
      const deadlineGroups: Record<string, string> = {
        'today': 'Hoy',
        'this_week': 'Esta Semana',
        'this_month': 'Este Mes',
        'later': 'Más Adelante',
        'no_deadline': 'Sin Fecha Límite'
      };
      return deadlineGroups[groupId] || 'Fecha Desconocida';
    }
    return 'Todas las Tareas';
  };

  const renderKanbanBoard = () => {
    const groupedItems = groupItems();
    
    return (
      <div className="overflow-auto h-full">
        {Object.keys(groupedItems).map(groupId => {
          const group = groupedItems[groupId];
          
          // Skip empty groups
          if (group.tasks.length === 0 && group.subtasks.length === 0) {
            return null;
          }
          
          return (
            <div key={groupId} className="mb-8">
              <h3 className="text-lg font-semibold mb-4 bg-gray-100 p-2 rounded">
                {getGroupTitle(groupId)}
              </h3>
              <div className="grid grid-cols-7 gap-4">
                {columns.map(column => {
                  // Get all subtasks for this column
                  const columnSubtasks = group.subtasks.filter(subtask => subtask.status === column.id);
                  
                  // Get task IDs that have subtasks
                  const tasksWithSubtasks = new Set(columnSubtasks.map(subtask => subtask.task_id));
                  
                  // Get tasks for this column that don't have subtasks
                  const tasksWithoutSubtasks = group.tasks
                    .filter(task => task.status === column.id && !tasksWithSubtasks.has(task.id));
                  
                  return (
                    <div 
                      key={column.id} 
                      className="bg-gray-50 rounded-lg p-2 min-h-[300px]"
                      data-column-id={column.id}
                    >
                      <h4 className="font-medium text-center py-2 border-b mb-2">{column.name}</h4>
                      <div className="space-y-2">
                        {/* Subtasks in this column */}
                        {columnSubtasks.map(subtask => {
                          const parentTask = tasks.find(t => t.id === subtask.task_id);
                          return (
                            <div 
                              key={subtask.id}
                              className={`bg-white p-3 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 border-l-4 ${
                                subtask.status === 'returned' 
                                  ? 'border-orange-500' 
                                  : subtask.status === 'approved' 
                                    ? 'border-green-600' 
                                    : subtask.status === 'blocked'
                                      ? 'border-red-500 bg-red-50' 
                                      : 'border-emerald-500'
                              } cursor-pointer`}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', JSON.stringify({
                                  id: subtask.id,
                                  type: 'subtask'
                                }));
                              }}
                              onClick={() => handleViewTaskDetails(subtask.id, 'subtask')}
                            >
                              {parentTask && (
                                <div className="mb-2 pb-2 border-b border-gray-100">
                                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center">
                                    <FolderOpen className="w-2.5 h-2.5 mr-1" />
                                    {parentTask.title}
                                  </span>
                                </div>
                              )}
                              <div className="flex justify-between items-start gap-2">
                                <h5 className="font-medium text-gray-800">
                                  {subtask.title}
                                  {subtask.status === 'returned' && (
                                    <span 
                                      className="ml-2 text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full cursor-pointer hover:bg-orange-200"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setFeedbackDetails(subtask.feedback || null);
                                        setShowFeedbackDetailsModal(true);
                                      }}
                                    >
                                      Devuelta
                                    </span>
                                  )}
                                </h5>
                                <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
                                  parentTask?.priority === 'high' ? 'bg-red-100 text-red-800' :
                                  parentTask?.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-green-100 text-green-800'
                                }`}>
                                  {parentTask?.priority === 'high' ? 'Alta' :
                                   parentTask?.priority === 'medium' ? 'Media' : 'Baja'}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-1.5">
                                <div className="flex items-center bg-gray-50 rounded px-1.5 py-0.5">
                                  <Clock className="w-2.5 h-2.5 mr-1" />
                                  <span>{subtask.estimated_duration} min</span>
                                </div>
                                {/* Tiempo real si está disponible */}
                                {(() => {
                                  const details = getItemDetails(subtask);
                                  if (details.realDuration) {
                                    const isOnTime = details.realDuration <= subtask.estimated_duration;
                                    const isClose = details.realDuration <= subtask.estimated_duration * 1.2; // 20% de tolerancia
                                    const hasRework = details.timeBreakdown && details.timeBreakdown.rework.length > 0;
                                    
                                    return (
                                      <div className={`flex items-center rounded px-1.5 py-0.5 ${
                                        isOnTime 
                                          ? 'bg-green-100 text-green-800' 
                                          : isClose 
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-red-100 text-red-800'
                                      }`} title={hasRework ? `Inicial: ${details.timeBreakdown!.initial}min | Retrabajo: ${details.timeBreakdown!.rework.reduce((sum, r) => sum + r.tiempo, 0)}min` : undefined}>
                                        <Clock className="w-2.5 h-2.5 mr-1" />
                                        <span>Real: {details.realDuration} min</span>
                                        {isOnTime && <span className="ml-1">✓</span>}
                                        {!isOnTime && !isClose && <span className="ml-1">⚠</span>}
                                        {hasRework && <span className="ml-1 text-orange-600">🔄</span>}
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                                {subtask.deadline && (
                                  <div className="flex items-center bg-gray-50 rounded px-1.5 py-0.5">
                                    <Calendar className="w-2.5 h-2.5 mr-1" />
                                    <span>{new Date(subtask.deadline).toLocaleDateString()}</span>
                                  </div>
                                )}
                                <div className="flex items-center bg-gray-50 rounded px-1.5 py-0.5">
                                  <Users className="w-2.5 h-2.5 mr-1" />
                                  <span className="truncate max-w-[120px]">
                                    {users.find(u => u.id === subtask.assigned_to)?.name || 'No asignado'}
                                  </span>
                                </div>
                                {parentTask && parentTask.project_id && (
                                  <div className="flex items-center mt-1 text-indigo-600">
                                    <span className="truncate max-w-[150px]">
                                      {projects.find(p => p.id === parentTask.project_id)?.name || 'Proyecto'}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {subtask.status === 'completed' || subtask.status === 'blocked' ? (
                                <div className="mt-2 flex flex-wrap gap-2 border-t pt-1.5">
                                  <button
                                    className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-md flex items-center"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (subtask.status === 'blocked') {
                                        setSelectedItem({ id: subtask.id, type: 'subtask', status: subtask.status });
                                        setShowUnblockModal(true);
                                      } else {
                                      handleStatusChange(subtask.id, 'in_review', true);
                                      }
                                    }}
                                  >
                                    <ArrowRight className="w-2.5 h-2.5 mr-1" />
                                    {subtask.status === 'blocked' ? 'Desbloquear' : 'En revisión'}
                                  </button>
                                </div>
                              ) : subtask.status === 'in_review' ? (
                                <div className="mt-2 flex flex-wrap gap-2 border-t pt-1.5">
                                  <button
                                    className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-md flex items-center"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStatusChange(subtask.id, 'completed', true);
                                    }}
                                  >
                                    <ArrowLeft className="w-2.5 h-2.5 mr-1" />
                                    Cancelar revisión
                                  </button>
                                  <button
                                    className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-md flex items-center"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStatusChange(subtask.id, 'returned', true);
                                    }}
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5 mr-1" />
                                    Devolver
                                  </button>
                                  <button
                                    className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-md flex items-center"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStatusChange(subtask.id, 'approved', true);
                                    }}
                                  >
                                    <CheckCircle className="w-2.5 h-2.5 mr-1" />
                                    Aprobar
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                        
                        {/* Tasks without subtasks in this column */}
                        {tasksWithoutSubtasks.map(task => (
                          <div 
                            key={task.id}
                            className={`bg-white p-3 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 border-l-4 ${
                              task.status === 'returned' 
                                ? 'border-orange-500' 
                                : task.status === 'approved' 
                                  ? 'border-green-600' 
                                  : task.status === 'blocked'
                                    ? 'border-red-500 bg-red-50' 
                                    : 'border-indigo-500'
                            } cursor-pointer`}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', JSON.stringify({
                                id: task.id,
                                type: 'task'
                              }));
                            }}
                            onClick={() => handleViewTaskDetails(task.id, 'task')}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <h5 className="font-medium text-gray-800 flex-1 min-w-0">
                                {task.title}
                                {task.status === 'returned' && (
                                  <span 
                                    className="ml-2 text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full cursor-pointer hover:bg-orange-200"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFeedbackDetails(task.feedback || null);
                                      setShowFeedbackDetailsModal(true);
                                    }}
                                  >
                                    Devuelta
                                  </span>
                                )}
                              </h5>
                              <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
                                task.priority === 'high' ? 'bg-red-100 text-red-800' :
                                task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {task.priority === 'high' ? 'Alta' :
                                  task.priority === 'medium' ? 'Media' : 'Baja'}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-1.5">
                              <div className="flex items-center bg-gray-50 rounded px-1.5 py-0.5">
                                <Clock className="w-2.5 h-2.5 mr-1" />
                                <span>{task.estimated_duration} min</span>
                              </div>
                              {/* Tiempo real si está disponible */}
                              {(() => {
                                const details = getItemDetails(task);
                                if (details.realDuration) {
                                  const isOnTime = details.realDuration <= task.estimated_duration;
                                  const isClose = details.realDuration <= task.estimated_duration * 1.2; // 20% de tolerancia
                                  const hasRework = details.timeBreakdown && details.timeBreakdown.rework.length > 0;
                                  
                                  return (
                                    <div className={`flex items-center rounded px-1.5 py-0.5 ${
                                      isOnTime 
                                        ? 'bg-green-100 text-green-800' 
                                        : isClose 
                                          ? 'bg-yellow-100 text-yellow-800'
                                          : 'bg-red-100 text-red-800'
                                    }`} title={hasRework ? `Inicial: ${details.timeBreakdown!.initial}min | Retrabajo: ${details.timeBreakdown!.rework.reduce((sum, r) => sum + r.tiempo, 0)}min` : undefined}>
                                      <Clock className="w-2.5 h-2.5 mr-1" />
                                      <span>Real: {details.realDuration} min</span>
                                      {isOnTime && <span className="ml-1">✓</span>}
                                      {!isOnTime && !isClose && <span className="ml-1">⚠</span>}
                                      {hasRework && <span className="ml-1 text-orange-600">🔄</span>}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                              <div className="flex items-center bg-gray-50 rounded px-1.5 py-0.5">
                                <Calendar className="w-2.5 h-2.5 mr-1" />
                                <span>{new Date(task.deadline).toLocaleDateString()}</span>
                              </div>
                              {task.project_id && (
                                <div className="flex items-center bg-gray-50 rounded px-1.5 py-0.5">
                                  <FolderOpen className="w-2.5 h-2.5 mr-1" />
                                  <span className="truncate max-w-[120px]">
                                    {projects.find(p => p.id === task.project_id)?.name || 'Proyecto'}
                                  </span>
                                </div>
                              )}
                            </div>
                            {task.status === 'completed' || task.status === 'blocked' ? (
                              <div className="mt-2 flex flex-wrap gap-2 border-t pt-1.5">
                                <button
                                  className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-md flex items-center"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (task.status === 'blocked') {
                                      setSelectedItem({ id: task.id, type: 'task', status: task.status });
                                      setShowUnblockModal(true);
                                    } else {
                                    handleStatusChange(task.id, 'in_review', false);
                                    }
                                  }}
                                >
                                  <ArrowRight className="w-2.5 h-2.5 mr-1" />
                                    {task.status === 'blocked' ? 'Desbloquear' : 'En revisión'}
                                </button>
                              </div>
                            ) : task.status === 'in_review' ? (
                              <div className="mt-2 flex flex-wrap gap-2 border-t pt-1.5">
                                <button
                                  className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-md flex items-center"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(task.id, 'completed', false);
                                  }}
                                >
                                  <ArrowLeft className="w-2.5 h-2.5 mr-1" />
                                  A completada
                                </button>
                                <button
                                  className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-md flex items-center"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(task.id, 'returned', false);
                                  }}
                                >
                                  <AlertTriangle className="w-2.5 h-2.5 mr-1" />
                                  Devolver
                                </button>
                                <button
                                  className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-md flex items-center"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(task.id, 'approved', false);
                                  }}
                                >
                                  <CheckCircle className="w-2.5 h-2.5 mr-1" />
                                  Aprobar
                                </button>
                              </div>
                            ) : null}
                            {/* START: Add Assignee Badge */}
                            {(task.assigned_users && task.assigned_users.length > 0) ? (
                              <div className="flex items-center bg-gray-50 rounded px-1.5 py-0.5">
                                <Users className="w-2.5 h-2.5 mr-1" />
                                <span className="truncate max-w-[120px]" title={users.find(u => u.id === task.assigned_users![0])?.name || 'Usuario'}>
                                  {users.find(u => u.id === task.assigned_users![0])?.name || 'Usuario'}
                                </span>
                                {/* Optional: Indicate if there are more assignees */}
                                {task.assigned_users.length > 1 && <span className="ml-1 text-gray-400 text-[10px] font-medium">(+{task.assigned_users.length - 1})</span>}
                              </div>
                            ) : (
                               <div className="flex items-center bg-gray-100 rounded px-1.5 py-0.5 text-gray-400 italic text-xs">
                                  <Users className="w-2.5 h-2.5 mr-1" />
                                  <span>No asignado</span>
                               </div>
                            )}
                            {/* END: Add Assignee Badge */}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Improved function to handle viewing task/subtask details
  async function handleViewTaskDetails(itemId: string, itemType: 'task' | 'subtask') {
    setDetailsItem({ id: itemId, type: itemType });
    setLoading(true); // Show loading indicator while fetching details
    setShowTaskDetailsModal(true); // Show modal structure immediately
    setTaskDetails(null); // Clear previous details
    setRelatedSubtasks([]);
    setPreviousSubtask(null);
    setNextSubtask(null);
    setDeliveryComments('');
    setNewAssignee(''); // Limpiar el selector de responsable

    try {
      let item: Task | Subtask | null = null;
      let parentTaskData: Task | null = null;
      let relatedSubtasksData: Subtask[] = [];
      let fetchedPreviousSubtask: Subtask | null = null;
      let fetchedNextSubtask: Subtask | null = null;

      const isSubtaskType = itemType === 'subtask';
      const table = isSubtaskType ? 'subtasks' : 'tasks';

      // Fetch the main item
      const { data: itemData, error: itemError } = await supabase
        .from(table)
        .select('*')
        .eq('id', itemId)
        .single();

      if (itemError || !itemData) {
        throw itemError || new Error('Item not found');
      }
      item = itemData as (Task | Subtask);

      // Fetch related data based on type
      if (isSubtaskType) {
        const subtask = item as Subtask;
        // Fetch parent task
        const { data: fetchedParentTask, error: parentError } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', subtask.task_id)
          .single();
        if (parentError) throw parentError;
        parentTaskData = fetchedParentTask;

        // Fetch related subtasks if parent task exists
        if (parentTaskData) {
          const { data: fetchedRelatedSubtasks, error: relatedError } = await supabase
            .from('subtasks')
            .select('*')
            .eq('task_id', subtask.task_id)
            .order('sequence_order', { ascending: true });
          if (relatedError) throw relatedError;
          relatedSubtasksData = fetchedRelatedSubtasks || [];

          // Find previous/next subtasks if sequential
          if (parentTaskData.is_sequential && subtask.sequence_order !== null) {
            const currentIndex = relatedSubtasksData.findIndex(s => s.id === itemId);
            if (currentIndex > 0) {
              fetchedPreviousSubtask = relatedSubtasksData[currentIndex - 1];
            }
            if (currentIndex < relatedSubtasksData.length - 1) {
              fetchedNextSubtask = relatedSubtasksData[currentIndex + 1];
            }
          }
        }
      } else {
        const task = item as Task;
        parentTaskData = task; // The item itself is the parent task in this context
        // Fetch related subtasks
        const { data: fetchedRelatedSubtasks, error: relatedError } = await supabase
          .from('subtasks')
          .select('*')
          .eq('task_id', task.id)
          .order('sequence_order', { ascending: true });
        if (relatedError) throw relatedError;
        relatedSubtasksData = fetchedRelatedSubtasks || [];
      }

      let subtaskStats = { total: 0, approved: 0, completed: 0 };
      let approvedPercentage = 0;
      let completedAndApprovedPercentage = 0;

      if (relatedSubtasksData.length > 0) {
        subtaskStats.total = relatedSubtasksData.length;
        subtaskStats.approved = relatedSubtasksData.filter(st => st.status === 'approved').length;
        subtaskStats.completed = relatedSubtasksData.filter(st => st.status === 'completed').length;
        if (subtaskStats.total > 0) {
            approvedPercentage = (subtaskStats.approved / subtaskStats.total) * 100;
            completedAndApprovedPercentage = ((subtaskStats.approved + subtaskStats.completed) / subtaskStats.total) * 100;
        }
      }

      // Set all state variables together
      setTaskDetails({ 
        ...item, 
        parent_task: isSubtaskType ? parentTaskData : undefined,
        subtaskStats,
        approvedPercentage,
        completedAndApprovedPercentage,
      });
      setRelatedSubtasks(relatedSubtasksData);
      setPreviousSubtask(fetchedPreviousSubtask);
      setNextSubtask(fetchedNextSubtask);

      // Process notes/feedback using the helper
      const details = getItemDetails(item);
      setDeliveryComments(details.deliveryComments || '');

    } catch (error: any) {
      console.error('Error al cargar detalles:', error);
      toast.error(`Error al cargar los detalles: ${error.message}`);
      setShowTaskDetailsModal(false); // Close modal on error
      setDetailsItem(null);
      setNewAssignee(''); // Limpiar el selector de responsable
    } finally {
      setLoading(false); // Hide loading indicator
    }
  }

  const groupMainTasks = () => {
    let grouped: { [key: string]: (typeof processedMainTasks) } = {};

    const sourceTasks = processedMainTasks;

    if (groupByProject) {
      projects.forEach(project => {
        grouped[project.id] = sourceTasks.filter(task => task.project_id === project.id);
      });
      grouped['no_project'] = sourceTasks.filter(task => !task.project_id);
    } else if (groupByPriority) {
      const priorities = ['high', 'medium', 'low'];
      priorities.forEach(priority => {
        grouped[priority] = sourceTasks.filter(task => task.priority === priority);
      });
    } else if (groupByAssignee) {
      users.forEach(user => {
        const tasksForUser = new Set<string>();
        const userSubtasks = subtasks.filter(st => st.assigned_to === user.id);
        userSubtasks.forEach(st => tasksForUser.add(st.task_id));
        grouped[user.id] = sourceTasks.filter(task => tasksForUser.has(task.id));
      });
      const assignedTaskIds = new Set(subtasks.filter(st => st.assigned_to).map(st => st.task_id));
      grouped['unassigned'] = sourceTasks.filter(task => {
        const relatedSubtasks = subtasks.filter(st => st.task_id === task.id);
        if (relatedSubtasks.length === 0) return true; // Standalone tasks are unassigned in this context
        return !assignedTaskIds.has(task.id);
      });
    } else if (groupByDeadline) {
      const today = new Date();
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      
      const nextWeek = new Date();
      nextWeek.setDate(today.getDate() + 7);
      const nextWeekStr = format(nextWeek, 'yyyy-MM-dd');
      
      const nextMonth = new Date();
      nextMonth.setMonth(today.getMonth() + 1);
      const nextMonthStr = format(nextMonth, 'yyyy-MM-dd');

      grouped['today'] = sourceTasks.filter(t => t.deadline && t.deadline.startsWith(todayStr));
      grouped['this_week'] = sourceTasks.filter(t => t.deadline && t.deadline > todayStr && t.deadline <= nextWeekStr);
      grouped['this_month'] = sourceTasks.filter(t => t.deadline && t.deadline > nextWeekStr && t.deadline <= nextMonthStr);
      grouped['later'] = sourceTasks.filter(t => t.deadline && t.deadline > nextMonthStr);
      grouped['no_deadline'] = sourceTasks.filter(t => !t.deadline);
    } else {
      grouped['all'] = sourceTasks;
    }

    // Filter out empty groups
    Object.keys(grouped).forEach(key => {
      if (grouped[key].length === 0) {
        delete grouped[key];
      }
    });

    return grouped;
  };

  const renderMainTaskKanbanBoard = () => {
    const groupedTasksByCriteria = groupMainTasks();

    return (
      <div className="overflow-auto h-full">
        {Object.keys(groupedTasksByCriteria).map(groupId => {
          const groupTasks = groupedTasksByCriteria[groupId];
          
          if (groupTasks.length === 0) {
            return null;
          }
          
          return (
            <div key={groupId} className="mb-8">
              <h3 className="text-lg font-semibold mb-4 bg-gray-100 p-2 rounded">
                {getGroupTitle(groupId)}
              </h3>
              <div className="grid grid-cols-5 gap-4">
                {mainTaskColumns.map(column => {
                  const columnTasks = groupTasks.filter(task => task.main_task_status === column.id);
                  
                  return (
                    <div 
                      key={column.id} 
                      className="bg-gray-50 rounded-lg p-2 min-h-[300px]"
                    >
                      <h4 className="font-medium text-center py-2 border-b mb-2">{column.name} ({columnTasks.length || 0})</h4>
                      <div className="space-y-2">
                        {columnTasks.map(task => {
                          let borderColorClass = 'border-indigo-500'; // Default
                          if (task.subtaskStats.total > 0) {
                              if (task.approvedPercentage === 100) {
                                  borderColorClass = 'border-green-500'; // All approved
                              } else if (task.completedAndApprovedPercentage > 0) {
                                  borderColorClass = 'border-yellow-500'; // Some progress (completed or approved)
                              }
                          }
                          
                          return (
                          <div 
                            key={task.id}
                            className={`bg-white p-3 rounded-lg shadow-sm hover:shadow-md transition-all duration-300 border-l-4 ${borderColorClass} cursor-pointer`}
                            onClick={() => handleViewTaskDetails(task.id, 'task')}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <h5 className="font-medium text-gray-800 flex-1 min-w-0">
                                {task.title}
                              </h5>
                              <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
                                task.priority === 'high' ? 'bg-red-100 text-red-800' :
                                task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {task.priority === 'high' ? 'Alta' :
                                 task.priority === 'medium' ? 'Media' : 'Baja'}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-2 flex flex-wrap gap-1.5">
                              <div className="flex items-center bg-gray-50 rounded px-1.5 py-0.5">
                                <Clock className="w-2.5 h-2.5 mr-1" />
                                <span>{task.estimated_duration} min</span>
                              </div>
                              {/* Tiempo real si está disponible */}
                              {(() => {
                                const details = getItemDetails(task);
                                if (details.realDuration) {
                                  const isOnTime = details.realDuration <= task.estimated_duration;
                                  const isClose = details.realDuration <= task.estimated_duration * 1.2; // 20% de tolerancia
                                  const hasRework = details.timeBreakdown && details.timeBreakdown.rework.length > 0;
                                  
                                  return (
                                    <div className={`flex items-center rounded px-1.5 py-0.5 ${
                                      isOnTime 
                                        ? 'bg-green-100 text-green-800' 
                                        : isClose 
                                          ? 'bg-yellow-100 text-yellow-800'
                                          : 'bg-red-100 text-red-800'
                                    }`} title={hasRework ? `Inicial: ${details.timeBreakdown!.initial}min | Retrabajo: ${details.timeBreakdown!.rework.reduce((sum, r) => sum + r.tiempo, 0)}min` : undefined}>
                                      <Clock className="w-2.5 h-2.5 mr-1" />
                                      <span>Real: {details.realDuration} min</span>
                                      {isOnTime && <span className="ml-1">✓</span>}
                                      {!isOnTime && !isClose && <span className="ml-1">⚠</span>}
                                      {hasRework && <span className="ml-1 text-orange-600">🔄</span>}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                              <div className="flex items-center bg-gray-50 rounded px-1.5 py-0.5">
                                <Calendar className="w-2.5 h-2.5 mr-1" />
                                <span>{new Date(task.deadline).toLocaleDateString()}</span>
                              </div>
                              {task.project_id && (
                                <div className="flex items-center bg-gray-50 rounded px-1.5 py-0.5">
                                  <FolderOpen className="w-2.5 h-2.5 mr-1" />
                                  <span className="truncate max-w-[120px]">
                                    {projects.find(p => p.id === task.project_id)?.name || 'Proyecto'}
                                  </span>
                                </div>
                              )}
                            </div>
                            {/* NEW: Progress bar and stats */}
                            {task.subtaskStats.total > 0 && (
                              <div className="mt-3">
                                <div className="flex justify-between items-center text-xs mb-1">
                                  <span className="font-medium text-gray-600">Progreso</span>
                                  <span className="font-semibold text-indigo-600">
                                    {task.subtaskStats.approved} / {task.subtaskStats.total}
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden relative">
                                  {/* Ghost bar */}
                                  <div
                                    className="bg-green-300 h-2 rounded-full transition-all duration-500 absolute top-0 left-0"
                                    style={{ width: `${task.completedAndApprovedPercentage}%` }}
                                  ></div>
                                  {/* Main bar */}
                                  <div 
                                    className="bg-gradient-to-r from-indigo-500 to-blue-500 h-2 rounded-full transition-all duration-500 absolute top-0 left-0"
                                    style={{ width: `${task.approvedPercentage}%` }}
                                  ></div>
                                </div>
                              </div>
                            )}
                          </div>
                        )})}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderReviewView = () => {
    const readyForReviewTasks = tasks.filter(task => 
      task.status === 'completed'
    );
    const readyForReviewSubtasks = subtasks.filter(subtask => 
      subtask.status === 'completed'
    );

    const inReviewTasks = tasks.filter(task => task.status === 'in_review');
    const inReviewSubtasks = subtasks.filter(subtask => subtask.status === 'in_review');

    const blockedTasks = tasks.filter(task => task.status === 'blocked');
    const blockedSubtasks = subtasks.filter(subtask => subtask.status === 'blocked');

    // Function to group items by area
    const groupItemsByArea = (tasksToGroup: Task[], subtasksToGroup: Subtask[]) => {
      const grouped: { [areaId: string]: { area: Area | null, tasks: Task[], subtasks: Subtask[] } } = {};
      
      // Initialize areas
      areas.forEach(area => {
        grouped[area.id] = { area, tasks: [], subtasks: [] };
      });
      
      // Add "No Area" group
      grouped['no_area'] = { area: null, tasks: [], subtasks: [] };

      // Group tasks (tasks without subtasks only)
      tasksToGroup
        .filter(task => !subtasksToGroup.some(st => st.task_id === task.id))
        .forEach(task => {
          // For tasks, we need to check assigned users (if any) and their areas
          if (task.assigned_users && task.assigned_users.length > 0) {
            const assignedUser = usersWithAreas.find(u => task.assigned_users!.includes(u.id));
            const areaId = assignedUser?.area?.id || 'no_area';
            grouped[areaId].tasks.push(task);
          } else {
            grouped['no_area'].tasks.push(task);
          }
        });

      // Group subtasks
      subtasksToGroup.forEach(subtask => {
        const assignedUser = usersWithAreas.find(u => u.id === subtask.assigned_to);
        const areaId = assignedUser?.area?.id || 'no_area';
        grouped[areaId].subtasks.push(subtask);
      });

      // Filter out empty groups
      return Object.entries(grouped)
        .filter(([_, group]) => group.tasks.length > 0 || group.subtasks.length > 0)
        .sort(([areaIdA], [areaIdB]) => {
          if (areaIdA === 'no_area') return 1;
          if (areaIdB === 'no_area') return -1;
          return 0;
        });
    };

    const toggleAreaExpansion = (areaId: string) => {
      const newExpanded = new Set(expandedAreas);
      if (newExpanded.has(areaId)) {
        newExpanded.delete(areaId);
      } else {
        newExpanded.add(areaId);
      }
      setExpandedAreas(newExpanded);
    };

    const renderTasksTable = (itemsToRender: { tasks: Task[], subtasks: Subtask[] }) => {
      const allItems: Array<{ item: Task | Subtask, isSubtask: boolean }> = [
        ...itemsToRender.tasks.map(task => ({ item: task, isSubtask: false })),
        ...itemsToRender.subtasks.map(subtask => ({ item: subtask, isSubtask: true }))
      ];

      if (allItems.length === 0) {
        return (
          <div className="text-center py-8 text-gray-500">
            <span className="text-sm">No hay actividades en esta área</span>
          </div>
        );
      }

      return (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-12">
                  Tipo
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actividad
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-20">
                  Prioridad
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-32">
                  Usuario / Área
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-20">
                  Duración
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">
                  Fecha Límite
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-32">
                  Comentarios
                </th>
                <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-52">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {allItems.map(({ item, isSubtask }) => {
                const parentTask = isSubtask ? tasks.find(t => t.id === (item as Subtask).task_id) : null;
                const details = getItemDetails(item);
                const assignedUser = isSubtask ? usersWithAreas.find(u => u.id === (item as Subtask).assigned_to) : null;
                
                return (
                  <tr 
                    key={item.id}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors group ${
                      item.status === 'blocked' ? 'bg-red-25' : 'bg-white'
                    }`}
                    onClick={() => handleViewTaskDetails(item.id, isSubtask ? 'subtask' : 'task')}
                  >
                    {/* Tipo */}
                    <td className="px-4 py-4">
                      <div className="flex items-center">
                        {isSubtask ? (
                          <div className="p-1.5 bg-emerald-100 rounded-lg">
                            <div className="w-3 h-3 bg-emerald-500 rounded-sm"></div>
                          </div>
                        ) : (
                          <div className="p-1.5 bg-indigo-100 rounded-lg">
                            <FolderOpen className="w-3 h-3 text-indigo-600" />
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Actividad */}
                    <td className="px-4 py-4">
                      <div className="max-w-xs">
                        <div className="text-sm font-medium text-gray-900 line-clamp-2" title={item.title}>
                          {item.title}
                        </div>
                        {isSubtask && parentTask && (
                          <div className="text-xs text-gray-500 mt-1 flex items-center">
                            <FolderOpen className="w-3 h-3 mr-1" />
                            <span className="truncate">{parentTask.title}</span>
                          </div>
                        )}
                        {(isSubtask ? parentTask?.project_id : (item as Task).project_id) && (
                          <div className="text-xs text-indigo-600 mt-1">
                            {projects.find(p => p.id === (isSubtask ? parentTask?.project_id : (item as Task).project_id))?.name}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        item.status === 'blocked' 
                          ? 'bg-red-100 text-red-800 border border-red-200' 
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        {item.status === 'blocked' ? '🚫 Bloqueada' : '✅ Completada'}
                      </span>
                    </td>

                    {/* Prioridad */}
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        (isSubtask ? parentTask?.priority : (item as Task).priority) === 'high' 
                          ? 'bg-red-100 text-red-800' :
                        (isSubtask ? parentTask?.priority : (item as Task).priority) === 'medium' 
                          ? 'bg-amber-100 text-amber-800' :
                          'bg-green-100 text-green-800'
                      }`}>
                        {(isSubtask ? parentTask?.priority : (item as Task).priority) === 'high' ? '🔥' :
                         (isSubtask ? parentTask?.priority : (item as Task).priority) === 'medium' ? '⚡' : '🌿'}
                      </span>
                    </td>

                    {/* Usuario / Área */}
                    <td className="px-4 py-4">
                      {isSubtask && assignedUser ? (
                        <div className="text-sm">
                          <div className="font-medium text-gray-900 truncate" title={assignedUser.name}>
                            {assignedUser.name}
                          </div>
                          {assignedUser.area && (
                            <div className="text-xs text-indigo-600 truncate" title={assignedUser.area.name}>
                              {assignedUser.area.name}
                            </div>
                          )}
                        </div>
                      ) : !isSubtask && (item as Task).assigned_users && (item as Task).assigned_users!.length > 0 ? (
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">
                            {usersWithAreas.find(u => (item as Task).assigned_users!.includes(u.id))?.name || 'Usuario'}
                          </div>
                          {(item as Task).assigned_users!.length > 1 && (
                            <div className="text-xs text-gray-500">
                              +{(item as Task).assigned_users!.length - 1} más
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 italic">No asignado</span>
                      )}
                    </td>

                    {/* Duración */}
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900">
                        <div className="font-medium">{item.estimated_duration}min</div>
                        {details.realDuration && (
                          <div className={`text-xs font-medium ${
                            details.realDuration <= item.estimated_duration
                              ? 'text-green-600'
                              : details.realDuration <= item.estimated_duration * 1.2
                                ? 'text-yellow-600' 
                                : 'text-red-600'
                          }`} title={details.timeBreakdown && details.timeBreakdown.rework.length > 0 ? `Inicial: ${details.timeBreakdown.initial}min | Retrabajo: ${details.timeBreakdown.rework.reduce((sum, r) => sum + r.tiempo, 0)}min` : undefined}>
                            Real: {details.realDuration}min
                            {details.realDuration <= item.estimated_duration && ' ✓'}
                            {details.realDuration > item.estimated_duration * 1.2 && ' ⚠'}
                            {details.timeBreakdown && details.timeBreakdown.rework.length > 0 && ' 🔄'}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Fecha Límite */}
                    <td className="px-4 py-4">
                      {item.deadline ? (
                        <div className="text-sm text-gray-900">
                          {new Date(item.deadline).toLocaleDateString('es-ES', { 
                            day: 'numeric', 
                            month: 'short',
                            year: '2-digit'
                          })}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>

                    {/* Comentarios */}
                    <td className="px-4 py-4">
                      <div className="max-w-xs">
                        {details.deliveryComments && item.status === 'completed' && (
                          <div className="text-xs text-emerald-800 bg-emerald-50 px-2 py-1 rounded-md line-clamp-2" title={details.deliveryComments}>
                            💬 {details.deliveryComments}
                          </div>
                        )}
                        {details.blockReason && item.status === 'blocked' && (
                          <div className="text-xs text-red-800 bg-red-50 px-2 py-1 rounded-md line-clamp-2" title={details.blockReason}>
                            🚫 {details.blockReason}
                          </div>
                        )}
                        {reviewSubTab === 'in_review' && (details.returnedFeedback || details.approvedFeedback) && (
                          <div className="text-xs text-amber-800 bg-amber-50 px-2 py-1 rounded-md line-clamp-2" title={(details.returnedFeedback || details.approvedFeedback)?.feedback || ''}>
                            📝 {(details.returnedFeedback || details.approvedFeedback)?.feedback || 'Sin comentarios'}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-2">
                        {reviewSubTab === 'ready_for_review' && (
                          <button
                            className="text-sm font-medium px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 shadow-sm hover:shadow-md"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusChange(item.id, 'in_review', isSubtask);
                            }}
                            title="Iniciar revisión"
                          >
                            <ArrowRight className="w-4 h-4" />
                            Revisar
                          </button>
                        )}
                        
                        {reviewSubTab === 'in_review' && (
                          <>
                            <button
                              className="text-sm font-medium px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors shadow-sm hover:shadow-md"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(item.id, 'completed', isSubtask);
                              }}
                              title="Cancelar revisión"
                            >
                              <ArrowLeft className="w-4 h-4" />
                            </button>
                            <button
                              className="text-sm font-medium px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-sm hover:shadow-md"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(item.id, 'returned', isSubtask);
                              }}
                              title="Devolver"
                            >
                              <AlertTriangle className="w-4 h-4" />
                            </button>
                            <button
                              className="text-sm font-medium px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors shadow-sm hover:shadow-md"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(item.id, 'approved', isSubtask);
                              }}
                              title="Aprobar"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {reviewSubTab === 'blocked' && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedItem({ id: item.id, type: isSubtask ? 'subtask' : 'task', status: item.status });
                                setShowUnblockModal(true);
                              }}
                              className="px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors bg-blue-100 text-blue-800 hover:bg-blue-200"
                            >
                              <ArrowLeft className="w-3 h-3" />
                              <span>Desbloquear</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteItem(item.id, isSubtask);
                              }}
                              className="px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors bg-red-100 text-red-800 hover:bg-red-200"
                              title="Eliminar tarea"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Eliminar</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    };

    return (
      <div className="flex flex-col h-full bg-gradient-to-br from-gray-50 to-gray-100">
        {/* Header con gradiente */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setReviewSubTab('ready_for_review')}
              className={`relative px-8 py-4 text-sm font-semibold transition-all duration-300 ${
                reviewSubTab === 'ready_for_review'
                  ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5" />
                <span>Por Revisar</span>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full transition-all duration-300 ${
                  reviewSubTab === 'ready_for_review' 
                    ? 'bg-blue-100 text-blue-800 shadow-md' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {readyForReviewTasks.length + readyForReviewSubtasks.length}
                </span>
              </div>
            </button>
            <button
              onClick={() => setReviewSubTab('in_review')}
              className={`relative px-8 py-4 text-sm font-semibold transition-all duration-300 ${
                reviewSubTab === 'in_review'
                  ? 'text-orange-600 bg-orange-50 border-b-2 border-orange-500'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5" />
                <span>En Revisión</span>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full transition-all duration-300 ${
                  reviewSubTab === 'in_review' 
                    ? 'bg-orange-100 text-orange-800 shadow-md' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {inReviewTasks.length + inReviewSubtasks.length}
                </span>
              </div>
            </button>
            <button
              onClick={() => setReviewSubTab('blocked')}
              className={`relative px-8 py-4 text-sm font-semibold transition-all duration-300 ${
                reviewSubTab === 'blocked'
                  ? 'text-red-600 bg-red-50 border-b-2 border-red-500'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5" />
                <span>Bloqueadas</span>
                <span className={`px-2.5 py-1 text-xs font-bold rounded-full transition-all duration-300 ${
                  reviewSubTab === 'blocked' 
                    ? 'bg-red-100 text-red-800 shadow-md' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {blockedTasks.length + blockedSubtasks.length}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Contenido principal */}
        <div className="flex-1 overflow-y-auto p-6">
          {reviewSubTab === 'ready_for_review' ? (
            <div className="max-w-8xl mx-auto">
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
                {/* Header de sección */}
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/20 rounded-xl">
                      <CheckCircle className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold">Actividades Listas para Revisar</h3>
                      <p className="text-blue-100 mt-1">
                        {readyForReviewTasks.length + readyForReviewSubtasks.length} actividades esperando tu revisión
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="p-6">
                  {readyForReviewTasks.length === 0 && readyForReviewSubtasks.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-blue-500 rounded-full blur-3xl opacity-20 animate-pulse"></div>
                        <CheckCircle className="relative w-20 h-20 mx-auto mb-6 text-emerald-400" />
                      </div>
                      <h4 className="text-2xl font-bold text-gray-800 mb-2">¡Excelente trabajo!</h4>
                      <p className="text-gray-600 text-lg">No hay actividades pendientes de revisión en este momento.</p>
                      <p className="text-gray-500 text-sm mt-2">Todas las actividades están al día 🎉</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {groupItemsByArea(readyForReviewTasks, readyForReviewSubtasks).map(([areaId, group]) => (
                        <div key={areaId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                          {/* Area Header */}
                          <button
                            onClick={() => toggleAreaExpansion(areaId)}
                            className="w-full p-4 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150 transition-all duration-200 flex items-center justify-between border-b border-gray-200"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-indigo-100 rounded-lg">
                                <Users className="w-5 h-5 text-indigo-600" />
                              </div>
                              <div className="text-left">
                                <h4 className="font-semibold text-gray-900">
                                  {group.area?.name || '📋 Sin Área Asignada'}
                                </h4>
                                <p className="text-sm text-gray-500">
                                  {group.tasks.length + group.subtasks.length} actividades por revisar
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                                {group.tasks.length + group.subtasks.length}
                              </span>
                              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
                                expandedAreas.has(areaId) ? 'rotate-180' : ''
                              }`} />
                            </div>
                          </button>
                          
                          {/* Area Content */}
                          {expandedAreas.has(areaId) && (
                            <div className="p-4">
                              {renderTasksTable(group)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : reviewSubTab === 'in_review' ? (
            <div className="max-w-8xl mx-auto">
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
                {/* Header de sección */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 text-white">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/20 rounded-xl">
                      <AlertTriangle className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold">Actividades en Proceso de Revisión</h3>
                      <p className="text-orange-100 mt-1">
                        {inReviewTasks.length + inReviewSubtasks.length} actividades siendo revisadas actualmente
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="p-6">
                  {inReviewTasks.length === 0 && inReviewSubtasks.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-orange-400 to-red-500 rounded-full blur-3xl opacity-20 animate-pulse"></div>
                        <AlertTriangle className="relative w-20 h-20 mx-auto mb-6 text-orange-400" />
                      </div>
                      <h4 className="text-2xl font-bold text-gray-800 mb-2">No hay revisiones en curso</h4>
                      <p className="text-gray-600 text-lg">Todas las actividades han sido procesadas.</p>
                      <p className="text-gray-500 text-sm mt-2">Las nuevas actividades aparecerán aquí cuando inicies su revisión ⏳</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {groupItemsByArea(inReviewTasks, inReviewSubtasks).map(([areaId, group]) => (
                        <div key={areaId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                          {/* Area Header */}
                          <button
                            onClick={() => toggleAreaExpansion(areaId)}
                            className="w-full p-4 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150 transition-all duration-200 flex items-center justify-between border-b border-gray-200"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-orange-100 rounded-lg">
                                <Users className="w-5 h-5 text-orange-600" />
                              </div>
                              <div className="text-left">
                                <h4 className="font-semibold text-gray-900">
                                  {group.area?.name || '📋 Sin Área Asignada'}
                                </h4>
                                <p className="text-sm text-gray-500">
                                  {group.tasks.length + group.subtasks.length} actividades en revisión
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">
                                {group.tasks.length + group.subtasks.length}
                              </span>
                              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
                                expandedAreas.has(areaId) ? 'rotate-180' : ''
                              }`} />
                            </div>
                          </button>
                          
                          {/* Area Content */}
                          {expandedAreas.has(areaId) && (
                            <div className="p-4">
                              {renderTasksTable(group)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-8xl mx-auto">
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
                {/* Header de sección */}
                <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 text-white">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white/20 rounded-xl">
                      <AlertTriangle className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold">Tareas Bloqueadas</h3>
                      <p className="text-red-100 mt-1">
                        {blockedTasks.length + blockedSubtasks.length} tareas están bloqueadas y esperando revisión
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="p-6">
                  {blockedTasks.length === 0 && blockedSubtasks.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-red-400 to-red-500 rounded-full blur-3xl opacity-20 animate-pulse"></div>
                        <AlertTriangle className="relative w-20 h-20 mx-auto mb-6 text-red-400" />
                      </div>
                      <h4 className="text-2xl font-bold text-gray-800 mb-2">No hay tareas bloqueadas</h4>
                      <p className="text-gray-600 text-lg">Todas las tareas están completadas o aprobadas.</p>
                      <p className="text-gray-500 text-sm mt-2">Las nuevas tareas aparecerán aquí cuando se bloquee una.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {groupItemsByArea(blockedTasks, blockedSubtasks).map(([areaId, group]) => (
                        <div key={areaId} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                          {/* Area Header */}
                          <button
                            onClick={() => toggleAreaExpansion(areaId)}
                            className="w-full p-4 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150 transition-all duration-200 flex items-center justify-between border-b border-gray-200"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-red-100 rounded-lg">
                                <Users className="w-5 h-5 text-red-600" />
                              </div>
                              <div className="text-left">
                                <h4 className="font-semibold text-gray-900">
                                  {group.area?.name || '📋 Sin Área Asignada'}
                                </h4>
                                <p className="text-sm text-gray-500">
                                  {group.tasks.length + group.subtasks.length} tareas bloqueadas
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                                {group.tasks.length + group.subtasks.length}
                              </span>
                              <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
                                expandedAreas.has(areaId) ? 'rotate-180' : ''
                              }`} />
                            </div>
                          </button>
                          
                          {/* Area Content */}
                          {expandedAreas.has(areaId) && (
                            <div className="p-4">
                              {renderTasksTable(group)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión</h1>
          <p className="text-gray-600">Tablero Kanban para visualizar y gestionar tareas</p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center text-sm px-3 py-1.5 rounded-md transition-all duration-300 ${
              autoRefresh 
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                : 'bg-gray-50 text-gray-600 border border-gray-200'
            }`}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className={`h-4 w-4 mr-1.5 transition-opacity duration-300 ${
                refreshing 
                  ? 'text-indigo-500 animate-spin' 
                  : autoRefresh ? 'text-indigo-500' : 'text-gray-400'
              }`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {autoRefresh ? 'Actualización automática' : 'Actualización manual'}
          </button>
          
          <button
            onClick={fetchData}
            disabled={refreshing}
            className="flex items-center text-sm px-3 py-1.5 rounded-md transition-all duration-300 bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-4 w-4 mr-1.5" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualizar ahora
          </button>
          
          {/* Indicador sutil con transición suave */}
          <div className="relative h-5">
            <span 
              className={`text-xs absolute transition-all duration-300 ${
                refreshing 
                  ? 'opacity-100 translate-y-0' 
                  : 'opacity-0 -translate-y-1'
              }`}
              style={{ color: '#6366f1' }}
            >
              Sincronizando...
            </span>
          </div>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <div className="inline-flex rounded-md shadow-sm mr-4">
              <button
                onClick={() => setView('subtasks')}
                className={`px-4 py-2 text-sm font-medium border rounded-l-md ${view === 'subtasks' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                Subtareas
              </button>
              <button
                onClick={() => setView('main_tasks')}
                className={`-ml-px px-4 py-2 text-sm font-medium border ${view === 'main_tasks' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                Tareas Principales
              </button>
              <button
                onClick={() => setView('review')}
                className={`-ml-px px-4 py-2 text-sm font-medium border rounded-r-md ${view === 'review' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                Revisión
              </button>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Filter className="w-5 h-5 mr-2" />
            Filtros y Agrupación
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium">Filtros y Agrupación</h3>
            <button onClick={() => setShowFilters(false)} className="text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Filtros</h4>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Proyecto</label>
                  <select
                    value={selectedProject || ''}
                    onChange={(e) => setSelectedProject(e.target.value || null)}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="">Todos los proyectos</option>
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Prioridad</label>
                  <select
                    value={selectedPriority || ''}
                    onChange={(e) => setSelectedPriority(e.target.value || null)}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="">Todas las prioridades</option>
                    <option value="high">Alta</option>
                    <option value="medium">Media</option>
                    <option value="low">Baja</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Asignado a</label>
                  <select
                    value={selectedAssignee || ''}
                    onChange={(e) => setSelectedAssignee(e.target.value || null)}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="">Todos los usuarios</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium mb-2">Agrupación</h4>
              
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="group-project"
                    checked={groupByProject}
                    onChange={() => {
                      setGroupByProject(true);
                      setGroupByPriority(false);
                      setGroupByAssignee(false);
                      setGroupByDeadline(false);
                    }}
                    className="mr-2"
                  />
                  <label htmlFor="group-project">Agrupar por Proyecto</label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="group-priority"
                    checked={groupByPriority}
                    onChange={() => {
                      setGroupByProject(false);
                      setGroupByPriority(true);
                      setGroupByAssignee(false);
                      setGroupByDeadline(false);
                    }}
                    className="mr-2"
                  />
                  <label htmlFor="group-priority">Agrupar por Prioridad</label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="group-assignee"
                    checked={groupByAssignee}
                    onChange={() => {
                      setGroupByProject(false);
                      setGroupByPriority(false);
                      setGroupByAssignee(true);
                      setGroupByDeadline(false);
                    }}
                    className="mr-2"
                  />
                  <label htmlFor="group-assignee">Agrupar por Asignado</label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="group-deadline"
                    checked={groupByDeadline}
                    onChange={() => {
                      setGroupByProject(false);
                      setGroupByPriority(false);
                      setGroupByAssignee(false);
                      setGroupByDeadline(true);
                    }}
                    className="mr-2"
                  />
                  <label htmlFor="group-deadline">Agrupar por Fecha Límite</label>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="group-none"
                    checked={!groupByProject && !groupByPriority && !groupByAssignee && !groupByDeadline}
                    onChange={() => {
                      setGroupByProject(false);
                      setGroupByPriority(false);
                      setGroupByAssignee(false);
                      setGroupByDeadline(false);
                    }}
                    className="mr-2"
                  />
                  <label htmlFor="group-none">Sin agrupación</label>
                </div>
              </div>
              
              <div className="mt-4">
                <button
                  onClick={() => {
                    setSelectedProject(null);
                    setSelectedPriority(null);
                    setSelectedAssignee(null);
                    setGroupByProject(true);
                    setGroupByPriority(false);
                    setGroupByAssignee(false);
                    setGroupByDeadline(false);
                  }}
                  className="text-indigo-600 hover:text-indigo-800 text-sm"
                >
                  Restablecer filtros y agrupación
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="text-center py-10">
            <p className="text-gray-500">Cargando tablero...</p>
          </div>
        ) : view === 'subtasks' ? (
          renderKanbanBoard()
        ) : view === 'main_tasks' ? (
          renderMainTaskKanbanBoard()
        ) : (
          renderReviewView()
        )}
      </div>

      {/* Modal de retroalimentación para devolver tarea */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">Retroalimentación para devolución</h3>
            
            <form onSubmit={handleFeedbackSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comentarios de retroalimentación:
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full h-32 p-2 border rounded-md resize-none"
                  placeholder="Explica los motivos por los que devuelves esta tarea..."
                  required
                />
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowFeedbackModal(false);
                    setSelectedItem(null);
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Devolver tarea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de aprobación con calificación */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">Aprobar tarea</h3>
            
            <form onSubmit={handleApprovalSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Calificación:
                </label>
                <div className="flex items-center space-x-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setRating(value)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                        rating >= value ? 'bg-yellow-400 border-yellow-500 text-yellow-800' : 'bg-gray-100 border-gray-300 text-gray-400'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {rating === 1 && "Insuficiente"}
                  {rating === 2 && "Regular"}
                  {rating === 3 && "Bueno"}
                  {rating === 4 && "Muy bueno"}
                  {rating === 5 && "Excelente"}
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comentarios (opcional):
                </label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="w-full h-24 p-2 border rounded-md resize-none"
                  placeholder="Comentarios adicionales sobre el trabajo..."
                />
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowApprovalModal(false);
                    setSelectedItem(null);
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Aprobar y calificar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal para ver detalles de retroalimentación */}
      {showFeedbackDetailsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4 flex items-center text-orange-600">
              <AlertTriangle className="w-5 h-5 mr-2" />
              Retroalimentación de la tarea
            </h3>
            
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-md">
              <h4 className="text-sm font-medium text-orange-800 mb-2">Comentarios:</h4>
              <p className="text-gray-700 whitespace-pre-wrap">
                {feedbackDetails?.feedback || 'No hay comentarios disponibles'}
              </p>
            </div>
            
            {feedbackDetails?.reviewed_at && (
              <div className="text-sm text-gray-500 mb-4">
                Devuelta el: {new Date(feedbackDetails.reviewed_at).toLocaleString()}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => {
                  setShowFeedbackDetailsModal(false);
                  setFeedbackDetails(null);
                }}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalles de tarea / subtarea (Refactorizado) */}
      {showTaskDetailsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[95vh] flex flex-col">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-start z-10">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-semibold">
                    {detailsItem?.type === 'subtask' ? '📋 Subtarea:' : '📌 Tarea:'}
                  </h3>
                  <span className="text-xl font-medium text-gray-800">{taskDetails?.title || 'Cargando...'}</span>
                  {taskDetails && (
                    <span className={`ml-2 px-2.5 py-0.5 text-xs rounded-full font-medium ${
                      taskDetails.priority === 'high' ? 'bg-red-100 text-red-800' :
                      taskDetails.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                    }`}>
                      {taskDetails.priority === 'high' ? 'Alta' :
                       taskDetails.priority === 'medium' ? 'Media' : 'Baja'} Prioridad
                    </span>
                  )}
                </div>
                {taskDetails && (
                  <div className="text-xs text-gray-500 font-mono mb-2">
                    ID: {taskDetails.id}
                  </div>
                )}
                {detailsItem?.type === 'subtask' && taskDetails?.parent_task && (
                  <div className="text-sm text-indigo-600 flex items-center mt-1">
                    <FolderOpen className="w-4 h-4 mr-1.5 flex-shrink-0" />
                    <span>Parte de la tarea: {taskDetails.parent_task.title}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setShowTaskDetailsModal(false);
                  setTaskDetails(null);
                  setRelatedSubtasks([]);
                  setPreviousSubtask(null);
                  setNextSubtask(null);
                  setDeliveryComments('');
                  setDetailsItem(null); // Reset details item
                  setNewAssignee(''); // Limpiar el selector de responsable
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                  <span className="ml-3 text-gray-600">Cargando detalles...</span>
                </div>
              ) : taskDetails ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Columna Principal (Información y Feedback) */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* Description Card */}
                    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                        <h4 className="text-base font-semibold text-gray-700">Descripción</h4>
                      </div>
                      <div className="p-4 text-gray-700 text-sm">
                        {taskDetails.description ? (
                          <RichTextDisplay text={taskDetails.description} />
                        ) : (
                          <span className="italic text-gray-500">Sin descripción disponible</span>
                        )}
                      </div>
                    </div>

                    {/* Delivery Comments Card */}
                    {deliveryComments && taskDetails.status !== 'blocked' && (
                      <div className="bg-green-50 border border-green-200 rounded-lg shadow-sm overflow-hidden">
                        <div className="bg-green-100 px-4 py-3 border-b border-green-200 flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-green-700" />
                          <h4 className="text-base font-semibold text-green-800">Comentarios de Entrega</h4>
                        </div>
                        <div className="p-4 text-green-900 text-sm whitespace-pre-wrap">
                          {deliveryComments}
                        </div>
                      </div>
                    )}

                    {/* Block Reason Card */}
                    {taskDetails.status === 'blocked' && getItemDetails(taskDetails).blockReason && (
                      <div className="bg-red-50 border border-red-200 rounded-lg shadow-sm overflow-hidden">
                        <div className="bg-red-100 px-4 py-3 border-b border-red-200 flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-red-700" />
                          <h4 className="text-base font-semibold text-red-800">Motivo del Bloqueo</h4>
                        </div>
                        <div className="p-4 text-red-900 text-sm whitespace-pre-wrap">
                          {getItemDetails(taskDetails).blockReason}
                        </div>
                        <div className="p-3 bg-red-100 border-t border-red-200">
                           <button 
                              onClick={() => {
                                setSelectedItem({ id: taskDetails.id, type: taskDetails.type === 'subtask' ? 'subtask' : 'task', status: taskDetails.status });
                                setShowUnblockModal(true);
                              }}
                              className="px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-1.5 transition-colors bg-blue-100 text-blue-800 hover:bg-blue-200"
                           >
                              <ArrowLeft className="w-4 h-4" />
                              Desbloquear
                           </button>
                        </div>
                      </div>
                    )}

                    {/* Returned Feedback Card */}
                    {taskDetails.status === 'returned' && getItemDetails(taskDetails).returnedFeedback && (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg shadow-sm overflow-hidden">
                        <div className="bg-orange-100 px-4 py-3 border-b border-orange-200 flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-orange-700" />
                          <h4 className="text-base font-semibold text-orange-800">Retroalimentación (Devuelta)</h4>
                        </div>
                        <div className="p-4 space-y-2">
                          <p className="text-orange-900 text-sm whitespace-pre-wrap">
                            {getItemDetails(taskDetails).returnedFeedback?.feedback || <span className="italic text-gray-500">Sin comentarios específicos.</span>}
                          </p>
                          {getItemDetails(taskDetails).returnedFeedback?.reviewed_at && (
                            <p className="text-xs text-gray-500">
                              Devuelta el: {new Date(getItemDetails(taskDetails).returnedFeedback!.reviewed_at!).toLocaleString()} por {(() => {
                                const reviewedBy = getItemDetails(taskDetails).returnedFeedback?.reviewed_by;
                                const foundUser = users.find(u => u.id === reviewedBy);
                                console.log('Buscando usuario:', reviewedBy, 'En lista:', users.map(u => u.id), 'Encontrado:', foundUser);
                                return foundUser?.name || foundUser?.email || 'Usuario no encontrado';
                              })()}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Approved Feedback Card */}
                    {taskDetails.status === 'approved' && getItemDetails(taskDetails).approvedFeedback && (
                       <div className="bg-teal-50 border border-teal-200 rounded-lg shadow-sm overflow-hidden">
                        <div className="bg-teal-100 px-4 py-3 border-b border-teal-200 flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-teal-700" />
                          <h4 className="text-base font-semibold text-teal-800">Retroalimentación (Aprobada)</h4>
                        </div>
                        <div className="p-4 space-y-3">
                           <p className="text-teal-900 text-sm whitespace-pre-wrap mb-2">
                             {getItemDetails(taskDetails).approvedFeedback?.feedback || <span className="italic text-gray-500">Sin comentarios específicos.</span>}
                           </p>
                           {getItemDetails(taskDetails).approvedFeedback?.rating && (
                             <div className="flex items-center gap-2">
                               <span className="text-sm font-medium text-gray-700">Calificación:</span>
                               <div className="flex items-center">
                                 {[1, 2, 3, 4, 5].map((value) => (
                                   <span
                                     key={value}
                                     className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold border ${
                                       (getItemDetails(taskDetails).approvedFeedback!.rating || 0) >= value
                                         ? 'bg-yellow-400 border-yellow-500 text-yellow-900'
                                         : 'bg-gray-100 border-gray-300 text-gray-400'
                                     } mr-1`}
                                   >
                                     {value}
                                   </span>
                                 ))}
                                 <span className="text-sm ml-1 text-gray-600">
                                   ({
                                     {1: 'Insuficiente', 2: 'Regular', 3: 'Bueno', 4: 'Muy bueno', 5: 'Excelente'}[getItemDetails(taskDetails).approvedFeedback!.rating || 0] || ''
                                   })
                                 </span>
                               </div>
                             </div>
                           )}
                           {getItemDetails(taskDetails).approvedFeedback?.reviewed_at && (
                             <p className="text-xs text-gray-500">
                               Aprobada el: {new Date(getItemDetails(taskDetails).approvedFeedback!.reviewed_at!).toLocaleString()} por {users.find(u => u.id === getItemDetails(taskDetails).approvedFeedback?.reviewed_by)?.name || 'Usuario'}
                             </p>
                           )}
                         </div>
                       </div>
                    )}

                    {/* Subtasks List (if viewing a Task) */}
                     {detailsItem?.type === 'task' && relatedSubtasks.length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                         <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                           <h4 className="text-base font-semibold text-gray-700">Subtareas ({relatedSubtasks.length})</h4>
                         </div>
                         <div className="overflow-x-auto">
                           <table className="w-full table-fixed divide-y divide-gray-200">
                             <thead className="bg-gray-100">
                               <tr>
                                 <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-2/5">Título</th>
                                 <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">Estado</th>
                                 {taskDetails.is_sequential && (
                                   <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-[50px]">Orden</th>
                                 )}
                                 <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">Asignado a</th>
                                 <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">Duración</th>
                               </tr>
                             </thead>
                             <tbody className="bg-white divide-y divide-gray-200">
                               {relatedSubtasks
                                 .sort((a, b) => taskDetails.is_sequential ? (a.sequence_order || 0) - (b.sequence_order || 0) : 0)
                                 .map((subtask) => (
                                   <tr
                                     key={subtask.id}
                                     className="hover:bg-gray-50 cursor-pointer transition-colors"
                                     onClick={() => handleViewTaskDetails(subtask.id, 'subtask')} // Allow drilling down
                                     title={`Ver detalles de ${subtask.title}`}
                                   >
                                     <td className="px-4 py-3">
                                       <div className="text-sm font-medium text-gray-900 line-clamp-5" title={subtask.title}>{subtask.title}</div>
                                        {subtask.status === 'returned' && (
                                          <span className="text-xs text-orange-600">(Devuelta)</span>
                                        )}
                                     </td>
                                     <td className="px-4 py-3">
                                       <TaskStatusDisplay status={subtask.status} />
                                     </td>
                                     {taskDetails.is_sequential && (
                                       <td className="px-4 py-3 text-center text-sm text-gray-500">
                                         {subtask.sequence_order ?? '-'}
                                       </td>
                                     )}
                                     <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                       {users.find(u => u.id === subtask.assigned_to)?.name || <span className="italic">No asignada</span>}
                                     </td>
                                     <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                                       {subtask.estimated_duration} min
                                     </td>
                                   </tr>
                                 ))}
                             </tbody>
                           </table>
                         </div>
                       </div>
                    )}
                  </div>

                  {/* Columna Lateral (Metadatos y Secuencia) */}
                  <div className="lg:col-span-1 space-y-6">
                    {/* Metadata Card */}
                    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                       <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                         <h4 className="text-base font-semibold text-gray-700">Información General</h4>
                       </div>
                       <div className="p-4 space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600">Estado:</span>
                          <TaskStatusDisplay status={taskDetails.status} />
                        </div>
                        {detailsItem?.type === 'subtask' && (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-600">Asignada a:</span>
                              <span className="font-medium text-gray-800">
                                {users.find(u => u.id === taskDetails.assigned_to)?.name || <span className="italic">No asignada</span>}
                              </span>
                            </div>
                            <div className="border-t border-gray-100 pt-2">
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Cambiar responsable:
                              </label>
                              <div className="flex gap-2">
                                <select
                                  value={newAssignee || taskDetails.assigned_to || ''}
                                  onChange={(e) => setNewAssignee(e.target.value)}
                                  className="flex-1 text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  disabled={isUpdatingAssignee}
                                >
                                  <option value="">Seleccionar usuario...</option>
                                  {users.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.name || u.email}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => {
                                    const assigneeToUse = newAssignee || taskDetails.assigned_to;
                                    if (assigneeToUse && assigneeToUse !== taskDetails.assigned_to) {
                                      handleUpdateAssignee(taskDetails.id, true, assigneeToUse);
                                    } else if (!assigneeToUse) {
                                      toast.error('Por favor selecciona un usuario');
                                    }
                                  }}
                                  disabled={isUpdatingAssignee || (!newAssignee && taskDetails.assigned_to) || (newAssignee === taskDetails.assigned_to)}
                                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                  {isUpdatingAssignee ? 'Guardando...' : 'Cambiar'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                        {detailsItem?.type === 'task' && taskDetails.assigned_users && taskDetails.assigned_users.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-600">Asignada a:</span>
                              <span className="font-medium text-gray-800">
                                {users.find(u => u.id === taskDetails.assigned_users[0])?.name || <span className="italic">No asignada</span>}
                                {taskDetails.assigned_users.length > 1 && (
                                  <span className="text-xs text-gray-500 ml-1">
                                    (+{taskDetails.assigned_users.length - 1} más)
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="border-t border-gray-100 pt-2">
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Cambiar responsable:
                              </label>
                              <div className="flex gap-2">
                                <select
                                  value={newAssignee || taskDetails.assigned_users[0] || ''}
                                  onChange={(e) => setNewAssignee(e.target.value)}
                                  className="flex-1 text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  disabled={isUpdatingAssignee}
                                >
                                  <option value="">Seleccionar usuario...</option>
                                  {users.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.name || u.email}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => {
                                    const assigneeToUse = newAssignee || taskDetails.assigned_users[0];
                                    if (assigneeToUse && assigneeToUse !== taskDetails.assigned_users[0]) {
                                      handleUpdateAssignee(taskDetails.id, false, assigneeToUse);
                                    } else if (!assigneeToUse) {
                                      toast.error('Por favor selecciona un usuario');
                                    }
                                  }}
                                  disabled={isUpdatingAssignee || (!newAssignee && taskDetails.assigned_users[0]) || (newAssignee === taskDetails.assigned_users[0])}
                                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                  {isUpdatingAssignee ? 'Guardando...' : 'Cambiar'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                         <div className="flex justify-between text-sm">
                           <span className="text-gray-600">Duración estimada:</span>
                           <span className="font-medium text-gray-800">{taskDetails.estimated_duration} min</span>
                         </div>
                         {getItemDetails(taskDetails).realDuration && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Duración real:</span>
                              <span className="font-medium text-indigo-600 flex items-center">
                                {getItemDetails(taskDetails).realDuration} min
                                {getItemDetails(taskDetails).timeBreakdown && getItemDetails(taskDetails).timeBreakdown!.rework.length > 0 && (
                                  <span className="ml-1 text-orange-600" title="Incluye retrabajo">🔄</span>
                                )}
                              </span>
                            </div>
                            {getItemDetails(taskDetails).timeBreakdown && getItemDetails(taskDetails).timeBreakdown!.rework.length > 0 && (
                              <div className="bg-orange-50 border border-orange-200 rounded-md p-2 mt-1">
                                <div className="text-xs text-orange-800 space-y-1">
                                  <div className="flex justify-between">
                                    <span>Tiempo inicial:</span>
                                    <span className="font-medium">{getItemDetails(taskDetails).timeBreakdown!.initial} min</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Tiempo de retrabajo:</span>
                                    <span className="font-medium">{getItemDetails(taskDetails).timeBreakdown!.rework.reduce((sum, r) => sum + r.tiempo, 0)} min</span>
                                  </div>
                                  {getItemDetails(taskDetails).timeBreakdown!.rework.map((rework, index) => (
                                    <div key={index} className="ml-2 text-xs text-orange-700">
                                      • {rework.tiempo} min ({new Date(rework.fecha_devolucion).toLocaleDateString()})
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                         )}
                         {taskDetails.start_date && (
                           <div className="flex justify-between text-sm">
                             <span className="text-gray-600">Fecha de inicio:</span>
                             <span className="font-medium text-gray-800">{new Date(taskDetails.start_date).toLocaleDateString()}</span>
                           </div>
                         )}
                         {taskDetails.deadline && (
                           <div className="flex justify-between text-sm">
                             <span className="text-gray-600">Fecha límite:</span>
                             <span className="font-medium text-gray-800">{new Date(taskDetails.deadline).toLocaleDateString()}</span>
                           </div>
                         )}
                          {detailsItem?.type === 'task' && taskDetails.project_id && (
                           <div className="flex justify-between text-sm">
                             <span className="text-gray-600">Proyecto:</span>
                             <span className="font-medium text-gray-800">
                               {projects.find(p => p.id === taskDetails.project_id)?.name || 'N/A'}
                             </span>
                           </div>
                         )}
                         {detailsItem?.type === 'task' && (
                           <div className="flex justify-between text-sm">
                             <span className="text-gray-600">Secuencial:</span>
                             <span className="font-medium text-gray-800">{taskDetails.is_sequential ? 'Sí' : 'No'}</span>
                           </div>
                         )}
                         <div className="border-t border-gray-100 pt-3 mt-3 space-y-2">
                          {taskDetails.created_at && (
                             <div className="flex justify-between text-xs text-gray-500">
                               <span>Creada el:</span>
                               <span>{new Date(taskDetails.created_at).toLocaleString()}</span>
                             </div>
                           )}
                           {taskDetails.created_by && (
                             <div className="flex justify-between text-xs text-gray-500">
                               <span>Creada por:</span>
                               <span>{users.find(u => u.id === taskDetails.created_by)?.name || 'Usuario'}</span>
                             </div>
                           )}
                         </div>
                       </div>
                     </div>

                    {/* Sequence Card (if applicable) */}
                    {detailsItem?.type === 'subtask' && taskDetails.parent_task?.is_sequential && (
                      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                          <h4 className="text-base font-semibold text-gray-700">Secuencia de Tarea</h4>
                        </div>
                        <div className="p-4 space-y-3">
                           {previousSubtask ? (
                            <div className="p-3 bg-white rounded border border-gray-200 hover:border-gray-300 transition-colors">
                              <div className="text-xs text-gray-500 mb-1">← Anterior:</div>
                              <div className="text-sm font-medium text-gray-800">{previousSubtask.title}</div>
                              <div className="text-xs mt-1 flex justify-between items-center">
                                 <TaskStatusDisplay status={previousSubtask.status} />
                                 <span className="text-gray-500 truncate max-w-[100px]" title={users.find(u => u.id === previousSubtask.assigned_to)?.name || 'No asignada'}>
                                   👤 {users.find(u => u.id === previousSubtask.assigned_to)?.name || 'No asignada'}
                                 </span>
                                 <span className="text-gray-400">#{previousSubtask.sequence_order}</span>
                              </div>
                            </div>
                          ) : (
                             <div className="p-3 bg-gray-50 rounded border border-dashed border-gray-200 text-gray-500 text-sm text-center">
                              Primera subtarea de la secuencia
                             </div>
                          )}

                          {/* Current Subtask in Sequence */}
                          <div className="p-3 bg-indigo-50 rounded border border-indigo-200 ring-1 ring-indigo-100">
                             <div className="text-xs text-indigo-600 mb-1 font-medium">Actual:</div>
                             <div className="text-sm font-medium text-indigo-900">{taskDetails.title}</div>
                             <div className="text-xs mt-1 flex justify-between items-center">
                               <TaskStatusDisplay status={taskDetails.status} />
                               <span className="text-indigo-700 truncate max-w-[100px]" title={users.find(u => u.id === taskDetails.assigned_to)?.name || 'No asignada'}>
                                 👤 {users.find(u => u.id === taskDetails.assigned_to)?.name || 'No asignada'}
                               </span>
                               <span className="text-indigo-500 font-medium">#{taskDetails.sequence_order}</span>
                             </div>
                           </div>

                           {nextSubtask ? (
                             <div className="p-3 bg-white rounded border border-gray-200 hover:border-gray-300 transition-colors">
                               <div className="text-xs text-gray-500 mb-1">→ Siguiente:</div>
                               <div className="text-sm font-medium text-gray-800">{nextSubtask.title}</div>
                               <div className="text-xs mt-1 flex justify-between items-center">
                                 <TaskStatusDisplay status={nextSubtask.status} />
                                  <span className="text-gray-500 truncate max-w-[100px]" title={users.find(u => u.id === nextSubtask.assigned_to)?.name || 'No asignada'}>
                                     👤 {users.find(u => u.id === nextSubtask.assigned_to)?.name || 'No asignada'}
                                  </span>
                                  <span className="text-gray-400">#{nextSubtask.sequence_order}</span>
                               </div>
                             </div>
                           ) : (
                             <div className="p-3 bg-gray-50 rounded border border-dashed border-gray-200 text-gray-500 text-sm text-center">
                               Última subtarea de la secuencia
                             </div>
                           )}
                         </div>
                       </div>
                     )}
                  </div>
                </div>
              ) : (
                 <div className="text-center text-gray-500 py-10">
                   No se pudieron cargar los detalles de la tarea.
                 </div>
              )}
            </div>

             {/* Modal Footer */}
             <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-4 flex justify-end">
               <button
                 onClick={() => {
                   setShowTaskDetailsModal(false);
                   setTaskDetails(null);
                   setRelatedSubtasks([]);
                   setPreviousSubtask(null);
                   setNextSubtask(null);
                   setDeliveryComments('');
                   setDetailsItem(null); // Reset details item
                   setNewAssignee(''); // Limpiar el selector de responsable
                 }}
                 className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors text-sm font-medium"
               >
                 Cerrar
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación para desbloquear */}
      {showUnblockModal && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">
                  Confirmar Desbloqueo
                </h3>
              </div>
            </div>
            
                         <div className="mb-4">
               <p className="text-sm text-gray-600">
                 ¿Estás seguro de que quieres desbloquear esta {selectedItem.type === 'subtask' ? 'subtarea' : 'tarea'}? 
                 Una vez desbloqueada, volverá a la lista de tareas pendientes para que el usuario pueda reasignársela.
               </p>
             </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowUnblockModal(false);
                  setSelectedItem(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Cancelar
              </button>
                             <button
                 onClick={() => {
                   handleStatusChange(selectedItem.id, 'pending', selectedItem.type === 'subtask');
                   setShowUnblockModal(false);
                   setSelectedItem(null);
                 }}
                 className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
               >
                 Confirmar Desbloqueo
               </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Management; 