import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import UserLayout from './components/UserLayout';
import Loading from './components/Loading';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Users = lazy(() => import('./pages/Users'));
const Projects = lazy(() => import('./pages/Projects'));
const Clients = lazy(() => import('./pages/Clients'));
const Areas = lazy(() => import('./pages/Areas'));
const Management = lazy(() => import('./pages/Management'));
const Reports = lazy(() => import('./pages/Reports'));
const CapacityView = lazy(() => import('./pages/CapacityView'));
const Audits = lazy(() => import('./pages/Audits'));
const ActivityReport = lazy(() => import('./pages/ActivityReport'));
const UserProjectView = lazy(() => import('./pages/UserProjectView'));
const MiDiaView = lazy(() => import('./pages/MiDiaView'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Home = lazy(() => import('./pages/Home'));
const Settings = lazy(() => import('./pages/Settings'));
const UserSettings = lazy(() => import('./pages/UserSettings'));

// Route guard for admin routes
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loading size="lg" /></div>;
  if (!isAdmin) return <Navigate to="/user/mi-dia" replace />;
  return <>{children}</>;
};

// Route guard for user routes
const UserRoute = ({ children }: { children: React.ReactNode }) => {
  const { loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loading size="lg" /></div>;
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
          <Route path="/" element={
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loading message="Cargando..." size="lg" /></div>}>
              <Home />
            </Suspense>
          } />
          <Route path="/login" element={
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loading message="Cargando..." size="lg" /></div>}>
              <Login />
            </Suspense>
          } />
          <Route path="/register" element={
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loading message="Cargando..." size="lg" /></div>}>
              <Register />
            </Suspense>
          } />

          {/* Admin routes */}
          <Route path="/" element={
            <AdminRoute>
              <Layout />
            </AdminRoute>
          }>
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="management" element={<Management />} />
              <Route path="projects" element={<Projects />} />
              <Route path="clients" element={<Clients />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="users" element={<Users />} />
              <Route path="areas" element={<Areas />} />
              <Route path="reports" element={<Reports />} />
              <Route path="capacity" element={<CapacityView />} />
              <Route path="audits" element={<Audits />} />
              <Route path="activity" element={<ActivityReport />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            {/* User routes */}
            <Route path="/user" element={
              <UserRoute>
                <UserLayout />
              </UserRoute>
            }>
              <Route index element={<Navigate to="/user/mi-dia" replace />} />
              <Route path="mi-dia" element={<MiDiaView />} />
              <Route path="projects/:projectId" element={<UserProjectView />} />
              <Route path="settings" element={<UserSettings />} />
            </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
