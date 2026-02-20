import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  /** Mapa de rutas a etiquetas. Ej: { '/dashboard': 'Panel Principal' } */
  routeLabels?: Record<string, string>;
}

const DEFAULT_LABELS: Record<string, string> = {
  '/dashboard': 'Panel Principal',
  '/management': 'Gestión',
  '/projects': 'Proyectos',
  '/tasks': 'Tareas',
  '/users': 'Usuarios',
  '/areas': 'Áreas',
  '/reports': 'Reportes',
  '/settings': 'Configuración',
  '/user': 'Usuario',
  '/user/mi-dia': 'Mi día',
  '/user/projects': 'Proyectos',
  '/user/projects/all': 'Todos los proyectos',
  '/user/settings': 'Ajustes',
};

export default function Breadcrumbs({ routeLabels = {} }: BreadcrumbsProps) {
  const location = useLocation();
  const pathname = location.pathname;
  const labels = { ...DEFAULT_LABELS, ...routeLabels };

  const segments = pathname.split('/').filter(Boolean);
  const items: BreadcrumbItem[] = [];
  let currentPath = '';

  for (let i = 0; i < segments.length; i++) {
    currentPath += '/' + segments[i];
    let label = labels[currentPath];
    if (!label) {
      if (currentPath.startsWith('/user/projects/') && segments[i] !== 'all') {
        label = 'Proyecto';
      } else {
        label = segments[i];
      }
    }

    const isLast = i === segments.length - 1;
    let href: string | undefined;
    if (!isLast) {
      if (currentPath === '/user/projects') href = '/user/projects/all';
      else if (currentPath === '/user') href = '/user/mi-dia';
      else href = currentPath;
    }
    items.push({ label, href });
  }

  if (items.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-sm text-gray-600 mb-4" aria-label="Breadcrumb">
      {items.map((item, idx) => (
        <React.Fragment key={idx}>
          {idx > 0 && <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
          {item.href ? (
            <Link to={item.href} className="hover:text-gray-900 truncate max-w-[150px]">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-gray-800 truncate max-w-[200px]" title={item.label}>
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
