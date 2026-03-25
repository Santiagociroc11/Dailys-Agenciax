import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getAllowedProjectIds } from "../lib/userAccess";
import { useAuth } from "../contexts/AuthContext";
import { format, isWithinInterval, parseISO, differenceInDays, isBefore, isAfter, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import TaskStatusDisplay from "../components/TaskStatusDisplay";
import PhaseBadge from "../components/PhaseBadge";
import RichTextDisplay from "../components/RichTextDisplay";
import RichTextSummary from "../components/RichTextSummary";
import { ActivityChecklist } from "../components/ActivityChecklist";
import { TaskComments } from "../components/TaskComments";
import { apiUrl } from "../lib/apiBase";
import { getWeekDays, getWeekRange } from "../lib/weekUtils";

interface ChecklistItem {
   id: string;
   title: string;
   checked: boolean;
   order?: number;
   parentId?: string | null;
}

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
   phase_id?: string | null;
   assigned_users?: string[];
   type?: "task" | "subtask";
   original_id?: string;
   subtask_title?: string;
   assignment_date?: string;
   notes?: string | TaskNotes;
   checklist?: ChecklistItem[];
   comments?: { id: string; user_id: string; content: string; created_at: string }[];
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
   const { user, isAdmin } = useAuth();
   const { projectId } = useParams();
   const navigate = useNavigate();

   // Proyectos permitidos para usuarios no-admin: assigned_projects + proyectos donde tienen asignaciones pendientes (task_work_assignments)
   const [effectiveProjectIds, setEffectiveProjectIds] = useState<string[] | null | undefined>(undefined);

   const allowedProjectIds = !isAdmin ? effectiveProjectIds : null;

   // Efecto: para no-admin, usar lógica centralizada de userAccess (assigned_projects + assignments + subtareas)
   useEffect(() => {
      if (!user || isAdmin) {
         setEffectiveProjectIds(null);
         return;
      }
      getAllowedProjectIds(user.id, user.assigned_projects ?? []).then(setEffectiveProjectIds);
   }, [user?.id, user?.assigned_projects, isAdmin]);

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
   const [activeGestionSubTab, setActiveGestionSubTab] = useState("en_proceso");
   const [sortBy, setSortBy] = useState<"deadline" | "priority" | "duration">("deadline");
   const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
   const [selectedPhaseFilter, setSelectedPhaseFilter] = useState<string | null>(null);
   const [selectedProjectFilter, setSelectedProjectFilter] = useState<string | null>(null);
   const [phasesForProject, setPhasesForProject] = useState<{ id: string; name: string; order: number }[]>([]);

   // Proyectos únicos para el filtro (extraídos de los datos cargados)
   const availableProjects = useMemo(() => {
      const seen = new Set<string>();
      const result: { id: string; name: string }[] = [];
      const addFrom = (items: { project_id?: string; projectName?: string }[]) => {
         items.forEach((t) => {
            const pid = t.project_id || "";
            if (pid && !seen.has(pid)) {
               seen.add(pid);
               result.push({ id: pid, name: t.projectName || "Sin proyecto" });
            }
         });
      };
      addFrom(taskItems);
      addFrom(assignedTaskItems);
      addFrom(delayedTaskItems);
      addFrom(completedTaskItems);
      addFrom(inReviewTaskItems);
      addFrom(approvedTaskItems);
      addFrom(returnedTaskItems);
      addFrom(blockedTaskItems);
      return result.sort((a, b) => a.name.localeCompare(b.name));
   }, [taskItems, assignedTaskItems, delayedTaskItems, completedTaskItems, inReviewTaskItems, approvedTaskItems, returnedTaskItems, blockedTaskItems]);

   // Listas filtradas por proyecto (para Gestión)
   const filterByProject = <T extends { project_id?: string }>(items: T[]) =>
      selectedProjectFilter ? items.filter((t) => t.project_id === selectedProjectFilter) : items;
   const filteredAssignedTaskItems = filterByProject(assignedTaskItems);
   const filteredDelayedTaskItems = filterByProject(delayedTaskItems);
   const filteredCompletedTaskItems = filterByProject(completedTaskItems);
   const filteredInReviewTaskItems = filterByProject(inReviewTaskItems);
   const filteredApprovedTaskItems = filterByProject(approvedTaskItems);
   const filteredReturnedTaskItems = filterByProject(returnedTaskItems);
   const filteredBlockedTaskItems = filterByProject(blockedTaskItems);

   const APPROVED_TASKS_PER_PAGE = 10;
   const [approvedListPage, setApprovedListPage] = useState(1);

   const sortedApprovedTaskItems = useMemo(() => {
      return [...filteredApprovedTaskItems].sort((a, b) => {
         const ta = a.deadline ? new Date(a.deadline).getTime() : 0;
         const tb = b.deadline ? new Date(b.deadline).getTime() : 0;
         return tb - ta;
      });
   }, [filteredApprovedTaskItems]);

   const approvedTasksTotalPages = Math.max(1, Math.ceil(sortedApprovedTaskItems.length / APPROVED_TASKS_PER_PAGE));

   const pagedApprovedTaskItems = useMemo(() => {
      const start = (approvedListPage - 1) * APPROVED_TASKS_PER_PAGE;
      return sortedApprovedTaskItems.slice(start, start + APPROVED_TASKS_PER_PAGE);
   }, [sortedApprovedTaskItems, approvedListPage]);

   useEffect(() => {
      setApprovedListPage(1);
   }, [selectedProjectFilter]);

   useEffect(() => {
      if (approvedListPage > approvedTasksTotalPages) {
         setApprovedListPage(approvedTasksTotalPages);
      }
   }, [approvedListPage, approvedTasksTotalPages]);

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

   // Estados para Gantt semanal
   const [ganttData, setGanttData] = useState<any[]>([]);
   const [executedTimeData, setExecutedTimeData] = useState<Record<string, Record<string, number>>>({});
   const [offScheduleWorkData, setOffScheduleWorkData] = useState<Record<string, Record<string, number>>>({});
   const [selectedWeekDate, setSelectedWeekDate] = useState<Date>(new Date());

   // Estados para modales
   const [showConfirmModal, setShowConfirmModal] = useState(false);
   const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
   const [showStatusModal, setShowStatusModal] = useState(false);
   const [showReturnedFeedbackModal, setShowReturnedFeedbackModal] = useState(false);

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
   const [allWorkEvents, setAllWorkEvents] = useState<WorkEvent[]>([]);
   const [editingEvent, setEditingEvent] = useState<WorkEvent | null>(null);
   const [loadingEvents, setLoadingEvents] = useState(false);
   const [loadingAllEvents, setLoadingAllEvents] = useState(false);
   
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
   const [disclaimerCollapsed, setDisclaimerCollapsed] = useState(false);

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

   // Estados para menú dropdown de acciones
   const [showActionsDropdown, setShowActionsDropdown] = useState<Record<string, boolean>>({});
   const [actionType, setActionType] = useState<"complete" | "progress" | "block" | null>(null);

   // Estados para avances de tareas
   const [taskProgress, setTaskProgress] = useState<Record<string, any[]>>({});
   const [showProgressModal, setShowProgressModal] = useState(false);
   const [selectedTaskProgress, setSelectedTaskProgress] = useState<any[]>([]);

   // Estados para programación de próximo trabajo
   const [nextWorkDate, setNextWorkDate] = useState("");
   const [nextWorkStartTime, setNextWorkStartTime] = useState("");
   const [nextWorkEndTime, setNextWorkEndTime] = useState("");
   const [nextWorkDuration, setNextWorkDuration] = useState<number>(0);

   // Tarea de supervisión: exige reporte detallado
   const [isSupervisionTask, setIsSupervisionTask] = useState(false);

   // Alertas/solicitudes para el admin (solo tareas de supervisión)
   const [alertasSolicitudes, setAlertasSolicitudes] = useState<Array<{ tipo: string; descripcion: string }>>([]);
   const [alertaTipo, setAlertaTipo] = useState<string>("solicitud_nueva_tarea");
   const [alertaDescripcion, setAlertaDescripcion] = useState("");

   // Estado para guardar
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);

   useEffect(() => {
      if (projectId && user) {
         // Siempre usar "all" - el filtro por proyecto se hace en el listado
         if (projectId !== "all") {
            navigate("/user/projects/all", { replace: true });
            return;
         }

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
   }, [projectId, user, isAdmin, navigate]);

   useEffect(() => {
      if (activeTab === "gestion" && activeGestionSubTab === "en_proceso") {
         // Solo cargar si no hay datos o si el loading no está activo
         if (!loadingAssigned && assignedTaskItems.length === 0 && delayedTaskItems.length === 0 && returnedTaskItems.length === 0) {
            setLoadingAssigned(true);
            fetchAssignedTasks();
         }
      }
   }, [activeTab, activeGestionSubTab]);

   useEffect(() => {
      if (projectId && dailyTasksIds !== undefined) {
         // Para no-admin, esperar a que effectiveProjectIds esté listo (evita mostrar vacío cuando hay asignaciones)
         if (!isAdmin && effectiveProjectIds === undefined && user) {
            return; // El efecto de effectiveProjectIds aún no ha terminado
         }
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
   }, [projectId, dailyTasksIds, isAdmin, effectiveProjectIds, user]);

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
      if (activeTab === "gestion" && activeGestionSubTab === "en_proceso") {
         // Verificar si hay tareas que aparecen en ambas listas (en proceso y completadas)
         const pendingTasks = [...assignedTaskItems, ...delayedTaskItems, ...returnedTaskItems];
         const duplicates = pendingTasks.filter((pendingTask) => completedTaskItems.some((completedTask) => completedTask.id === pendingTask.id));

         if (duplicates.length > 0) {
            console.warn("Tareas duplicadas encontradas en proceso y completadas:", duplicates);
         }
      }
   }, [activeTab, activeGestionSubTab, assignedTaskItems, delayedTaskItems, returnedTaskItems, completedTaskItems]);

   useEffect(() => {
      // Log de conteo de tareas en cada cambio de las listas
      console.log(
         `CONTEO TAREAS -> Asignadas: ${assignedTaskItems.length}, Retrasadas: ${delayedTaskItems.length}, Completadas: ${completedTaskItems.length}, Devueltas: ${returnedTaskItems.length}, Bloqueadas: ${blockedTaskItems.length}`
      );
   }, [assignedTaskItems, delayedTaskItems, completedTaskItems, returnedTaskItems, blockedTaskItems]);

   async function fetchProject() {
      try {
         const { data, error } = await supabase.from("projects").select("id, name").eq("id", projectId).eq("is_archived", false).single();

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
         const projectFilter = !isAll ? [projectId!] : allowedProjectIds;

         // Usuario no-admin sin proyectos asignados: no hay datos que mostrar
         if (projectFilter && projectFilter.length === 0) {
            setTaskItems([]);
            setLoading(false);
            setIsFiltering(false);
            setIsDataInitialized(true);
            return;
         }

         // 1️⃣ Todas las tareas (sin importar si están asignadas al usuario) - excluyendo proyectos archivados
         let allTasksQ = supabase
            .from("tasks")
            .select(`
               *,
               projects!inner(id, is_archived)
            `)
            .not("status", "in", "(approved, assigned)")
            .eq("projects.is_archived", false)
            .order("deadline", { ascending: true });
         if (projectFilter && projectFilter.length > 0) {
            allTasksQ = allTasksQ.in("project_id", projectFilter);
         }
         const { data: allTasksData, error: allTasksError } = await allTasksQ;
         if (allTasksError) throw allTasksError;

         // 2️⃣ Tareas que ya están asignadas al usuario (pendientes/in_progress) - excluyendo proyectos archivados
         let taskDataQ = supabase
            .from("tasks")
            .select(`
               *,
               projects!inner(id, is_archived)
            `)
            .contains("assigned_users", [user.id])
            .not("status", "in", "(approved, completed, in_review, returned, assigned, in_progress, blocked)")
            .eq("projects.is_archived", false)
            .order("deadline", { ascending: true });
         if (projectFilter && projectFilter.length > 0) {
            taskDataQ = taskDataQ.in("project_id", projectFilter);
         }
         const { data: taskData, error: taskError } = await taskDataQ;
         if (taskError) throw taskError;

         // 3️⃣ Todas las subtareas del/los proyecto(s) - INCLUYE completed/approved para lógica secuencial - excluyendo proyectos archivados
         let allSubtasksQ = supabase
            .from("subtasks")
            .select(
               `
          *,
          tasks (
            id, title, is_sequential, project_id, phase_id,
            projects!inner(id, is_archived)
          )
        `
            )
            .eq("tasks.projects.is_archived", false)
            .order("sequence_order", { ascending: true });
         if (projectFilter && projectFilter.length > 0) {
            allSubtasksQ = allSubtasksQ.in("tasks.project_id", projectFilter);
         }
         const { data: allSubtasksData, error: allSubtasksError } = await allSubtasksQ;
         if (allSubtasksError) throw allSubtasksError;

         // 4️⃣ Construir Set de project_ids para luego pedir sus nombres (tasks/projects vienen del $lookup)
         const projectIds = new Set<string>();
         allTasksData?.forEach((t) => {
            if (t.project_id) projectIds.add(t.project_id);
         });
         allSubtasksData?.forEach((s) => {
            const pid = s.tasks?.project_id ?? (s.tasks as { project_id?: string })?.project_id;
            if (pid) projectIds.add(pid);
         });

         // 5️⃣ Cargar nombre de cada proyecto y fases
         const { data: projects, error: projectsError } = await supabase.from("projects").select("id, name").in("id", Array.from(projectIds)).eq("is_archived", false);
         if (projectsError) console.error("Error cargando proyectos:", projectsError);

         const projectMap: Record<string, string> = {};
         projects?.forEach((p) => (projectMap[p.id] = p.name));

         const phaseIds = new Set<string>();
         allTasksData?.forEach((t) => { if (t.phase_id) phaseIds.add(t.phase_id); });
         allSubtasksData?.forEach((s) => {
            const phaseId = (s.tasks as { phase_id?: string })?.phase_id;
            if (phaseId) phaseIds.add(phaseId);
         });
         const { data: phasesData } = phaseIds.size > 0
            ? await supabase.from("phases").select("id, name, order, project_id").in("id", Array.from(phaseIds)).order("order", { ascending: true })
            : { data: [] };
         const phaseMap: Record<string, { name: string; order: number }> = {};
         const phasesList = (phasesData || []).map((p: { id: string; name: string; order: number }) => {
            phaseMap[p.id] = { name: p.name, order: p.order };
            return { id: p.id, name: p.name, order: p.order };
         }).sort((a, b) => a.order - b.order);
         setPhasesForProject(phasesList);

         // 6️⃣ Subtareas asignadas al usuario (tasks/projects vienen del $lookup) - excluyendo proyectos archivados
         let subtaskDataQ = supabase
            .from("subtasks")
            .select(
               `
          *,
          tasks!inner (
            id, title, is_sequential, project_id, phase_id,
            projects!inner(id, is_archived)
          )
        `
            )
            .eq("assigned_to", user.id)
            .not("status", "in", "(approved, completed, in_review, returned, assigned, in_progress, blocked)")
            .eq("tasks.projects.is_archived", false)
            .order("sequence_order", { ascending: true });
         if (projectFilter && projectFilter.length > 0) {
            subtaskDataQ = subtaskDataQ.in("tasks.project_id", projectFilter);
         }
         const { data: subtaskData, error: subtaskError } = await subtaskDataQ;
         if (subtaskError) throw subtaskError;

         // 7️⃣ Filtrar tareas sin subtareas propias
         const tasksWithSubs = new Set<string>();
         allSubtasksData?.forEach((s) => tasksWithSubs.add(s.task_id));
         const tasksWithoutSubs = taskData?.filter((t) => !tasksWithSubs.has(t.id)) || [];

         // 8️⃣ Agrupar las subtareas del usuario por tarea padre (tasks viene del $lookup)
         const grouped: Record<string, Subtask[]> = {};
         subtaskData?.forEach((s) => {
            if (!grouped[s.task_id]) grouped[s.task_id] = [];
            const taskInfo = s.tasks as { id?: string; title?: string; project_id?: string; is_sequential?: boolean } | undefined;
            grouped[s.task_id].push({ ...s, task_title: taskInfo?.title || "—", tasks: s.tasks });
         });

         // 9️⃣ Seleccionar sólo las subtareas relevantes (siguiente si es secuencial, todas si no)
         const relevantSubs: Subtask[] = [];
         Object.entries(grouped).forEach(([taskId, subs]) => {
            const taskInfo = subs[0].tasks as { is_sequential?: boolean } | undefined;
            const isSequential = taskInfo?.is_sequential ?? subs[0].tasks?.is_sequential;
            if (isSequential) {
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
         const sequentialSubs = relevantSubs.filter((s) => {
            const t = s.tasks as { is_sequential?: boolean } | undefined;
            return t?.is_sequential ?? s.tasks?.is_sequential;
         });
         if (sequentialSubs.length > 0) {
            console.log(
               `[SECUENCIAL] Subtareas secuenciales relevantes para el usuario:`,
               sequentialSubs.map((s) => ({ id: s.id, title: s.title, status: s.status }))
            );
         }

         // 🔟 Mapear subtareas a Task[]
         const subtasksAsTasks: Task[] = relevantSubs.map((s) => {
            const taskInfo = s.tasks as { project_id?: string; title?: string; phase_id?: string } | undefined;
            const projectId = taskInfo?.project_id ?? s.tasks?.project_id ?? "";
            const phaseId = taskInfo?.phase_id ?? (s.tasks as { phase_id?: string })?.phase_id ?? null;
            return {
               id: `subtask-${s.id}`,
               original_id: s.id,
               title: s.title,
               subtask_title: taskInfo?.title ?? s.tasks?.title ?? "—",
               description: s.description,
               priority: "medium",
               estimated_duration: s.estimated_duration,
               start_date: s.start_date || "",
               deadline: s.deadline || "",
               status: s.status,
               is_sequential: false,
               project_id: projectId,
               projectName: projectMap[projectId] || "Sin proyecto",
               phase_id: phaseId,
               type: "subtask",
               checklist: (s.checklist || []).map((c: { id: string; title: string; checked?: boolean; order?: number; parentId?: string | null }) => ({ id: c.id, title: c.title, checked: c.checked ?? false, order: c.order ?? 0, parentId: c.parentId ?? undefined })),
               comments: (s.comments || []).map((c: { id: string; user_id: string; content: string; created_at: string }) => ({ ...c, created_at: c.created_at })),
            };
         });

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
            phase_id: (t as { phase_id?: string }).phase_id ?? null,
            type: "task",
            checklist: (t.checklist || []).map((c: { id: string; title: string; checked?: boolean; order?: number; parentId?: string | null }) => ({ id: c.id, title: c.title, checked: c.checked ?? false, order: c.order ?? 0, parentId: c.parentId ?? undefined })),
            comments: (t.comments || []).map((c: { id: string; user_id: string; content: string; created_at: string }) => ({ ...c, created_at: c.created_at })),
         }));

         // 1️⃣2️⃣ Filtrar las ya asignadas hoy o solo mostrar las que están en estado 'pending'
         let available = [...tasksAsTasks, ...subtasksAsTasks].filter((task) => {
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

      // Fetch users for comments display (task assignees + comment authors)
      const userIds = new Set<string>();
      (task.assigned_users || []).forEach((id) => userIds.add(id));
      (task.comments || []).forEach((c) => userIds.add(c.user_id));
      if (task.type === "subtask" && task.assigned_users?.[0]) userIds.add(task.assigned_users[0]);
      if (userIds.size > 0) {
         try {
            const { data: u } = await supabase.from("users").select("id, name, email").in("id", Array.from(userIds));
            const userMap: Record<string, string> = {};
            (u || []).forEach((x) => { userMap[x.id] = x.name || x.email || "Usuario"; });
            setSubtaskUsers((prev) => ({ ...prev, ...userMap }));
         } catch (_) {}
      }

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
                     setSubtaskUsers((prev) => ({ ...prev, ...userMap }));

                     // Optionally, try to fetch at least basic user info if the table exists
                     try {
                        const { data: basicUsers } = await supabase.from("users").select("id, name").in("id", assignedUserIds);

                        if (basicUsers && basicUsers.length > 0) {
                           basicUsers.forEach((user) => {
                              if (user.id && user.name) {
                                 userMap[user.id] = user.name;
                              }
                           });
                           setSubtaskUsers((prev) => ({ ...prev, ...userMap }));
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

   function handleShowConfirmModal() {
      if (selectedTasks.length === 0) {
         toast.error("Por favor, selecciona al menos una tarea para asignar");
         return;
      }
      // Inicializar duraciones personalizadas vacías (opcional: si no se completa, se usa la del admin)
      const initialDurations: Record<string, { value: number; unit: "minutes" | "hours" }> = {};
      selectedTasks.forEach(taskId => {
         initialDurations[taskId] = { value: 0, unit: "minutes" };
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

   function areAllTasksScheduled(): boolean {
      return selectedTasks.every(taskId => {
         const schedule = taskSchedules[taskId];
         return schedule && schedule.startTime && schedule.endTime;
      });
   }

   function handleConfirmSave() {
      // La duración es opcional: si no se completa, se usa la estimada por el admin
      setShowTimeScheduling(true);
      // Cargar eventos del día para mostrar en el timeline
      if (user) {
         fetchWorkEvents();
      }
   }



   function handleSaveWithSchedule() {
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
            title: eventForm.event_type === 'daily' ? 'Daily Standup' : eventForm.title.trim(),
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
         fetchAllWorkEvents(); // También recargar la lista de todas las actividades
         
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
         fetchAllWorkEvents(); // También recargar la lista de todas las actividades
         
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
         title: event.event_type === 'daily' ? 'Daily Standup' : event.title,
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
         if (ganttData.length === 0) {
            fetchGanttData();
         }
      }
   }, [showEventsModal, user]);

   // Función para cargar todas las actividades de la semana
   async function fetchAllWorkEvents() {
      if (!user) return;
      
      setLoadingAllEvents(true);
      try {
         const weekDays = getWeekDays(selectedWeekDate);
         const startDate = weekDays[0].dateStr;
         const endDate = weekDays[weekDays.length - 1].dateStr;
         
         const { data, error } = await supabase
            .from('work_events')
            .select('*')
            .eq('user_id', user.id)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true })
            .order('start_time', { ascending: true });
            
         if (error) throw error;
         
         setAllWorkEvents(data || []);
      } catch (error) {
         console.error('Error fetching all work events:', error);
         toast.error('Error al cargar actividades de la semana');
      } finally {
         setLoadingAllEvents(false);
      }
   }

   // Función para eliminar una actividad
   async function handleDeleteActivity(eventId: string) {
      if (!confirm('¿Estás seguro de que quieres eliminar esta actividad?')) {
         return;
      }
      
      try {
         const { error } = await supabase
            .from('work_events')
            .delete()
            .eq('id', eventId);
            
         if (error) throw error;
         
         toast.success('Actividad eliminada correctamente');
         fetchAllWorkEvents(); // Recargar la lista
         
      } catch (error) {
         console.error('Error deleting activity:', error);
         toast.error('Error al eliminar la actividad');
      }
   }

   // Función para editar una actividad
   function handleEditActivity(event: WorkEvent) {
      // Convertir tiempos de string a minutos
      const startMinutes = parseInt(event.start_time.split(':')[0]) * 60 + parseInt(event.start_time.split(':')[1]);
      const endMinutes = parseInt(event.end_time.split(':')[0]) * 60 + parseInt(event.end_time.split(':')[1]);
      
      setEventForm({
         title: event.event_type === 'daily' ? 'Daily Standup' : event.title,
         description: event.description || '',
         event_type: event.event_type,
         start_time: startMinutes,
         end_time: endMinutes,
      });
      
      setEditingEvent(event);
      setShowEventsModal(true);
   }

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
               const todayStr = format(new Date(), "yyyy-MM-dd");
               startTime = `${todayStr}T${schedule.startTime}:00`;
               endTime = `${todayStr}T${schedule.endTime}:00`;
            }

            const customDuration = customDurations[taskId];
            const customMinutes = customDuration?.value
               ? (customDuration.unit === "hours" ? customDuration.value * 60 : customDuration.value)
               : 0;
            const finalDuration = customMinutes > 0 ? customMinutes : task.estimated_duration;

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

         // 4. Insertar en task_work_assignments (MongoDB requiere task_id; para subtareas usamos el task_id padre)
         const taskRows = tasksToSave.filter((r) => r.task_type === "task");
         if (taskRows.length) {
            const { error: err1 } = await supabase.from("task_work_assignments").upsert(taskRows, {
               onConflict: "user_id,date,task_type,task_id",
            });
            if (err1) throw err1;
         }

         const subtaskRows = tasksToSave.filter((r) => r.subtask_id !== null);
         if (subtaskRows.length) {
            const { error: err2 } = await supabase.from("task_work_assignments").upsert(subtaskRows, {
               onConflict: "user_id,date,task_type,subtask_id",
            });
            if (err2) throw err2;
         }

         // 5. Actualizar estado de subtareas a "assigned" (NO sobrescribir estimated_duration: el estimado del admin se mantiene)
         if (subtaskIdsToUpdate.length > 0) {
            const { error: updateSubtaskError } = await supabase
               .from("subtasks")
               .update({ status: "assigned" })
               .in("id", subtaskIdsToUpdate);

            if (updateSubtaskError) {
               console.error("Error al actualizar subtareas:", updateSubtaskError);
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

         // 6. Actualizar estado de tareas principales sin subtareas a "assigned" (NO sobrescribir estimated_duration: el estimado del admin se mantiene)
         if (taskIdsToUpdate.length > 0) {
            const { error: updateTaskError } = await supabase
               .from("tasks")
               .update({ status: "assigned" })
               .in("id", taskIdsToUpdate);

            if (updateTaskError) {
               console.error("Error al actualizar tareas:", updateTaskError);
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
               
               // Registrar en historial para tareas padre (distinto de "Reportar Avance")
               if (updatedParentTasks) {
                  const historyRecords = updatedParentTasks.map(task => ({
                     task_id: task.id,
                     subtask_id: null,
                     changed_by: user.id,
                     previous_status: 'pending',
                     new_status: 'parent_in_progress',
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

         // Filtrar por proyecto: específico o lista de permitidos (assigned_projects)
         const assignProjectFilter = projectId !== "all" ? [projectId] : allowedProjectIds;
         if (assignProjectFilter && assignProjectFilter.length > 0) {
            assignmentsQ = assignmentsQ.in("project_id", assignProjectFilter);
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

         // 3. Buscar tareas devueltas en la tabla tasks - excluyendo proyectos archivados
         let returnedTasks = null;
         let returnedTasksError = null;

         if (normalTaskIds.length > 0) {
            const result = await supabase
               .from("tasks")
               .select(`
                  *,
                  projects!inner(id, is_archived)
               `)
               .in("id", normalTaskIds)
               .eq("status", "returned")
               .eq("projects.is_archived", false);

            returnedTasks = result.data;
            returnedTasksError = result.error;
         }

         if (returnedTasksError) {
            console.error("Error al cargar tareas devueltas:", returnedTasksError);
         }

         // 4. Buscar subtareas devueltas en la tabla subtasks - excluyendo proyectos archivados
         let returnedSubtasks = null;
         let returnedSubtasksError = null;

         if (subtaskIds.length > 0) {
            const result = await supabase
               .from("subtasks")
               .select(
                  `
            *,
            tasks!inner (
              id, title, is_sequential, project_id, phase_id,
              projects!inner(id, is_archived)
            )
          `
               )
               .in("id", subtaskIds)
               .eq("status", "returned")
               .eq("tasks.projects.is_archived", false);

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
         const { data: projects, error: projectsError } = await supabase.from("projects").select("id, name").in("id", Array.from(projectIds)).eq("is_archived", false);

         if (projectsError) {
            console.error("Error cargando nombres de proyectos:", projectsError);
         }

         const projectMap: Record<string, string> = {};
         projects?.forEach((p) => (projectMap[p.id] = p.name));

         // ... resto del código como antes para obtener detalles de tareas normales ...

         // Obtener detalles de tareas normales - excluyendo proyectos archivados
         if (normalTaskIds.length > 0) {
            const { data: taskData, error: taskError } = await supabase
               .from("tasks")
               .select(`
                  *,
                  projects!inner(id, is_archived)
               `)
               .in("id", normalTaskIds)
               .eq("projects.is_archived", false);

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
                     phase_id: (task as { phase_id?: string }).phase_id ?? null,
                     type: "task",
                     assignment_date: assignment?.date || today,
                     notes: isActuallyReturned ? returnedInfo?.notes || task.notes : assignment?.notes || task.notes,
                     checklist: (task.checklist || []).map((c: { id: string; title: string; checked?: boolean; order?: number; parentId?: string | null }) => ({ id: c.id, title: c.title, checked: c.checked ?? false, order: c.order ?? 0, parentId: c.parentId ?? undefined })),
                     comments: (task.comments || []).map((c: { id: string; user_id: string; content: string; created_at: string }) => ({ ...c, created_at: c.created_at })),
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

         // Obtener detalles de subtareas - excluyendo proyectos archivados
         if (subtaskIds.length > 0) {
            const { data: subtaskData, error: subtaskError } = await supabase
               .from("subtasks")
               .select(
                  `
            *,
            tasks!inner (
              id, title, is_sequential, project_id, phase_id,
              projects!inner(id, is_archived)
            )
          `
               )
               .in("id", subtaskIds)
               .eq("tasks.projects.is_archived", false);

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
                     phase_id: (subtask.tasks as { phase_id?: string })?.phase_id ?? null,
                     type: "subtask",
                     assignment_date: assignment?.date || today,
                     checklist: (subtask.checklist || []).map((c: { id: string; title: string; checked?: boolean; order?: number; parentId?: string | null }) => ({ id: c.id, title: c.title, checked: c.checked ?? false, order: c.order ?? 0, parentId: c.parentId ?? undefined })),
                     comments: (subtask.comments || []).map((c: { id: string; user_id: string; content: string; created_at: string }) => ({ ...c, created_at: c.created_at })),
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

         // Cargar fases para el PhaseBadge en el modal
         const allGestionItems = [...todayAssignedItems, ...delayedAssignedItems, ...returnedItems, ...blockedItems];
         const phaseIdsFromGestion = new Set<string>();
         allGestionItems.forEach((t) => { if (t.phase_id) phaseIdsFromGestion.add(t.phase_id); });
         if (phaseIdsFromGestion.size > 0) {
            const { data: phasesData } = await supabase.from("phases").select("id, name, order").in("id", Array.from(phaseIdsFromGestion)).order("order", { ascending: true });
            setPhasesForProject((prev) => {
               const existingIds = new Set(prev.map((p) => p.id));
               const newPhases = (phasesData || []).map((p: { id: string; name: string; order: number }) => ({ id: p.id, name: p.name, order: p.order }));
               const toAdd = newPhases.filter((p) => !existingIds.has(p.id));
               return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
            });
         }

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

   // ✅ NUEVAS FUNCIONES PARA WORK_SESSIONS
   // Corregir tiempo reportado en tarea ya entregada: actualiza la última work_session
   async function correctWorkSessionDuration(assignmentId: string, newTotalMinutes: number): Promise<boolean> {
      try {
         const { data: sessionsRaw, error: fetchError } = await supabase
            .from("work_sessions")
            .select("id, duration_minutes, createdAt, created_at")
            .eq("assignment_id", assignmentId);

         const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : sessionsRaw ? [sessionsRaw] : [];
         if (fetchError || sessions.length === 0) return false;

         const sorted = [...sessions].sort((a: { createdAt?: string; created_at?: string }, b: { createdAt?: string; created_at?: string }) => {
            const da = a.createdAt ?? a.created_at ?? "";
            const db = b.createdAt ?? b.created_at ?? "";
            return new Date(da).getTime() - new Date(db).getTime();
         });
         const lastSession = sorted[sorted.length - 1] as { id: string; duration_minutes?: number };
         if (!lastSession?.id) return false;

         const currentTotal = sessions.reduce((sum: number, s: { duration_minutes?: number }) => sum + (s.duration_minutes || 0), 0);
         if (currentTotal === newTotalMinutes) return true; // Sin cambios

         // Si la corrección es menor al total actual, iterar desde la última sesión hacia atrás y restar el excedente
         let remainingToReduce = currentTotal - newTotalMinutes;
         if (remainingToReduce > 0) {
            for (let i = sorted.length - 1; i >= 0; i--) {
               if (remainingToReduce <= 0) break;
               const session = sorted[i] as { id: string; duration_minutes?: number };
               if (!session.id || !session.duration_minutes || session.duration_minutes <= 0) continue;
               
               const amountToReduce = Math.min(session.duration_minutes, remainingToReduce);
               const newSessionDuration = session.duration_minutes - amountToReduce;
               
               await supabase
                  .from("work_sessions")
                  .update({ duration_minutes: newSessionDuration })
                  .eq("id", session.id);
                  
               remainingToReduce -= amountToReduce;
            }
         } else {
            // Si la corrección es mayor (sumar tiempo), simplemente sumarlo a la última sesión
            const lastSession = sorted[sorted.length - 1] as { id: string; duration_minutes?: number };
            if (!lastSession?.id) return false;
            
            const newLastDuration = (lastSession.duration_minutes || 0) + (newTotalMinutes - currentTotal);
            await supabase
               .from("work_sessions")
               .update({ duration_minutes: newLastDuration })
               .eq("id", lastSession.id);
         }

         await supabase
            .from("task_work_assignments")
            .update({ actual_duration: newTotalMinutes })
            .eq("id", assignmentId);

         return true;
      } catch (err) {
         console.error("Error en correctWorkSessionDuration:", err);
         return false;
      }
   }

   // Función para crear sesiones de trabajo en la nueva tabla work_sessions
   async function createWorkSession(assignmentId: string, durationMinutes: number, notes: string, sessionType: 'progress' | 'completion' | 'block') {
      try {
         const workSession = {
            assignment_id: assignmentId,
            start_time: new Date().toISOString(), // Hora actual como referencia
            end_time: new Date().toISOString(),   // Misma hora (es solo registro de cuando se reportó)
            duration_minutes: durationMinutes,
            notes: notes,
            session_type: sessionType,
            created_at: new Date().toISOString()
         };

         const { error } = await supabase
            .from("work_sessions")
            .insert([workSession]);

         if (error) {
            console.error("Error creando sesión de trabajo:", error);
            throw error;
         }

         console.log("✅ Sesión de trabajo creada exitosamente:", workSession);
         return workSession;
      } catch (error) {
         console.error("Error en createWorkSession:", error);
         throw error;
      }
   }

   // Función para obtener el assignment_id de una tarea/subtarea específica
   // Para tareas devueltas/retrasadas, la asignación tiene date=assignment_date (fecha original), no hoy
   async function getAssignmentId(taskId: string, taskType: string, date: string, fallbackDate?: string): Promise<string | null> {
      try {
         const isSubtask = taskId.startsWith("subtask-");
         const originalId = isSubtask ? taskId.replace("subtask-", "") : taskId;

         const tryDate = async (d: string) => {
            let query = supabase
               .from("task_work_assignments")
               .select("id")
               .eq("user_id", user!.id)
               .eq("date", d)
               .eq("task_type", taskType);
            if (isSubtask) query = query.eq("subtask_id", originalId);
            else query = query.eq("task_id", originalId);
            const { data, error } = await query.single();
            return error || !data ? null : data.id;
         };

         let assignmentId = await tryDate(date);
         if (!assignmentId && fallbackDate && fallbackDate !== date) {
            assignmentId = await tryDate(fallbackDate);
         }
         if (!assignmentId) {
            // Último intento: buscar sin filtrar por fecha (tareas devueltas/retrasadas)
            let query = supabase
               .from("task_work_assignments")
               .select("id")
               .eq("user_id", user!.id)
               .eq("task_type", taskType)
               .not("status", "in", "('completed','in_review','approved')");
            if (isSubtask) query = query.eq("subtask_id", originalId);
            else query = query.eq("task_id", originalId);
            const { data } = await query.order("date", { ascending: false }).limit(1).maybeSingle();
            assignmentId = data?.id ?? null;
         }

         return assignmentId;
      } catch (error) {
         console.error("Error en getAssignmentId:", error);
         return null;
      }
   }

   // Añadir función para manejar el modal de estado antes de la función fetchAssignedTasks()
   // Función para abrir el modal de actualización de estado
   async function handleOpenStatusModal(taskId: string, action: "complete" | "progress" | "block" = "complete") {
      // Encontrar la tarea seleccionada para obtener la duración estimada y estado actual
      let selectedTask;
      let isEditing = false;

      // Buscar primero en tareas pendientes
      selectedTask = [...assignedTaskItems, ...delayedTaskItems, ...returnedTaskItems].find((task) => task.id === taskId);

      // Si no está en las tareas pendientes, buscar en entregadas (completadas, en revisión, aprobadas)
      if (!selectedTask) {
         selectedTask = completedTaskItems.find((t) => t.id === taskId)
            || inReviewTaskItems.find((t) => t.id === taskId)
            || approvedTaskItems.find((t) => t.id === taskId);
         isEditing = !!selectedTask && ["completed", "in_review", "approved"].includes(selectedTask.status || "");
      }

      setTaskForStatusUpdate(selectedTask || null);
      setActionType(action);

      // Si estamos editando una tarea entregada, extraer los datos de las notas
      let details = "";
      let durReason = "";
      let prefillDuration = 0;

      let prefillAlertas: Array<{ tipo: string; descripcion: string }> = [];
      if (isEditing && selectedTask?.notes) {
         let metadata: Record<string, unknown> = {};
         if (typeof selectedTask.notes === "object" && selectedTask.notes !== null) {
            metadata = selectedTask.notes as Record<string, unknown>;
         } else if (typeof selectedTask.notes === "string") {
            try { metadata = JSON.parse(selectedTask.notes) as Record<string, unknown>; } catch { /* ignore */ }
         }
         details = (metadata.entregables || metadata.notes || "") as string;
         durReason = (metadata.razon_duracion || "") as string;
         if (Array.isArray(metadata.alertas_solicitudes)) {
            prefillAlertas = (metadata.alertas_solicitudes as Array<{ tipo?: string; descripcion?: string }>).map((a) => ({ tipo: a.tipo || "solicitud_nueva_tarea", descripcion: a.descripcion || "" }));
         }
      }

      // Pre-llenar duración reportada para que el usuario pueda corregirla
      if (isEditing && selectedTask && action === "complete") {
         const taskType = taskId.startsWith("subtask-") ? "subtask" : "task";
         const assignmentDate = (selectedTask as { assignment_date?: string }).assignment_date || format(new Date(), "yyyy-MM-dd");
         const assignmentId = await getAssignmentId(taskId, taskType, assignmentDate, assignmentDate);
         if (assignmentId) {
            const { data: assignmentData } = await supabase
               .from("task_work_assignments")
               .select("actual_duration")
               .eq("id", assignmentId)
               .single();
            const assignment = Array.isArray(assignmentData) ? assignmentData[0] : assignmentData;
            const actualDur = (assignment as { actual_duration?: number })?.actual_duration;
            if (actualDur != null && actualDur > 0) {
               prefillDuration = actualDur;
            }
         }
      }

      setSelectedTaskId(taskId);
      
      // Configurar estado según la acción
      if (action === "complete") {
         setSelectedStatus("completed");
      } else if (action === "progress") {
         setSelectedStatus("in_progress");
      } else if (action === "block") {
         setSelectedStatus("blocked");
      }

      setStatusDetails(details);
      setAlertasSolicitudes(prefillAlertas);
      setAlertaDescripcion("");
      setAlertaTipo("solicitud_nueva_tarea");

      // Para tareas entregadas: pre-llenar duración para permitir corrección. Para nuevas: en blanco
      setActualDuration(isEditing && prefillDuration > 0 ? prefillDuration : 0);
      setDurationUnit("minutes");
      setDurationReason(durReason);
      setStatusError(null);
      
      // Resetear campos de programación de próximo trabajo
      setNextWorkDate("");
      setNextWorkStartTime("");
      setNextWorkEndTime("");
      setNextWorkDuration(0);
      
      setShowStatusModal(true);
      setShowActionsDropdown({});

      // Detectar si es tarea de supervisión (para exigir reporte)
      if (taskId.startsWith("subtask-")) {
         const subtaskId = taskId.replace("subtask-", "");
         const { data: sub } = await supabase.from("subtasks").select("task_id").eq("id", subtaskId).single();
         if (sub?.task_id) {
            const { data: parent } = await supabase.from("tasks").select("notes").eq("id", sub.task_id).single();
            try {
               const notes = parent?.notes ? (typeof parent.notes === "string" ? JSON.parse(parent.notes) : parent.notes) : {};
               setIsSupervisionTask(!!notes?.is_supervision);
            } catch {
               setIsSupervisionTask(false);
            }
         } else {
            setIsSupervisionTask(false);
         }
      } else {
         setIsSupervisionTask(false);
      }
   }

   // Función para manejar el envío del formulario de estado
   // Helper para actualizar el estado de una tarea padre tras completar todas sus subtareas
   async function updateParentTaskStatus(parentId: string) {
      try {
         // 1. Get parent task's current state first - excluyendo proyectos archivados
         const { data: parentTask, error: parentError } = await supabase
            .from("tasks")
            .select(`
               status,
               projects!inner(id, is_archived)
            `)
            .eq("id", parentId)
            .eq("projects.is_archived", false)
            .single();

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
      
      // Validaciones específicas según el tipo de acción
      if (actionType === "complete" || selectedStatus === "completed") {
         if (!statusDetails.trim()) return setStatusError("Por favor, detalla los entregables o resultados");
         if (isSupervisionTask && statusDetails.trim().length < 15) return setStatusError("El reporte de supervisión debe describir qué supervisaste y los hallazgos (mínimo 15 caracteres)");
         if (actualDuration <= 0) return setStatusError("Por favor, indica el tiempo real que trabajaste");
             } else if (actionType === "progress" || selectedStatus === "in_progress") {
          if (!statusDetails.trim()) return setStatusError("Por favor, describe el avance realizado");
          if (actualDuration <= 0) return setStatusError("Por favor, indica el tiempo trabajado en esta sesión");
          
          // Validaciones para programación de próximo trabajo
          if (!nextWorkDate) return setStatusError("Por favor, selecciona la fecha para continuar trabajando");
          if (!nextWorkStartTime) return setStatusError("Por favor, selecciona la hora de inicio");
          if (!nextWorkEndTime) return setStatusError("Por favor, selecciona la hora de fin");
          
          // Validar que la hora de fin sea después de la hora de inicio
          if (nextWorkStartTime >= nextWorkEndTime) return setStatusError("La hora de fin debe ser posterior a la hora de inicio");
          
          // Validar que la fecha no sea en el pasado
          const selectedDate = new Date(nextWorkDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (selectedDate < today) return setStatusError("No puedes programar trabajo en fechas pasadas");
          
       } else if (actionType === "block" || selectedStatus === "blocked") {
         if (!statusDetails.trim()) return setStatusError("Por favor, explica el motivo del bloqueo");
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
      };

      if (selectedStatus === "completed") {
         metadata.entregables = statusDetails;
         metadata.duracion_real = durationMin;
         metadata.unidad_original = durationUnit;
         metadata.razon_duracion = durationReason;
         if (alertasSolicitudes.length > 0) {
            metadata.alertas_solicitudes = alertasSolicitudes.map((a) => ({
               ...a,
               created_at: new Date().toISOString(),
            }));
         }
      } else if (selectedStatus === "in_progress") {
         metadata.tiempo_sesion = durationMin; // Tiempo trabajado en esta sesión
         metadata.unidad_original = durationUnit;
         metadata.notas_avance = durationReason; // Notas adicionales del avance
         metadata.descripcion_avance = statusDetails; // Descripción del avance
      } else if (selectedStatus === "blocked") {
         metadata.razon_bloqueo = statusDetails;
      }

      // Merge con notes existentes para preservar campos como returned_feedback
      let finalNotes = metadata;
      if (taskForStatusUpdate?.notes) {
         let existing: Record<string, unknown> = {};
         if (typeof taskForStatusUpdate.notes === "object" && taskForStatusUpdate.notes !== null) {
            existing = taskForStatusUpdate.notes as Record<string, unknown>;
         } else if (typeof taskForStatusUpdate.notes === "string") {
            try { existing = JSON.parse(taskForStatusUpdate.notes) as Record<string, unknown>; } catch { /* ignore */ }
         }
         finalNotes = { ...existing, ...metadata };
      }

      try {
         // 4️⃣ Actualizar tanto la tabla de tasks/subtasks como task_work_assignments
         // ✅ CORREGIDO: Ya no sobrescribimos end_time, solo actualizamos el estado
         const notesToSave = typeof finalNotes === "string" ? finalNotes : JSON.stringify(finalNotes);

         // 1) Actualizar tasks/subtasks PRIMERO (fuente de Bitácora y Management)
         const { error: taskError } = await supabase
            .from(table)
            .update({
               status: selectedStatus,
               notes: notesToSave,
            })
            .eq("id", originalId);

         if (taskError) throw taskError;

         // 2) Actualizar task_work_assignments (no bloquear si falla - el dato crítico ya está en tasks/subtasks)
         const assignRes = await supabase
            .from("task_work_assignments")
            .update({
               status: selectedStatus,
               updated_at: new Date().toISOString(),
               notes: finalNotes,
            })
            .eq("user_id", user!.id)
            .eq("task_type", taskType)
            .eq(isSubtask ? "subtask_id" : "task_id", originalId);

         if (assignRes.error) {
            console.warn("⚠ [STATUS] task_work_assignments update failed (notes saved in subtask):", assignRes.error);
            // No lanzar - el dato crítico (notes con alertas) ya está guardado en subtasks
         }

         // ✅ Crear sesión de trabajo en work_sessions
         // Si no existe task_work_assignment (usuario nunca planificó en Mi día), crearla on-the-fly para que el Control de Horas muestre Ejecutado
         try {
            const assignmentDate = taskForStatusUpdate?.assignment_date || today;
            let assignmentId = await getAssignmentId(selectedTaskId, taskType, today, assignmentDate);

            // Si no existe asignación, crearla para que el tiempo se registre en Control de Horas
            if (!assignmentId && (selectedStatus === "completed" || selectedStatus === "in_progress") && taskForStatusUpdate) {
               const estDuration = taskForStatusUpdate.estimated_duration ?? durationMin;
               const projectId = taskForStatusUpdate.project_id || null;
               let parentTaskId: string | null = null;
               if (isSubtask) {
                  const { data: sub } = await supabase.from("subtasks").select("task_id").eq("id", originalId).single();
                  parentTaskId = sub?.task_id ?? null;
               }
               const newAssignment = {
                  user_id: user!.id,
                  task_id: isSubtask ? parentTaskId : originalId,
                  subtask_id: isSubtask ? originalId : null,
                  task_type: taskType,
                  date: today,
                  estimated_duration: estDuration,
                  project_id: projectId,
                  status: selectedStatus,
                  actual_duration: selectedStatus === "completed" ? durationMin : null,
               };
               const { data: inserted, error: insertErr } = await supabase
                  .from("task_work_assignments")
                  .insert([newAssignment])
                  .select("id")
                  .single();
               if (!insertErr && inserted?.id) {
                  assignmentId = inserted.id;
               }
            }

            if (assignmentId) {
               const isCorrectingDelivered = (selectedStatus === "completed" || selectedStatus === "in_review") &&
                  taskForStatusUpdate && ["completed", "in_review", "approved"].includes(taskForStatusUpdate.status || "");

               if (isCorrectingDelivered) {
                  // Corregir tiempo reportado en tarea ya entregada (no crear nueva sesión)
                  await correctWorkSessionDuration(assignmentId, durationMin);
               } else {
                  let sessionType: 'progress' | 'completion' | 'block';
                  if (selectedStatus === "completed" || selectedStatus === "in_review") {
                     sessionType = 'completion';
                  } else if (selectedStatus === "in_progress") {
                     sessionType = 'progress';
                  } else {
                     sessionType = 'block';
                  }

                  await createWorkSession(assignmentId, durationMin, statusDetails, sessionType);
                  
                  // Actualizar actual_duration sumando todas las sesiones, independientemente del estado (para que Control de Horas refleje avances)
                  const { data: sessions, error: sessionsError } = await supabase
                     .from("work_sessions")
                     .select("duration_minutes")
                     .eq("assignment_id", assignmentId);

                  if (!sessionsError && sessions) {
                     const totalDuration = sessions.reduce((total, session) => total + (session.duration_minutes || 0), 0);
                     await supabase
                        .from("task_work_assignments")
                        .update({ actual_duration: totalDuration })
                        .eq("id", assignmentId);
                  }
               }
            } else if (selectedStatus === "completed" || selectedStatus === "in_progress") {
               console.error("❌ No se pudo encontrar ni crear assignment_id para work_session");
            }
         } catch (sessionError) {
            console.error("Error creando work_session:", sessionError);
            // No fallar todo el proceso, solo loggear el error
         }

         // 🕒 Si es un avance, programar la próxima sesión de trabajo
         if (selectedStatus === "in_progress" && nextWorkDate && nextWorkStartTime && nextWorkEndTime) {
            try {
               // Convertir horas a minutos para calcular duración
               const [startHour, startMin] = nextWorkStartTime.split(':').map(Number);
               const [endHour, endMin] = nextWorkEndTime.split(':').map(Number);
               const startMinutes = startHour * 60 + startMin;
               const endMinutes = endHour * 60 + endMin;
               const scheduledDuration = endMinutes - startMinutes;

               const nextWorkAssignment = {
                  user_id: user!.id,
                  task_id: isSubtask ? null : originalId,
                  subtask_id: isSubtask ? originalId : null,
                  task_type: taskType,
                  date: nextWorkDate,
                  start_time: nextWorkStartTime,
                  end_time: nextWorkEndTime,
                  duration: scheduledDuration,
                  status: "scheduled", // Estado para trabajos programados
                  created_at: new Date().toISOString(),
                  notes: {
                     scheduled_from_progress: true,
                     previous_session_notes: statusDetails,
                     session_type: "continuation"
                  }
               };

               const { error: scheduleError } = await supabase
                  .from("task_work_assignments")
                  .insert([nextWorkAssignment]);

               if (scheduleError) {
                  console.error("Error programando próxima sesión:", scheduleError);
                  // No fallar todo el proceso, solo mostrar warning
                  console.warn("⚠️ No se pudo programar la próxima sesión, pero el avance se guardó correctamente");
               } else {
                  console.log("✅ Próxima sesión programada exitosamente:", nextWorkAssignment);
               }
            } catch (error) {
               console.error("Error en programación de próxima sesión:", error);
            }
         }

         // 5️⃣ Registrar el cambio de estado en la nueva tabla de historial
         if (taskForStatusUpdate) {
            const historyRecord = {
               task_id: isSubtask ? null : originalId,
               subtask_id: isSubtask ? originalId : null,
               changed_by: user!.id,
               previous_status: taskForStatusUpdate.status,
               new_status: selectedStatus,
               metadata: finalNotes,
            };

            const { error: historyError } = await supabase.from("status_history").insert([historyRecord]);

            if (historyError) {
               // Loggear el error pero no bloquear el flujo del usuario
               console.error("⚠️ [HISTORY] No se pudo registrar el cambio de estado:", historyError);
            } else {
               console.log("✅ [HISTORY] Cambio de estado registrado:", historyRecord);
            }
         }

         // 🔔 Enviar notificación a administradores si la tarea fue completada o bloqueada
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
               fetch(apiUrl('/api/telegram/admin-notification'), {
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
               setReturnedTaskItems((prev) => prev.map((t) => (t.id === selectedTaskId ? { ...t, status: selectedStatus, notes: finalNotes } : t)));
            }
            if (isInAssigned) {
               setAssignedTaskItems((prev) => prev.map((t) => (t.id === selectedTaskId ? { ...t, status: selectedStatus, notes: finalNotes } : t)));
            }
            if (isInDelayed) {
               setDelayedTaskItems((prev) => prev.map((t) => (t.id === selectedTaskId ? { ...t, status: selectedStatus, notes: finalNotes } : t)));
            }
         }

         setShowStatusModal(false);
         setTaskForStatusUpdate(null);
         setActionType(null);
         
         // Resetear campos de programación
         setNextWorkDate("");
         setNextWorkStartTime("");
         setNextWorkEndTime("");
         setNextWorkDuration(0);

         // Recargar avances después de guardar progreso
         if (selectedStatus === "in_progress") {
            loadTaskProgressForKanban();
         }

         // Toast de éxito
         const actionText = actionType === "complete" ? "completada" : actionType === "progress" ? "actualizada con avance reportado" : actionType === "block" ? "bloqueada" : selectedStatus === "completed" ? "completada" : "actualizada";
         let successMessage = `Tarea ${actionText} con éxito!`;
         
         if (actionType === "progress" && nextWorkDate && nextWorkStartTime) {
            successMessage += ` ⏰ Próxima sesión programada para ${format(new Date(nextWorkDate), "dd/MM/yyyy")} a las ${nextWorkStartTime}`;
         }
         if (selectedStatus === "completed" && alertasSolicitudes.length > 0) {
            successMessage += ` ⚠ ${alertasSolicitudes.length} alerta(s) enviada(s) al admin.`;
         }
         
         toast.success(successMessage);
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

         // Filtrar por proyecto: específico o lista de permitidos (assigned_projects)
         const completedProjectFilter = projectId !== "all" ? [projectId] : allowedProjectIds;
         if (completedProjectFilter && completedProjectFilter.length > 0) {
            completedTaskAssignmentsQuery = completedTaskAssignmentsQuery.in("project_id", completedProjectFilter);
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

         // Obtener detalles de tareas completadas - excluyendo proyectos archivados
         if (normalTaskIds.length > 0) {
            const { data: taskData, error: taskError } = await supabase
               .from("tasks")
               .select(`
                  *,
                  projects!inner(id, is_archived)
               `)
               .in("id", normalTaskIds)
               .eq("projects.is_archived", false);

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
               const { data: projects, error: projectsError } = await supabase.from("projects").select("id, name").in("id", Array.from(projectIds)).eq("is_archived", false);

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
                     phase_id: (task as { phase_id?: string }).phase_id ?? null,
                     type: "task" as const,
                     assignment_date: assignment?.date || "",
                     notes: assignment?.notes || task.notes || "",
                  };
               });

               allCompletedItems = [...allCompletedItems, ...formattedTasks];
            }
         }

         // Obtener detalles de subtareas completadas - excluyendo proyectos archivados
         if (subtaskIds.length > 0) {
            const { data: subtaskData, error: subtaskError } = await supabase
               .from("subtasks")
               .select(
                  `
            *,
            tasks!inner (
              id, title, is_sequential, project_id, phase_id,
              projects!inner(id, is_archived)
            )
          `
               )
               .in("id", subtaskIds)
               .eq("tasks.projects.is_archived", false);

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
               const { data: projects, error: projectsError } = await supabase.from("projects").select("id, name").in("id", Array.from(projectIds)).eq("is_archived", false);

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
                     phase_id: (subtask.tasks as { phase_id?: string })?.phase_id ?? null,
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

         // Cargar fases para el PhaseBadge en el modal
         const phaseIdsFromCompleted = new Set<string>();
         sortedCompletedItems.forEach((t) => { if (t.phase_id) phaseIdsFromCompleted.add(t.phase_id); });
         if (phaseIdsFromCompleted.size > 0) {
            const { data: phasesData } = await supabase.from("phases").select("id, name, order").in("id", Array.from(phaseIdsFromCompleted)).order("order", { ascending: true });
            setPhasesForProject((prev) => {
               const existingIds = new Set(prev.map((p) => p.id));
               const newPhases = (phasesData || []).map((p: { id: string; name: string; order: number }) => ({ id: p.id, name: p.name, order: p.order }));
               const toAdd = newPhases.filter((p) => !existingIds.has(p.id));
               return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
            });
         }

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

         // 🔍 Buscar en status_history la entrega original (status = completed)
         const isSubtask = task.type === "subtask";
         const originalId = task.original_id || task.id;
         
         try {
            const { data: historyData, error: historyError } = await supabase
               .from("status_history")
               .select("*")
               .eq(isSubtask ? "subtask_id" : "task_id", originalId)
               .eq("new_status", "completed")
               .order("changed_at", { ascending: false })
               .limit(1);

            if (!historyError && historyData && historyData.length > 0) {
               const completedEntry = historyData[0];
               if (completedEntry.metadata) {
                  // Agregar la información de la entrega original
                  updatedNotes.entrega_original = completedEntry.metadata;
                  console.log("[FEEDBACK] Entrega original encontrada:", completedEntry.metadata);
               }
            }
         } catch (error) {
            console.error("Error buscando entrega original en historial:", error);
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
            // Lógica similar para tareas normales - excluyendo proyectos archivados
            const { data, error } = await supabase
               .from("tasks")
               .select(`
                  *,
                  projects!inner(id, is_archived)
               `)
               .eq("id", task.original_id || task.id)
               .eq("projects.is_archived", false)
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

         // 0. Registrar en status_history antes de eliminar
         let taskIdForHistory: string;
         let subtaskIdForHistory: string | null = null;
         if (isSubtask) {
            const { data: subData } = await supabase.from("subtasks").select("task_id").eq("id", originalId).single();
            taskIdForHistory = subData?.task_id ?? "";
            subtaskIdForHistory = originalId;
         } else {
            taskIdForHistory = originalId;
         }
         const historyRecord = {
            task_id: taskIdForHistory,
            subtask_id: subtaskIdForHistory,
            changed_by: user.id,
            previous_status: "assigned",
            new_status: "unassigned_from_day",
            metadata: { date: assignmentDate, reason: "user_removed" },
         };
         await supabase.from("status_history").insert([historyRecord]);

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

   // =====================
   // FUNCIONES PARA AVANCES Y PROGRESO
   // =====================

   // Función para obtener el historial de avances de una tarea
   async function fetchTaskProgress(taskId: string) {
      if (!user) return [];

      try {
         const isSubtask = taskId.startsWith("subtask-");
         const originalId = isSubtask ? taskId.replace("subtask-", "") : taskId;

         // Buscar en status_history los avances (estado in_progress)
         const { data: progressHistory, error } = await supabase
            .from("status_history")
            .select("*")
            .eq(isSubtask ? "subtask_id" : "task_id", originalId)
            .eq("new_status", "in_progress")
            .order("changed_at", { ascending: false });

         if (error) {
            console.error("Error fetching task progress:", error);
            return [];
         }

         return progressHistory || [];
      } catch (error) {
         console.error("Error fetching task progress:", error);
         return [];
      }
   }

   // Función para cargar avances de todas las tareas visibles
   async function loadTaskProgressForKanban() {
      const allTasks = [
         ...assignedTaskItems,
         ...delayedTaskItems,
         ...returnedTaskItems,
         ...completedTaskItems,
         ...inReviewTaskItems
      ];

      const progressData: Record<string, any[]> = {};

      for (const task of allTasks) {
         const progress = await fetchTaskProgress(task.id);
         progressData[task.id] = progress;
      }

      setTaskProgress(progressData);
   }

   // Función para mostrar el modal de avances
   function handleShowProgress(taskId: string) {
      const progress = taskProgress[taskId] || [];
      setSelectedTaskProgress(progress);
      setShowProgressModal(true);
   }

   // =====================
   // FUNCIONES PARA GANTT SEMANAL (getWeekDays y getWeekRange desde weekUtils)
   // =====================

   // Función para navegar a la semana anterior
   function goToPreviousWeek() {
      const newDate = new Date(selectedWeekDate);
      newDate.setDate(selectedWeekDate.getDate() - 7);
      setSelectedWeekDate(newDate);
   }

   // Función para navegar a la semana siguiente
   function goToNextWeek() {
      const newDate = new Date(selectedWeekDate);
      newDate.setDate(selectedWeekDate.getDate() + 7);
      setSelectedWeekDate(newDate);
   }

   // Función para ir a la semana actual
   function goToCurrentWeek() {
      setSelectedWeekDate(new Date());
   }

   // Función para verificar si un día ya pasó
   function isDayPassed(dateStr: string): boolean {
      // Crear fecha manualmente para evitar problemas de zona horaria
      const [year, month, day] = dateStr.split('-').map(Number);
      const dayDate = new Date(year, month - 1, day); // month es 0-indexed
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Un día se considera "pasado" solo cuando ya no es el día actual
      // Es decir, cuando today > dayDate (ya pasó medianoche)
      const isPassed = today > dayDate;
      
      
      return isPassed;
   }

   // Función para detectar incumplimientos (días pasados sin trabajo reportado)
   function checkNonCompliance(taskGroup: any, dateStr: string): boolean {
      if (!isDayPassed(dateStr)) return false;
      
      const sessions = taskGroup.sessions[dateStr] || [];
      if (sessions.length === 0) return false; // No estaba planeado para ese día
      
      // Verificar si hay tiempo real ejecutado ese día
      const realExecutedTime = executedTimeData[taskGroup.id]?.[dateStr] || 0;
      return realExecutedTime === 0; // Incumplimiento si no hay tiempo ejecutado
   }

   // Función para detectar trabajo realizado fuera del día planeado
   async function getOffScheduleWork(taskGroup: any): Promise<Record<string, number>> {
      if (!user) return {};
      
      // Si la tarea tiene work_sessions, generar offSchedule desde ellas (días no planificados)
      // en vez de status_history, para evitar doble conteo y mostrar EXTRA correctamente.
      if (taskGroup.workSessions && Object.keys(taskGroup.workSessions).length > 0) {
         const offScheduleWork: Record<string, number> = {};
         for (const [dateStr, sessions] of Object.entries(taskGroup.workSessions)) {
            const plannedSessions = taskGroup.sessions[dateStr] || [];
            if (plannedSessions.length === 0) {
               const total = (sessions as any[]).reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
               if (total > 0) offScheduleWork[dateStr] = total;
            }
         }
         return offScheduleWork;
      }
      
      try {
         const weekDays = getWeekDays(selectedWeekDate);
         const startDate = weekDays[0].dateStr;
         const endDate = weekDays[weekDays.length - 1].dateStr;

         // Obtener trabajo real del historial de cambios de estado
         const taskType = taskGroup.type;
         const taskId = taskType === "subtask" 
            ? taskGroup.id.replace("subtask-", "")
            : taskGroup.id.replace("task-", "");

         const { data: statusHistory, error } = await supabase
            .from("status_history")
            .select("changed_at, metadata")
            .eq(taskType === "subtask" ? "subtask_id" : "task_id", taskId)
            .eq("new_status", "completed")
            .gte("changed_at", `${startDate} 00:00:00`)
            .lte("changed_at", `${endDate} 23:59:59`);

         if (error || !statusHistory) return {};

         const offScheduleWork: Record<string, number> = {};
         
         statusHistory.forEach(record => {
            const completedDate = format(new Date(record.changed_at), "yyyy-MM-dd");
            const metadata = record.metadata || {};
            const executedTime = metadata.duracion_real || 0;
            
            // Solo contar como fuera de cronograma si no estaba planeado para ese día
            const plannedSessions = taskGroup.sessions[completedDate] || [];
            if (plannedSessions.length === 0 && executedTime > 0) {
               offScheduleWork[completedDate] = executedTime;
            }
         });

         return offScheduleWork;
      } catch (error) {
         console.error("Error getting off-schedule work:", error);
         return {};
      }
   }

   // ✅ NUEVA: Función para obtener sesiones reales de trabajo desde work_sessions
   async function getWorkSessionsForGantt(startDate: string, endDate: string) {
      try {
         const { data: workSessions, error } = await supabase
            .from("work_sessions")
            .select(`
               *,
               task_work_assignments!inner(
                  id, user_id, task_id, subtask_id, task_type, date,
                  tasks(title, project_id, projects(name)),
                  subtasks(title, task_id, tasks!subtasks_task_id_fkey(title, project_id, projects(name)))
               )
            `)
            .eq("task_work_assignments.user_id", user!.id)
            .gte("createdAt", new Date(`${startDate}T00:00:00`).toISOString())
            .lte("createdAt", new Date(`${endDate}T23:59:59.999`).toISOString())
            .order("createdAt", { ascending: true });

         if (error) {
            console.error("Error obteniendo work_sessions:", error);
            return {};
         }

         // Agrupar sesiones por assignment y por fecha REAL de la sesión (cuándo se hizo el trabajo),
         // no por assignment.date, para evitar atribuir trabajo al día equivocado y doble conteo con offSchedule.
         const sessionsByAssignment: Record<string, Record<string, any[]>> = {};
         
         workSessions?.forEach(session => {
            const assignment = session.task_work_assignments;
            const assignmentKey = `${assignment.task_type}-${assignment.task_type === "subtask" ? assignment.subtask_id : assignment.task_id}`;
            const createdAt = session.created_at ?? session.createdAt;
            const sessionDate = createdAt
               ? format(new Date(createdAt), "yyyy-MM-dd")
               : assignment.date;
            
            if (!sessionsByAssignment[assignmentKey]) {
               sessionsByAssignment[assignmentKey] = {};
            }
            
            if (!sessionsByAssignment[assignmentKey][sessionDate]) {
               sessionsByAssignment[assignmentKey][sessionDate] = [];
            }
            
            sessionsByAssignment[assignmentKey][sessionDate].push({
               ...session,
               assignment: assignment
            });
         });

         return sessionsByAssignment;
      } catch (error) {
         console.error("Error en getWorkSessionsForGantt:", error);
         return {};
      }
   }

   // Función para obtener datos del Gantt semanal
   async function getWeeklyGanttData() {
      if (!user) return [];

      try {
         const weekDays = getWeekDays(selectedWeekDate);
         const startDate = weekDays[0].dateStr;
         const endDate = weekDays[weekDays.length - 1].dateStr;

         // Obtener todas las asignaciones de la semana con información completa
         const { data: assignments, error } = await supabase
            .from("task_work_assignments")
            .select(`
               *,
               tasks(id, title, description, project_id, phase_id, estimated_duration, priority, start_date, deadline, status, is_sequential, projects(name)),
               subtasks(id, title, description, task_id, estimated_duration, start_date, deadline, status, tasks(id, title, phase_id, projects(name)))
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
                  description: taskData.description,
                  priority: taskData.priority || "medium",
                  start_date: taskData.start_date || "",
                  deadline: taskData.deadline || "",
                  status: taskData.status || "assigned",
                  is_sequential: taskData.is_sequential || false,
                  type: assignment.task_type,
                  project_id: assignment.project_id,
                  project_name: projectName,
                  parent_task_title: parentTaskTitle,
                  phase_id: (taskData as { phase_id?: string })?.phase_id ?? (taskData.tasks as { phase_id?: string })?.phase_id ?? null,
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

         // ✅ NUEVO: Obtener sesiones reales de trabajo desde work_sessions
         const workSessionsData = await getWorkSessionsForGantt(startDate, endDate);
         
         // ✅ NUEVO: Agregar información de sesiones reales a cada taskGroup
         Object.keys(taskGroups).forEach(taskKey => {
            if (workSessionsData[taskKey]) {
               taskGroups[taskKey].workSessions = workSessionsData[taskKey];
            }
         });

         // Obtener actividades adicionales (work_events) de la semana
         const { data: workEvents, error: eventsError } = await supabase
            .from('work_events')
            .select('*')
            .eq('user_id', user.id)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('start_time', { ascending: true });

         if (!eventsError && workEvents) {
            // Agrupar eventos por fecha para crear entradas en el Gantt
            workEvents.forEach(event => {
               const eventKey = `event-${event.id}`;
               
               // Calcular duración del evento en minutos
               const startMinutes = parseInt(event.start_time.split(':')[0]) * 60 + parseInt(event.start_time.split(':')[1]);
               const endMinutes = parseInt(event.end_time.split(':')[0]) * 60 + parseInt(event.end_time.split(':')[1]);
               const durationMinutes = endMinutes - startMinutes;

               // Crear entrada para actividad adicional
               taskGroups[eventKey] = {
                  id: eventKey,
                  title: event.title,
                  description: event.description || "",
                  priority: "medium",
                  start_date: event.date,
                  deadline: event.date,
                  status: "completed", // Asumir como ejecutada
                  is_sequential: false,
                  type: "event", // Nuevo tipo para actividades adicionales
                  project_id: event.project_id || "",
                  project_name: "Actividad Adicional",
                  parent_task_title: "",
                  estimated_duration: durationMinutes,
                  event_type: event.event_type,
                  sessions: {
                     [event.date]: [{
                        id: event.id,
                        status: "completed",
                        estimated_duration: durationMinutes,
                        actual_duration: durationMinutes, // Misma duración = ejecutado completamente
                        start_time: `${event.date}T${event.start_time}`,
                        end_time: `${event.date}T${event.end_time}`,
                        notes: event.description || "",
                        event_type: event.event_type
                     }]
                  }
               };
            });
         }

         return Object.values(taskGroups);
      } catch (error) {
         console.error("Error fetching weekly gantt data:", error);
         return [];
      }
   }

   // Función para obtener la hora más temprana de una tarea en la semana
   function getEarliestTimeForTask(taskGroup: any): string {
      const weekDays = getWeekDays(selectedWeekDate);
      let earliestTime = "23:59"; // Default a final del día
      
      weekDays.forEach(day => {
         const sessions = taskGroup.sessions[day.dateStr] || [];
         sessions.forEach((session: any) => {
            if (session.start_time) {
               // Extraer solo la parte de tiempo (HH:MM)
               const timeOnly = session.start_time.split('T')[1]?.substring(0, 5) || session.start_time;
               if (timeOnly < earliestTime) {
                  earliestTime = timeOnly;
               }
            }
         });
      });
      
      return earliestTime;
   }

   // Función para cargar datos del Gantt
   async function fetchGanttData() {
      const data = await getWeeklyGanttData();
      
      // Ordenar tareas por horario más temprano
      const sortedData = data.sort((a, b) => {
         const timeA = getEarliestTimeForTask(a);
         const timeB = getEarliestTimeForTask(b);
         return timeA.localeCompare(timeB);
      });
      
      setGanttData(sortedData);
      
      // Precalcular tiempos ejecutados y trabajo fuera de cronograma
      await calculateExecutedTimes(sortedData);
      await calculateOffScheduleWork(sortedData);
   }

   // ✅ ACTUALIZADA: Función para precalcular tiempos ejecutados usando work_sessions
   async function calculateExecutedTimes(ganttData: any[]) {
      const weekDays = getWeekDays(selectedWeekDate);
      const executedTimes: Record<string, Record<string, number>> = {};

      for (const taskGroup of ganttData) {
         executedTimes[taskGroup.id] = {};
         
         for (const day of weekDays) {
            const sessions = taskGroup.sessions[day.dateStr] || [];
            
            if (sessions.length > 0) {
               // ✅ NUEVO: Usar work_sessions si están disponibles
               if (taskGroup.workSessions && taskGroup.workSessions[day.dateStr]) {
                  const workSessions = taskGroup.workSessions[day.dateStr];
                  const totalExecutedTime = workSessions.reduce((total: number, session: any) => {
                     return total + (session.duration_minutes || 0);
                  }, 0);
                  executedTimes[taskGroup.id][day.dateStr] = totalExecutedTime;
               } else {
                  // ✅ FALLBACK: Usar método anterior si no hay work_sessions
               const realTaskId = taskGroup.type === "subtask" 
                  ? taskGroup.id.replace("subtask-", "")
                  : taskGroup.id.replace("task-", "");
               
               const realTime = await getRealExecutedTime(realTaskId, taskGroup.type, day.dateStr);
               executedTimes[taskGroup.id][day.dateStr] = realTime;
               }
            } else {
               executedTimes[taskGroup.id][day.dateStr] = 0;
            }
         }
      }

      setExecutedTimeData(executedTimes);
   }

   // Función para precalcular trabajo fuera de cronograma
   async function calculateOffScheduleWork(ganttData: any[]) {
      const offScheduleWork: Record<string, Record<string, number>> = {};

      for (const taskGroup of ganttData) {
         const taskOffSchedule = await getOffScheduleWork(taskGroup);
         offScheduleWork[taskGroup.id] = taskOffSchedule;
      }

      setOffScheduleWorkData(offScheduleWork);
   }

   // ✅ ACTUALIZADA: Función para obtener tiempo real ejecutado usando work_sessions primero
   async function getRealExecutedTime(taskId: string, taskType: "task" | "subtask", dateStr: string): Promise<number> {
      try {
         // ✅ NUEVO: Primero intentar obtener desde work_sessions
         const { data: assignmentData, error: assignmentError } = await supabase
            .from("task_work_assignments")
            .select("id")
            .eq("user_id", user!.id)
            .eq("date", dateStr)
            .eq("task_type", taskType)
            .eq(taskType === "subtask" ? "subtask_id" : "task_id", taskId)
            .single();

         if (!assignmentError && assignmentData) {
            // Obtener sesiones de trabajo para esta asignación
            const { data: workSessions, error: sessionsError } = await supabase
               .from("work_sessions")
               .select("duration_minutes")
               .eq("assignment_id", assignmentData.id);

            if (!sessionsError && workSessions) {
               const totalFromSessions = workSessions.reduce((total, session) => {
                  return total + (session.duration_minutes || 0);
               }, 0);
               
               if (totalFromSessions > 0) {
                  return totalFromSessions;
               }
            }
         }

         // ✅ FALLBACK: Usar método anterior con status_history si no hay work_sessions
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
            totalMinutes = Math.max(totalMinutes, completedTime);
         }

         return totalMinutes;
      } catch (error) {
         console.error("Error getting real executed time:", error);
         return 0;
      }
   }

   // useEffect para cargar datos del Gantt cuando se activa la vista o cambia la semana
   useEffect(() => {
      if (activeTab === "gestion" && activeGestionSubTab === "gantt_semanal") {
         fetchGanttData();
      }
   }, [activeTab, activeGestionSubTab, selectedWeekDate]);

   useEffect(() => {
      if (activeTab === "gestion" && activeGestionSubTab === "actividades") {
         fetchAllWorkEvents();
      }
   }, [activeTab, activeGestionSubTab]);

   // useEffect para cargar avances cuando se activa la vista kanban
   useEffect(() => {
      if (activeTab === "gestion" && activeGestionSubTab === "en_proceso") {
         loadTaskProgressForKanban();
      }
   }, [activeTab, activeGestionSubTab, assignedTaskItems, delayedTaskItems, returnedTaskItems, completedTaskItems, inReviewTaskItems]);

   // useEffect para cerrar dropdowns al hacer clic fuera
   useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
         // Cerrar todos los dropdowns si se hace clic fuera
         const target = event.target as HTMLElement;
         if (!target.closest('.relative')) {
            setShowActionsDropdown({});
         }
      }

      document.addEventListener('mousedown', handleClickOutside);
      return () => {
         document.removeEventListener('mousedown', handleClickOutside);
      };
   }, []);

   return (
      <div className="bg-white rounded-lg shadow-md p-6">
         <div className="mb-6">
            <h1 className="text-2xl font-bold">{project?.name || "Cargando proyecto..."}</h1>
         </div>


         {/* Tabs */}
         <div className="border-b border-gray-200 mb-6">
            <div className="flex -mb-px gap-1">
               <button
                  className={`py-2.5 px-4 font-medium text-sm transition-colors duration-200 rounded-t-md ${activeTab === "asignacion" ? "border-b-2 border-amber-500 text-amber-600 bg-amber-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50/50"}`}
                  onClick={() => setActiveTab("asignacion")}
               >
                  Asignación
               </button>
               <button
                  className={`py-2.5 px-4 font-medium text-sm transition-colors duration-200 rounded-t-md ${activeTab === "gestion" ? "border-b-2 border-amber-500 text-amber-600 bg-amber-50/50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50/50"}`}
                  onClick={() => setActiveTab("gestion")}
               >
                  Gestión
               </button>
            </div>
         </div>

         {activeTab === "asignacion" && (
            <div>
               <div className="mb-4">
                  <h2 className="text-xl font-semibold text-gray-800">Listado de actividades para asignar</h2>
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

               {error && <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-md">{error}</div>}

               {/* Opciones de ordenamiento y filtros */}
               <div className="mb-4 p-3 bg-white rounded-md shadow-sm border border-gray-200">
                  <div className="flex flex-wrap items-center gap-4">
                     {availableProjects.length > 0 && (
                        <div>
                           <p className="text-sm font-medium text-gray-700 mb-1">Filtrar por proyecto:</p>
                           <select
                              value={selectedProjectFilter || ''}
                              onChange={(e) => setSelectedProjectFilter(e.target.value || null)}
                              className="p-2 border rounded-md text-sm"
                           >
                              <option value="">Todos los proyectos</option>
                              {availableProjects.map((p) => (
                                 <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                           </select>
                        </div>
                     )}
                     {phasesForProject.length > 0 && (
                        <div>
                           <p className="text-sm font-medium text-gray-700 mb-1">Filtrar por fase:</p>
                           <select
                              value={selectedPhaseFilter || ''}
                              onChange={(e) => setSelectedPhaseFilter(e.target.value || null)}
                              className="p-2 border rounded-md text-sm"
                           >
                              <option value="">Todas las fases</option>
                              {phasesForProject.map((p) => (
                                 <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                              <option value="__no_phase__">Sin fase</option>
                           </select>
                        </div>
                     )}
                     <div>
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
                  </div>
               </div>

               {/* Task list container */}
               <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden mb-6">
                  {/* Task list header */}
                  <div className="grid grid-cols-6 gap-4 p-3 border-b-2 border-gray-300 font-medium text-gray-700 bg-gray-50">
                     <div className="text-center">#</div>
                     <div>PROYECTO</div>
                     <div>ACTIVIDAD</div>
                     <div>DESCRIPCION</div>
                     <div>INICIO</div>
                     <div>FIN</div>
                  </div>

                  {/* Task list */}
                  <div className="divide-y divide-gray-200">
                     {loading || isFiltering ? (
                        <div className="py-8 px-4 animate-pulse space-y-3">
                           {[...Array(5)].map((_, i) => (
                              <div key={i} className="h-14 bg-gray-200 rounded w-full" />
                           ))}
                        </div>
                     ) : isDataInitialized && taskItems.length > 0 ? (
                        (() => {
                           let filtered = taskItems;
                           if (selectedProjectFilter) {
                              filtered = filtered.filter((t) => t.project_id === selectedProjectFilter);
                           }
                           if (selectedPhaseFilter) {
                              filtered = selectedPhaseFilter === "__no_phase__"
                                 ? filtered.filter((t) => !t.phase_id)
                                 : filtered.filter((t) => t.phase_id === selectedPhaseFilter);
                           }
                           return filtered.map((task) => (
                           <div key={task.id} className="grid grid-cols-6 gap-4 py-3 items-center bg-white hover:bg-gray-50 px-3">
                              <div className="text-center">
                                 <input type="checkbox" checked={selectedTasks.includes(task.id)} onChange={() => handleTaskSelection(task.id)} className="h-5 w-5 text-yellow-500 rounded border-gray-300 focus:ring-yellow-500" />
                              </div>
                              <div className="text-sm text-gray-700 py-1 flex flex-wrap items-center gap-1">
                                 {(() => {
                                    const { bg, text } = getProjectColor(task.projectName || "Sin proyecto", task.project_id);
                                    return <span className={`inline-block px-3 py-1 ${bg} ${text} font-semibold rounded-full shadow-sm`}>{task.projectName || "Sin proyecto"}</span>;
                                 })()}
                                 <PhaseBadge phaseName={phasesForProject.find(p => p.id === task.phase_id)?.name} />
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
                        ));
                        })()
                     ) : (
                        <div className="py-8 text-center bg-white">
                           <p className="text-gray-500 mb-2">No hay tareas disponibles para asignar.</p>
                           <p className="text-sm text-gray-400">{error ? error : "Todas las tareas ya están asignadas o no hay tareas pendientes en este proyecto."}</p>
                           <pre className="mt-2 text-xs text-left bg-gray-100 p-2 rounded max-w-md mx-auto overflow-auto">
                              Estado de inicialización: {isDataInitialized ? "Completada" : "Pendiente"}
                              {"\n"}Estado de carga: {loading ? "Cargando" : "Completado"}
                              {"\n"}Error: {error || "Ninguno"}
                              {"\n"}Tareas cargadas: {taskItems.length}
                           </pre>
                        </div>
                     )}
                  </div>
               </div>

               {/* Footer with total duration and save button */}
               <div className="mt-6 p-4 bg-white rounded-md shadow-sm border border-gray-200 flex justify-between items-center">
                  <div className="text-sm">
                     <p className="text-gray-600">DURACIÓN TOTAL DEL DÍA</p>
                     <p className="text-xs text-gray-500">Tareas seleccionadas</p>
                     <p className="font-bold text-lg mt-1">
                        {selectedTasks.length > 0 && showDurationInputs 
                           ? `${calculateTotalCustomDuration().toFixed(1)} HORA${calculateTotalCustomDuration() !== 1 ? "S" : ""}`
                           : `${totalEstimatedDuration} HORA${totalEstimatedDuration !== 1 ? "S" : ""}`
                        }
                     </p>
                  </div>
                  <div className="flex gap-3">
                     <button
                        onClick={handleShowConfirmModal}
                        disabled={selectedTasks.length === 0 || saving}
                        className="bg-yellow-500 text-white px-6 py-2 rounded-md font-medium 
                           hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 
                           disabled:bg-gray-400 disabled:cursor-not-allowed">
                        {saving ? "GUARDANDO..." : "GUARDAR SELECCIÓN"}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {activeTab === "gestion" && (
            <div>
               <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="min-w-0">
                     <h2 className="text-xl font-semibold text-gray-800">Gestión de tareas asignadas</h2>
                     <p className="text-sm text-gray-500 mt-0.5">Administra las tareas que has asignado para trabajar</p>
                     
                     {/* Disclaimer colapsable */}
                     <div className="mt-3 rounded-lg overflow-hidden border border-amber-200/80 bg-amber-50/80">
                        <button
                           onClick={() => setDisclaimerCollapsed(!disclaimerCollapsed)}
                           className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-amber-800 hover:bg-amber-100/50 transition-colors"
                        >
                           <span className="flex items-center gap-2">
                              <svg className="h-4 w-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                 <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92z" clipRule="evenodd" />
                              </svg>
                              <span className="font-medium">Importante: reporte de avance antes de las 12:00 PM</span>
                           </span>
                           <svg className={`w-4 h-4 text-amber-600 transition-transform flex-shrink-0 ${disclaimerCollapsed ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                           </svg>
                        </button>
                        {!disclaimerCollapsed && (
                           <div className="px-3 pb-3 pt-0 text-sm text-amber-800/90 border-t border-amber-200/60">
                              Si antes de las 12:00 PM del día actual no reportas avance o completado, el bloque aparecerá como incumplido aunque lo completes después.
                           </div>
                        )}
                     </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-3">
                     {availableProjects.length > 0 && (
                        <div className="flex items-center gap-2">
                           <label htmlFor="gestion-project-filter" className="text-sm font-medium text-gray-700">Filtrar por proyecto:</label>
                           <select
                              id="gestion-project-filter"
                              value={selectedProjectFilter || ''}
                              onChange={(e) => setSelectedProjectFilter(e.target.value || null)}
                              className="p-2 border border-gray-300 rounded-lg text-sm bg-white"
                           >
                              <option value="">Todos los proyectos</option>
                              {availableProjects.map((p) => (
                                 <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                           </select>
                        </div>
                     )}
                     <button
                        onClick={() => setShowEventsModal(true)}
                        className="bg-gradient-to-r from-violet-500 to-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium shadow-md hover:shadow-lg hover:from-violet-600 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:ring-offset-2 transition-all duration-200 flex items-center gap-2"
                     >
                        <span className="opacity-90">+</span> Crear actividad adicional
                     </button>
                  </div>
               </div>

               {/* Sub pestañas para gestión */}
               <div className="mb-6 bg-white rounded-lg border border-gray-200/80 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                     <div className="flex min-w-max border-b border-gray-200 -mb-px px-2">
                        <button className={`py-3 px-4 text-sm font-medium flex items-center whitespace-nowrap transition-colors ${activeGestionSubTab === "en_proceso" ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500 hover:text-gray-700"}`} onClick={() => setActiveGestionSubTab("en_proceso")}>
                           En proceso
                           <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-600 font-medium">{(filteredReturnedTaskItems.length + filteredDelayedTaskItems.length + filteredAssignedTaskItems.length + filteredCompletedTaskItems.length + filteredInReviewTaskItems.length).toString()}</span>
                        </button>
                        <button className={`py-3 px-4 text-sm font-medium flex items-center whitespace-nowrap transition-colors ${activeGestionSubTab === "gantt_semanal" ? "border-b-2 border-violet-500 text-violet-600" : "text-gray-500 hover:text-gray-700"}`} onClick={() => setActiveGestionSubTab("gantt_semanal")}>
                           Gantt semanal
                        </button>
                        <button className={`py-3 px-4 text-sm font-medium flex items-center whitespace-nowrap transition-colors ${activeGestionSubTab === "bloqueadas" ? "border-b-2 border-red-500 text-red-600" : "text-gray-500 hover:text-gray-700"}`} onClick={() => setActiveGestionSubTab("bloqueadas")}>
                           Bloqueadas
                           <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-600 font-medium">{filteredBlockedTaskItems.length}</span>
                        </button>
                        <button className={`py-3 px-4 text-sm font-medium flex items-center whitespace-nowrap transition-colors ${activeGestionSubTab === "actividades" ? "border-b-2 border-violet-500 text-violet-600" : "text-gray-500 hover:text-gray-700"}`} onClick={() => setActiveGestionSubTab("actividades")}>
                           Actividades
                           <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-violet-100 text-violet-600 font-medium">{workEvents.length}</span>
                        </button>
                        <button className={`py-3 px-4 text-sm font-medium flex items-center whitespace-nowrap transition-colors ${activeGestionSubTab === "aprobadas" ? "border-b-2 border-green-500 text-green-600" : "text-gray-500 hover:text-gray-700"}`} onClick={() => setActiveGestionSubTab("aprobadas")}>
                           Aprobadas
                           <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-600 font-medium">{filteredApprovedTaskItems.length}</span>
                        </button>
                     </div>
                  </div>
               </div>

               {/* Vista En Proceso (Kanban) */}
               {activeGestionSubTab === "en_proceso" && (
                  <div className="space-y-6">
                     <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        {/* Columna Asignada para trabajo */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                           <div className="p-4 border-b border-gray-200 bg-purple-50">
                              <h3 className="font-semibold text-purple-700 flex items-center">
                                 <div className="w-3 h-3 bg-purple-500 rounded-full mr-2"></div>
                                 Asignada para trabajo
                                 <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-600">
                                    {(filteredAssignedTaskItems.filter(task => !taskProgress[task.id] || taskProgress[task.id].length === 0).length + filteredDelayedTaskItems.filter(task => !taskProgress[task.id] || taskProgress[task.id].length === 0).length)}
                                 </span>
                              </h3>
                           </div>
                           <div className="p-3 space-y-2 h-screen overflow-y-auto">
                              {/* Tareas retrasadas sin avances */}
                              {filteredDelayedTaskItems.filter(task => !taskProgress[task.id] || taskProgress[task.id].length === 0).map((task) => {
                                 const { bg, text } = getProjectColor(task.projectName || "Sin proyecto", task.project_id);
                                 return (
                                    <div key={`delayed-assigned-${task.id}`} className="bg-red-50 border border-red-200 rounded-lg p-3 hover:shadow-sm transition-shadow">
                                       <div className="flex items-start justify-between">
                                          <div className="flex-1 min-w-0">
                                             {/* Proyecto */}
                                             <div className="mb-2 flex flex-wrap items-center gap-1">
                                                <span className={`inline-block px-2 py-0.5 text-xs ${bg} ${text} font-semibold rounded-full`}>
                                                   {task.projectName || "Sin proyecto"}
                                                </span>
                                                <PhaseBadge phaseName={phasesForProject.find(p => p.id === task.phase_id)?.name} />
                                             </div>
                                             
                                             {/* Tarea principal si es subtarea */}
                                             {task.type === "subtask" && (
                                                <div className="text-xs text-gray-600 mb-1">
                                                   <span className="font-medium">T.P:</span> {task.subtask_title || "Sin tarea principal"}
                                                </div>
                                             )}
                                             
                                             {/* Título clickeable */}
                                             <h4 
                                                className="text-sm font-medium text-gray-900  cursor-pointer hover:text-red-600 transition-colors" 
                                                onClick={() => handleViewTaskDetails(task)}
                                             >
                                                {task.title}
                                             </h4>
                                             
                                             <div className="flex items-center gap-2 mt-1">
                                                <p className="text-xs text-red-600 font-medium">🔥 URGENTE</p>
                                                <p className="text-xs text-gray-500">{Math.round((task.estimated_duration / 60) * 100) / 100}h</p>
                                             </div>
                                          </div>
                                          <div className="relative ml-2">
                                             <button
                                                onClick={() => setShowActionsDropdown(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                                                className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 transition-colors flex items-center gap-1"
                                             >
                                                Actualizar
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                   <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                             </button>
                                             
                                             {showActionsDropdown[task.id] && (
                                                <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                                                   <button
                                                      onClick={() => handleOpenStatusModal(task.id, "progress")}
                                                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2"
                                                   >
                                                      📝 Reportar Avance
                                                   </button>
                                                   <button
                                                      onClick={() => handleOpenStatusModal(task.id, "complete")}
                                                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-green-50 hover:text-green-600 flex items-center gap-2"
                                                   >
                                                      ✅ Completar
                                                   </button>
                                                   <button
                                                      onClick={() => handleOpenStatusModal(task.id, "block")}
                                                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-red-50 hover:text-red-600 flex items-center gap-2"
                                                   >
                                                      🚫 Bloquear
                                                   </button>
                                                   <div className="border-t border-gray-200 my-1"></div>
                                                   <button
                                                      onClick={() => handleShowUnassignConfirmModal(task.id)}
                                                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 hover:text-gray-600 flex items-center gap-2"
                                                   >
                                                      🗑️ Desasignar
                                                   </button>
                                                </div>
                                             )}
                                          </div>
                                       </div>
                                    </div>
                                 );
                              })}
                              
                              {/* Tareas asignadas normales sin avances */}
                              {filteredAssignedTaskItems.filter(task => !taskProgress[task.id] || taskProgress[task.id].length === 0).map((task) => {
                                 const { bg, text } = getProjectColor(task.projectName || "Sin proyecto", task.project_id);
                                 return (
                                    <div key={`assigned-normal-${task.id}`} className="bg-purple-50 border border-purple-200 rounded-lg p-3 hover:shadow-sm transition-shadow">
                                       <div className="flex items-start justify-between">
                                          <div className="flex-1 min-w-0">
                                             {/* Proyecto */}
                                             <div className="mb-2 flex flex-wrap items-center gap-1">
                                                <span className={`inline-block px-2 py-0.5 text-xs ${bg} ${text} font-semibold rounded-full`}>
                                                   {task.projectName || "Sin proyecto"}
                                                </span>
                                                <PhaseBadge phaseName={phasesForProject.find(p => p.id === task.phase_id)?.name} />
                                             </div>
                                             
                                             {/* Tarea principal si es subtarea */}
                                             {task.type === "subtask" && (
                                                <div className="text-xs text-gray-600 mb-1">
                                                   <span className="font-medium">T.P:</span> {task.subtask_title || "Sin tarea principal"}
                                                </div>
                                             )}
                                             
                                             {/* Título clickeable */}
                                             <h4 
                                                className="text-sm font-medium text-gray-900  cursor-pointer hover:text-purple-600 transition-colors" 
                                                onClick={() => handleViewTaskDetails(task)}
                                             >
                                                {task.title}
                                             </h4>
                                             
                                             <div className="flex items-center gap-2 mt-1">
                                                <p className="text-xs text-purple-600">📋 Lista para trabajar</p>
                                                <p className="text-xs text-gray-500">{Math.round((task.estimated_duration / 60) * 100) / 100}h</p>
                                             </div>
                                          </div>
                                          <div className="relative ml-2">
                                             <button
                                                onClick={() => setShowActionsDropdown(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                                                className="text-xs bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700 transition-colors flex items-center gap-1"
                                             >
                                                Actualizar
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                   <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                             </button>
                                             
                                             {showActionsDropdown[task.id] && (
                                                <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                                                   <button
                                                      onClick={() => handleOpenStatusModal(task.id, "progress")}
                                                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2"
                                                   >
                                                      📝 Reportar Avance
                                                   </button>
                                                   <button
                                                      onClick={() => handleOpenStatusModal(task.id, "complete")}
                                                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-green-50 hover:text-green-600 flex items-center gap-2"
                                                   >
                                                      ✅ Completar
                                                   </button>
                                                   <button
                                                      onClick={() => handleOpenStatusModal(task.id, "block")}
                                                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-red-50 hover:text-red-600 flex items-center gap-2"
                                                   >
                                                      🚫 Bloquear
                                                   </button>
                                                   <div className="border-t border-gray-200 my-1"></div>
                                                   <button
                                                      onClick={() => handleShowUnassignConfirmModal(task.id)}
                                                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 hover:text-gray-600 flex items-center gap-2"
                                                   >
                                                      🗑️ Desasignar
                                                   </button>
                                                </div>
                                             )}
                                          </div>
                                       </div>
                                    </div>
                                 );
                              })}
                              
                              {(filteredAssignedTaskItems.filter(task => !taskProgress[task.id] || taskProgress[task.id].length === 0).length + filteredDelayedTaskItems.filter(task => !taskProgress[task.id] || taskProgress[task.id].length === 0).length) === 0 && (
                                 <div className="text-center py-8 text-gray-500 text-sm">
                                    No hay tareas asignadas para trabajo
                                 </div>
                              )}
                           </div>
                        </div>

                        {/* Columna En Proceso */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                           <div className="p-4 border-b border-gray-200 bg-blue-50">
                              <h3 className="font-semibold text-blue-700 flex items-center">
                                 <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
                                 En Proceso
                                 <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-600">
                                    {(filteredReturnedTaskItems.length + filteredDelayedTaskItems.filter(task => taskProgress[task.id] && taskProgress[task.id].length > 0).length + filteredAssignedTaskItems.filter(task => taskProgress[task.id] && taskProgress[task.id].length > 0).length)}
                                 </span>
                              </h3>
                           </div>
                           <div className="p-3 space-y-2 h-screen overflow-y-auto">
                              {/* Tareas devueltas (prioridad) */}
                              {filteredReturnedTaskItems.map((task) => {
                                 const { bg, text } = getProjectColor(task.projectName || "Sin proyecto", task.project_id);
                                 return (
                                    <div key={`returned-${task.id}`} className="bg-orange-50 border border-orange-200 rounded-lg p-3 hover:shadow-sm transition-shadow">
                                       <div className="flex items-start justify-between">
                                          <div className="flex-1 min-w-0">
                                             {/* Proyecto */}
                                             <div className="mb-2 flex flex-wrap items-center gap-1">
                                                <span className={`inline-block px-2 py-0.5 text-xs ${bg} ${text} font-semibold rounded-full`}>
                                                   {task.projectName || "Sin proyecto"}
                                                </span>
                                                <PhaseBadge phaseName={phasesForProject.find(p => p.id === task.phase_id)?.name} />
                                             </div>

                                             {/* Tarea principal si es subtarea */}
                                             {task.type === "subtask" && (
                                                <div className="text-xs text-gray-600 mb-1">
                                                   <span className="font-medium">T.P:</span> {task.subtask_title || "Sin tarea principal"}
                              </div>
                                             )}
                                             
                                             {/* Título clickeable */}
                                             <h4 
                                                className="text-sm font-medium text-gray-900  cursor-pointer hover:text-orange-600 transition-colors" 
                                                onClick={() => handleViewTaskDetails(task)}
                                             >
                                                {task.title}
                                             </h4>
                                             
                                             <div className="flex items-center gap-2 mt-1">
                                                <p className="text-xs text-orange-600 font-medium">⚠️ DEVUELTA</p>
                                                <p className="text-xs text-gray-500">{Math.round((task.estimated_duration / 60) * 100) / 100}h</p>
                                                {taskProgress[task.id] && taskProgress[task.id].length > 0 && (
                                                   <button
                                                      onClick={() => handleShowProgress(task.id)}
                                                      className="text-xs bg-blue-100 text-blue-600 px-1 rounded flex items-center gap-1 hover:bg-blue-200"
                                                      title={`${taskProgress[task.id].length} avance(s) registrado(s)`}
                                                   >
                                                      📊 {taskProgress[task.id].length}
                                                   </button>
                                                )}
                                             </div>
                                          </div>
                                          <div className="ml-2 flex flex-col space-y-1">
                                             <button
                                                onClick={() => handleViewReturnedFeedback(task)}
                                                className="text-xs bg-orange-600 text-white px-2 py-1 rounded hover:bg-orange-700 transition-colors"
                                             >
                                                Ver Feedback
                                             </button>
                                             <div className="relative">
                                                <button
                                                   onClick={() => setShowActionsDropdown(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                                                   className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                                                >
                                                   Actualizar
                                                   <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                   </svg>
                                                </button>
                                                
                                                {showActionsDropdown[task.id] && (
                                                   <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                                                      <button
                                                         onClick={() => handleOpenStatusModal(task.id, "progress")}
                                                         className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2"
                                                      >
                                                         📝 Reportar Avance
                                                      </button>
                                                      <button
                                                         onClick={() => handleOpenStatusModal(task.id, "complete")}
                                                         className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-green-50 hover:text-green-600 flex items-center gap-2"
                                                      >
                                                         ✅ Completar
                                                      </button>
                                                      <button
                                                         onClick={() => handleOpenStatusModal(task.id, "block")}
                                                         className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-red-50 hover:text-red-600 flex items-center gap-2"
                                                      >
                                                         🚫 Bloquear
                                                      </button>
                                                   </div>
                                                )}
                                             </div>
                                          </div>
                                       </div>
                                    </div>
                                 );
                              })}
                              
                              {/* Tareas retrasadas con avances */}
                              {filteredDelayedTaskItems.filter(task => taskProgress[task.id] && taskProgress[task.id].length > 0).map((task) => {
                                 const { bg, text } = getProjectColor(task.projectName || "Sin proyecto", task.project_id);
                                 return (
                                    <div key={`delayed-progress-${task.id}`} className="bg-red-50 border border-red-200 rounded-lg p-3 hover:shadow-sm transition-shadow">
                                       <div className="flex items-start justify-between">
                                          <div className="flex-1 min-w-0">
                                             {/* Proyecto */}
                                             <div className="mb-2 flex flex-wrap items-center gap-1">
                                                <span className={`inline-block px-2 py-0.5 text-xs ${bg} ${text} font-semibold rounded-full`}>
                                                   {task.projectName || "Sin proyecto"}
                                                </span>
                                                <PhaseBadge phaseName={phasesForProject.find(p => p.id === task.phase_id)?.name} />
                                             </div>
                                             
                                             {/* Tarea principal si es subtarea */}
                                             {task.type === "subtask" && (
                                                <div className="text-xs text-gray-600 mb-1">
                                                   <span className="font-medium">T.P:</span> {task.subtask_title || "Sin tarea principal"}
                                                </div>
                                             )}
                                             
                                             {/* Título clickeable */}
                                             <h4 
                                                className="text-sm font-medium text-gray-900  cursor-pointer hover:text-red-600 transition-colors" 
                                                onClick={() => handleViewTaskDetails(task)}
                                             >
                                                {task.title}
                                             </h4>
                                             
                                             <div className="flex items-center gap-2 mt-1">
                                                <p className="text-xs text-red-600 font-medium">🔥 URGENTE</p>
                                                <p className="text-xs text-gray-500">{Math.round((task.estimated_duration / 60) * 100) / 100}h</p>
                                                {taskProgress[task.id] && taskProgress[task.id].length > 0 && (
                                                   <button
                                                      onClick={() => handleShowProgress(task.id)}
                                                      className="text-xs bg-blue-100 text-blue-600 px-1 rounded flex items-center gap-1 hover:bg-blue-200"
                                                      title={`${taskProgress[task.id].length} avance(s) registrado(s)`}
                                                   >
                                                      📊 {taskProgress[task.id].length}
                                                   </button>
                                                )}
                                             </div>
                                          </div>
                                          <div className="relative ml-2">
                                             <button
                                                onClick={() => setShowActionsDropdown(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                                                className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 transition-colors flex items-center gap-1"
                                             >
                                                Actualizar
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                   <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                             </button>
                                             
                                             {showActionsDropdown[task.id] && (
                                                <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                                                   <button
                                                      onClick={() => handleOpenStatusModal(task.id, "progress")}
                                                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2"
                                                   >
                                                      📝 Reportar Avance
                                                   </button>
                                                   <button
                                                      onClick={() => handleOpenStatusModal(task.id, "complete")}
                                                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-green-50 hover:text-green-600 flex items-center gap-2"
                                                   >
                                                      ✅ Completar
                                                   </button>
                                                   <button
                                                      onClick={() => handleOpenStatusModal(task.id, "block")}
                                                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-red-50 hover:text-red-600 flex items-center gap-2"
                                                   >
                                                      🚫 Bloquear
                                                   </button>
                                                </div>
                                             )}
                                          </div>
                                       </div>
                                    </div>
                                 );
                              })}
                              
                              {/* Tareas asignadas normales con avances */}
                              {filteredAssignedTaskItems.filter(task => taskProgress[task.id] && taskProgress[task.id].length > 0).map((task) => {
                                 const { bg, text } = getProjectColor(task.projectName || "Sin proyecto", task.project_id);
                                 return (
                                    <div key={`assigned-progress-${task.id}`} className="bg-blue-50 border border-blue-200 rounded-lg p-3 hover:shadow-sm transition-shadow">
                                       <div className="flex items-start justify-between">
                                          <div className="flex-1 min-w-0">
                                             {/* Proyecto */}
                                             <div className="mb-2 flex flex-wrap items-center gap-1">
                                                <span className={`inline-block px-2 py-0.5 text-xs ${bg} ${text} font-semibold rounded-full`}>
                                                   {task.projectName || "Sin proyecto"}
                                                </span>
                                                <PhaseBadge phaseName={phasesForProject.find(p => p.id === task.phase_id)?.name} />
                                             </div>
                                             
                                             {/* Tarea principal si es subtarea */}
                                             {task.type === "subtask" && (
                                                <div className="text-xs text-gray-600 mb-1">
                                                   <span className="font-medium">T.P:</span> {task.subtask_title || "Sin tarea principal"}
                                                </div>
                                             )}
                                             
                                             {/* Título clickeable */}
                                             <h4 
                                                className="text-sm font-medium text-gray-900  cursor-pointer hover:text-blue-600 transition-colors" 
                                                onClick={() => handleViewTaskDetails(task)}
                                             >
                                                {task.title}
                                             </h4>
                                             
                                             <div className="flex items-center gap-2 mt-1">
                                                <p className="text-xs text-blue-600">⚡ Con avances</p>
                                                <p className="text-xs text-gray-500">{Math.round((task.estimated_duration / 60) * 100) / 100}h</p>
                                                {taskProgress[task.id] && taskProgress[task.id].length > 0 && (
                                                   <button
                                                      onClick={() => handleShowProgress(task.id)}
                                                      className="text-xs bg-blue-100 text-blue-600 px-1 rounded flex items-center gap-1 hover:bg-blue-200"
                                                      title={`${taskProgress[task.id].length} avance(s) registrado(s)`}
                                                   >
                                                      📊 {taskProgress[task.id].length}
                                                   </button>
                                                )}
                                             </div>
                                          </div>
                                          <div className="relative ml-2">
                                             <button
                                                onClick={() => setShowActionsDropdown(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                                                className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                                             >
                                                Actualizar
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                   <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                             </button>
                                             
                                             {showActionsDropdown[task.id] && (
                                                <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                                                   <button
                                                      onClick={() => handleOpenStatusModal(task.id, "progress")}
                                                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2"
                                                   >
                                                      📝 Reportar Avance
                                                   </button>
                                                   <button
                                                      onClick={() => handleOpenStatusModal(task.id, "complete")}
                                                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-green-50 hover:text-green-600 flex items-center gap-2"
                                                   >
                                                      ✅ Completar
                                                   </button>
                                                   <button
                                                      onClick={() => handleOpenStatusModal(task.id, "block")}
                                                      className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-red-50 hover:text-red-600 flex items-center gap-2"
                                                   >
                                                      🚫 Bloquear
                                                   </button>
                                                </div>
                                             )}
                                          </div>
                                       </div>
                                    </div>
                                 );
                              })}
                              
                              {(filteredReturnedTaskItems.length + filteredDelayedTaskItems.filter(task => taskProgress[task.id] && taskProgress[task.id].length > 0).length + filteredAssignedTaskItems.filter(task => taskProgress[task.id] && taskProgress[task.id].length > 0).length) === 0 && (
                                 <div className="text-center py-8 text-gray-500 text-sm">
                                    No hay tareas con avances reportados
                                 </div>
                              )}
                                       </div>
                                       </div>

                        {/* Columna Entregadas */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                           <div className="p-4 border-b border-gray-200 bg-gray-50">
                              <h3 className="font-semibold text-gray-700 flex items-center">
                                 <div className="w-3 h-3 bg-gray-500 rounded-full mr-2"></div>
                                 Entregadas
                                 <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                                    {filteredCompletedTaskItems.length}
                                 </span>
                              </h3>
                                       </div>
                           <div className="p-3 space-y-2 h-screen overflow-y-auto">
                              {filteredCompletedTaskItems.map((task) => {
                                 const { bg, text } = getProjectColor(task.projectName || "Sin proyecto", task.project_id);
                                 return (
                                    <div key={`completed-${task.id}`} className="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:shadow-sm transition-shadow">
                                       <div className="flex items-start justify-between">
                                          <div className="flex-1 min-w-0">
                                             {/* Proyecto */}
                                             <div className="mb-2 flex flex-wrap items-center gap-1">
                                                <span className={`inline-block px-2 py-0.5 text-xs ${bg} ${text} font-semibold rounded-full`}>
                                                   {task.projectName || "Sin proyecto"}
                                                </span>
                                                <PhaseBadge phaseName={phasesForProject.find(p => p.id === task.phase_id)?.name} />
                                             </div>
                                             
                                             {/* Tarea principal si es subtarea */}
                                             {task.type === "subtask" && (
                                                <div className="text-xs text-gray-600 mb-1">
                                                   <span className="font-medium">T.P:</span> {task.subtask_title || "Sin tarea principal"}
                                    </div>
                                             )}
                                             
                                             {/* Título clickeable */}
                                             <h4 
                                                className="text-sm font-medium text-gray-900  cursor-pointer hover:text-gray-600 transition-colors" 
                                                onClick={() => handleViewTaskDetails(task)}
                                             >
                                                {task.title}
                                             </h4>
                                             
                                             <div className="flex items-center gap-2 mt-1">
                                                <p className="text-xs text-gray-600">{Math.round((task.estimated_duration / 60) * 100) / 100}h</p>
                                                {taskProgress[task.id] && taskProgress[task.id].length > 0 && (
                                                   <button
                                                      onClick={() => handleShowProgress(task.id)}
                                                      className="text-xs bg-blue-100 text-blue-600 px-1 rounded flex items-center gap-1 hover:bg-blue-200"
                                                      title={`${taskProgress[task.id].length} avance(s) registrado(s)`}
                                                   >
                                                      📊 {taskProgress[task.id].length}
                                                   </button>
                                                )}
                                             </div>
                                          </div>
                                          <div className="flex gap-1 ml-2">
                                             <button
                                                onClick={() => handleOpenStatusModal(task.id, "complete")}
                                                className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition-colors"
                                                title="Editar entregables o corregir tiempo reportado"
                                             >
                                                Editar
                                             </button>
                                             <button
                                                onClick={() => handleViewTaskDetails(task)}
                                                className="text-xs bg-gray-600 text-white px-2 py-1 rounded hover:bg-gray-700 transition-colors"
                                             >
                                                Ver
                                             </button>
                                          </div>
                           </div>
                        </div>
                                 );
                              })}
                              
                              {filteredCompletedTaskItems.length === 0 && (
                                 <div className="text-center py-8 text-gray-500 text-sm">
                                    No hay tareas entregadas
                           </div>
                              )}
                           </div>
                              </div>

                        {/* Columna En Revisión */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                           <div className="p-4 border-b border-gray-200 bg-yellow-50">
                              <h3 className="font-semibold text-yellow-700 flex items-center">
                                 <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
                                 En Revisión
                                 <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-600">
                                    {filteredInReviewTaskItems.length}
                                 </span>
                              </h3>
                           </div>
                           <div className="p-3 space-y-2 h-screen overflow-y-auto">
                              {filteredInReviewTaskItems.map((task) => {
                                                const { bg, text } = getProjectColor(task.projectName || "Sin proyecto", task.project_id);
                                 return (
                                    <div key={`review-${task.id}`} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 hover:shadow-sm transition-shadow">
                                       <div className="flex items-start justify-between">
                                          <div className="flex-1 min-w-0">
                                             {/* Proyecto */}
                                             <div className="mb-2 flex flex-wrap items-center gap-1">
                                                <span className={`inline-block px-2 py-0.5 text-xs ${bg} ${text} font-semibold rounded-full`}>
                                                   {task.projectName || "Sin proyecto"}
                                                </span>
                                                <PhaseBadge phaseName={phasesForProject.find(p => p.id === task.phase_id)?.name} />
                                             </div>

                                             {/* Tarea principal si es subtarea */}
                                             {task.type === "subtask" && (
                                                <div className="text-xs text-gray-600 mb-1">
                                                   <span className="font-medium">T.P:</span> {task.subtask_title || "Sin tarea principal"}
                                                   </div>
                                             )}
                                             
                                             {/* Título clickeable */}
                                             <h4 
                                                className="text-sm font-medium text-gray-900  cursor-pointer hover:text-yellow-600 transition-colors" 
                                                onClick={() => handleViewTaskDetails(task)}
                                             >
                                                      {task.title}
                                             </h4>
                                             
                                                                                          <div className="flex items-center gap-2 mt-1">
                                                <p className="text-xs text-yellow-600">🔍 En revisión</p>
                                                <p className="text-xs text-gray-600">{Math.round((task.estimated_duration / 60) * 100) / 100}h</p>
                                                {taskProgress[task.id] && taskProgress[task.id].length > 0 && (
                                                   <button
                                                      onClick={() => handleShowProgress(task.id)}
                                                      className="text-xs bg-blue-100 text-blue-600 px-1 rounded flex items-center gap-1 hover:bg-blue-200"
                                                      title={`${taskProgress[task.id].length} avance(s) registrado(s)`}
                                                   >
                                                      📊 {taskProgress[task.id].length}
                                                   </button>
                                                )}
                                             </div>
                                                   </div>
                                          <button
                                             onClick={() => handleViewTaskDetails(task)}
                                             className="ml-2 text-xs bg-yellow-600 text-white px-2 py-1 rounded hover:bg-yellow-700 transition-colors"
                                          >
                                             Ver
                                          </button>
                                                </div>
                                                   </div>
                                 );
                              })}
                              
                              {filteredInReviewTaskItems.length === 0 && (
                                 <div className="text-center py-8 text-gray-500 text-sm">
                                    No hay tareas en revisión
                                                </div>
                                             )}
                                          </div>
                                          </div>
                        </div>
                     </div>
                                    )}

               {/* Vista Gantt Semanal */}
               {activeGestionSubTab === "gantt_semanal" && (
                  <div className="mb-6">
                     <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex justify-between items-center mb-6">
                           <div className="flex items-center gap-4">
                              <h4 className="font-medium text-gray-800">📈 Gantt Semanal</h4>
                              <div className="flex items-center gap-2">
                                 <button
                                    onClick={goToPreviousWeek}
                                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                                    title="Semana anterior"
                                 >
                                    ⬅️
                                 </button>
                                 <div className="text-sm font-medium text-gray-700 px-3 py-1 bg-gray-100 rounded-lg">
                                    {getWeekRange(selectedWeekDate)}
                                 </div>
                                 <button
                                    onClick={goToNextWeek}
                                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                                    title="Semana siguiente"
                                 >
                                    ➡️
                                 </button>
                                 <button
                                    onClick={goToCurrentWeek}
                                    className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 transition-colors ml-2"
                                    title="Ir a semana actual"
                                 >
                                    Hoy
                                 </button>
                              </div>
                           </div>
                           <div className="flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-2">
                                 <div className="w-4 h-4 bg-blue-200 border border-blue-400 rounded"></div>
                                 <span>Planificado</span>
                              </div>
                              <div className="flex items-center gap-2">
                                 <div className="w-4 h-4 bg-green-200 border border-green-400 rounded"></div>
                                 <span>Ejecutado</span>
                              </div>
                              <div className="flex items-center gap-2">
                                 <div className="w-4 h-4 bg-red-200 border border-red-400 rounded"></div>
                                 <span>Incumplimiento</span>
                              </div>
                              <div className="flex items-center gap-2">
                                 <div className="w-4 h-4 bg-orange-200 border border-orange-400 rounded"></div>
                                 <span>Fuera de cronograma</span>
                              </div>
                              <div className="flex items-center gap-2">
                                 <div className="w-4 h-4 bg-purple-200 border border-purple-400 rounded"></div>
                                 <span>Actividad adicional</span>
                              </div>
                        </div>
                     </div>

                        {ganttData.length > 0 ? (
                           <div className="overflow-x-auto">
                              <div className="min-w-[1000px]">
                                 {/* Header con días de la semana */}
                                 <div className="grid grid-cols-9 gap-2 mb-4">
                                    <div className="font-medium text-sm text-gray-700 p-1 min-h-[50px] flex items-center">Tareas</div>
                                    {getWeekDays(selectedWeekDate).map(day => (
                                       <div key={day.dateStr} className={`text-center p-1 text-sm min-h-[50px] flex flex-col justify-center relative ${
                                          day.isToday 
                                             ? 'bg-blue-100 text-blue-800 font-medium border-2 border-blue-400 rounded-lg' 
                                             : 'bg-gray-50 text-gray-700'
                                       }`}>
                                          {day.isToday && (
                                             <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1 rounded-full font-bold shadow-sm">
                                                HOY
                                             </div>
                                          )}
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
                                    const totalTaskHours = getWeekDays(selectedWeekDate).reduce((total, day) => {
                                       const sessions = taskGroup.sessions[day.dateStr] || [];
                                       const dayTotal = sessions.reduce((daySum: number, session: any) => {
                                          if (session.start_time && session.end_time) {
                                             const startDate = new Date(session.start_time);
                                             const endDate = new Date(session.end_time);
                                             const durationMinutes = Math.max(0, (endDate.getTime() - startDate.getTime()) / (1000 * 60));
                                             return daySum + durationMinutes;
                                          }
                                          return daySum;
                                       }, 0);
                                       return total + dayTotal;
                                    }, 0);

                                    return (
                                       <div key={taskGroup.id} className="grid grid-cols-9 gap-2 mb-3 border border-gray-200 rounded-lg">
                                          {/* Nombre de la tarea */}
                                          <div className={`p-2 font-medium text-sm border-r border-gray-200 min-h-[50px] ${
                                             taskGroup.type === "event" 
                                                ? "bg-purple-50 text-purple-800" 
                                                : "bg-gray-50 text-gray-800"
                                          }`}>
                                             <div 
                                                className={`font-medium mb-1 cursor-pointer transition-colors ${
                                                   taskGroup.type === "event"
                                                      ? "text-purple-900 hover:text-purple-600"
                                                      : "text-gray-900 hover:text-blue-600"
                                                }`}
                                                onClick={() => {
                                                   if (taskGroup.type === "event") {
                                                      // Para actividades adicionales, mostrar información básica
                                                      alert(`📅 Actividad Adicional\n\nTítulo: ${taskGroup.title}\nTipo: ${taskGroup.event_type}\nDescripción: ${taskGroup.description || "Sin descripción"}`);
                                                   } else {
                                                      // Crear objeto Task para el modal con datos completos
                                                      const taskForModal: Task = {
                                                         id: taskGroup.type === "subtask" ? taskGroup.id.replace("subtask-", "") : taskGroup.id.replace("task-", ""),
                                                         title: taskGroup.title,
                                                         description: taskGroup.description,
                                                         priority: taskGroup.priority as "low" | "medium" | "high",
                                                         estimated_duration: taskGroup.estimated_duration,
                                                         start_date: taskGroup.start_date,
                                                         deadline: taskGroup.deadline,
                                                         status: taskGroup.status,
                                                         is_sequential: taskGroup.is_sequential,
                                                         project_id: taskGroup.project_id,
                                                         projectName: taskGroup.project_name,
                                                         phase_id: taskGroup.phase_id ?? null,
                                                         type: taskGroup.type,
                                                         original_id: taskGroup.type === "subtask" ? taskGroup.id.replace("subtask-", "") : undefined,
                                                         subtask_title: taskGroup.parent_task_title
                                                      };
                                                      handleViewTaskDetails(taskForModal);
                                                   }
                                                }}
                                                title={taskGroup.type === "event" ? "Click para ver detalles de la actividad adicional" : "Click para ver detalles de la tarea"}
                                             >
                                                {taskGroup.type === "event" ? "📅 " : ""}{taskGroup.title}
                              </div>
                                             
                                             <div className={`text-xs ${taskGroup.type === "event" ? "text-purple-600" : "text-gray-500"}`}>
                                                {taskGroup.type === "subtask" ? "Subtarea" : 
                                                 taskGroup.type === "event" ? `Actividad (${taskGroup.event_type})` : 
                                                 "Tarea"}
                                    </div>

                                             {taskGroup.type === "subtask" && taskGroup.parent_task_title && (
                                                <div className="text-xs text-gray-500 mt-1">
                                                   T.P: {taskGroup.parent_task_title}
                                             </div>
                                                )}
                                             </div>

                                          {/* Celdas para cada día */}
                                          {getWeekDays(selectedWeekDate).map(day => {
                                             const sessions = taskGroup.sessions[day.dateStr] || [];
                                             const plannedSessions = sessions.filter((s: any) => s.start_time && s.end_time);
                                             const isNonCompliant = checkNonCompliance(taskGroup, day.dateStr);
                                             const offScheduleTime = offScheduleWorkData[taskGroup.id]?.[day.dateStr] || 0;
                                             const hasOffScheduleWork = offScheduleTime > 0;
                                             
                                             return (
                                                <div key={`${taskGroup.id}-${day.dateStr}`} className="p-1 min-h-[50px] border-r border-gray-200 last:border-r-0">
                                                   {/* Mostrar trabajo fuera de cronograma si corresponde */}
                                                   {hasOffScheduleWork && (
                                                      <div className="space-y-1 mb-1">
                                                         <div 
                                                            className="text-xs p-1 rounded border bg-orange-100 border-orange-300 relative"
                                                            title={`🕒 FUERA DE CRONOGRAMA: ${Math.round(offScheduleTime / 60 * 100) / 100}h trabajadas en día no planeado`}
                                                         >
                                                            <div className="absolute inset-0 bg-orange-200 opacity-60"></div>
                                                            <div className="relative z-10 text-orange-800 font-medium">
                                                               <div className="text-center">🕒 EXTRA</div>
                                                               <div className="text-center">{Math.round(offScheduleTime / 60 * 100) / 100}h</div>
                                                            </div>
                                                         </div>
                                                      </div>
                                                   )}
                                                   
                                                   {sessions.length > 0 ? (
                                                      <div className="space-y-1">
                                                         {/* Sesiones planificadas */}
                                                         {plannedSessions.map((session: any, idx: number) => {
                                                            const startTime = session.start_time ? new Date(session.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
                                                            const endTime = session.end_time ? new Date(session.end_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
                                                            
                                                            // Calcular duración real del rango de tiempo planificado
                                                            let plannedMinutes = 0;
                                                            if (session.start_time && session.end_time) {
                                                               const startDate = new Date(session.start_time);
                                                               const endDate = new Date(session.end_time);
                                                               plannedMinutes = Math.max(0, (endDate.getTime() - startDate.getTime()) / (1000 * 60));
                                                            }
                                                            
                                                            // Calcular tiempo ejecutado real para esta sesión (incluye tiempos extra)
                                                            const realExecutedTime = executedTimeData[taskGroup.id]?.[day.dateStr] || 0;
                                                            const offScheduleTime = offScheduleWorkData[taskGroup.id]?.[day.dateStr] || 0;
                                                            const executedMinutes = realExecutedTime + offScheduleTime;

                                                            // Calcular porcentajes para las barras
                                                            const maxTime = Math.max(plannedMinutes, executedMinutes);
                                                            const executedPercent = maxTime > 0 ? (executedMinutes / maxTime) * 100 : 0;
                                                            
                                                            // Determinar si esta sesión está incumplida
                                                            const isSessionNonCompliant = isDayPassed(day.dateStr) && executedMinutes === 0 && taskGroup.type !== "event";
                                                            
                                                            // Colores según estado y tipo
                                                            let backgroundClass, barBackgroundClass, statusText;
                                                            
                                                            if (taskGroup.type === "event") {
                                                               // Actividades adicionales - siempre ejecutadas
                                                               backgroundClass = "bg-purple-50 border-purple-200";
                                                               barBackgroundClass = "bg-purple-200";
                                                               statusText = `✅ Ejecutado (${session.event_type || "actividad"})`;
                                                            } else if (isSessionNonCompliant) {
                                                               // Tareas incumplidas
                                                               backgroundClass = "bg-red-50 border-red-200";
                                                               barBackgroundClass = "bg-red-200";
                                                               statusText = "⚠️ INCUMPLIDO";
                                                            } else {
                                                               // Tareas normales
                                                               backgroundClass = "bg-blue-50 border-blue-200";
                                                               barBackgroundClass = "bg-blue-200";
                                                               statusText = session.status === "completed" ? "Completado" : session.status === "in_progress" ? "En progreso" : "Planificado";
                                                            }
                                                            
                                                            return (
                                                               <div 
                                                                  key={idx}
                                                                  className={`text-xs p-1 rounded border ${backgroundClass} relative overflow-hidden`}
                                                                  title={`${startTime} - ${endTime}\nPlanificado: ${Math.round(plannedMinutes / 60 * 100) / 100}h\nEjecutado: ${Math.round(executedMinutes / 60 * 100) / 100}h\nEstado: ${statusText}`}
                                                               >
                                                                                                                                    {/* Barra de fondo - Tiempo planificado */}
                                                                   <div className={`absolute inset-0 ${barBackgroundClass} opacity-50`}></div>
                                                                  
                                                                   {/* ✅ NUEVO: Barra de progreso - Tiempo ejecutado */}
                                                                   {(executedMinutes > 0 || taskGroup.type === "event") && (
                                                                      <div 
                                                                         className={`absolute inset-y-0 left-0 ${
                                                                            taskGroup.type === "event"
                                                                               ? 'bg-purple-400'
                                                                               : executedMinutes >= plannedMinutes 
                                                                                  ? 'bg-green-400' 
                                                                                  : 'bg-green-300'
                                                                         } opacity-70`}
                                                                         style={{ 
                                                                            width: taskGroup.type === "event" 
                                                                               ? '100%' 
                                                                               : `${Math.min(executedPercent, 100)}%` 
                                                                         }}
                                                                      ></div>
                                                                   )}
                                                                  
                                                                   {/* Contenido de texto */}
                                                                   <div className="relative z-10">
                                                                     <div className="font-medium text-gray-800">
                                                                        {startTime && endTime ? `${startTime}-${endTime}` : 'Sin horario'}
                                             </div>
                                                                     <div className="flex justify-between text-xs">
                                                                        {taskGroup.type === "event" ? (
                                                                           <>
                                                                              <span>📅 {Math.round(plannedMinutes / 60 * 100) / 100}h</span>
                                                                              <span>✅ Ejecutado</span>
                                                                           </>
                                                                        ) : (
                                                                           <>
                                                                              <span>P:{Math.round(plannedMinutes / 60 * 100) / 100}h</span>
                                                                              <span>E:{Math.round(executedMinutes / 60 * 100) / 100}h</span>
                                                                           </>
                                                                        )}
                                          </div>
                                             </div>
                                          </div>
                                                            );
                                                         })}
                                                         
                                                         {/* Sesiones sin horario específico */}
                                                         {sessions.filter((s: any) => !s.start_time || !s.end_time).map((session: any, idx: number) => {
                                                            const realExecutedTime = executedTimeData[taskGroup.id]?.[day.dateStr] || 0;
                                                            const offScheduleTime = offScheduleWorkData[taskGroup.id]?.[day.dateStr] || 0;
                                                            const plannedMinutes = session.estimated_duration || 0;
                                                            const executedMinutes = realExecutedTime + offScheduleTime;

                                                            // Determinar si esta sesión está incumplida
                                                            const isSessionNonCompliant = isDayPassed(day.dateStr) && executedMinutes === 0;
                                                            
                                                            // Colores según estado
                                                            const backgroundClass = isSessionNonCompliant 
                                                               ? "bg-red-100 border-red-300 text-red-700" 
                                                               : "bg-gray-100 border-gray-300 text-gray-700";
                                                            const barClass = isSessionNonCompliant 
                                                               ? "bg-red-300" 
                                                               : "bg-green-300";
                                                            
                                                            const statusText = isSessionNonCompliant 
                                                               ? "⚠️ INCUMPLIDO" 
                                                               : session.status === "completed" ? "Completado" : session.status === "in_progress" ? "En progreso" : "Asignado";

                                                            return (
                                                               <div 
                                                                  key={`no-time-${idx}`}
                                                                  className={`text-xs p-1 rounded border ${backgroundClass} relative overflow-hidden`}
                                                                  title={`Sin horario específico\nPlanificado: ${Math.round(plannedMinutes / 60 * 100) / 100}h\nEjecutado: ${Math.round(executedMinutes / 60 * 100) / 100}h\nEstado: ${statusText}`}
                                                               >
                                                                  {/* Barra de progreso para sesiones sin horario */}
                                                                  {executedMinutes > 0 && (
                                                                     <div 
                                                                        className={`absolute inset-y-0 left-0 ${barClass} opacity-50`}
                                                                        style={{ width: `${Math.min((executedMinutes / plannedMinutes) * 100, 100)}%` }}
                                                                     ></div>
                                                                  )}
                                                                  
                                                                  <div className="relative z-10">
                                                                     <div>{isSessionNonCompliant ? "⚠️ INCUMPLIDO" : "Sin horario"}</div>
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
                                                E: {Math.round((getWeekDays(selectedWeekDate).reduce((total, day) => {
                                                   if (taskGroup.type === "event") {
                                                      // Para actividades adicionales, contar toda su duración como ejecutada
                                                      const sessions = taskGroup.sessions[day.dateStr] || [];
                                                      const eventTime = sessions.reduce((daySum: number, session: any) => {
                                                         return daySum + (session.actual_duration || 0);
                                                      }, 0);
                                                      return total + eventTime;
                                                   } else {
                                                      // Para tareas normales, usar executedTimeData + tiempos extra
                                                      const realExecutedTime = executedTimeData[taskGroup.id]?.[day.dateStr] || 0;
                                                      const offScheduleTime = offScheduleWorkData[taskGroup.id]?.[day.dateStr] || 0;
                                                      return total + realExecutedTime + offScheduleTime;
                                                   }
                                                }, 0) / 60) * 100) / 100}h
                                    </div>
                                    </div>
                                 </div>
                                    );
                                 })}

                                 {/* Filas de totales por día - simplificadas */}
                                 <div className="mt-3 pt-2 border-t border-gray-300">
                                    {/* Fila de horas planificadas */}
                                    <div className="grid grid-cols-9 gap-2 mb-1">
                                       <div className="p-1 bg-blue-50 text-xs text-blue-700 text-center">
                                          📅 Plan
                                       </div>
                                       {getWeekDays(selectedWeekDate).map(day => {
                                          const plannedHours = ganttData.reduce((total, taskGroup) => {
                                             const sessions = taskGroup.sessions[day.dateStr] || [];
                                             const dayTotal = sessions.reduce((daySum: number, session: any) => {
                                                if (session.start_time && session.end_time) {
                                                   const startDate = new Date(session.start_time);
                                                   const endDate = new Date(session.end_time);
                                                   const durationMinutes = Math.max(0, (endDate.getTime() - startDate.getTime()) / (1000 * 60));
                                                   return daySum + durationMinutes;
                                                }
                                                return daySum;
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
                                             return grandTotal + getWeekDays(selectedWeekDate).reduce((total, day) => {
                                                const sessions = taskGroup.sessions[day.dateStr] || [];
                                                return total + sessions.reduce((daySum: number, session: any) => {
                                                   if (session.start_time && session.end_time) {
                                                      const startDate = new Date(session.start_time);
                                                      const endDate = new Date(session.end_time);
                                                      const durationMinutes = Math.max(0, (endDate.getTime() - startDate.getTime()) / (1000 * 60));
                                                      return daySum + durationMinutes;
                                                   }
                                                   return daySum;
                                                }, 0);
                                             }, 0);
                                          }, 0) / 60) * 100) / 100}h
                                       </div>
                                    </div>

                                    {/* Fila de horas ejecutadas */}
                                    <div className="grid grid-cols-9 gap-2">
                                       <div className="p-1 bg-green-50 text-xs text-green-700 text-center">
                                          ✅ Ejec
                                       </div>
                                       {getWeekDays(selectedWeekDate).map(day => {
                                          const executedHours = ganttData.reduce((total, taskGroup) => {
                                             if (taskGroup.type === "event") {
                                                // Para actividades adicionales, contar toda su duración como ejecutada
                                                const sessions = taskGroup.sessions[day.dateStr] || [];
                                                const eventTime = sessions.reduce((daySum: number, session: any) => {
                                                   return daySum + (session.actual_duration || 0);
                                                }, 0);
                                                return total + eventTime;
                                             } else {
                                                // Para tareas normales, usar executedTimeData + tiempos extra
                                                const realExecutedTime = executedTimeData[taskGroup.id]?.[day.dateStr] || 0;
                                                const offScheduleTime = offScheduleWorkData[taskGroup.id]?.[day.dateStr] || 0;
                                                return total + realExecutedTime + offScheduleTime;
                                             }
                                          }, 0);

                                          return (
                                             <div key={`executed-${day.dateStr}`} className="p-1 bg-green-50 text-center text-xs text-green-700">
                                                {Math.round((executedHours / 60) * 100) / 100}h
                                             </div>
                                          );
                                       })}
                                       <div className="p-1 bg-green-100 text-center text-xs text-green-800">
                                          {Math.round((ganttData.reduce((grandTotal, taskGroup) => {
                                             if (taskGroup.type === "event") {
                                                // Para actividades adicionales, sumar toda su duración como ejecutada
                                                return grandTotal + getWeekDays(selectedWeekDate).reduce((total, day) => {
                                                   const sessions = taskGroup.sessions[day.dateStr] || [];
                                                   const eventTime = sessions.reduce((daySum: number, session: any) => {
                                                      return daySum + (session.actual_duration || 0);
                                                   }, 0);
                                                   return total + eventTime;
                                                }, 0);
                                             } else {
                                                // Para tareas normales, usar executedTimeData + tiempos extra
                                                return grandTotal + getWeekDays(selectedWeekDate).reduce((total, day) => {
                                                   const realExecutedTime = executedTimeData[taskGroup.id]?.[day.dateStr] || 0;
                                                   const offScheduleTime = offScheduleWorkData[taskGroup.id]?.[day.dateStr] || 0;
                                                   return total + realExecutedTime + offScheduleTime;
                                                }, 0);
                                             }
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
                                 onClick={() => setActiveGestionSubTab("en_proceso")}
                                 className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                              >
                                 📋 Ver En Proceso
                              </button>
                              </div>
                           )}
                        </div>
                     </div>
               )}

               {activeGestionSubTab === "bloqueadas" && (
                  <>
                     <div className="mb-2">
                        <div className="flex items-center mb-2">
                           <div className="w-4 h-4 bg-red-500 rounded-full mr-2"></div>
                           <h3 className="text-lg font-semibold text-red-700">Tareas Bloqueadas ({filteredBlockedTaskItems.length})</h3>
                        </div>
                        <p className="text-sm text-gray-600 mb-4">Estas tareas requieren que un administrador las revise y desbloquee para que puedas continuar.</p>
                     </div>
                     <div className="bg-white rounded-md shadow-sm border border-gray-200 overflow-hidden mb-6">
                        <div className="grid grid-cols-7 gap-4 p-3 border-b-2 border-red-300 font-medium text-red-800 bg-red-100">
                           <div>PROYECTO</div>
                           <div>ACTIVIDAD</div>
                           <div>MOTIVO DEL BLOQUEO</div>
                           <div>INICIO</div>
                           <div>FIN</div>
                           <div>DURACIÓN</div>
                           <div>ESTADO</div>
                        </div>
                        <div className="divide-y divide-red-200">
                           {loadingAssigned ? (
                              <div className="py-8 px-4 animate-pulse space-y-3">
                                 {[...Array(4)].map((_, i) => (
                                    <div key={i} className="h-12 bg-gray-200 rounded w-full" />
                                 ))}
                              </div>
                           ) : filteredBlockedTaskItems.length > 0 ? (
                              filteredBlockedTaskItems.map((task) => {
                                 const blockReason = (typeof task.notes === 'object' && task.notes?.razon_bloqueo) ? task.notes.razon_bloqueo : (typeof task.notes === 'string' ? task.notes : 'No especificado');

                                 return (
                                    <div key={task.id} className="grid grid-cols-7 gap-4 py-3 items-center bg-red-50 hover:bg-red-100 px-3">
                                       <div className="text-sm text-gray-700 py-1 flex flex-wrap items-center gap-1">
                                          {(() => {
                                             const { bg, text } = getProjectColor(task.projectName || "Sin proyecto", task.project_id);
                                             return <span className={`inline-block px-3 py-1 ${bg} ${text} font-semibold rounded-full shadow-sm`}>{task.projectName || "Sin proyecto"}</span>;
                                          })()}
                                          <PhaseBadge phaseName={phasesForProject.find(p => p.id === task.phase_id)?.name} />
                                       </div>
                                       <div className="font-medium">
                                       <div className="cursor-pointer hover:text-indigo-600 mb-1" onClick={() => handleViewTaskDetails(task)}>
                                             {task.title}
                                          </div>
                                          {task.type === "subtask" && <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">Subtarea</span>}
                                       </div>
                                       <div className="text-sm text-red-700">
                                          <RichTextSummary text={blockReason} maxLength={100} />
                                       </div>
                                       <div className="text-sm text-gray-700">
                                          {task.start_date ? format(new Date(task.start_date), "dd/MM/yyyy") : "-"}
                                       </div>
                                       <div className="text-sm text-gray-700">
                                          {task.deadline ? format(new Date(task.deadline), "dd/MM/yyyy") : "-"}
                                       </div>
                                       <div className="text-sm font-medium">
                                          {Math.round((task.estimated_duration / 60) * 100) / 100} H
                                       </div>
                                       <div>
                                          <TaskStatusDisplay status={task.status} />
                                       </div>
                                    </div>
                                 );
                              })
                           ) : (
                              <div className="py-8 text-center bg-white">
                                 <p className="text-gray-500">¡Genial! No tienes ninguna tarea bloqueada.</p>
                              </div>
                           )}
                        </div>
                     </div>
                  </>
               )}


               {activeGestionSubTab === "aprobadas" && (
                  <>
                     {loadingCompleted ? (
                        <div className="py-8 px-4 animate-pulse space-y-3">
                           {[...Array(4)].map((_, i) => (
                              <div key={i} className="h-12 bg-gray-200 rounded w-full" />
                           ))}
                        </div>
                     ) : filteredApprovedTaskItems.length > 0 ? (
                        <div className="mb-8">
                           <div className="flex items-center mb-3 flex-wrap gap-2">
                              <div className="w-4 h-4 bg-green-500 rounded-full mr-3 flex-shrink-0"></div>
                              <h3 className="text-lg font-semibold text-green-700">Aprobadas ({filteredApprovedTaskItems.length})</h3>
                              <span className="text-xs text-gray-500">Orden: fecha de fin de entrega, más reciente primero</span>
                           </div>
                           <div className="bg-green-50 rounded-md shadow-sm border border-green-200 overflow-hidden">
                              <div className="grid grid-cols-9 gap-4 p-3 border-b-2 border-green-300 font-medium text-green-800 bg-green-100">
                                 <div>PROYECTO</div>
                                 <div>ACTIVIDAD</div>
                                 <div>DESCRIPCION</div>
                                 <div>FECHA FIN</div>
                                 <div>DURACIÓN EST.</div>
                                 <div>DURACIÓN REAL</div>
                                 <div>RESULTADO</div>
                                 <div>ESTADO</div>
                                 <div>ACCIONES</div>
                              </div>
                              <div className="divide-y divide-green-200">
                                 {pagedApprovedTaskItems.map((task) => (
                                    <div key={task.id} className="grid grid-cols-9 gap-4 py-3 items-center bg-white hover:bg-green-50 px-3">
                                       <div className="text-sm text-gray-700 py-1 flex flex-wrap items-center gap-1">
                                          {(() => {
                                             const { bg, text } = getProjectColor(task.projectName || "Sin proyecto", task.project_id);
                                             return <span className={`inline-block px-3 py-1 ${bg} ${text} font-semibold rounded-full shadow-sm`}>{task.projectName || "Sin proyecto"}</span>;
                                          })()}
                                          <PhaseBadge phaseName={phasesForProject.find(p => p.id === task.phase_id)?.name} />
                                       </div>
                                       <div
                                          className="font-medium text-green-900 cursor-pointer hover:text-indigo-600 hover:underline"
                                          onClick={() => handleViewTaskDetails(task)}
                                          title="Ver detalle de la tarea"
                                       >
                                          {task.title}
                                       </div>
                                       <div className="text-sm text-gray-600">
                                          <RichTextSummary text={task.description || "-"} maxLength={80} />
                                       </div>
                                       <div className="text-sm text-gray-700">{task.deadline ? format(new Date(task.deadline), "dd/MM/yyyy") : "-"}</div>
                                       <div className="text-sm font-medium">{Math.round((task.estimated_duration / 60) * 100) / 100} H</div>
                                       <div className="text-sm font-medium text-green-600">{Math.round(((task.notes as TaskNotes)?.duracion_real ?? task.estimated_duration) / 60)} H</div>
                                       <div className="text-sm text-gray-700 max-h-16 overflow-y-auto">{(task.notes as TaskNotes)?.entregables ?? (typeof task.notes === "string" ? task.notes : "-")}</div>
                                       <div>
                                          <TaskStatusDisplay status={task.status} />
                                       </div>
                                       <div>
                                          <button
                                             onClick={() => handleOpenStatusModal(task.id, "complete")}
                                             className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 transition-colors"
                                             title="Editar entregables o corregir tiempo reportado"
                                          >
                                             Editar
                                          </button>
                                       </div>
                                    </div>
                                 ))}
                              </div>
                              {sortedApprovedTaskItems.length > 0 && (
                                 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 bg-green-100/80 border-t border-green-200">
                                    <p className="text-sm text-gray-600">
                                       Mostrando {(approvedListPage - 1) * APPROVED_TASKS_PER_PAGE + 1}–
                                       {Math.min(approvedListPage * APPROVED_TASKS_PER_PAGE, sortedApprovedTaskItems.length)} de{" "}
                                       {sortedApprovedTaskItems.length}
                                    </p>
                                    <div className="flex items-center gap-2">
                                       <button
                                          type="button"
                                          disabled={approvedListPage <= 1}
                                          onClick={() => setApprovedListPage((p) => Math.max(1, p - 1))}
                                          className="text-sm px-3 py-1 rounded border border-green-300 bg-white text-green-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-50"
                                       >
                                          Anterior
                                       </button>
                                       <span className="text-sm text-gray-700 tabular-nums">
                                          Página {approvedListPage} / {approvedTasksTotalPages}
                                       </span>
                                       <button
                                          type="button"
                                          disabled={approvedListPage >= approvedTasksTotalPages}
                                          onClick={() => setApprovedListPage((p) => Math.min(approvedTasksTotalPages, p + 1))}
                                          className="text-sm px-3 py-1 rounded border border-green-300 bg-white text-green-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-50"
                                       >
                                          Siguiente
                                       </button>
                                    </div>
                                 </div>
                              )}
                           </div>
                        </div>
                     ) : (
                        <div className="py-8 text-center bg-white">
                           <p className="text-gray-500 mb-2">Aún no tienes tareas aprobadas.</p>
                        </div>
                     )}
                  </>
               )}

               {/* Vista de Actividades Adicionales */}
               {activeGestionSubTab === "actividades" && (
                  <div className="mb-6">
                     <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center">
                           <div className="w-4 h-4 bg-purple-500 rounded-full mr-3"></div>
                           <h3 className="text-lg font-semibold text-purple-700">Actividades Adicionales de la Semana</h3>
                        </div>
                        <button
                           onClick={() => setShowEventsModal(true)}
                           className="bg-purple-500 text-white px-4 py-2 rounded-md font-medium hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 flex items-center gap-2"
                        >
                           ➕ Nueva Actividad
                        </button>
                     </div>

                     {loadingAllEvents ? (
                        <div className="py-8 px-4 animate-pulse space-y-3">
                           {[...Array(5)].map((_, i) => (
                              <div key={i} className="h-10 bg-gray-200 rounded w-full" />
                           ))}
                        </div>
                     ) : allWorkEvents.length > 0 ? (
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                           <div className="grid grid-cols-7 gap-4 p-3 border-b-2 border-purple-300 font-medium text-purple-800 bg-purple-50">
                              <div>FECHA</div>
                              <div>TÍTULO</div>
                              <div>TIPO</div>
                              <div>HORARIO</div>
                              <div>DURACIÓN</div>
                              <div>DESCRIPCIÓN</div>
                              <div>ACCIONES</div>
                           </div>
                           <div className="divide-y divide-gray-200">
                              {allWorkEvents.map((event) => {
                                 const startMinutes = parseInt(event.start_time.split(':')[0]) * 60 + parseInt(event.start_time.split(':')[1]);
                                 const endMinutes = parseInt(event.end_time.split(':')[0]) * 60 + parseInt(event.end_time.split(':')[1]);
                                 const durationMinutes = endMinutes - startMinutes;
                                 const durationHours = Math.round((durationMinutes / 60) * 100) / 100;

                                 return (
                                    <div key={event.id} className="grid grid-cols-7 gap-4 py-3 items-center hover:bg-purple-50 px-3">
                                       <div className="text-sm font-medium text-gray-700">
                                          {format(new Date(event.date), "EEE dd/MM", { locale: es })}
                                       </div>
                                       <div className="font-medium text-gray-900">
                                          {event.title}
                                       </div>
                                       <div className="text-sm">
                                          <span className="inline-block px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                                             {event.event_type}
                                          </span>
                                       </div>
                                       <div className="text-sm text-gray-700">
                                          {format(new Date(`1970-01-01T${event.start_time}`), "hh:mm a")} - {format(new Date(`1970-01-01T${event.end_time}`), "hh:mm a")}
                                       </div>
                                       <div className="text-sm font-medium text-purple-600">
                                          {durationHours}h
                                       </div>
                                       <div className="text-sm text-gray-600 max-w-xs overflow-hidden">
                                          {event.description || "-"}
                                       </div>
                                       <div className="flex gap-2">
                                          <button
                                             onClick={() => handleEditActivity(event)}
                                             className="text-blue-600 hover:text-blue-800 p-1 rounded transition-colors"
                                             title="Editar actividad"
                                          >
                                             <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                             </svg>
                                          </button>
                                          <button
                                             onClick={() => handleDeleteActivity(event.id)}
                                             className="text-red-600 hover:text-red-800 p-1 rounded transition-colors"
                                             title="Eliminar actividad"
                                          >
                                             <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                             </svg>
                                          </button>
                                       </div>
                                    </div>
                                 );
                              })}
                           </div>
                        </div>
                     ) : (
                        <div className="py-12 text-center bg-white rounded-lg border border-gray-200">
                           <div className="text-6xl mb-4">📅</div>
                           <h4 className="text-lg font-medium text-gray-600 mb-2">No hay actividades adicionales</h4>
                           <p className="text-sm text-gray-500 mb-4">Crea tu primera actividad adicional para comenzar a registrar reuniones, breaks, etc.</p>
                           <button
                              onClick={() => setShowEventsModal(true)}
                              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                           >
                              ➕ Crear Actividad
                           </button>
                        </div>
                     )}
                  </div>
               )}

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
                                                   <label className="text-xs font-medium text-gray-700">¿Cuánto tiempo necesitas? <span className="text-gray-500 font-normal">(opcional, si no completas se usa el estimado del admin)</span></label>
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

                           {calculateTotalCustomDuration() > 0 && (
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
                              disabled={saving} 
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
                                                               <div className="font-semibold leading-tight text-blue-900 mb-1 ">
                                                                  {task?.title || 'Tarea sin título'}
                                                               </div>
                                                               <div className="text-xs text-blue-600 font-medium  opacity-90">
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
                                                               <div className="font-semibold leading-tight text-purple-900 mb-1 ">
                                                                  {event.title}
                                                               </div>
                                                               <div className="text-xs text-purple-600 font-medium  opacity-90">
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
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {selectedTaskDetails.projectName && <span className="text-sm text-blue-600">Proyecto: {selectedTaskDetails.projectName}</span>}
                          <PhaseBadge phaseName={phasesForProject.find(p => p.id === selectedTaskDetails.phase_id)?.name} />
                        </div>
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

                     {/* Checklist personal del usuario */}
                     <div className="mb-4">
                        <ActivityChecklist
                           key={`checklist-${selectedTaskDetails.type}-${selectedTaskDetails.original_id || selectedTaskDetails.id}`}
                           items={selectedTaskDetails.checklist || []}
                           onUpdate={async (updated) => {
                              const table = selectedTaskDetails.type === "subtask" ? "subtasks" : "tasks";
                              const id = selectedTaskDetails.type === "subtask" ? selectedTaskDetails.original_id : selectedTaskDetails.id;
                              const { error } = await supabase.from(table).update({ checklist: updated }).eq("id", id);
                              if (error) throw error;
                              setSelectedTaskDetails((prev) => (prev ? { ...prev, checklist: updated } : null));
                              fetchAssignedTasks();
                           }}
                           disabled={false}
                           placeholder="Ej: Revisar analytics, enviar reporte..."
                           emptyMessage="Crea tu checklist para llevar el control de esta actividad. Se incluirá en la plantilla del proyecto."
                        />
                     </div>

                     {/* Comentarios */}
                     <div className="mb-4">
                        <TaskComments
                           key={`comments-${selectedTaskDetails.type}-${selectedTaskDetails.original_id || selectedTaskDetails.id}`}
                           comments={(selectedTaskDetails.comments || []).map((c) => ({ ...c, created_at: c.created_at }))}
                           users={Object.entries(subtaskUsers).map(([id, name]) => ({ id, name }))}
                           currentUserId={user?.id}
                           onAdd={async (content) => {
                              const table = selectedTaskDetails.type === "subtask" ? "subtasks" : "tasks";
                              const id = selectedTaskDetails.type === "subtask" ? selectedTaskDetails.original_id : selectedTaskDetails.id;
                              const newComment = {
                                 id: crypto.randomUUID(),
                                 user_id: user!.id,
                                 content,
                                 created_at: new Date().toISOString(),
                              };
                              const updated = [...(selectedTaskDetails.comments || []), newComment];
                              const { error } = await supabase.from(table).update({ comments: updated }).eq("id", id);
                              if (error) throw error;
                              setSelectedTaskDetails((prev) => (prev ? { ...prev, comments: updated } : null));
                              fetchAssignedTasks();
                           }}
                           onDelete={async (commentId) => {
                              const table = selectedTaskDetails.type === "subtask" ? "subtasks" : "tasks";
                              const id = selectedTaskDetails.type === "subtask" ? selectedTaskDetails.original_id : selectedTaskDetails.id;
                              const updated = (selectedTaskDetails.comments || []).filter((c) => c.id !== commentId);
                              const { error } = await supabase.from(table).update({ comments: updated }).eq("id", id);
                              if (error) throw error;
                              setSelectedTaskDetails((prev) => (prev ? { ...prev, comments: updated } : null));
                              fetchAssignedTasks();
                           }}
                        />
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

                     {/* Proyecto y Fase */}
                     <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-1">Proyecto:</h4>
                        <div className="flex flex-wrap items-center gap-2">
                           {selectedTaskDetails &&
                              (() => {
                                 const { bg, text } = getProjectColor(selectedTaskDetails.projectName || "Sin proyecto", selectedTaskDetails.project_id);
                                 return <span className={`inline-block px-3 py-1 ${bg} ${text} font-semibold rounded-full shadow-sm`}>{selectedTaskDetails.projectName || "No especificado"}</span>;
                              })()}
                           <PhaseBadge phaseName={phasesForProject.find(p => p.id === selectedTaskDetails.phase_id)?.name} />
                        </div>
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
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
               <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[calc(100vh-2rem)] flex flex-col my-auto">
                  <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex justify-between items-center shrink-0">
                     <div>
                        <h3 className="text-lg font-medium flex items-center gap-2">
                           {selectedStatus === "completed" && (completedTaskItems.some((t) => t.id === selectedTaskId) || inReviewTaskItems.some((t) => t.id === selectedTaskId) || approvedTaskItems.some((t) => t.id === selectedTaskId)) ? "Editar tarea entregada" : returnedTaskItems.some((t) => t.id === selectedTaskId) ? "Actualizar tarea devuelta" : "Actualizar estado de tarea"}
                           {actionType === "progress" && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded">Incluye programación</span>}
                        </h3>
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
                           setActionType(null);
                           setAlertasSolicitudes([]);
                           setAlertaDescripcion("");
                           // Resetear campos de programación
                           setNextWorkDate("");
                           setNextWorkStartTime("");
                           setNextWorkEndTime("");
                           setNextWorkDuration(0);
                        }}
                        className="text-gray-400 hover:text-gray-500 focus:outline-none">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                     </button>
                  </div>

                  <div className="px-4 sm:px-6 py-4 overflow-y-auto flex-1 min-h-0">
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

                     {/* Sección de información de acción seleccionada */}
                     {!(completedTaskItems.some((t) => t.id === selectedTaskId) || inReviewTaskItems.some((t) => t.id === selectedTaskId) || approvedTaskItems.some((t) => t.id === selectedTaskId)) && actionType && (
                        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
                           <div className="flex items-center gap-2">
                              {actionType === "complete" && (
                                 <>
                                    <span className="text-green-600">✅</span>
                                    <span className="text-sm font-medium text-green-700">
                                       {returnedTaskItems.some((t) => t.id === selectedTaskId) ? "Completar retrabajo" : "Completar Tarea"}
                                    </span>
                                 </>
                              )}
                              {actionType === "progress" && (
                                 <>
                                    <span className="text-blue-600">📝</span>
                                    <span className="text-sm font-medium text-blue-700">Reportar Avance</span>
                                 </>
                              )}
                              {actionType === "block" && (
                                 <>
                                    <span className="text-red-600">🚫</span>
                                    <span className="text-sm font-medium text-red-700">Bloquear Tarea</span>
                                 </>
                              )}
                           </div>
                        </div>
                     )}

                     {/* Detalles según el estado/acción seleccionada */}
                     {selectedStatus === "completed" || actionType === "complete" ? (
                        <div>
                           <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                 {isSupervisionTask
                                    ? "Reporte de supervisión (obligatorio):"
                                    : (completedTaskItems.some((t) => t.id === selectedTaskId) || inReviewTaskItems.some((t) => t.id === selectedTaskId) || approvedTaskItems.some((t) => t.id === selectedTaskId))
                                       ? "Editar entregables, resultados o tiempo reportado:"
                                       : "Detalla los entregables o resultados:"}
                                 <span className="text-red-500"> *</span>
                              </label>
                              <textarea
                                 className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-yellow-500 focus:border-yellow-500"
                                 rows={isSupervisionTask ? 4 : 3}
                                 value={statusDetails}
                                 onChange={(e) => setStatusDetails(e.target.value)}
                                 placeholder={isSupervisionTask
                                    ? "Qué supervisaste, hallazgos, observaciones, incidencias detectadas, acciones tomadas..."
                                    : "Ejemplos: Terminé la implementación del módulo X, Corregí el error en Y, etc."}
                              />
                           </div>

                           {/* Alertas/solicitudes para el admin (solo tareas de supervisión) */}
                           {isSupervisionTask && (
                              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                                 <label className="block text-sm font-medium text-amber-800 mb-2">
                                    Alertas o solicitudes para el admin (opcional)
                                 </label>
                                 <p className="text-xs text-amber-700 mb-3">
                                    Reporta problemas detectados, solicitudes de nuevas tareas o recursos que el admin deba crear. El admin las verá en Gestión y Bitácora de supervisión.
                                 </p>
                                 <div className="flex gap-2 mb-2">
                                    <select
                                       className="flex-shrink-0 px-3 py-2 border border-amber-300 rounded-md text-sm focus:ring-amber-500 focus:border-amber-500"
                                       value={alertaTipo}
                                       onChange={(e) => setAlertaTipo(e.target.value)}
                                    >
                                       <option value="solicitud_nueva_tarea">Solicitud de nueva tarea</option>
                                       <option value="problema">Problema detectado</option>
                                       <option value="recurso">Solicitud de recurso</option>
                                    </select>
                                    <textarea
                                       className="flex-1 px-3 py-2 border border-amber-300 rounded-md text-sm focus:ring-amber-500 focus:border-amber-500"
                                       rows={1}
                                       placeholder="Ej: Falta crear tarea para corregir bug en login..."
                                       value={alertaDescripcion}
                                       onChange={(e) => setAlertaDescripcion(e.target.value)}
                                    />
                                    <button
                                       type="button"
                                       onClick={() => {
                                          if (alertaDescripcion.trim()) {
                                             setAlertasSolicitudes((prev) => [...prev, { tipo: alertaTipo, descripcion: alertaDescripcion.trim() }]);
                                             setAlertaDescripcion("");
                                          }
                                       }}
                                       className="px-3 py-2 bg-amber-600 text-white rounded-md text-sm font-medium hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                    >
                                       Agregar
                                    </button>
                                 </div>
                                 {alertasSolicitudes.length > 0 && (
                                    <ul className="space-y-2 mt-2">
                                       {alertasSolicitudes.map((a, idx) => (
                                          <li key={idx} className="flex items-start gap-2 p-2 bg-white rounded border border-amber-100">
                                             <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                                                a.tipo === "solicitud_nueva_tarea" ? "bg-blue-100 text-blue-800" :
                                                a.tipo === "problema" ? "bg-red-100 text-red-800" :
                                                "bg-purple-100 text-purple-800"
                                             }`}>
                                                {a.tipo === "solicitud_nueva_tarea" ? "Nueva tarea" : a.tipo === "problema" ? "Problema" : "Recurso"}
                                             </span>
                                             <span className="flex-1 text-sm">{a.descripcion}</span>
                                             <button
                                                type="button"
                                                onClick={() => setAlertasSolicitudes((prev) => prev.filter((_, i) => i !== idx))}
                                                className="text-amber-600 hover:text-amber-800 text-sm"
                                                title="Eliminar"
                                             >
                                                ×
                                             </button>
                                          </li>
                                       ))}
                                    </ul>
                                 )}
                              </div>
                           )}

                           <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                 {returnedTaskItems.some((t) => t.id === selectedTaskId)
                                    ? "Tiempo de retrabajo en esta sesión:"
                                    : (completedTaskItems.some((t) => t.id === selectedTaskId) || inReviewTaskItems.some((t) => t.id === selectedTaskId) || approvedTaskItems.some((t) => t.id === selectedTaskId))
                                       ? "Tiempo total reportado (puedes corregirlo):"
                                       : "Tiempo que duraste en ESTA sesión final (no el total):"}{" "}
                                 <span className="text-red-500">*</span>
                              </label>

                              {/* Mostrar el tiempo previamente reportado si aplica */}
                              {!(completedTaskItems.some((t) => t.id === selectedTaskId) || inReviewTaskItems.some((t) => t.id === selectedTaskId) || approvedTaskItems.some((t) => t.id === selectedTaskId)) && taskProgress[selectedTaskId] && taskProgress[selectedTaskId].length > 0 && (
                                 <div className="mb-3 p-2 bg-blue-50 border border-blue-100 rounded-md flex items-center justify-between">
                                    <span className="text-xs text-blue-700">Tiempo ya reportado en avances:</span>
                                    <span className="text-sm font-semibold text-blue-800">
                                       {Math.round((taskProgress[selectedTaskId].reduce((sum, p) => sum + (p.metadata?.tiempo_sesion || 0), 0) / 60) * 100) / 100} horas
                                    </span>
                                 </div>
                              )}

                              <div className="flex items-center">
                                 <input 
                                    type="number" 
                                    min="1" 
                                    step="1" 
                                    className="w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-yellow-500 focus:border-yellow-500 mr-2" 
                                    value={actualDuration || ""} 
                                    onChange={(e) => setActualDuration(Number(e.target.value))} 
                                    placeholder="0"
                                    required
                                 />
                                 <select className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-yellow-500 focus:border-yellow-500" value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as "minutes" | "hours")}>
                                    <option value="minutes">Minutos</option>
                                    <option value="hours">Horas</option>
                                 </select>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                 {returnedTaskItems.some((t) => t.id === selectedTaskId)
                                    ? "Este tiempo se sumará al ya registrado anteriormente (no lo reemplaza)."
                                    : (completedTaskItems.some((t) => t.id === selectedTaskId) || inReviewTaskItems.some((t) => t.id === selectedTaskId) || approvedTaskItems.some((t) => t.id === selectedTaskId))
                                       ? "Puedes corregir el tiempo total que tomaste."
                                       : "Solo pon el tiempo de tu trabajo HOY o en ESTA sesión. El sistema ya sabe cuánto habías reportado en los avances anteriores y lo sumará automáticamente."}
                              </p>
                           </div>

                           <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">¿Por qué tomó este tiempo? (opcional)</label>
                              <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-yellow-500 focus:border-yellow-500" rows={2} value={durationReason} onChange={(e) => setDurationReason(e.target.value)} placeholder="Ejemplos: Fue más complejo de lo esperado, Hubo cambios en los requerimientos, etc." />
                           </div>
                        </div>
                     ) : actionType === "progress" ? (
                        <div>
                           <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Describe el avance realizado:</label>
                              <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" rows={3} value={statusDetails} onChange={(e) => setStatusDetails(e.target.value)} placeholder="Ejemplos: Avancé con la implementación del módulo X, Revisé y corregí errores en Y, etc." />
                           </div>

                           <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Tiempo trabajado en esta sesión: <span className="text-red-500">*</span></label>
                              
                              {/* Mostrar el tiempo previamente reportado si aplica */}
                              {taskProgress[selectedTaskId] && taskProgress[selectedTaskId].length > 0 && (
                                 <div className="mb-3 p-2 bg-blue-50 border border-blue-100 rounded-md flex items-center justify-between">
                                    <span className="text-xs text-blue-700">Tiempo acumulado en avances anteriores:</span>
                                    <span className="text-sm font-semibold text-blue-800">
                                       {Math.round((taskProgress[selectedTaskId].reduce((sum, p) => sum + (p.metadata?.tiempo_sesion || 0), 0) / 60) * 100) / 100} horas
                                    </span>
                                 </div>
                              )}

                              <div className="flex items-center">
                                 <input 
                                    type="number" 
                                    min="1" 
                                    step="1" 
                                    className="w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 mr-2" 
                                    value={actualDuration || ""} 
                                    onChange={(e) => setActualDuration(Number(e.target.value))} 
                                    placeholder="0"
                                    required
                                 />
                                 <select className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" value={durationUnit} onChange={(e) => setDurationUnit(e.target.value as "minutes" | "hours")}>
                                    <option value="minutes">Minutos</option>
                                    <option value="hours">Horas</option>
                                 </select>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">Ingresa ÚNICAMENTE el tiempo que duraste trabajando HOY en la tarea.</p>
                           </div>

                           <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Notas adicionales (opcional):</label>
                              <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" rows={2} value={durationReason} onChange={(e) => setDurationReason(e.target.value)} placeholder="Ejemplos: Encontré dificultades con X, Necesito revisar Y, etc." />
                           </div>

                           {/* Sección obligatoria para programar próximo trabajo */}
                           <div className="border-t border-gray-200 pt-4">
                              <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center gap-2">
                                 📅 Programar próxima sesión de trabajo <span className="text-red-500">*</span>
                              </h4>
                              
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                 <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha: <span className="text-red-500">*</span></label>
                                    <input
                                       type="date"
                                       min={format(new Date(), "yyyy-MM-dd")}
                                       className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                       value={nextWorkDate}
                                       onChange={(e) => setNextWorkDate(e.target.value)}
                                       required
                                    />
                                 </div>
                                 
                                 <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora inicio: <span className="text-red-500">*</span></label>
                                    <input
                                       type="time"
                                       className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                       value={nextWorkStartTime}
                                       onChange={(e) => setNextWorkStartTime(e.target.value)}
                                       required
                                    />
                                 </div>
                                 
                                 <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora fin: <span className="text-red-500">*</span></label>
                                    <input
                                       type="time"
                                       className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                       value={nextWorkEndTime}
                                       onChange={(e) => setNextWorkEndTime(e.target.value)}
                                       required
                                    />
                                 </div>
                              </div>
                              
                              <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                                 💡 Debes programar cuándo continuarás trabajando en esta tarea
                              </p>
                           </div>
                        </div>
                     ) : (
                        <div className="mb-4">
                           <label className="block text-sm font-medium text-gray-700 mb-2">Detalla por qué está bloqueada:</label>
                           <textarea className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500" rows={3} value={statusDetails} onChange={(e) => setStatusDetails(e.target.value)} placeholder="Ejemplos: Estoy esperando respuesta de X, Falta información sobre Y, etc." />
                        </div>
                     )}

                     {statusError && <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-md">{statusError}</div>}
                  </div>

                  <div className="px-4 sm:px-6 py-3 bg-gray-50 flex justify-end gap-3 border-t border-gray-200 shrink-0">
                     <button
                        onClick={() => {
                           setShowStatusModal(false);
                           setTaskForStatusUpdate(null);
                           setActionType(null);
                           // Resetear campos de programación
                           setNextWorkDate("");
                           setNextWorkStartTime("");
                           setNextWorkEndTime("");
                           setNextWorkDuration(0);
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-yellow-500">
                        Cancelar
                     </button>
                     <button
                        onClick={handleSubmitStatus}
                        className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 
                       ${actionType === "complete" || selectedStatus === "completed" ? "bg-green-600 focus:ring-green-500" : 
                         actionType === "progress" ? "bg-blue-600 focus:ring-blue-500" : 
                         "bg-red-600 focus:ring-red-500"}`}>
                        {(() => {
                           if (completedTaskItems.some((t) => t.id === selectedTaskId) || inReviewTaskItems.some((t) => t.id === selectedTaskId) || approvedTaskItems.some((t) => t.id === selectedTaskId)) {
                              return "Guardar Cambios";
                           }
                           
                           if (returnedTaskItems.some((t) => t.id === selectedTaskId)) {
                              if (actionType === "complete") return "Marcar como Corregida";
                              if (actionType === "progress") return "Reportar Avance";
                              if (actionType === "block") return "Marcar como Bloqueada";
                           }
                           
                           // Para tareas normales
                           if (actionType === "complete") return "Marcar como Completada";
                           if (actionType === "progress") return "Reportar Avance";
                           if (actionType === "block") return "Marcar como Bloqueada";
                           
                           // Fallback
                           return selectedStatus === "completed" ? "Marcar como Completada" : "Marcar como Bloqueada";
                        })()}
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Modal para ver historial de avances */}
         {showProgressModal && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
               <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                     <h3 className="text-lg font-medium text-blue-700 flex items-center gap-2">
                        📊 Historial de Avances
                     </h3>
                     <button 
                        onClick={() => setShowProgressModal(false)} 
                        className="text-gray-400 hover:text-gray-500 focus:outline-none"
                     >
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                     </button>
                  </div>

                  <div className="px-6 py-4 max-h-96 overflow-y-auto">
                     {selectedTaskProgress.length === 0 ? (
                        <div className="text-center py-8">
                           <div className="text-gray-400 text-4xl mb-4">📝</div>
                           <p className="text-gray-600">No hay avances registrados para esta tarea</p>
                        </div>
                     ) : (
                        <div className="space-y-4">
                           {selectedTaskProgress.map((progress, index) => (
                              <div key={index} className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                                 <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                       <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded font-medium">
                                          Avance #{selectedTaskProgress.length - index}
                                       </span>
                                       <span className="text-sm text-gray-600">
                                          {format(new Date(progress.changed_at), "dd/MM/yyyy HH:mm")}
                                       </span>
                                    </div>
                                    {progress.metadata?.tiempo_sesion && (
                                       <span className="text-xs bg-white px-2 py-1 rounded border">
                                          ⏱️ {Math.round((progress.metadata.tiempo_sesion / 60) * 100) / 100}h trabajadas
                                       </span>
                                    )}
                                 </div>
                                 
                                 {progress.metadata?.descripcion_avance && (
                                    <div className="mb-3">
                                       <h5 className="text-sm font-medium text-blue-800 mb-1">Descripción del avance:</h5>
                                       <div className="text-sm text-gray-700 bg-white p-2 rounded border">
                                          <RichTextDisplay text={progress.metadata.descripcion_avance} />
                                       </div>
                                    </div>
                                 )}
                                 
                                 {progress.metadata?.notas_avance && (
                                    <div>
                                       <h5 className="text-sm font-medium text-blue-800 mb-1">Notas adicionales:</h5>
                                       <div className="text-sm text-gray-700 bg-white p-2 rounded border">
                                          <RichTextDisplay text={progress.metadata.notas_avance} />
                                       </div>
                                    </div>
                                 )}
                              </div>
                           ))}
                        </div>
                     )}
                  </div>

                  <div className="px-6 py-3 bg-gray-50 flex justify-end border-t border-gray-200">
                     <button
                        onClick={() => setShowProgressModal(false)}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                     >
                        Cerrar
                     </button>
                  </div>
               </div>
            </div>
         )}

         {/* Modal para ver retroalimentación de tareas devueltas */}
         {showReturnedFeedbackModal && selectedReturnedTask && (
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
               <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                     <h3 className="text-lg font-medium text-orange-700">📋 Tarea Devuelta - Entrega y Feedback</h3>
                     <button onClick={() => setShowReturnedFeedbackModal(false)} className="text-gray-400 hover:text-gray-500 focus:outline-none">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                     </button>
                  </div>

                  <div className="px-6 py-4 max-h-96 overflow-y-auto">
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

                     {/* Tu entrega original */}
                     <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <h4 className="text-sm font-medium text-blue-800 mb-1">📝 Tu entrega original:</h4>
                        <div className="text-sm text-gray-700">
                           {(() => {
                              try {
                                 const notes = selectedReturnedTask?.notes;
                                 
                                 if (notes && typeof notes === "object") {
                                    // Priorizar entrega_original si existe (desde status_history)
                                    const originalDelivery = notes.entrega_original;
                                    
                                    if (originalDelivery && typeof originalDelivery === "object") {
                                       return (
                                          <div className="space-y-3">
                                             {/* Entregables de la entrega original */}
                                             {(originalDelivery.entregables || originalDelivery.notes) && (
                                                <div>
                                                   <div className="font-medium text-blue-700 mb-1">📋 Entregables/Resultados:</div>
                                                   <div className="bg-white p-2 rounded border text-sm">
                                                      <RichTextDisplay text={originalDelivery.entregables || originalDelivery.notes || ""} />
                                                   </div>
                                                </div>
                                             )}
                                             
                                             {/* Tiempo trabajado */}
                                             {originalDelivery.duracion_real && (
                                                <div>
                                                   <div className="font-medium text-blue-700 mb-1">⏱️ Tiempo real trabajado:</div>
                                                   <div className="text-sm bg-white p-2 rounded border">
                                                      {originalDelivery.unidad_original === "hours" 
                                                         ? `${Math.round((originalDelivery.duracion_real / 60) * 100) / 100} horas`
                                                         : `${originalDelivery.duracion_real} minutos`
                                                      }
                                                   </div>
                                                </div>
                                             )}
                                             
                                             {/* Comentarios sobre el tiempo */}
                                             {originalDelivery.razon_duracion && (
                                                <div>
                                                   <div className="font-medium text-blue-700 mb-1">💭 Comentarios sobre el tiempo:</div>
                                                   <div className="bg-white p-2 rounded border text-sm">
                                                      <RichTextDisplay text={originalDelivery.razon_duracion} />
                                                   </div>
                                                </div>
                                             )}
                                          </div>
                                       );
                                    } else {
                                       // Fallback: usar estructura antigua de las notas
                                       return (
                                          <div className="space-y-3">
                                             {/* Entregables/Notas */}
                                             {(notes.entregables || notes.notes || notes.descripcion_avance) && (
                                                <div>
                                                   <div className="font-medium text-blue-700 mb-1">📋 Entregables/Resultados:</div>
                                                   <div className="bg-white p-2 rounded border text-sm">
                                                      <RichTextDisplay text={notes.entregables || notes.notes || notes.descripcion_avance || ""} />
                                                   </div>
                                                </div>
                                             )}
                                             
                                             {/* Tiempo trabajado */}
                                             {(notes.duracion_real || notes.tiempo_sesion) && (
                                                <div>
                                                   <div className="font-medium text-blue-700 mb-1">⏱️ Tiempo trabajado:</div>
                                                   <div className="text-sm bg-white p-2 rounded border">
                                                      {notes.duracion_real ? (
                                                         notes.unidad_original === "hours" 
                                                            ? `${Math.round((notes.duracion_real / 60) * 100) / 100} horas (tiempo total)`
                                                            : `${notes.duracion_real} minutos (tiempo total)`
                                                      ) : (
                                                         notes.unidad_original === "hours" 
                                                            ? `${Math.round((notes.tiempo_sesion / 60) * 100) / 100} horas (última sesión)`
                                                            : `${notes.tiempo_sesion} minutos (última sesión)`
                                                      )}
                                                   </div>
                                                </div>
                                             )}
                                             
                                             {/* Comentarios sobre el tiempo o notas adicionales */}
                                             {(notes.razon_duracion || notes.notas_avance) && (
                                                <div>
                                                   <div className="font-medium text-blue-700 mb-1">💭 Comentarios adicionales:</div>
                                                   <div className="bg-white p-2 rounded border text-sm">
                                                      <RichTextDisplay text={notes.razon_duracion || notes.notas_avance || ""} />
                                                   </div>
                                                </div>
                                             )}
                                          </div>
                                       );
                                    }
                                 } else {
                                    return (
                                       <div className="text-gray-500 italic">
                                          No se encontró información de tu entrega original
                                       </div>
                                    );
                                 }
                              } catch (error) {
                                 console.error("Error al procesar la entrega original:", error);
                                 return <p>Error al cargar tu entrega original.</p>;
                              }
                           })()}
                        </div>
                     </div>

                     <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-md">
                        <h4 className="text-sm font-medium text-orange-800 mb-1">⚠️ Motivo de la devolución:</h4>
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

                  </div>
                  
                  <div className="px-6 py-3 bg-gray-50 flex justify-between items-center border-t border-gray-200">
                     <p className="text-sm text-gray-600">Para corregir esta tarea, actualiza su estado desde "Actualizar"</p>
                     <div className="flex gap-2">
                        <button
                           onClick={() => setShowReturnedFeedbackModal(false)}
                           className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                           Cerrar
                        </button>
                        <button
                           onClick={() => {
                              setShowReturnedFeedbackModal(false);
                              handleOpenStatusModal(selectedReturnedTask?.id);
                           }}
                           className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 transition-colors"
                        >
                           Actualizar Estado
                                                 </button>
                      </div>
                  </div>
               </div>
            </div>
         )}

         {/* Otros modales continúan... */}

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
                                 {eventForm.event_type === 'daily' && (
                                    <span className="ml-2 text-xs text-gray-500">(Bloqueado para Daily)</span>
                                 )}
                              </label>
                              <input
                                 type="text"
                                 value={eventForm.event_type === 'daily' ? 'Daily Standup' : eventForm.title}
                                 onChange={(e) => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                                 placeholder="ej: Daily, Reunión con cliente..."
                                 disabled={eventForm.event_type === 'daily'}
                                 className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                                    eventForm.event_type === 'daily' ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''
                                 }`}
                              />
                           </div>

                           <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                 Tipo de evento
                              </label>
                              <select 
                                 value={eventForm.event_type}
                                 onChange={(e) => {
                                    const newEventType = e.target.value as WorkEvent['event_type'];
                                    setEventForm(prev => ({ 
                                       ...prev, 
                                       event_type: newEventType,
                                       // Si cambia a daily, establecer título automáticamente
                                       title: newEventType === 'daily' ? 'Daily Standup' : prev.title
                                    }));
                                 }}
                                 className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                              >
                                 <option value="meeting">🤝 Reunión</option>
                                 <option value="daily">🗣️ Daily</option>
                                 <option value="review">📋 Revisión</option>
                                 <option value="planning">📅 Planificación</option>
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

                        {/* Lista de eventos del día con timeline */}
                        <div className="space-y-4">
                           <h4 className="text-lg font-medium text-gray-900">Eventos programados</h4>
                           
                           {/* Timeline con actividades principales */}
                           <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                              <h5 className="text-sm font-medium text-gray-900 mb-3">Timeline del día</h5>
                              <div className="grid grid-cols-[60px_1fr] gap-2 h-80 overflow-y-auto">
                                 {/* Columna de horas */}
                                 <div className="relative">
                                    {Array.from({length: 12}).map((_, i) => {
                                       const hour = 8 + i;
                                       return (
                                          <div key={hour} className="h-[50px] flex items-start justify-end pr-2 text-xs text-gray-500 border-b border-gray-200 last:border-b-0">
                                             {hour}:00
                                          </div>
                                       );
                                    })}
                                 </div>

                                 {/* Área de timeline */}
                                 <div className="relative bg-white border-l border-gray-200">
                                    {/* Líneas horizontales */}
                                    {Array.from({length: 12}).map((_, i) => (
                                       <div key={i} className="absolute w-full border-b border-gray-200" style={{top: `${i * 50}px`, height: '50px'}} />
                                    ))}

                                    {/* Tareas asignadas del día (ganttData, excluyendo eventos) */}
                                    {(() => {
                                       interface Session {
                                          id: string;
                                          start_time?: string;
                                          end_time?: string;
                                       }
                                       const todayStr = format(new Date(), 'yyyy-MM-dd');
                                       const todaySessions: JSX.Element[] = [];
                                       ganttData
                                          .filter((task) => task.type !== 'event')
                                          .forEach((task) => {
                                          const sessions: Session[] = task.sessions[todayStr] || [];
                                          sessions.forEach(session => {
                                             if (session.start_time && session.end_time) {
                                                const startDate = new Date(session.start_time);
                                                const endDate = new Date(session.end_time);
                                                const startMin = (startDate.getHours() + startDate.getMinutes() / 60) - 8;
                                                const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
                                                const top = startMin * 50; // 50px per hour
                                                const height = durationHours * 50;
                                                todaySessions.push(
                                                   <div
                                                      key={session.id}
                                                      className="absolute left-1 right-1 bg-blue-100 border border-blue-300 rounded px-2 py-1 text-xs overflow-hidden"
                                                      style={{top: `${top}px`, height: `${height}px`}}
                                                   >
                                                      <div className="font-medium truncate">{task.title}</div>
                                                      <div className="text-gray-600">
                                                         {format(startDate, 'HH:mm')} - {format(endDate, 'HH:mm')}
                                                      </div>
                                                   </div>
                                                );
                                             }
                                          });
                                       });
                                       return todaySessions;
                                    })()}

                                    {/* Eventos adicionales (workEvents) */}
                                    {workEvents.map((event) => {
                                       const startMinutes = parseInt(event.start_time.split(':')[0]) * 60 + parseInt(event.start_time.split(':')[1]);
                                       const endMinutes = parseInt(event.end_time.split(':')[0]) * 60 + parseInt(event.end_time.split(':')[1]);
                                       const startHour = (startMinutes / 60) - 8;
                                       const durationHours = (endMinutes - startMinutes) / 60;
                                       const top = startHour * 50;
                                       const height = durationHours * 50;
                                       
                                       return (
                                          <div
                                             key={event.id}
                                             className="absolute left-1 right-1 bg-purple-100 border border-purple-300 rounded px-2 py-1 text-xs overflow-hidden"
                                             style={{top: `${top}px`, height: `${height}px`}}
                                          >
                                             <div className="font-medium truncate flex items-center">
                                                <span className="mr-1">
                                                   {event.event_type === 'meeting' ? '🤝' :
                                                    event.event_type === 'daily' ? '🗣️' :
                                                    event.event_type === 'review' ? '📋' :
                                                    event.event_type === 'planning' ? '📅' :
                                                    event.event_type === 'training' ? '📚' :
                                                    event.event_type === 'break' ? '☕' : '📌'}
                                                </span>
                                                {event.title}
                                             </div>
                                             <div className="text-gray-600">
                                                {format(new Date(`1970-01-01T${event.start_time}`), "HH:mm")} - {format(new Date(`1970-01-01T${event.end_time}`), "HH:mm")}
                                             </div>
                                          </div>
                                       );
                                    })}
                                 </div>
                              </div>
                           </div>
                           
                           
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
