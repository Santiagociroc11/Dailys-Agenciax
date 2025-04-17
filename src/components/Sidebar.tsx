import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, CheckSquare, LogOut, Users, FolderOpen, KanbanSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Sidebar() {
  const { signOut, isAdmin } = useAuth();

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
        )}
      </nav>
      <div className="absolute bottom-0 w-64 p-6">
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