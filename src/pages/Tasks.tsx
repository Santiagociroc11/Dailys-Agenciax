import React from 'react';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logAudit } from '../lib/audit';
import { Plus, X, Users, Clock, ChevronUp, ChevronDown, FolderOpen, Search, CalendarDays, Sparkles, Upload } from 'lucide-react';
import { format, addDays, eachDayOfInterval, isWeekend, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import TaskStatusDisplay from '../components/TaskStatusDisplay';
import PhaseBadge from '../components/PhaseBadge';
import RichTextDisplay from '../components/RichTextDisplay';
import { ActivityChecklist } from '../components/ActivityChecklist';
import { TaskComments } from '../components/TaskComments';
import RichTextSummary from '../components/RichTextSummary';
import QuillEditor from '../components/QuillEditor';
import { SkeletonTaskList, SkeletonInline } from '../components/Skeleton';


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
  start_date: string;
  deadline: string;
  estimated_duration: number;
  priority: 'low' | 'medium' | 'high';
  is_sequential: boolean;
  created_at: string;
  created_by: string;
  project_id: string | null;
  phase_id?: string | null;
  status?: string;
  assigned_to?: string;
  assigned_users?: string[];
  checklist?: ChecklistItem[];
  comments?: { id: string; user_id: string; content: string; created_at: string }[];
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
  checklist?: ChecklistItem[];
  comments?: { id: string; user_id: string; content: string; created_at: string }[];
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
  phase_id: string | null;
  assigned_to: string[];
  subtasks: {
    title: string;
    description: string;
    estimated_duration: number;
    assigned_to: string;
    start_date: string;
    deadline: string;
    /** Nivel/orden secuencial (varias subtareas pueden tener el mismo número, ej. 1, 1, 2) */
    sequence_order?: number;
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
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [filterPhases, setFilterPhases] = useState<{ id: string; name: string; order: number }[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
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
  const [newSubtasksInEdit, setNewSubtasksInEdit] = useState<any[]>([]);
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
    phase_id: null,
    assigned_to: [],
    subtasks: [],
    project_id: null,
  });
  const [phases, setPhases] = useState<{ id: string; name: string; order: number }[]>([]);
  const [editPhases, setEditPhases] = useState<{ id: string; name: string; order: number }[]>([]);
  const [error, setError] = useState('');
  const [showGenerateDailyModal, setShowGenerateDailyModal] = useState(false);
  const [dailySubtaskConfig, setDailySubtaskConfig] = useState({
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(addDays(new Date(), 6), 'yyyy-MM-dd'),
    titlePrefix: '',
    assignee: '',
    duration: 15,
    includeWeekends: false,
  });
  const [generatingDaily, setGeneratingDaily] = useState(false);
  const [projectSelected, setProjectSelected] = useState(false);
  const [showSelectTaskForDailyModal, setShowSelectTaskForDailyModal] = useState(false);
  const [tasksForDailyModal, setTasksForDailyModal] = useState<Task[]>([]);
  const [dailyModalPhases, setDailyModalPhases] = useState<{ id: string; name: string; order: number }[]>([]);
  const [dailyModalProjectFilter, setDailyModalProjectFilter] = useState<string | null>(null);
  const [showSupervisionTaskModal, setShowSupervisionTaskModal] = useState(false);
  const [supervisionTaskConfig, setSupervisionTaskConfig] = useState({
    project_id: '',
    title: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(addDays(new Date(), 13), 'yyyy-MM-dd'),
    assignee: '',
    duration: 15,
    includeWeekends: false,
  });
  const [creatingSupervision, setCreatingSupervision] = useState(false);
  const [showQuickCreateModal, setShowQuickCreateModal] = useState(false);
  const [taskTemplates, setTaskTemplates] = useState<{ id: string; name: string; title: string; subtasks?: unknown[] }[]>([]);
  const [selectedTaskTemplateId, setSelectedTaskTemplateId] = useState<string | null>(null);
  const [savingAsTemplate, setSavingAsTemplate] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showBulkCreateModal, setShowBulkCreateModal] = useState(false);
  const [bulkTasks, setBulkTasks] = useState<{ title: string; duration: number; assignee: string }[]>([
    { title: '', duration: 60, assignee: '' },
  ]);
  const [bulkProjectId, setBulkProjectId] = useState<string | null>(null);
  const [bulkDeadline, setBulkDeadline] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [creatingBulk, setCreatingBulk] = useState(false);
  const [showCsvImportModal, setShowCsvImportModal] = useState(false);
  const [csvImportData, setCsvImportData] = useState<{ title: string; project_id: string; deadline: string; duration: number; assignee: string }[]>([]);
  const [csvImportProject, setCsvImportProject] = useState<string | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const csvInputRef = React.useRef<HTMLInputElement>(null);

  const TASK_DRAFT_KEY = 'dailys_newTask_draft';
  const draftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [quickTask, setQuickTask] = useState({
    title: '',
    project_id: '' as string | null,
    assigned_to: '' as string | null,
    deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  });
  const [selectedProjectDates, setSelectedProjectDates] = useState<{
    start_date: string;
    deadline: string;
  } | null>(null);

  // Estados para paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [tasksPerPage, setTasksPerPage] = useState(10);
  const [totalTasks, setTotalTasks] = useState(0);
  const [activeTab, setActiveTab] = useState<'active' | 'approved'>('active');

  // Función auxiliar para determinar si una tarea está aprobada
  const isTaskApproved = (taskId: string): boolean => {
    const taskSubtasks = subtasks[taskId] || [];
    if (taskSubtasks.length === 0) return false;
    return taskSubtasks.every(subtask => subtask.status === 'approved');
  };

  useEffect(() => {
    fetchTasks();
    fetchProjects();
  }, []);

  // Autoguardado local del borrador de nueva tarea (evita perder muchas subtareas por un error)
  useEffect(() => {
    if (!showModal) return;
    const hasContent = (newTask.title && newTask.title.trim()) || newTask.subtasks.length > 0;
    if (!hasContent) {
      try {
        localStorage.removeItem(TASK_DRAFT_KEY);
      } catch (_) { }
      return;
    }
    if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
    draftSaveTimeoutRef.current = setTimeout(() => {
      try {
        const draft = {
          newTask,
          projectSelected,
          selectedProjectDates,
          savedAt: Date.now(),
        };
        localStorage.setItem(TASK_DRAFT_KEY, JSON.stringify(draft));
      } catch (_) { }
      draftSaveTimeoutRef.current = null;
    }, 800);
    return () => {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = null;
      }
    };
  }, [showModal, newTask, projectSelected, selectedProjectDates]);

  // Restaurar borrador al abrir el modal de crear tarea (solo si hay borrador y el formulario está vacío)
  useEffect(() => {
    if (!showModal) return;
    const formEmpty = !(newTask.title?.trim()) && newTask.subtasks.length === 0;
    if (!formEmpty) return;
    try {
      const raw = localStorage.getItem(TASK_DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { newTask?: NewTask; projectSelected?: boolean; selectedProjectDates?: { start_date: string; deadline: string } };
      if (!d.newTask) return;
      const hasContent = (d.newTask.title && String(d.newTask.title).trim()) || (d.newTask.subtasks?.length ?? 0) > 0;
      if (!hasContent) return;
      setNewTask({
        ...d.newTask,
        title: d.newTask.title ?? '',
        description: d.newTask.description ?? '',
        start_date: d.newTask.start_date ?? format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        deadline: d.newTask.deadline ?? format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        estimated_duration: d.newTask.estimated_duration ?? 30,
        priority: (d.newTask.priority as 'low' | 'medium' | 'high') ?? 'medium',
        is_sequential: d.newTask.is_sequential ?? false,
        phase_id: d.newTask.phase_id ?? null,
        assigned_to: Array.isArray(d.newTask.assigned_to) ? d.newTask.assigned_to : [],
        subtasks: Array.isArray(d.newTask.subtasks) ? d.newTask.subtasks : [],
        project_id: d.newTask.project_id ?? null,
      });
      setProjectSelected(d.projectSelected ?? !!d.newTask.project_id);
      if (d.selectedProjectDates) setSelectedProjectDates(d.selectedProjectDates);
      toast.info('Borrador restaurado. Puedes seguir editando o descartar para empezar de cero.');
    } catch (_) { }
  }, [showModal]);

  useEffect(() => {
    async function loadTaskTemplates() {
      try {
        const { data } = await supabase.from('task_templates').select('id, name, title, subtasks').order('name');
        setTaskTemplates((data || []) as { id: string; name: string; title: string; subtasks?: unknown[] }[]);
      } catch {
        setTaskTemplates([]);
      }
    }
    loadTaskTemplates();
  }, []);

  useEffect(() => {
    async function fetchPhases() {
      if (!newTask.project_id) {
        setPhases([]);
        return;
      }
      const { data } = await supabase
        .from('phases')
        .select('id, name, order')
        .eq('project_id', newTask.project_id)
        .order('order', { ascending: true });
      setPhases((data || []) as { id: string; name: string; order: number }[]);
    }
    fetchPhases();
  }, [newTask.project_id]);

  useEffect(() => {
    async function loadFilterPhases() {
      if (selectedProject) {
        const { data } = await supabase
          .from('phases')
          .select('id, name, order')
          .eq('project_id', selectedProject)
          .order('order', { ascending: true });
        setFilterPhases((data || []) as { id: string; name: string; order: number }[]);
        setSelectedPhase(null);
      } else if (tasks.length > 0) {
        const projectIds = [...new Set(tasks.map((t) => t.project_id).filter(Boolean))] as string[];
        if (projectIds.length > 0) {
          const { data } = await supabase
            .from('phases')
            .select('id, name, order')
            .in('project_id', projectIds)
            .order('order', { ascending: true });
          setFilterPhases((data || []) as { id: string; name: string; order: number }[]);
        } else {
          setFilterPhases([]);
        }
        setSelectedPhase(null);
      } else {
        setFilterPhases([]);
        setSelectedPhase(null);
      }
    }
    loadFilterPhases();
  }, [selectedProject, tasks]);

  useEffect(() => {
    async function fetchEditPhases() {
      const projectId = selectedTask?.project_id || editedTask?.project_id;
      if (!projectId) {
        setEditPhases([]);
        return;
      }
      const { data } = await supabase
        .from('phases')
        .select('id, name, order')
        .eq('project_id', projectId)
        .order('order', { ascending: true });
      setEditPhases((data || []) as { id: string; name: string; order: number }[]);
    }
    fetchEditPhases();
  }, [selectedTask?.project_id, editedTask?.project_id]);

  useEffect(() => {
    if (showSelectTaskForDailyModal) {
      async function fetchForModal() {
        try {
          const { data: tasksData, error } = await supabase
            .from('tasks')
            .select(`
              id, title, start_date, deadline, project_id, phase_id, status,
              projects!inner(id, is_archived)
            `)
            .eq('projects.is_archived', false)
            .in('status', ['pending', 'in_progress', 'completed', 'in_review', 'returned', 'blocked'])
            .order('created_at', { ascending: false })
            .limit(100);
          if (error) throw error;
          const tasks = (tasksData || []) as Task[];
          setTasksForDailyModal(tasks);
          const projectIds = [...new Set(tasks.map((t) => t.project_id).filter(Boolean))] as string[];
          if (projectIds.length > 0) {
            const { data: phasesData } = await supabase
              .from('phases')
              .select('id, name, order')
              .in('project_id', projectIds)
              .order('order', { ascending: true });
            setDailyModalPhases((phasesData || []) as { id: string; name: string; order: number }[]);
          } else {
            setDailyModalPhases([]);
          }
        } catch (e) {
          console.error('Error fetching tasks for daily modal:', e);
          setTasksForDailyModal([]);
          setDailyModalPhases([]);
        }
      }
      fetchForModal();
    }
  }, [showSelectTaskForDailyModal]);

  useEffect(() => {
    setCurrentPage(1); // Resetear a la primera página cuando cambie el filtro
  }, [selectedProject, selectedPhase, searchTerm, activeTab]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        if (isAdmin && !showModal && !showQuickCreateModal) {
          setQuickTask({ title: '', project_id: null, assigned_to: null, deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm") });
          setShowQuickCreateModal(true);
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAdmin, showModal, showQuickCreateModal]);

  useEffect(() => {
    fetchTasks();
  }, [currentPage, tasksPerPage]);

  // Efecto para manejar cambios en la búsqueda con debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchTasks();
    }, 300); // Debounce de 300ms

    return () => clearTimeout(timeoutId);
  }, [searchTerm, activeTab]);

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
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error al cargar los proyectos:', error);
    }
  }

  async function fetchTasks() {
    try {
      setPageLoading(true);

      // Primero obtener el total de tareas para la paginación - excluyendo proyectos archivados
      let countQuery = supabase
        .from('tasks')
        .select(`
          *,
          projects!inner(id, is_archived)
        `, { count: 'exact', head: true })
        .eq('projects.is_archived', false);

      if (selectedProject) {
        countQuery = countQuery.eq('project_id', selectedProject);
      }
      if (selectedPhase) {
        countQuery = countQuery.eq('phase_id', selectedPhase);
      }

      if (searchTerm.trim()) {
        countQuery = countQuery.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
      }

      const { count, error: countError } = await countQuery;

      if (countError) throw countError;

      // Para el conteo preciso con filtros de pestañas, necesitamos obtener todas las tareas
      // y luego filtrarlas, ya que el filtro de pestañas depende de las subtareas
      let allTasksQuery = supabase
        .from('tasks')
        .select(`
          *,
          projects!inner(id, is_archived)
        `)
        .eq('projects.is_archived', false)
        .order('created_at', { ascending: false });

      if (selectedProject) {
        allTasksQuery = allTasksQuery.eq('project_id', selectedProject);
      }
      if (selectedPhase) {
        allTasksQuery = allTasksQuery.eq('phase_id', selectedPhase);
      }

      if (searchTerm.trim()) {
        allTasksQuery = allTasksQuery.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
      }

      const { data: allTasks, error: allTasksError } = await allTasksQuery;
      if (allTasksError) throw allTasksError;

      // Aplicar filtro de pestañas para el conteo
      let filteredForCount = allTasks || [];
      if (activeTab === 'approved') {
        filteredForCount = filteredForCount.filter(task => isTaskApproved(task.id));
      } else if (activeTab === 'active') {
        filteredForCount = filteredForCount.filter(task => !isTaskApproved(task.id));
      }

      setTotalTasks(filteredForCount.length);

      // Aplicar paginación a las tareas ya filtradas
      const from = (currentPage - 1) * tasksPerPage;
      const to = from + tasksPerPage;
      const paginatedTasks = filteredForCount.slice(from, to);

      setTasks(paginatedTasks);
    } catch (error) {
      console.error('Error al cargar las tareas:', error);
    } finally {
      setLoading(false);
      setPageLoading(false);
    }
  }

  async function fetchSubtasks() {
    try {
      console.log('Fetching subtasks...');
      const { data: subtasksData, error: subtasksError } = await supabase
        .from('subtasks')
        .select(`
            *,
            tasks!inner(
              id, project_id,
              projects!inner(id, is_archived)
            )
          `)
        .eq('tasks.projects.is_archived', false);

      if (subtasksError) {
        console.error('Error fetching subtasks:', subtasksError);
        throw subtasksError;
      }

      console.log('Subtasks data received:', subtasksData);
      const groupedSubtasks = (subtasksData || []).reduce((acc: Record<string, Subtask[]>, raw: Record<string, unknown>) => {
        // Normalizar subtareas migradas: MongoDB usa _id, el schema usa id; task_id puede venir de tasks (join)
        const taskId = raw.task_id as string | undefined;
        if (!taskId) {
          console.warn('Subtask sin task_id, omitiendo:', raw._id ?? raw.id);
          return acc;
        }
        const subtask: Subtask = {
          id: (raw.id as string) ?? String(raw._id),
          task_id: taskId,
          title: (raw.title as string) ?? '',
          description: (raw.description as string) ?? null,
          estimated_duration: (raw.estimated_duration as number) ?? 0,
          sequence_order: (raw.sequence_order as number) ?? null,
          assigned_to: (raw.assigned_to as string) ?? '',
          status: ((raw.status as string) ?? 'pending') as Subtask['status'],
          start_date: (raw.start_date as string) ?? null,
          deadline: (raw.deadline as string) ?? null,
          checklist: (raw.checklist as ChecklistItem[]) || [],
          comments: (raw.comments as { id: string; user_id: string; content: string; created_at: string }[]) || [],
        };
        acc[taskId] = [...(acc[taskId] || []), subtask];
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

  async function handleQuickCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !quickTask.title?.trim() || !quickTask.project_id) {
      toast.error('Título y proyecto son obligatorios.');
      return;
    }
    setError('');
    try {
      const proj = projects.find((p) => p.id === quickTask.project_id);
      const startDate = proj?.start_date || format(new Date(), "yyyy-MM-dd'T'HH:mm");
      const { data, error } = await supabase
        .from('tasks')
        .insert([{
          title: quickTask.title.trim(),
          description: '',
          start_date: startDate,
          deadline: quickTask.deadline,
          estimated_duration: 60,
          priority: 'medium',
          is_sequential: false,
          created_by: user.id,
          assigned_users: quickTask.assigned_to ? [quickTask.assigned_to] : [user.id],
          project_id: quickTask.project_id,
          status: 'pending',
        }])
        .select();
      if (error) throw error;
      const created = data?.[0] as { id: string };
      if (created && user?.id) {
        await logAudit({
          user_id: user.id,
          entity_type: 'task',
          entity_id: created.id,
          action: 'create',
          summary: `Tarea creada: ${quickTask.title.trim()}`,
        });
      }
      toast.success('Tarea creada');
      setShowQuickCreateModal(false);
      setQuickTask({ title: '', project_id: null, assigned_to: null, deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm") });
      await fetchTasks();
    } catch (err) {
      console.error('Error:', err);
      toast.error('Error al crear la tarea.');
    }
  }

  function openFullCreateFromQuick() {
    if (quickTask.project_id) {
      const proj = projects.find((p) => p.id === quickTask.project_id);
      setNewTask({
        title: quickTask.title,
        description: '',
        start_date: proj?.start_date || format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        deadline: quickTask.deadline,
        estimated_duration: 60,
        priority: 'medium',
        is_sequential: false,
        assigned_to: quickTask.assigned_to ? [quickTask.assigned_to] : [],
        subtasks: [],
        project_id: quickTask.project_id,
      });
      setProjectSelected(true);
    }
    setShowQuickCreateModal(false);
    setShowModal(true);
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (creatingTask) return;
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

    setCreatingTask(true);
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
        project_id: taskToCreate.project_id,
        phase_id: taskToCreate.phase_id || null,
      };

      const { data, error } = await supabase
        .from('tasks')
        .insert([taskData])
        .select();

      if (error) {
        console.error("Error detallado:", error);
        throw error;
      }

      // El API devuelve un documento cuando single:true, no un array
      const taskDoc = Array.isArray(data) ? data[0] : data;
      if (taskDoc) {
        const taskId = taskDoc.id;
        if (user?.id) {
          await logAudit({
            user_id: user.id,
            entity_type: 'task',
            entity_id: taskId,
            action: 'create',
            summary: `Tarea creada: ${taskData.title}`,
          });
        }
        if (newTask.subtasks.length > 0) {
          const taskStart = taskToCreate.start_date?.trim() || format(new Date(), "yyyy-MM-dd'T'HH:mm");
          const taskDeadline = taskToCreate.deadline?.trim() || format(new Date(), "yyyy-MM-dd'T'HH:mm");

          const subtasksToInsert = newTask.subtasks.map((subtask, index) => {
            const assignedTo = subtask.assigned_to && subtask.assigned_to.trim() !== ''
              ? subtask.assigned_to
              : user.id;
            const order = (subtask.sequence_order != null && subtask.sequence_order >= 1)
              ? subtask.sequence_order
              : index + 1;
            // start_date y deadline son NOT NULL en la tabla; formato ISO para Postgres
            const rawStart = subtask.start_date?.trim() || taskStart;
            const rawEnd = subtask.deadline?.trim() || taskDeadline;
            const startDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(rawStart) ? rawStart + ':00' : rawStart;
            const endDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(rawEnd) ? rawEnd + ':00' : rawEnd;

            return {
              task_id: taskId,
              title: (subtask.title || '').trim() || `Subtarea ${index + 1}`,
              description: subtask.description || '',
              estimated_duration: Number(subtask.estimated_duration) || 30,
              sequence_order: order,
              assigned_to: assignedTo,
              status: 'pending',
              start_date: startDate,
              deadline: endDate
            };
          });

          const { data: createdSubtasks, error: subtaskError } = await supabase
            .from('subtasks')
            .insert(subtasksToInsert)
            .select();

          if (subtaskError) {
            console.error("Error detallado de subtareas:", subtaskError);
            setError(`Error al crear las subtareas: ${subtaskError.message}. La tarea principal sí se creó. Revisa permisos o formato de datos.`);
            toast.error(`Las subtareas no se crearon: ${subtaskError.message}`);
            setCreatingTask(false);
            return;
          }
          if (user?.id && createdSubtasks) {
            const subs = Array.isArray(createdSubtasks) ? createdSubtasks : [createdSubtasks];
            for (const st of subs as { id: string; title: string }[]) {
              await logAudit({
                user_id: user.id,
                entity_type: 'subtask',
                entity_id: st.id,
                action: 'create',
                summary: `Subtarea creada: ${st.title}`,
              });
            }
          }
        }

        // Cerrar modal y resetear formulario de inmediato (no depender del refresco de lista)
        const taskArray = Array.isArray(data) ? data : (data ? [data] : []);
        setTasks([...taskArray, ...tasks]);
        try {
          localStorage.removeItem(TASK_DRAFT_KEY);
        } catch (_) { }
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
          phase_id: null,
          assigned_to: [],
          subtasks: [],
          project_id: null,
        });

        // Refrescar lista en segundo plano (no bloquear el cierre del modal)
        fetchTasks().then(() => fetchSubtasks()).catch((err) => console.error('Error refrescando lista:', err));

        // 🔔 Notificar a usuarios sobre tareas/subtareas disponibles inmediatamente
        try {
          const createdTask = taskDoc;

          // Obtener nombre del proyecto
          let projectName = "Proyecto sin nombre";
          if (createdTask.project_id) {
            const { data: projectData } = await supabase
              .from('projects')
              .select('name')
              .eq('id', createdTask.project_id)
              .eq('is_archived', false)
              .single();

            if (projectData) {
              projectName = projectData.name;
            }
          }

          if (newTask.subtasks.length > 0) {
            // Para tareas con subtareas, notificar usuarios de subtareas disponibles
            const { data: createdSubtasks } = await supabase
              .from('subtasks')
              .select('id, title, assigned_to, sequence_order')
              .eq('task_id', taskId)
              .order('sequence_order');

            if (createdSubtasks) {
              // Determinar qué subtareas están disponibles inmediatamente
              let availableSubtasks = [];

              if (createdTask.is_sequential) {
                // Para tareas secuenciales, solo la primera (sequence_order = 1)
                availableSubtasks = createdSubtasks.filter(st => st.sequence_order === 1);
              } else {
                // Para tareas paralelas, todas las subtareas están disponibles
                availableSubtasks = createdSubtasks;
              }

              // Notificar a cada usuario de subtareas disponibles
              for (const subtask of availableSubtasks) {
                if (subtask.assigned_to) {
                  fetch('/api/telegram/task-available', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      userIds: [subtask.assigned_to],
                      taskTitle: subtask.title,
                      projectName: projectName,
                      reason: 'created_available',
                      isSubtask: true,
                      parentTaskTitle: createdTask.title
                    })
                  }).then(response => {
                    if (response.ok) {
                      console.log(`✅ [NOTIFICATION] Notificación de subtarea creada enviada`);
                    } else {
                      console.warn(`⚠️ [NOTIFICATION] Error al enviar notificación de subtarea creada: ${response.status}`);
                    }
                  }).catch(error => {
                    console.error('🚨 [NOTIFICATION] Error al enviar notificación de subtarea creada:', error);
                  });
                }
              }
            }
          } else {
            // Para tareas sin subtareas, notificar usuarios asignados
            if (finalAssignedUsers && finalAssignedUsers.length > 0) {
              fetch('/api/telegram/task-available', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userIds: finalAssignedUsers,
                  taskTitle: createdTask.title,
                  projectName: projectName,
                  reason: 'created_available',
                  isSubtask: false
                })
              }).then(response => {
                if (response.ok) {
                  console.log(`✅ [NOTIFICATION] Notificación de tarea creada enviada`);
                } else {
                  console.warn(`⚠️ [NOTIFICATION] Error al enviar notificación de tarea creada: ${response.status}`);
                }
              }).catch(error => {
                console.error('🚨 [NOTIFICATION] Error al enviar notificación de tarea creada:', error);
              });
            }
          }
        } catch (notificationError) {
          console.error('🚨 [NOTIFICATION] Error preparando notificaciones de tarea creada:', notificationError);
        }
      }
    } catch (error) {
      console.error('Error al crear la tarea:', error);
      setError('Error al crear la tarea. Por favor, inténtalo de nuevo.');
    } finally {
      setCreatingTask(false);
    }
  }

  async function handleStatusUpdate(subtaskId: string, newStatus: 'pending' | 'in_progress' | 'completed' | 'approved') {
    try {
      console.log('Updating subtask status:', { subtaskId, newStatus });
      const { error } = await supabase
        .from('subtasks')
        .update({ status: newStatus })
        .eq('id', subtaskId);

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

  /** Genera las fechas diarias para subtareas según el rango y si incluir fines de semana */
  function getDailyDates(startStr: string, endStr: string, includeWeekends: boolean): Date[] {
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    if (start > end) return [];
    const days = eachDayOfInterval({ start, end });
    return includeWeekends ? days : days.filter(d => !isWeekend(d));
  }

  async function handleCreateSupervisionTask(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { project_id, title, startDate, endDate, assignee, duration, includeWeekends } = supervisionTaskConfig;
    if (!project_id || !title?.trim()) {
      toast.error('Proyecto y título son obligatorios.');
      return;
    }
    const dates = getDailyDates(startDate, endDate, includeWeekends);
    if (dates.length === 0) {
      toast.error('No hay días en el rango. Revisa las fechas.');
      return;
    }
    if (dates.length > 90) {
      toast.error('Máximo 90 días. Reduce el rango.');
      return;
    }
    setCreatingSupervision(true);
    try {
      const startDateTime = `${startDate}T09:00:00`;
      const endDateTime = `${endDate}T18:00:00`;
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert([{
          title: title.trim(),
          description: '',
          start_date: startDateTime,
          deadline: endDateTime,
          estimated_duration: duration * dates.length,
          priority: 'medium',
          is_sequential: false,
          created_by: user.id,
          assigned_users: assignee ? [assignee] : [user.id],
          project_id,
          status: 'pending',
        }])
        .select()
        .single();
      if (taskError) throw taskError;
      const taskId = (taskData as { id: string }).id;
      const prefix = title.trim().slice(0, 40);
      const subtasksToInsert = dates.map((date, i) => ({
        task_id: taskId,
        title: `${prefix} – ${format(date, 'd MMM', { locale: es })}`,
        description: '',
        estimated_duration: duration,
        sequence_order: i + 1,
        assigned_to: assignee || user.id,
        status: 'pending',
        start_date: format(date, "yyyy-MM-dd'T'09:00:00"),
        deadline: format(date, "yyyy-MM-dd'T'18:00:00"),
      }));
      const { error: subError } = await supabase.from('subtasks').insert(subtasksToInsert);
      if (subError) throw subError;
      await logAudit({
        user_id: user.id,
        entity_type: 'task',
        entity_id: taskId,
        action: 'create',
        summary: `Tarea de supervisión creada: ${title} (${dates.length} checkpoints diarios)`,
      });
      toast.success(`Tarea creada con ${dates.length} subtareas diarias`);
      setShowSupervisionTaskModal(false);
      setSupervisionTaskConfig({
        project_id: '',
        title: '',
        startDate: format(new Date(), 'yyyy-MM-dd'),
        endDate: format(addDays(new Date(), 13), 'yyyy-MM-dd'),
        assignee: '',
        duration: 15,
        includeWeekends: false,
      });
      await fetchTasks();
      await fetchSubtasks();
    } catch (err) {
      console.error('Error creando tarea de supervisión:', err);
      toast.error('Error al crear. Inténtalo de nuevo.');
    } finally {
      setCreatingSupervision(false);
    }
  }

  async function handleGenerateDailySubtasks() {
    if (!selectedTask || !user) return;
    const { startDate, endDate, titlePrefix, assignee, duration, includeWeekends } = dailySubtaskConfig;
    const dates = getDailyDates(startDate, endDate, includeWeekends);
    if (dates.length === 0) {
      toast.error('No hay días en el rango seleccionado. Revisa las fechas o activa "Incluir fines de semana".');
      return;
    }
    if (dates.length > 90) {
      toast.error('Máximo 90 días por generación. Reduce el rango.');
      return;
    }
    const prefix = (titlePrefix || selectedTask.title).trim().slice(0, 40);
    const currentCount = subtasks[selectedTask.id]?.length || 0;
    setGeneratingDaily(true);
    try {
      const subtasksToInsert = dates.map((date, i) => ({
        task_id: selectedTask.id,
        title: `${prefix} – ${format(date, 'd MMM', { locale: es })}`,
        description: '',
        estimated_duration: duration,
        sequence_order: currentCount + i + 1,
        assigned_to: assignee || user.id,
        status: 'pending',
        start_date: format(date, "yyyy-MM-dd'T'09:00:00"),
        deadline: format(date, "yyyy-MM-dd'T'18:00:00"),
      }));
      const { error } = await supabase.from('subtasks').insert(subtasksToInsert);
      if (error) throw error;
      if (user?.id) {
        await logAudit({
          user_id: user.id,
          entity_type: 'subtask',
          entity_id: selectedTask.id,
          action: 'create',
          summary: `${dates.length} subtareas diarias creadas para tarea: ${selectedTask.title}`,
        });
      }
      toast.success(`${dates.length} subtareas diarias creadas correctamente`);
      setShowGenerateDailyModal(false);
      await fetchSubtasks();
      setEditedSubtasks({});
    } catch (err) {
      console.error('Error generando subtareas diarias:', err);
      toast.error('Error al crear las subtareas. Inténtalo de nuevo.');
    } finally {
      setGeneratingDaily(false);
    }
  }

  async function handleUpdateTask() {
    if (!selectedTask || !editedTask) return;

    try {
      // 🔔 Verificar cambios en asignación antes de actualizar
      const previousAssignedUsers = selectedTask.assigned_users || [];
      const newAssignedUsers = editedTask.assigned_users || [];
      const previousIsSequential = selectedTask.is_sequential;
      const newIsSequential = editedTask.is_sequential;

      // Detectar usuarios recién asignados
      const newlyAssignedUsers = newAssignedUsers.filter(userId => !previousAssignedUsers.includes(userId));

      // Detectar cambio de secuencial a paralelo
      const sequentialToParallel = previousIsSequential && !newIsSequential;

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
          phase_id: editedTask.phase_id ?? null,
          assigned_users: editedTask.assigned_users
        })
        .eq('id', selectedTask.id);

      if (error) {
        console.error("Error al actualizar la tarea:", error);
        throw error;
      }

      // 🔔 Notificar cambios después de actualización exitosa
      try {
        // Obtener nombre del proyecto
        let projectName = "Proyecto sin nombre";
        if (editedTask.project_id) {
          const { data: projectData } = await supabase
            .from('projects')
            .select('name')
            .eq('id', editedTask.project_id)
            .eq('is_archived', false)
            .single();

          if (projectData) {
            projectName = projectData.name;
          }
        }

        // Notificar usuarios recién asignados (solo si tarea está pendiente)
        if (newlyAssignedUsers.length > 0 && selectedTask.status === 'pending') {
          const { data: subtasksData } = await supabase
            .from('subtasks')
            .select('*')
            .eq('task_id', selectedTask.id);

          if (!subtasksData || subtasksData.length === 0) {
            // Tarea sin subtareas - notificar directamente
            fetch('/api/telegram/task-available', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userIds: newlyAssignedUsers,
                taskTitle: editedTask.title,
                projectName: projectName,
                reason: 'created_available',
                isSubtask: false
              })
            }).then(response => {
              if (response.ok) {
                console.log(`✅ [NOTIFICATION] Notificación de asignación enviada a nuevos usuarios`);
              }
            }).catch(error => {
              console.error('🚨 [NOTIFICATION] Error enviando notificación de asignación:', error);
            });
          }
        }

        // Notificar cambio de secuencial a paralelo
        if (sequentialToParallel && selectedTask.status === 'pending') {
          const { data: pendingSubtasks } = await supabase
            .from('subtasks')
            .select('assigned_to, title')
            .eq('task_id', selectedTask.id)
            .eq('status', 'pending')
            .gt('sequence_order', 1); // Subtareas que no están en el primer nivel

          if (pendingSubtasks && pendingSubtasks.length > 0) {
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
                    parentTaskTitle: editedTask.title
                  })
                }).then(response => {
                  if (response.ok) {
                    console.log(`✅ [NOTIFICATION] Notificación de cambio secuencial→paralelo enviada`);
                  }
                }).catch(error => {
                  console.error('🚨 [NOTIFICATION] Error enviando notificación secuencial→paralelo:', error);
                });
              }
            }
          }
        }
      } catch (notificationError) {
        console.error('🚨 [NOTIFICATION] Error en notificaciones de actualización de tarea:', notificationError);
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
      // 🔔 Verificar cambios antes de actualizar
      const previousAssignedTo = selectedSubtask.assigned_to;
      const newAssignedTo = editedSubtask.assigned_to;
      const previousSequenceOrder = selectedSubtask.sequence_order;
      const newSequenceOrder = editedSubtask.sequence_order;

      // Detectar cambio de usuario asignado
      const assignmentChanged = previousAssignedTo !== newAssignedTo;

      // Detectar cambio de orden de secuencia
      const sequenceOrderChanged = previousSequenceOrder !== newSequenceOrder;

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

      // 🔔 Notificar cambios después de actualización exitosa
      try {
        // Obtener información de la tarea padre y proyecto
        let projectName = "Proyecto sin nombre";
        let parentTaskTitle = "Tarea sin nombre";
        let isTaskSequential = false;

        const { data: parentTask } = await supabase
          .from('tasks')
          .select('title, project_id, is_sequential')
          .eq('id', selectedSubtask.task_id)
          .single();

        if (parentTask) {
          parentTaskTitle = parentTask.title;
          isTaskSequential = parentTask.is_sequential;

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

        // Notificar nuevo usuario asignado (solo si subtarea está pendiente)
        if (assignmentChanged && newAssignedTo && selectedSubtask.status === 'pending') {
          // Verificar si la subtarea está disponible según dependencias secuenciales
          let isAvailable = true;

          if (isTaskSequential && newSequenceOrder && newSequenceOrder > 1) {
            // Verificar que todos los niveles anteriores estén aprobados
            const { data: previousSubtasks } = await supabase
              .from('subtasks')
              .select('status, sequence_order')
              .eq('task_id', selectedSubtask.task_id)
              .lt('sequence_order', newSequenceOrder);

            if (previousSubtasks) {
              const groupedByLevel = previousSubtasks.reduce((acc, st) => {
                const level = st.sequence_order || 0;
                if (!acc[level]) acc[level] = [];
                acc[level].push(st);
                return acc;
              }, {} as Record<number, any[]>);

              // Verificar que todos los niveles anteriores estén completamente aprobados
              for (const level in groupedByLevel) {
                if (parseInt(level) < newSequenceOrder) {
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
            fetch('/api/telegram/task-available', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userIds: [newAssignedTo],
                taskTitle: editedSubtask.title,
                projectName: projectName,
                reason: 'created_available',
                isSubtask: true,
                parentTaskTitle: parentTaskTitle
              })
            }).then(response => {
              if (response.ok) {
                console.log(`✅ [NOTIFICATION] Notificación de reasignación de subtarea enviada`);
              }
            }).catch(error => {
              console.error('🚨 [NOTIFICATION] Error enviando notificación de reasignación:', error);
            });
          }
        }

        // Notificar cambios de orden de secuencia que pueden liberar dependencias
        if (sequenceOrderChanged && isTaskSequential && selectedSubtask.status === 'pending') {
          // Si se movió a un nivel anterior y está disponible, notificar
          if (newSequenceOrder && previousSequenceOrder && newSequenceOrder < previousSequenceOrder) {
            fetch('/api/telegram/task-available', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userIds: [newAssignedTo || previousAssignedTo].filter(Boolean),
                taskTitle: editedSubtask.title,
                projectName: projectName,
                reason: 'sequential_dependency_completed',
                isSubtask: true,
                parentTaskTitle: parentTaskTitle
              })
            }).then(response => {
              if (response.ok) {
                console.log(`✅ [NOTIFICATION] Notificación de reordenamiento de secuencia enviada`);
              }
            }).catch(error => {
              console.error('🚨 [NOTIFICATION] Error enviando notificación de reordenamiento:', error);
            });
          }
        }
      } catch (notificationError) {
        console.error('🚨 [NOTIFICATION] Error en notificaciones de actualización de subtarea:', notificationError);
      }

      await fetchSubtasks();
      setShowSubtaskDetailModal(false);
    } catch (error) {
      console.error('Error al actualizar la subtarea:', error);
      setError('Error al actualizar la subtarea. Por favor, inténtalo de nuevo.');
    }
  }

  async function handleDuplicateTask() {
    if (!selectedTask || !user) return;
    try {
      const taskSubs = subtasks[selectedTask.id] || [];
      const startDate = selectedTask.start_date ? new Date(selectedTask.start_date) : new Date();
      const endDate = selectedTask.deadline ? new Date(selectedTask.deadline) : addDays(new Date(), 7);
      const offsetDays = 7;
      const newStart = addDays(startDate, offsetDays);
      const newEnd = addDays(endDate, offsetDays);
      const newStartStr = format(newStart, "yyyy-MM-dd'T'HH:mm");
      const newEndStr = format(newEnd, "yyyy-MM-dd'T'HH:mm");
      const { data: newTaskData, error: taskErr } = await supabase
        .from('tasks')
        .insert([{
          title: `${selectedTask.title} (copia)`,
          description: selectedTask.description || '',
          start_date: newStartStr,
          deadline: newEndStr,
          estimated_duration: selectedTask.estimated_duration,
          priority: selectedTask.priority,
          is_sequential: selectedTask.is_sequential,
          created_by: user.id,
          assigned_users: selectedTask.assigned_users || [],
          project_id: selectedTask.project_id,
          status: 'pending',
        }])
        .select()
        .single();
      if (taskErr) throw taskErr;
      const newTaskId = (newTaskData as { id: string }).id;
      if (taskSubs.length > 0) {
        const subsToInsert = taskSubs.map((s, i) => {
          const sStart = s.start_date ? new Date(s.start_date) : newStart;
          const sEnd = s.deadline ? new Date(s.deadline) : newEnd;
          return {
            task_id: newTaskId,
            title: s.title,
            description: s.description || '',
            estimated_duration: s.estimated_duration,
            sequence_order: s.sequence_order ?? i + 1,
            assigned_to: s.assigned_to,
            status: 'pending',
            start_date: format(addDays(sStart, offsetDays), "yyyy-MM-dd'T'HH:mm"),
            deadline: format(addDays(sEnd, offsetDays), "yyyy-MM-dd'T'HH:mm"),
          };
        });
        const { error: subErr } = await supabase.from('subtasks').insert(subsToInsert);
        if (subErr) throw subErr;
      }
      await logAudit({
        user_id: user.id,
        entity_type: 'task',
        entity_id: newTaskId,
        action: 'create',
        summary: `Tarea duplicada: ${selectedTask.title}`,
      });
      toast.success('Tarea duplicada correctamente');
      setShowTaskDetailModal(false);
      setSelectedTask(null);
      await fetchTasks();
      await fetchSubtasks();
    } catch (err) {
      console.error('Error duplicando tarea:', err);
      toast.error('Error al duplicar');
    }
  }

  async function handleSaveTaskAsTemplate() {
    if (!selectedTask || !user) return;
    const name = newTemplateName.trim() || `${selectedTask.title} (plantilla)`;
    setSavingAsTemplate(true);
    try {
      const { data, error } = await supabase.rpc('create_task_template_from_task', {
        task_id: selectedTask.id,
        template_name: name,
        created_by: user.id,
      });
      if (error) throw error;
      if (data && user?.id) {
        await logAudit({
          user_id: user.id,
          entity_type: 'project_template',
          entity_id: (data as { id?: string }).id || '',
          action: 'create',
          summary: `Plantilla de tarea creada: ${name}`,
        });
      }
      toast.success('Plantilla guardada');
      setShowSaveTemplateModal(false);
      setNewTemplateName('');
      const { data: updated } = await supabase.from('task_templates').select('id, name, title, subtasks').order('name');
      setTaskTemplates((updated || []) as { id: string; name: string; title: string; subtasks?: unknown[] }[]);
    } catch (err) {
      console.error('Error guardando plantilla:', err);
      toast.error('Error al guardar plantilla');
    } finally {
      setSavingAsTemplate(false);
    }
  }

  async function handleCreateFromTaskTemplate(projectId?: string, startDate?: string, deadline?: string) {
    const pid = projectId ?? newTask.project_id;
    if (!selectedTaskTemplateId || !user || !pid) return;
    const tpl = taskTemplates.find((t) => t.id === selectedTaskTemplateId);
    if (!tpl) return;
    const proj = projects.find((p) => p.id === pid);
    const start = startDate ?? proj?.start_date ?? format(new Date(), "yyyy-MM-dd'T'HH:mm");
    const end = deadline ?? proj?.deadline ?? format(addDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm");
    try {
      const { data, error } = await supabase.rpc('create_task_from_template', {
        template_id: selectedTaskTemplateId,
        project_id: pid,
        start_date: start.replace(' ', 'T').slice(0, 16),
        deadline: end.replace(' ', 'T').slice(0, 16),
        created_by: user.id,
        assigned_users: newTask.assigned_to.length > 0 ? newTask.assigned_to : [user.id],
      });
      if (error) throw error;
      if (data && user?.id) {
        await logAudit({
          user_id: user.id,
          entity_type: 'task',
          entity_id: (data as { id?: string }).id || '',
          action: 'create',
          summary: `Tarea creada desde plantilla: ${tpl.title}`,
        });
      }
      toast.success('Tarea creada desde plantilla');
      setShowModal(false);
      setProjectSelected(false);
      setSelectedTaskTemplateId(null);
      setNewTask({
        title: '',
        description: '',
        start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        estimated_duration: 30,
        priority: 'medium',
        is_sequential: false,
        phase_id: null,
        assigned_to: [],
        subtasks: [],
        project_id: null,
      });
      await fetchTasks();
      await fetchSubtasks();
    } catch (err) {
      console.error('Error creando desde plantilla:', err);
      toast.error('Error al crear desde plantilla');
    }
  }

  function parseCsvFile(file: File): Promise<{ title: string; project_id: string; deadline: string; duration: number; assignee: string }[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = (e.target?.result as string) || '';
          const lines = text.split(/\r?\n/).filter((l) => l.trim());
          if (lines.length < 2) {
            resolve([]);
            return;
          }
          const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
          const titleIdx = headers.findIndex((h) => h === 'titulo' || h === 'title');
          const durationIdx = headers.findIndex((h) => h === 'duracion' || h === 'duration' || h === 'duration_min');
          const assigneeIdx = headers.findIndex((h) => h === 'asignado' || h === 'assignee' || h === 'email');
          const deadlineIdx = headers.findIndex((h) => h === 'fecha_limite' || h === 'deadline' || h === 'fecha');
          const result: { title: string; project_id: string; deadline: string; duration: number; assignee: string }[] = [];
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
            const title = titleIdx >= 0 ? cols[titleIdx] || '' : cols[0] || '';
            if (!title) continue;
            const duration = durationIdx >= 0 ? Number(cols[durationIdx]) || 60 : 60;
            const assignee = assigneeIdx >= 0 ? cols[assigneeIdx] || '' : '';
            let deadline = deadlineIdx >= 0 ? cols[deadlineIdx] || '' : '';
            if (deadline && !deadline.includes('T')) {
              deadline = deadline.length === 10 ? `${deadline}T18:00:00` : deadline;
            }
            if (!deadline) deadline = format(addDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm");
            result.push({ title, project_id: '', deadline, duration, assignee });
          }
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Error leyendo archivo'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  async function handleCsvFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseCsvFile(file);
      setCsvImportData(rows);
      setShowCsvImportModal(true);
      if (!csvImportProject && projects.length > 0) setCsvImportProject(projects[0].id);
    } catch (err) {
      toast.error('Error al leer el CSV');
    }
    e.target.value = '';
  }

  async function handleCsvImport(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !csvImportProject) {
      toast.error('Selecciona un proyecto');
      return;
    }
    const valid = csvImportData.filter((r) => r.title?.trim());
    if (valid.length === 0) {
      toast.error('No hay filas válidas');
      return;
    }
    setImportingCsv(true);
    try {
      const proj = projects.find((p) => p.id === csvImportProject);
      const startDate = proj?.start_date || format(new Date(), "yyyy-MM-dd'T'HH:mm");
      const tasksToInsert = valid.map((r) => {
        let assigneeId = user.id;
        if (r.assignee) {
          const u = users.find((us) => us.email === r.assignee || us.id === r.assignee || us.name === r.assignee);
          if (u) assigneeId = u.id;
        }
        return {
          title: r.title.trim(),
          description: '',
          start_date: startDate,
          deadline: r.deadline,
          estimated_duration: r.duration,
          priority: 'medium',
          is_sequential: false,
          created_by: user.id,
          assigned_users: [assigneeId],
          project_id: csvImportProject,
          status: 'pending',
        };
      });
      const { data, error } = await supabase.from('tasks').insert(tasksToInsert).select();
      if (error) throw error;
      for (const d of (data || []) as { id: string; title: string }[]) {
        if (user?.id) {
          await logAudit({
            user_id: user.id,
            entity_type: 'task',
            entity_id: d.id,
            action: 'create',
            summary: `Tarea creada (CSV): ${d.title}`,
          });
        }
      }
      toast.success(`${valid.length} tareas importadas`);
      setShowCsvImportModal(false);
      setCsvImportData([]);
      await fetchTasks();
    } catch (err) {
      console.error('Error importando CSV:', err);
      toast.error('Error al importar');
    } finally {
      setImportingCsv(false);
    }
  }

  async function handleBulkCreateTasks(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !bulkProjectId) {
      toast.error('Selecciona un proyecto');
      return;
    }
    const valid = bulkTasks.filter((t) => t.title?.trim());
    if (valid.length === 0) {
      toast.error('Añade al menos una tarea con título');
      return;
    }
    setCreatingBulk(true);
    try {
      const proj = projects.find((p) => p.id === bulkProjectId);
      const startDate = proj?.start_date || format(new Date(), "yyyy-MM-dd'T'HH:mm");
      const tasksToInsert = valid.map((t) => ({
        title: t.title.trim(),
        description: '',
        start_date: startDate,
        deadline: bulkDeadline,
        estimated_duration: t.duration,
        priority: 'medium',
        is_sequential: false,
        created_by: user.id,
        assigned_users: t.assignee ? [t.assignee] : [user.id],
        project_id: bulkProjectId,
        status: 'pending',
      }));
      const { data, error } = await supabase.from('tasks').insert(tasksToInsert).select();
      if (error) throw error;
      for (const d of (data || []) as { id: string; title: string }[]) {
        if (user?.id) {
          await logAudit({
            user_id: user.id,
            entity_type: 'task',
            entity_id: d.id,
            action: 'create',
            summary: `Tarea creada: ${d.title}`,
          });
        }
      }
      toast.success(`${valid.length} tareas creadas`);
      setShowBulkCreateModal(false);
      setBulkTasks([{ title: '', duration: 60, assignee: '' }]);
      setBulkProjectId(null);
      await fetchTasks();
    } catch (err) {
      console.error('Error creando tareas:', err);
      toast.error('Error al crear las tareas');
    } finally {
      setCreatingBulk(false);
    }
  }

  async function handleDeleteTask() {
    if (!selectedTask) return;

    if (!window.confirm('¿Estás seguro de que deseas eliminar esta tarea y todas sus subtareas? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      console.log('🗑️ Iniciando eliminación de tarea:', selectedTask.id);

      // 1. Primero obtener todos los IDs de subtareas
      const { data: subtasksData, error: subtasksQueryError } = await supabase
        .from('subtasks')
        .select('id')
        .eq('task_id', selectedTask.id);

      if (subtasksQueryError) {
        console.error("❌ Error al consultar subtareas:", subtasksQueryError);
        throw subtasksQueryError;
      }

      console.log('📝 Subtareas encontradas:', subtasksData?.length || 0);

      // 2. Eliminar TODAS las asignaciones de trabajo relacionadas (con diferentes criterios)
      if (subtasksData && subtasksData.length > 0) {
        const subtaskIds = subtasksData.map(s => s.id);
        console.log('🔗 Eliminando asignaciones de trabajo para subtareas:', subtaskIds);

        // Eliminar por subtask_id (cuando task_type = 'subtask')
        const { error: subtaskWorkAssignmentsError1 } = await supabase
          .from('task_work_assignments')
          .delete()
          .in('subtask_id', subtaskIds);

        if (subtaskWorkAssignmentsError1) {
          console.error("❌ Error al eliminar asignaciones por subtask_id:", subtaskWorkAssignmentsError1);
          throw subtaskWorkAssignmentsError1;
        }

        // También eliminar por task_id cuando se refiere a subtareas
        const { error: subtaskWorkAssignmentsError2 } = await supabase
          .from('task_work_assignments')
          .delete()
          .in('task_id', subtaskIds)
          .eq('task_type', 'subtask');

        if (subtaskWorkAssignmentsError2) {
          console.error("❌ Error al eliminar asignaciones por task_id (subtareas):", subtaskWorkAssignmentsError2);
          throw subtaskWorkAssignmentsError2;
        }

        console.log('✅ Asignaciones de subtareas eliminadas');
      }

      // 3. Eliminar asignaciones de trabajo de la tarea principal
      console.log('🔗 Eliminando asignaciones de la tarea principal:', selectedTask.id);
      const { error: taskWorkAssignmentsError } = await supabase
        .from('task_work_assignments')
        .delete()
        .eq('task_id', selectedTask.id)
        .eq('task_type', 'task');

      if (taskWorkAssignmentsError) {
        console.error("❌ Error al eliminar asignaciones de la tarea principal:", taskWorkAssignmentsError);
        throw taskWorkAssignmentsError;
      }

      console.log('✅ Asignaciones de tarea principal eliminadas');

      // 4. Eliminar subtareas
      if (subtasksData && subtasksData.length > 0) {
        console.log('🗑️ Eliminando subtareas');
        const { error: subtasksError } = await supabase
          .from('subtasks')
          .delete()
          .eq('task_id', selectedTask.id);

        if (subtasksError) {
          console.error("❌ Error al eliminar subtareas:", subtasksError);
          throw subtasksError;
        }

        console.log('✅ Subtareas eliminadas');
      }

      // 5. Finalmente eliminar la tarea principal
      console.log('🗑️ Eliminando tarea principal');
      const { error: taskError } = await supabase
        .from('tasks')
        .delete()
        .eq('id', selectedTask.id);

      if (taskError) {
        console.error("❌ Error al eliminar la tarea principal:", taskError);
        throw taskError;
      }

      console.log('✅ Tarea principal eliminada exitosamente');

      await fetchTasks();
      await fetchSubtasks();
      setShowTaskDetailModal(false);
      setError(''); // Limpiar cualquier error previo

    } catch (error) {
      console.error('💥 Error al eliminar la tarea:', error);
      setError(`Error al eliminar la tarea: ${error instanceof Error ? error.message : 'Por favor, inténtalo de nuevo.'}`);
    }
  }

  async function handleDeleteSubtask() {
    if (!selectedSubtask) return;

    if (!window.confirm('¿Estás seguro de que deseas eliminar esta subtarea? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      console.log('🗑️ Iniciando eliminación de subtarea:', selectedSubtask.id);

      // 1. Eliminar TODAS las asignaciones de trabajo de la subtarea (con diferentes criterios)
      console.log('🔗 Eliminando asignaciones de trabajo para subtarea:', selectedSubtask.id);

      // Eliminar por subtask_id
      const { error: workAssignmentsError1 } = await supabase
        .from('task_work_assignments')
        .delete()
        .eq('subtask_id', selectedSubtask.id);

      if (workAssignmentsError1) {
        console.error("❌ Error al eliminar asignaciones por subtask_id:", workAssignmentsError1);
        throw workAssignmentsError1;
      }

      // También eliminar por task_id cuando se refiere a esta subtarea
      const { error: workAssignmentsError2 } = await supabase
        .from('task_work_assignments')
        .delete()
        .eq('task_id', selectedSubtask.id)
        .eq('task_type', 'subtask');

      if (workAssignmentsError2) {
        console.error("❌ Error al eliminar asignaciones por task_id:", workAssignmentsError2);
        throw workAssignmentsError2;
      }

      console.log('✅ Asignaciones de subtarea eliminadas');

      // 2. Luego eliminar la subtarea
      console.log('🗑️ Eliminando subtarea');
      const { error: subtaskError } = await supabase
        .from('subtasks')
        .delete()
        .eq('id', selectedSubtask.id);

      if (subtaskError) {
        console.error("❌ Error al eliminar la subtarea:", subtaskError);
        throw subtaskError;
      }

      console.log('✅ Subtarea eliminada exitosamente');

      await fetchSubtasks();
      setShowSubtaskDetailModal(false);
      setError(''); // Limpiar cualquier error previo

    } catch (error) {
      console.error('💥 Error al eliminar la subtarea:', error);
      setError(`Error al eliminar la subtarea: ${error instanceof Error ? error.message : 'Por favor, inténtalo de nuevo.'}`);
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
          project_id: editedTask.project_id,
          phase_id: editedTask.phase_id ?? null,
          assigned_users: editedTask.assigned_users
        })
        .eq('id', selectedTask.id);

      if (taskError) {
        console.error("Error al actualizar la tarea:", taskError);
        throw taskError;
      }

      // Actualizar subtareas existentes
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

      // Crear nuevas subtareas si existen
      if (newSubtasksInEdit.length > 0) {
        const currentSubtasksCount = subtasks[selectedTask.id]?.length || 0;
        const subtasksToInsert = newSubtasksInEdit.map((newSubtask, index) => ({
          task_id: selectedTask.id,
          title: newSubtask.title,
          description: newSubtask.description || '',
          estimated_duration: newSubtask.estimated_duration || 0,
          sequence_order: currentSubtasksCount + index + 1,
          assigned_to: newSubtask.assigned_to || user?.id,
          status: 'pending',
          start_date: newSubtask.start_date || null,
          deadline: newSubtask.deadline || null
        }));

        const { data: insertedSubtasks, error: newSubtasksError } = await supabase
          .from('subtasks')
          .insert(subtasksToInsert)
          .select();

        if (newSubtasksError) {
          console.error("Error al crear nuevas subtareas:", newSubtasksError);
          toast.error(`La tarea se actualizó pero hubo un error al crear las nuevas subtareas: ${newSubtasksError.message}`);
        }
        if (user?.id && insertedSubtasks) {
          for (const st of insertedSubtasks as { id: string; title: string }[]) {
            await logAudit({
              user_id: user.id,
              entity_type: 'subtask',
              entity_id: st.id,
              action: 'create',
              summary: `Subtarea creada (en edición): ${st.title}`,
            });
          }
        }
        // 🔔 Notificar usuarios de nuevas subtareas creadas
        if (insertedSubtasks && insertedSubtasks.length > 0) {
          try {
            // Obtener información del proyecto
            let projectName = "Proyecto sin nombre";
            if (editedTask.project_id) {
              const { data: projectData } = await supabase
                .from('projects')
                .select('name')
                .eq('id', editedTask.project_id)
                .eq('is_archived', false)
                .single();

              if (projectData) {
                projectName = projectData.name;
              }
            }

            // Determinar qué subtareas están disponibles inmediatamente
            let availableSubtasks = [];

            if (editedTask.is_sequential) {
              // Para tareas secuenciales, verificar cuál es el primer nivel disponible
              const { data: existingSubtasks } = await supabase
                .from('subtasks')
                .select('sequence_order, status')
                .eq('task_id', selectedTask.id)
                .order('sequence_order');

              if (existingSubtasks) {
                // Agrupar todas las subtareas por nivel
                const allSubtasks = [...existingSubtasks, ...insertedSubtasks.map(s => ({ sequence_order: s.sequence_order, status: s.status }))];
                const groupedByLevel = allSubtasks.reduce((acc, st) => {
                  const level = st.sequence_order || 0;
                  if (!acc[level]) acc[level] = [];
                  acc[level].push(st);
                  return acc;
                }, {} as Record<number, any[]>);

                // Encontrar el primer nivel que no está completamente aprobado
                let firstAvailableLevel = 1;
                for (const level in groupedByLevel) {
                  const levelNum = parseInt(level);
                  const levelSubtasks = groupedByLevel[levelNum];
                  if (levelSubtasks.every(st => st.status === 'approved')) {
                    firstAvailableLevel = levelNum + 1;
                  } else {
                    break;
                  }
                }

                // Solo notificar subtareas del primer nivel disponible
                availableSubtasks = insertedSubtasks.filter(st => st.sequence_order === firstAvailableLevel);
              }
            } else {
              // Para tareas paralelas, todas las nuevas subtareas están disponibles
              availableSubtasks = insertedSubtasks;
            }

            // Enviar notificaciones a usuarios de subtareas disponibles
            for (const subtask of availableSubtasks) {
              if (subtask.assigned_to) {
                fetch('/api/telegram/task-available', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    userIds: [subtask.assigned_to],
                    taskTitle: subtask.title,
                    projectName: projectName,
                    reason: 'created_available',
                    isSubtask: true,
                    parentTaskTitle: editedTask.title
                  })
                }).then(response => {
                  if (response.ok) {
                    console.log(`✅ [NOTIFICATION] Notificación de nueva subtarea enviada: ${subtask.title}`);
                  }
                }).catch(error => {
                  console.error('🚨 [NOTIFICATION] Error enviando notificación de nueva subtarea:', error);
                });
              }
            }
          } catch (notificationError) {
            console.error('🚨 [NOTIFICATION] Error en notificaciones de nuevas subtareas:', notificationError);
          }
        }
      }

      await fetchTasks();
      await fetchSubtasks();
      setShowTaskDetailModal(false);
      setEditMode(false);
      setEditedSubtasks({});
      setNewSubtasksInEdit([]);

    } catch (error) {
      console.error('Error al actualizar la tarea y subtareas:', error);
      setError('Error al actualizar. Por favor, inténtalo de nuevo.');
    }
  }

  if (loading) {
    return <SkeletonTaskList />;
  }

  // Funciones para manejar la paginación
  const totalPages = Math.ceil(totalTasks / tasksPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

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
    <div className="p-6 relative">
      {isAdmin && (
        <button
          onClick={() => {
            setQuickTask({ title: '', project_id: null, assigned_to: null, deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm") });
            setShowQuickCreateModal(true);
          }}
          className="fixed bottom-8 right-8 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg flex items-center justify-center z-40 transition-transform hover:scale-110"
          title="Crear tarea rápida (Ctrl+N)"
        >
          <Plus className="w-7 h-7" />
        </button>
      )}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tareas</h1>
          <p className="text-gray-600">Gestiona tus tareas y asignaciones</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button
                onClick={() => setShowSupervisionTaskModal(true)}
                className="bg-teal-600 text-white px-4 py-2 rounded-md hover:bg-teal-700 flex items-center gap-2"
                title="Crear tarea de supervisión con checkpoints diarios en un solo paso"
              >
                <Sparkles className="w-5 h-5" />
                Tarea supervisión
              </button>
              <button
                onClick={() => setShowSelectTaskForDailyModal(true)}
                className="bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 flex items-center gap-2"
                title="Añadir subtareas diarias a una tarea existente"
              >
                <CalendarDays className="w-5 h-5" />
                Subtareas diarias
              </button>
              <button
                onClick={() => {
                  setQuickTask({ title: '', project_id: null, assigned_to: null, deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm") });
                  setShowQuickCreateModal(true);
                }}
                className="bg-indigo-500 text-white px-4 py-2 rounded-md hover:bg-indigo-600 flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Crear rápida
              </button>
              <button
                onClick={() => csvInputRef.current?.click()}
                className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 flex items-center gap-2"
              >
                <Upload className="w-5 h-5" />
                Importar CSV
              </button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                onChange={handleCsvFileSelect}
                className="hidden"
              />
              <button
                onClick={() => {
                  setBulkTasks([{ title: '', duration: 60, assignee: '' }]);
                  setBulkProjectId(null);
                  setBulkDeadline(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
                  setShowBulkCreateModal(true);
                }}
                className="bg-indigo-500/80 text-white px-4 py-2 rounded-md hover:bg-indigo-600 flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Crear varias
              </button>
              <button
                onClick={() => setShowModal(true)}
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
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
            {/* Barra de búsqueda */}
            <div className="relative w-full sm:w-80">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar tareas por título o descripción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            {/* Filtro por proyecto */}
            <div className="flex items-center gap-2">
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
              {filterPhases.length > 0 && (
                <>
                  <label className="text-sm font-medium text-gray-700">Fase:</label>
                  <select
                    value={selectedPhase || ''}
                    onChange={(e) => setSelectedPhase(e.target.value || null)}
                    className="p-2 border rounded-md"
                  >
                    <option value="">Todas las fases</option>
                    {filterPhases.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </>
              )}
              <button
                onClick={() => {
                  setSelectedProject(null);
                  setSelectedPhase(null);
                  fetchTasks();
                }}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                Limpiar filtro
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Tareas por página:</label>
            <select
              value={tasksPerPage}
              onChange={(e) => {
                setTasksPerPage(Number(e.target.value));
                setCurrentPage(1); // Resetear a la primera página
              }}
              className="p-2 border rounded-md"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Pestañas para separar tareas activas y aprobadas */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('active')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'active'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Tareas Activas
              <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                {tasks.filter(task => !isTaskApproved(task.id)).length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('approved')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'approved'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Tareas Aprobadas
              <span className="ml-2 bg-green-100 text-green-600 py-0.5 px-2 rounded-full text-xs">
                {tasks.filter(task => isTaskApproved(task.id)).length}
              </span>
            </button>
          </nav>
        </div>
      </div>

      <div className="grid gap-4">
        {pageLoading && <SkeletonInline rows={3} />}

        {!pageLoading && tasks.length > 0 ? (
          (() => {
            return (
              <div key="all">
                {tasks.map((task) => (
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
                              phase_id: task.phase_id ?? null,
                              status: task.status,
                              created_by: task.created_by,
                              created_at: task.created_at,
                              assigned_to: task.assigned_to,
                              assigned_users: task.assigned_users,
                              checklist: task.checklist || [],
                              comments: task.comments || [],
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
                        <PhaseBadge phaseName={filterPhases.find(p => p.id === task.phase_id)?.name} className="ml-2" />
                      </div>
                      <span className={`px-2 py-1 rounded text-sm ${task.priority === 'high'
                        ? 'bg-red-100 text-red-800'
                        : task.priority === 'medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                        }`}>
                        {getPriorityText(task.priority)}
                      </span>
                    </div>
                    {task.description && (
                      <div className="mb-3">
                        <RichTextSummary
                          text={task.description}
                          className="text-sm"
                          maxLength={150}
                        />
                      </div>
                    )}
                    <div className="flex items-center text-sm text-gray-500 mb-3">
                      <span>Fecha límite: {task.deadline && !isNaN(new Date(task.deadline).getTime()) ? new Date(task.deadline).toLocaleDateString() : '—'}</span>
                      <span className="mx-2">•</span>
                      <span>{(task.estimated_duration ?? 0)} minutos</span>
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
                                  className={`bg-gray-50 p-3 rounded-md transition-all ${isAssignedToCurrentUser ? 'border-l-4 border-indigo-400' : ''
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
                                              created_at: subtask.created_at,
                                              checklist: subtask.checklist || [],
                                              comments: subtask.comments || [],
                                            });
                                            setShowSubtaskDetailModal(true);
                                          }}
                                        >
                                          {subtask.title || 'Sin título'}
                                        </h4>
                                      </div>

                                      {subtask.description && (
                                        <div className="mt-1">
                                          <RichTextSummary
                                            text={subtask.description}
                                            className="text-sm"
                                            maxLength={80}
                                          />
                                        </div>
                                      )}

                                      <div className="flex flex-wrap items-center text-xs text-gray-500 mt-2 gap-x-3 gap-y-1">
                                        <div className="flex items-center">
                                          <Clock className="w-3 h-3 mr-1" />
                                          <span>{(subtask.estimated_duration ?? 0)} min</span>
                                        </div>

                                        {subtask.start_date && !isNaN(new Date(subtask.start_date).getTime()) && (
                                          <div className="flex items-center">
                                            <span>Inicio: {new Date(subtask.start_date).toLocaleDateString()}</span>
                                          </div>
                                        )}

                                        {subtask.deadline && !isNaN(new Date(subtask.deadline).getTime()) && (
                                          <div className="flex items-center">
                                            <span>Fin: {new Date(subtask.deadline).toLocaleDateString()}</span>
                                          </div>
                                        )}

                                        <div className="flex items-center">
                                          <TaskStatusDisplay status={subtask.status} />
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
                                        <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${subtask.status === 'completed' || subtask.status === 'approved' ? 'bg-green-100 text-green-800' :
                                          subtask.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                            'bg-gray-100 text-gray-800'
                                          }`}>
                                          <TaskStatusDisplay status={subtask.status} />
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
                ))}
              </div>
            );
          })()
        ) : !pageLoading && (
          <div className="text-center py-12">
            <p className="text-gray-500">
              {searchTerm.trim() && selectedProject
                ? `No se encontraron ${activeTab === 'approved' ? 'tareas aprobadas' : 'tareas activas'} que coincidan con "${searchTerm}" en este proyecto`
                : searchTerm.trim()
                  ? `No se encontraron ${activeTab === 'approved' ? 'tareas aprobadas' : 'tareas activas'} que coincidan con "${searchTerm}"`
                  : selectedProject
                    ? `No se encontraron ${activeTab === 'approved' ? 'tareas aprobadas' : 'tareas activas'} para este proyecto`
                    : `No se encontraron ${activeTab === 'approved' ? 'tareas aprobadas' : 'tareas activas'}`}
            </p>
          </div>
        )}
      </div>

      {/* Componente de paginación */}
      {totalPages > 1 && (
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-700">
            {searchTerm.trim()
              ? `Mostrando ${((currentPage - 1) * tasksPerPage) + 1} a ${Math.min(currentPage * tasksPerPage, totalTasks)} de ${totalTasks} resultados para "${searchTerm}"`
              : `Mostrando ${((currentPage - 1) * tasksPerPage) + 1} a ${Math.min(currentPage * tasksPerPage, totalTasks)} de ${totalTasks} ${activeTab === 'approved' ? 'tareas aprobadas' : 'tareas activas'}`
            }
          </div>
          <div className="flex items-center space-x-1">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>

            {/* Mostrar números de página */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNumber;
              if (totalPages <= 5) {
                pageNumber = i + 1;
              } else if (currentPage <= 3) {
                pageNumber = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNumber = totalPages - 4 + i;
              } else {
                pageNumber = currentPage - 2 + i;
              }

              return (
                <button
                  key={pageNumber}
                  onClick={() => handlePageChange(pageNumber)}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${currentPage === pageNumber
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 hover:text-gray-700'
                    }`}
                >
                  {pageNumber}
                </button>
              );
            })}

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}


      {/* Modal Importar CSV */}
      {showCsvImportModal && csvImportData.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCsvImport} className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b">
              <h2 className="text-lg font-semibold">Importar desde CSV</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {csvImportData.length} filas detectadas. Columnas: titulo, duracion, asignado (email), fecha_limite
              </p>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Proyecto para todas las tareas *</label>
                <select
                  value={csvImportProject || ''}
                  onChange={(e) => setCsvImportProject(e.target.value || null)}
                  className="w-full p-2 border rounded-lg"
                  required
                >
                  <option value="">Seleccionar</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-lg p-2 text-sm">
                {csvImportData.slice(0, 20).map((r, i) => (
                  <div key={i} className="flex gap-2 py-1">
                    <span className="flex-1 truncate">{r.title || '(sin título)'}</span>
                    <span className="text-gray-500">{r.duration}min</span>
                    <span className="text-gray-500 truncate w-24">{r.assignee || '—'}</span>
                  </div>
                ))}
                {csvImportData.length > 20 && (
                  <p className="text-gray-500 py-2">... y {csvImportData.length - 20} más</p>
                )}
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button type="button" onClick={() => { setShowCsvImportModal(false); setCsvImportData([]); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancelar
              </button>
              <button type="submit" disabled={importingCsv} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {importingCsv ? 'Importando...' : `Importar ${csvImportData.filter((r) => r.title?.trim()).length} tareas`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Crear varias tareas */}
      {showBulkCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleBulkCreateTasks} className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b">
              <h2 className="text-lg font-semibold">Crear varias tareas</h2>
              <p className="text-sm text-gray-500 mt-0.5">Añade filas y crea todas a la vez</p>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Proyecto *</label>
                  <select
                    value={bulkProjectId || ''}
                    onChange={(e) => setBulkProjectId(e.target.value || null)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    required
                  >
                    <option value="">Seleccionar</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Fecha límite</label>
                  <input
                    type="datetime-local"
                    value={bulkDeadline}
                    onChange={(e) => setBulkDeadline(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex text-xs font-medium text-gray-500">
                  <span className="flex-1">Título</span>
                  <span className="w-20">Duración</span>
                  <span className="w-36">Asignar a</span>
                  <span className="w-8" />
                </div>
                {bulkTasks.map((row, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={row.title}
                      onChange={(e) => {
                        const next = [...bulkTasks];
                        next[i] = { ...next[i], title: e.target.value };
                        setBulkTasks(next);
                      }}
                      placeholder="Título de la tarea"
                      className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      min={5}
                      value={row.duration}
                      onChange={(e) => {
                        const next = [...bulkTasks];
                        next[i] = { ...next[i], duration: Number(e.target.value) || 60 };
                        setBulkTasks(next);
                      }}
                      className="w-20 px-2 py-2 border rounded-lg text-sm"
                    />
                    <select
                      value={row.assignee}
                      onChange={(e) => {
                        const next = [...bulkTasks];
                        next[i] = { ...next[i], assignee: e.target.value };
                        setBulkTasks(next);
                      }}
                      className="w-36 px-2 py-2 border rounded-lg text-sm"
                    >
                      <option value="">Yo</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name || u.email}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setBulkTasks((p) => p.filter((_, j) => j !== i))}
                      className="p-2 text-red-500 hover:bg-red-50 rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setBulkTasks((p) => [...p, { title: '', duration: 60, assignee: '' }])}
                  className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  <Plus className="w-4 h-4" />
                  Añadir fila
                </button>
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button type="button" onClick={() => setShowBulkCreateModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancelar
              </button>
              <button type="submit" disabled={creatingBulk} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {creatingBulk ? 'Creando...' : `Crear ${bulkTasks.filter((t) => t.title?.trim()).length} tareas`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Crear rápida */}
      {showQuickCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleQuickCreateTask} className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="p-5 border-b">
              <h2 className="text-lg font-semibold text-gray-800">Crear tarea rápida</h2>
              <p className="text-sm text-gray-500 mt-0.5">Título, proyecto y fecha límite</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Título *</label>
                <input
                  type="text"
                  value={quickTask.title}
                  onChange={(e) => setQuickTask((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Nombre de la tarea"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Proyecto *</label>
                <select
                  value={quickTask.project_id || ''}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    const proj = projects.find((p) => p.id === id);
                    setQuickTask((p) => ({
                      ...p,
                      project_id: id,
                      deadline: proj?.deadline ? proj.deadline.replace(' ', 'T').slice(0, 16) : p.deadline,
                    }));
                  }}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  required
                >
                  <option value="">Seleccionar</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Asignar a</label>
                <select
                  value={quickTask.assigned_to || ''}
                  onChange={(e) => setQuickTask((p) => ({ ...p, assigned_to: e.target.value || null }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Yo</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name || u.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Fecha límite</label>
                <input
                  type="datetime-local"
                  value={quickTask.deadline}
                  onChange={(e) => setQuickTask((p) => ({ ...p, deadline: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="p-4 border-t flex justify-between items-center">
              <button
                type="button"
                onClick={openFullCreateFromQuick}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                Expandir →
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowQuickCreateModal(false)} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  Crear
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b shrink-0">
              <h2 className="text-xl font-semibold">Crear Nueva Tarea</h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  setProjectSelected(false);
                  setError('');
                  setNewTask({
                    title: '',
                    description: '',
                    start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                    deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                    estimated_duration: 30,
                    priority: 'medium',
                    is_sequential: false,
                    phase_id: null,
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
            {error && (
              <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-300 text-red-700 rounded-lg shrink-0">
                <p className="font-medium">Error al crear</p>
                <p className="text-sm mt-1">{error}</p>
                <p className="text-xs mt-2 text-red-600">No presiones &quot;Crear Tarea&quot; de nuevo o crearás duplicados. Usa el botón de abajo. Abre la consola (F12) para ver el error técnico.</p>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
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
                      phase_id: null,
                      assigned_to: [],
                      subtasks: [],
                      project_id: null,
                    });
                    fetchTasks().then(() => fetchSubtasks()).catch(() => {});
                  }}
                  className="mt-3 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-md text-sm font-medium"
                >
                  Cerrar y revisar lista
                </button>
              </div>
            )}
            <form onSubmit={handleCreateTask} className="p-6 overflow-y-auto flex-1">
              {(newTask.title?.trim() || newTask.subtasks.length > 0) && (
                <div className="mb-4 flex items-center justify-between gap-2 bg-sky-50 border border-sky-200 text-sky-800 px-4 py-2 rounded text-sm">
                  <span>Borrador guardado automáticamente en este navegador.</span>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.removeItem(TASK_DRAFT_KEY);
                      } catch (_) { }
                      setNewTask({
                        title: '',
                        description: '',
                        start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                        deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                        estimated_duration: 30,
                        priority: 'medium',
                        is_sequential: false,
                        phase_id: null,
                        assigned_to: [],
                        subtasks: [],
                        project_id: null,
                      });
                      setProjectSelected(false);
                      setSelectedProjectDates(null);
                      toast.success('Borrador descartado. Puedes empezar de cero.');
                    }}
                    className="text-sky-600 hover:text-sky-800 underline font-medium"
                  >
                    Descartar borrador
                  </button>
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
                                deadline: projectEndDate.replace(" ", "T").substring(0, 16),
                                phase_id: null,
                              }));
                            }
                          } else {
                            setSelectedProjectDates(null);
                            setNewTask(prev => ({ ...prev, phase_id: null }));
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

                    {taskTemplates.length > 0 && (
                      <div className="mb-4 pt-4 border-t border-indigo-100">
                        <p className="text-sm font-medium text-indigo-700 mb-2">O crear desde plantilla de tarea</p>
                        <div className="flex gap-2">
                          <select
                            value={selectedTaskTemplateId || ''}
                            onChange={(e) => setSelectedTaskTemplateId(e.target.value || null)}
                            className="flex-1 p-2 border rounded-md text-sm"
                          >
                            <option value="">Seleccionar plantilla...</option>
                            {taskTemplates.map((t) => (
                              <option key={t.id} value={t.id}>{t.name} ({t.title})</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              if (!newTask.project_id || !selectedTaskTemplateId) {
                                toast.error('Selecciona proyecto y plantilla');
                                return;
                              }
                              const proj = projects.find((p) => p.id === newTask.project_id);
                              const start = proj?.start_date?.replace?.(' ', 'T')?.slice(0, 16) || format(new Date(), "yyyy-MM-dd'T'HH:mm");
                              const end = proj?.deadline?.replace?.(' ', 'T')?.slice(0, 16) || format(addDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm");
                              handleCreateFromTaskTemplate(newTask.project_id, start, end);
                            }}
                            disabled={!newTask.project_id || !selectedTaskTemplateId}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 text-sm"
                          >
                            Crear desde plantilla
                          </button>
                        </div>
                      </div>
                    )}
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

                    {phases.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fase</label>
                        <select
                          value={newTask.phase_id || ''}
                          onChange={(e) => setNewTask({ ...newTask, phase_id: e.target.value || null })}
                          className="w-full p-2 border rounded-md"
                        >
                          <option value="">Sin fase</option>
                          {phases.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
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
                      <QuillEditor
                        value={newTask.description}
                        onChange={(value: string) => setNewTask({ ...newTask, description: value })}
                        placeholder="Describe la tarea..."
                        minHeight="120px"
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
                              <div className="flex items-center flex-wrap gap-3">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    value={index + 1}
                                    onChange={(e) => {
                                      const newPosition = parseInt(e.target.value) - 1;
                                      if (newPosition < 0 || newPosition >= newTask.subtasks.length) return;

                                      const updatedSubtasks = [...newTask.subtasks];
                                      const movedSubtask = updatedSubtasks.splice(index, 1)[0];
                                      updatedSubtasks.splice(newPosition, 0, movedSubtask);

                                      // Al reordenar visualmente, si es secuencial, actualizamos también los sequence_order
                                      // para que correspondan a la nueva posición, a menos que el usuario haya definido
                                      // niveles específicos (ej. 1, 1, 2) manualmente.
                                      const finalSubtasks = updatedSubtasks.map((st, idx) => ({
                                        ...st,
                                        // Si no tiene orden o el orden coincidía con su posición anterior, lo actualizamos
                                        sequence_order: (st.sequence_order === undefined || st.sequence_order === null)
                                          ? idx + 1
                                          : st.sequence_order
                                      }));

                                      setNewTask({ ...newTask, subtasks: finalSubtasks });
                                    }}
                                    className="w-12 p-1 border rounded text-center"
                                    min="1"
                                    max={newTask.subtasks.length}
                                  />
                                  <span className="text-sm text-gray-500">Pos.</span>
                                </div>
                                {newTask.is_sequential && (
                                  <div className="flex items-center gap-2">
                                    <label className="text-xs font-medium text-gray-700">Nivel:</label>
                                    <input
                                      type="number"
                                      min={1}
                                      value={subtask.sequence_order ?? index + 1}
                                      onChange={(e) => {
                                        const v = parseInt(e.target.value, 10);
                                        if (Number.isNaN(v) || v < 1) return;
                                        const updatedSubtasks = [...newTask.subtasks];
                                        updatedSubtasks[index] = { ...subtask, sequence_order: v };
                                        setNewTask({ ...newTask, subtasks: updatedSubtasks });
                                      }}
                                      className="w-14 p-1 border rounded text-center"
                                      title="Varias subtareas pueden tener el mismo nivel (ej. dos con nivel 1)"
                                    />
                                    <span className="text-xs text-gray-500">(puede repetirse)</span>
                                  </div>
                                )}
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
                                <QuillEditor
                                  value={subtask.description}
                                  onChange={(value: string) => {
                                    const updatedSubtasks = [...newTask.subtasks];
                                    updatedSubtasks[index] = { ...subtask, description: value };
                                    setNewTask({ ...newTask, subtasks: updatedSubtasks });
                                  }}
                                  placeholder="Describe la subtarea..."
                                  minHeight="80px"
                                  className="text-sm"
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
                                sequence_order: newTask.subtasks.length + 1,
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
                        phase_id: null,
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
                      disabled={creatingTask}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {creatingTask ? 'Creando...' : 'Crear Tarea'}
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
              <div>
                <h2 className="text-xl font-semibold">
                  {editMode ? "Editar Tarea" : "Detalles de Tarea"}
                </h2>
                <div className="flex items-center gap-2 mt-2">
                  {selectedTask.project_id && (
                    <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded-full">
                      {projects.find(p => p.id === selectedTask.project_id)?.name}
                    </span>
                  )}
                  <PhaseBadge phaseName={editPhases.find(p => p.id === selectedTask.phase_id)?.name} />
                </div>
              </div>
              <button
                onClick={() => {
                  setShowTaskDetailModal(false);
                  setEditMode(false);
                  setNewSubtasksInEdit([]);
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
                    <QuillEditor
                      value={editedTask.description || ""}
                      onChange={(value: string) => setEditedTask({ ...editedTask, description: value })}
                      placeholder="Describe la tarea..."
                      minHeight="120px"
                      disabled={!isAdmin}
                    />
                  ) : (
                    <div className="p-3 bg-gray-50 rounded-md min-h-[4rem] border">
                      <RichTextDisplay
                        text={selectedTask.description || ""}
                        className="text-gray-700 leading-relaxed"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Checklist</label>
                  <ActivityChecklist
                    key={`checklist-task-${selectedTask.id}`}
                    items={(editedTask?.checklist ?? selectedTask.checklist ?? []).map((c) => ({ id: c.id, title: c.title, checked: c.checked, order: c.order, parentId: c.parentId }))}
                    onUpdate={async (updated) => {
                      const { error } = await supabase.from('tasks').update({ checklist: updated }).eq('id', selectedTask.id);
                      if (error) throw error;
                      setEditedTask((prev) => (prev ? { ...prev, checklist: updated } : null));
                      setTasks((prev) => prev.map((t) => (t.id === selectedTask.id ? { ...t, checklist: updated } : t)));
                    }}
                    placeholder="Añadir paso o verificación..."
                    emptyMessage="El responsable puede crear un checklist para llevar el control. Se incluirá en la plantilla del proyecto."
                  />
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
                      <p className={`p-2 rounded-md ${selectedTask.priority === 'high' ? 'bg-red-50 text-red-800' :
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
                            {selectedTask.is_sequential && (
                              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-3">
                                Varias subtareas pueden tener el mismo nivel (ej. dos con nivel 1). El nivel indica el orden de ejecución; las del mismo nivel pueden hacerse en paralelo.
                              </p>
                            )}
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
                                          <TaskStatusDisplay status={subtask.status} />
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

                            {/* Nuevas subtareas en modo edición */}
                            {newSubtasksInEdit.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-gray-200">
                                <h4 className="text-sm font-medium text-gray-700 mb-3">Nuevas subtareas a crear:</h4>
                                <div className="space-y-4">
                                  {newSubtasksInEdit.map((newSubtask, index) => (
                                    <div key={`new-subtask-${index}`} className="border border-green-200 bg-green-50 p-4 rounded-md">
                                      <div className="flex justify-between items-center mb-3">
                                        <h5 className="font-medium text-green-800">Nueva Subtarea {index + 1}</h5>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updatedNewSubtasks = [...newSubtasksInEdit];
                                            updatedNewSubtasks.splice(index, 1);
                                            setNewSubtasksInEdit(updatedNewSubtasks);
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
                                            value={newSubtask.title}
                                            onChange={(e) => {
                                              const updatedNewSubtasks = [...newSubtasksInEdit];
                                              updatedNewSubtasks[index] = { ...newSubtask, title: e.target.value };
                                              setNewSubtasksInEdit(updatedNewSubtasks);
                                            }}
                                            placeholder="Título de la nueva subtarea"
                                            className="w-full p-2 border rounded-md"
                                            required
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-1">
                                            Descripción
                                          </label>
                                          <QuillEditor
                                            value={newSubtask.description}
                                            onChange={(value: string) => {
                                              const updatedNewSubtasks = [...newSubtasksInEdit];
                                              updatedNewSubtasks[index] = { ...newSubtask, description: value };
                                              setNewSubtasksInEdit(updatedNewSubtasks);
                                            }}
                                            placeholder="Describe la nueva subtarea..."
                                            minHeight="80px"
                                            className="text-sm"
                                          />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                              Duración (minutos) <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                              type="number"
                                              value={newSubtask.estimated_duration}
                                              onChange={(e) => {
                                                const updatedNewSubtasks = [...newSubtasksInEdit];
                                                updatedNewSubtasks[index] = { ...newSubtask, estimated_duration: Number(e.target.value) };
                                                setNewSubtasksInEdit(updatedNewSubtasks);
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
                                              value={newSubtask.assigned_to || ''}
                                              onChange={(e) => {
                                                const updatedNewSubtasks = [...newSubtasksInEdit];
                                                updatedNewSubtasks[index] = { ...newSubtask, assigned_to: e.target.value };
                                                setNewSubtasksInEdit(updatedNewSubtasks);
                                              }}
                                              className="w-full p-2 border rounded-md"
                                              required
                                            >
                                              <option value="">Seleccionar usuario</option>
                                              {getAvailableUsers(selectedTask?.project_id || null).map((user) => (
                                                <option key={user.id} value={user.id}>
                                                  {user.name || user.email}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                              Fecha de inicio
                                            </label>
                                            <input
                                              type="datetime-local"
                                              value={newSubtask.start_date || editedTask.start_date}
                                              onChange={(e) => {
                                                const updatedNewSubtasks = [...newSubtasksInEdit];
                                                updatedNewSubtasks[index] = { ...newSubtask, start_date: e.target.value };
                                                setNewSubtasksInEdit(updatedNewSubtasks);
                                              }}
                                              className="w-full p-2 border rounded-md"
                                              min={editedTask.start_date}
                                              max={editedTask.deadline}
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                              Fecha límite
                                            </label>
                                            <input
                                              type="datetime-local"
                                              value={newSubtask.deadline || editedTask.deadline}
                                              onChange={(e) => {
                                                const updatedNewSubtasks = [...newSubtasksInEdit];
                                                updatedNewSubtasks[index] = { ...newSubtask, deadline: e.target.value };
                                                setNewSubtasksInEdit(updatedNewSubtasks);
                                              }}
                                              className="w-full p-2 border rounded-md"
                                              min={newSubtask.start_date || editedTask.start_date}
                                              max={editedTask.deadline}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Botones para agregar subtareas */}
                            <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setNewSubtasksInEdit([
                                    ...newSubtasksInEdit,
                                    {
                                      title: '',
                                      description: '',
                                      estimated_duration: 30,
                                      assigned_to: '',
                                      start_date: editedTask.start_date,
                                      deadline: editedTask.deadline,
                                    },
                                  ]);
                                }}
                                className="flex items-center text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-2 rounded-md transition-colors"
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Agregar Nueva Subtarea
                              </button>
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
                                  <span className={`text-xs px-2 py-1 rounded ${subtask.status === 'completed' || subtask.status === 'approved' ? 'bg-green-100 text-green-800' :
                                    subtask.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                    <TaskStatusDisplay status={subtask.status} />
                                  </span>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-gray-500">Esta tarea no tiene subtareas asociadas.</p>
                      </div>
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
                      onChange={(e) => {
                        const projectId = e.target.value || null;
                        setEditedTask({ ...editedTask, project_id: projectId, phase_id: null });
                      }}
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
                {editPhases.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fase</label>
                    {editMode ? (
                      <select
                        value={editedTask.phase_id || ''}
                        onChange={(e) => setEditedTask({ ...editedTask, phase_id: e.target.value || null })}
                        className="w-full p-2 border rounded-md"
                        disabled={!isAdmin}
                      >
                        <option value="">Sin fase</option>
                        {editPhases.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="p-2 bg-gray-50 rounded-md">
                        {selectedTask.phase_id
                          ? editPhases.find(p => p.id === selectedTask.phase_id)?.name
                          : "Sin fase"}
                      </p>
                    )}
                  </div>
                )}
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
                        setNewSubtasksInEdit([]);
                        setEditedTask({
                          title: selectedTask.title,
                          description: selectedTask.description || '',
                          start_date: selectedTask.start_date ? selectedTask.start_date.replace(" ", "T").substring(0, 16) : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                          deadline: selectedTask.deadline ? selectedTask.deadline.replace(" ", "T").substring(0, 16) : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
                          estimated_duration: selectedTask.estimated_duration,
                          priority: selectedTask.priority,
                          is_sequential: selectedTask.is_sequential,
                          project_id: selectedTask.project_id || null,
                          phase_id: selectedTask.phase_id ?? null,
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
                      onClick={() => {
                        setShowTaskDetailModal(false);
                        setNewSubtasksInEdit([]);
                      }}
                      className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Cerrar
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setNewTemplateName(selectedTask.title);
                            setShowSaveTemplateModal(true);
                          }}
                          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                        >
                          Guardar como plantilla
                        </button>
                        <button
                          type="button"
                          onClick={handleDuplicateTask}
                          className="px-4 py-2 border border-indigo-300 text-indigo-700 rounded-md hover:bg-indigo-50"
                        >
                          Duplicar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditMode(true)}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                        >
                          Editar
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Guardar tarea como plantilla */}
      {showSaveTemplateModal && selectedTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-2">Guardar como plantilla</h3>
            <p className="text-sm text-gray-600 mb-4">
              Se guardará la estructura de &quot;{selectedTask.title}&quot; como plantilla reutilizable.
            </p>
            <input
              type="text"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="Nombre de la plantilla"
              className="w-full px-3 py-2 border rounded-lg mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowSaveTemplateModal(false); setNewTemplateName(''); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveTaskAsTemplate}
                disabled={savingAsTemplate}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingAsTemplate ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear tarea de supervisión (tarea + diarias en un paso) */}
      {showSupervisionTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <form onSubmit={handleCreateSupervisionTask} className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <Sparkles className="w-6 h-6" />
                  <h2 className="text-lg font-semibold">Crear tarea de supervisión</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSupervisionTaskModal(false)}
                  className="text-white/80 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-teal-100 text-sm mt-1">
                Crea la tarea padre y sus checkpoints diarios en un solo paso.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proyecto *</label>
                <select
                  value={supervisionTaskConfig.project_id}
                  onChange={(e) => setSupervisionTaskConfig((p) => ({ ...p, project_id: e.target.value }))}
                  className="w-full p-2 border rounded-lg"
                  required
                >
                  <option value="">Seleccionar proyecto</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input
                  type="text"
                  value={supervisionTaskConfig.title}
                  onChange={(e) => setSupervisionTaskConfig((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Ej: Revisión embudo diaria"
                  className="w-full p-2 border rounded-lg"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
                  <input
                    type="date"
                    value={supervisionTaskConfig.startDate}
                    onChange={(e) => setSupervisionTaskConfig((p) => ({ ...p, startDate: e.target.value }))}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin</label>
                  <input
                    type="date"
                    value={supervisionTaskConfig.endDate}
                    onChange={(e) => setSupervisionTaskConfig((p) => ({ ...p, endDate: e.target.value }))}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asignar a</label>
                  <select
                    value={supervisionTaskConfig.assignee}
                    onChange={(e) => setSupervisionTaskConfig((p) => ({ ...p, assignee: e.target.value }))}
                    className="w-full p-2 border rounded-lg"
                  >
                    <option value="">Yo</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name || u.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duración (min/día)</label>
                  <input
                    type="number"
                    min={5}
                    max={480}
                    value={supervisionTaskConfig.duration}
                    onChange={(e) => setSupervisionTaskConfig((p) => ({ ...p, duration: Number(e.target.value) || 15 }))}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={supervisionTaskConfig.includeWeekends}
                  onChange={(e) => setSupervisionTaskConfig((p) => ({ ...p, includeWeekends: e.target.checked }))}
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">Incluir fines de semana</span>
              </label>
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                {(() => {
                  const dates = getDailyDates(supervisionTaskConfig.startDate, supervisionTaskConfig.endDate, supervisionTaskConfig.includeWeekends);
                  return (
                    <p className="text-gray-600">
                      Se crearán <strong>1 tarea</strong> + <strong>{dates.length} subtareas</strong> diarias
                    </p>
                  );
                })()}
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSupervisionTaskModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingSupervision}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {creatingSupervision ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal seleccionar tarea para subtareas diarias (acceso directo) */}
      {showSelectTaskForDailyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <CalendarDays className="w-6 h-6" />
                  <h2 className="text-lg font-semibold">Generar subtareas diarias</h2>
                </div>
                <button
                  onClick={() => setShowSelectTaskForDailyModal(false)}
                  className="text-white/80 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-emerald-100 text-sm mt-1">
                Selecciona la tarea a la que añadir checkpoints diarios (supervisión, revisiones, etc.)
              </p>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Proyecto (opcional)</label>
                <select
                  value={dailyModalProjectFilter || ''}
                  onChange={(e) => setDailyModalProjectFilter(e.target.value || null)}
                  className="w-full p-2 border rounded-lg"
                >
                  <option value="">Todos los proyectos</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tarea padre</label>
                <div className="space-y-1 max-h-48 overflow-y-auto border rounded-lg p-2 bg-gray-50">
                  {tasksForDailyModal
                    .filter((t) => !dailyModalProjectFilter || t.project_id === dailyModalProjectFilter)
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTask(t);
                          setDailySubtaskConfig((prev) => ({
                            ...prev,
                            startDate: t.start_date?.slice(0, 10) || format(new Date(), 'yyyy-MM-dd'),
                            endDate: t.deadline?.slice(0, 10) || format(addDays(new Date(), 6), 'yyyy-MM-dd'),
                            titlePrefix: t.title?.slice(0, 40) || '',
                          }));
                          setShowSelectTaskForDailyModal(false);
                          setShowGenerateDailyModal(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-emerald-50 hover:border-emerald-200 border border-transparent transition-colors flex justify-between items-center"
                      >
                        <span className="font-medium text-gray-800 truncate flex-1">{t.title}</span>
                        <span className="text-xs text-gray-500 ml-2 shrink-0 flex items-center gap-1">
                          {projects.find((p) => p.id === t.project_id)?.name || 'Sin proyecto'}
                          <PhaseBadge phaseName={dailyModalPhases.find(p => p.id === t.phase_id)?.name} />
                        </span>
                      </button>
                    ))}
                  {tasksForDailyModal.filter((t) => !dailyModalProjectFilter || t.project_id === dailyModalProjectFilter).length === 0 && (
                    <p className="text-gray-500 text-sm py-4 text-center">No hay tareas activas para seleccionar.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Generar subtareas diarias */}
      {showGenerateDailyModal && selectedTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4">
              <div className="flex items-center gap-2 text-white">
                <Sparkles className="w-6 h-6" />
                <h2 className="text-lg font-semibold">Generar subtareas diarias</h2>
              </div>
              <p className="text-emerald-100 text-sm mt-1">
                Crea una subtarea por cada día del rango. Ideal para revisiones diarias, supervisión de embudo, etc.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
                  <input
                    type="date"
                    value={dailySubtaskConfig.startDate}
                    onChange={(e) => setDailySubtaskConfig(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin</label>
                  <input
                    type="date"
                    value={dailySubtaskConfig.endDate}
                    onChange={(e) => setDailySubtaskConfig(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prefijo del título</label>
                <input
                  type="text"
                  value={dailySubtaskConfig.titlePrefix}
                  onChange={(e) => setDailySubtaskConfig(prev => ({ ...prev, titlePrefix: e.target.value }))}
                  placeholder={selectedTask.title || 'Ej: Revisión embudo'}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                <p className="text-xs text-gray-500 mt-1">Se añadirá la fecha a cada subtarea (ej: "Revisión embudo – 3 feb")</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Asignar a</label>
                  <select
                    value={dailySubtaskConfig.assignee}
                    onChange={(e) => setDailySubtaskConfig(prev => ({ ...prev, assignee: e.target.value }))}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Yo (actual)</option>
                    {getAvailableUsers(selectedTask.project_id || null).map((u) => (
                      <option key={u.id} value={u.id}>{u.name || u.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duración (min)</label>
                  <input
                    type="number"
                    min={5}
                    max={480}
                    value={dailySubtaskConfig.duration}
                    onChange={(e) => setDailySubtaskConfig(prev => ({ ...prev, duration: Number(e.target.value) || 15 }))}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dailySubtaskConfig.includeWeekends}
                  onChange={(e) => setDailySubtaskConfig(prev => ({ ...prev, includeWeekends: e.target.checked }))}
                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-gray-700">Incluir fines de semana</span>
              </label>
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="font-medium text-gray-700 mb-1">Vista previa</p>
                {(() => {
                  const dates = getDailyDates(dailySubtaskConfig.startDate, dailySubtaskConfig.endDate, dailySubtaskConfig.includeWeekends);
                  const prefix = (dailySubtaskConfig.titlePrefix || selectedTask.title || 'Día').trim().slice(0, 40);
                  const sample = dates.slice(0, 3).map(d => `${prefix} – ${format(d, 'd MMM', { locale: es })}`);
                  return (
                    <p className="text-gray-600">
                      Se crearán <strong>{dates.length}</strong> subtareas
                      {dates.length > 0 && (
                        <>: {sample.join(', ')}{dates.length > 3 ? '...' : ''}</>
                      )}
                    </p>
                  );
                })()}
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowGenerateDailyModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGenerateDailySubtasks}
                disabled={generatingDaily}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {generatingDaily ? (
                  <>Generando...</>
                ) : (
                  <>
                    <CalendarDays className="w-4 h-4" />
                    Generar
                  </>
                )}
              </button>
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
                    <QuillEditor
                      value={editedSubtask.description || ""}
                      onChange={(value: string) => setEditedSubtask({ ...editedSubtask, description: value })}
                      placeholder="Describe la subtarea..."
                      minHeight="100px"
                      disabled={!isAdmin}
                    />
                  ) : (
                    <div className="p-3 bg-gray-50 rounded-md min-h-[4rem] border">
                      <RichTextDisplay
                        text={selectedSubtask.description || ""}
                        className="text-gray-700 leading-relaxed"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Checklist</label>
                  <ActivityChecklist
                    key={`checklist-subtask-${selectedSubtask.id}`}
                    items={(editedSubtask?.checklist ?? selectedSubtask.checklist ?? []).map((c) => ({ id: c.id, title: c.title, checked: c.checked, order: c.order, parentId: c.parentId }))}
                    onUpdate={async (updated) => {
                      const { error } = await supabase.from('subtasks').update({ checklist: updated }).eq('id', selectedSubtask.id);
                      if (error) throw error;
                      setEditedSubtask((prev) => (prev ? { ...prev, checklist: updated } : null));
                      setSubtasks((prev) => {
                        const next = { ...prev };
                        const list = next[selectedSubtask.task_id] || [];
                        const idx = list.findIndex((s) => s.id === selectedSubtask.id);
                        if (idx >= 0) {
                          next[selectedSubtask.task_id] = list.map((s) => (s.id === selectedSubtask.id ? { ...s, checklist: updated } : s));
                        }
                        return next;
                      });
                    }}
                    placeholder="Añadir paso o verificación..."
                    emptyMessage="El responsable puede crear un checklist para llevar el control. Se incluirá en la plantilla del proyecto."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Comentarios</label>
                  <TaskComments
                    key={`comments-subtask-${selectedSubtask.id}`}
                    comments={(editedSubtask?.comments ?? selectedSubtask.comments ?? []).map((c) => ({ ...c, created_at: c.created_at }))}
                    users={users.map((u) => ({ id: u.id, name: u.name, email: u.email }))}
                    currentUserId={user?.id}
                    onAdd={async (content) => {
                      const newComment = {
                        id: crypto.randomUUID(),
                        user_id: user!.id,
                        content,
                        created_at: new Date().toISOString(),
                      };
                      const updated = [...(editedSubtask?.comments ?? selectedSubtask.comments ?? []), newComment];
                      const { error } = await supabase.from('subtasks').update({ comments: updated }).eq('id', selectedSubtask.id);
                      if (error) throw error;
                      setEditedSubtask((prev) => (prev ? { ...prev, comments: updated } : null));
                      setSubtasks((prev) => {
                        const next = { ...prev };
                        const list = next[selectedSubtask.task_id] || [];
                        next[selectedSubtask.task_id] = list.map((s) => (s.id === selectedSubtask.id ? { ...s, comments: updated } : s));
                        return next;
                      });
                    }}
                    onDelete={async (commentId) => {
                      const updated = (editedSubtask?.comments ?? selectedSubtask.comments ?? []).filter((c) => c.id !== commentId);
                      const { error } = await supabase.from('subtasks').update({ comments: updated }).eq('id', selectedSubtask.id);
                      if (error) throw error;
                      setEditedSubtask((prev) => (prev ? { ...prev, comments: updated } : null));
                      setSubtasks((prev) => {
                        const next = { ...prev };
                        const list = next[selectedSubtask.task_id] || [];
                        next[selectedSubtask.task_id] = list.map((s) => (s.id === selectedSubtask.id ? { ...s, comments: updated } : s));
                        return next;
                      });
                    }}
                  />
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
                      <p className={`p-2 rounded-md ${selectedSubtask.status === 'completed' || selectedSubtask.status === 'approved' ? 'bg-green-100 text-green-800' :
                        selectedSubtask.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                        <TaskStatusDisplay status={selectedSubtask.status} />
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