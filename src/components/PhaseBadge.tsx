import React from 'react';

interface PhaseBadgeProps {
  phaseName: string | null | undefined;
  className?: string;
}

/**
 * Badge para mostrar la fase de una tarea. Solo se renderiza si phaseName tiene valor.
 */
const PhaseBadge: React.FC<PhaseBadgeProps> = ({ phaseName, className = '' }) => {
  if (!phaseName?.trim()) return null;

  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-violet-100 text-violet-800 border border-violet-200 ${className}`}
      title={`Fase: ${phaseName}`}
    >
      {phaseName}
    </span>
  );
};

export default PhaseBadge;
