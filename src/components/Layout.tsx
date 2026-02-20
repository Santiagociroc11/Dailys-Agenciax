import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Breadcrumbs from './Breadcrumbs';
import { useAuth } from '../contexts/AuthContext';
import { AlertTriangle, Home } from 'lucide-react';

export default function Layout() {
  const { isImpersonating, stopImpersonating, user } = useAuth();

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {isImpersonating && (
          <div className="bg-yellow-400 text-black p-2 text-center text-sm flex justify-center items-center">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Estás viendo como <span className="font-bold mx-1">{user?.name}</span>.
            <button
              onClick={stopImpersonating}
              className="ml-4 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-1 px-2 rounded flex items-center"
            >
              <Home className="w-4 h-4 mr-1" />
              Volver a mi cuenta
            </button>
          </div>
        )}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-6">
          <Breadcrumbs />
          <Outlet />
        </main>
      </div>
    </div>
  );
}