/**
 * Cliente de base de datos compatible con la API de Supabase.
 * Usa MongoDB en el backend a través de /api/db/query.
 */
import { db } from './dbClient.js';

export const supabase = db;
