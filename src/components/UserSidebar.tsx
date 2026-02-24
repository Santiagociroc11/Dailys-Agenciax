import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FolderOpen, LogOut, CalendarDays, User, SwitchCamera, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import VersionInfo from './VersionInfo';

export default function UserSidebar() {
  const { user, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [isUserView, setIsUserView] = useState(true);

  const toggleView = () => {
    setIsUserView(!isUserView);
    if (isUserView) {
      navigate('/dashboard');
    } else {
      navigate('/user/mi-dia');
    }
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-5 border-b border-gray-100">
        <h1 className="text-lg font-semibold text-gray-800 tracking-tight">Mi espacio</h1>
        <p className="text-xs text-gray-500 mt-0.5">Tareas y proyectos</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {/** Mi día - principal */}
        <div className="mb-4">
          <NavLink
            to="/user/mi-dia"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <CalendarDays className="w-4 h-4 flex-shrink-0" />
            Mi día
          </NavLink>
        </div>

        {/** Gestión de tareas - todos los proyectos con filtro en listado */}
        <div className="mb-4">
          <NavLink
            to="/user/projects/all"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <FolderOpen className="w-4 h-4 flex-shrink-0" />
            Gestión de tareas
          </NavLink>
        </div>

        {/** Ajustes */}
        <div>
          <NavLink
            to="/user/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            Ajustes
          </NavLink>
        </div>
      </nav>

      {/* Footer - fijo en la parte inferior */}
      <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-3">
        {user && (
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-white/80 border border-gray-100">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-800 truncate">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
        )}

        <VersionInfo />

        {isAdmin && (
          <button
            onClick={toggleView}
            className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <SwitchCamera className="w-4 h-4 flex-shrink-0" />
            <span>Vista Admin</span>
          </button>
        )}

        <button
          onClick={() => {
            signOut();
            navigate('/login');
          }}
          className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span>Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
}
