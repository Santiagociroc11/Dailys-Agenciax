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
  outline?: boolean;
}

/**
 * Component for displaying a task's status in Spanish with appropriate styling
 */
const TaskStatusDisplay: React.FC<TaskStatusDisplayProps> = ({ 
  status, 
  className = '', 
  outline = false 
}) => {
  const colors = statusColorMap[status] || { bg: 'bg-gray-100', text: 'text-gray-800' };
  const displayText = statusTextMap[status] || status;
  
  const outlineClass = outline 
    ? `border-2 ${colors.text.replace('text', 'border')}` 
    : '';

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} ${outlineClass} ${className}`}>
      {displayText}
    </span>
  );
};

export default TaskStatusDisplay; 