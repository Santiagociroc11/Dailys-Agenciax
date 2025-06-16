// Version configuration
export const VERSION_INFO = {
  version: '1.1.1',
  buildDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
  releaseNotes: [
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