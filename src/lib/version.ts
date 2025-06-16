// Version configuration
export const VERSION_INFO = {
  version: '1.0.0',
  buildDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
  releaseNotes: [
    'Sistema de versionado implementado',
    'Corrección de eliminación de tareas con referencias FK',
    'Mejoras en la gestión de tareas y subtareas'
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