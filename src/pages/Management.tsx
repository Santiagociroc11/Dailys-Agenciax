import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Clock, Users, Filter, X, ChevronDown, ChevronUp, FolderOpen } from 'lucide-react';
import { format } from 'date-fns';

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
}

interface Project {
  id: string;
  name: string;
}

interface User {
  id: string;
  email: string;
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

  useEffect(() => {
    fetchProjects();
    fetchUsers();
    fetchData();
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedProject, selectedPriority, selectedAssignee]);

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
    setLoading(true);
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
      setLoading(false);
    }
  }

  async function handleStatusChange(itemId: string, newStatus: string, isSubtask: boolean = false) {
    try {
      const table = isSubtask ? 'subtasks' : 'tasks';
      const { error } = await supabase
        .from(table)
        .update({ status: newStatus })
        .eq('id', itemId);
      
      if (error) throw error;
      
      // Refresh data after update
      fetchData();
    } catch (error) {
      console.error('Error al actualizar estado:', error);
    }
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
                              className="bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 border-l-4 border-emerald-500 cursor-pointer"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', JSON.stringify({
                                  id: subtask.id,
                                  type: 'subtask'
                                }));
                              }}
                              onClick={() => {
                                // Navigate to subtask details (could be implemented later)
                                console.log("Navegar a detalles de subtarea:", subtask.id);
                              }}
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
                                <h5 className="font-medium text-gray-800">{subtask.title}</h5>
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
                            </div>
                          );
                        })}
                        
                        {/* Tasks without subtasks in this column */}
                        {tasksWithoutSubtasks.map(task => (
                          <div 
                            key={task.id}
                            className="bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 border-l-4 border-indigo-500 cursor-pointer"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', JSON.stringify({
                                id: task.id,
                                type: 'task'
                              }));
                            }}
                            onClick={() => {
                              // Navigate to task details (could be implemented later)
                              console.log("Navegar a detalles de tarea:", task.id);
                            }}
                          >
                            <div className="flex justify-between items-start">
                              <h5 className="font-medium text-gray-800">{task.title}</h5>
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

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión</h1>
          <p className="text-gray-600">Tablero Kanban para visualizar y gestionar tareas</p>
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
                    handleStatusChange(data.id, newStatus, data.type === 'subtask');
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
    </div>
  );
}

export default Management; 