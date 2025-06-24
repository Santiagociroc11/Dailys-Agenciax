import React from 'react';

// Define all possible status values and their Spanish translations
export const statusTextMap: Record<string, string> = {
  'pending': 'Pendiente',
  'assigned': 'Asignada',
  'in_progress': 'En progreso',
  'completed': 'Completada',
  'blocked': 'Bloqueada',
  'in_review': 'En revisión',
  'returned': 'Devuelta',
  'approved': 'Aprobada'
};

// Define color schemes for each status
export const statusColorMap: Record<string, {bg: string, text: string, border?: string}> = {
  'pending': { bg: 'bg-gray-100', text: 'text-gray-800' },
  'assigned': { bg: 'bg-blue-100', text: 'text-blue-800' },
  'in_progress': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'completed': { bg: 'bg-green-100', text: 'text-green-800' },
  'blocked': { bg: 'bg-red-100', text: 'text-red-800' },
  'in_review': { bg: 'bg-indigo-100', text: 'text-indigo-800' },
  'returned': { bg: 'bg-orange-100', text: 'text-orange-800' },
  'approved': { bg: 'bg-emerald-100', text: 'text-emerald-800' }
};

interface TaskStatusDisplayProps {
  status: string;
  className?: string;
}

/**
 * Component for displaying a task's status in Spanish with appropriate styling
 */
const TaskStatusDisplay: React.FC<TaskStatusDisplayProps> = ({ status, className = '' }) => {
  const statusConfig = {
    pending: { label: 'Pendiente', color: 'bg-gray-200 text-gray-800' },
    assigned: { label: 'Asignada', color: 'bg-gray-300 text-gray-900' },
    in_progress: { label: 'En Progreso', color: 'bg-yellow-100 text-yellow-800' },
    blocked: { label: 'Bloqueada', color: 'bg-red-200 text-red-800' },
    completed: { label: 'Completada', color: 'bg-green-100 text-green-800' },
    in_review: { label: 'En Revisión', color: 'bg-blue-100 text-blue-800' },
    returned: { label: 'Devuelta', color: 'bg-orange-200 text-orange-800' },
    approved: { label: 'Aprobada', color: 'bg-teal-100 text-teal-800' },
    default: { label: status, color: 'bg-gray-200 text-gray-800' }
  };

  const { label, color } = statusConfig[status as keyof typeof statusConfig] || statusConfig.default;

  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded-full inline-flex items-center ${color} ${className}`}>
      {label}
    </span>
  );
};

export default TaskStatusDisplay; 