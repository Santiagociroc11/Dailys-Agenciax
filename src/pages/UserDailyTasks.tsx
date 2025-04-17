import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface DailyTask {
  id: string;
  user_id: string;
  date: string;
  tasks: string[];
  created_at: string;
}

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
  project_name?: string;
  type?: 'task' | 'subtask';
  original_id?: string;
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
  project_id?: string;
  project_name?: string;
}

export default function UserDailyTasks() {
  const { user } = useAuth();
  const [dailyTasks, setDailyTasks] = useState<DailyTask | null>(null);
  const [taskItems, setTaskItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (user) {
      fetchTodaysDailyTasks();
    }
  }, [user]);
  
  async function fetchTodaysDailyTasks() {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Verificar si hay registro de tareas para hoy
      const { data, error } = await supabase
        .from('daily_tasks')
        .select('*')
        .eq('user_id', user?.id)
        .eq('date', today)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      if (data) {
        setDailyTasks(data);
        // Si hay tareas guardadas para hoy, buscar esas tareas específicas
        if (data.tasks && data.tasks.length > 0) {
          fetchSavedTaskDetails(data.tasks);
        } else {
          // Si no hay tareas guardadas, buscar todas las tareas relevantes para el usuario
          fetchUserAssignedTasks();
        }
      } else {
        // No hay tareas guardadas para hoy, buscar todas las tareas relevantes para el usuario
        fetchUserAssignedTasks();
      }
    } catch (error) {
      console.error('Error fetching daily tasks:', error);
      fetchUserAssignedTasks();
    }
  }
  
  // Obtener detalles de tareas guardadas
  async function fetchSavedTaskDetails(taskIds: string[]) {
    if (!taskIds || taskIds.length === 0) {
      setLoading(false);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, projects(name)')
        .in('id', taskIds)
        .not('status', 'in', '(approved)'); // Excluir tareas aprobadas
        
      if (error) throw error;
      
      const formattedTasks = (data || []).map(task => {
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          estimated_duration: task.estimated_duration,
          start_date: task.start_date,
          deadline: task.deadline,
          status: task.status,
          is_sequential: task.is_sequential,
          project_id: task.project_id,
          project_name: task.projects?.name,
          type: 'task',
          original_id: task.id
        };
      });
      
      setTaskItems(formattedTasks);
    } catch (error) {
      console.error('Error fetching task details:', error);
    } finally {
      setLoading(false);
    }
  }
  
  // Obtener todas las tareas y subtareas asignadas al usuario
  async function fetchUserAssignedTasks() {
    if (!user) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const today = new Date();
      const formattedToday = format(today, 'yyyy-MM-dd');
      
      // 1. Obtener tareas sin subtareas asignadas al usuario
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .select('*, projects(name)')
        .contains('assigned_to', [user.id])
        .lte('start_date', formattedToday) // Fecha de inicio anterior o igual a hoy
        .gte('deadline', formattedToday)   // Fecha límite posterior o igual a hoy
        .not('status', 'in', '(approved)') // Excluir tareas aprobadas
        .order('deadline', { ascending: true });
        
      if (taskError) throw taskError;
      
      // 2. Obtener subtareas asignadas al usuario
      const { data: subtaskData, error: subtaskError } = await supabase
        .from('subtasks')
        .select('*, tasks!inner(*), tasks!inner(projects(name))')
        .eq('assigned_to', user.id)
        .not('status', 'in', '(completed, approved)') // Excluir subtareas completadas y aprobadas
        .order('sequence_order', { ascending: true });
        
      if (subtaskError) throw subtaskError;
      
      // 3. Para tareas secuenciales, filtrar solo la siguiente subtarea en la secuencia
      // Agrupar subtareas por tarea_id
      const taskToSubtasks: Record<string, Subtask[]> = {};
      subtaskData?.forEach(subtask => {
        if (!taskToSubtasks[subtask.task_id]) {
          taskToSubtasks[subtask.task_id] = [];
        }
        taskToSubtasks[subtask.task_id].push({
          ...subtask,
          task_title: subtask.tasks.title,
          project_id: subtask.tasks.project_id,
          project_name: subtask.tasks.projects?.name
        });
      });
      
      // 4. Para cada tarea secuencial, encontrar la siguiente subtarea a completar
      const relevantSubtasks: Subtask[] = [];
      Object.keys(taskToSubtasks).forEach(taskId => {
        const subtasks = taskToSubtasks[taskId];
        const taskInfo = subtasks[0]?.tasks;
        
        if (taskInfo && taskInfo.is_sequential) {
          // Ordenar subtareas por secuencia
          const sortedSubtasks = [...subtasks].sort((a, b) => 
            (a.sequence_order || 0) - (b.sequence_order || 0)
          );
          
          // Encontrar la primera subtarea que no esté completada
          const nextSubtask = sortedSubtasks.find(s => 
            s.status !== 'completed' && s.status !== 'approved'
          );
          
          if (nextSubtask && nextSubtask.assigned_to === user.id) {
            relevantSubtasks.push(nextSubtask);
          }
        } else {
          // Para tareas no secuenciales, incluir todas las subtareas asignadas al usuario
          const userSubtasks = subtasks.filter(s => s.assigned_to === user.id);
          relevantSubtasks.push(...userSubtasks);
        }
      });
      
      // 5. Filtrar subtareas por rango de fecha (si tienen fecha)
      const dateFilteredSubtasks = relevantSubtasks.filter(subtask => {
        // Si no tiene fechas, lo incluimos siempre
        if (!subtask.start_date && !subtask.deadline) return true;
        
        const startDate = subtask.start_date ? parseISO(subtask.start_date) : null;
        const endDate = subtask.deadline ? parseISO(subtask.deadline) : null;
        
        // Si tiene solo fecha de inicio, verificar que ya comenzó
        if (startDate && !endDate) {
          return startDate <= today;
        }
        
        // Si tiene solo fecha límite, verificar que aún no pasó
        if (!startDate && endDate) {
          return endDate >= today;
        }
        
        // Si tiene ambas fechas, verificar que estamos en ese rango
        if (startDate && endDate) {
          return isWithinInterval(today, { start: startDate, end: endDate });
        }
        
        return true;
      });
      
      // 6. Convertir subtareas al formato de tarea para mostrarlas
      const subtasksAsTaskItems: Task[] = dateFilteredSubtasks.map(subtask => ({
        id: `subtask-${subtask.id}`,
        original_id: subtask.id,
        title: `${subtask.task_title} - ${subtask.title}`,
        description: subtask.description,
        priority: 'medium', // Las subtareas no tienen prioridad, asignamos una por defecto
        estimated_duration: subtask.estimated_duration,
        start_date: subtask.start_date || '',
        deadline: subtask.deadline || '',
        status: subtask.status,
        is_sequential: false,
        project_id: subtask.project_id || '',
        project_name: subtask.project_name,
        type: 'subtask'
      }));
      
      // 7. Convertir tareas al formato de tarea para mostrarlas
      const tasksAsTaskItems: Task[] = (taskData || []).map(task => ({
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
        project_name: task.projects?.name,
        type: 'task'
      }));
      
      // 8. Combinar y ordenar por fecha límite y prioridad
      const allTasks = [...tasksAsTaskItems, ...subtasksAsTaskItems];
      const sortedTasks = allTasks.sort((a, b) => {
        // Primero por fecha límite (más pronta primero)
        const dateA = a.deadline ? new Date(a.deadline) : new Date(9999, 11, 31);
        const dateB = b.deadline ? new Date(b.deadline) : new Date(9999, 11, 31);
        if (dateA < dateB) return -1;
        if (dateA > dateB) return 1;
        
        // Luego por prioridad
        const priorityValues = { high: 3, medium: 2, low: 1 };
        const priorityA = priorityValues[a.priority] || 0;
        const priorityB = priorityValues[b.priority] || 0;
        return priorityB - priorityA;
      });
      
      setTaskItems(sortedTasks);
    } catch (error) {
      console.error('Error fetching assigned tasks:', error);
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Mis Tareas del Día</h1>
        <p className="text-sm text-gray-600 mt-1">
          {format(new Date(), 'EEEE, dd MMMM yyyy', { locale: es })}
        </p>
      </div>
      
      {loading ? (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-800 mx-auto"></div>
          <p className="mt-2 text-gray-600">Cargando tareas...</p>
        </div>
      ) : taskItems.length > 0 ? (
        <div>
          <div className="grid grid-cols-5 gap-4 p-3 border-b border-gray-200 font-medium text-gray-700">
            <div>ACTIVIDAD</div>
            <div>DESCRIPCION</div>
            <div>PROYECTO</div>
            <div>FECHA LÍMITE</div>
            <div>DURACIÓN</div>
          </div>
          
          <div className="divide-y divide-gray-200">
            {taskItems.map((task) => (
              <div key={task.id} className="grid grid-cols-5 gap-4 py-3 items-center">
                <div className="font-medium">
                  {task.title}
                  {task.type === 'subtask' && (
                    <span className="ml-2 text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">Subtarea</span>
                  )}
                </div>
                <div className="text-sm text-gray-600 truncate">
                  {task.description || '-'}
                </div>
                <div className="text-sm text-blue-600">
                  {task.project_name || '-'}
                </div>
                <div className="text-sm">
                  {task.deadline ? format(new Date(task.deadline), 'dd/MM/yyyy') : '-'}
                </div>
                <div className="text-sm">
                  {task.estimated_duration} HORA{task.estimated_duration > 1 ? 'S' : ''}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-6 border-t pt-4">
            <p className="font-medium">Duración total estimada: 
              <span className="ml-2 font-bold">
                {taskItems.reduce((total, task) => total + task.estimated_duration, 0)} HORAS
              </span>
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-10">
          <p className="text-gray-600">No hay tareas programadas para hoy.</p>
        </div>
      )}
    </div>
  );
} 