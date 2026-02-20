import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  assigned_projects?: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
  isAdmin: boolean;
  impersonateUser: (user: User) => void;
  stopImpersonating: () => void;
  isImpersonating: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const impersonating = localStorage.getItem('impersonating_user') === 'true';
    if (storedUser) {
      setUser(JSON.parse(storedUser));
      setIsImpersonating(impersonating);
    }
    setLoading(false);
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase
      .from('users')
      .select()
      .eq('email', email)
      .eq('password', password)
      .single();

    if (error) throw new Error('Credenciales inválidas');
    if (!data) throw new Error('Usuario no encontrado');

    const userData: User = {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      assigned_projects: data.assigned_projects ?? [],
    };

    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    
    // Redirect based on user role
    if (userData.role === 'admin') {
      navigate('/dashboard');
    } else {
      navigate('/user/mi-dia');
    }
  };

  const impersonateUser = (targetUser: User) => {
    if (user?.role !== 'admin') {
      console.error('Only admins can impersonate users.');
      return;
    }
    // Store the admin user before impersonating
    localStorage.setItem('admin_user', JSON.stringify(user));
    
    // Set the new user
    setUser(targetUser);
    localStorage.setItem('user', JSON.stringify(targetUser));
    
    // Set impersonation flag
    setIsImpersonating(true);
    localStorage.setItem('impersonating_user', 'true');
    
    navigate('/user/mi-dia');
  };

  const stopImpersonating = () => {
    const adminUser = localStorage.getItem('admin_user');
    if (adminUser) {
      setUser(JSON.parse(adminUser));
      localStorage.setItem('user', adminUser);
      localStorage.removeItem('admin_user');
      
      setIsImpersonating(false);
      localStorage.removeItem('impersonating_user');
      
      navigate('/dashboard');
    }
  };

  const signUp = async (name: string, email: string, password: string) => {
    const { data, error } = await supabase
      .from('users')
      .insert([
        { name, email, password, role: 'user' }
      ])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('El correo electrónico ya está registrado');
      }
      throw new Error('Error al crear la cuenta');
    }

    if (data) {
      const userData: User = {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
        assigned_projects: data.assigned_projects ?? [],
      };

      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      navigate('/user/mi-dia');
    }
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('admin_user');
    localStorage.removeItem('impersonating_user');
    navigate('/login');
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    isAdmin: user?.role === 'admin' && !isImpersonating,
    impersonateUser,
    stopImpersonating,
    isImpersonating,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}