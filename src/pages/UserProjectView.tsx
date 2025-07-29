import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { format, isWithinInterval, parseISO, differenceInDays, isBefore, isAfter, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "react-hot-toast";
import TaskStatusDisplay from "../components/TaskStatusDisplay";
import RichTextDisplay from "../components/RichTextDisplay";
import RichTextSummary from "../components/RichTextSummary";

interface Task {
   id: string;
   title: string;
   description: string | null;
   priority: "low" | "medium" | "high";
   estimated_duration: number;
   start_date: string;
   deadline: string;
   status: string;
   is_sequential: boolean;
   project_id: string;
   projectName?: string;
   assigned_users?: string[];
   type?: "task" | "subtask";
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
   unidad_original?: "minutes" | "hours";
   razon_duracion?: string;
   razon_bloqueo?: string;
   returned_feedback?: string; // Retroalimentación al devolver una tarea
   returned_at?: string; // Fecha de devolución
   returned_by?: string; // Usuario que devolvió la tarea
   // Campos para actividades personalizadas
   activity_type?: "work" | "meeting" | "daily" | "break" | "training" | "other";
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

interface WorkEvent {
   id: string;
   user_id: string;
   title: string;
   description?: string;
   date: string;
   start_time: string;
   end_time: string;
   event_type: 'meeting' | 'daily' | 'review' | 'planning' | 'training' | 'break' | 'other';
   project_id?: string;
   created_at: string;
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
            color: "text-green-600 font-medium",
         };
      }
      // Si la fecha de inicio ya pasó
      else if (isBefore(dateWithoutTime, todayWithoutTime)) {
         const daysPassed = Math.abs(diffDays);
         return {
            text: `Iniciada hace ${daysPassed} día${daysPassed !== 1 ? "s" : ""}`,
            color: "text-blue-600",
         };
      }
      // Si la fecha de inicio es en el futuro
      else {
         return {
            text: `Inicia en ${diffDays} día${diffDays !== 1 ? "s" : ""}`,
            color: "text-gray-600",
         };
      }
   }
   // Para fechas de fin
   else {
      // Si la fecha es hoy
      if (diffDays === 0) {
         return {
            text: "Vence hoy",
            color: "text-yellow-600 font-medium",
         };
      }
      // Si la fecha límite ya pasó (atrasada)
      else if (isBefore(dateWithoutTime, todayWithoutTime)) {
         const daysLate = Math.abs(diffDays);
         return {
            text: `Atrasada por ${daysLate} día${daysLate !== 1 ? "s" : ""}`,
            color: "text-red-600 font-medium",
         };
      }
      // Si vence en menos de 3 días
      else if (diffDays <= 3) {
         return {
            text: `Vence en ${diffDays} día${diffDays !== 1 ? "s" : ""}`,
            color: "text-yellow-600",
         };
      }
      // Si la fecha límite es en el futuro (más de 3 días)
      else {
         return {
            text: `Vence en ${diffDays} día${diffDays !== 1 ? "s" : ""}`,
            color: "text-gray-600",
         };
      }
   }
}

// Add this function before the main component

function SubtaskSequenceDisplay({ previousSubtask, selectedTaskDetails, nextSubtask, subtaskUsers }: { previousSubtask: Subtask | null; selectedTaskDetails: Task; nextSubtask: Subtask | null; subtaskUsers: Record<string, string> }) {
   return (
      <div>
         <div className="mb-8 grid grid-cols-3 gap-4">
            {/* Subtarea anterior */}
            <div>
               <h5 className="text-xs font-medium text-gray-500 mb-1">TAREA ANTERIOR:</h5>
               {previousSubtask ? (
                  <div>
                     <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${previousSubtask.status === "completed" ? "bg-green-500" : previousSubtask.status === "in_progress" ? "bg-yellow-500" : "bg-gray-400"}`}></div>
                        <p className="text-sm font-medium text-gray-700">{previousSubtask.title}</p>
                        <TaskStatusDisplay status={previousSubtask.status} className="text-xs px-2 py-0.5" />
                     </div>
                     {previousSubtask.assigned_to && (
                        <div className="mt-1 ml-4 text-xs text-gray-500 flex items-center">
                           <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                           </svg>
                           Asignada a: &nbsp;<span className="font-medium text-blue-600">{previousSubtask?.assigned_to ? subtaskUsers[previousSubtask.assigned_to] || "Usuario" : "No asignado"}</span>
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
               {selectedTaskDetails.type === "subtask" && selectedTaskDetails.assigned_users && selectedTaskDetails.assigned_users[0] && (
                  <div className="mt-1 ml-4 text-xs text-gray-500 flex items-center">
                     <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                     </svg>
                     Asignada a: &nbsp;<span className="font-medium text-blue-600">{selectedTaskDetails.assigned_users[0] ? subtaskUsers[selectedTaskDetails.assigned_users[0]] || "Usuario" : "No asignado"}</span>
                  </div>
               )}
            </div>

            {/* Subtarea siguiente */}
            <div>
               <h5 className="text-xs font-medium text-gray-500 mb-1">TAREA SIGUIENTE:</h5>
               {nextSubtask ? (
                  <div>
                     <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${nextSubtask.status === "completed" ? "bg-green-500" : nextSubtask.status === "in_progress" ? "bg-yellow-500" : "bg-gray-400"}`}></div>
                        <p className="text-sm font-medium text-gray-700">{nextSubtask.title}</p>
                        <TaskStatusDisplay status={nextSubtask.status} className="text-xs px-2 py-0.5" />
                     </div>
                     {nextSubtask.assigned_to && (
                        <div className="mt-1 ml-4 text-xs text-gray-500 flex items-center">
                           <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                           </svg>
                           Asignada a: &nbsp;<span className="font-medium text-blue-600">{nextSubtask?.assigned_to ? subtaskUsers[nextSubtask.assigned_to] || "Usuario" : "No asignado"}</span>
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

// Función para generar un color consistente a partir del nombre o ID del proyecto
function getProjectColor(projectName: string, projectId: string): { bg: string; text: string } {
   // Lista de combinaciones de colores predefinidas para que se vean bien
   const colorPairs = [
      { bg: "bg-blue-100", text: "text-blue-800" },
      { bg: "bg-purple-100", text: "text-purple-800" },
      { bg: "bg-green-100", text: "text-green-800" },
      { bg: "bg-pink-100", text: "text-pink-800" },
      { bg: "bg-yellow-100", text: "text-yellow-800" },
      { bg: "bg-indigo-100", text: "text-indigo-800" },
      { bg: "bg-red-100", text: "text-red-800" },
      { bg: "bg-teal-100", text: "text-teal-800" },
      { bg: "bg-orange-100", text: "text-orange-800" },
      { bg: "bg-cyan-100", text: "text-cyan-800" },
   ];

   // Usar el nombre del proyecto o el ID para generar un índice consistente
   const str = projectName || projectId || "default";
   let hash = 0;
   for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash; // Convertir a entero de 32 bits
   }

   // Asegurar que el índice sea positivo y dentro del rango
   const index = Math.abs(hash) % colorPairs.length;

   return colorPairs[index];
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
   const [returnedTaskItems, setReturnedTaskItems] = useState<Task[]>([]); // Lista para tareas devueltas
   const [blockedTaskItems, setBlockedTaskItems] = useState<Task[]>([]); // Lista para tareas bloqueadas
   const [completedTaskItems, setCompletedTaskItems] = useState<Task[]>([]);
   const [inReviewTaskItems, setInReviewTaskItems] = useState<Task[]>([]);
   const [approvedTaskItems, setApprovedTaskItems] = useState<Task[]>([]);
   const [dailyTasksIds, setDailyTasksIds] = useState<string[] | null>(null);

   // Estados para UI
   const [activeTab, setActiveTab] = useState("asignacion");
   const [activeGestionSubTab, setActiveGestionSubTab] = useState("planificar");
   const [activeBacklogSubTab, setActiveBacklogSubTab] = useState("pendientes");
   const [sortBy, setSortBy] = useState<"deadline" | "priority" | "duration">("deadline");
   const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

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

   // Estados para planificador diario
   const [selectedTasksForDay, setSelectedTasksForDay] = useState<string[]>([]);
   const [taskTimeSlots, setTaskTimeSlots] = useState<Record<string, {startTime: string; endTime: string; duration: number}>>({});
   const [todayScheduledTasks, setTodayScheduledTasks] = useState<Task[]>([]);
   const [showTimeModal, setShowTimeModal] = useState(false);
   const [currentTaskForTime, setCurrentTaskForTime] = useState<Task | null>(null);

   // Estados para modal de selección de tareas
   const [showTaskSelectorModal, setShowTaskSelectorModal] = useState(false);
   const [taskSearchQuery, setTaskSearchQuery] = useState("");
   const [taskFilterProject, setTaskFilterProject] = useState("");
   const [taskFilterPriority, setTaskFilterPriority] = useState("");
   const [taskFilterStatus, setTaskFilterStatus] = useState("");
   const [taskSortBy, setTaskSortBy] = useState<"deadline" | "priority" | "duration" | "title">("deadline");
   
   // Estados para actividad personalizada
   const [showCustomActivityForm, setShowCustomActivityForm] = useState(false);
   const [customActivity, setCustomActivity] = useState({
      title: "",
      description: "",
      estimated_duration: 30, // en minutos
      priority: "medium" as "low" | "medium" | "high",
      type: "work" as "work" | "meeting" | "daily" | "break" | "training" | "other",
      selected_project_id: "" // Proyecto seleccionado para la actividad
   });

   // Estados para vista gráfica del horario
   const [scheduleViewMode, setScheduleViewMode] = useState<"list" | "timeline" | "gantt">("list");

   // Estados para planificación temporal
   const [taskSchedules, setTaskSchedules] = useState<Record<string, { startTime: string; endTime: string; duration: number } | null>>({});
   const [showTimeScheduling, setShowTimeScheduling] = useState(false);
   const [selectedTimeSlot, setSelectedTimeSlot] = useState<{ start: number; end: number } | null>(null);
   const [schedulingTaskId, setSchedulingTaskId] = useState<string | null>(null);

   // Estados para duraciones personalizadas
   const [customDurations, setCustomDurations] = useState<Record<string, { value: number; unit: "minutes" | "hours" }>>({});
   const [showDurationInputs, setShowDurationInputs] = useState(false);

   // Estados para eventos de trabajo
   const [showEventsModal, setShowEventsModal] = useState(false);
   const [workEvents, setWorkEvents] = useState<WorkEvent[]>([]);
   const [editingEvent, setEditingEvent] = useState<WorkEvent | null>(null);
   const [loadingEvents, setLoadingEvents] = useState(false);
   
   // Estados para el formulario de eventos
   const [eventForm, setEventForm] = useState({
      title: '',
      description: '',
      event_type: 'meeting' as WorkEvent['event_type'],
      start_time: 480, // 8:00 AM en minutos
      end_time: 540,   // 9:00 AM en minutos
   });
   const [savingEvent, setSavingEvent] = useState(false);
   const [selectedReturnedTask, setSelectedReturnedTask] = useState<Task | null>(null);
   const [showUnassignConfirmModal, setShowUnassignConfirmModal] = useState(false);
   const [taskToUnassign, setTaskToUnassign] = useState<Task | null>(null);

   // Estados para detalles de tareas y subtareas
   const [selectedTaskDetails, setSelectedTaskDetails] = useState<Task | null>(null);
   const [taskForStatusUpdate, setTaskForStatusUpdate] = useState<Task | null>(null);
   const [previousSubtask, setPreviousSubtask] = useState<Subtask | null>(null);
   const [nextSubtask, setNextSubtask] = useState<Subtask | null>(null);
   const [subtaskUsers, setSubtaskUsers] = useState<Record<string, string>>({});

   // Estados para actualización de estado
   const [selectedTaskId, setSelectedTaskId] = useState<string>("");
   const [selectedStatus, setSelectedStatus] = useState<string>("completed");
   const [statusDetails, setStatusDetails] = useState("");
   const [actualDuration, setActualDuration] = useState<number>(0);
   const [durationUnit, setDurationUnit] = useState<"minutes" | "hours">("minutes");
   const [durationReason, setDurationReason] = useState("");
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

         // Primero cargar el proyecto y las tareas diarias
         if (projectId === "all") {
            setProject({ id: "all", name: "TODOS LOS PROYECTOS" });
         } else {
            fetchProject();
         }

         // Cargar tareas diarias de forma asíncrona
         const loadData = async () => {
            try {
               await fetchTodaysDailyTasks();
            } catch (error) {
               console.error("Error cargando tareas diarias:", error);
               // Si falla, asegurar que podamos continuar
               setDailyTasksIds([]);
               setLoading(false);
            }
         };
         loadData();
      }
   }, [projectId]);

   useEffect(() => {
      // Cargar tareas asignadas cuando estemos en gestión → pendientes O en backlog → en proceso
      const shouldLoadAssignedTasks = 
         (activeTab === "gestion" && (activeGestionSubTab === "pendientes" || activeGestionSubTab === "programadas")) ||
         (activeTab === "asignacion" && activeBacklogSubTab === "en_proceso");
      
      if (shouldLoadAssignedTasks) {
         // Solo cargar si no hay datos o si el loading no está activo
         if (!loadingAssigned && assignedTaskItems.length === 0 && delayedTaskItems.length === 0 && returnedTaskItems.length === 0) {
            setLoadingAssigned(true);
            fetchAssignedTasks();
         }
      }
   }, [activeTab, activeGestionSubTab, activeBacklogSubTab]);

   useEffect(() => {
      // Cargar horarios cuando estemos en la vista de horario programado
      if (activeTab === "gestion" && activeGestionSubTab === "programadas") {
         fetchTaskSchedules();
      }
   }, [activeTab, activeGestionSubTab, assignedTaskItems, delayedTaskItems]);

   useEffect(() => {
      if (projectId && dailyTasksIds !== undefined) {
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
      if (activeTab === "gestion" && ["entregadas", "en_revision", "aprobadas"].includes(activeGestionSubTab) && projectId && user) {
         fetchCompletedTasks();
      }
   }, [activeTab, activeGestionSubTab, projectId, user]);

   useEffect(() => {
      // Calcular duración de tareas seleccionadas
      const tasksTotal = selectedTasks.reduce((acc, taskId) => {
         const task = taskItems.find((t) => t.id === taskId);
         return acc + (task?.estimated_duration || 0);
      }, 0);
      
      // Calcular duración de eventos de trabajo del día
      const eventsTotal = workEvents.reduce((acc, event) => {
         const startMinutes = parseInt(event.start_time.split(':')[0]) * 60 + parseInt(event.start_time.split(':')[1]);
         const endMinutes = parseInt(event.end_time.split(':')[0]) * 60 + parseInt(event.end_time.split(':')[1]);
         const durationMinutes = endMinutes - startMinutes;
         return acc + durationMinutes;
      }, 0);
      
      // Convertir total de minutos a horas (tareas + eventos)
      const totalMinutes = tasksTotal + eventsTotal;
      const totalHours = Math.round((totalMinutes / 60) * 100) / 100;
      setTotalEstimatedDuration(totalHours);
   }, [selectedTasks, taskItems, workEvents]);

   useEffect(() => {
      // Ordenar tareas cuando cambie solo el criterio de ordenamiento
      if (taskItems.length > 0) {
         // Clonar para no mutar el estado original
         const itemsToSort = [...taskItems];

         const sortedItems = itemsToSort.sort((a, b) => {
            if (sortBy === "deadline") {
               const dateA = a.deadline ? new Date(a.deadline) : new Date(9999, 11, 31);
               const dateB = b.deadline ? new Date(b.deadline) : new Date(9999, 11, 31);
               return sortOrder === "asc" ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
            } else if (sortBy === "priority") {
               const priorityValues = { high: 3, medium: 2, low: 1 };
               const priorityA = priorityValues[a.priority] || 0;
               const priorityB = priorityValues[b.priority] || 0;
               return sortOrder === "asc" ? priorityA - priorityB : priorityB - priorityA;
            } else if (sortBy === "duration") {
               return sortOrder === "asc" ? a.estimated_duration - b.estimated_duration : b.estimated_duration - a.estimated_duration;
            }
            return 0;
         });

         // Usamos una clave de referencia para evitar un bucle infinito
         const sortedTasksString = JSON.stringify(sortedItems.map((t) => t.id));
         const currentTasksString = JSON.stringify(taskItems.map((t) => t.id));

         if (sortedTasksString !== currentTasksString) {
            setTaskItems(sortedItems);
         }
      }
   }, [sortBy, sortOrder]);

   useEffect(() => {
      // Este efecto se activa cuando cambian las tareas o el estado de filtrado
      if (!isFiltering && taskItems.length > 0 && isDataInitialized) {
         // Realizar una última comprobación para asegurar que solo mostramos las tareas que deberían estar visibles
         // Esta es una segunda capa de verificación para evitar parpadeos
         const dailyTasksSet = new Set(dailyTasksIds || []);

         // Verificar si hay alguna tarea que debería estar filtrada pero se está mostrando
         const shouldFilter = taskItems.some((task) => {
            const isSubtask = task.type === "subtask";
            const idToCompare = isSubtask && task.original_id ? `subtask-${task.original_id}` : task.id;

            return dailyTasksSet.has(idToCompare);
         });

         // Si encontramos alguna tarea que debería filtrarse, volver a activar el filtrado
         if (shouldFilter) {
            setIsFiltering(true);

            // Asíncrono para permitir que la UI muestre el estado de filtrado
            setTimeout(() => {
               // Filtrar de nuevo
               const properlyFilteredTasks = taskItems.filter((task) => {
                  const isSubtask = task.type === "subtask";
                  const idToCompare = isSubtask && task.original_id ? `subtask-${task.original_id}` : task.id;

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
      if (activeTab === "gestion" && activeGestionSubTab === "pendientes") {
         // Verificar si hay tareas que aparecen en ambas listas (pendientes y completadas)
         const pendingTasks = [...assignedTaskItems, ...delayedTaskItems, ...returnedTaskItems];
         const duplicates = pendingTasks.filter((pendingTask) => completedTaskItems.some((completedTask) => completedTask.id === pendingTask.id));

         if (duplicates.length > 0) {
            console.warn("Tareas duplicadas encontradas en pendientes y completadas:", duplicates);
         }
      }
   }, [activeTab, activeGestionSubTab, assignedTaskItems, delayedTaskItems, returnedTaskItems, completedTaskItems]);

   // useEffect para cargar datos del Gantt cuando se activa la vista gantt
   useEffect(() => {
      if (activeTab === "gestion" && activeGestionSubTab === "programadas" && scheduleViewMode === "gantt") {
         fetchGanttData();
      }
   }, [activeTab, activeGestionSubTab, scheduleViewMode, user]);

   useEffect(() => {
      // Log de conteo de tareas en cada cambio de las listas
      console.log(
         `CONTEO TAREAS -> Asignadas: ${assignedTaskItems.length}, Retrasadas: ${delayedTaskItems.length}, Completadas: ${completedTaskItems.length}, Devueltas: ${returnedTaskItems.length}, Bloqueadas: ${blockedTaskItems.length}`
      );
   }, [assignedTaskItems, delayedTaskItems, completedTaskItems, returnedTaskItems, blockedTaskItems]);

   async function fetchProject() {
      try {
         const { data, error } = await supabase.from("projects").select("id, name").eq("id", projectId).single();

         if (error) throw error;
         setProject(data);
      } catch (error) {
         console.error("Error fetching project:", error);
      }
   }

   // Función para cargar las tareas asignadas para hoy del usuario actual
   async function fetchTodaysDailyTasks() {
      if (!user) return;

      try {
         const today = format(new Date(), "yyyy-MM-dd");

         // Consultar task_work_assignments en lugar de daily_tasks
         const { data, error } = await supabase.from("task_work_assignments").select("task_id, task_type, status, subtask_id").eq("user_id", user.id).eq("date", today);

         if (error) {
            console.error("Error al cargar tareas diarias:", error);
            setDailyTasksIds([]);
            return;
         }

         console.log("[DAILY] Tareas/Subtareas ya asignadas para hoy (raw):", data);

         // Asegurar el formato correcto de IDs para el filtrado
         const formattedIds = data.map((item) => {
            // Formato especial para subtareas
            const formattedId = item.task_type === "subtask" ? `subtask-${item.subtask_id}` : item.task_id;

            return formattedId;
         });

         console.log("[DAILY] IDs formateados para filtrar:", formattedIds);

         setDailyTasksIds(formattedIds || []);
      } catch (error) {
         console.error("Error al cargar tareas diarias:", error);
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
         setIsFiltering(true);
         setError(null);

         const isAll = projectId === "all";

         // 1️⃣ Todas las tareas (sin importar si están asignadas al usuario)
         let allTasksQ = supabase.from("tasks").select("*").not("status", "in", "(approved, assigned)").order("deadline", { ascending: true });
         if (!isAll) {
            allTasksQ = allTasksQ.in("project_id", [projectId!]);
         }
         const { data: allTasksData, error: allTasksError } = await allTasksQ;
         if (allTasksError) throw allTasksError;

         // 2️⃣ Tareas que ya están asignadas al usuario (pendientes/in_progress)
         let taskDataQ = supabase.from("tasks").select("*").contains("assigned_users", [user.id]).not("status", "in", "(approved, completed, in_review, returned, assigned, in_progress, blocked)").order("deadline", { ascending: true });
         if (!isAll) {
            taskDataQ = taskDataQ.in("project_id", [projectId!]);
         }
         const { data: taskData, error: taskError } = await taskDataQ;
         if (taskError) throw taskError;

         // 3️⃣ Todas las subtareas del/los proyecto(s) - INCLUYE completed/approved para lógica secuencial
         let allSubtasksQ = supabase
            .from("subtasks")
            .select(
               `
          *,
          tasks (
            id, title, is_sequential, project_id
          )
        `
            )
            .order("sequence_order", { ascending: true });
         if (!isAll) {
            allSubtasksQ = allSubtasksQ.in("tasks.project_id", [projectId!]);
         }
         const { data: allSubtasksData, error: allSubtasksError } = await allSubtasksQ;
         if (allSubtasksError) throw allSubtasksError;

         // 4️⃣ Construir Set de project_ids para luego pedir sus nombres
         const projectIds = new Set<string>();
         allTasksData?.forEach((t) => {
            if (t.project_id) projectIds.add(t.project_id);
         });
         allSubtasksData?.forEach((s) => {
            const pid = s.tasks?.project_id;
            if (pid) projectIds.add(pid);
         });

         // 5️⃣ Cargar nombre de cada proyecto
         const { data: projects, error: projectsError } = await supabase.from("projects").select("id, name").in("id", Array.from(projectIds));
         if (projectsError) console.error("Error cargando proyectos:", projectsError);

         const projectMap: Record<string, string> = {};
         projects?.forEach((p) => (projectMap[p.id] = p.name));

         // 6️⃣ Subtareas asignadas al usuario
         let subtaskDataQ = supabase
            .from("subtasks")
            .select(
               `
          *,
          tasks (
            id, title, is_sequential, project_id
          )
        `
            )
            .eq("assigned_to", user.id)
            .not("status", "in", "(approved, completed, in_review, returned, assigned, in_progress, blocked)")
            .order("sequence_order", { ascending: true });
         if (!isAll) {
            subtaskDataQ = subtaskDataQ.in("tasks.project_id", [projectId!]);
         }
         const { data: subtaskData, error: subtaskError } = await subtaskDataQ;
         if (subtaskError) throw subtaskError;

         // 7️⃣ Filtrar tareas sin subtareas propias
         const tasksWithSubs = new Set<string>();
         allSubtasksData?.forEach((s) => tasksWithSubs.add(s.task_id));
         const tasksWithoutSubs = taskData?.filter((t) => !tasksWithSubs.has(t.id)) || [];

         // 8️⃣ Agrupar las subtareas del usuario por tarea padre
         const grouped: Record<string, Subtask[]> = {};
         subtaskData?.forEach((s) => {
            if (!grouped[s.task_id]) grouped[s.task_id] = [];
            grouped[s.task_id].push({ ...s, task_title: s.tasks?.title || "—" });
         });

         // 9️⃣ Seleccionar sólo las subtareas relevantes (siguiente si es secuencial, todas si no)
         const relevantSubs: Subtask[] = [];
         Object.entries(grouped).forEach(([taskId, subs]) => {
            if (subs[0].tasks?.is_sequential) {
               const allForThis = allSubtasksData!.filter((x) => x.task_id === taskId).sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));

               // DEBUG: Verificar secuencia completa
               console.log(
                  `[SECUENCIAL] Tarea ${taskId}, subtareas ordenadas:`,
                  allForThis.map((s) => ({ id: s.id, order: s.sequence_order, status: s.status, title: s.title, assigned_to: s.assigned_to === user.id ? "ME" : s.assigned_to }))
               );

               // NUEVA LÓGICA: Agrupar por sequence_order y manejar paralelismo
               const groupedByOrder = new Map<number, Subtask[]>();
               allForThis.forEach((subtask) => {
                  const order = subtask.sequence_order || 0;
                  if (!groupedByOrder.has(order)) {
                     groupedByOrder.set(order, []);
                  }
                  groupedByOrder.get(order)!.push(subtask);
               });

               // Ordenar los grupos por sequence_order
               const sortedOrders = Array.from(groupedByOrder.keys()).sort((a, b) => a - b);

               // Encontrar el primer nivel donde el usuario puede trabajar
               let userCanWorkOnLevel = false;
               for (const currentOrder of sortedOrders) {
                  const currentLevelSubtasks = groupedByOrder.get(currentOrder)!;

                  // Verificar si hay subtareas no aprobadas en este nivel
                  const hasIncompleteSubtasks = currentLevelSubtasks.some((s) => s.status !== "approved");

                  if (hasIncompleteSubtasks) {
                     // Verificar que todos los niveles anteriores estén completamente aprobados
                     let allPreviousLevelsComplete = true;
                     for (const prevOrder of sortedOrders) {
                        if (prevOrder >= currentOrder) break;

                        const prevLevelSubtasks = groupedByOrder.get(prevOrder)!;
                        const allPrevApproved = prevLevelSubtasks.every((s) => s.status === "approved");

                        if (!allPrevApproved) {
                           allPreviousLevelsComplete = false;
                           break;
                        }
                     }

                     if (allPreviousLevelsComplete) {
                        // El usuario puede trabajar en este nivel - añadir TODAS sus subtareas disponibles
                        const userSubtasksInLevel = currentLevelSubtasks.filter((s) => s.assigned_to === user.id && !["approved", "completed", "in_review", "returned", "assigned", "in_progress", "blocked"].includes(s.status));

                        if (userSubtasksInLevel.length > 0) {
                           relevantSubs.push(...userSubtasksInLevel);
                           userCanWorkOnLevel = true;
                        }
                     } else {
                        // Hay niveles anteriores sin completar, informar al usuario
                        const incompletePrevLevels = sortedOrders.filter((order) => order < currentOrder).filter((order) => !groupedByOrder.get(order)!.every((s) => s.status === "approved"));

                        const userSubtasksInLevel = currentLevelSubtasks.filter((s) => s.assigned_to === user.id);
                     }

                     // Solo procesar el primer nivel con subtareas incompletas
                     break;
                  }
               }
            } else {
               relevantSubs.push(...subs);
            }
         });

         // Resumen final
         const sequentialSubs = relevantSubs.filter((s) => s.tasks?.is_sequential);
         if (sequentialSubs.length > 0) {
            console.log(
               `[SECUENCIAL] Subtareas secuenciales relevantes para el usuario:`,
               sequentialSubs.map((s) => ({ id: s.id, title: s.title, status: s.status }))
            );
         }

         // 🔟 Mapear subtareas a Task[]
         const subtasksAsTasks: Task[] = relevantSubs.map((s) => ({
            id: `subtask-${s.id}`,
            original_id: s.id,
            title: s.title,
            subtask_title: s.tasks?.title || "—",
            description: s.description,
            priority: "medium",
            estimated_duration: s.estimated_duration,
            start_date: s.start_date || "",
            deadline: s.deadline || "",
            status: s.status,
            is_sequential: false,
            project_id: s.tasks?.project_id || "",
            projectName: projectMap[s.tasks?.project_id || ""] || "Sin proyecto",
            type: "subtask",
         }));

         // 1️⃣1️⃣ Mapear tareas a Task[]
         const tasksAsTasks: Task[] = tasksWithoutSubs.map((t) => ({
            id: t.id,
            original_id: t.id,
            title: t.title,
            description: t.description,
            priority: t.priority,
            estimated_duration: t.estimated_duration,
            start_date: t.start_date,
            deadline: t.deadline,
            status: t.status,
            is_sequential: t.is_sequential,
            project_id: t.project_id || "",
            projectName: projectMap[t.project_id || ""] || "Sin proyecto",
            type: "task",
         }));

         // 1️⃣2️⃣ Filtrar las ya asignadas hoy o solo mostrar las que están en estado 'pending'
         const available = [...tasksAsTasks, ...subtasksAsTasks].filter((task) => {
            const key = task.type === "subtask" ? `subtask-${task.original_id}` : task.id;
            const already = dailyTasksIds?.includes(key);
            const isPending = task.status === "pending"; // Solo mostrar tareas pendientes
            return !already && isPending;
         });

         // Filtrar duplicados para evitar errores de renderizado en React
         const uniqueAvailable = available.filter((task, index, self) => index === self.findIndex((t) => t.id === task.id));

         if (uniqueAvailable.length < available.length) {
            console.warn("🚨 [DUPLICADOS REMOVIDOS] Se encontraron y eliminaron tareas duplicadas de la lista de asignación.");
         }

         console.log("[FETCH] Tareas disponibles para asignar (filtradas y finales):", uniqueAvailable);

         // 1️⃣3️⃣ Ordenar
         const sorted = uniqueAvailable.sort((a, b) => {
            if (sortBy === "deadline") {
               const da = a.deadline ? +new Date(a.deadline) : Infinity;
               const db = b.deadline ? +new Date(b.deadline) : Infinity;
               return sortOrder === "asc" ? da - db : db - da;
            }
            if (sortBy === "priority") {
               const V = { high: 3, medium: 2, low: 1 };
               return sortOrder === "asc" ? V[a.priority] - V[b.priority] : V[b.priority] - V[a.priority];
            }
            return sortOrder === "asc" ? a.estimated_duration - b.estimated_duration : b.estimated_duration - a.estimated_duration;
         });

         setTaskItems(sorted);
         setIsDataInitialized(true);
      } catch (err) {
         console.error("Error en fetchProjectTasksAndSubtasks:", err);
         setError("Error al cargar tareas. Por favor, intenta de nuevo.");
         setIsDataInitialized(true);
      } finally {
         setIsFiltering(false);
         setLoading(false);
      }
   }

   function handleTaskSelection(taskId: string) {
      setSelectedTasks((prev) => {
         if (prev.includes(taskId)) {
            return prev.filter((id) => id !== taskId);
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

      // Cargar historial de avances
      const taskId = task.type === "subtask" ? task.original_id || task.id : task.id;
      await fetchTaskProgressHistory(taskId, task.type === "subtask");

      // If it's a subtask, fetch related subtasks info
      if (task.type === "subtask" && task.original_id) {
         try {
            // First, get the current subtask to know its parent task and sequence order
            const { data: currentSubtask, error: currentError } = await supabase.from("subtasks").select("id, title, task_id, sequence_order, status").eq("id", task.original_id).single();

            if (currentError) {
               console.error("Error fetching current subtask details:", currentError);
               return;
            }

            if (currentSubtask && currentSubtask.task_id) {
               // Get all subtasks for this parent task
               const { data: relatedSubtasks, error: relatedError } = await supabase.from("subtasks").select("id, title, description, estimated_duration, sequence_order, status, assigned_to").eq("task_id", currentSubtask.task_id).order("sequence_order", { ascending: true });

               if (relatedError) {
                  console.error("Error fetching related subtasks:", relatedError);
                  return;
               }

               if (relatedSubtasks && relatedSubtasks.length > 0) {
                  // Find the index of current subtask in the ordered list
                  const currentIndex = relatedSubtasks.findIndex((s) => s.id === task.original_id);

                  if (currentIndex > 0) {
                     // There is a previous subtask
                     const prev = relatedSubtasks[currentIndex - 1];
                     setPreviousSubtask({
                        ...prev,
                        description: prev.description || null,
                        estimated_duration: prev.estimated_duration || 0,
                        task_id: currentSubtask.task_id,
                        subtask_id: prev.id,
                        start_date: null,
                        deadline: null
                     });
                  }

                  if (currentIndex < relatedSubtasks.length - 1) {
                     // There is a next subtask
                     const next = relatedSubtasks[currentIndex + 1];
                     setNextSubtask({
                        ...next,
                        description: next.description || null,
                        estimated_duration: next.estimated_duration || 0,
                        task_id: currentSubtask.task_id,
                        subtask_id: next.id,
                        start_date: null,
                        deadline: null
                     });
                  }

                  // Get user info for all related subtasks
                  const assignedUserIds = relatedSubtasks.filter((s) => s.assigned_to).map((s) => s.assigned_to);

                  if (assignedUserIds.length > 0) {
                     // Since neither users.user_metadata nor profiles table exists,
                     // create a simplified user map with just the user IDs
                     const userMap: Record<string, string> = {};
                     assignedUserIds.forEach((id) => {
                        // Use a simple format that shows part of the ID for identification
                        userMap[id] = `Usuario ${id.substring(0, 6)}`;
                     });
                     setSubtaskUsers(userMap);

                     // Optionally, try to fetch at least basic user info if the table exists
                     try {
                        const { data: basicUsers } = await supabase.from("users").select("id, name").in("id", assignedUserIds);

                        if (basicUsers && basicUsers.length > 0) {
                           basicUsers.forEach((user) => {
                              if (user.id && user.name) {
                                 userMap[user.id] = user.name;
                              }
                           });
                           setSubtaskUsers({ ...userMap });
                        }
                     } catch (error) {}
                  }
               }
            }
         } catch (error) {
            console.error("Error fetching subtask sequence info:", error);
         }
      }
   }

   function closeTaskDetailModal() {
      setShowTaskDetailModal(false);
      setSelectedTaskDetails(null);
      setTaskProgressHistory([]); // Limpiar historial de avances
   }

   function handleSort(criteria: "deadline" | "priority" | "duration") {
      if (sortBy === criteria) {
         // Si ya estamos ordenando por este criterio, cambiar la dirección
         setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
         // Si es un nuevo criterio, establecerlo y usar dirección ascendente por defecto
         setSortBy(criteria);
         setSortOrder("asc");
      }
   }

   function getPriorityBadge(priority: "low" | "medium" | "high") {
      const colors = {
         high: "bg-red-100 text-red-800",
         medium: "bg-yellow-100 text-yellow-800",
         low: "bg-green-100 text-green-800",
      };

      const labels = {
         high: "Alta",
         medium: "Media",
         low: "Baja",
      };

      return <span className={`text-xs px-2 py-0.5 rounded-full ${colors[priority]}`}>{labels[priority]}</span>;
   }

   function getStatusBadge(task: Task, source: string) {
      const statusConfig = {
         available: { color: "bg-blue-100 text-blue-800", label: "Disponible" },
         assigned: { color: "bg-green-100 text-green-800", label: "Asignada" },
         delayed: { color: "bg-orange-100 text-orange-800", label: "Retrasada" },
         returned: { color: "bg-orange-100 text-orange-800", label: "Devuelta" },
         blocked: { color: "bg-red-100 text-red-800", label: "Bloqueada" },
         completed: { color: "bg-gray-100 text-gray-800", label: "Completada" },
         in_review: { color: "bg-yellow-100 text-yellow-800", label: "En Revisión" },
         approved: { color: "bg-green-100 text-green-800", label: "Aprobada" },
      };

      const config = statusConfig[source as keyof typeof statusConfig] || { color: "bg-gray-100 text-gray-800", label: "-" };
      
      return <span className={`text-xs px-2 py-0.5 rounded-full ${config.color}`}>{config.label}</span>;
   }

   // Función para obtener tareas pendientes (disponibles y asignadas)
   function getPendingTasks(): { task: Task; source: string }[] {
      const pendingTasks: { task: Task; source: string }[] = [];
      
      // Tareas disponibles para asignar
      taskItems.forEach(task => {
         pendingTasks.push({ task, source: 'available' });
      });
      
   
      
      return pendingTasks;
   }

   // Función para obtener tareas en proceso (completadas, en revisión, aprobadas)
   function getInProgressTasks(): { completed: Task[]; inReview: Task[]; approved: Task[] } {
      return {
         completed: completedTaskItems,
         inReview: inReviewTaskItems,
         approved: approvedTaskItems
      };
   }

   // Función para obtener solo tareas bloqueadas (las devueltas están ahora en el kanban)
   function getBlockedTasks(): { task: Task; source: string }[] {
      const blockedTasks: { task: Task; source: string }[] = [];
      
      // Solo tareas bloqueadas
      blockedTaskItems.forEach(task => {
         blockedTasks.push({ task, source: 'blocked' });
      });
      
      return blockedTasks;
   }

   // Función para obtener tareas disponibles para programar el día
   function getAvailableTasksForScheduling(): { task: Task; source: string }[] {
      const availableTasks: { task: Task; source: string }[] = [];
      
      // Tareas disponibles para asignar
      taskItems.forEach(task => {
         availableTasks.push({ task, source: 'available' });
      });
      
      // Tareas retrasadas (alta prioridad)
      delayedTaskItems.forEach(task => {
         availableTasks.push({ task, source: 'delayed' });
      });
      
      // Tareas devueltas (requieren atención)
      returnedTaskItems.forEach(task => {
         availableTasks.push({ task, source: 'returned' });
      });
      
      return availableTasks;
   }

   // Función para programar una tarea para el día
   function handleScheduleTask(task: Task) {
      setCurrentTaskForTime(task);
      setSchedulingForTomorrow(false); // Siempre para hoy cuando viene del planificador normal
      setShowTimeModal(true);
   }

   // Función para filtrar y buscar tareas
   function getFilteredAndSearchedTasks(): { task: Task; source: string }[] {
      let tasks = getAvailableTasksForScheduling();

      // Aplicar búsqueda
      if (taskSearchQuery.trim()) {
         const query = taskSearchQuery.toLowerCase().trim();
         tasks = tasks.filter(({ task }) => 
            task.title.toLowerCase().includes(query) ||
            (task.description && task.description.toLowerCase().includes(query)) ||
            (task.projectName && task.projectName.toLowerCase().includes(query))
         );
      }

      // Aplicar filtros
      if (taskFilterProject) {
         tasks = tasks.filter(({ task }) => task.project_id === taskFilterProject);
      }

      if (taskFilterPriority) {
         tasks = tasks.filter(({ task }) => task.priority === taskFilterPriority);
      }

      if (taskFilterStatus) {
         tasks = tasks.filter(({ source }) => source === taskFilterStatus);
      }

      // Aplicar ordenación
      tasks.sort((a, b) => {
         switch (taskSortBy) {
            case "deadline":
               if (!a.task.deadline && !b.task.deadline) return 0;
               if (!a.task.deadline) return 1;
               if (!b.task.deadline) return -1;
               return new Date(a.task.deadline).getTime() - new Date(b.task.deadline).getTime();
            
            case "priority":
               const priorityOrder = { high: 3, medium: 2, low: 1 };
               return priorityOrder[b.task.priority] - priorityOrder[a.task.priority];
            
            case "duration":
               return a.task.estimated_duration - b.task.estimated_duration;
            
            case "title":
               return a.task.title.localeCompare(b.task.title);
            
            default:
               return 0;
         }
      });

      return tasks;
   }

   // Función para obtener proyectos únicos
   function getUniqueProjects(): { id: string; name: string }[] {
      const projects = new Map<string, string>();
      getAvailableTasksForScheduling().forEach(({ task }) => {
         if (task.project_id && task.projectName) {
            projects.set(task.project_id, task.projectName);
         }
      });
      return Array.from(projects.entries()).map(([id, name]) => ({ id, name }));
   }

   // Función para abrir el modal de selección
   function handleOpenTaskSelector() {
      setTaskSearchQuery("");
      setTaskFilterProject("");
      setTaskFilterPriority("");
      setTaskFilterStatus("");
      setTaskSortBy("deadline");
      setShowTaskSelectorModal(true);
   }

   // Función para seleccionar tarea desde el modal
   function handleSelectTaskFromModal(task: Task) {
      setShowTaskSelectorModal(false);
      handleScheduleTask(task);
   }

   // Función para manejar actividades personalizadas
   async function handleCreateCustomActivity() {
      if (!customActivity.title.trim()) {
         toast.error("El título es obligatorio");
         return;
      }

      try {
         // Crear la tarea real en la base de datos con marcador especial
         const taskData = {
            title: `[PERSONAL] ${customActivity.title}`,
            description: customActivity.description || `Actividad personal: ${customActivity.type}`,
            priority: customActivity.priority,
            estimated_duration: customActivity.estimated_duration,
            start_date: new Date().toISOString().split('T')[0], // Solo fecha
            deadline: new Date().toISOString().split('T')[0],   // Solo fecha
            status: "personal_activity", // Status especial para filtrar en admin
            is_sequential: false,
            project_id: customActivity.selected_project_id,
            created_by: user?.id,
            assigned_to: user?.id
         };

         const { data: newTask, error } = await supabase
            .from("tasks")
            .insert(taskData)
            .select()
            .single();

         if (error) throw error;

         // Crear objeto Task para el modal
         const customTask: Task = {
            id: newTask.id,
            title: customActivity.title, // Sin el prefijo [PERSONAL] para mostrar
            description: customActivity.description,
            priority: customActivity.priority,
            estimated_duration: customActivity.estimated_duration,
            start_date: newTask.start_date,
            deadline: newTask.deadline,
            status: "personal_activity",
            is_sequential: false,
            project_id: newTask.project_id,
            projectName: customActivity.selected_project_id 
               ? getUniqueProjects().find(p => p.id === customActivity.selected_project_id)?.name || "📋 Actividad Personal"
               : "📋 Actividad Personal",
            type: "task",
            assignment_date: new Date().toISOString(),
            notes: {
               activity_type: customActivity.type
            }
         };

         // Limpiar formulario
         setCustomActivity({
            title: "",
            description: "",
            estimated_duration: 30,
            priority: "medium",
            type: "work",
            selected_project_id: ""
         });

         // Cerrar formulario y abrir modal de tiempo
         setShowCustomActivityForm(false);
         setCurrentTaskForTime(customTask);
         setShowTimeModal(true);

      } catch (error) {
         console.error("Error creating personal activity:", error);
         toast.error("Error al crear la actividad personal");
      }
   }

   function resetCustomActivityForm() {
      setCustomActivity({
         title: "",
         description: "",
         estimated_duration: 30,
         priority: "medium",
         type: "work",
         selected_project_id: ""
      });
      setShowCustomActivityForm(false);
   }

   // Estados para almacenar horarios de task_work_assignments
   const [taskScheduleData, setTaskScheduleData] = useState<Record<string, {startTime: string; endTime: string}>>({});

   // Estado para modal de continuación después de reportar avance
   const [showContinueModal, setShowContinueModal] = useState(false);
   const [taskForContinue, setTaskForContinue] = useState<Task | null>(null);

   // Estado para saber si estamos programando para hoy o mañana
   const [schedulingForTomorrow, setSchedulingForTomorrow] = useState(false);

   // Estado para historial de avances de tarea
   const [taskProgressHistory, setTaskProgressHistory] = useState<any[]>([]);

   // Función para obtener horarios de task_work_assignments
   async function fetchTaskSchedules() {
      if (!user) return;
      
      try {
         const today = format(new Date(), "yyyy-MM-dd");
         const { data, error } = await supabase
            .from("task_work_assignments")
            .select("task_id, subtask_id, task_type, start_time, end_time")
            .eq("user_id", user.id)
            .eq("date", today)
            .not("start_time", "is", null)
            .not("end_time", "is", null);

         if (error) throw error;

         const scheduleMap: Record<string, {startTime: string; endTime: string}> = {};
         
         data?.forEach(assignment => {
            const taskKey = assignment.task_type === "subtask" 
               ? `subtask-${assignment.subtask_id}` 
               : assignment.task_id;
            
            if (assignment.start_time && assignment.end_time) {
               // Extraer solo la hora de los timestamps
               const startTime = assignment.start_time.split('T')[1]?.substring(0, 5) || "";
               const endTime = assignment.end_time.split('T')[1]?.substring(0, 5) || "";
               
               if (startTime && endTime) {
                  scheduleMap[taskKey] = { startTime, endTime };
               }
            }
         });

         setTaskScheduleData(scheduleMap);
      } catch (error) {
         console.error("Error fetching task schedules:", error);
      }
   }

   // Función para procesar tareas con horarios para la vista gráfica
   function getScheduledTasksForTimeline(): Array<{
      task: Task;
      startTime: string;
      endTime: string;
      startMinutes: number;
      endMinutes: number;
      duration: number;
      isDelayed: boolean;
   }> {
      const scheduledTasks: Array<{
         task: Task;
         startTime: string;
         endTime: string;
         startMinutes: number;
         endMinutes: number;
         duration: number;
         isDelayed: boolean;
      }> = [];

      [...assignedTaskItems, ...delayedTaskItems].forEach(task => {
         const schedule = taskScheduleData[task.id];
         
         if (schedule) {
            const [startHour, startMin] = schedule.startTime.split(':').map(Number);
            const [endHour, endMin] = schedule.endTime.split(':').map(Number);
            
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;
            const duration = endMinutes - startMinutes;
            
            if (duration > 0) {
               scheduledTasks.push({
                  task,
                  startTime: schedule.startTime,
                  endTime: schedule.endTime,
                  startMinutes,
                  endMinutes,
                  duration,
                  isDelayed: delayedTaskItems.some(d => d.id === task.id)
               });
            }
         }
      });

      return scheduledTasks.sort((a, b) => a.startMinutes - b.startMinutes);
   }

   // Función para convertir minutos a formato de hora
   function minutesToTimeString(minutes: number): string {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
   }

   // Función para generar las horas del día para el timeline
   function getTimelineHours(): string[] {
      const hours = [];
      for (let i = 6; i <= 22; i++) {
         hours.push(`${i.toString().padStart(2, '0')}:00`);
      }
      return hours;
   }

   // Función para confirmar la programación de tiempo
   async function handleConfirmTimeSlot(startTime: string, endTime: string, duration: number) {
      if (!currentTaskForTime || !user) return;

      try {
         // Usar la fecha correcta: hoy o mañana según el contexto
         const targetDate = schedulingForTomorrow 
            ? format(addDays(new Date(), 1), "yyyy-MM-dd")
            : format(new Date(), "yyyy-MM-dd");
         
         const isSubtask = currentTaskForTime.type === "subtask";
         const originalId = isSubtask ? currentTaskForTime.original_id || currentTaskForTime.id : currentTaskForTime.id;

         // Crear timestamps completos con la fecha correcta
         const fullStartTime = `${targetDate}T${startTime}:00`;
         const fullEndTime = `${targetDate}T${endTime}:00`;

               // Verificar si es una actividad personalizada
      const isCustomActivity = currentTaskForTime.status === "personal_activity";
      
      // Preparar los datos según la estructura correcta
      const taskData: any = {
         user_id: user.id,
         date: targetDate,
         task_type: isSubtask ? "subtask" : "task", // Actividades personales son tareas normales
         estimated_duration: duration,
         status: "assigned",
         start_time: fullStartTime,
         end_time: fullEndTime,
         created_at: new Date().toISOString(),
         updated_at: new Date().toISOString()
      };

      // Asignar campos según el tipo
      if (isSubtask) {
         taskData.task_id = null;
         taskData.subtask_id = originalId;
         taskData.project_id = currentTaskForTime.project_id;
      } else {
         // Tanto tareas normales como actividades personales usan task_id
         taskData.task_id = originalId;
         taskData.subtask_id = null;
         taskData.project_id = currentTaskForTime.project_id;
      }

         // Insertar en task_work_assignments
         const { error } = await supabase
            .from("task_work_assignments")
            .insert(taskData);

               if (error) throw error;

      // Actualizar estado de la tarea a "assigned"
      const table = isSubtask ? "subtasks" : "tasks";
      const { error: updateError } = await supabase
         .from(table)
         .update({ status: "assigned" })
         .eq("id", originalId);

      if (updateError) throw updateError;

               const dayText = schedulingForTomorrow ? "mañana" : "hoy";
      const activityText = isCustomActivity ? "Actividad personal programada" : "Tarea programada";
      toast.success(`${activityText} para ${dayText}: ${startTime} - ${endTime}`);
         
         // Actualizar listas
         await Promise.all([
            fetchProjectTasksAndSubtasks(),
            fetchAssignedTasks()
         ]);

         // Cargar horarios actualizados
         await fetchTaskSchedules();

         // Actualizar datos del Gantt si está activo
         if (scheduleViewMode === "gantt") {
            await fetchGanttData();
         }

         setShowTimeModal(false);
         setCurrentTaskForTime(null);
         setSchedulingForTomorrow(false); // Reset scheduling context

      } catch (error) {
         console.error("Error programming task:", error);
         toast.error("Error al programar la tarea");
      }
   }

   function handleShowConfirmModal() {
      if (selectedTasks.length === 0) {
         toast.error("Por favor, selecciona al menos una tarea para asignar");
         return;
      }
      // Inicializar duraciones personalizadas para cada tarea seleccionada (vacías)
      const initialDurations: Record<string, { value: number; unit: "minutes" | "hours" }> = {};
      selectedTasks.forEach(taskId => {
         initialDurations[taskId] = { value: 0, unit: "minutes" }; // Sin valor predeterminado
      });
      setCustomDurations(initialDurations);
      setShowDurationInputs(true);
      setShowConfirmModal(true);
   }

   function calculateTotalCustomDuration(): number {
      return selectedTasks.reduce((total, taskId) => {
         const customDuration = customDurations[taskId];
         if (customDuration) {
            const durationInHours = customDuration.unit === "hours" 
               ? customDuration.value 
               : customDuration.value / 60;
            return total + durationInHours;
         }
         return total;
      }, 0);
   }

   function areAllCustomDurationsValid(): boolean {
      return selectedTasks.every(taskId => {
         const customDuration = customDurations[taskId];
         return customDuration && customDuration.value > 0;
      });
   }

   function areAllTasksScheduled(): boolean {
      return selectedTasks.every(taskId => {
         const schedule = taskSchedules[taskId];
         return schedule && schedule.startTime && schedule.endTime;
      });
   }

   function handleConfirmSave() {
      // Validar que todas las tareas tengan duración antes de proceder
      if (!areAllCustomDurationsValid()) {
         toast.error("Por favor, completa la duración para todas las tareas");
         return;
      }
      setShowTimeScheduling(true);
      // Cargar eventos del día para mostrar en el timeline
      if (user) {
         fetchWorkEvents();
      }
   }



   function handleSaveWithSchedule() {
      // Validar que todas las tareas tengan horario asignado
      if (!areAllTasksScheduled()) {
         toast.error("Debes asignar horario a TODAS las tareas antes de guardar");
         return;
      }
      handleSaveSelectedTasks();
      setShowConfirmModal(false);
      setShowTimeScheduling(false);
      setCustomDurations({});
      setShowDurationInputs(false);
   }

   // Función para generar horarios del día (8:00 AM - 6:00 PM, excluyendo 12:00 PM - 2:00 PM)
   function generateTimeSlots() {
      const slots = [];
      for (let hour = 8; hour <= 18; hour++) {
         // Excluir horario de almuerzo: 12:00 PM - 2:00 PM (horas 12 y 13)
         if (hour >= 12 && hour < 14) {
            continue; // Saltar las horas de almuerzo
         }
         
         for (let minutes = 0; minutes < 60; minutes += 30) {
            const time = hour * 60 + minutes; // minutos desde medianoche
            const displayTime = minutesToTimeAMPM(time);
            slots.push({ time, display: displayTime });
         }
      }
      return slots;
   }

   // Función para convertir minutos a formato de hora (24h)
   function minutesToTime(minutes: number): string {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
   }

   // Función para convertir minutos a formato AM/PM
   function minutesToTimeAMPM(minutes: number): string {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
   }

   // Función para verificar conflictos de horarios
   function hasScheduleConflict(startTime: number, endTime: number, excludeTaskId?: string): boolean {
      return Object.entries(taskSchedules).some(([taskId, schedule]) => {
         if (!schedule || taskId === excludeTaskId) return false;
         const scheduleStart = parseInt(schedule.startTime.split(':')[0]) * 60 + parseInt(schedule.startTime.split(':')[1]);
         const scheduleEnd = parseInt(schedule.endTime.split(':')[0]) * 60 + parseInt(schedule.endTime.split(':')[1]);
         return (startTime < scheduleEnd && endTime > scheduleStart);
      });
   }

   // Función para verificar si una hora de inicio específica causaría conflicto
   function wouldStartTimeConflict(startMinutes: number, durationMinutes: number, excludeTaskId?: string): boolean {
      const endMinutes = startMinutes + durationMinutes;
      
      // Verificar conflictos con tareas programadas
      const hasTaskConflict = hasScheduleConflict(startMinutes, endMinutes, excludeTaskId);
      
      // Verificar conflictos con eventos de trabajo
      const hasEventConflict = workEvents.some(event => {
         const eventStartMinutes = parseInt(event.start_time.split(':')[0]) * 60 + parseInt(event.start_time.split(':')[1]);
         const eventEndMinutes = parseInt(event.end_time.split(':')[0]) * 60 + parseInt(event.end_time.split(':')[1]);
         return (startMinutes < eventEndMinutes && endMinutes > eventStartMinutes);
      });
      
      return hasTaskConflict || hasEventConflict;
   }

   // Función para asignar horario a una tarea
   function assignTimeToTask(taskId: string, startTime: string, endTime: string, duration: number) {
      setTaskSchedules(prev => ({
         ...prev,
         [taskId]: { startTime, endTime, duration }
      }));
   }

   // Función para remover horario de una tarea
   function removeTimeFromTask(taskId: string) {
      setTaskSchedules(prev => ({
         ...prev,
         [taskId]: null
      }));
   }

   // Función para obtener sugerencias inteligentes de horarios
   function getTimeSlotSuggestions(duration: number): Array<{ start: number; end: number; reason: string }> {
      const suggestions = [];
      const slots = generateTimeSlots();
      
      for (let i = 0; i < slots.length; i++) {
         const startTime = slots[i].time;
         const endTime = startTime + duration;
         
         if (endTime <= 20 * 60 && !hasScheduleConflict(startTime, endTime)) {
            let reason = "Horario disponible";
            if (startTime === 9 * 60) reason = "Primera hora del día";
            else if (startTime === 14 * 60) reason = "Después del almuerzo";
            else if (startTime === 8 * 60) reason = "Inicio temprano";
            
            suggestions.push({ start: startTime, end: endTime, reason });
            
            if (suggestions.length >= 3) break; // Máximo 3 sugerencias
         }
      }
      
      return suggestions;
   }

   // ===== FUNCIONES CRUD PARA EVENTOS DE TRABAJO =====
   
   async function fetchWorkEvents() {
      if (!user) return;
      
      setLoadingEvents(true);
      try {
         const today = format(new Date(), "yyyy-MM-dd");
         
         const { data, error } = await supabase
            .from('work_events')
            .select('*')
            .eq('user_id', user.id)
            .eq('date', today)
            .order('start_time', { ascending: true });
            
         if (error) throw error;
         
         setWorkEvents(data || []);
      } catch (error) {
         console.error('Error fetching work events:', error);
         toast.error('Error al cargar eventos del día');
      } finally {
         setLoadingEvents(false);
      }
   }
   
   async function handleSaveEvent() {
      if (!user) return;
      
      if (!eventForm.title.trim()) {
         toast.error('El título del evento es obligatorio');
         return;
      }
      
      if (eventForm.start_time >= eventForm.end_time) {
         toast.error('La hora de fin debe ser posterior a la hora de inicio');
         return;
      }
      
      setSavingEvent(true);
      try {
         const today = format(new Date(), "yyyy-MM-dd");
         const startTime = minutesToTime(eventForm.start_time);
         const endTime = minutesToTime(eventForm.end_time);
         
         const eventData = {
            user_id: user.id,
            title: eventForm.title.trim(),
            description: eventForm.description.trim() || null,
            date: today,
            start_time: startTime,
            end_time: endTime,
            event_type: eventForm.event_type,
            project_id: projectId !== 'all' ? projectId : null,
         };
         
         if (editingEvent) {
            // Actualizar evento existente
            const { error } = await supabase
               .from('work_events')
               .update(eventData)
               .eq('id', editingEvent.id);
               
            if (error) throw error;
            toast.success('Evento actualizado correctamente');
         } else {
            // Crear nuevo evento
            const { error } = await supabase
               .from('work_events')
               .insert([eventData]);
               
            if (error) throw error;
            toast.success('Evento creado correctamente');
         }
         
         // Limpiar formulario y recargar eventos
         resetEventForm();
         fetchWorkEvents();
         
      } catch (error) {
         console.error('Error saving event:', error);
         toast.error('Error al guardar el evento');
      } finally {
         setSavingEvent(false);
      }
   }
   
   async function handleDeleteEvent(eventId: string) {
      if (!confirm('¿Estás seguro de que quieres eliminar este evento?')) {
         return;
      }
      
      try {
         const { error } = await supabase
            .from('work_events')
            .delete()
            .eq('id', eventId);
            
         if (error) throw error;
         
         toast.success('Evento eliminado correctamente');
         fetchWorkEvents();
         
      } catch (error) {
         console.error('Error deleting event:', error);
         toast.error('Error al eliminar el evento');
      }
   }
   
   function handleEditEvent(event: WorkEvent) {
      // Convertir tiempos de string a minutos
      const startMinutes = parseInt(event.start_time.split(':')[0]) * 60 + parseInt(event.start_time.split(':')[1]);
      const endMinutes = parseInt(event.end_time.split(':')[0]) * 60 + parseInt(event.end_time.split(':')[1]);
      
      setEventForm({
         title: event.title,
         description: event.description || '',
         event_type: event.event_type,
         start_time: startMinutes,
         end_time: endMinutes,
      });
      
      setEditingEvent(event);
   }
   
   function resetEventForm() {
      setEventForm({
         title: '',
         description: '',
         event_type: 'meeting',
         start_time: 480, // 8:00 AM
         end_time: 540,   // 9:00 AM
      });
      setEditingEvent(null);
   }
   
   // Cargar eventos cuando se abre el modal
   useEffect(() => {
      if (showEventsModal && user) {
         fetchWorkEvents();
      }
   }, [showEventsModal, user]);

   async function handleSaveSelectedTasks() {
      if (selectedTasks.length === 0) {
         toast.error("Por favor, selecciona al menos una tarea para asignar");
         return;
      }

      if (!user || !projectId) {
         toast.error("Información de usuario o proyecto no disponible");
         return;
      }

      setSaving(true);

      // Log the selected tasks that will be saved
      console.log("[SAVE] Tareas seleccionadas para guardar:", selectedTasks);

      try {
         const today = format(new Date(), "yyyy-MM-dd");

         // Array para guardar IDs que necesitarán actualización de estado
         const taskIdsToUpdate: string[] = [];
         const subtaskIdsToUpdate: string[] = [];
         const parentTasksOfSubtasks = new Set<string>();

         // 1. Separar tareas y subtareas seleccionadas
         for (const taskId of selectedTasks) {
            const task = taskItems.find((t) => t.id === taskId);
            if (!task) continue;

            if (task.type === "subtask") {
               const originalId = task.id.replace("subtask-", "");
               subtaskIdsToUpdate.push(originalId);
            } else {
               taskIdsToUpdate.push(task.id);
            }
         }

         // 2. Obtener las tareas principales de las subtareas
         if (subtaskIdsToUpdate.length > 0) {
            const { data: subtasks, error: subtasksError } = await supabase.from("subtasks").select("task_id").in("id", subtaskIdsToUpdate);

            if (subtasksError) {
               console.error("Error al obtener tareas principales:", subtasksError);
            } else if (subtasks) {
               // Agregar los IDs de tareas principales al conjunto
               subtasks.forEach((subtask) => {
                  if (subtask.task_id) {
                     parentTasksOfSubtasks.add(subtask.task_id);
                  }
               });
            }
         }

         // 3. Generar las entradas para task_work_assignments
         const tasksToSave = selectedTasks.map((taskId) => {
            const task = taskItems.find((t) => t.id === taskId)!;
            const isSubtask = task.type === "subtask";
            const originalId = isSubtask ? task.id.replace("subtask-", "") : task.id;
            
            // Obtener horarios programados para esta tarea
            const schedule = taskSchedules[taskId];
            let startTime = null;
            let endTime = null;
            
            if (schedule) {
               // Crear timestamps completos con la fecha de hoy
               const todayStr = format(new Date(), "yyyy-MM-dd");
               startTime = `${todayStr}T${schedule.startTime}:00`;
               endTime = `${todayStr}T${schedule.endTime}:00`;
            }

            // Obtener duración personalizada o usar la original como fallback
            const customDuration = customDurations[taskId];
            const finalDuration = customDuration 
               ? (customDuration.unit === "hours" ? customDuration.value * 60 : customDuration.value)
               : task.estimated_duration;

            return {
               user_id: user.id,
               date: today,
               task_type: isSubtask ? "subtask" : "task",
               task_id: isSubtask ? null : originalId,
               subtask_id: isSubtask ? originalId : null,
               project_id: task.project_id,
               estimated_duration: finalDuration,
               status: "assigned",
               start_time: startTime,
               end_time: endTime,
               created_at: new Date().toISOString(),
               updated_at: new Date().toISOString(),
            };
         });

         // 4. Insertar en task_work_assignments

         // 4.1 Upsert solo tareas
         const taskRows = tasksToSave.filter((r) => r.task_id !== null);
         if (taskRows.length) {
            const { error: err1 } = await supabase.from("task_work_assignments").upsert(taskRows, {
               onConflict: "user_id,date,task_type,task_id",
            });
            if (err1) throw err1;
         }

         // 4.2 Upsert solo subtareas
         const subtaskRows = tasksToSave
            .filter((r) => r.subtask_id !== null)
            .map((r) => {
               // crea un nuevo objeto sin la propiedad task_id
               const { task_id, ...onlySub } = r;
               return onlySub;
            });

         await supabase.from("task_work_assignments").upsert(subtaskRows, {
            onConflict: "user_id,date,task_type,subtask_id",
         });

         // 5. Actualizar estado y duración de subtareas a "assigned" y registrar en historial
         if (subtaskIdsToUpdate.length > 0) {
            // Actualizar cada subtarea individualmente para poder usar duraciones personalizadas
            for (const subtaskId of subtaskIdsToUpdate) {
               const taskId = `subtask-${subtaskId}`;
               const customDuration = customDurations[taskId];
               const finalDuration = customDuration 
                  ? (customDuration.unit === "hours" ? customDuration.value * 60 : customDuration.value)
                  : undefined;

               const updateData: any = { status: "assigned" };
               if (finalDuration !== undefined) {
                  updateData.estimated_duration = finalDuration;
               }

               const { error: updateSubtaskError } = await supabase
                  .from("subtasks")
                  .update(updateData)
                  .eq("id", subtaskId);

               if (updateSubtaskError) {
                  console.error(`Error al actualizar subtarea ${subtaskId}:`, updateSubtaskError);
               }
            }

            // Obtener datos actualizados para historial
            const { data: updatedSubtasks, error: selectError } = await supabase
               .from("subtasks")
               .select("id, title, status, task_id")
               .in("id", subtaskIdsToUpdate);

            if (selectError) {
               console.error("Error al obtener subtareas actualizadas:", selectError);
            } else {
               console.log("[SAVE] Subtareas actualizadas a 'assigned':", updatedSubtasks);
               
               // Registrar en historial para cada subtarea
               if (updatedSubtasks) {
                  const historyRecords = updatedSubtasks.map(subtask => ({
                     task_id: subtask.task_id,
                     subtask_id: subtask.id,
                     changed_by: user.id,
                     previous_status: 'pending',
                     new_status: 'assigned',
                     metadata: {
                        reason: 'Task assigned for daily work',
                        assigned_date: today
                     }
                  }));

                  const { error: historyError } = await supabase.from('status_history').insert(historyRecords);
                  
                  if (historyError) {
                     console.error('⚠️ [HISTORY] Error registrando asignación de subtareas:', historyError);
                  } else {
                     console.log('✅ [HISTORY] Asignación de subtareas registrada en historial');
                  }
               }
            }
         }

         // 6. Actualizar estado y duración de tareas principales sin subtareas a "assigned" y registrar en historial
         if (taskIdsToUpdate.length > 0) {
            // Actualizar cada tarea individualmente para poder usar duraciones personalizadas
            for (const taskId of taskIdsToUpdate) {
               const customDuration = customDurations[taskId];
               const finalDuration = customDuration 
                  ? (customDuration.unit === "hours" ? customDuration.value * 60 : customDuration.value)
                  : undefined;

               const updateData: any = { status: "assigned" };
               if (finalDuration !== undefined) {
                  updateData.estimated_duration = finalDuration;
               }

               const { error: updateTaskError } = await supabase
                  .from("tasks")
                  .update(updateData)
                  .eq("id", taskId);

               if (updateTaskError) {
                  console.error(`Error al actualizar tarea ${taskId}:`, updateTaskError);
               }
            }

            // Obtener datos actualizados para historial
            const { data: updatedTasks, error: selectTaskError } = await supabase
               .from("tasks")
               .select("id, title, status")
               .in("id", taskIdsToUpdate);

            if (selectTaskError) {
               console.error("Error al obtener tareas actualizadas:", selectTaskError);
            } else {
               console.log("[SAVE] Tareas actualizadas a 'assigned':", updatedTasks);
               
               // Registrar en historial para cada tarea
               if (updatedTasks) {
                  const historyRecords = updatedTasks.map(task => ({
                     task_id: task.id,
                     subtask_id: null,
                     changed_by: user.id,
                     previous_status: 'pending',
                     new_status: 'assigned',
                     metadata: {
                        reason: 'Task assigned for daily work',
                        assigned_date: today
                     }
                  }));

                  const { error: historyError } = await supabase.from('status_history').insert(historyRecords);
                  
                  if (historyError) {
                     console.error('⚠️ [HISTORY] Error registrando asignación de tareas:', historyError);
                  } else {
                     console.log('✅ [HISTORY] Asignación de tareas registrada en historial');
                  }
               }
            }
         }

         // 7. Actualizar estado de tareas principales que tienen subtareas asignadas a "in_progress" y registrar en historial
         if (parentTasksOfSubtasks.size > 0) {
            const parentTaskIds = Array.from(parentTasksOfSubtasks);
            const { data: updatedParentTasks, error: updateParentError } = await supabase.from("tasks").update({ status: "in_progress" }).in("id", parentTaskIds).select("id, title, status");

            if (updateParentError) {
               console.error("Error al actualizar estado de tareas principales:", updateParentError);
            } else {
               console.log("[SAVE] Tareas principales de subtareas actualizadas a 'in_progress':", updatedParentTasks);
               
               // Registrar en historial para tareas padre
               if (updatedParentTasks) {
                  const historyRecords = updatedParentTasks.map(task => ({
                     task_id: task.id,
                     subtask_id: null,
                     changed_by: user.id,
                     previous_status: 'pending',
                     new_status: 'in_progress',
                     metadata: {
                        reason: 'Parent task moved to in_progress because subtasks were assigned',
                        assigned_date: today
                     }
                  }));

                  const { error: historyError } = await supabase.from('status_history').insert(historyRecords);
                  
                  if (historyError) {
                     console.error('⚠️ [HISTORY] Error registrando cambio de tareas padre:', historyError);
                  } else {
                     console.log('✅ [HISTORY] Cambio de tareas padre registrado en historial');
                  }
               }
            }
         }

         // Recargar los IDs de las tareas asignadas
         await fetchTodaysDailyTasks();

         // Limpiar las tareas seleccionadas
         setSelectedTasks([]);

         // Actualizar ambas listas de tareas ANTES de cambiar de pestaña
         await Promise.all([fetchProjectTasksAndSubtasks(), fetchAssignedTasks()]);

         // Pequeño delay para asegurar que todos los estados se actualicen
         await new Promise((resolve) => setTimeout(resolve, 2000));

         // Cambiar a la pestaña de gestión DESPUÉS de que se actualicen los datos
         setActiveTab("gestion");

         // Forzar una segunda actualización para asegurar que la UI refleje el cambio de estado
         setTimeout(async () => {
            await fetchProjectTasksAndSubtasks();
         }, 500);

         // Mostrar mensaje de éxito
         toast.success("Tareas asignadas correctamente");
      } catch (error) {
         console.error("Error saving daily tasks:", error);
         toast.error("Error al guardar las tareas. Por favor, intenta de nuevo.");
      } finally {
         setSaving(false);
      }
   }

   // Función para actualizar el estado de una tarea asignada
   async function handleUpdateTaskStatus(taskId: string, newStatus: string) {
      if (!user || !taskId) return;

      try {
         // Determinar si es tarea o subtarea
         const isSubtask = taskId.startsWith("subtask-");
         const originalId = isSubtask ? taskId.replace("subtask-", "") : taskId;
         const table = isSubtask ? "subtasks" : "tasks";

         // Actualizar el estado en la tabla de tareas/subtareas
         const { error: taskUpdateError } = await supabase.from(table).update({ status: newStatus }).eq("id", originalId);

         if (taskUpdateError) throw taskUpdateError;

         // También actualizar en task_work_assignments
         const today = format(new Date(), "yyyy-MM-dd");
         const taskType = isSubtask ? "subtask" : "task";

         // Construir la consulta base
         const query = supabase
            .from("task_work_assignments")
            .update({
               status: newStatus,
               updated_at: new Date().toISOString(),
               ...(newStatus === "completed" ? { end_time: new Date().toISOString() } : {}),
            })
            .eq("user_id", user.id)
            .eq("date", today)
            .eq("task_type", taskType);

         // Extender la consulta según el tipo de tarea
         const { error: assignmentUpdateError } = isSubtask ? await query.eq("subtask_id", originalId) : await query.eq("task_id", originalId);

         if (assignmentUpdateError) {
            console.error("Error al actualizar estado en asignaciones:", assignmentUpdateError);
         }

         // Si es una subtarea y se ha completado, verificar si todas las subtareas de la tarea principal están completadas
         if (isSubtask && newStatus === "completed") {
            // Obtener el ID de la tarea principal
            const { data: subtaskData, error: subtaskError } = await supabase.from("subtasks").select("task_id").eq("id", originalId).single();

            if (subtaskError) {
               console.error("Error al obtener tarea principal:", subtaskError);
            } else if (subtaskData && subtaskData.task_id) {
               const parentTaskId = subtaskData.task_id;

               // Verificar el estado de todas las subtareas de esta tarea principal
               const { data: allSubtasks, error: allSubtasksError } = await supabase.from("subtasks").select("id, status").eq("task_id", parentTaskId);

               if (allSubtasksError) {
                  console.error("Error al verificar estado de subtareas:", allSubtasksError);
               } else if (allSubtasks && allSubtasks.length > 0) {
                  // Verificar si todas las subtareas están completadas
                  const allCompleted = allSubtasks.every((subtask) => subtask.status === "completed" || subtask.status === "approved");

                  // Si todas las subtareas están completadas, actualizar la tarea principal a completada
                  if (allCompleted) {
                     const { error: updateParentError } = await supabase.from("tasks").update({ status: "completed" }).eq("id", parentTaskId);

                     if (updateParentError) {
                        console.error("Error al actualizar estado de tarea principal:", updateParentError);
                     } else {
                        // También actualizar el estado local si la tarea principal está en la lista
                        setAssignedTaskItems((prev) => prev.map((task) => (task.id === parentTaskId ? { ...task, status: "completed" } : task)));
                     }
                  } else {
                     // Si no todas están completadas, asegurar que la tarea principal esté en "in_progress"
                     const { error: updateParentError } = await supabase.from("tasks").update({ status: "in_progress" }).eq("id", parentTaskId);

                     if (updateParentError) {
                        console.error("Error al actualizar estado de tarea principal:", updateParentError);
                     }
                  }
               }
            }
         }

         // Actualizar el estado local
         setAssignedTaskItems((prev) => prev.map((task) => (task.id === taskId ? { ...task, status: newStatus } : task)));

         // Mensaje de confirmación
         toast.success(`Estado actualizado a: ${newStatus}`);
      } catch (error) {
         console.error("Error al actualizar estado:", error);
         toast.error("Error al actualizar el estado. Por favor, intenta de nuevo.");
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

      setLoadingAssigned(true);

      try {
         const today = format(new Date(), "yyyy-MM-dd");

         // 1. Primero, obtener todas las asignaciones de trabajo desde task_work_assignments
         let assignmentsQ = supabase.from("task_work_assignments").select("*").eq("user_id", user.id).not("status", "in", "('completed', 'in_review', 'approved')");

         // Solo aplicar filtro de proyecto si no estamos en "all"
         if (projectId !== "all") {
            assignmentsQ = assignmentsQ.in("project_id", [projectId]);
         }

         const { data: assignments, error: assignmentsError } = await assignmentsQ;

         if (assignmentsError) {
            console.error("Error al cargar asignaciones:", assignmentsError);
            setAssignedTaskItems([]);
            setDelayedTaskItems([]);
            setReturnedTaskItems([]);
            setLoadingAssigned(false);
            return;
         }

         console.log("[ASSIGNED] Asignaciones de trabajo para el usuario:", assignments);

         if (!assignments) {
            setAssignedTaskItems([]);
            setDelayedTaskItems([]);
            setReturnedTaskItems([]);
            setLoadingAssigned(false);
            return;
         }

         // 2. Obtener IDs de tareas y subtareas
         const normalTaskIds = assignments.filter((a) => a.task_type === "task" && a.task_id !== null).map((a) => a.task_id);

         const subtaskIds = assignments.filter((a) => a.task_type === "subtask" && a.subtask_id !== null).map((a) => a.subtask_id);

         // 3. Buscar tareas devueltas en la tabla tasks
         let returnedTasks = null;
         let returnedTasksError = null;

         if (normalTaskIds.length > 0) {
            const result = await supabase.from("tasks").select("*").in("id", normalTaskIds).eq("status", "returned");

            returnedTasks = result.data;
            returnedTasksError = result.error;
         }

         if (returnedTasksError) {
            console.error("Error al cargar tareas devueltas:", returnedTasksError);
         }

         // 4. Buscar subtareas devueltas en la tabla subtasks
         let returnedSubtasks = null;
         let returnedSubtasksError = null;

         if (subtaskIds.length > 0) {
            const result = await supabase
               .from("subtasks")
               .select(
                  `
            *,
            tasks (
              id, title, is_sequential, project_id
            )
          `
               )
               .in("id", subtaskIds)
               .eq("status", "returned");

            returnedSubtasks = result.data;
            returnedSubtasksError = result.error;
         }

         if (returnedSubtasksError) {
            console.error("Error al cargar subtareas devueltas:", returnedSubtasksError);
         }

         // 5. Crear un mapa de tareas/subtareas devueltas para fácil acceso
         const returnedItemsMap = new Map();

         // Mapear tareas devueltas
         returnedTasks?.forEach((task) => {
            returnedItemsMap.set(task.id, {
               status: "returned",
               notes: task.notes,
            });
         });

         // Mapear subtareas devueltas
         returnedSubtasks?.forEach((subtask) => {
            returnedItemsMap.set(subtask.id, {
               status: "returned",
               notes: subtask.notes,
            });
         });

         // Array para todas las tareas asignadas
         let allAssignedItems: Task[] = [];
         let todayAssignedItems: Task[] = [];
         let delayedAssignedItems: Task[] = [];
         let returnedItems: Task[] = []; // Nueva lista para tareas devueltas
         let blockedItems: Task[] = []; // Nueva lista para tareas bloqueadas
         let totalPendingTime = 0;
         let totalDelayTime = 0;
         let totalDelayDays = 0;
         let delayCount = 0;

         // Construir Set de project_ids para luego pedir sus nombres
         const projectIds = new Set<string>();

         // Recopilar IDs de proyectos de todas las asignaciones
         assignments?.forEach((a) => {
            if (a.project_id) projectIds.add(a.project_id);
         });

         // Cargar nombre de cada proyecto
         const { data: projects, error: projectsError } = await supabase.from("projects").select("id, name").in("id", Array.from(projectIds));

         if (projectsError) {
            console.error("Error cargando nombres de proyectos:", projectsError);
         }

         const projectMap: Record<string, string> = {};
         projects?.forEach((p) => (projectMap[p.id] = p.name));

         // ... resto del código como antes para obtener detalles de tareas normales ...

         // Obtener detalles de tareas normales
         if (normalTaskIds.length > 0) {
            const { data: taskData, error: taskError } = await supabase.from("tasks").select("*").in("id", normalTaskIds);

            if (taskError) {
               console.error("Error al cargar tareas asignadas:", taskError);
            } else if (taskData && taskData.length > 0) {
               const formattedTasks = taskData.map((task) => {
                  // Buscar la asignación correspondiente para obtener status actualizado
                  const assignment = assignments.find((a) => a.task_id === task.id && a.task_type === "task");

                  // Verificar si esta tarea está en la lista de devueltas
                  const returnedInfo = returnedItemsMap.get(task.id);
                  const isActuallyReturned = returnedInfo || task.status === "returned";

                  const formattedTask: Task = {
                     id: task.id,
                     original_id: task.id,
                     title: task.title,
                     description: task.description,
                     priority: task.priority,
                     estimated_duration: task.estimated_duration,
                     start_date: task.start_date,
                     deadline: task.deadline,
                     status: task.status, // Usar siempre el estado de la tabla principal
                     is_sequential: task.is_sequential,
                     project_id: task.project_id,
                     projectName: projectMap[task.project_id] || "Sin proyecto",
                     type: "task",
                     assignment_date: assignment?.date || today,
                     notes: isActuallyReturned ? returnedInfo?.notes || task.notes : assignment?.notes || task.notes,
                  };

                  // Calcular duración estimada en horas
                  const durationHours = Math.round((task.estimated_duration / 60) * 100) / 100;

                  // Clasificar solo si la tarea no está en un estado final
                  // USAR EL ESTADO DE LA ASIGNACIÓN (assignment?.status) EN LUGAR DEL ESTADO DE LA TAREA
                  if (!["completed", "approved", "in_review"].includes(assignment?.status || formattedTask.status)) {
                     totalPendingTime += durationHours;

                     // Clasificar por estado
                     if (formattedTask.status === "blocked") {
                        blockedItems.push(formattedTask);
                     } else if (isActuallyReturned) {
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
               .from("subtasks")
               .select(
                  `
            *,
            tasks (
              id, title, is_sequential, project_id
            )
          `
               )
               .in("id", subtaskIds);

            if (subtaskError) {
               console.error("Error al cargar subtareas asignadas:", subtaskError);
            } else if (subtaskData && subtaskData.length > 0) {
               const formattedSubtasks = subtaskData.map((subtask) => {
                  // Buscar la asignación correspondiente para obtener status actualizado
                  const assignment = assignments.find((a) => a.subtask_id === subtask.id && a.task_type === "subtask");

                  // Verificar si esta subtarea está en la lista de devueltas
                  const returnedInfo = returnedItemsMap.get(subtask.id);
                  const isActuallyReturned = returnedInfo || subtask.status === "returned";

                  const formattedSubtask: Task = {
                     id: `subtask-${subtask.id}`,
                     original_id: subtask.id,
                     title: subtask.title,
                     subtask_title: subtask.tasks?.title || "Tarea principal",
                     description: subtask.description,
                     priority: "medium", // Type assertion
                     estimated_duration: subtask.estimated_duration,
                     start_date: subtask.start_date || "",
                     deadline: subtask.deadline || "",
                     status: subtask.status, // Usar siempre el estado de la tabla principal
                     is_sequential: false,
                     project_id: subtask.tasks?.project_id || "",
                     projectName: projectMap[subtask.tasks?.project_id || ""] || "Sin proyecto",
                     type: "subtask",
                     assignment_date: assignment?.date || today,
                     notes: isActuallyReturned ? returnedInfo?.notes || subtask.notes : assignment?.notes || subtask.notes,
                  };

                  // Calcular duración estimada en horas
                  const durationHours = Math.round((subtask.estimated_duration / 60) * 100) / 100;

                  // Clasificar según el estado
                  // USAR EL ESTADO DE LA ASIGNACIÓN (assignment?.status) EN LUGAR DEL ESTADO DE LA SUBTAREA
                  if (!["completed", "approved", "in_review"].includes(assignment?.status || formattedSubtask.status)) {
                     totalPendingTime += durationHours;

                     // Clasificar por estado
                     if (formattedSubtask.status === "blocked") {
                        blockedItems.push(formattedSubtask);
                     } else if (isActuallyReturned) {
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

         // Actualizar estados
         setAssignedTaskItems(todayAssignedItems);
         setDelayedTaskItems(delayedAssignedItems);
         setReturnedTaskItems(returnedItems);
         setBlockedTaskItems(blockedItems);
         setTotalAssignedTime(totalPendingTime);
         setTotalDelayedTime(totalDelayTime);
         setTotalDelayedDays(avgDelayDays);

         // Verificar y eliminar tareas que ya están en completadas
         if (completedTaskItems.length > 0) {
            removeCompletedFromPendingLists(completedTaskItems);
         }
      } catch (error) {
         console.error("Error al cargar tareas asignadas:", error);
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
      selectedTask = [...assignedTaskItems, ...delayedTaskItems, ...returnedTaskItems].find((task) => task.id === taskId);

      // Si no está en las tareas pendientes, buscar en las completadas
      if (!selectedTask) {
         selectedTask = completedTaskItems.find((task) => task.id === taskId);
         isEditing = selectedTask?.status === "completed";
      }

      setTaskForStatusUpdate(selectedTask || null);

      const estimatedDuration = selectedTask ? selectedTask.estimated_duration : 0;

      // Si estamos editando una tarea completada, extraer los datos de las notas
      let actualDuration = estimatedDuration;
      let durUnit: "minutes" | "hours" = "minutes";
      let details = "";
      let durReason = "";

      if (isEditing && selectedTask?.notes) {
         const metadata = typeof selectedTask.notes === "object" ? selectedTask.notes : {};
         details = metadata.entregables || metadata.notes || "";
         actualDuration = metadata.duracion_real || estimatedDuration;
         durUnit = metadata.unidad_original || "minutes";
         durReason = metadata.razon_duracion || "";
      }

      setSelectedTaskId(taskId);
      setSelectedStatus(isEditing ? "completed" : "completed");
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
         // 1. Get parent task's current state first
         const { data: parentTask, error: parentError } = await supabase.from("tasks").select("status").eq("id", parentId).single();

         if (parentError) {
            console.error(`[HISTORY] Could not get parent task ${parentId} for history logging`, parentError);
            // Do not proceed if we can't get the parent task, to avoid inconsistent state.
            return;
         }
         const previousStatus = parentTask.status;

         // 2. Check status of all its subtasks
         const { data: subtasks, error: subError } = await supabase.from("subtasks").select("status").eq("task_id", parentId);
         if (subError) throw subError;

         const allSubtasksDone = subtasks!.every((s) => ["approved"].includes(s.status));

         const newStatus = allSubtasksDone ? "completed" : "in_progress";

         // 4. If the status needs to change, update and log it.
         if (previousStatus !== newStatus) {
            const { error: updateError } = await supabase.from("tasks").update({ status: newStatus }).eq("id", parentId);

            if (updateError) throw updateError;

            // Log the implicit status change
            const historyRecord = {
               task_id: parentId,
               subtask_id: null,
               changed_by: user!.id, // Action was triggered by this user
               previous_status: previousStatus,
               new_status: newStatus,
               metadata: {
                  reason: allSubtasksDone ? "All subtasks finished." : "A subtask was finished, parent task is in progress.",
                  triggering_action: "subtask_completion",
               },
            };

            const { error: historyError } = await supabase.from("status_history").insert([historyRecord]);

            if (historyError) {
               console.error("⚠️ [HISTORY] Could not log implicit parent task status change:", historyError);
            } else {
               console.log("✅ [HISTORY] Cambio de estado registrado:", historyRecord);
            }
         }
      } catch (e) {
         console.error("Error actualizando tarea padre:", e);
      }
   }

   async function handleSubmitStatus() {
      // 1️⃣ Validaciones tempranas
      if (!selectedTaskId) return setStatusError("Por favor, selecciona la tarea");
      if (!selectedStatus) return setStatusError("Por favor, selecciona un estado válido");
      if (["completed", "blocked", "in_progress"].includes(selectedStatus) && !statusDetails.trim()) {
         return setStatusError(
            selectedStatus === "completed" 
               ? "Por favor, detalla los entregables o resultados" 
               : selectedStatus === "in_progress"
                  ? "Por favor, describe el progreso realizado"
                  : "Por favor, explica el motivo del bloqueo"
         );
      }
      if ((selectedStatus === "completed" || selectedStatus === "in_progress") && actualDuration <= 0) {
         return setStatusError("Por favor, indica el tiempo trabajado");
      }

      // 2️⃣ Preparar IDs y tipos
      const isSubtask = selectedTaskId.startsWith("subtask-");
      const originalId = isSubtask ? selectedTaskId.replace("subtask-", "") : selectedTaskId;
      const table = isSubtask ? "subtasks" : "tasks";
      const taskType = isSubtask ? "subtask" : "task";
      const today = format(new Date(), "yyyy-MM-dd");
      const durationMin = durationUnit === "hours" ? Math.round(actualDuration * 60) : actualDuration;

      // 3️⃣ Construir objeto de metadata
      const metadata: any = {
         notes: statusDetails,
         ...(selectedStatus === "completed" 
            ? { entregables: statusDetails, duracion_real: durationMin, unidad_original: durationUnit, razon_duracion: durationReason }
            : selectedStatus === "in_progress"
               ? { progreso: statusDetails, tiempo_sesion: durationMin, unidad_original: durationUnit, necesidades: durationReason }
               : { razon_bloqueo: statusDetails }
         ),
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
                  notes: typeof metadata === "string" ? metadata : JSON.stringify(metadata),
               })
               .eq("id", originalId),

            // Actualizar la asignación en task_work_assignments
            supabase
               .from("task_work_assignments")
               .update({
                  status: selectedStatus,
                  updated_at: new Date().toISOString(),
                  notes: metadata, // SIN JSON.stringify
                  ...(selectedStatus === "completed" ? { end_time: new Date().toISOString(), actual_duration: durationMin } : {}),
               })
               .eq("user_id", user!.id)
               .eq("task_type", taskType)
               .eq(isSubtask ? "subtask_id" : "task_id", originalId),
         ];

         // Ejecutar todas las actualizaciones en paralelo
         const [taskRes, assignRes] = await Promise.all(promises);

         if (taskRes.error || assignRes.error) {
            throw taskRes.error || assignRes.error;
         }

         // 5️⃣ Registrar el cambio de estado en la nueva tabla de historial
         if (taskForStatusUpdate) {
            const historyRecord = {
               task_id: isSubtask ? null : originalId,
               subtask_id: isSubtask ? originalId : null,
               changed_by: user!.id,
               previous_status: taskForStatusUpdate.status,
               new_status: selectedStatus,
               metadata: metadata,
            };

            const { error: historyError } = await supabase.from("status_history").insert([historyRecord]);

            if (historyError) {
               // Loggear el error pero no bloquear el flujo del usuario
               console.error("⚠️ [HISTORY] No se pudo registrar el cambio de estado:", historyError);
            } else {
               console.log("✅ [HISTORY] Cambio de estado registrado:", historyRecord);
            }
         }

         // 🔔 Enviar notificación a administradores solo si la tarea fue completada o bloqueada
         if (["completed", "blocked"].includes(selectedStatus) && taskForStatusUpdate) {
            try {
               // Preparar datos para la notificación
               let parentTaskTitle = undefined;
               if (isSubtask && taskForStatusUpdate.subtask_title) {
                  parentTaskTitle = taskForStatusUpdate.subtask_title;
               }

               // Obtener el área del usuario actual
               let userAreaName = "Sin área";
               try {
                  const { data: userAreas, error: areaError } = await supabase
                     .rpc('get_areas_by_user', { user_uuid: user!.id });
                  
                  if (!areaError && userAreas && userAreas.length > 0) {
                     userAreaName = userAreas[0].area_name || "Sin área";
                  }
               } catch (error) {
                  console.error("Error obteniendo área del usuario:", error);
               }

               const notificationData = {
                  taskTitle: taskForStatusUpdate.title,
                  userName: user!.name || user!.email,
                  projectName: taskForStatusUpdate.projectName || "Proyecto sin nombre",
                  areaName: userAreaName,
                  status: selectedStatus,
                  isSubtask: isSubtask,
                  parentTaskTitle: parentTaskTitle,
                  taskId: originalId, // Agregar el ID de la tarea para obtener información de tiempo
                  ...(selectedStatus === "blocked" ? { blockReason: statusDetails } : {})
               };

               // Enviar notificación asíncrona (no bloquear el flujo del usuario)
               fetch('/api/telegram/admin-notification', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(notificationData)
               }).then(response => {
                  if (response.ok) {
                     console.log(`✅ [NOTIFICATION] Notificación de admin enviada para tarea ${selectedStatus}`);
                  } else {
                     console.warn(`⚠️ [NOTIFICATION] Error al enviar notificación de admin: ${response.status}`);
                  }
               }).catch(error => {
                  console.error('🚨 [NOTIFICATION] Error al enviar notificación de admin:', error);
               });

            } catch (notificationError) {
               // No bloquear el flujo del usuario por errores de notificación
               console.error('🚨 [NOTIFICATION] Error preparando notificación de admin:', notificationError);
            }
         }

         // 6️⃣ Si era subtarea completada, actualiza la tarea padre
         if (isSubtask && selectedStatus === "completed") {
            const { data: subtaskData } = await supabase.from("subtasks").select("task_id").eq("id", originalId).single();
            if (subtaskData?.task_id) await updateParentTaskStatus(subtaskData.task_id);
         }

         // 7️⃣ Refrescar estado local
         // Determinar de qué lista proviene la tarea
         const isInReturned = returnedTaskItems.some((t) => t.id === selectedTaskId);
         const isInAssigned = assignedTaskItems.some((t) => t.id === selectedTaskId);
         const isInDelayed = delayedTaskItems.some((t) => t.id === selectedTaskId);

         if (selectedStatus === "completed") {
            // Si la tarea se marcó como completada, removerla de todas las listas de pendientes
            if (isInReturned) {
               setReturnedTaskItems((prev) => prev.filter((t) => t.id !== selectedTaskId));
            }
            if (isInAssigned) {
               setAssignedTaskItems((prev) => prev.filter((t) => t.id !== selectedTaskId));
            }
            if (isInDelayed) {
               setDelayedTaskItems((prev) => prev.filter((t) => t.id !== selectedTaskId));
            }

            // Recargar las tareas completadas para incluir la nueva
            console.log("🔄 [SUBMIT STATUS] Recargando tareas completadas después de marcar como completada");
            fetchCompletedTasks();

            // Agregar un pequeño delay y una segunda verificación para asegurar consistencia
            setTimeout(() => {
               // Verificar si la tarea aún aparece en las listas pendientes después de completarla
               if (assignedTaskItems.some(t => t.id === selectedTaskId) || 
                   delayedTaskItems.some(t => t.id === selectedTaskId) || 
                   returnedTaskItems.some(t => t.id === selectedTaskId)) {
                  console.warn("🚨 [CONSISTENCY CHECK] Tarea completada aún aparece en listas pendientes, forzando recarga");
                  fetchAssignedTasks();
               }
            }, 1000);
         } else {
            // Si se marcó con otro estado, actualizar el estado en la lista correspondiente
            if (isInReturned) {
               setReturnedTaskItems((prev) => prev.map((t) => (t.id === selectedTaskId ? { ...t, status: selectedStatus, notes: metadata } : t)));
            }
            if (isInAssigned) {
               setAssignedTaskItems((prev) => prev.map((t) => (t.id === selectedTaskId ? { ...t, status: selectedStatus, notes: metadata } : t)));
            }
            if (isInDelayed) {
               setDelayedTaskItems((prev) => prev.map((t) => (t.id === selectedTaskId ? { ...t, status: selectedStatus, notes: metadata } : t)));
            }
         }

         setShowStatusModal(false);
         setTaskForStatusUpdate(null);

         // Si es avance, mostrar modal de continuación
         if (selectedStatus === "in_progress" && taskForStatusUpdate) {
            setTaskForContinue(taskForStatusUpdate);
            setShowContinueModal(true);
         }

         // Toast de éxito
         const statusMessages = {
            completed: "✅ Tarea completada con éxito!",
            in_progress: "⏳ Avance registrado con éxito!",
            blocked: "🚫 Tarea bloqueada con éxito!"
         };
         toast.success(statusMessages[selectedStatus as keyof typeof statusMessages] || "Estado actualizado con éxito!");
      } catch (error) {
         setStatusError("Error al actualizar el estado. Inténtalo de nuevo.");
      }
   }

   async function fetchCompletedTasks() {
      if (!user || !projectId) {
         setCompletedTaskItems([]);
         setInReviewTaskItems([]);
         setApprovedTaskItems([]);
         setLoadingCompleted(false);
         return;
      }

      try {
         setLoadingCompleted(true);

         let completedTaskAssignmentsQuery = supabase.from("task_work_assignments").select("*").eq("user_id", user.id).in("status", ["completed", "in_review", "approved"]);

         // Solo aplicar filtro de proyecto si no estamos en "all"
         if (projectId !== "all") {
            completedTaskAssignmentsQuery = completedTaskAssignmentsQuery.eq("project_id", projectId);
         }

         const { data: completedTaskAssignments, error: assignmentsError } = await completedTaskAssignmentsQuery;

         if (assignmentsError) {
            console.error("Error al cargar tareas completadas:", assignmentsError);
            setCompletedTaskItems([]);
            setInReviewTaskItems([]);
            setApprovedTaskItems([]);
            setLoadingCompleted(false);
            return;
         }

         console.log("[COMPLETED] Asignaciones de tareas completadas:", completedTaskAssignments);

         // Verificar si hay datos
         if (!completedTaskAssignments) {
            setCompletedTaskItems([]);
            setInReviewTaskItems([]);
            setApprovedTaskItems([]);
            setLoadingCompleted(false);
            return;
         }

         // Array para todas las tareas completadas
         let allCompletedItems: Task[] = [];

         // IDs de tareas y subtareas completadas
         const normalTaskIds = completedTaskAssignments.filter((a) => a.task_type === "task" && a.task_id !== null).map((a) => a.task_id);

         const subtaskIds = completedTaskAssignments.filter((a) => a.task_type === "subtask" && a.subtask_id !== null).map((a) => a.subtask_id);

         // Obtener detalles de tareas completadas
         if (normalTaskIds.length > 0) {
            const { data: taskData, error: taskError } = await supabase.from("tasks").select("*").in("id", normalTaskIds);

            if (taskError) {
               console.error("Error al cargar tareas completadas:", taskError);
            } else if (taskData && taskData.length > 0) {
               // Construir Set de project_ids para luego pedir sus nombres
               const projectIds = new Set<string>();

               // Recopilar IDs de proyectos
               taskData.forEach((task) => {
                  if (task.project_id) projectIds.add(task.project_id);
               });

               // Cargar nombre de cada proyecto
               const { data: projects, error: projectsError } = await supabase.from("projects").select("id, name").in("id", Array.from(projectIds));

               if (projectsError) {
                  console.error("Error cargando nombres de proyectos:", projectsError);
               }

               const projectMap: Record<string, string> = {};
               projects?.forEach((p) => (projectMap[p.id] = p.name));

               const formattedTasks = taskData.map((task) => {
                  // Buscar la asignación correspondiente para obtener metadata
                  const assignment = completedTaskAssignments.find((a) => a.task_id === task.id && a.task_type === "task");

                  return {
                     id: task.id,
                     original_id: task.id,
                     title: task.title,
                     description: task.description,
                     priority: task.priority as "low" | "medium" | "high",
                     estimated_duration: task.estimated_duration,
                     start_date: task.start_date,
                     deadline: task.deadline,
                     status: task.status, // Usar el estado real de la tarea
                     is_sequential: task.is_sequential,
                     project_id: task.project_id,
                     projectName: projectMap[task.project_id] || "Sin proyecto",
                     type: "task" as const,
                     assignment_date: assignment?.date || "",
                     notes: assignment?.notes || task.notes || "",
                  };
               });

               allCompletedItems = [...allCompletedItems, ...formattedTasks];
            }
         }

         // Obtener detalles de subtareas completadas
         if (subtaskIds.length > 0) {
            const { data: subtaskData, error: subtaskError } = await supabase
               .from("subtasks")
               .select(
                  `
            *,
            tasks (
              id, title, is_sequential, project_id
            )
          `
               )
               .in("id", subtaskIds);

            if (subtaskError) {
               console.error("Error al cargar subtareas completadas:", subtaskError);
            } else if (subtaskData && subtaskData.length > 0) {
               // Construir Set de project_ids para luego pedir sus nombres
               const projectIds = new Set<string>();

               // Recopilar IDs de proyectos de subtareas
               subtaskData.forEach((subtask) => {
                  if (subtask.tasks?.project_id) projectIds.add(subtask.tasks.project_id);
               });

               // Cargar nombre de cada proyecto
               const { data: projects, error: projectsError } = await supabase.from("projects").select("id, name").in("id", Array.from(projectIds));

               if (projectsError) {
                  console.error("Error cargando nombres de proyectos:", projectsError);
               }

               const projectMap: Record<string, string> = {};
               projects?.forEach((p) => (projectMap[p.id] = p.name));

               const formattedSubtasks = subtaskData.map((subtask) => {
                  // Buscar la asignación correspondiente para obtener metadata
                  const assignment = completedTaskAssignments.find((a) => a.subtask_id === subtask.id && a.task_type === "subtask");

                  return {
                     id: `subtask-${subtask.id}`,
                     original_id: subtask.id,
                     title: subtask.title,
                     subtask_title: subtask.tasks?.title || "Tarea principal",
                     description: subtask.description,
                     priority: "medium" as const,
                     estimated_duration: subtask.estimated_duration,
                     start_date: subtask.start_date || "",
                     deadline: subtask.deadline || "",
                     status: subtask.status, // Usar el estado real de la subtarea
                     is_sequential: false,
                     project_id: subtask.tasks?.project_id || "",
                     projectName: projectMap[subtask.tasks?.project_id || ""] || "Sin proyecto",
                     type: "subtask" as const,
                     assignment_date: assignment?.date || "",
                     notes: assignment?.notes || subtask.notes || "",
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

         const submitted: Task[] = [];
         const inReview: Task[] = [];
         const approved: Task[] = [];

         sortedCompletedItems.forEach((task) => {
            switch (task.status) {
               case "in_review":
                  inReview.push(task);
                  break;
               case "approved":
                  approved.push(task);
                  break;
               case "completed":
               default:
                  submitted.push(task);
                  break;
            }
         });

         setCompletedTaskItems(submitted);
         setInReviewTaskItems(inReview);
         setApprovedTaskItems(approved);

         console.log("[COMPLETED] Tareas Entregadas:", submitted);
         console.log("[IN_REVIEW] Tareas en Revisión:", inReview);
         console.log("[APPROVED] Tareas Aprobadas:", approved);

         // Después de actualizar las tareas completadas, eliminar duplicados de listas pendientes
         removeCompletedFromPendingLists(sortedCompletedItems);
      } catch (error) {
         console.error("Error al cargar tareas completadas:", error);
      } finally {
         setLoadingCompleted(false);
      }
   }

   // Función para eliminar tareas completadas de las listas de pendientes
   function removeCompletedFromPendingLists(completedTasks: Task[]) {
      const completedIds = new Set(completedTasks.map((task) => task.id));

      // Verificar si hay tareas en las listas de pendientes que ya están en completadas
      const duplicatesInAssigned = assignedTaskItems.filter((task) => completedIds.has(task.id));
      const duplicatesInDelayed = delayedTaskItems.filter((task) => completedIds.has(task.id));
      const duplicatesInReturned = returnedTaskItems.filter((task) => completedIds.has(task.id));

      if (duplicatesInAssigned.length > 0 || duplicatesInDelayed.length > 0 || duplicatesInReturned.length > 0) {
         console.warn("🧹 [CLEAN] Eliminando tareas completadas de listas pendientes:", {
            enAsignadas: duplicatesInAssigned.map((t) => t.id),
            enRetrasadas: duplicatesInDelayed.map((t) => t.id),
            enDevueltas: duplicatesInReturned.map((t) => t.id),
         });

         // Filtrar las listas para quitar las tareas completadas
         setAssignedTaskItems((prev) => prev.filter((task) => !completedIds.has(task.id)));
         setDelayedTaskItems((prev) => prev.filter((task) => !completedIds.has(task.id)));
      }
   }

   const handleDailyTasksChange = (newDailyTasksIds: string[]) => {
      setDailyTasksIds(newDailyTasksIds);
   };

   // Función para ver la retroalimentación de una tarea devuelta
   async function handleViewReturnedFeedback(task: Task) {
      setSelectedReturnedTask(task);

      try {
         // Crear un objeto para las notas actualizadas
         let updatedNotes: TaskNotes = {};

         // Si la tarea ya tiene notas como objeto, usarlas como base
         if (task.notes && typeof task.notes === "object") {
            updatedNotes = { ...task.notes };
         }

         if (task.type === "subtask" && task.original_id) {
            // Si es una subtarea, obtener datos adicionales de la tabla subtasks
            const { data, error } = await supabase.from("subtasks").select("*").eq("id", task.original_id).single();

            if (error) {
               console.error("Error al obtener datos de retroalimentación para subtarea", error);
            } else if (data) {
               // Verifica si feedback está disponible y es un objeto
               if (data.feedback) {
                  let feedbackData = data.feedback;

                  // Si feedback es un string pero parece JSON, intenta parsearlo
                  if (typeof data.feedback === "string" && (data.feedback.startsWith("{") || data.feedback.startsWith("["))) {
                     try {
                        feedbackData = JSON.parse(data.feedback);
                     } catch (parseError) {
                        console.error("Error al parsear feedback JSON:", parseError);
                        // Usar como string simple si falla el parseo
                        feedbackData = { feedback: data.feedback };
                     }
                  } else if (typeof data.feedback === "object") {
                     // Ya es un objeto, usarlo como está
                  } else {
                     // Es un string simple, crear un objeto con él
                     feedbackData = { feedback: data.feedback };
                  }

                  // Extraer los datos del feedback
                  if (typeof feedbackData === "object") {
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
                  if (typeof data.notes === "string" && (data.notes.startsWith("{") || data.notes.startsWith("["))) {
                     try {
                        notesObj = JSON.parse(data.notes);
                     } catch (parseError) {
                        console.error("Error al parsear notes JSON:", parseError);
                        // Usar como string simple si falla
                        notesObj = { notes: data.notes };
                     }
                  }

                  // Si ahora es un objeto, extraer la información
                  if (typeof notesObj === "object") {
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
               .from("tasks")
               .select("*")
               .eq("id", task.original_id || task.id)
               .single();

            if (error) {
            } else if (data) {
               // Verifica si feedback está disponible y es un objeto
               if (data.feedback) {
                  let feedbackData = data.feedback;

                  // Si feedback es un string pero parece JSON, intenta parsearlo
                  if (typeof data.feedback === "string" && (data.feedback.startsWith("{") || data.feedback.startsWith("["))) {
                     try {
                        feedbackData = JSON.parse(data.feedback);
                     } catch (parseError) {
                        // Usar como string simple si falla el parseo
                        feedbackData = { feedback: data.feedback };
                     }
                  } else if (typeof data.feedback === "object") {
                     // Ya es un objeto, usarlo como está
                  } else {
                     // Es un string simple, crear un objeto con él
                     feedbackData = { feedback: data.feedback };
                  }

                  // Extraer los datos del feedback
                  if (typeof feedbackData === "object") {
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
                  if (typeof data.notes === "string" && (data.notes.startsWith("{") || data.notes.startsWith("["))) {
                     try {
                        notesObj = JSON.parse(data.notes);
                     } catch (parseError) {
                        console.error("Error al parsear notes JSON:", parseError);
                        // Usar como string simple si falla
                        notesObj = { notes: data.notes };
                     }
                  }

                  // Si ahora es un objeto, extraer la información
                  if (typeof notesObj === "object") {
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
         console.log("[FEEDBACK] Notas actualizadas para la tarea devuelta:", updatedNotes);

         // Actualizar la tarea seleccionada con las notas actualizadas
         setSelectedReturnedTask({
            ...task,
            notes: updatedNotes,
         });
      } catch (error) {
         console.error("Error al procesar datos de retroalimentación:", error);
      }

      // Mostrar el modal
      setShowReturnedFeedbackModal(true);
   }

   function handleShowUnassignConfirmModal(taskId: string) {
      // Buscar en todas las listas de tareas pendientes
      const task = [...assignedTaskItems, ...delayedTaskItems, ...returnedTaskItems].find((t) => t.id === taskId);
      if (task) {
         console.log(`[UNASSIGN] Preparando desasignación para tarea: ${task.title}, ID: ${taskId}, fecha de asignación: ${task.assignment_date}`);
         setTaskToUnassign(task);
         setShowUnassignConfirmModal(true);
      } else {
         console.error(`[UNASSIGN] No se encontró la tarea con ID: ${taskId} en las listas de tareas pendientes`);
         toast.error("No se pudo encontrar la tarea para desasignar.");
      }
   }

   function handleConfirmUnassign() {
      if (taskToUnassign) {
         handleUnassignTask(taskToUnassign.id);
      }
      setShowUnassignConfirmModal(false);
      setTaskToUnassign(null);
   }

   async function handleUnassignTask(taskId: string) {
      if (!user) {
         toast.error("No se pudo verificar el usuario.");
         return;
      }

      setSaving(true);

      try {
         const isSubtask = taskId.startsWith("subtask-");
         const originalId = isSubtask ? taskId.replace("subtask-", "") : taskId;
         const table = isSubtask ? "subtasks" : "tasks";
         const taskType = isSubtask ? "subtask" : "task";

         // Encontrar la tarea para obtener su fecha de asignación real
         const taskToUnassignData = [...assignedTaskItems, ...delayedTaskItems, ...returnedTaskItems].find(t => t.id === taskId);
         const assignmentDate = taskToUnassignData?.assignment_date || format(new Date(), "yyyy-MM-dd");

         console.log(`[UNASSIGN] Desasignando tarea: ${taskId}, tipo: ${taskType}, fecha de asignación: ${assignmentDate}, originalId: ${originalId}`);

         // 1. Delete from task_work_assignments using the actual assignment date
         const deleteQuery = supabase.from("task_work_assignments").delete().eq("user_id", user.id).eq("date", assignmentDate).eq("task_type", taskType);

         const { error: deleteError } = isSubtask ? await deleteQuery.eq("subtask_id", originalId) : await deleteQuery.eq("task_id", originalId);

         if (deleteError) {
            console.error(`[UNASSIGN] Error al eliminar de task_work_assignments:`, deleteError);
            throw deleteError;
         }

         console.log(`[UNASSIGN] Eliminación exitosa de task_work_assignments`);

         // 2. Update task/subtask status back to "pending"
         console.log(`[UNASSIGN] Actualizando estado a 'pending' en tabla ${table} para ID ${originalId}`);

         // 2. Update task/subtask status back to "pending"
         const { error: updateError } = await supabase.from(table).update({ status: "pending" }).eq("id", originalId);

         if (updateError) {
            console.warn("Could not reset task status to pending, but it was unassigned.", updateError);
         }

         // 3. If it was a subtask, check if parent task status needs to be reverted.
         if (isSubtask) {
            const { data: subtaskData } = await supabase.from("subtasks").select("task_id").eq("id", originalId).single();

            if (subtaskData && subtaskData.task_id) {
               const parentId = subtaskData.task_id;
               const { data: siblingSubtasks } = await supabase.from("subtasks").select("status").eq("task_id", parentId);

               if (siblingSubtasks) {
                  const anyInProgress = siblingSubtasks.some((s) => s.status !== "pending");
                  if (!anyInProgress) {
                     await supabase.from("tasks").update({ status: "pending" }).eq("id", parentId);
                     console.log(`Parent task ${parentId} reverted to pending.`);
                  }
               }
            }
         }

         console.log(`[UNASSIGN] Proceso de desasignación completado exitosamente`);
         toast.success("Tarea desasignada correctamente.");

         // 4. Refresh data
         console.log(`[UNASSIGN] Recargando datos...`);
         await Promise.all([fetchProjectTasksAndSubtasks(), fetchAssignedTasks()]);
         console.log(`[UNASSIGN] Datos recargados exitosamente`);
      } catch (error) {
         console.error("[UNASSIGN] Error completo al desasignar tarea:", error);
         toast.error("Hubo un error al desasignar la tarea.");
      } finally {
         setSaving(false);
      }
   }

   // Función para programar tarea para mañana después de reportar avance
   function handleScheduleForTomorrow() {
      if (!taskForContinue) return;

      // Cerrar modal de continuación y abrir selector de tiempo para mañana
      setShowContinueModal(false);
      setCurrentTaskForTime(taskForContinue);
      setTaskForContinue(null);
      setSchedulingForTomorrow(true); // Importante: marcar que es para mañana
      setShowTimeModal(true);
   }

   // Función para programar más tarde hoy después de reportar avance
   function handleScheduleLaterToday() {
      if (!taskForContinue) return;

      // Cerrar modal de continuación y abrir selector de tiempo para hoy
      setShowContinueModal(false);
      setCurrentTaskForTime(taskForContinue);
      setTaskForContinue(null);
      setSchedulingForTomorrow(false); // Importante: marcar que es para hoy
      setShowTimeModal(true);
   }

   // Función para verificar si una tarea tiene avances registrados
   function taskHasProgress(task: Task): boolean {
      if (!task.notes) return false;
      
      try {
         const notes = typeof task.notes === 'string' ? JSON.parse(task.notes) : task.notes;
         // Si tiene metadata de progreso significa que se ha reportado avance
         return Boolean(notes.progreso || notes.tiempo_sesion);
      } catch {
         return false;
      }
   }

   // Función para cargar historial de avances de una tarea
   async function fetchTaskProgressHistory(taskId: string, isSubtask: boolean) {
      try {
         const { data, error } = await supabase
            .from("status_history")
            .select("*")
            .eq(isSubtask ? "subtask_id" : "task_id", taskId)
            .eq("new_status", "in_progress")
            .order("changed_at", { ascending: false });

         if (error) {
            console.error("Error fetching progress history:", error);
            setTaskProgressHistory([]);
            return;
         }

         setTaskProgressHistory(data || []);
      } catch (error) {
         console.error("Error loading progress history:", error);
         setTaskProgressHistory([]);
      }
   }

   // Función para obtener los días de la semana actual (Lunes a Sábado)
   function getWeekDays() {
      const today = new Date();
      const currentDay = today.getDay(); // 0 = Domingo, 1 = Lunes, etc.
      const mondayOffset = currentDay === 0 ? -6 : -(currentDay - 1); // Ajustar para que Lunes sea el primer día
      
      const monday = new Date(today);
      monday.setDate(today.getDate() + mondayOffset);
      
      const weekDays = [];
      for (let i = 0; i < 6; i++) { // Lunes a Sábado (6 días)
         const day = new Date(monday);
         day.setDate(monday.getDate() + i);
         weekDays.push({
            date: day,
            dateStr: format(day, "yyyy-MM-dd"),
            dayName: format(day, "EEEE", { locale: es }),
            dayShort: format(day, "EEE", { locale: es }),
            dayNumber: format(day, "dd"),
            isToday: format(day, "yyyy-MM-dd") === format(today, "yyyy-MM-dd")
         });
      }
      return weekDays;
   }

   // Función para obtener datos del Gantt semanal
   async function getWeeklyGanttData() {
      if (!user) return [];

      try {
         const weekDays = getWeekDays();
         const startDate = weekDays[0].dateStr;
         const endDate = weekDays[weekDays.length - 1].dateStr;

         // Obtener todas las asignaciones de la semana con información completa
         const { data: assignments, error } = await supabase
            .from("task_work_assignments")
            .select(`
               *,
               tasks(id, title, project_id, estimated_duration, projects(name)),
               subtasks(id, title, task_id, estimated_duration, tasks(id, title, projects(name)))
            `)
            .eq("user_id", user.id)
            .gte("date", startDate)
            .lte("date", endDate);

         if (error) throw error;

         // Agrupar por tarea
         const taskGroups: { [key: string]: any } = {};
         
         assignments?.forEach(assignment => {
            const taskData = assignment.task_type === "subtask" ? assignment.subtasks : assignment.tasks;
            if (!taskData) return;

            const taskKey = `${assignment.task_type}-${assignment.task_type === "subtask" ? assignment.subtask_id : assignment.task_id}`;
            
            if (!taskGroups[taskKey]) {
               // Para subtareas, obtener información de la tarea principal y proyecto
               let projectName = "";
               let parentTaskTitle = "";
               
               if (assignment.task_type === "subtask" && taskData.tasks) {
                  parentTaskTitle = taskData.tasks.title;
                  projectName = taskData.tasks.projects?.name || "";
               } else if (assignment.task_type === "task" && taskData.projects) {
                  projectName = taskData.projects.name || "";
               }

               taskGroups[taskKey] = {
                  id: taskKey,
                  title: taskData.title,
                  type: assignment.task_type,
                  project_id: assignment.project_id,
                  project_name: projectName,
                  parent_task_title: parentTaskTitle,
                  estimated_duration: taskData.estimated_duration,
                  sessions: {}
               };
            }

            // Agregar sesión al día correspondiente
            const dateStr = assignment.date;
            if (!taskGroups[taskKey].sessions[dateStr]) {
               taskGroups[taskKey].sessions[dateStr] = [];
            }

            taskGroups[taskKey].sessions[dateStr].push({
               id: assignment.id,
               status: assignment.status,
               estimated_duration: assignment.estimated_duration,
               actual_duration: assignment.actual_duration,
               start_time: assignment.start_time,
               end_time: assignment.end_time,
               notes: assignment.notes
            });
         });

         return Object.values(taskGroups);
      } catch (error) {
         console.error("Error fetching weekly gantt data:", error);
         return [];
      }
   }

   // Estado para datos del Gantt
   const [ganttData, setGanttData] = useState<any[]>([]);
   const [executedTimeData, setExecutedTimeData] = useState<Record<string, Record<string, number>>>({});

   // Función para cargar datos del Gantt
   async function fetchGanttData() {
      const data = await getWeeklyGanttData();
      setGanttData(data);
      
      // Precalcular tiempos ejecutados
      await calculateExecutedTimes(data);
   }

   // Función para precalcular tiempos ejecutados
   async function calculateExecutedTimes(ganttData: any[]) {
      const weekDays = getWeekDays();
      const executedTimes: Record<string, Record<string, number>> = {};

      for (const taskGroup of ganttData) {
         executedTimes[taskGroup.id] = {};
         
         for (const day of weekDays) {
            const sessions = taskGroup.sessions[day.dateStr] || [];
            if (sessions.length > 0) {
               // Obtener ID real de la tarea/subtarea
               const realTaskId = taskGroup.type === "subtask" 
                  ? taskGroup.id.replace("subtask-", "")
                  : taskGroup.id.replace("task-", "");
               
               const realTime = await getRealExecutedTime(realTaskId, taskGroup.type, day.dateStr);
               executedTimes[taskGroup.id][day.dateStr] = realTime;
            } else {
               executedTimes[taskGroup.id][day.dateStr] = 0;
            }
         }
      }

      setExecutedTimeData(executedTimes);
   }

   // Función para obtener tiempo real ejecutado de las sesiones de trabajo
   async function getRealExecutedTime(taskId: string, taskType: "task" | "subtask", dateStr: string): Promise<number> {
      try {
         const { data, error } = await supabase
            .from("status_history")
            .select("metadata, changed_at")
            .eq(taskType === "subtask" ? "subtask_id" : "task_id", taskId)
            .eq("new_status", "in_progress")
            .gte("changed_at", `${dateStr} 00:00:00`)
            .lt("changed_at", `${dateStr} 23:59:59`);

         if (error) {
            console.error("Error fetching executed time:", error);
            return 0;
         }

         // Sumar tiempo de todas las sesiones de avance del día
         let totalMinutes = 0;
         data?.forEach(record => {
            const metadata = record.metadata || {};
            const timeWorked = metadata.tiempo_sesion || 0;
            totalMinutes += timeWorked;
         });

         // También verificar si se completó la tarea ese día
         const { data: completedData, error: completedError } = await supabase
            .from("status_history")
            .select("metadata")
            .eq(taskType === "subtask" ? "subtask_id" : "task_id", taskId)
            .eq("new_status", "completed")
            .gte("changed_at", `${dateStr} 00:00:00`)
            .lt("changed_at", `${dateStr} 23:59:59`);

         if (!completedError && completedData?.length > 0) {
            const completedMetadata = completedData[0].metadata || {};
            const completedTime = completedMetadata.duracion_real || 0;
            totalMinutes += completedTime;
         }

         return totalMinutes;
      } catch (error) {
         console.error("Error calculating real executed time:", error);
         return 0;
      }
   }

   return (
      <div className="bg-white rounded-lg shadow-md p-6">
         <div className="mb-6">
            <h1 className="text-2xl font-bold">{project?.name || "Cargando proyecto..."}</h1>
         </div>

         {/* Tabs */}
         <div className="border-b border-gray-200 mb-6">
            <div className="flex -mb-px">
               <button className={`mr-4 py-2 px-4 font-medium ${activeTab === "asignacion" ? "border-b-2 border-yellow-500 text-yellow-600" : "text-gray-500 hover:text-gray-700"}`} onClick={() => setActiveTab("asignacion")}>
                  BACKLOG
               </button>
               <button className={`py-2 px-4 font-medium ${activeTab === "gestion" ? "border-b-2 border-yellow-500 text-yellow-600" : "text-gray-500 hover:text-gray-700"}`} onClick={() => setActiveTab("gestion")}>
                  GESTION
               </button>
            </div>
         </div>

         {activeTab === "asignacion" && (
            <div>
               <div className="mb-4">
                  <h2 className="text-xl font-semibold">BACKLOG DE ACTIVIDADES</h2>
                  <p className="text-sm text-gray-600 mt-1">Vista completa del estado de actividades del proyecto</p>
               </div>

               {/* Sub pestañas para backlog */}
               <div className="mb-6 bg-white rounded-md shadow-sm border border-gray-200 p-4">
                  <div className="flex border-b border-gray-200 mb-4">
                     <button 
                        className={`mr-4 py-2 px-4 font-medium flex items-center ${
                           activeBacklogSubTab === "pendientes" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500 hover:text-gray-700"
                        }`} 
                        onClick={() => setActiveBacklogSubTab("pendientes")}
                     >
                        📋 Pendientes
                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-600">
                           {getPendingTasks().length}
                        </span>
                     </button>
                     <button 
                        className={`mr-4 py-2 px-4 font-medium flex items-center ${
                           activeBacklogSubTab === "en_proceso" ? "border-b-2 border-green-500 text-green-600" : "text-gray-500 hover:text-gray-700"
                        }`} 
                        onClick={() => setActiveBacklogSubTab("en_proceso")}
                     >
                                                 🚀 En Proceso
                         <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-600">
                            {assignedTaskItems.length + delayedTaskItems.length + returnedTaskItems.length + completedTaskItems.length + inReviewTaskItems.length}
                         </span>
                     </button>
                     <button 
                        className={`mr-4 py-2 px-4 font-medium flex items-center ${
                           activeBacklogSubTab === "problemas" ? "border-b-2 border-red-500 text-red-600" : "text-gray-500 hover:text-gray-700"
                        }`} 
                        onClick={() => setActiveBacklogSubTab("problemas")}
                     >
                        🚫 Bloqueadas
                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-600">
                           {blockedTaskItems.length}
                        </span>
                     </button>
                     <button 
                        className={`py-2 px-4 font-medium flex items-center ${
                           activeBacklogSubTab === "aprobadas" ? "border-b-2 border-emerald-500 text-emerald-600" : "text-gray-500 hover:text-gray-700"
                        }`} 
                        onClick={() => setActiveBacklogSubTab("aprobadas")}
                     >
                        ✅ Aprobadas
                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-600">
                           {approvedTaskItems.length}
                        </span>
                     </button>
                        </div>
                           </div>

               {/* Vista de Tareas Pendientes */}
               {activeBacklogSubTab === "pendientes" && (
                  <div>
               {error && <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-md">{error}</div>}

               {/* Opciones de ordenamiento */}
               <div className="mb-4 p-3 bg-white rounded-md shadow-sm border border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-2">Ordenar actividades por:</p>
                  <div className="flex items-center flex-wrap gap-2">
                     <button className={`px-4 py-2 text-sm rounded-md flex items-center ${sortBy === "deadline" ? "bg-yellow-100 text-yellow-800 border border-yellow-300" : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200"}`} onClick={() => handleSort("deadline")}>
                        Fecha límite
                        {sortBy === "deadline" && <span className="ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>}
                     </button>
                     <button className={`px-4 py-2 text-sm rounded-md flex items-center ${sortBy === "priority" ? "bg-yellow-100 text-yellow-800 border border-yellow-300" : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200"}`} onClick={() => handleSort("priority")}>
                        Prioridad
                        {sortBy === "priority" && <span className="ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>}
                     </button>
                     <button className={`px-4 py-2 text-sm rounded-md flex items-center ${sortBy === "duration" ? "bg-yellow-100 text-yellow-800 border border-yellow-300" : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200"}`} onClick={() => handleSort("duration")}>
                        Duración
                        {sortBy === "duration" && <span className="ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>}
                     </button>
                  </div>
               </div>

               {/* Task list container */}
               <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden mb-6">
                  {/* Task list header */}
                  <div className="grid grid-cols-6 gap-4 p-3 border-b-2 border-gray-300 font-medium text-gray-700 bg-gray-50">
                     <div>PROYECTO</div>
                     <div>ACTIVIDAD</div>
                     <div>DESCRIPCION</div>
                           <div>ESTADO</div>
                     <div>INICIO</div>
                     <div>FIN</div>
                  </div>

                  {/* Task list */}
                  <div className="divide-y divide-gray-200">
                     {loading || isFiltering ? (
                        <div className="py-8 text-center text-gray-500 bg-white">
                           <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-800 mx-auto mb-2"></div>
                           <p>{isFiltering ? "Filtrando tareas..." : "Cargando tareas..."}</p>
                        </div>
                           ) : isDataInitialized && getPendingTasks().length > 0 ? (
                              getPendingTasks().map(({ task, source }) => (
                                 <div key={`${source}-${task.id}`} className="grid grid-cols-6 gap-4 py-3 items-center bg-white hover:bg-gray-50 px-3">
                              <div className="text-sm text-gray-700 py-1">
                                 {(() => {
                                    const { bg, text } = getProjectColor(task.projectName || "Sin proyecto", task.project_id);
                                    return <span className={`inline-block px-3 py-1 ${bg} ${text} font-semibold rounded-full shadow-sm`}>{task.projectName || "Sin proyecto"}</span>;
                                 })()}
                              </div>
                              <div className="font-medium">
                                 {task.type === "subtask" ? (
                                    <div>
                                       <div className="text-sm text-gray-700 font-medium mb-1">
                                          <span className="inline-block mr-2">T.P:</span>
                                          {task.subtask_title || "Sin tarea principal"}
                                       </div>
                                       <div className="cursor-pointer hover:text-indigo-600 mb-1" onClick={() => handleViewTaskDetails(task)}>
                                          {task.title}
                                       </div>
                                       <div className="flex flex-wrap items-center gap-1">
                                          <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">Subtarea</span>
                                          {getPriorityBadge(task.priority)}
                                       </div>
                                    </div>
                                 ) : (
                                    <div>
                                       <div className="cursor-pointer hover:text-indigo-600 mb-1 text-base" onClick={() => handleViewTaskDetails(task)}>
                                          {task.title}
                                       </div>
                                       <div className="flex flex-wrap items-center gap-1">{getPriorityBadge(task.priority)}</div>
                                    </div>
                                 )}
                              </div>
                              <div className="text-sm text-gray-600">
                                 <RichTextSummary text={task.description || "-"} maxLength={80} />
                              </div>
                                    <div className="text-sm text-gray-700">
                                       {getStatusBadge(task, source)}
                              </div>
                              <div className="text-sm text-gray-700">
                                 {task.start_date ? (
                                    <>
                                       <div>{format(new Date(task.start_date), "dd/MM/yyyy")}</div>
                                       {/* Indicador de tiempo para fecha de inicio */}
                                       {getTimeIndicator(task.start_date, true).text && <div className={`text-xs mt-1 ${getTimeIndicator(task.start_date, true).color}`}>{getTimeIndicator(task.start_date, true).text}</div>}
                                    </>
                                 ) : (
                                    <span className="text-gray-400">-</span>
                                 )}
                              </div>
                              <div className="text-sm text-gray-700">
                                 {task.deadline ? (
                                    <>
                                       <div>{format(new Date(task.deadline), "dd/MM/yyyy")}</div>
                                       {/* Indicador de tiempo para fecha de fin */}
                                       {getTimeIndicator(task.deadline, false).text && <div className={`text-xs mt-1 ${getTimeIndicator(task.deadline, false).color}`}>{getTimeIndicator(task.deadline, false).text}</div>}
                                    </>
                                 ) : (
                                    <span className="text-gray-400">-</span>
                                 )}
                              </div>
                           </div>
                        ))
                     ) : (
                        <div className="py-8 text-center bg-white">
                                 <p className="text-gray-500 mb-2">No hay tareas pendientes.</p>
                                 <p className="text-sm text-gray-400">{error ? error : "Todas las tareas están en otros estados."}</p>
                        </div>
                     )}
                  </div>
               </div>
                  </div>
               )}

                              {/* Vista de Tablero Kanban - En Proceso */}
               {activeBacklogSubTab === "en_proceso" && (
                  <div>
                     <div className="grid grid-cols-4 gap-4">
                        {/* Columna Asignadas */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                           <div className="bg-blue-50 px-4 py-3 border-b border-blue-200 rounded-t-lg">
                              <h3 className="font-medium text-blue-800 flex items-center">
                                 📋 Asignadas
                                 <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-600">
                                    {assignedTaskItems.length + delayedTaskItems.length}
                                 </span>
                              </h3>
                  </div>
                                                      <div className="p-4 space-y-3 max-h-[700px] overflow-y-auto">
                              {(assignedTaskItems.length > 0 || delayedTaskItems.length > 0) ? (
                                 [...assignedTaskItems, ...delayedTaskItems].map((task) => {
                                    const isDelayed = delayedTaskItems.some(d => d.id === task.id);
                                    return (
                                       <div key={task.id} className={`border rounded-lg p-3 hover:shadow-sm transition-shadow cursor-pointer ${
                                          isDelayed ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'
                                       }`} onClick={() => handleViewTaskDetails(task)}>
                                          <div className="flex items-start justify-between mb-2">
                                             <h4 className="text-sm font-medium text-gray-900 truncate flex-1">{task.title}</h4>
                                             <div className="flex items-center gap-1">
                                                {isDelayed && (
                                                   <span className="text-xs px-1 py-0.5 bg-red-100 text-red-800 rounded-full">⏰ Retrasada</span>
                                                )}
                                                {getPriorityBadge(task.priority)}
                  </div>
               </div>
                                          <p className="text-xs text-gray-600 mb-2">
                                             <RichTextSummary text={task.description || "Sin descripción"} maxLength={60} />
                                          </p>
                                          <div className="flex items-center justify-between">
                                             <span className="text-xs text-gray-500">
                                                {task.projectName || "Sin proyecto"}
                                             </span>
                                             {task.type === "subtask" && (
                                                <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">Subtarea</span>
                                             )}
               </div>
                                          {task.assignment_date && (
                                             <div className={`mt-2 text-xs ${isDelayed ? 'text-orange-600' : 'text-blue-600'}`}>
                                                📅 {format(new Date(task.assignment_date), "dd/MM/yyyy")}
                  </div>
                                          )}
               </div>
                                    );
                                 })
                              ) : (
                                 <p className="text-sm text-gray-400 text-center py-4">No hay tareas asignadas</p>
                              )}
                           </div>
                              </div>

                        {/* Columna Devueltas */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                           <div className="bg-orange-50 px-4 py-3 border-b border-orange-200 rounded-t-lg">
                              <h3 className="font-medium text-orange-800 flex items-center">
                                 🔄 Devueltas
                                 <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-orange-100 text-orange-600">
                                    {returnedTaskItems.length}
                                 </span>
                              </h3>
                                       </div>
                           <div className="p-4 space-y-3 max-h-[700px] overflow-y-auto">
                              {returnedTaskItems.length > 0 ? (
                                 returnedTaskItems.map((task) => (
                                    <div key={task.id} className="bg-orange-50 border border-orange-200 rounded-lg p-3 hover:shadow-sm transition-shadow cursor-pointer" onClick={() => handleViewTaskDetails(task)}>
                                       <div className="flex items-start justify-between mb-2">
                                          <h4 className="text-sm font-medium text-gray-900 truncate flex-1">{task.title}</h4>
                                          {getPriorityBadge(task.priority)}
                                                </div>
                                       <p className="text-xs text-gray-600 mb-2">
                                          <RichTextSummary text={task.description || "Sin descripción"} maxLength={60} />
                                       </p>
                                       {task.notes && typeof task.notes === 'object' && task.notes.returned_feedback && (
                                          <div className="bg-white border border-orange-300 rounded p-2 mb-2">
                                             <p className="text-xs font-medium text-orange-800 mb-1">Comentarios:</p>
                                             <p className="text-xs text-gray-700 line-clamp-2">{task.notes.returned_feedback}</p>
                                                </div>
                                       )}
                                       <div className="flex items-center justify-between">
                                          <span className="text-xs text-gray-500">
                                             {task.projectName || "Sin proyecto"}
                                          </span>
                                          {task.type === "subtask" && (
                                                   <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">Subtarea</span>
                                          )}
                                                </div>
                                       <button 
                                          onClick={(e) => {
                                             e.stopPropagation();
                                             handleViewReturnedFeedback(task);
                                          }}
                                          className="mt-2 w-full px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
                                       >
                                          Ver Feedback
                                       </button>
                                             </div>
                                 ))
                              ) : (
                                 <p className="text-sm text-gray-400 text-center py-4">No hay tareas devueltas</p>
                              )}
                           </div>
                        </div>

                        {/* Columna Completadas */}
                         <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 rounded-t-lg">
                               <h3 className="font-medium text-gray-800 flex items-center">
                                  ✅ Completadas
                                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                                     {completedTaskItems.length}
                                                   </span>
                               </h3>
                                                </div>
                            <div className="p-4 space-y-3 max-h-[700px] overflow-y-auto">
                              {completedTaskItems.length > 0 ? (
                                 completedTaskItems.map((task) => (
                                    <div key={task.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:shadow-sm transition-shadow cursor-pointer" onClick={() => handleViewTaskDetails(task)}>
                                       <div className="flex items-start justify-between mb-2">
                                          <h4 className="text-sm font-medium text-gray-900 truncate flex-1">{task.title}</h4>
                                          {getPriorityBadge(task.priority)}
                                             </div>
                                       <p className="text-xs text-gray-600 mb-2">
                                          <RichTextSummary text={task.description || "Sin descripción"} maxLength={60} />
                                       </p>
                                       <div className="flex items-center justify-between">
                                          <span className="text-xs text-gray-500">
                                             {task.projectName || "Sin proyecto"}
                                          </span>
                                          {task.type === "subtask" && (
                                             <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">Subtarea</span>
                                          )}
                                       </div>
                                       </div>
                                 ))
                              ) : (
                                 <p className="text-sm text-gray-400 text-center py-4">No hay tareas completadas</p>
                                          )}
                                       </div>
                                       </div>

                                                 {/* Columna En Revisión */}
                         <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                            <div className="bg-yellow-50 px-4 py-3 border-b border-yellow-200 rounded-t-lg">
                               <h3 className="font-medium text-yellow-800 flex items-center">
                                  🔍 En Revisión
                                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-600">
                                     {inReviewTaskItems.length}
                                  </span>
                               </h3>
                                       </div>
                            <div className="p-4 space-y-3 max-h-[700px] overflow-y-auto">
                              {inReviewTaskItems.length > 0 ? (
                                 inReviewTaskItems.map((task) => (
                                    <div key={task.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 hover:shadow-sm transition-shadow cursor-pointer" onClick={() => handleViewTaskDetails(task)}>
                                       <div className="flex items-start justify-between mb-2">
                                          <h4 className="text-sm font-medium text-gray-900 truncate flex-1">{task.title}</h4>
                                          {getPriorityBadge(task.priority)}
                                       </div>
                                       <p className="text-xs text-gray-600 mb-2">
                                          <RichTextSummary text={task.description || "Sin descripción"} maxLength={60} />
                                       </p>
                                       <div className="flex items-center justify-between">
                                          <span className="text-xs text-gray-500">
                                             {task.projectName || "Sin proyecto"}
                                          </span>
                                          {task.type === "subtask" && (
                                             <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">Subtarea</span>
                                          )}
                                       </div>
                                    </div>
                                 ))
                              ) : (
                                 <p className="text-sm text-gray-400 text-center py-4">No hay tareas en revisión</p>
                              )}
                           </div>
                              </div>


                                          </div>
                  </div>
               )}

                              {/* Vista de Tareas Bloqueadas */}
               {activeBacklogSubTab === "problemas" && (
                                                <div>
                     <div className="max-w-2xl mx-auto">
                        <div className="bg-white rounded-lg shadow-sm border border-red-200">
                           <div className="bg-red-50 px-4 py-3 border-b border-red-200 rounded-t-lg">
                              <h3 className="font-medium text-red-800 flex items-center">
                                 🚫 Tareas Bloqueadas
                                 <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-600">
                                    {blockedTaskItems.length}
                                 </span>
                              </h3>
                              <p className="text-xs text-red-600 mt-1">Requieren resolución de dependencias o problemas estructurales</p>
                                                   </div>
                           <div className="p-4 space-y-3 max-h-[700px] overflow-y-auto">
                              {blockedTaskItems.length > 0 ? (
                                 blockedTaskItems.map((task) => (
                                    <div key={task.id} className="bg-red-50 border border-red-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                                       <div className="flex items-start justify-between mb-3">
                                          <h4 className="text-base font-medium text-gray-900 cursor-pointer hover:text-indigo-600" onClick={() => handleViewTaskDetails(task)}>{task.title}</h4>
                                          {getPriorityBadge(task.priority)}
                                                   </div>
                                       <p className="text-sm text-gray-600 mb-3">
                                          <RichTextSummary text={task.description || "Sin descripción"} maxLength={120} />
                                       </p>
                                       {task.notes && typeof task.notes === 'object' && task.notes.razon_bloqueo && (
                                          <div className="bg-white border border-red-300 rounded p-3 mb-3">
                                             <p className="text-sm font-medium text-red-800 mb-2">🚫 Razón de bloqueo:</p>
                                             <p className="text-sm text-gray-700 bg-red-50 p-2 rounded">{task.notes.razon_bloqueo}</p>
                                          </div>
                                       )}
                                       <div className="flex items-center justify-between text-sm">
                                          <span className="text-gray-500 font-medium">
                                             🏢 {task.projectName || "Sin proyecto"}
                                          </span>
                                          <div className="flex items-center gap-2">
                                             {task.type === "subtask" && (
                                                      <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">Subtarea</span>
                                             )}
                                             {task.deadline && (
                                                <span className="text-xs text-gray-500">
                                                   📅 {format(new Date(task.deadline), "dd/MM/yyyy")}
                                                </span>
                                             )}
                                                   </div>
                                                </div>
                                    </div>
                                 ))
                              ) : (
                                 <div className="text-center py-8">
                                    <div className="text-6xl mb-4">🎉</div>
                                    <p className="text-lg font-medium text-gray-600 mb-2">¡Excelente!</p>
                                    <p className="text-sm text-gray-400">No hay tareas bloqueadas en este momento</p>
                                 </div>
                              )}
                           </div>
                        </div>
                     </div>
                  </div>
               )}

               {/* Vista de Tareas Aprobadas */}
               {activeBacklogSubTab === "aprobadas" && (
                                                <div>
                     <div className="max-w-4xl mx-auto">
                        <div className="bg-white rounded-lg shadow-sm border border-emerald-200">
                           <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-200 rounded-t-lg">
                              <h3 className="font-medium text-emerald-800 flex items-center">
                                 ✅ Tareas Aprobadas
                                 <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-600">
                                    {approvedTaskItems.length}
                                 </span>
                              </h3>
                              <p className="text-xs text-emerald-600 mt-1">Tareas completadas y validadas exitosamente</p>
                           </div>
                           <div className="p-4">
                              {approvedTaskItems.length > 0 ? (
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {approvedTaskItems.map((task) => (
                                       <div key={task.id} className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                                          <div className="flex items-start justify-between mb-3">
                                             <h4 className="text-base font-medium text-gray-900 cursor-pointer hover:text-indigo-600 flex-1" onClick={() => handleViewTaskDetails(task)}>
                                                      {task.title}
                                             </h4>
                                             {getPriorityBadge(task.priority)}
                                                   </div>
                                          <p className="text-sm text-gray-600 mb-3">
                                             <RichTextSummary text={task.description || "Sin descripción"} maxLength={100} />
                                          </p>
                                          
                                          {/* Información de entrega si está disponible */}
                                          {task.notes && typeof task.notes === 'object' && task.notes.entregables && (
                                             <div className="bg-white border border-emerald-300 rounded p-3 mb-3">
                                                <p className="text-sm font-medium text-emerald-800 mb-2">📋 Entregables:</p>
                                                <p className="text-sm text-gray-700 bg-emerald-50 p-2 rounded">
                                                   <RichTextSummary text={task.notes.entregables} maxLength={150} />
                                                </p>
                                                </div>
                                          )}

                                          {/* Información de tiempo */}
                                          <div className="flex items-center justify-between text-sm mb-3">
                                             <div className="flex items-center gap-4">
                                                <span className="text-gray-500">
                                                   ⏱️ {Math.round((task.estimated_duration / 60) * 100) / 100}h estimadas
                                                </span>
                                                {task.notes && typeof task.notes === 'object' && task.notes.duracion_real && (
                                                   <span className="text-emerald-600 font-medium">
                                                      ✅ {Math.round((task.notes.duracion_real / 60) * 100) / 100}h reales
                                                   </span>
                                             )}
                                          </div>
                                          </div>

                                          <div className="flex items-center justify-between text-sm">
                                             <span className="text-gray-500 font-medium">
                                                🏢 {task.projectName || "Sin proyecto"}
                                             </span>
                                             <div className="flex items-center gap-2">
                                                {task.type === "subtask" && (
                                                   <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">Subtarea</span>
                                                )}
                                                {task.deadline && (
                                                   <span className="text-xs text-gray-500">
                                                      📅 {format(new Date(task.deadline), "dd/MM/yyyy")}
                                                   </span>
                                                )}
                                                <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-medium">
                                                   ✅ Aprobada
                                                </span>
                                          </div>
                                          </div>
                                       </div>
                                    ))}
                                 </div>
                              ) : (
                                 <div className="text-center py-12">
                                    <div className="text-6xl mb-4">📊</div>
                                    <p className="text-lg font-medium text-gray-600 mb-2">No hay tareas aprobadas aún</p>
                                    <p className="text-sm text-gray-400">Las tareas aparecerán aquí una vez que sean completadas y aprobadas</p>
                                 </div>
                                             )}
                                          </div>
                                          </div>
                                          </div>
                                          </div>
               )}
            </div>
         )}

         {activeTab === "gestion" && (
            <div>
               <div className="mb-4">
                  <h2 className="text-xl font-semibold">PLANIFICADOR DIARIO</h2>
                  <p className="text-sm text-gray-600 mt-1">Programa tu día de trabajo y reporta tu progreso</p>
               </div>

               {/* Sub pestañas para planificador */}
               <div className="mb-6 bg-white rounded-md shadow-sm border border-gray-200 p-4">
                  <div className="flex border-b border-gray-200 mb-4">
                     <button 
                        className={`mr-4 py-2 px-4 font-medium flex items-center ${
                           activeGestionSubTab === "planificar" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500 hover:text-gray-700"
                        }`} 
                        onClick={() => setActiveGestionSubTab("planificar")}
                     >
                        📅 Planificar Día
                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-600">
                           {getAvailableTasksForScheduling().length}
                        </span>
                                             </button>
                     <button 
                        className={`mr-4 py-2 px-4 font-medium flex items-center ${
                           activeGestionSubTab === "programadas" ? "border-b-2 border-green-500 text-green-600" : "text-gray-500 hover:text-gray-700"
                        }`} 
                        onClick={() => setActiveGestionSubTab("programadas")}
                     >
                        ⏰ Mi Horario Hoy
                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-600">
                           {assignedTaskItems.length + delayedTaskItems.length}
                        </span>
                                             </button>

                                          </div>
                                       </div>

               {/* Vista Planificar Día */}
               {activeGestionSubTab === "planificar" && (
                  <div>
                     <div className="mb-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
                        <h3 className="text-xl font-medium text-blue-800 mb-3">📅 Planifica tu día de trabajo</h3>
                        <p className="text-blue-600 mb-4">Agrega tareas a tu horario del día con búsqueda avanzada y filtros inteligentes.</p>
                        
                        <div className="flex items-center gap-4">
                           <button
                              onClick={handleOpenTaskSelector}
                              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
                           >
                              ➕ Agregar Tarea al Día
                              <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
                                 {getAvailableTasksForScheduling().length} disponibles
                              </span>
                           </button>
                           
                           <div className="text-sm text-blue-600">
                              <p>💡 <strong>Tip:</strong> Busca, filtra y organiza tareas por proyecto, prioridad o fecha límite</p>
                              </div>
                           </div>
                     </div>

                     {/* Información adicional si no hay tareas disponibles */}
                     {getAvailableTasksForScheduling().length === 0 && (
                        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                           <div className="text-6xl mb-4">🎉</div>
                           <h4 className="text-lg font-medium text-gray-600 mb-2">¡Excelente trabajo!</h4>
                           <p className="text-sm text-gray-500">No hay tareas pendientes por programar en este momento</p>
                        </div>
                     )}

                     {/* Vista rápida del día actual */}
                     {(assignedTaskItems.length + delayedTaskItems.length) > 0 && (
                        <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
                           <h4 className="font-medium text-green-800 mb-2">⏰ Tu día actual</h4>
                           <p className="text-sm text-green-600 mb-3">
                              Tienes <strong>{assignedTaskItems.length + delayedTaskItems.length} tareas</strong> programadas para hoy
                           </p>
                           <button
                              onClick={() => setActiveGestionSubTab("programadas")}
                              className="text-sm px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                           >
                              Ver Mi Horario →
                           </button>
                        </div>
                     )}
                     </div>
               )}

               {/* Vista Mi Horario Hoy */}
               {activeGestionSubTab === "programadas" && (
                  <div>
                     <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
                        <h3 className="text-lg font-medium text-green-800 mb-3">⏰ Tu Horario de Hoy</h3>
                        <p className="text-sm text-green-600 mb-4">
                           Tareas programadas para hoy. Usa "📊 Reportar Estado" para completar, bloquear o reportar avance en cada tarea.
                        </p>
                        
                        {/* Selector de vista */}
                        <div className="flex items-center gap-2">
                           <span className="text-sm font-medium text-green-800">Vista:</span>
                           <button
                              onClick={() => setScheduleViewMode("list")}
                              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                                 scheduleViewMode === "list" 
                                    ? "bg-green-600 text-white" 
                                    : "bg-white text-green-700 border border-green-300 hover:bg-green-100"
                              }`}
                           >
                              📋 Lista
                           </button>

                           <button
                              onClick={() => setScheduleViewMode("timeline")}
                              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                                 scheduleViewMode === "timeline" 
                                    ? "bg-green-600 text-white" 
                                    : "bg-white text-green-700 border border-green-300 hover:bg-green-100"
                              }`}
                           >
                              📊 Hoy
                           </button>
                           <button
                              onClick={() => setScheduleViewMode("gantt")}
                              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                                 scheduleViewMode === "gantt" 
                                    ? "bg-green-600 text-white" 
                                    : "bg-white text-green-700 border border-green-300 hover:bg-green-100"
                              }`}
                           >
                              📈 Gantt Semanal
                           </button>
                           
                           
                              </div>
                                    </div>

                     {/* Vista Timeline Gráfica */}
                     {scheduleViewMode === "timeline" && (
                        <div className="mb-6">
                           {getScheduledTasksForTimeline().length > 0 ? (
                              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                                 <h4 className="font-medium mb-4 text-gray-800">📊 Timeline del Día</h4>
                                 
                                 {/* Timeline Container */}
                                 <div className="relative">
                                    {/* Líneas de tiempo (horas) */}
                                    <div className="flex flex-col space-y-4">
                                       {getTimelineHours().map((hour, index) => {
                                          const hourMinutes = parseInt(hour.split(':')[0]) * 60;
                                          const tasksAtThisHour = getScheduledTasksForTimeline().filter(task => 
                                             task.startMinutes <= hourMinutes && task.endMinutes > hourMinutes
                                          );
                                          
                                          return (
                                             <div key={hour} className="flex items-center min-h-[60px]">
                                                {/* Hora */}
                                                <div className="w-16 text-sm text-gray-500 font-mono shrink-0">
                                                   {hour}
                                             </div>
                                                
                                                {/* Línea de tiempo */}
                                                <div className="flex-1 relative border-l-2 border-gray-200 ml-4 pl-4">
                                                   {/* Tareas que inician en esta hora */}
                                                   {getScheduledTasksForTimeline()
                                                      .filter(task => Math.floor(task.startMinutes / 60) === parseInt(hour.split(':')[0]))
                                                      .map(({ task, startTime, endTime, duration, isDelayed }) => (
                                                         <div 
                                                            key={task.id}
                                                            className={`absolute left-0 right-0 rounded-lg p-3 shadow-sm border-l-4 ${
                                                               isDelayed 
                                                                  ? 'bg-orange-50 border-orange-400 border border-orange-200' 
                                                                  : 'bg-blue-50 border-blue-400 border border-blue-200'
                                                            }`}
                                                            style={{
                                                               height: `${Math.max(duration * 3, 48)}px`, // 3px por minuto, mínimo 48px
                                                               top: '0px'
                                                            }}
                                                         >
                                                            <div className="flex items-start justify-between mb-1">
                                                               <div className="flex-1 min-w-0">
                                                                  <h5 className="font-medium text-sm text-gray-900 truncate">
                                                {task.title}
                                                                  </h5>
                                                                  <div className="flex items-center gap-2 mt-1">
                                                                     <span className="text-xs text-gray-600">
                                                                        {startTime} - {endTime}
                                                                     </span>
                                                                     <span className="text-xs px-2 py-0.5 bg-white rounded-full border">
                                                                        {Math.round(duration / 60 * 100) / 100}h
                                                                     </span>
                                                                     {isDelayed && (
                                                                        <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full">
                                                                           ⚠️ Retrasada
                                                   </span>
                                                )}
                                             </div>
                                             </div>
                                                               
                                                                                                                               <div className="flex gap-1 ml-2">
                                                                   <button
                                                                      onClick={() => handleOpenStatusModal(task.id)}
                                                                      className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 font-medium"
                                                                      title="Reportar estado: Completar, Bloquear o Avance"
                                                                   >
                                                                      📊 Estado
                                                                   </button>
                                                                   <button
                                                                      onClick={() => taskHasProgress(task) ? null : handleShowUnassignConfirmModal(task.id)}
                                                                      disabled={taskHasProgress(task)}
                                                                      className={`px-2 py-1 text-white text-xs rounded ${
                                                                         taskHasProgress(task) 
                                                                            ? "bg-gray-400 cursor-not-allowed" 
                                                                            : "bg-red-600 hover:bg-red-700"
                                                                      }`}
                                                                      title={taskHasProgress(task) 
                                                                         ? "No se puede desasignar (tiene avances registrados)" 
                                                                         : "Desasignar tarea"
                                                                      }
                                                                   >
                                                                      🗑️
                                                                   </button>
                                          </div>
                                             </div>
                                                            
                                                            <p className="text-xs text-gray-600 truncate">
                                                               {task.projectName || "Sin proyecto"}
                                                            </p>
                                          </div>
                                                      ))
                                                   }
                                    </div>
                                    </div>
                                          );
                                       })}
                                    </div>
                                    </div>
                                 
                                 {/* Resumen del timeline */}
                                 <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                                    <div className="grid grid-cols-3 gap-4 text-center">
                                       <div>
                                          <div className="text-lg font-bold text-gray-900">
                                             {getScheduledTasksForTimeline().length}
                                          </div>
                                          <div className="text-sm text-gray-600">Tareas Programadas</div>
                                    </div>
                                    <div>
                                          <div className="text-lg font-bold text-blue-600">
                                             {getScheduledTasksForTimeline().reduce((sum, t) => sum + t.duration, 0) / 60}h
                                    </div>
                                          <div className="text-sm text-gray-600">Tiempo Total</div>
                                    </div>
                                       <div>
                                          <div className="text-lg font-bold text-green-600">
                                             {getScheduledTasksForTimeline().length > 0 
                                                ? `${getScheduledTasksForTimeline()[0]?.startTime} - ${getScheduledTasksForTimeline()[getScheduledTasksForTimeline().length - 1]?.endTime}`
                                                : "No programado"
                                             }
                                 </div>
                                          <div className="text-sm text-gray-600">Horario de Trabajo</div>
                                       </div>
                                    </div>
                                 </div>
                              </div>
                           ) : (
                              <div className="py-12 text-center bg-white rounded-lg border border-gray-200">
                                 <div className="text-6xl mb-4">📅</div>
                                 <h4 className="text-lg font-medium text-gray-600 mb-2">No hay horarios programados</h4>
                                 <p className="text-sm text-gray-500 mb-4">Programa algunas tareas para ver tu timeline del día</p>
                                 <button
                                    onClick={() => setActiveGestionSubTab("planificar")}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                 >
                                    📅 Planificar Día
                                 </button>
                              </div>
                           )}
                        </div>
                     )}

                     {/* Resumen del día - Solo en vista lista */}
                     {scheduleViewMode === "list" && (assignedTaskItems.length + delayedTaskItems.length) > 0 && (
                        <div className="mb-6 p-4 bg-white rounded-md shadow-sm border border-gray-200">
                           <h4 className="font-medium mb-3">📊 Resumen del Día</h4>
                           <div className="grid grid-cols-3 gap-4">
                              <div className="text-center p-3 bg-blue-50 rounded-md">
                                 <div className="text-2xl font-bold text-blue-600">{assignedTaskItems.length}</div>
                                 <div className="text-sm text-blue-800">Tareas de Hoy</div>
                        </div>
                              {delayedTaskItems.length > 0 && (
                                 <div className="text-center p-3 bg-orange-50 rounded-md">
                                    <div className="text-2xl font-bold text-orange-600">{delayedTaskItems.length}</div>
                                    <div className="text-sm text-orange-800">Retrasadas</div>
                     </div>
                              )}
                              <div className="text-center p-3 bg-green-50 rounded-md">
                                 <div className="text-2xl font-bold text-green-600">
                                    {(assignedTaskItems.length + delayedTaskItems.length > 0) 
                                       ? Math.round(((assignedTaskItems.reduce((sum, t) => sum + t.estimated_duration, 0) + 
                                                     delayedTaskItems.reduce((sum, t) => sum + t.estimated_duration, 0)) / 60) * 100) / 100
                                       : 0}h
                        </div>
                                 <div className="text-sm text-green-800">Total Programado</div>
                              </div>
                           </div>
                        </div>
                     )}

                     {/* Lista de tareas programadas - Solo en vista lista */}
                     {scheduleViewMode === "list" && (
                        <div className="space-y-4">
                        {[...assignedTaskItems, ...delayedTaskItems].length > 0 ? (
                           [...assignedTaskItems, ...delayedTaskItems]
                              .sort((a, b) => {
                                 // Ordenar por hora de inicio si está disponible
                                 const timeA = a.assignment_date || "00:00";
                                 const timeB = b.assignment_date || "00:00";
                                 return timeA.localeCompare(timeB);
                              })
                              .map((task) => {
                                 const isDelayed = delayedTaskItems.some(d => d.id === task.id);
                                 return (
                                    <div key={task.id} className={`p-4 rounded-lg border-2 ${
                                       isDelayed ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'
                                    }`}>
                                       <div className="flex items-center justify-between mb-3">
                                          <div className="flex items-center gap-3">
                                             <div className="text-sm">
                                          {(() => {
                                             const { bg, text } = getProjectColor(task.projectName || "Sin proyecto", task.project_id);
                                                   return <span className={`inline-block px-2 py-1 ${bg} ${text} text-xs font-medium rounded-full`}>{task.projectName || "Sin proyecto"}</span>;
                                          })()}
                                       </div>
                                             {isDelayed && (
                                                <span className="text-xs px-2 py-1 bg-orange-100 text-orange-800 rounded-full font-medium">
                                                   ⚠️ Retrasada
                                                </span>
                                             )}
                                             {getPriorityBadge(task.priority)}
                                          </div>
                                          <div className="text-sm text-gray-500">
                                             ⏱️ {Math.round((task.estimated_duration / 60) * 100) / 100}h programadas
                                       </div>
                                       </div>
                                       
                                       <h5 className="font-medium text-lg text-gray-900 mb-2 cursor-pointer hover:text-indigo-600" onClick={() => handleViewTaskDetails(task)}>
                                          {task.title}
                                          {task.type === "subtask" && (
                                             <span className="ml-2 text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">Subtarea</span>
                                          )}
                                       </h5>
                                       
                                       <p className="text-sm text-gray-600 mb-3">
                                          <RichTextSummary text={task.description || "Sin descripción"} maxLength={120} />
                                       </p>
                                       
                                       <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-4 text-sm text-gray-500">
                                             {task.assignment_date && (
                                                <span>📅 Programada: {format(new Date(task.assignment_date), "dd/MM/yyyy")}</span>
                                             )}
                                             {task.deadline && (
                                                <span>🎯 Vence: {format(new Date(task.deadline), "dd/MM/yyyy")}</span>
                                             )}
                                       </div>
                                          <div className="flex gap-2">
                                             <button 
                                                onClick={() => handleOpenStatusModal(task.id)}
                                                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 transition-colors font-medium"
                                                title="Reportar estado: Completar, Bloquear o Avance"
                                             >
                                                📊 Reportar Estado
                                             </button>
                                             {/* Botón desasignar para reprogramar tareas */}
                                             <button 
                                                onClick={() => taskHasProgress(task) ? null : handleShowUnassignConfirmModal(task.id)}
                                                disabled={taskHasProgress(task)}
                                                className={`px-3 py-1 text-white text-sm rounded-md transition-colors ${
                                                   taskHasProgress(task) 
                                                      ? "bg-gray-400 cursor-not-allowed" 
                                                      : "bg-red-600 hover:bg-red-700"
                                                }`}
                                                title={taskHasProgress(task) 
                                                   ? "No se puede desasignar (tiene avances registrados)" 
                                                   : "Desasignar tarea para reprogramar"
                                                }
                                             >
                                                🗑️ {taskHasProgress(task) ? "Con Avances" : "Desasignar"}
                                             </button>
                                       </div>
                                       </div>
                                    </div>
                                 );
                              })
                           ) : (
                           <div className="py-12 text-center bg-white rounded-lg border border-gray-200">
                              <div className="text-6xl mb-4">📅</div>
                              <h4 className="text-lg font-medium text-gray-600 mb-2">No hay tareas programadas para hoy</h4>
                              <p className="text-sm text-gray-500 mb-4">Ve a "Planificar Día" para programar tu trabajo</p>
                              <button
                                 onClick={() => setActiveGestionSubTab("planificar")}
                                 className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                              >
                                 📅 Planificar Día
                              </button>
                              </div>
                           )}
                        </div>
                     )}

                     {/* Vista Gantt Semanal */}
                     {scheduleViewMode === "gantt" && (
                        <div className="mb-6">
                           <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                              <div className="flex justify-between items-center mb-6">
                                 <h4 className="font-medium text-gray-800">📈 Gantt Semanal</h4>
                                 <div className="flex items-center gap-4 text-sm">
                                    <div className="flex items-center gap-2">
                                       <div className="w-4 h-4 bg-blue-200 border border-blue-400 rounded"></div>
                                       <span>Planificado</span>
                        </div>
                                    <div className="flex items-center gap-2">
                                       <div className="w-4 h-4 bg-green-200 border border-green-400 rounded"></div>
                                       <span>Ejecutado</span>
                     </div>
                        </div>
                              </div>

                              {ganttData.length > 0 ? (
                                 <div className="overflow-x-auto">
                                    <div className="min-w-[900px]">
                                       {/* Header con días de la semana */}
                                       <div className="grid grid-cols-8 gap-2 mb-4">
                                          <div className="font-medium text-sm text-gray-700 p-1 min-h-[50px] flex items-center">Tareas</div>
                                          {getWeekDays().map(day => (
                                             <div key={day.dateStr} className={`text-center p-1 text-sm min-h-[50px] flex flex-col justify-center ${
                                                day.isToday 
                                                   ? 'bg-blue-100 text-blue-800 font-medium' 
                                                   : 'bg-gray-50 text-gray-700'
                                             }`}>
                                                <div className="font-medium">{day.dayShort}</div>
                                                <div className="text-xs">{day.dayNumber}</div>
                                             </div>
                                          ))}
                                          <div className="text-center p-1 text-xs bg-gray-100 text-gray-700 min-h-[50px] flex flex-col justify-center">
                                             <div className="font-medium">TOTAL</div>
                                             <div className="text-xs text-gray-500">P/E</div>
                                          </div>
                                       </div>

                                       {/* Filas de tareas */}
                                       {ganttData.map(taskGroup => {
                                          // Calcular total de horas para esta tarea
                                          const totalTaskHours = getWeekDays().reduce((total, day) => {
                                             const sessions = taskGroup.sessions[day.dateStr] || [];
                                             const dayTotal = sessions.reduce((daySum: number, session: any) => {
                                                return daySum + (session.estimated_duration || 0);
                                             }, 0);
                                             return total + dayTotal;
                                          }, 0);

                                 return (
                                          <div key={taskGroup.id} className="grid grid-cols-8 gap-2 mb-3 border border-gray-200 rounded-lg">
                                                                                           {/* Nombre de la tarea */}
                                              <div className="p-2 bg-gray-50 font-medium text-sm text-gray-800 border-r border-gray-200 min-h-[50px]">
                                                 <div 
                                                    className="font-medium text-gray-900 mb-1 cursor-pointer hover:text-blue-600 transition-colors"
                                                    onClick={() => {
                                                       // Crear objeto Task para el modal
                                                       const taskForModal: Task = {
                                                          id: taskGroup.type === "subtask" ? taskGroup.id.replace("subtask-", "") : taskGroup.id.replace("task-", ""),
                                                          title: taskGroup.title,
                                                          description: null,
                                                          priority: "medium" as const,
                                                          estimated_duration: taskGroup.estimated_duration,
                                                          start_date: "",
                                                          deadline: "",
                                                          status: "assigned",
                                                          is_sequential: false,
                                                          project_id: taskGroup.project_id,
                                                          projectName: taskGroup.project_name,
                                                          type: taskGroup.type,
                                                          original_id: taskGroup.type === "subtask" ? taskGroup.id.replace("subtask-", "") : undefined,
                                                          subtask_title: taskGroup.parent_task_title
                                                       };
                                                       handleViewTaskDetails(taskForModal);
                                                    }}
                                                    title="Click para ver detalles de la tarea"
                                                 >
                                                    {taskGroup.title}
                                       </div>
                                                 
                                                 <div className="text-xs text-gray-500">
                                                    {taskGroup.type === "subtask" ? "Subtarea" : "Tarea"}
                                                </div>
                                                </div>

                                             {/* Celdas para cada día */}
                                             {getWeekDays().map(day => {
                                                                                                 const sessions = taskGroup.sessions[day.dateStr] || [];
                                                 const plannedSessions = sessions.filter((s: any) => s.start_time && s.end_time);
                                                 const completedSessions = sessions.filter((s: any) => s.status === "completed");
                                                 const inProgressSessions = sessions.filter((s: any) => s.status === "in_progress");
                                                
                                                return (
                                                   <div key={`${taskGroup.id}-${day.dateStr}`} className="p-1 min-h-[50px] border-r border-gray-200 last:border-r-0">
                                                                                                            {sessions.length > 0 ? (
                                                         <div className="space-y-1">
                                                            {/* Sesiones planificadas */}
                                                            {plannedSessions.map((session: any, idx: number) => {
                                                               const startTime = session.start_time ? new Date(session.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
                                                               const endTime = session.end_time ? new Date(session.end_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
                                                               
                                                               // Calcular tiempo ejecutado real para esta sesión
                                                               const realTaskId = taskGroup.type === "subtask" 
                                                                  ? taskGroup.id.replace("subtask-", "")
                                                                  : taskGroup.id.replace("task-", "");
                                                               const realExecutedTime = executedTimeData[taskGroup.id]?.[day.dateStr] || 0;
                                                               const plannedMinutes = session.estimated_duration || 0;
                                                               const executedMinutes = realExecutedTime;

                                                               // Calcular porcentajes para las barras
                                                               const maxTime = Math.max(plannedMinutes, executedMinutes);
                                                               const plannedPercent = maxTime > 0 ? (plannedMinutes / maxTime) * 100 : 0;
                                                               const executedPercent = maxTime > 0 ? (executedMinutes / maxTime) * 100 : 0;
                                                               
                                                               return (
                                                                  <div 
                                                                     key={idx}
                                                                     className="text-xs p-1 rounded border bg-blue-50 border-blue-200 relative overflow-hidden"
                                                                     title={`${startTime} - ${endTime}\nPlanificado: ${Math.round(plannedMinutes / 60 * 100) / 100}h\nEjecutado: ${Math.round(executedMinutes / 60 * 100) / 100}h\nEstado: ${session.status === "completed" ? "Completado" : session.status === "in_progress" ? "En progreso" : "Planificado"}`}
                                                                  >
                                                                     {/* Barra de fondo - Tiempo planificado */}
                                                                     <div className="absolute inset-0 bg-blue-200 opacity-50"></div>
                                                                     
                                                                     {/* Barra de progreso - Tiempo ejecutado */}
                                                                     {executedMinutes > 0 && (
                                                                        <div 
                                                                           className={`absolute inset-y-0 left-0 ${
                                                                              executedMinutes >= plannedMinutes 
                                                                                 ? 'bg-green-400' 
                                                                                 : 'bg-green-300'
                                                                           } opacity-70`}
                                                                           style={{ width: `${Math.min(executedPercent, 100)}%` }}
                                                                        ></div>
                                                                     )}
                                                                     
                                                                     {/* Contenido de texto */}
                                                                     <div className="relative z-10">
                                                                        <div className="font-medium text-gray-800">
                                                                           {startTime && endTime ? `${startTime}-${endTime}` : 'Sin horario'}
                                                </div>
                                                                        <div className="flex justify-between text-xs">
                                                                           <span>P:{Math.round(plannedMinutes / 60 * 100) / 100}h</span>
                                                                           <span>E:{Math.round(executedMinutes / 60 * 100) / 100}h</span>
                                             </div>
                                                </div>
                                             </div>
                                                               );
                                                            })}
                                                            
                                                            {/* Sesiones sin horario específico */}
                                                            {sessions.filter((s: any) => !s.start_time || !s.end_time).map((session: any, idx: number) => {
                                                               const realExecutedTime = executedTimeData[taskGroup.id]?.[day.dateStr] || 0;
                                                               const plannedMinutes = session.estimated_duration || 0;
                                                               const executedMinutes = realExecutedTime;

                                                               return (
                                                                  <div 
                                                                     key={`no-time-${idx}`}
                                                                     className="text-xs p-1 rounded border bg-gray-100 border-gray-300 text-gray-700 relative overflow-hidden"
                                                                     title={`Sin horario específico\nPlanificado: ${Math.round(plannedMinutes / 60 * 100) / 100}h\nEjecutado: ${Math.round(executedMinutes / 60 * 100) / 100}h\nEstado: ${session.status === "completed" ? "Completado" : session.status === "in_progress" ? "En progreso" : "Asignado"}`}
                                                                  >
                                                                     {/* Barra de progreso para sesiones sin horario */}
                                                                     {executedMinutes > 0 && (
                                                                        <div 
                                                                           className="absolute inset-y-0 left-0 bg-green-300 opacity-50"
                                                                           style={{ width: `${Math.min((executedMinutes / plannedMinutes) * 100, 100)}%` }}
                                                                        ></div>
                                                                     )}
                                                                     
                                                                     <div className="relative z-10">
                                                                        <div>Sin horario</div>
                                                                        <div className="flex justify-between">
                                                                           <span>P:{Math.round(plannedMinutes / 60 * 100) / 100}h</span>
                                                                           <span>E:{Math.round(executedMinutes / 60 * 100) / 100}h</span>
                                       </div>
                                       </div>
                                       </div>
                                                               );
                                                            })}
                                       </div>
                                                      ) : (
                                                         <div className="text-xs text-gray-400 text-center pt-2">-</div>
                                                      )}
                                    </div>
                                 );
                                             })}

                                             {/* Columna de total para esta tarea */}
                                             <div className="p-1 bg-gray-50 border-l border-gray-200 text-center text-xs min-h-[50px] flex flex-col justify-center">
                                                                                                 <div className="text-gray-700 leading-tight">
                                                    P: {Math.round((totalTaskHours / 60) * 100) / 100}h
                                                 </div>
                                                 <div className="text-gray-700 leading-tight">
                                                    E: {Math.round((getWeekDays().reduce((total, day) => {
                                                       const realExecutedTime = executedTimeData[taskGroup.id]?.[day.dateStr] || 0;
                                                       return total + realExecutedTime;
                                                    }, 0) / 60) * 100) / 100}h
                                                 </div>
                                             </div>
                                          </div>
                                       );
                                       })}

                                                                              {/* Filas de totales por día - simplificadas */}
                                       <div className="mt-3 pt-2 border-t border-gray-300">
                                          {/* Fila de horas planificadas */}
                                          <div className="grid grid-cols-8 gap-2 mb-1">
                                             <div className="p-1 bg-blue-50 text-xs text-blue-700 text-center">
                                                📅 Plan
                                             </div>
                                             {getWeekDays().map(day => {
                                                const plannedHours = ganttData.reduce((total, taskGroup) => {
                                                   const sessions = taskGroup.sessions[day.dateStr] || [];
                                                   const dayTotal = sessions.reduce((daySum: number, session: any) => {
                                                      return session.start_time && session.end_time ? daySum + (session.estimated_duration || 0) : daySum;
                                                   }, 0);
                                                   return total + dayTotal;
                                                }, 0);

                                                return (
                                                   <div key={`planned-${day.dateStr}`} className="p-1 bg-blue-50 text-center text-xs text-blue-700">
                                                      {Math.round((plannedHours / 60) * 100) / 100}h
                                                   </div>
                                                );
                                             })}
                                             <div className="p-1 bg-blue-100 text-center text-xs text-blue-800">
                                                {Math.round((ganttData.reduce((grandTotal, taskGroup) => {
                                                   return grandTotal + getWeekDays().reduce((total, day) => {
                                                      const sessions = taskGroup.sessions[day.dateStr] || [];
                                                      return total + sessions.reduce((daySum: number, session: any) => {
                                                         return session.start_time && session.end_time ? daySum + (session.estimated_duration || 0) : daySum;
                                                      }, 0);
                                                   }, 0);
                                                }, 0) / 60) * 100) / 100}h
                                             </div>
                                          </div>

                                          {/* Fila de horas ejecutadas */}
                                          <div className="grid grid-cols-8 gap-2">
                                             <div className="p-1 bg-green-50 text-xs text-green-700 text-center">
                                                ✅ Ejec
                                             </div>
                                             {getWeekDays().map(day => {
                                                const executedHours = ganttData.reduce((total, taskGroup) => {
                                                   const realExecutedTime = executedTimeData[taskGroup.id]?.[day.dateStr] || 0;
                                                   return total + realExecutedTime;
                                                }, 0);

                                                return (
                                                   <div key={`executed-${day.dateStr}`} className="p-1 bg-green-50 text-center text-xs text-green-700">
                                                      {Math.round((executedHours / 60) * 100) / 100}h
                                                   </div>
                                                );
                                             })}
                                             <div className="p-1 bg-green-100 text-center text-xs text-green-800">
                                                {Math.round((ganttData.reduce((grandTotal, taskGroup) => {
                                                   return grandTotal + getWeekDays().reduce((total, day) => {
                                                      const realExecutedTime = executedTimeData[taskGroup.id]?.[day.dateStr] || 0;
                                                      return total + realExecutedTime;
                                                   }, 0);
                                                }, 0) / 60) * 100) / 100}h
                                             </div>
                                          </div>
                                       </div>
                                    </div>
                                 </div>
                              ) : (
                                 <div className="py-12 text-center">
                                    <div className="text-6xl mb-4">📈</div>
                                    <h4 className="text-lg font-medium text-gray-600 mb-2">No hay datos para mostrar en el Gantt</h4>
                                    <p className="text-sm text-gray-500 mb-4">Programa algunas tareas para ver el diagrama semanal</p>
                                    <button
                                       onClick={() => setActiveGestionSubTab("planificar")}
                                       className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                                    >
                                       📅 Planificar Día
                                    </button>
                              </div>
                           )}
                        </div>
                     </div>
                     )}
                  </div>
               )}


                        </div>
         )}

         {/* Modal de selección de tareas */}
         {showTaskSelectorModal && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
               <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                     <h3 className="text-lg font-medium">🔍 Seleccionar Tarea para Programar</h3>
                     <button 
                        onClick={() => setShowTaskSelectorModal(false)} 
                        className="text-gray-400 hover:text-gray-500 focus:outline-none"
                     >
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                     </button>
                           </div>

                  <div className="px-6 py-4">
                     {/* Opciones principales */}
                     <div className="mb-6 space-y-4">
                        {/* Botones de acción principal */}
                        <div className="flex flex-wrap gap-3 mb-4">
                           <button
                              onClick={() => setShowCustomActivityForm(true)}
                              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                           >
                              ✨ Crear Actividad adicional
                           </button>
                           <div className="text-gray-400">|</div>
                           <span className="text-sm text-gray-600 py-2">O selecciona una tarea existente:</span>
                              </div>

                        {/* Formulario de actividad personalizada */}
                        {showCustomActivityForm && (
                           <div className="border border-purple-200 rounded-lg p-4 bg-purple-50 mb-4">
                              <div className="flex justify-between items-center mb-4">
                                 <h4 className="font-medium text-purple-800">✨ Nueva Actividad Personal</h4>
                                 <button 
                                    onClick={resetCustomActivityForm}
                                    className="text-purple-600 hover:text-purple-800"
                                 >
                                    ✕
                                 </button>
                                       </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 {/* Título */}
                                 <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">📝 Título *</label>
                                    <input
                                       type="text"
                                       placeholder="Ej: Reunión con cliente, Capacitación, Investigación..."
                                       value={customActivity.title}
                                       onChange={(e) => setCustomActivity({...customActivity, title: e.target.value})}
                                       className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                       </div>

                                 {/* Descripción */}
                                 <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">📄 Descripción</label>
                                    <textarea
                                       placeholder="Detalles adicionales (opcional)..."
                                       value={customActivity.description}
                                       onChange={(e) => setCustomActivity({...customActivity, description: e.target.value})}
                                       rows={2}
                                       className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                 </div>

                                 {/* Proyecto */}
                                 <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">🏢 Proyecto</label>
                                    <select
                                       value={customActivity.selected_project_id}
                                       onChange={(e) => setCustomActivity({...customActivity, selected_project_id: e.target.value})}
                                       className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                       <option value="">📋 Sin proyecto específico</option>
                                       {getUniqueProjects().map(project => (
                                          <option key={project.id} value={project.id}>
                                             🏢 {project.name}
                                          </option>
                                       ))}
                                    </select>
                                 </div>

                                 {/* Tipo */}
                                       <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">🏷️ Tipo</label>
                                    <select
                                       value={customActivity.type}
                                       onChange={(e) => {
                                          const newType = e.target.value as any;
                                          setCustomActivity({
                                             ...customActivity, 
                                             type: newType,
                                             title: newType === "daily" ? "🤝 Daily Standup" : customActivity.title,
                                             estimated_duration: newType === "daily" ? 15 : customActivity.estimated_duration
                                          });
                                       }}
                                       className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                       <option value="work">💼 Trabajo</option>
                                       <option value="meeting">🤝 Reunión</option>
                                       <option value="daily">👥 Daily</option>
                                       <option value="training">📚 Capacitación</option>
                                       <option value="other">🔧 Otro</option>
                                    </select>
                                       </div>

                                 {/* Duración */}
                                 <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">⏱️ Duración (minutos)</label>
                                    <input
                                       type="number"
                                       min="5"
                                       max="480"
                                       step="5"
                                       value={customActivity.estimated_duration}
                                       onChange={(e) => setCustomActivity({...customActivity, estimated_duration: parseInt(e.target.value) || 30})}
                                       className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                    </div>

                                 {/* Prioridad */}
                                 <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">🎯 Prioridad</label>
                                    <select
                                       value={customActivity.priority}
                                       onChange={(e) => setCustomActivity({...customActivity, priority: e.target.value as any})}
                                       className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    >
                                       <option value="low">🟢 Baja</option>
                                       <option value="medium">🟡 Media</option>
                                       <option value="high">🔴 Alta</option>
                                    </select>
                              </div>
                           </div>



                              <div className="flex justify-end gap-2 mt-4">
                                 <button
                                    onClick={resetCustomActivityForm}
                                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
                                 >
                                    Cancelar
                                 </button>
                                 <button
                                    onClick={handleCreateCustomActivity}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                                 >
                                    ⏰ Programar Actividad
                                 </button>
                        </div>
                        </div>
                        )}

                        {/* Búsqueda */}
                        <div>
                           <label className="block text-sm font-medium text-gray-700 mb-2">🔍 Buscar</label>
                           <input
                              type="text"
                              placeholder="Buscar por título, descripción o proyecto..."
                              value={taskSearchQuery}
                              onChange={(e) => setTaskSearchQuery(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                           />
                        </div>

                        {/* Filtros */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                           {/* Filtro por proyecto */}
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">🏢 Proyecto</label>
                              <select
                                 value={taskFilterProject}
                                 onChange={(e) => setTaskFilterProject(e.target.value)}
                                 className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                 <option value="">Todos los proyectos</option>
                                 {getUniqueProjects().map(project => (
                                    <option key={project.id} value={project.id}>{project.name}</option>
                                 ))}
                              </select>
                           </div>

                           {/* Filtro por prioridad */}
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">🎯 Prioridad</label>
                              <select
                                 value={taskFilterPriority}
                                 onChange={(e) => setTaskFilterPriority(e.target.value)}
                                 className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                 <option value="">Todas las prioridades</option>
                                 <option value="high">Alta</option>
                                 <option value="medium">Media</option>
                                 <option value="low">Baja</option>
                              </select>
                              </div>

                           {/* Filtro por estado */}
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">📋 Estado</label>
                              <select
                                 value={taskFilterStatus}
                                 onChange={(e) => setTaskFilterStatus(e.target.value)}
                                 className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                 <option value="">Todos los estados</option>
                                 <option value="available">Disponibles</option>
                                 <option value="delayed">Retrasadas</option>
                                 <option value="returned">Devueltas</option>
                              </select>
                           </div>

                           {/* Ordenar por */}
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">📊 Ordenar por</label>
                              <select
                                 value={taskSortBy}
                                 onChange={(e) => setTaskSortBy(e.target.value as "deadline" | "priority" | "duration" | "title")}
                                 className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                 <option value="deadline">Fecha límite</option>
                                 <option value="priority">Prioridad</option>
                                 <option value="duration">Duración</option>
                                 <option value="title">Título</option>
                              </select>
                           </div>
                        </div>

                        {/* Botón limpiar filtros */}
                        <div className="flex justify-end">
                           <button
                              onClick={() => {
                                 setTaskSearchQuery("");
                                 setTaskFilterProject("");
                                 setTaskFilterPriority("");
                                 setTaskFilterStatus("");
                                 setTaskSortBy("deadline");
                              }}
                              className="text-sm px-3 py-1 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
                           >
                              🗑️ Limpiar filtros
                           </button>
                        </div>
                     </div>

                     {/* Lista de tareas filtradas */}
                     <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                        {getFilteredAndSearchedTasks().length > 0 ? (
                           <div className="divide-y divide-gray-200">
                              {getFilteredAndSearchedTasks().map(({ task, source }) => (
                                 <div 
                                    key={`${source}-${task.id}`} 
                                    className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                                    onClick={() => handleSelectTaskFromModal(task)}
                                 >
                                    <div className="flex items-center justify-between">
                                       <div className="flex-1">
                                          <div className="flex items-center gap-3 mb-2">
                                             <div className="text-sm">
                                          {(() => {
                                             const { bg, text } = getProjectColor(task.projectName || "Sin proyecto", task.project_id);
                                                   return <span className={`inline-block px-2 py-1 ${bg} ${text} text-xs font-medium rounded-full`}>{task.projectName || "Sin proyecto"}</span>;
                                          })()}
                                       </div>
                                             {getStatusBadge(task, source)}
                                             {getPriorityBadge(task.priority)}
                                       </div>
                                          
                                          <h5 className="font-medium text-gray-900 mb-1">
                                             {task.title}
                                             {task.type === "subtask" && (
                                                <span className="ml-2 text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">Subtarea</span>
                                             )}
                                          </h5>
                                          
                                          <p className="text-sm text-gray-600 mb-2">
                                             <RichTextSummary text={task.description || "Sin descripción"} maxLength={120} />
                                          </p>
                                          
                                          <div className="flex items-center gap-4 text-xs text-gray-500">
                                             <span>⏱️ {Math.round((task.estimated_duration / 60) * 100) / 100}h estimadas</span>
                                             {task.deadline && (
                                                <span>📅 Vence: {format(new Date(task.deadline), "dd/MM/yyyy")}</span>
                                             )}
                                             {source === "delayed" && task.assignment_date && (
                                                <span className="text-orange-600 font-medium">
                                                   ⚠️ Retrasada desde {format(new Date(task.assignment_date), "dd/MM/yyyy")}
                                                </span>
                                             )}
                                       </div>
                                    </div>
                                       
                                       <div className="ml-4">
                                          <button className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors">
                                             ⏰ Seleccionar
                                          </button>
                              </div>
                           </div>
                                 </div>
                              ))}
                        </div>
                     ) : (
                           <div className="py-8 text-center text-gray-500">
                              <div className="text-4xl mb-4">🔍</div>
                              <p className="text-lg font-medium mb-2">No se encontraron tareas</p>
                              <p className="text-sm">Ajusta los filtros para ver más resultados</p>
                        </div>
                     )}
                     </div>

                     {/* Resumen */}
                     <div className="mt-4 p-3 bg-gray-50 rounded-md">
                        <p className="text-sm text-gray-600">
                           📊 Mostrando <strong>{getFilteredAndSearchedTasks().length}</strong> de <strong>{getAvailableTasksForScheduling().length}</strong> tareas disponibles
                        </p>
                        </div>
                        </div>
                        </div>
                        </div>
         )}

         {/* Modal de programación de tiempo */}
         {showTimeModal && currentTaskForTime && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
               <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                     <h3 className="text-lg font-medium">
                        ⏰ Programar Horario {schedulingForTomorrow ? "para Mañana" : "para Hoy"}
                     </h3>
                     <button 
                        onClick={() => {
                           setShowTimeModal(false);
                           setCurrentTaskForTime(null);
                           setSchedulingForTomorrow(false); // Reset scheduling context
                        }} 
                        className="text-gray-400 hover:text-gray-500 focus:outline-none"
                     >
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                     </button>
                     </div>

                  <div className="px-6 py-4">
                     {/* Información de la tarea */}
                     <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="text-sm">
                              {(() => {
                                 const { bg, text } = getProjectColor(currentTaskForTime.projectName || "Sin proyecto", currentTaskForTime.project_id);
                                 return <span className={`inline-block px-2 py-1 ${bg} ${text} text-xs font-medium rounded-full`}>{currentTaskForTime.projectName || "Sin proyecto"}</span>;
                              })()}
                        </div>
                           {getPriorityBadge(currentTaskForTime.priority)}
                  </div>
                        <h4 className="font-medium text-gray-900 mb-2">{currentTaskForTime.title}</h4>
                        <p className="text-sm text-gray-600 mb-2">
                           {currentTaskForTime.description ? (
                              <RichTextSummary text={currentTaskForTime.description} maxLength={150} />
                           ) : (
                              "Sin descripción"
                           )}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                           <span>⏱️ {Math.round((currentTaskForTime.estimated_duration / 60) * 100) / 100}h estimadas</span>
                           {currentTaskForTime.deadline && (
                              <span>📅 Vence: {format(new Date(currentTaskForTime.deadline), "dd/MM/yyyy")}</span>
                           )}
                        </div>
                     </div>

                     {/* Formulario de programación */}
                     <form onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.target as HTMLFormElement);
                        const startTime = formData.get('startTime') as string;
                        const endTime = formData.get('endTime') as string;
                        
                        if (!startTime || !endTime) {
                           toast.error("Por favor, complete todos los campos");
                           return;
                        }

                        // Calcular duración en minutos
                        const [startHour, startMin] = startTime.split(':').map(Number);
                        const [endHour, endMin] = endTime.split(':').map(Number);
                        const startMinutes = startHour * 60 + startMin;
                        const endMinutes = endHour * 60 + endMin;
                        
                        if (endMinutes <= startMinutes) {
                           toast.error("La hora de fin debe ser posterior a la hora de inicio");
                           return;
                        }

                        const duration = endMinutes - startMinutes;
                        handleConfirmTimeSlot(startTime, endTime, duration);
                     }}>
                        <div className="space-y-4">
                           <div className="grid grid-cols-2 gap-4">
                              <div>
                                 <label htmlFor="startTime" className="block text-sm font-medium text-gray-700 mb-1">
                                    🕐 Hora de Inicio
                                 </label>
                                 <input
                                    type="time"
                                    id="startTime"
                                    name="startTime"
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                 />
                        </div>
                              <div>
                                 <label htmlFor="endTime" className="block text-sm font-medium text-gray-700 mb-1">
                                    🕐 Hora de Fin
                                 </label>
                                 <input
                                    type="time"
                                    id="endTime"
                                    name="endTime"
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                 />
                        </div>
                           </div>

                           <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                              <p className="text-sm text-orange-700">
                                 💡 <strong>Tip:</strong> Este horario te ayudará a organizar tu día. Podrás ajustar el tiempo real cuando reportes tu progreso.
                           </p>
                        </div>
                     </div>

                        <div className="mt-6 flex justify-end gap-3">
                           <button
                              type="button"
                              onClick={() => {
                                 setShowTimeModal(false);
                                 setCurrentTaskForTime(null);
                              }}
                              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                           >
                              Cancelar
                           </button>
                           <button
                              type="submit"
                              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                           >
                              📅 Programar Tarea
                           </button>
                  </div>
                     </form>
                  </div>
               </div>
            </div>
         )}

         {/* Modal de confirmación de guardar tareas */}
         {showConfirmModal && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
               <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                     <h3 className="text-lg font-medium">
                        {showTimeScheduling ? "Programar horarios (OBLIGATORIO)" : "Confirmar asignación de tareas"}
                     </h3>
                     <button onClick={() => {
                        setShowConfirmModal(false);
                        setShowTimeScheduling(false);
                        setTaskSchedules({});
                     }} className="text-gray-400 hover:text-gray-500 focus:outline-none">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                     </button>
                  </div>

                  {!showTimeScheduling ? (
                     <>
                        <div className="px-6 py-4">
                           <p className="mb-4 text-gray-700">
                              Estás a punto de asignar estas {selectedTasks.length} tareas para el día de hoy ({format(new Date(), "dd/MM/yyyy")}). 
                              <strong> Establece TU PROPIO tiempo estimado para cada tarea y luego deberás programar horarios específicos (obligatorio):</strong>
                           </p>

                           <div className="mb-4 p-3 bg-gray-50 rounded-md max-h-80 overflow-y-auto">
                              <h4 className="text-sm font-medium text-gray-700 mb-3">Configurar duración para las tareas seleccionadas:</h4>
                              <div className="space-y-3">
                                 {selectedTasks.map((taskId) => {
                                    const task = taskItems.find((t) => t.id === taskId);
                                    const customDuration = customDurations[taskId];
                                    if (!task) return null;

                                    return (
                                       <div key={taskId} className="p-3 border border-gray-200 rounded-lg bg-white">
                                          <div className="flex items-start gap-3">
                                             <div className="flex-shrink-0 mt-1">
                                                {task.type === "subtask" ? 
                                                   <span className="inline-block w-6 h-6 rounded-full bg-indigo-500 text-white text-xs font-bold flex items-center justify-center">S</span> : 
                                                   <span className="inline-block w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold flex items-center justify-center">T</span>
                                                }
                                             </div>
                                             <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 mb-1">{task.title}</p>
                                                <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                                                   {task.type === "subtask" && task.subtask_title && <span>T.P: {task.subtask_title}</span>}
                                                   {task.deadline && <span className="flex-shrink-0">📅 {format(new Date(task.deadline), "dd/MM")}</span>}
                                                </div>
                                                
                                                {/* Inputs para duración personalizada */}
                                                <div className="flex items-center gap-2">
                                                   <label className="text-xs font-medium text-gray-700">¿Cuánto tiempo necesitas? <span className="text-red-500">*</span></label>
                                                   <input
                                                      type="number"
                                                      min="1"
                                                      step="1"
                                                      value={customDuration?.value === 0 ? '' : customDuration?.value || ''}
                                                      onChange={(e) => {
                                                         const value = parseInt(e.target.value) || 0;
                                                         setCustomDurations(prev => ({
                                                            ...prev,
                                                            [taskId]: { ...prev[taskId], value }
                                                         }));
                                                      }}
                                                      placeholder="Ingresa tu tiempo"
                                                      className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                                                   />
                                                   <select
                                                      value={customDuration?.unit || 'minutes'}
                                                      onChange={(e) => {
                                                         const unit = e.target.value as "minutes" | "hours";
                                                         setCustomDurations(prev => ({
                                                            ...prev,
                                                            [taskId]: { ...prev[taskId], unit }
                                                         }));
                                                      }}
                                                      className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                                                   >
                                                      <option value="minutes">minutos</option>
                                                      <option value="hours">horas</option>
                                                   </select>
                                                </div>
                                             </div>
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>
                           </div>

                           <div className="bg-yellow-50 p-3 rounded-md mb-4">
                              <div className="flex items-center">
                                 <svg className="h-5 w-5 text-yellow-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                 </svg>
                                 <p className="text-sm font-medium text-yellow-800">
                                    Tiempo total con tus estimaciones: {calculateTotalCustomDuration().toFixed(1)} hora{calculateTotalCustomDuration() !== 1 ? "s" : ""}
                                 </p>
                              </div>
                           </div>
                           
                           {!areAllCustomDurationsValid() && (
                              <div className="bg-red-50 p-3 rounded-md mb-4">
                                 <div className="flex items-center">
                                    <svg className="h-5 w-5 text-red-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <p className="text-sm font-medium text-red-800">
                                       Por favor, completa la duración estimada para todas las tareas.
                                    </p>
                                 </div>
                              </div>
                           )}
                        </div>

                        <div className="px-6 py-3 bg-gray-50 flex justify-end space-x-3 border-t border-gray-200">
                           <button onClick={() => {
                              setShowConfirmModal(false);
                              setCustomDurations({});
                              setShowDurationInputs(false);
                           }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-yellow-500">
                              Cancelar
                           </button>
                           <button 
                              onClick={handleConfirmSave} 
                              disabled={saving || !areAllCustomDurationsValid()} 
                              className="px-4 py-2 text-sm font-medium text-white bg-yellow-500 border border-transparent rounded-md shadow-sm hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                           >
                              Continuar → Programar Horarios
                           </button>
                        </div>
                     </>
                  ) : (
                     <>
                        <div className="px-6 py-4">
                           <p className="mb-4 text-gray-700">
                              <strong>OBLIGATORIO:</strong> Debes asignar horarios específicos a TODAS las tareas. No se puede guardar hasta que todas tengan horario asignado.
                           </p>
                           
                                                       {!areAllTasksScheduled() ? (
                               <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                                  <div className="flex items-center">
                                     <svg className="h-5 w-5 text-orange-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                     </svg>
                                     <p className="text-sm font-medium text-orange-800">
                                        Faltan {selectedTasks.filter(taskId => !taskSchedules[taskId]?.startTime).length} tareas por programar
                                     </p>
                                  </div>
                               </div>
                            ) : (
                               <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                                  <div className="flex items-center">
                                     <svg className="h-5 w-5 text-green-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                     </svg>
                                     <p className="text-sm font-medium text-green-800">
                                        ¡Perfecto! Todas las tareas tienen horario asignado. Ya puedes guardar.
                                     </p>
                                  </div>
                               </div>
                            )}

                           <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                              {/* Lista de tareas para programar */}
                              <div className="space-y-4">
                                 <h4 className="text-lg font-medium text-gray-900">Tareas seleccionadas</h4>
                                 {selectedTasks.map((taskId) => {
                                    const task = taskItems.find((t) => t.id === taskId);
                                    if (!task) return null;

                                    const schedule = taskSchedules[taskId];
                                    const customDuration = customDurations[taskId];
                                    const durationHours = customDuration 
                                       ? (customDuration.unit === "hours" ? customDuration.value : customDuration.value / 60)
                                       : Math.round((task.estimated_duration / 60) * 100) / 100;

                                    return (
                                       <div key={taskId} className="p-3 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors">
                                          <div className="flex items-start justify-between gap-3">
                                             <div className="flex-1 min-w-0">
                                                <div className="flex items-center mb-1">
                                                   <span className={`inline-block w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center mr-2 flex-shrink-0 ${
                                                      task.type === "subtask" 
                                                         ? "bg-indigo-500 text-white" 
                                                         : "bg-blue-500 text-white"
                                                   }`}>
                                                      {task.type === "subtask" ? "S" : "T"}
                                                   </span>
                                                   <h5 className="text-sm font-medium text-gray-900 leading-tight">{task.title}</h5>
                                                </div>
                                                
                                                <div className="flex items-center gap-3 text-xs text-gray-500 ml-7">
                                                   {task.type === "subtask" && task.subtask_title && (
                                                      <span>T.P: {task.subtask_title}</span>
                                                   )}
                                                   <span className="flex-shrink-0">⏱️ {durationHours} h</span>
                                                </div>
                                                
                                                {schedule && (
                                                   <div className="mt-2 ml-7 px-2 py-1 bg-green-50 rounded text-xs">
                                                      <span className="text-green-800 font-medium">
                                                         📅 {(() => {
                                                            const startMinutes = parseInt(schedule.startTime.split(':')[0]) * 60 + parseInt(schedule.startTime.split(':')[1]);
                                                            const endMinutes = parseInt(schedule.endTime.split(':')[0]) * 60 + parseInt(schedule.endTime.split(':')[1]);
                                                            return `${minutesToTimeAMPM(startMinutes)} - ${minutesToTimeAMPM(endMinutes)}`;
                                                         })()}
                                                      </span>
                                                   </div>
                                                )}
                                             </div>
                                             
                                             <div className="flex flex-col gap-1.5 flex-shrink-0">
                                                <button
                                                   onClick={() => setSchedulingTaskId(taskId)}
                                                   className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors shadow-sm whitespace-nowrap"
                                                >
                                                   {schedule ? "Cambiar" : "Asignar"}
                                                </button>
                                                {schedule && (
                                                   <button
                                                      onClick={() => {
                                                         const newSchedules = { ...taskSchedules };
                                                         delete newSchedules[taskId];
                                                         setTaskSchedules(newSchedules);
                                                      }}
                                                      className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors shadow-sm whitespace-nowrap"
                                                   >
                                                      Quitar
                                                   </button>
                                                )}
                                             </div>
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>

                              {/* Interfaz de selección de horario */}
                              {schedulingTaskId && (
                                 <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="text-lg font-medium text-gray-900 mb-4">
                                       Programar: {taskItems.find(t => t.id === schedulingTaskId)?.title}
                                    </h4>
                                    
                                    <div className="mb-4">
                                       <label className="block text-sm font-medium text-gray-700 mb-2">
                                          Hora de inicio
                                       </label>
                                       <select
                                          value={selectedTimeSlot?.start || ''}
                                          onChange={(e) => {
                                             const startMinutes = parseInt(e.target.value);
                                             const task = taskItems.find(t => t.id === schedulingTaskId);
                                             if (task && schedulingTaskId) {
                                                // Usar duración personalizada en lugar de la original
                                                const customDuration = customDurations[schedulingTaskId];
                                                const durationMinutes = customDuration 
                                                   ? (customDuration.unit === "hours" ? customDuration.value * 60 : customDuration.value)
                                                   : task.estimated_duration;
                                                const endMinutes = startMinutes + durationMinutes;
                                                setSelectedTimeSlot({ start: startMinutes, end: endMinutes });
                                             }
                                          }}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                       >
                                          <option value="">Seleccionar hora</option>
                                          {generateTimeSlots().map((slot) => {
                                             const task = taskItems.find(t => t.id === schedulingTaskId);
                                             // Usar duración personalizada en lugar de la original
                                             const customDuration = schedulingTaskId ? customDurations[schedulingTaskId] : null;
                                             const durationMinutes = customDuration 
                                                ? (customDuration.unit === "hours" ? customDuration.value * 60 : customDuration.value)
                                                : task?.estimated_duration || 0;
                                             const hasConflict = wouldStartTimeConflict(slot.time, durationMinutes, schedulingTaskId);
                                             
                                             return (
                                                <option 
                                                   key={slot.time} 
                                                   value={slot.time}
                                                   disabled={hasConflict}
                                                   style={{ 
                                                      color: hasConflict ? '#9CA3AF' : 'inherit',
                                                      fontStyle: hasConflict ? 'italic' : 'normal'
                                                   }}
                                                >
                                                   {slot.display} {hasConflict ? '(ocupado)' : ''}
                                                </option>
                                             );
                                          })}
                                       </select>
                                    </div>

                                    {selectedTimeSlot && (
                                       <div className="mb-4 p-3 bg-blue-50 rounded-md">
                                          <p className="text-sm text-blue-800">
                                             <strong>Horario seleccionado:</strong><br />
                                             {minutesToTimeAMPM(selectedTimeSlot.start)} - {minutesToTimeAMPM(selectedTimeSlot.end)}
                                          </p>
                                          {hasScheduleConflict(selectedTimeSlot.start, selectedTimeSlot.end, schedulingTaskId) && (
                                             <p className="text-sm text-red-600 mt-2">
                                                ⚠️ Este horario tiene conflicto con otra tarea programada
                                             </p>
                                          )}
                                       </div>
                                    )}

                                    <div className="flex space-x-2">
                                       <button
                                          onClick={() => {
                                             if (selectedTimeSlot && schedulingTaskId) {
                                                setTaskSchedules(prev => ({
                                                   ...prev,
                                                   [schedulingTaskId]: {
                                                      startTime: minutesToTime(selectedTimeSlot.start),
                                                      endTime: minutesToTime(selectedTimeSlot.end),
                                                      duration: selectedTimeSlot.end - selectedTimeSlot.start
                                                   }
                                                }));
                                                setSchedulingTaskId(null);
                                                setSelectedTimeSlot(null);
                                             }
                                          }}
                                          disabled={!selectedTimeSlot || (selectedTimeSlot && hasScheduleConflict(selectedTimeSlot.start, selectedTimeSlot.end, schedulingTaskId))}
                                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                       >
                                          Confirmar horario
                                       </button>
                                       <button
                                          onClick={() => {
                                             setSchedulingTaskId(null);
                                             setSelectedTimeSlot(null);
                                          }}
                                          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                                       >
                                          Cancelar
                                       </button>
                                    </div>
                                 </div>
                              )}

                              {/* Timeline visual del día */}
                              <div className="bg-gray-50 p-4 rounded-lg">
                                 <h4 className="text-lg font-medium text-gray-900 mb-4">
                                    📅 Vista del día - {format(new Date(), "dd/MM/yyyy")}
                                 </h4>
                                 
                                 <div className="relative border border-gray-200 rounded-lg bg-white overflow-hidden">
                                    {/* Grid de fondo con horarios */}
                                    <div className="relative">
                                       {(() => {
                                          const timeSlots = [];
                                          const SLOT_HEIGHT = 30; // Altura de cada slot de 30 minutos
                                          
                                          // Generar slots de 30 minutos (8 AM - 6 PM)
                                          for (let hour = 8; hour <= 18; hour++) {
                                             for (let minutes = 0; minutes < 60; minutes += 30) {
                                                if (hour === 18 && minutes > 0) break;
                                                
                                                const timeInMinutes = hour * 60 + minutes;
                                                const timeAMPM = minutesToTimeAMPM(timeInMinutes);
                                                const isHourMark = minutes === 0;
                                                
                                                timeSlots.push({
                                                   timeInMinutes,
                                                   timeAMPM,
                                                   isHourMark
                                                });
                                             }
                                          }
                                          
                                          return (
                                             <div className="relative" style={{ height: `${timeSlots.length * SLOT_HEIGHT}px` }}>
                                                {/* Grid de tiempo de fondo */}
                                                {timeSlots.map((slot, index) => (
                                                   <div
                                                      key={slot.timeInMinutes}
                                                      className={`absolute w-full border-b ${
                                                         slot.isHourMark ? 'border-gray-300' : 'border-gray-100'
                                                      }`}
                                                      style={{
                                                         height: `${SLOT_HEIGHT}px`,
                                                         top: `${index * SLOT_HEIGHT}px`,
                                                         minHeight: `${SLOT_HEIGHT}px`,
                                                         maxHeight: `${SLOT_HEIGHT}px`
                                                      }}
                                                   >
                                                      <div className="flex items-center h-full">
                                                         <div 
                                                            className={`w-16 flex-shrink-0 text-xs font-mono px-2 flex items-center justify-start ${
                                                               slot.isHourMark ? 'text-gray-700 font-medium' : 'text-gray-400'
                                                            }`}
                                                            style={{ height: `${SLOT_HEIGHT}px` }}
                                                         >
                                                            {slot.isHourMark ? slot.timeAMPM : ''}
                                                         </div>
                                                         <div 
                                                            className="flex-1 bg-gray-50 bg-opacity-20"
                                                            style={{ height: `${SLOT_HEIGHT}px` }}
                                                         ></div>
                                                      </div>
                                                   </div>
                                                ))}
                                                
                                                {/* Tareas programadas posicionadas absolutamente */}
                                                {Object.entries(taskSchedules).map(([taskId, schedule]) => {
                                                   if (!schedule) return null;
                                                   
                                                   const startMinutes = parseInt(schedule.startTime.split(':')[0]) * 60 + parseInt(schedule.startTime.split(':')[1]);
                                                   const endMinutes = parseInt(schedule.endTime.split(':')[0]) * 60 + parseInt(schedule.endTime.split(':')[1]);
                                                   const durationMinutes = endMinutes - startMinutes;
                                                   
                                                   // Calcular posición relativa desde las 8 AM
                                                   const startOffset = (startMinutes - 8 * 60) / 30; // En slots de 30 min
                                                   const durationSlots = durationMinutes / 30;
                                                   
                                                   const task = taskItems.find(t => t.id === taskId);
                                                   
                                                   return (
                                                      <div
                                                         key={taskId}
                                                         className="absolute px-3 py-2 rounded-lg text-sm border-l-4 border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer"
                                                         style={{
                                                            top: `${startOffset * SLOT_HEIGHT + 1}px`,
                                                            height: `${durationSlots * SLOT_HEIGHT - 2}px`,
                                                            left: '68px', // 64px (w-16) + 4px de margen
                                                            right: '8px'
                                                         }}
                                                         title={`${task?.title || 'Tarea sin título'} (${minutesToTimeAMPM(startMinutes)} - ${minutesToTimeAMPM(endMinutes)})`}
                                                      >
                                                         <div className="flex items-start h-full">
                                                            <span className={`inline-block w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center mr-3 mt-0.5 flex-shrink-0 shadow-sm transition-transform duration-200 hover:scale-110 ${
                                                               task?.type === "subtask" 
                                                                  ? "bg-indigo-500 text-white"
                                                                  : "bg-blue-500 text-white"
                                                            }`}>
                                                               {task?.type === "subtask" ? "S" : "T"}
                                                            </span>
                                                            <div className="flex-1 min-w-0 overflow-hidden">
                                                               <div className="font-semibold leading-tight text-blue-900 mb-1 truncate">
                                                                  {task?.title || 'Tarea sin título'}
                                                               </div>
                                                               <div className="text-xs text-blue-600 font-medium truncate opacity-90">
                                                                  {minutesToTimeAMPM(startMinutes)} - {minutesToTimeAMPM(endMinutes)}
                                                               </div>
                                                            </div>
                                                         </div>
                                                      </div>
                                                   );
                                                })}
                                                
                                                {/* Eventos de trabajo posicionados absolutamente */}
                                                {workEvents.map((event) => {
                                                   const startMinutes = parseInt(event.start_time.split(':')[0]) * 60 + parseInt(event.start_time.split(':')[1]);
                                                   const endMinutes = parseInt(event.end_time.split(':')[0]) * 60 + parseInt(event.end_time.split(':')[1]);
                                                   const durationMinutes = endMinutes - startMinutes;
                                                   
                                                   // Calcular posición relativa desde las 8 AM
                                                   const startOffset = (startMinutes - 8 * 60) / 30; // En slots de 30 min
                                                   const durationSlots = durationMinutes / 30;
                                                   
                                                   return (
                                                      <div
                                                         key={event.id}
                                                         className="absolute px-3 py-2 rounded-lg text-sm border-l-4 border-purple-500 bg-gradient-to-r from-purple-50 to-purple-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer"
                                                         style={{
                                                            top: `${startOffset * SLOT_HEIGHT + 1}px`,
                                                            height: `${durationSlots * SLOT_HEIGHT - 2}px`,
                                                            left: '68px', // 64px (w-16) + 4px de margen
                                                            right: '8px'
                                                         }}
                                                         title={`${event.title} (${minutesToTimeAMPM(startMinutes)} - ${minutesToTimeAMPM(endMinutes)})`}
                                                      >
                                                         <div className="flex items-start h-full">
                                                            <span className="text-lg mr-3 mt-0.5 flex-shrink-0 transition-transform duration-200 hover:scale-110">
                                                               {event.event_type === 'meeting' ? '🤝' :
                                                                event.event_type === 'daily' ? '🗣️' :
                                                                event.event_type === 'review' ? '📋' :
                                                                event.event_type === 'planning' ? '📅' :
                                                                event.event_type === 'training' ? '📚' :
                                                                event.event_type === 'break' ? '☕' : '📌'}
                                                            </span>
                                                            <div className="flex-1 min-w-0 overflow-hidden">
                                                               <div className="font-semibold leading-tight text-purple-900 mb-1 truncate">
                                                                  {event.title}
                                                               </div>
                                                               <div className="text-xs text-purple-600 font-medium truncate opacity-90">
                                                                  {minutesToTimeAMPM(startMinutes)} - {minutesToTimeAMPM(endMinutes)}
                                                               </div>
                                                            </div>
                                                         </div>
                                                      </div>
                                                   );
                                                })}
                                             </div>
                                          );
                                       })()}
                                    </div>
                                 </div>

                                

                                 {Object.keys(taskSchedules).length > 0 && (
                                    <div className="mt-4 p-3 bg-white rounded border">
                                       <h5 className="text-sm font-medium text-gray-700 mb-2">Resumen del día:</h5>
                                       <div className="grid grid-cols-2 gap-2 text-xs">
                                          <div>
                                             <span className="text-gray-500">Tareas programadas:</span>
                                             <span className="ml-1 font-medium">{Object.keys(taskSchedules).length}</span>
                                          </div>
                                          <div>
                                             <span className="text-gray-500">Tiempo total:</span>
                                             <span className="ml-1 font-medium">
                                                {(() => {
                                                   // Tiempo de tareas programadas
                                                   const taskTime = Object.values(taskSchedules).reduce((total, schedule) => {
                                                      if (!schedule) return total;
                                                      return total + schedule.duration;
                                                   }, 0);
                                                   
                                                   // Tiempo de eventos
                                                   const eventTime = workEvents.reduce((total, event) => {
                                                      const startMinutes = parseInt(event.start_time.split(':')[0]) * 60 + parseInt(event.start_time.split(':')[1]);
                                                      const endMinutes = parseInt(event.end_time.split(':')[0]) * 60 + parseInt(event.end_time.split(':')[1]);
                                                      return total + (endMinutes - startMinutes);
                                                   }, 0);
                                                   
                                                   return ((taskTime + eventTime) / 60).toFixed(1);
                                                })()} h
                                             </span>
                                          </div>
                                       </div>
                                       
                                       {(() => {
                                          // Detectar conflictos entre tareas
                                          const conflicts = [];
                                          const scheduleEntries = Object.entries(taskSchedules).filter(([, schedule]) => schedule);
                                          
                                          for (let i = 0; i < scheduleEntries.length; i++) {
                                             for (let j = i + 1; j < scheduleEntries.length; j++) {
                                                const [taskId1, schedule1] = scheduleEntries[i];
                                                const [taskId2, schedule2] = scheduleEntries[j];
                                                
                                                if (!schedule1 || !schedule2) continue;
                                                
                                                const start1 = parseInt(schedule1.startTime.split(':')[0]) * 60 + parseInt(schedule1.startTime.split(':')[1]);
                                                const end1 = parseInt(schedule1.endTime.split(':')[0]) * 60 + parseInt(schedule1.endTime.split(':')[1]);
                                                const start2 = parseInt(schedule2.startTime.split(':')[0]) * 60 + parseInt(schedule2.startTime.split(':')[1]);
                                                const end2 = parseInt(schedule2.endTime.split(':')[0]) * 60 + parseInt(schedule2.endTime.split(':')[1]);
                                                
                                                if (start1 < end2 && start2 < end1) {
                                                   const task1 = taskItems.find(t => t.id === taskId1);
                                                   const task2 = taskItems.find(t => t.id === taskId2);
                                                   conflicts.push({
                                                      item1: task1?.title || 'Tarea desconocida',
                                                      item2: task2?.title || 'Tarea desconocida',
                                                      type: 'task-task'
                                                   });
                                                }
                                             }
                                          }
                                          
                                          // Detectar conflictos entre tareas y eventos
                                          scheduleEntries.forEach(([taskId, schedule]) => {
                                             if (!schedule) return;
                                             
                                             const taskStart = parseInt(schedule.startTime.split(':')[0]) * 60 + parseInt(schedule.startTime.split(':')[1]);
                                             const taskEnd = parseInt(schedule.endTime.split(':')[0]) * 60 + parseInt(schedule.endTime.split(':')[1]);
                                             
                                             workEvents.forEach(event => {
                                                const eventStart = parseInt(event.start_time.split(':')[0]) * 60 + parseInt(event.start_time.split(':')[1]);
                                                const eventEnd = parseInt(event.end_time.split(':')[0]) * 60 + parseInt(event.end_time.split(':')[1]);
                                                
                                                if (taskStart < eventEnd && eventStart < taskEnd) {
                                                   const task = taskItems.find(t => t.id === taskId);
                                                   conflicts.push({
                                                      item1: task?.title || 'Tarea desconocida',
                                                      item2: event.title,
                                                      type: 'task-event'
                                                   });
                                                }
                                             });
                                          });
                                          
                                          if (conflicts.length > 0) {
                                             return (
                                                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                                                   <div className="flex items-center text-red-700 text-xs font-medium mb-1">
                                                      ⚠️ Conflictos detectados
                                                   </div>
                                                   {conflicts.map((conflict, index) => (
                                                      <div key={index} className="text-xs text-red-600">
                                                         • {conflict.item1} vs {conflict.item2}
                                                         {conflict.type === 'task-event' && <span className="text-purple-600"> (evento)</span>}
                                                      </div>
                                                   ))}
                                                </div>
                                             );
                                          }
                                          return null;
                                       })()}
                                    </div>
                                 )}
                              </div>
                           </div>
                        </div>

                        <div className="px-6 py-3 bg-gray-50 flex justify-between border-t border-gray-200">
                           <button 
                              onClick={() => setShowTimeScheduling(false)} 
                              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                           >
                              ← Volver
                           </button>
                           
                           <div className="flex space-x-3">
                              <button onClick={handleSaveWithSchedule} disabled={saving || !areAllTasksScheduled()} className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
                                 {saving ? "Guardando..." : areAllTasksScheduled() ? "Guardar con horarios" : "Asigna horarios a todas las tareas"}
                              </button>
                           </div>
                        </div>
                     </>
                  )}
               </div>
            </div>
         )}

         {/* Modal de detalles de tarea */}
         {showTaskDetailModal && selectedTaskDetails && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
               <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                     <div>
                        <h3 className="text-lg font-medium">{selectedTaskDetails.type === "subtask" && selectedTaskDetails.subtask_title ? `${selectedTaskDetails.subtask_title} - ${selectedTaskDetails.title}` : selectedTaskDetails.title}</h3>
                        <p className="text-xs text-gray-500 font-mono mt-1">ID: {selectedTaskDetails.type === "subtask" && selectedTaskDetails.original_id ? selectedTaskDetails.original_id : selectedTaskDetails.id}</p>
                        {selectedTaskDetails.projectName && <div className="text-sm text-blue-600 mt-1">Proyecto: {selectedTaskDetails.projectName}</div>}
                     </div>
                     <button onClick={closeTaskDetailModal} className="text-gray-400 hover:text-gray-500 focus:outline-none">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                     </button>
                  </div>

                  <div className="px-6 py-4">
                     {/* Tipo de tarea */}
                     <div className="mb-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${selectedTaskDetails.type === "subtask" ? "bg-indigo-100 text-indigo-800" : "bg-blue-100 text-blue-800"}`}>{selectedTaskDetails.type === "subtask" ? "Subtarea" : "Tarea"}</span>

                        {/* Mostrar tarea principal solo para subtareas */}
                        {selectedTaskDetails.type === "subtask" && selectedTaskDetails.subtask_title && <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">Tarea principal: {selectedTaskDetails.subtask_title}</span>}

                        {selectedTaskDetails.priority && <span className={`ml-2 px-2 py-1 text-xs rounded-full ${selectedTaskDetails.priority === "high" ? "bg-red-100 text-red-800" : selectedTaskDetails.priority === "medium" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}>Prioridad: {selectedTaskDetails.priority === "high" ? "Alta" : selectedTaskDetails.priority === "medium" ? "Media" : "Baja"}</span>}

                        <span className={`ml-2 px-2 py-1 text-xs rounded-full ${selectedTaskDetails.status === "pending" ? "bg-gray-100 text-gray-800" : selectedTaskDetails.status === "in_progress" ? "bg-yellow-100 text-yellow-800" : selectedTaskDetails.status === "completed" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
                           Estado: {selectedTaskDetails.status === "pending" ? "Pendiente" : selectedTaskDetails.status === "in_progress" ? "En progreso" : selectedTaskDetails.status === "completed" ? "Completada" : selectedTaskDetails.status}
                        </span>
                     </div>

                     {/* Descripción */}
                     <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-1">Descripción:</h4>
                        <div className="text-gray-600">
                           <RichTextDisplay text={selectedTaskDetails.description || "Sin descripción"} />
                        </div>
                     </div>

                     {/* Fechas con indicadores */}
                     <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                           <h4 className="text-sm font-medium text-gray-700 mb-1">Fecha de inicio:</h4>
                           {selectedTaskDetails.start_date ? (
                              <div>
                                 <p className="text-gray-600">{format(new Date(selectedTaskDetails.start_date), "dd/MM/yyyy")}</p>
                                 {/* Indicador de tiempo */}
                                 <p className={`text-xs mt-1 ${getTimeIndicator(selectedTaskDetails.start_date, true).color}`}>{getTimeIndicator(selectedTaskDetails.start_date, true).text}</p>
                              </div>
                           ) : (
                              <p className="text-gray-500">No especificada</p>
                           )}
                        </div>
                        <div>
                           <h4 className="text-sm font-medium text-gray-700 mb-1">Fecha límite:</h4>
                           {selectedTaskDetails.deadline ? (
                              <div>
                                 <p className="text-gray-600">{format(new Date(selectedTaskDetails.deadline), "dd/MM/yyyy")}</p>
                                 {/* Indicador de tiempo */}
                                 <p className={`text-xs mt-1 ${getTimeIndicator(selectedTaskDetails.deadline, false).color}`}>{getTimeIndicator(selectedTaskDetails.deadline, false).text}</p>
                              </div>
                           ) : (
                              <p className="text-gray-500">No especificada</p>
                           )}
                        </div>
                     </div>

                     {/* Duración estimada */}
                     <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-1">Duración estimada:</h4>
                        <p className="text-gray-600">{Math.round((selectedTaskDetails.estimated_duration / 60) * 100) / 100} horas</p>
                     </div>

                     {/* Proyecto */}
                     <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-1">Proyecto:</h4>
                        {selectedTaskDetails &&
                           (() => {
                              const { bg, text } = getProjectColor(selectedTaskDetails.projectName || "Sin proyecto", selectedTaskDetails.project_id);
                              return <span className={`inline-block px-3 py-1 ${bg} ${text} font-semibold rounded-full shadow-sm`}>{selectedTaskDetails.projectName || "No especificado"}</span>;
                           })()}
                     </div>

                     {/* Secuencial */}
                     {selectedTaskDetails.type === "task" && (
                        <div className="mb-4">
                           <h4 className="text-sm font-medium text-gray-700 mb-1">Tipo de ejecución:</h4>
                           <p className="text-gray-600">{selectedTaskDetails.is_sequential ? "Secuencial" : "Paralela"}</p>
                        </div>
                     )}

                     {/* Información de entrega para tareas completadas */}
                     {selectedTaskDetails.status === "completed" && (
                        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
                           <h4 className="text-md font-medium text-green-800 mb-2">Información de Entrega:</h4>

                           {/* Metadata de notas */}
                           {(() => {
                              const metadata = typeof selectedTaskDetails.notes === "object" ? selectedTaskDetails.notes : {};
                              const entregables = metadata.entregables || (typeof selectedTaskDetails.notes === "string" ? selectedTaskDetails.notes : "-");
                              const duracionReal = metadata.duracion_real || selectedTaskDetails.estimated_duration;
                              const unidad = metadata.unidad_original || "minutes";
                              const razonDuracion = metadata.razon_duracion || "";

                              return (
                                 <div className="space-y-3">
                                    <div>
                                       <h5 className="text-sm font-medium text-green-700 mb-1">Entregables:</h5>
                                       <div className="text-sm bg-white p-2 rounded border border-green-200">
                                          <RichTextDisplay text={entregables} />
                                       </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                       <div>
                                          <h5 className="text-sm font-medium text-green-700 mb-1">Tiempo Estimado:</h5>
                                          <p className="text-sm font-bold">{Math.round((selectedTaskDetails.estimated_duration / 60) * 100) / 100} horas</p>
                                       </div>
                                       <div>
                                          <h5 className="text-sm font-medium text-green-700 mb-1">Tiempo Real:</h5>
                                          <p className="text-sm font-bold">
                                             {Math.round((duracionReal / 60) * 100) / 100} horas
                                             {duracionReal > selectedTaskDetails.estimated_duration && <span className="ml-2 text-xs text-orange-600">(Exceso: {Math.round(((duracionReal - selectedTaskDetails.estimated_duration) / 60) * 100) / 100} h)</span>}
                                          </p>
                                       </div>
                                    </div>

                                    {razonDuracion && (
                                       <div>
                                          <h5 className="text-sm font-medium text-green-700 mb-1">Razón de Variación:</h5>
                                          <div className="text-sm bg-white p-2 rounded border border-green-200">
                                             <RichTextDisplay text={razonDuracion} />
                                          </div>
                                       </div>
                                    )}

                                    {selectedTaskDetails.assignment_date && (
                                       <div>
                                          <h5 className="text-sm font-medium text-green-700 mb-1">Fecha de Entrega:</h5>
                                          <p className="text-sm font-medium">{format(new Date(selectedTaskDetails.assignment_date), "dd/MM/yyyy")}</p>
                                       </div>
                                    )}
                                 </div>
                              );
                           })()}
                        </div>
                     )}

                     {/* Historial de Avances */}
                     {taskProgressHistory.length > 0 && (
                        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
                           <h4 className="text-md font-medium text-blue-800 mb-3">📈 Historial de Avances</h4>
                           <div className="space-y-3">
                              {taskProgressHistory.map((progress, index) => {
                                 const metadata = progress.metadata || {};
                                 const progressText = metadata.progreso || "Avance reportado";
                                 const timeWorked = metadata.tiempo_sesion || 0;
                                 const unit = metadata.unidad_original || "minutes";
                                 const needs = metadata.necesidades || "";
                                 const progressDate = new Date(progress.changed_at);

                                 return (
                                    <div key={index} className="bg-white p-3 rounded border border-blue-200">
                                       <div className="flex justify-between items-start mb-2">
                                          <div className="text-sm font-medium text-blue-800">
                                             Avance #{taskProgressHistory.length - index}
                                          </div>
                                          <div className="text-xs text-gray-500">
                                             {format(progressDate, "dd/MM/yyyy HH:mm")}
                                          </div>
                                       </div>
                                       
                                       <div className="space-y-2">
                                          <div>
                                             <span className="text-xs font-medium text-gray-600">Progreso:</span>
                                             <div className="text-sm text-gray-800 mt-1">
                                                <RichTextDisplay text={progressText} />
                                             </div>
                                          </div>
                                          
                                          {timeWorked > 0 && (
                                             <div className="flex items-center gap-4 text-xs text-gray-600">
                                                <span>
                                                   ⏱️ Tiempo trabajado: <strong>{unit === 'hours' ? timeWorked : Math.round((timeWorked / 60) * 100) / 100} {unit === 'hours' ? 'horas' : 'horas'}</strong>
                                                </span>
                                             </div>
                                          )}
                                          
                                          {needs && (
                                             <div>
                                                <span className="text-xs font-medium text-gray-600">Necesidades para continuar:</span>
                                                <div className="text-sm text-gray-800 mt-1">
                                                   <RichTextDisplay text={needs} />
                                                </div>
                                             </div>
                                          )}
                                       </div>
                                    </div>
                                 );
                              })}
                           </div>
                           
                           {/* Resumen total */}
                           <div className="mt-4 p-3 bg-blue-100 rounded border border-blue-300">
                              <div className="text-sm font-medium text-blue-800">
                                 📊 Resumen: {taskProgressHistory.length} sesión{taskProgressHistory.length > 1 ? 'es' : ''} de trabajo registrada{taskProgressHistory.length > 1 ? 's' : ''}
                              </div>
                              {(() => {
                                 const totalTime = taskProgressHistory.reduce((acc, progress) => {
                                    const metadata = progress.metadata || {};
                                    const timeWorked = metadata.tiempo_sesion || 0;
                                    return acc + timeWorked;
                                 }, 0);
                                 
                                 if (totalTime > 0) {
                                    return (
                                       <div className="text-xs text-blue-700 mt-1">
                                          ⏱️ Tiempo total de avance: <strong>{Math.round((totalTime / 60) * 100) / 100} horas</strong>
                                       </div>
                                    );
                                 }
                                 return null;
                              })()}
                           </div>
                        </div>
                     )}

                     {/* Información de secuencia para subtareas */}
                     {selectedTaskDetails.type === "subtask" && <SubtaskSequenceDisplay previousSubtask={previousSubtask} selectedTaskDetails={selectedTaskDetails} nextSubtask={nextSubtask} subtaskUsers={subtaskUsers} />}
                  </div>

                  <div className="px-6 py-3 bg-gray-50 text-right border-t border-gray-200">
                     <button onClick={closeTaskDetailModal} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md">
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
                     <div>
                        <h3 className="text-lg font-medium">📊 Reportar Estado de Tarea</h3>
                        {taskForStatusUpdate && (
                           <p className="text-sm text-gray-600 mt-1">
                              {taskForStatusUpdate.title}
                              {taskForStatusUpdate.type === "subtask" && taskForStatusUpdate.original_id && <span className="text-xs text-gray-500 font-mono ml-2">ID: {taskForStatusUpdate.original_id}</span>}
                           </p>
                        )}
                     </div>
                     <button
                        onClick={() => {
                           setShowStatusModal(false);
                           setTaskForStatusUpdate(null);
                        }}
                        className="text-gray-400 hover:text-gray-500 focus:outline-none">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                     </button>
                  </div>

                  <div className="px-6 py-4">
                     {/* Panel informativo para tareas devueltas */}
                     {returnedTaskItems.some((t) => t.id === selectedTaskId) && (
                        <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                           <h4 className="text-sm font-medium text-orange-800 mb-1">Motivo de la devolución:</h4>
                           <div className="whitespace-pre-wrap text-sm">
                              {(() => {
                                 // Obtener la retroalimentación si existe
                                 const feedback = typeof selectedReturnedTask?.notes === "object" ? selectedReturnedTask?.notes?.returned_feedback : null;

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

                           {selectedReturnedTask?.notes && typeof selectedReturnedTask?.notes === "object" && selectedReturnedTask?.notes?.returned_at && (
                              <div className="mt-3 text-xs text-gray-600">
                                 Devuelta el {format(new Date(selectedReturnedTask?.notes.returned_at), "dd/MM/yyyy HH:mm")}
                                 {selectedReturnedTask?.notes.returned_by && (
                                    <span>
                                       {" "}
                                       por{" "}
                                       {
                                          // Si el ID parece un UUID, obtener el nombre del usuario
                                          selectedReturnedTask?.notes?.returned_by.includes("-")
                                             ? (() => {
                                                  // Intentar encontrar el usuario en la lista de usuarios del proyecto
                                                  const userId = selectedReturnedTask?.notes?.returned_by;
                                                  // Devolver un componente que carga el nombre del usuario
                                                  return <UserNameDisplay userId={userId} />;
                                               })()
                                             : // Si no es un UUID, mostrar directamente (podría ser un nombre)
                                               selectedReturnedTask?.notes?.returned_by
                                       }
                                    </span>
                                 )}
                              </div>
                           )}
                        </div>
                     )}

                     {/* Sección de selección de estado - solo mostrar si no es edición de tarea completada */}
                     {!completedTaskItems.some((t) => t.id === selectedTaskId) && (
                        <div className="mb-6">
                           <label className="block text-sm font-medium text-gray-700 mb-4">¿Cómo avanzaste en esta tarea?</label>
                           <div className="grid grid-cols-1 gap-3">
                              {/* Opción: Completada */}
                              <button
                                 type="button"
                                 className={`p-4 rounded-lg text-left border-2 transition-all hover:shadow-md
                                 ${selectedStatus === "completed" 
                                    ? "bg-green-50 border-green-500 shadow-lg" 
                                    : "bg-white border-gray-200 hover:border-green-300"}`}
                                 onClick={() => setSelectedStatus("completed")}>
                                 <div className="flex items-center space-x-3">
                                    <div className="text-2xl">✅</div>
                                    <div>
                                       <div className="font-medium text-gray-900">Completar Tarea</div>
                                       <div className="text-sm text-gray-500">La tarea está 100% terminada y lista para entrega</div>
                                    </div>
                                 </div>
                              </button>

                              {/* Opción: Avance */}
                              <button
                                 type="button"
                                 className={`p-4 rounded-lg text-left border-2 transition-all hover:shadow-md
                                 ${selectedStatus === "in_progress" 
                                    ? "bg-blue-50 border-blue-500 shadow-lg" 
                                    : "bg-white border-gray-200 hover:border-blue-300"}`}
                                 onClick={() => setSelectedStatus("in_progress")}>
                                 <div className="flex items-center space-x-3">
                                    <div className="text-2xl">⏳</div>
                                    <div>
                                       <div className="font-medium text-gray-900">Reportar Avance</div>
                                       <div className="text-sm text-gray-500">Hice progreso pero aún necesito más tiempo</div>
                                    </div>
                                 </div>
                              </button>

                              {/* Opción: Bloqueada */}
                              <button
                                 type="button"
                                 className={`p-4 rounded-lg text-left border-2 transition-all hover:shadow-md
                                 ${selectedStatus === "blocked" 
                                    ? "bg-red-50 border-red-500 shadow-lg" 
                                    : "bg-white border-gray-200 hover:border-red-300"}`}
                                 onClick={() => setSelectedStatus("blocked")}>
                                 <div className="flex items-center space-x-3">
                                    <div className="text-2xl">🚫</div>
                                    <div>
                                       <div className="font-medium text-gray-900">Bloquear Tarea</div>
                                       <div className="text-sm text-gray-500">No puedo continuar por dependencias o problemas</div>
                                    </div>
                                 </div>
                              </button>
                           </div>
                        </div>
                     )}

                     {/* Detalles según el estado seleccionado */}
                     {selectedStatus === "completed" ? (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                           <h4 className="font-medium text-green-800 mb-3 flex items-center">
                              <span className="mr-2">✅</span>
                              Detalles de Finalización
                           </h4>
                           <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">¿Qué entregables o resultados completaste?</label>
                              <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500" rows={3} value={statusDetails} onChange={(e) => setStatusDetails(e.target.value)} placeholder="Ejemplos: Terminé la implementación del módulo X, Corregí el error en Y, etc." />
                           </div>

                           <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Tiempo real trabajado:</label>
                              <div className="flex items-center">
                                 <input type="number" min="1" step="1" className="w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 mr-2" value={actualDuration} onChange={(e) => setActualDuration(Number(e.target.value))} />
                                 <select className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500" value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as "minutes" | "hours")}>
                                    <option value="minutes">Minutos</option>
                                    <option value="hours">Horas</option>
                                 </select>
                              </div>
                           </div>

                           <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Comentarios sobre el tiempo (opcional)</label>
                              <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500" rows={2} value={durationReason} onChange={(e) => setDurationReason(e.target.value)} placeholder="Ejemplos: Fue más complejo de lo esperado, Hubo cambios en los requerimientos, etc." />
                           </div>
                        </div>
                     ) : selectedStatus === "in_progress" ? (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                           <h4 className="font-medium text-blue-800 mb-3 flex items-center">
                              <span className="mr-2">⏳</span>
                              Detalles del Avance
                           </h4>
                        <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">¿Qué progreso hiciste en esta tarea?</label>
                              <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" rows={3} value={statusDetails} onChange={(e) => setStatusDetails(e.target.value)} placeholder="Ejemplos: Implementé 60% del módulo, Investigué opciones para Y, Configuré el ambiente de Z, etc." />
                        </div>

                           <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Tiempo trabajado en esta sesión:</label>
                              <div className="flex items-center">
                                 <input type="number" min="1" step="1" className="w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 mr-2" value={actualDuration} onChange={(e) => setActualDuration(Number(e.target.value))} />
                                 <select className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as "minutes" | "hours")}>
                                    <option value="minutes">Minutos</option>
                                    <option value="hours">Horas</option>
                                 </select>
                              </div>
                           </div>

                           <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">¿Qué necesitas para continuar? (opcional)</label>
                              <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" rows={2} value={durationReason} onChange={(e) => setDurationReason(e.target.value)} placeholder="Ejemplos: Revisar documentación de X, Feedback del equipo, Más tiempo para investigar Y, etc." />
                           </div>
                        </div>
                     ) : selectedStatus === "blocked" ? (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                           <h4 className="font-medium text-red-800 mb-3 flex items-center">
                              <span className="mr-2">🚫</span>
                              Detalles del Bloqueo
                           </h4>
                           <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">¿Por qué no puedes continuar con esta tarea?</label>
                              <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500" rows={3} value={statusDetails} onChange={(e) => setStatusDetails(e.target.value)} placeholder="Ejemplos: Estoy esperando respuesta de X, Falta información sobre Y, Error en el sistema Z, etc." />
                           </div>
                        </div>
                     ) : null}

                     {statusError && <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-md">{statusError}</div>}
                  </div>

                  <div className="px-6 py-3 bg-gray-50 flex justify-end space-x-3 border-t border-gray-200">
                     <button
                        onClick={() => {
                           setShowStatusModal(false);
                           setTaskForStatusUpdate(null);
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-yellow-500">
                        Cancelar
                     </button>
                     <button
                        onClick={handleSubmitStatus}
                        className={`px-6 py-2 text-sm font-medium text-white rounded-md shadow-sm hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 
                       ${selectedStatus === "completed" 
                          ? "bg-green-600 focus:ring-green-500" 
                          : selectedStatus === "in_progress" 
                             ? "bg-blue-600 focus:ring-blue-500"
                             : "bg-red-600 focus:ring-red-500"}`}>
                        {selectedStatus === "completed" 
                           ? "✅ Marcar como Completada" 
                           : selectedStatus === "in_progress" 
                              ? "⏳ Registrar Avance"
                              : "🚫 Marcar como Bloqueada"}
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
                     <h3 className="text-lg font-medium text-orange-700">Retroalimentación de Tarea Devuelta</h3>
                     <button onClick={() => setShowReturnedFeedbackModal(false)} className="text-gray-400 hover:text-gray-500 focus:outline-none">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                     </button>
                  </div>

                  <div className="px-6 py-4">
                     <div className="mb-4">
                        <h4 className="text-md font-medium text-gray-800 mb-1">
                           {selectedReturnedTask?.title}
                           {selectedReturnedTask?.type === "subtask" && selectedReturnedTask?.subtask_title && <span className="ml-2 text-sm text-gray-500">(Subtarea de {selectedReturnedTask?.subtask_title})</span>}
                        </h4>
                        {selectedReturnedTask?.type === "subtask" && selectedReturnedTask?.original_id && <p className="text-xs text-gray-500 font-mono mb-2">ID: {selectedReturnedTask.original_id}</p>}
                        <div className="text-sm text-gray-600">
                           <RichTextDisplay text={selectedReturnedTask?.description || ""} />
                        </div>
                     </div>

                     <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                        <h4 className="text-sm font-medium text-orange-800 mb-1">Motivo de la devolución:</h4>
                        <div className="whitespace-pre-wrap text-sm text-gray-700 max-h-48 overflow-y-auto">
                           {(() => {
                              try {
                                 // Verificar si hay retroalimentación disponible
                                 const notes = selectedReturnedTask?.notes;
                                 let feedback = "";

                                 if (notes && typeof notes === "object" && notes.returned_feedback) {
                                    // Si la retroalimentación es un objeto, convertirlo a string legible
                                    if (typeof notes.returned_feedback === "object") {
                                       try {
                                          feedback = JSON.stringify(notes.returned_feedback, null, 2);
                                       } catch (e) {
                                          feedback = "Error al mostrar retroalimentación detallada.";
                                       }
                                    } else {
                                       // Si es un string, usarlo directamente
                                       feedback = String(notes.returned_feedback);
                                    }

                                    return <RichTextDisplay text={feedback} />;
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

                        {selectedReturnedTask?.notes && typeof selectedReturnedTask?.notes === "object" && selectedReturnedTask?.notes?.returned_at && (
                           <div className="mt-3 text-xs text-gray-600">
                              Devuelta el {format(new Date(selectedReturnedTask?.notes.returned_at), "dd/MM/yyyy HH:mm")}
                              {selectedReturnedTask?.notes.returned_by && (
                                 <span>
                                    {" "}
                                    por{" "}
                                    {
                                       // Si el ID parece un UUID, obtener el nombre del usuario
                                       selectedReturnedTask?.notes?.returned_by.includes("-")
                                          ? (() => {
                                               // Intentar encontrar el usuario en la lista de usuarios del proyecto
                                               const userId = selectedReturnedTask?.notes?.returned_by;
                                               // Devolver un componente que carga el nombre del usuario
                                               return <UserNameDisplay userId={userId} />;
                                            })()
                                          : // Si no es un UUID, mostrar directamente (podría ser un nombre)
                                            selectedReturnedTask?.notes?.returned_by
                                    }
                                 </span>
                              )}
                           </div>
                        )}
                     </div>

                     <div className="mt-5 border-t border-gray-200 pt-4">
                        <p className="text-sm text-gray-700 mb-3">Para marcar esta tarea como completada, actualiza su estado desde la opción "Actualizar Estado".</p>
                        <button
                           onClick={() => {
                              setShowReturnedFeedbackModal(false);
                              handleOpenStatusModal(selectedReturnedTask?.id);
                           }}
                           className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 transition-colors">
                           Actualizar Estado Ahora
                        </button>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {/* Modal de confirmación para desasignar tarea */}
         {showUnassignConfirmModal && taskToUnassign && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
               <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                     <h3 className="text-lg font-medium">Confirmar Desasignación</h3>
                     <button onClick={() => setShowUnassignConfirmModal(false)} className="text-gray-400 hover:text-gray-500 focus:outline-none">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                     </button>
                  </div>
                  <div className="px-6 py-4">
                     <p className="mb-2 text-gray-700">¿Estás seguro de que quieres desasignar la siguiente tarea de tu lista de hoy?</p>
                     <div className="p-3 bg-gray-50 rounded-md">
                        <p className="font-semibold text-gray-800">{taskToUnassign.title}</p>
                        {taskToUnassign.type === "subtask" && <p className="text-xs text-gray-500">Subtarea de: {taskToUnassign.subtask_title}</p>}
                     </div>
                     <p className="text-sm text-gray-600 mt-4">
                        La tarea volverá a la lista de "Asignación" y su estado cambiará a <strong>pendiente</strong>.
                     </p>
                  </div>
                  <div className="px-6 py-3 bg-gray-50 flex justify-end space-x-3 border-t border-gray-200">
                     <button onClick={() => setShowUnassignConfirmModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50">
                        Cancelar
                     </button>
                     <button onClick={handleConfirmUnassign} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 disabled:bg-gray-400">
                        {saving ? "DESASIGNANDO..." : "Sí, desasignar"}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Modal de gestión de eventos de trabajo */}
         {showEventsModal && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
               <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                     <h3 className="text-lg font-medium">
                        📅 Gestionar eventos del día - {format(new Date(), "dd/MM/yyyy")}
                     </h3>
                     <button 
                        onClick={() => {
                           setShowEventsModal(false);
                           resetEventForm();
                        }} 
                        className="text-gray-400 hover:text-gray-500 focus:outline-none"
                     >
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                     </button>
                  </div>

                  <div className="px-6 py-4">
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Formulario para crear/editar eventos */}
                        <div className="space-y-4">
                           <h4 className="text-lg font-medium text-gray-900">
                              {editingEvent ? "Editar evento" : "Nuevo evento"}
                           </h4>
                           
                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                 Título del evento
                              </label>
                              <input
                                 type="text"
                                 value={eventForm.title}
                                 onChange={(e) => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                                 placeholder="ej: Daily, Reunión con cliente..."
                                 className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                              />
                           </div>

                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                 Tipo de evento
                              </label>
                              <select 
                                 value={eventForm.event_type}
                                 onChange={(e) => setEventForm(prev => ({ ...prev, event_type: e.target.value as WorkEvent['event_type'] }))}
                                 className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                              >
                                 <option value="meeting">🤝 Reunión</option>
                                 <option value="daily">🗣️ Daily</option>
                                 <option value="training">📚 Capacitación</option>
                                 <option value="break">☕ Descanso</option>
                                 <option value="other">📌 Otro</option>
                              </select>
                           </div>

                           <div className="grid grid-cols-2 gap-3">
                              <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Hora de inicio
                                 </label>
                                 <select 
                                    value={eventForm.start_time}
                                    onChange={(e) => setEventForm(prev => ({ ...prev, start_time: parseInt(e.target.value) }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                 >
                                    {generateTimeSlots().map((slot) => (
                                       <option key={slot.time} value={slot.time}>
                                          {slot.display}
                                       </option>
                                    ))}
                                 </select>
                              </div>
                              <div>
                                 <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Hora de fin
                                 </label>
                                 <select 
                                    value={eventForm.end_time}
                                    onChange={(e) => setEventForm(prev => ({ ...prev, end_time: parseInt(e.target.value) }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                                 >
                                    {generateTimeSlots().map((slot) => (
                                       <option key={slot.time} value={slot.time}>
                                          {slot.display}
                                       </option>
                                    ))}
                                 </select>
                              </div>
                           </div>

                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                 Descripción (opcional)
                              </label>
                              <textarea
                                 rows={3}
                                 value={eventForm.description}
                                 onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                                 placeholder="Detalles adicionales del evento..."
                                 className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                              />
                           </div>

                           <div className="flex gap-3">
                              <button
                                 onClick={handleSaveEvent}
                                 disabled={savingEvent}
                                 className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md shadow-sm hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                              >
                                 {savingEvent ? "Guardando..." : editingEvent ? "Actualizar evento" : "Crear evento"}
                              </button>
                              {editingEvent && (
                                 <button
                                    onClick={resetEventForm}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                                 >
                                    Cancelar
                                 </button>
                              )}
                           </div>
                        </div>

                        {/* Lista de eventos del día */}
                        <div className="space-y-4">
                           <h4 className="text-lg font-medium text-gray-900">Eventos programados</h4>
                           
                           {loadingEvents ? (
                              <div className="text-center py-8 text-gray-500">
                                 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
                                 <p className="text-sm">Cargando eventos...</p>
                              </div>
                           ) : workEvents.length === 0 ? (
                              <div className="text-center py-8 text-gray-500">
                                 <div className="text-4xl mb-2">📅</div>
                                 <p className="text-sm">No tienes eventos programados para hoy</p>
                                 <p className="text-xs text-gray-400 mt-1">Crea tu primer evento usando el formulario</p>
                              </div>
                           ) : (
                              <div className="space-y-2">
                                 {workEvents.map((event) => (
                                    <div key={event.id} className="p-3 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100">
                                       <div className="flex items-start justify-between">
                                          <div className="flex-1">
                                             <div className="flex items-center mb-1">
                                                <span className="text-lg mr-2">
                                                   {event.event_type === 'meeting' ? '🤝' :
                                                    event.event_type === 'daily' ? '🗣️' :
                                                    event.event_type === 'review' ? '📋' :
                                                    event.event_type === 'planning' ? '📅' :
                                                    event.event_type === 'training' ? '📚' :
                                                    event.event_type === 'break' ? '☕' : '📌'}
                                                </span>
                                                <h5 className="font-medium text-gray-900">{event.title}</h5>
                                             </div>
                                             <p className="text-sm text-gray-600 mb-1">
                                                {(() => {
                                                   const startMinutes = parseInt(event.start_time.split(':')[0]) * 60 + parseInt(event.start_time.split(':')[1]);
                                                   const endMinutes = parseInt(event.end_time.split(':')[0]) * 60 + parseInt(event.end_time.split(':')[1]);
                                                   return `${minutesToTimeAMPM(startMinutes)} - ${minutesToTimeAMPM(endMinutes)}`;
                                                })()}
                                             </p>
                                             {event.description && (
                                                <p className="text-xs text-gray-500">{event.description}</p>
                                             )}
                                          </div>
                                          <div className="ml-3 flex gap-1">
                                             <button
                                                onClick={() => handleEditEvent(event)}
                                                className="p-1 text-gray-400 hover:text-purple-600"
                                                title="Editar evento"
                                             >
                                                ✏️
                                             </button>
                                             <button
                                                onClick={() => handleDeleteEvent(event.id)}
                                                className="p-1 text-gray-400 hover:text-red-600"
                                                title="Eliminar evento"
                                             >
                                                🗑️
                                             </button>
                                          </div>
                                       </div>
                                    </div>
                                 ))}
                              </div>
                           )}
                        </div>
                     </div>
                  </div>

                  <div className="px-6 py-3 bg-gray-50 flex justify-end border-t border-gray-200">
                     <button 
                        onClick={() => {
                           setShowEventsModal(false);
                           resetEventForm();
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
                     >
                        Cerrar
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Modal de continuación después de reportar avance - OBLIGATORIO */}
         {showContinueModal && taskForContinue && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
               <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                  <div className="px-6 py-4 border-b border-gray-200">
                     <h3 className="text-lg font-medium">⏳ ¡Avance registrado con éxito!</h3>
                     <p className="text-sm text-gray-600 mt-1">
                        {taskForContinue.title}
                     </p>
                  </div>

                  <div className="px-6 py-4">
                     <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800 font-medium">
                           ⚠️ Debes programar cuándo continuarás esta tarea
                        </p>
                     </div>
                     
                     <p className="text-gray-700 mb-4">Selecciona cuándo vas a continuar:</p>
                     
                     <div className="space-y-3">
                        <button
                           onClick={handleScheduleForTomorrow}
                           className="w-full p-4 text-left border border-blue-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors"
                        >
                           <div className="flex items-center space-x-3">
                              <div className="text-2xl">📅</div>
                              <div>
                                 <div className="font-medium text-gray-900">Mañana</div>
                                 <div className="text-sm text-gray-500">Selecciona el horario específico para mañana</div>
                              </div>
                           </div>
                        </button>

                        <button
                           onClick={handleScheduleLaterToday}
                           className="w-full p-4 text-left border border-green-200 rounded-lg hover:bg-green-50 hover:border-green-300 transition-colors"
                        >
                           <div className="flex items-center space-x-3">
                              <div className="text-2xl">⏰</div>
                              <div>
                                 <div className="font-medium text-gray-900">Hoy más tarde</div>
                                 <div className="text-sm text-gray-500">Selecciona el horario específico para hoy</div>
                              </div>
                           </div>
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
   const [userName, setUserName] = useState<string>("");

   useEffect(() => {
      async function fetchUserName() {
         try {
            const { data, error } = await supabase.from("users").select("name, email").eq("id", userId).single();

            if (error) {
               console.error("Error al buscar nombre de usuario:", error);
               setUserName("Usuario");
            } else if (data) {
               // Usar el nombre si existe, sino el email, y si no hay ninguno, mostrar 'Usuario'
               setUserName(data.name || data.email || "Usuario");
            } else {
               setUserName("Usuario");
            }
         } catch (error) {
            console.error("Error al cargar nombre de usuario:", error);
            setUserName("Usuario");
         }
      }

      if (userId) {
         fetchUserName();
      } else {
         setUserName("Usuario");
      }
   }, [userId]);

   return <span className="font-medium">{userName || userId}</span>;
}
