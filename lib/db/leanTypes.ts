/**
 * Tipos para documentos Lean de Mongoose.
 * Usar estos en lugar de tipos inline para evitar errores de null/undefined
 * cuando se trabaja con resultados de .lean().
 *
 * Estos tipos reflejan que Mongoose devuelve null/undefined en campos opcionales.
 */

/** Tarea con campos opcionales como los devuelve Mongoose .lean() */
export type TaskLean = {
  id: string;
  title: string;
  project_id?: string | null;
  [key: string]: unknown;
};

/** Proyecto con campos opcionales como los devuelve Mongoose .lean() */
export type ProjectLean = {
  id: string;
  name: string;
  client_id?: string | null;
  [key: string]: unknown;
};

/** Usuario con campos opcionales como los devuelve Mongoose .lean() */
export type UserLean = {
  id: string;
  name: string;
  email: string;
  telegram_chat_id?: string | null;
  [key: string]: unknown;
};
