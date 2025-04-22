import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';        // ← importamos Toaster
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import UserLayout from './components/UserLayout';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Users from './pages/Users';
import Projects from './pages/Projects';
import Areas from './pages/Areas';
import Management from './pages/Management';
import UserProjectView from './pages/UserProjectView';
import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';

// Route guard for admin routes
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!isAdmin) return <Navigate to="/user" replace />;
  return <>{children}</>;
};

// Route guard for user routes
const UserRoute = ({ children }: { children: React.ReactNode }) => {
  const { loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  return <>{children}</>;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        {/* 1️⃣ Monta el contenedor de toasts aquí, una sola vez */}
        <Toaster
          position="top-right"
          reverseOrder={false}
          toastOptions={{
            duration: 3000,
            // opcional: styling global
            style: {
              padding: '8px 16px',
              fontSize: '14px',
            },
          }}
        />

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Admin routes */}
          <Route path="/" element={
            <AdminRoute>
              <Layout />
            </AdminRoute>
          }>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="management" element={<Management />} />
            <Route path="projects" element={<Projects />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="users" element={<Users />} />
            <Route path="areas" element={<Areas />} />
          </Route>

          {/* User routes */}
          <Route path="/user" element={
            <UserRoute>
              <UserLayout />
            </UserRoute>
          }>
            <Route path="projects/:projectId" element={<UserProjectView />} />
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
