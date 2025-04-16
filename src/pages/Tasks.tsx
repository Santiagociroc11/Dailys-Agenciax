import React from 'react';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, X, Users, Clock, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
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
}

interface Subtask {
  id: string;
  title: string;
  description: string | null;
  estimated_duration: number;
  sequence_order: number | null;
  assigned_to: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface User {
  id: string;
  email: string;
}

interface NewTask {
  title: string;
  description: string;
  start_date: string;
  deadline: string;
  estimated_duration: number;
  priority: 'low' | 'medium' | 'high';
  is_sequential: boolean;
  subtasks: {
    title: string;
    description: string;
    estimated_duration: number;
    assigned_to: string;
  }[];
}

function Tasks() {
  const { isAdmin, user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasks, setSubtasks] = useState<Record<string, Subtask[]>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTask, setNewTask] = useState<NewTask>({
    title: '',
    description: '',
    start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    estimated_duration: 30,
    priority: 'medium',
    is_sequential: false,
    subtasks: [],
  });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTasks();
  }, []);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, email');

        if (usersError) throw usersError;
        setUsers(usersData || []);
      } catch (error) {
        console.error('Error al cargar usuarios:', error);
      }
    }

    async function fetchSubtasks() {
      try {
        console.log('Fetching subtasks...');
        const { data: subtasksData, error: subtasksError } = await supabase
          .from('subtasks')
          .select('*');

        if (subtasksError) {
          console.error('Error fetching subtasks:', subtasksError);
          throw subtasksError;
        }

        console.log('Subtasks data received:', subtasksData);
        const groupedSubtasks = (subtasksData || []).reduce((acc, subtask) => {
          acc[subtask.task_id] = [...(acc[subtask.task_id] || []), subtask];
          return acc;
        }, {} as Record<string, Subtask[]>);
        console.log('Grouped subtasks:', groupedSubtasks);
        setSubtasks(groupedSubtasks);
      } catch (error) {
        console.error('Error al cargar subtareas:', error);
      }
    }

    if (isAdmin) {
      fetchUsers();
    }
    fetchSubtasks();
  }, [isAdmin]);

  async function fetchTasks() {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error al cargar las tareas:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError('');

    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert([
          {
            ...newTask,
            created_by: user?.id,
          },
        ])
        .select();
      
      if (error) throw error;
      
      if (data && data[0]) {
        const taskId = data[0].id;
        
        // Crear subtareas si existen
        if (newTask.subtasks.length > 0) {
          const subtasksToInsert = newTask.subtasks.map((subtask, index) => ({
            task_id: taskId,
            title: subtask.title,
            description: subtask.description,
            estimated_duration: subtask.estimated_duration,
            sequence_order: newTask.is_sequential ? index + 1 : null,
            assigned_to: subtask.assigned_to,
            status: 'pending' as const,
          }));

          const { error: subtaskError } = await supabase
            .from('subtasks')
            .insert(subtasksToInsert);

          if (subtaskError) throw subtaskError;
        }

        await fetchTasks();
        await fetchSubtasks();
      }

      if (error) throw error;

      setTasks([...(data || []), ...tasks]);
      setShowModal(false);
      setNewTask({
        title: '',
        description: '',
        start_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        deadline: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        estimated_duration: 30,
        priority: 'medium',
        is_sequential: false,
        subtasks: [],
      });
    } catch (error) {
      console.error('Error al crear la tarea:', error);
      setError('Error al crear la tarea. Por favor, inténtalo de nuevo.');
    }
  }

  async function handleStatusUpdate(subtaskId: string, newStatus: 'pending' | 'in_progress' | 'completed') {
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

  const handleDragEnd = async (result: any) => {
    console.log('DragEnd event:', result);

    if (!result.destination) return;

    const taskId = result.source.droppableId;
    const taskSubtasks = [...(subtasks[taskId] || [])];
    const [reorderedItem] = taskSubtasks.splice(result.source.index, 1);
    taskSubtasks.splice(result.destination.index, 0, reorderedItem);

    // Update sequence_order for all affected subtasks
    const updates = taskSubtasks.map((subtask, index) => ({
      id: subtask.id,
      sequence_order: index + 1,
    }));

    try {
      for (const update of updates) {
        const { error } = await supabase
          .from('subtasks')
          .update({ sequence_order: update.sequence_order })
          .eq('id', update.id);

        if (error) {
          console.error('Error updating subtask:', error);
          throw error;
        }
        console.log('Successfully updated subtask:', update);
      }

      // Update local state
      setSubtasks({
        ...subtasks,
        [taskId]: taskSubtasks,
      });
      console.log('Local state updated successfully');
    } catch (error) {
      console.error('Error al actualizar el orden:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

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
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tareas</h1>
          <p className="text-gray-600">Gestiona tus tareas y asignaciones</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => {
              console.log('Opening modal, current state:', {
                showModal: false,
                newTask,
                users,
              });
              setShowModal(true);
              console.log('Modal opened, new state:', {
                showModal: true,
                newTask,
                users,
              });
            }}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Nueva Tarea
          </button>
        )}
      </div>

      <div className="grid gap-4">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-gray-900">{task.title}</h2>
              <span className={`px-2 py-1 rounded text-sm ${
                task.priority === 'high' 
                  ? 'bg-red-100 text-red-800'
                  : task.priority === 'medium'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-green-100 text-green-800'
              }`}>
                {getPriorityText(task.priority)}
              </span>
            </div>
            {task.description && (
              <p className="text-gray-600 mb-3">{task.description}</p>
            )}
            <div className="flex items-center text-sm text-gray-500">
              <span>Fecha límite: {new Date(task.deadline).toLocaleDateString()}</span>
              <span className="mx-2">•</span>
              <span>{task.estimated_duration} minutos</span>
              {task.is_sequential && (
                <>
                  <span className="mx-2">•</span>
                  <span>Secuencial</span>
                </>
              )}
              {subtasks[task.id]?.length > 0 && (
                <div className="mt-4 space-y-2">
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <h3 className="text-sm font-medium text-gray-700">Subtareas:</h3>
                    <Droppable droppableId={task.id}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className="space-y-2"
                        >
                          {subtasks[task.id]
                            .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))
                            .map((subtask, index) => (
                            <Draggable
                              key={subtask.id}
                              draggableId={subtask.id}
                              index={index}
                              isDragDisabled={!task.is_sequential || !isAdmin}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  style={provided.draggableProps.style}
                                  className={`bg-gray-50 p-3 rounded-md flex items-center justify-between ${
                                    snapshot.isDragging ? 'shadow-lg' : ''
                                  }`}
                                >
                                  <div className="flex items-center flex-1">
                                    {task.is_sequential && isAdmin && (
                                      <div className="mr-3 cursor-grab hover:cursor-grabbing">
                                        <GripVertical className="w-5 h-5 text-gray-400" />
                                      </div>
                                    )}
                                    <div className="flex-1">
                                      <p className="font-medium">{subtask.title}</p>
                                      {subtask.description && (
                                        <p className="text-sm text-gray-600">{subtask.description}</p>
                                      )}
                                      <div className="flex items-center text-sm text-gray-500 mt-1">
                                        <Clock className="w-4 h-4 mr-1" />
                                        <span>{subtask.estimated_duration} minutos</span>
                                        {task.is_sequential && subtask.sequence_order && (
                                          <>
                                            <span className="mx-2">•</span>
                                            <span>Orden: {subtask.sequence_order}</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    {(isAdmin || subtask.assigned_to === user?.id) && (
                                      <select
                                        value={subtask.status}
                                        onChange={(e) => handleStatusUpdate(subtask.id, e.target.value as 'pending' | 'in_progress' | 'completed')}
                                        className="ml-4 text-sm border rounded-md px-2 py-1"
                                      >
                                        <option value="pending">Pendiente</option>
                                        <option value="in_progress">En Progreso</option>
                                        <option value="completed">Completada</option>
                                      </select>
                                    )}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                </div>
              )}
            </div>
          </div>
        ))}

        {tasks.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No se encontraron tareas</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-semibold">Crear Nueva Tarea</h2>
              <button
                onClick={() => {
                  console.log('Closing modal, current state:', {
                    showModal: true,
                    newTask,
                  });
                  setShowModal(false);
                  console.log('Modal closed');
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="p-6 overflow-y-auto">
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
                  <input
                    type="text"
                    value={newTask.title}
                    onChange={(e) => {
                      console.log('Updating task title:', {
                        oldValue: newTask.title,
                        newValue: e.target.value,
                      });
                      setNewTask({ ...newTask, title: e.target.value });
                    }}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  <textarea
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    className="w-full p-2 border rounded-md"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha de inicio
                    </label>
                    <input
                      type="datetime-local"
                      value={newTask.start_date}
                      onChange={(e) => setNewTask({ ...newTask, start_date: e.target.value })}
                      className="w-full p-2 border rounded-md"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fecha límite
                    </label>
                    <input
                      type="datetime-local"
                      value={newTask.deadline}
                      onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })}
                      className="w-full p-2 border rounded-md"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Duración estimada (minutos)
                    </label>
                    <input
                      type="number"
                      value={newTask.estimated_duration}
                      onChange={(e) => setNewTask({ ...newTask, estimated_duration: parseInt(e.target.value) })}
                      className="w-full p-2 border rounded-md"
                      min="1"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Prioridad
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
                <div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={newTask.is_sequential}
                      onChange={(e) => {
                        console.log('Updating sequential flag:', {
                          oldValue: newTask.is_sequential,
                          newValue: e.target.checked,
                        });
                        setNewTask({ ...newTask, is_sequential: e.target.checked });
                      }}
                      className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 mr-2"
                    />
                    <span className="text-sm text-gray-700">Las subtareas deben completarse en orden secuencial</span>
                  </label>
                </div>
                <div className="border-t mt-6 pt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Subtareas</h3>
                  {newTask.subtasks.map((subtask, index) => (
                    <div key={index} className="mb-4 p-4 bg-gray-50 rounded-md">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium">Subtarea {index + 1}</h4>
                        <button
                          type="button"
                          onClick={() => {
                            const updatedSubtasks = [...newTask.subtasks];
                            console.log('Removing subtask:', {
                              index,
                              removedSubtask: updatedSubtasks[index],
                            });
                            updatedSubtasks.splice(index, 1);
                            setNewTask({ ...newTask, subtasks: updatedSubtasks });
                            console.log('Updated subtasks:', updatedSubtasks);
                          }}
                          className="text-red-600 hover:text-red-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="space-y-3">
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
                        />
                        <textarea
                          value={subtask.description}
                          onChange={(e) => {
                            const updatedSubtasks = [...newTask.subtasks];
                            updatedSubtasks[index] = { ...subtask, description: e.target.value };
                            setNewTask({ ...newTask, subtasks: updatedSubtasks });
                          }}
                          placeholder="Descripción de la subtarea"
                          className="w-full p-2 border rounded-md"
                          rows={2}
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <input
                              type="number"
                              value={subtask.estimated_duration}
                              onChange={(e) => {
                                const updatedSubtasks = [...newTask.subtasks];
                                updatedSubtasks[index] = { ...subtask, estimated_duration: parseInt(e.target.value) };
                                setNewTask({ ...newTask, subtasks: updatedSubtasks });
                              }}
                              placeholder="Duración (minutos)"
                              className="w-full p-2 border rounded-md"
                              min="1"
                            />
                          </div>
                          <div>
                            <select
                              value={subtask.assigned_to}
                              onChange={(e) => {
                                const updatedSubtasks = [...newTask.subtasks];
                                updatedSubtasks[index] = { ...subtask, assigned_to: e.target.value };
                                setNewTask({ ...newTask, subtasks: updatedSubtasks });
                              }}
                              className="w-full p-2 border rounded-md"
                            >
                              <option value="">Seleccionar usuario</option>
                              {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.email}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      console.log('Adding new subtask, current subtasks:', newTask.subtasks);
                      setNewTask({
                        ...newTask,
                        subtasks: [
                          ...newTask.subtasks,
                          {
                            title: '',
                            description: '',
                            estimated_duration: 30,
                            assigned_to: '',
                          } as const,
                        ],
                      });
                      console.log('New subtask added');
                    }}
                    className="mt-2 flex items-center text-indigo-600 hover:text-indigo-700"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Agregar Subtarea
                  </button>
                </div>
              </div>
            </form>
            <div className="p-6 border-t mt-auto">
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    console.log('Canceling task creation, current state:', {
                      newTask,
                      showModal: true,
                    });
                    setShowModal(false);
                    console.log('Modal closed, task creation canceled');
                  }}
                  className="px-4 py-2 border rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                >
                  Crear Tarea
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Tasks;