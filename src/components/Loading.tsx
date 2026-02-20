import React from 'react';

interface LoadingProps {
  /** Mensaje opcional debajo del spinner */
  message?: string;
  /** Tamaño: sm, md, lg */
  size?: 'sm' | 'md' | 'lg';
  /** Centrado en pantalla completa */
  fullScreen?: boolean;
}

const sizeClasses = {
  sm: 'h-6 w-6 border-2',
  md: 'h-12 w-12 border-2',
  lg: 'h-16 w-16 border-4',
};

export default function Loading({ message, size = 'md', fullScreen = false }: LoadingProps) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-4">
      <div
        className={`animate-spin rounded-full border-gray-300 border-t-gray-800 ${sizeClasses[size]}`}
      />
      {message && <p className="text-gray-600 text-sm">{message}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-[200px] flex items-center justify-center">
        {content}
      </div>
    );
  }

  return content;
}
