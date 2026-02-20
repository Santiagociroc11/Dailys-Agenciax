import React from 'react';
import { SkeletonPage } from './Skeleton';

interface LoadingProps {
  /** Mensaje opcional debajo del skeleton */
  message?: string;
  /** Tamaño: sm, md, lg (legacy, ignorado) */
  size?: 'sm' | 'md' | 'lg';
  /** Centrado en pantalla completa */
  fullScreen?: boolean;
}

export default function Loading({ message, fullScreen = false }: LoadingProps) {
  const content = <SkeletonPage message={message} />;

  return (
    <div className={fullScreen ? 'min-h-[200px] flex items-center justify-center' : ''}>
      {content}
    </div>
  );
}
