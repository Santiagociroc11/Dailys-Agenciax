import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, LogOut, Users, FolderOpen, KanbanSquare, User, SwitchCamera, Layers, BarChart3, Building2, PieChart, History, Activity, DollarSign, ChevronDown, ChevronRight, Settings, Calendar } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import VersionInfo from './VersionInfo';

type NavItem = { to: string; label: string; icon: React.ElementType };

const linkClass = (isActive: boolean) =>
  `flex items-center px-6 py-2.5 text-gray-700 hover:bg-gray-100 text-sm ${
    isActive ? 'bg-gray-100 font-medium' : ''
  }`;

function NavItemLink({ to, label, icon: Icon }: NavItem) {
  return (
    <NavLink to={to} className={({ isActive }) => linkClass(isActive)}>
      <Icon className="w-4 h-4 mr-3 text-gray-500 shrink-0" />
      {label}
    </NavLink>
  );
}

function CollapsibleSection({
  label,
  icon: Icon,
  items,
  expanded,
  onToggle,
  isActive,
}: {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
  expanded: boolean;
  onToggle: () => void;
  isActive: boolean;
}) {
  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className={`flex items-center w-full px-6 py-2.5 text-left text-gray-700 hover:bg-gray-100 ${
          isActive ? 'bg-gray-50' : ''
        }`}
      >
        <Icon className="w-5 h-5 mr-3 text-gray-500 shrink-0" />
        <span className="flex-1 font-medium">{label}</span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {expanded && (
        <div className="pl-4 pb-1">
          {items.map((item) => (
            <NavItemLink key={item.to} {...item} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { signOut, isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdminView, setIsAdminView] = useState(true);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    operativo: true,
    equipo: false,
    reportes: false,
    finanzas: false,
  });

  useEffect(() => {
    const path = location.pathname;
    setExpanded((prev) => {
      const next = { ...prev };
      if (['/management', '/projects', '/clients', '/tasks'].includes(path)) next.operativo = true;
      if (['/users', '/areas'].includes(path)) next.equipo = true;
      if (['/reports', '/audits', '/activity', '/capacity'].includes(path)) next.reportes = true;
      if (['/payroll', '/timeline'].includes(path)) next.finanzas = true;
      return next;
    });
  }, [location.pathname]);

  const toggle = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  const isActiveIn = (paths: string[]) => paths.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'));

  const toggleView = () => {
    setIsAdminView(!isAdminView);
    if (isAdminView) navigate('/user/mi-dia');
    else navigate('/dashboard');
  };

  const operativoItems: NavItem[] = [
    { to: '/management', label: 'Gestión', icon: KanbanSquare },
    { to: '/projects', label: 'Proyectos', icon: FolderOpen },
    { to: '/clients', label: 'Clientes', icon: Building2 },
    { to: '/tasks', label: isAdmin ? 'Tareas' : 'Mis Tareas', icon: CheckSquare },
  ];

  const equipoItems: NavItem[] = [
    { to: '/users', label: 'Usuarios', icon: Users },
    { to: '/areas', label: 'Áreas de Trabajo', icon: Layers },
  ];

  const reportesItems: NavItem[] = [
    { to: '/reports', label: 'Estadísticas', icon: BarChart3 },
    { to: '/activity', label: 'Reporte de actividad', icon: Activity },
    { to: '/capacity', label: 'Carga del equipo', icon: PieChart },
    { to: '/audits', label: 'Auditoría', icon: History },
  ];

  const finanzasItems: NavItem[] = [
    { to: '/payroll', label: 'Nómina', icon: DollarSign },
    { to: '/timeline', label: 'Timeline', icon: Calendar },
  ];

  return (
    <div className="w-64 bg-white shadow-lg h-full flex flex-col min-h-0">
      <div className="p-6 shrink-0">
        <h1 className="text-2xl font-bold text-gray-800">Seguimiento de Actividades</h1>
      </div>
      <nav className="flex-1 overflow-y-auto min-h-0 py-2">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-gray-700 hover:bg-gray-100 ${
              isActive ? 'bg-gray-100 font-medium' : ''
            }`
          }
        >
          <LayoutDashboard className="w-5 h-5 mr-3" />
          Panel Principal
        </NavLink>

        <CollapsibleSection
          label="Operativo"
          icon={FolderOpen}
          items={operativoItems}
          expanded={expanded.operativo}
          onToggle={() => toggle('operativo')}
          isActive={isActiveIn(['/management', '/projects', '/clients', '/tasks'])}
        />

        {isAdmin && (
          <>
            <CollapsibleSection
              label="Equipo"
              icon={Users}
              items={equipoItems}
              expanded={expanded.equipo}
              onToggle={() => toggle('equipo')}
              isActive={isActiveIn(['/users', '/areas'])}
            />
            <CollapsibleSection
              label="Reportes"
              icon={BarChart3}
              items={reportesItems}
              expanded={expanded.reportes}
              onToggle={() => toggle('reportes')}
              isActive={isActiveIn(['/reports', '/audits', '/activity', '/capacity'])}
            />
            <CollapsibleSection
              label="Finanzas"
              icon={DollarSign}
              items={finanzasItems}
              expanded={expanded.finanzas}
              onToggle={() => toggle('finanzas')}
              isActive={isActiveIn(['/payroll', '/timeline'])}
            />
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `flex items-center px-6 py-3 text-gray-700 hover:bg-gray-100 ${
                  isActive ? 'bg-gray-100 font-medium' : ''
                }`
              }
            >
              <Settings className="w-5 h-5 mr-3" />
              Ajustes
            </NavLink>
          </>
        )}
      </nav>
      <div className="shrink-0 p-6 border-t border-gray-100">
        <VersionInfo />
        {user && (
          <div className="mb-4 border-t pt-4">
            <div className="flex items-center mb-2">
              <User className="w-5 h-5 mr-3 text-gray-500" />
              <div className="overflow-hidden">
                <p className="font-medium text-gray-800 truncate">{user.name}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}
        {isAdmin && (
          <button
            onClick={toggleView}
            className="flex items-center w-full mb-4 py-2 px-3 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            <SwitchCamera className="w-5 h-5 mr-3" />
            <span>Cambiar a vista {isAdminView ? 'Usuario' : 'Admin'}</span>
          </button>
        )}
        <button
          onClick={() => signOut()}
          className="flex items-center text-gray-700 hover:text-gray-900"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
}
