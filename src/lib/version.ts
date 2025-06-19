// Version configuration
export const VERSION_INFO = {
  version: '1.1.2',
  buildDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
  releaseNotes: [
    'Nueva vista de Tareas Principales en el tablero de Gestión.',
    'Lógica de estado para tareas principales basada en sub-tareas o estado propio.',
    'Agrupación por proyecto, prioridad, asignado y fecha en la vista de Tareas Principales.',
    'Mejoras visuales en el tablero Kanban y modales de tareas.',
    'Corrección de estilos en la tabla de sub-tareas para evitar scroll horizontal.'
  ]
};

// Function to get version display text
export const getVersionDisplay = () => {
  return `v${VERSION_INFO.version}`;
};

// Function to get full version info
export const getFullVersionInfo = () => {
  return {
    ...VERSION_INFO,
    displayVersion: getVersionDisplay()
  };
}; 