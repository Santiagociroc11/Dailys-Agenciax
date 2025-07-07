import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

// Use environment variables that work in both frontend (Vite) and backend (Node.js)
const supabaseUrl = typeof window !== 'undefined' 
  ? import.meta.env.VITE_SUPABASE_URL 
  : process.env.VITE_SUPABASE_URL;

const supabaseAnonKey = typeof window !== 'undefined' 
  ? import.meta.env.VITE_SUPABASE_ANON_KEY 
  : process.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);