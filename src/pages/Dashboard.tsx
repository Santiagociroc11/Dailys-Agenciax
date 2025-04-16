import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const Dashboard = () => {
  const { user } = useAuth();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Panel Principal</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Resumen de Tareas</h2>
          <div className="space-y-2">
            <p className="text-gray-600">Bienvenido/a, {user?.email}</p>
            <p className="text-gray-600">No tienes tareas pendientes.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;