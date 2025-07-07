import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { FolderOpen, LogOut, CheckSquare, Calendar, User, SwitchCamera, LayoutDashboard, Briefcase, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import VersionInfo from './VersionInfo';

interface Project {
  id: string;
  name: string;
}

export default function UserSidebar() {
  const { user, signOut, isAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [isUserView, setIsUserView] = useState(true);

  useEffect(() => {
    if (user) {
      fetchUserProjects();
    }
  }, [user]);

  const toggleView = () => {
    setIsUserView(!isUserView);
    
    // Navigate to appropriate route based on the view
    if (isUserView) {
      // If currently in user view, switch to admin view
      navigate('/dashboard');
    } else {
      // If currently in admin view, switch to user view
      navigate('/user');
    }
  };

  async function fetchUserProjects() {
    try {
      // Get user's assigned projects
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('assigned_projects')
        .eq('id', user?.id)
        .single();

      if (userError) throw userError;
      
      if (userData?.assigned_projects && userData.assigned_projects.length > 0) {
        // Fetch project details for assigned projects
        const { data: projectsData, error: projectsError } = await supabase
          .from('projects')
          .select('id, name')
          .in('id', userData.assigned_projects);

        if (projectsError) throw projectsError;
        setProjects(projectsData || []);
      }
    } catch (error) {
      console.error('Error fetching user projects:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-64 bg-white shadow-lg h-full">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-800">USUARIO</h1>
      </div>
      <nav className="mt-6">
        <div className="px-6 py-3">
          <div className="flex items-center text-gray-700">
            <FolderOpen className="w-5 h-5 mr-3" />
            <span className="font-medium">PROYECTOS</span>
          </div>
          <div className="mt-2 pl-8 space-y-1">
            <NavLink
              to="/user/projects/all"
              className={({ isActive }) =>
                `block py-1 px-2 text-sm text-gray-700 rounded hover:bg-gray-100 ${
                  isActive ? 'bg-gray-100 font-medium' : ''
                }`
              }
            >
              Todos los proyectos
            </NavLink>
            <NavLink to="/user/settings" className={({ isActive }) =>
              `block py-1 px-2 text-sm text-gray-700 rounded hover:bg-gray-100 ${
                isActive ? 'bg-gray-100 font-medium' : ''
              }`
            }>
              <span>Ajustes</span>
            </NavLink>
          </div>
        </div>
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
            <span>Cambiar a vista {isUserView ? 'Admin' : 'Usuario'}</span>
          </button>
        )}
        
        <button
          onClick={() => {
            signOut();
            navigate('/login');
          }}
          className="flex items-center text-gray-700 hover:text-gray-900"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
} 