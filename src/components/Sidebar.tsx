import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, LogOut, Users, FolderOpen, KanbanSquare, User, SwitchCamera, Layers, BarChart3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import VersionInfo from './VersionInfo';

export default function Sidebar() {
  const { signOut, isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [isAdminView, setIsAdminView] = useState(true);

  const toggleView = () => {
    setIsAdminView(!isAdminView);
    
    // Navigate to appropriate route based on the view
    if (isAdminView) {
      // If currently in admin view, switch to user view
      navigate('/user');
    } else {
      // If currently in user view, switch to admin view
      navigate('/dashboard');
    }
  };

  return (
    <div className="w-64 bg-white shadow-lg h-full">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-800">Seguimiento de Actividades</h1>
      </div>
      <nav className="mt-6">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-gray-700 hover:bg-gray-100 ${
              isActive ? 'bg-gray-100' : ''
            }`
          }
        >
          <LayoutDashboard className="w-5 h-5 mr-3" />
          Panel Principal
        </NavLink>
        <NavLink
          to="/management"
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-gray-700 hover:bg-gray-100 ${
              isActive ? 'bg-gray-100' : ''
            }`
          }
        >
          <KanbanSquare className="w-5 h-5 mr-3" />
          Gestión
        </NavLink>
        <NavLink
          to="/projects"
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-gray-700 hover:bg-gray-100 ${
              isActive ? 'bg-gray-100' : ''
            }`
          }
        >
          <FolderOpen className="w-5 h-5 mr-3" />
          Proyectos
        </NavLink>
        <NavLink
          to="/tasks"
          className={({ isActive }) =>
            `flex items-center px-6 py-3 text-gray-700 hover:bg-gray-100 ${
              isActive ? 'bg-gray-100' : ''
            }`
          }
        >
          <CheckSquare className="w-5 h-5 mr-3" />
          {isAdmin ? 'Tareas' : 'Mis Tareas'}
        </NavLink>
        {isAdmin && (
          <>
            <NavLink
              to="/users"
              className={({ isActive }) =>
                `flex items-center px-6 py-3 text-gray-700 hover:bg-gray-100 ${
                  isActive ? 'bg-gray-100' : ''
                }`
              }
            >
              <Users className="w-5 h-5 mr-3" />
              Usuarios
            </NavLink>
            <NavLink
              to="/areas"
              className={({ isActive }) =>
                `flex items-center px-6 py-3 text-gray-700 hover:bg-gray-100 ${
                  isActive ? 'bg-gray-100' : ''
                }`
              }
            >
              <Layers className="w-5 h-5 mr-3" />
              Áreas de Trabajo
            </NavLink>
            <NavLink
              to="/reports"
              className={({ isActive }) =>
                `flex items-center px-6 py-3 text-gray-700 hover:bg-gray-100 ${
                  isActive ? 'bg-gray-100' : ''
                }`
              }
            >
              <BarChart3 className="w-5 h-5 mr-3" />
              Estadísticas
            </NavLink>
          </>
        )}
      </nav>
      <div className="absolute bottom-0 w-64 p-6">
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