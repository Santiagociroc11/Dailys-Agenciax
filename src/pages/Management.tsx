import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Clock, Users, Filter, X, ChevronDown, ChevronUp, FolderOpen, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import toast, { Toaster } from 'react-hot-toast';

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

// Define the column statuses
const columns = [
  { id: 'pending', name: 'POR ASIGNAR AL DIA' },
  { id: 'assigned', name: 'ASIGNADA' },
  { id: 'blocked', name: 'BLOQUEADA' },
  { id: 'completed', name: 'COMPLETADA' },
  { id: 'in_review', name: 'EN REVISIÓN' },
  { id: 'returned', name: 'DEVUELTA' },
  { id: 'approved', name: 'COMPLETADA Y REVISADA' }
];

function Management() {
  const { isAdmin, user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [groupByProject, setGroupByProject] = useState(true);
  const [groupByPriority, setGroupByPriority] = useState(false);
  const [groupByAssignee, setGroupByAssignee] = useState(false);
  const [groupByDeadline, setGroupByDeadline] = useState(false);
  
  // Estados para los modales
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showFeedbackDetailsModal, setShowFeedbackDetailsModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<{id: string, type: 'task' | 'subtask', status: string} | null>(null);
  const [targetStatus, setTargetStatus] = useState<string>('');
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [feedbackDetails, setFeedbackDetails] = useState<TaskFeedback | null>(null);
  const [showTaskDetailsModal, setShowTaskDetailsModal] = useState(false);
  const [detailsItem, setDetailsItem] = useState<{id: string, type: 'task' | 'subtask'} | null>(null);
  const [taskDetails, setTaskDetails] = useState<any>(null);
  const [relatedSubtasks, setRelatedSubtasks] = useState<Subtask[]>([]);
  const [previousSubtask, setPreviousSubtask] = useState<Subtask | null>(null);
  const [nextSubtask, setNextSubtask] = useState<Subtask | null>(null);
  const [deliveryComments, setDeliveryComments] = useState<string>('');

  // Agregar estos estados nuevos después de los estados existentes
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchProjects();
    fetchUsers();
    fetchData();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedProject, selectedPriority, selectedAssignee]);

  useEffect(() => {
    // Solo configurar el intervalo si autoRefresh está activado
    if (!autoRefresh) return;
    
    const refreshInterval = setInterval(() => {
      console.log('Auto-refrescando datos del tablero Kanban...');
      fetchData();
    }, 10000); // 10000 ms = 10 segundos
    
    // Limpiar el intervalo cuando el componente se desmonte o autoRefresh cambie
    return () => clearInterval(refreshInterval);
  }, [autoRefresh]);

  async function fetchProjects() {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name');

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
        .select('id, email');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    }
  }

  async function fetchData() {
    if (refreshing) return; // Evitar múltiples llamadas simultáneas
    
    setRefreshing(true);
    try {
      // Fetch tasks with filter
      let query = supabase.from('tasks').select('*');
      
      if (selectedProject) {
        query = query.eq('project_id', selectedProject);
      }
      
      if (selectedPriority) {
        query = query.eq('priority', selectedPriority);
      }
      
      const { data: tasksData, error: tasksError } = await query;
      
      if (tasksError) throw tasksError;
      
      // Fetch subtasks
      let subtasksQuery = supabase.from('subtasks').select('*');
      
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
      'blocked': ['in_review'],
      'in_review': ['returned', 'approved']
    };
    
    // Verificar si la transición está permitida
    if (!allowedTransitions[currentStatus as keyof typeof allowedTransitions]?.includes(newStatus)) {
      toast.error(`No se puede cambiar de "${currentStatus}" a "${newStatus}"`);
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
    } else if (newStatus === 'in_review') {
      // Para in_review no necesitamos feedback, actualizamos directamente
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
    try {
      const table = isSubtask ? 'subtasks' : 'tasks';
      const updateData: any = additionalData || { status: newStatus };
      
      // Si hay datos de feedback y no vienen en additionalData, añadirlos
      if (feedbackData && !additionalData) {
        updateData.feedback = feedbackData;
      }
      
      // Actualizar primero la UI localmente (optimistic update)
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
      
      // Luego actualizar en el servidor
      const { error } = await supabase
        .from(table)
        .update(updateData)
        .eq('id', itemId);
      
      if (error) {
        // Si hay error, revertir la actualización local
        toast.error('Error al actualizar el estado');
        console.error('Error al actualizar estado:', error);
        
        // Recargar datos para asegurar consistencia
        fetchData();
        return;
      }
      
      // Mostrar mensaje de éxito si todo fue bien
      toast.success(`Estado actualizado a "${newStatus}" correctamente`);
      
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
        .eq('task_id', itemId)
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
      return assignee ? assignee.email : 'Usuario Desconocido';
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
                              className={`bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 border-l-4 ${
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
                                    <FolderOpen className="w-3 h-3 mr-1" />
                                    {parentTask.title}
                                  </span>
                                </div>
                              )}
                              <div className="flex justify-between">
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
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                  parentTask?.priority === 'high' ? 'bg-red-100 text-red-800' :
                                  parentTask?.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-green-100 text-green-800'
                                }`}>
                                  {parentTask?.priority === 'high' ? 'Alta' :
                                   parentTask?.priority === 'medium' ? 'Media' : 'Baja'}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 mt-3 flex flex-wrap gap-2">
                                <div className="flex items-center bg-gray-50 rounded px-2 py-1">
                                  <Clock className="w-3 h-3 mr-1" />
                                  <span>{subtask.estimated_duration} min</span>
                                </div>
                                {subtask.deadline && (
                                  <div className="flex items-center bg-gray-50 rounded px-2 py-1">
                                    <Calendar className="w-3 h-3 mr-1" />
                                    <span>{new Date(subtask.deadline).toLocaleDateString()}</span>
                                  </div>
                                )}
                                <div className="flex items-center bg-gray-50 rounded px-2 py-1">
                                  <Users className="w-3 h-3 mr-1" />
                                  <span className="truncate max-w-[120px]">
                                    {users.find(u => u.id === subtask.assigned_to)?.email || 'No asignado'}
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
                                <div className="mt-3 flex flex-wrap gap-2 border-t pt-2">
                                  <button
                                    className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-md flex items-center"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStatusChange(subtask.id, 'in_review', true);
                                    }}
                                  >
                                    <ArrowRight className="w-3 h-3 mr-1" />
                                    En revisión
                                  </button>
                                </div>
                              ) : subtask.status === 'in_review' ? (
                                <div className="mt-3 flex flex-wrap gap-2 border-t pt-2">
                                  <button
                                    className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-md flex items-center"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStatusChange(subtask.id, 'returned', true);
                                    }}
                                  >
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    Devolver
                                  </button>
                                  <button
                                    className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-md flex items-center"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStatusChange(subtask.id, 'approved', true);
                                    }}
                                  >
                                    <CheckCircle className="w-3 h-3 mr-1" />
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
                            className={`bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 border-l-4 ${
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
                            <div className="flex justify-between items-start">
                              <h5 className="font-medium text-gray-800">
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
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                task.priority === 'high' ? 'bg-red-100 text-red-800' :
                                task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {task.priority === 'high' ? 'Alta' :
                                  task.priority === 'medium' ? 'Media' : 'Baja'}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-3 flex flex-wrap gap-2">
                              <div className="flex items-center bg-gray-50 rounded px-2 py-1">
                                <Clock className="w-3 h-3 mr-1" />
                                <span>{task.estimated_duration} min</span>
                              </div>
                              <div className="flex items-center bg-gray-50 rounded px-2 py-1">
                                <Calendar className="w-3 h-3 mr-1" />
                                <span>{new Date(task.deadline).toLocaleDateString()}</span>
                              </div>
                              {task.project_id && (
                                <div className="flex items-center bg-gray-50 rounded px-2 py-1">
                                  <FolderOpen className="w-3 h-3 mr-1" />
                                  <span className="truncate max-w-[120px]">
                                    {projects.find(p => p.id === task.project_id)?.name || 'Proyecto'}
                                  </span>
                                </div>
                              )}
                            </div>
                            {task.status === 'completed' || task.status === 'blocked' ? (
                              <div className="mt-3 flex flex-wrap gap-2 border-t pt-2">
                                <button
                                  className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-md flex items-center"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(task.id, 'in_review', false);
                                  }}
                                >
                                  <ArrowRight className="w-3 h-3 mr-1" />
                                  En revisión
                                </button>
                              </div>
                            ) : task.status === 'in_review' ? (
                              <div className="mt-3 flex flex-wrap gap-2 border-t pt-2">
                                <button
                                  className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-md flex items-center"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(task.id, 'returned', false);
                                  }}
                                >
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Devolver
                                </button>
                                <button
                                  className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-md flex items-center"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(task.id, 'approved', false);
                                  }}
                                >
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Aprobar
                                </button>
                              </div>
                            ) : null}
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

  async function handleViewTaskDetails(itemId: string, itemType: 'task' | 'subtask') {
    try {
      setShowTaskDetailsModal(true);
      setDetailsItem({ id: itemId, type: itemType });
      
      // Buscar el elemento en los estados locales primero
      let item;
      let parentTask = null;
      
      if (itemType === 'subtask') {
        item = subtasks.find(s => s.id === itemId);
        
        if (item && item.task_id) {
          // Buscar la tarea padre
          parentTask = tasks.find(t => t.id === item.task_id);
          
          // Si la tarea es secuencial, buscar las subtareas anterior y siguiente
          if (parentTask && parentTask.is_sequential) {
            const taskSubtasks = subtasks
              .filter(s => s.task_id === item.task_id)
              .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
            
            const currentIndex = taskSubtasks.findIndex(s => s.id === itemId);
            
            if (currentIndex > 0) {
              setPreviousSubtask(taskSubtasks[currentIndex - 1]);
            } else {
              setPreviousSubtask(null);
            }
            
            if (currentIndex < taskSubtasks.length - 1) {
              setNextSubtask(taskSubtasks[currentIndex + 1]);
            } else {
              setNextSubtask(null);
            }
          }
        }
      } else {
        item = tasks.find(t => t.id === itemId);
        
        // Buscar subtareas relacionadas
        if (item) {
          const relatedItems = subtasks.filter(s => s.task_id === itemId);
          setRelatedSubtasks(relatedItems);
        }
      }
      
      if (!item) {
        // Si no se encuentra en el estado local, buscar en la base de datos
        const table = itemType === 'subtask' ? 'subtasks' : 'tasks';
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq('id', itemId)
          .single();
        
        if (error) {
          console.error(`Error al obtener detalles de ${itemType}:`, error);
          return;
        }
        
        item = data;
        
        // Buscar información adicional
        if (itemType === 'subtask' && item) {
          const { data: taskData } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', item.task_id)
            .single();
          
          parentTask = taskData;
          
          // Si la tarea es secuencial, buscar las subtareas anterior y siguiente
          if (taskData && taskData.is_sequential) {
            const { data: seqSubtasks } = await supabase
              .from('subtasks')
              .select('*')
              .eq('task_id', item.task_id)
              .order('sequence_order', { ascending: true });
            
            if (seqSubtasks) {
              const currentIndex = seqSubtasks.findIndex(s => s.id === itemId);
              
              if (currentIndex > 0) {
                setPreviousSubtask(seqSubtasks[currentIndex - 1]);
              } else {
                setPreviousSubtask(null);
              }
              
              if (currentIndex < seqSubtasks.length - 1) {
                setNextSubtask(seqSubtasks[currentIndex + 1]);
              } else {
                setNextSubtask(null);
              }
            }
          }
        } else if (item) {
          // Obtener subtareas relacionadas para tareas
          const { data: relatedItems } = await supabase
            .from('subtasks')
            .select('*')
            .eq('task_id', itemId);
          
          setRelatedSubtasks(relatedItems || []);
        }
      }
      
      // Buscar comentarios de entrega si está completada
      if (item && (item.status === 'completed' || item.status === 'in_review' || 
          item.status === 'returned' || item.status === 'approved')) {
        const table = itemType === 'subtask' ? 'task_work_assignments' : 'task_work_assignments';
        const { data } = await supabase
          .from(table)
          .select('notes')
          .eq('task_id', itemType === 'subtask' ? itemId : itemId)
          .eq('task_type', itemType)
          .single();
        
        if (data && data.notes) {
          let deliveryNote = '';
          if (typeof data.notes === 'string') {
            try {
              const notesObj = JSON.parse(data.notes);
              deliveryNote = notesObj.entregables || '';
            } catch (e) {
              deliveryNote = data.notes;
            }
          } else if (typeof data.notes === 'object') {
            deliveryNote = data.notes.entregables || '';
          }
          
          setDeliveryComments(deliveryNote);
        } else {
          setDeliveryComments('');
        }
      }
      
      setTaskDetails({ ...item, parentTask });
      
    } catch (error) {
      console.error('Error al obtener detalles:', error);
      toast.error('Error al cargar los detalles');
    }
  }

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
        <div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-md flex items-center"
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
                      <option key={user.id} value={user.id}>{user.email}</option>
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
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <div 
            className="h-full"
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              
              try {
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                const dropColumn = (e.target as Element).closest('[data-column-id]');
                
                if (dropColumn) {
                  const newStatus = dropColumn.getAttribute('data-column-id');
                  if (newStatus) {
                    // En vez de llamar directamente a handleStatusChange, que valide primero
                    // el estado actual del elemento y si es una transición válida
                    const isSubtask = data.type === 'subtask';
                    const currentItem = isSubtask 
                      ? subtasks.find(s => s.id === data.id)
                      : tasks.find(t => t.id === data.id);
                      
                    if (!currentItem) return;
                    
                    const currentStatus = currentItem.status;
                    
                    // Las mismas validaciones que en handleStatusChange
                    const allowedTransitions: Record<string, string[]> = {
                      'completed': ['in_review'],
                      'blocked': ['in_review'],
                      'in_review': ['returned', 'approved']
                    };
                    
                    if (!allowedTransitions[currentStatus as keyof typeof allowedTransitions]?.includes(newStatus)) {
                      toast.error(`No se puede cambiar de "${currentStatus}" a "${newStatus}"`);
                      return;
                    }
                    
                    // Ahora sí podemos llamar a handleStatusChange
                    handleStatusChange(data.id, newStatus, isSubtask);
                  }
                }
              } catch (error) {
                console.error('Error al procesar el drop:', error);
              }
            }}
          >
            {renderKanbanBoard()}
          </div>
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

      {/* Toaster para notificaciones */}
      <Toaster position="top-right" />

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

      {/* Modal de detalles de tarea */}
      {showTaskDetailsModal && taskDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <div className="flex items-center">
                  <h3 className="text-xl font-semibold">
                    {detailsItem?.type === 'subtask' ? '📋 Subtarea:' : '📋 Tarea:'}
                  </h3>
                  <span className="ml-2 text-2xl font-medium">{taskDetails.title}</span>
                  <span className={`ml-3 px-3 py-1 text-sm rounded-full ${
                    taskDetails.priority === 'high' ? 'bg-red-100 text-red-800' :
                    taskDetails.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {taskDetails.priority === 'high' ? 'Alta' :
                     taskDetails.priority === 'medium' ? 'Media' : 'Baja'}
                  </span>
                </div>
                
                {detailsItem?.type === 'subtask' && taskDetails.parentTask && (
                  <div className="text-sm text-indigo-600 flex items-center mt-1">
                    <FolderOpen className="w-4 h-4 mr-1" />
                    <span>Parte de: {taskDetails.parentTask.title}</span>
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
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {/* Grid de detalles */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="col-span-2">
                <div className="space-y-4">
                  {/* Descripción */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Descripción:</h4>
                    <div className="text-gray-800 whitespace-pre-wrap">
                      {taskDetails.description || "Sin descripción disponible"}
                    </div>
                  </div>
                  
                  {/* Comentarios de entrega */}
                  {deliveryComments && (
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <h4 className="text-sm font-medium text-green-800 mb-2">
                        <CheckCircle className="w-4 h-4 inline mr-1" />
                        Comentarios de entrega:
                      </h4>
                      <div className="text-gray-800 whitespace-pre-wrap">
                        {deliveryComments}
                      </div>
                    </div>
                  )}
                  
                  {/* Retroalimentación de devolución */}
                  {taskDetails.status === 'returned' && taskDetails.feedback && (
                    <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                      <h4 className="text-sm font-medium text-orange-800 mb-2">
                        <AlertTriangle className="w-4 h-4 inline mr-1" />
                        Retroalimentación de devolución:
                      </h4>
                      <div className="text-gray-800 whitespace-pre-wrap">
                        {taskDetails.feedback.feedback || "Sin retroalimentación específica"}
                      </div>
                      {taskDetails.feedback.reviewed_at && (
                        <div className="text-xs text-gray-500 mt-2">
                          Devuelta el: {new Date(taskDetails.feedback.reviewed_at).toLocaleString()}
                          {taskDetails.feedback.reviewed_by && (
                            <span> por {users.find(u => u.id === taskDetails.feedback.reviewed_by)?.email || 'Usuario'}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Retroalimentación de aprobación */}
                  {taskDetails.status === 'approved' && taskDetails.feedback && (
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <h4 className="text-sm font-medium text-green-800 mb-2">
                        <CheckCircle className="w-4 h-4 inline mr-1" />
                        Retroalimentación de aprobación:
                      </h4>
                      <div className="text-gray-800 whitespace-pre-wrap mb-2">
                        {taskDetails.feedback.feedback || "Sin retroalimentación específica"}
                      </div>
                      {taskDetails.feedback.rating && (
                        <div className="flex items-center">
                          <span className="text-sm font-medium mr-2">Calificación:</span>
                          <div className="flex items-center">
                            {[1, 2, 3, 4, 5].map((value) => (
                              <span
                                key={value}
                                className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                  (taskDetails.feedback.rating || 0) >= value 
                                    ? 'bg-yellow-400 text-yellow-800' 
                                    : 'bg-gray-100 text-gray-400'
                                } mr-1`}
                              >
                                {value}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {taskDetails.feedback.reviewed_at && (
                        <div className="text-xs text-gray-500 mt-2">
                          Aprobada el: {new Date(taskDetails.feedback.reviewed_at).toLocaleString()}
                          {taskDetails.feedback.reviewed_by && (
                            <span> por {users.find(u => u.id === taskDetails.feedback.reviewed_by)?.email || 'Usuario'}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <div className="space-y-4">
                  {/* Meta información */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Información General:</h4>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Estado:</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          taskDetails.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                          taskDetails.status === 'in_review' ? 'bg-indigo-100 text-indigo-800' :
                          taskDetails.status === 'returned' ? 'bg-orange-100 text-orange-800' :
                          taskDetails.status === 'approved' ? 'bg-green-100 text-green-800' :
                          taskDetails.status === 'blocked' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {taskDetails.status === 'completed' ? 'Completada' :
                           taskDetails.status === 'in_review' ? 'En revisión' :
                           taskDetails.status === 'returned' ? 'Devuelta' :
                           taskDetails.status === 'approved' ? 'Aprobada' :
                           taskDetails.status === 'blocked' ? 'Bloqueada' :
                           taskDetails.status === 'pending' ? 'Pendiente' : 
                           taskDetails.status === 'in_progress' ? 'En progreso' : 
                           taskDetails.status}
                        </span>
                      </div>
                      
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Duración estimada:</span>
                        <span className="font-medium">{taskDetails.estimated_duration} min</span>
                      </div>
                      
                      {taskDetails.start_date && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Fecha de inicio:</span>
                          <span className="font-medium">{new Date(taskDetails.start_date).toLocaleDateString()}</span>
                        </div>
                      )}
                      
                      {taskDetails.deadline && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Fecha límite:</span>
                          <span className="font-medium">{new Date(taskDetails.deadline).toLocaleDateString()}</span>
                        </div>
                      )}
                      
                      {detailsItem?.type === 'subtask' && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Asignada a:</span>
                          <span className="font-medium">
                            {users.find(u => u.id === taskDetails.assigned_to)?.email || 'No asignada'}
                          </span>
                        </div>
                      )}
                      
                      {detailsItem?.type === 'task' && taskDetails.parentTask && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Secuencial:</span>
                          <span className="font-medium">{taskDetails.is_sequential ? 'Sí' : 'No'}</span>
                        </div>
                      )}
                      
                      {taskDetails.created_at && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Creada el:</span>
                          <span className="font-medium">{new Date(taskDetails.created_at).toLocaleDateString()}</span>
                        </div>
                      )}
                      
                      {taskDetails.created_by && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Creada por:</span>
                          <span className="font-medium">
                            {users.find(u => u.id === taskDetails.created_by)?.email || 'Usuario'}
                          </span>
                        </div>
                      )}
                      
                      {detailsItem?.type === 'task' && taskDetails.project_id && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Proyecto:</span>
                          <span className="font-medium">
                            {projects.find(p => p.id === taskDetails.project_id)?.name || 'Proyecto'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Información de secuencialidad */}
                  {detailsItem?.type === 'subtask' && taskDetails.parentTask?.is_sequential && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Secuencia:</h4>
                      
                      <div className="space-y-3">
                        {previousSubtask ? (
                          <div className="p-2 bg-white rounded border border-gray-200">
                            <div className="text-xs text-gray-500 mb-1">Anterior:</div>
                            <div className="text-sm font-medium">{previousSubtask.title}</div>
                            <div className="text-xs mt-1 flex justify-between">
                              <span className={`px-2 py-0.5 rounded-full ${
                                previousSubtask.status === 'completed' || previousSubtask.status === 'approved' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {previousSubtask.status === 'completed' || previousSubtask.status === 'approved' 
                                  ? 'Completada' 
                                  : 'Pendiente'}
                              </span>
                              <span className="text-gray-500">
                                {previousSubtask.sequence_order !== null 
                                  ? `Orden: ${previousSubtask.sequence_order}` 
                                  : ''}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="p-2 bg-white rounded border border-dashed border-gray-200 text-gray-500 text-sm">
                            Esta es la primera subtarea de la secuencia
                          </div>
                        )}
                        
                        <div className="p-2 bg-indigo-50 rounded border border-indigo-200">
                          <div className="text-xs text-indigo-600 mb-1">Actual:</div>
                          <div className="text-sm font-medium">{taskDetails.title}</div>
                          <div className="text-xs mt-1 flex justify-between">
                            <span className={`px-2 py-0.5 rounded-full ${
                              taskDetails.status === 'completed' || taskDetails.status === 'approved' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {taskDetails.status === 'completed' || taskDetails.status === 'approved' 
                                ? 'Completada' 
                                : taskDetails.status === 'returned' 
                                  ? 'Devuelta' 
                                  : taskDetails.status === 'in_review' 
                                    ? 'En revisión' 
                                    : 'Pendiente'}
                            </span>
                            <span className="text-gray-500">
                              {taskDetails.sequence_order !== null 
                                ? `Orden: ${taskDetails.sequence_order}` 
                                : ''}
                            </span>
                          </div>
                        </div>
                        
                        {nextSubtask ? (
                          <div className="p-2 bg-white rounded border border-gray-200">
                            <div className="text-xs text-gray-500 mb-1">Siguiente:</div>
                            <div className="text-sm font-medium">{nextSubtask.title}</div>
                            <div className="text-xs mt-1 flex justify-between">
                              <span className={`px-2 py-0.5 rounded-full ${
                                nextSubtask.status === 'completed' || nextSubtask.status === 'approved' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {nextSubtask.status === 'completed' || nextSubtask.status === 'approved' 
                                  ? 'Completada' 
                                  : 'Pendiente'}
                              </span>
                              <span className="text-gray-500">
                                {nextSubtask.sequence_order !== null 
                                  ? `Orden: ${nextSubtask.sequence_order}` 
                                  : ''}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="p-2 bg-white rounded border border-dashed border-gray-200 text-gray-500 text-sm">
                            Esta es la última subtarea de la secuencia
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Lista de subtareas si es una tarea principal */}
            {detailsItem?.type === 'task' && relatedSubtasks.length > 0 && (
              <div className="mt-4">
                <h4 className="text-md font-medium mb-3 text-gray-700">Subtareas ({relatedSubtasks.length}):</h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Título</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                          {taskDetails.is_sequential && (
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Orden</th>
                          )}
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asignada a</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duración</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {relatedSubtasks
                          .sort((a, b) => {
                            if (taskDetails.is_sequential) {
                              return (a.sequence_order || 0) - (b.sequence_order || 0);
                            }
                            return 0;
                          })
                          .map((subtask) => (
                            <tr 
                              key={subtask.id} 
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => handleViewTaskDetails(subtask.id, 'subtask')}
                            >
                              <td className="px-4 py-2">
                                <div className="font-medium text-gray-900">{subtask.title}</div>
                                {subtask.status === 'returned' && (
                                  <span className="ml-2 text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                                    Devuelta
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  subtask.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                                  subtask.status === 'in_review' ? 'bg-indigo-100 text-indigo-800' :
                                  subtask.status === 'returned' ? 'bg-orange-100 text-orange-800' :
                                  subtask.status === 'approved' ? 'bg-green-100 text-green-800' :
                                  subtask.status === 'blocked' ? 'bg-red-100 text-red-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {subtask.status === 'completed' ? 'Completada' :
                                   subtask.status === 'in_review' ? 'En revisión' :
                                   subtask.status === 'returned' ? 'Devuelta' :
                                   subtask.status === 'approved' ? 'Aprobada' :
                                   subtask.status === 'blocked' ? 'Bloqueada' :
                                   subtask.status === 'pending' ? 'Pendiente' : 
                                   subtask.status === 'in_progress' ? 'En progreso' : 
                                   subtask.status}
                                </span>
                              </td>
                              {taskDetails.is_sequential && (
                                <td className="px-4 py-2 text-sm text-gray-500">
                                  {subtask.sequence_order !== null ? subtask.sequence_order : '-'}
                                </td>
                              )}
                              <td className="px-4 py-2">
                                <div className="text-sm text-gray-500">
                                  {users.find(u => u.id === subtask.assigned_to)?.email || 'No asignada'}
                                </div>
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-500">
                                {subtask.estimated_duration} min
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setShowTaskDetailsModal(false);
                  setTaskDetails(null);
                  setRelatedSubtasks([]);
                  setPreviousSubtask(null);
                  setNextSubtask(null);
                  setDeliveryComments('');
                }}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
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

export default Management; 