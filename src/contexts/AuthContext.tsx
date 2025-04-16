import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
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
      role: data.role
    };

    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    navigate('/dashboard');
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
        role: data.role
      };

      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      navigate('/dashboard');
    }
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('user');
    navigate('/login');
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    isAdmin: user?.role === 'admin'
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