// Version configuration
export const VERSION_INFO = {
  version: '1.2.0',
  buildDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
  releaseNotes: [
    'Tablero de Tareas Principales en Gestión con estados y agrupaciones.',
    'Lógica de estado mejorada para tareas con y sin subtareas.',
    'Mejora en la visualización de títulos largos de subtareas.',
    'editor de texto en la descripción de las tareas',
    'editor de texto en la descripción de las subtareas',
    'visualizacion de enlaces correctamente'
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