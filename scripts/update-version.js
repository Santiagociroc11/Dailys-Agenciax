#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Leer argumentos de línea de comandos
const args = process.argv.slice(2);
const versionType = args[0]; // patch, minor, major
const releaseNotes = args.slice(1).join(' ') || 'Actualización de versión';

if (!versionType || !['patch', 'minor', 'major'].includes(versionType)) {
  console.error('❌ Uso: node scripts/update-version.js <patch|minor|major> [notas de la versión]');
  console.error('📝 Ejemplo: node scripts/update-version.js patch "Corrección de errores menores"');
  process.exit(1);
}

// Rutas de archivos
const packageJsonPath = path.join(__dirname, '../package.json');
const versionFilePath = path.join(__dirname, '../src/lib/version.ts');

try {
  // Leer package.json
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = packageJson.version;
  
  // Calcular nueva versión
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  let newVersion;
  
  switch (versionType) {
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
  }
  
  // Actualizar package.json
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
  
  // Actualizar archivo de versión
  const buildDate = new Date().toISOString().split('T')[0];
  const versionFileContent = `// Version configuration
export const VERSION_INFO = {
  version: '${newVersion}',
  buildDate: '${buildDate}',
  releaseNotes: [
    '${releaseNotes}'
  ]
};

// Function to get version display text
export const getVersionDisplay = () => {
  return \`v\${VERSION_INFO.version}\`;
};

// Function to get full version info
export const getFullVersionInfo = () => {
  return {
    ...VERSION_INFO,
    displayVersion: getVersionDisplay()
  };
};`;

  fs.writeFileSync(versionFilePath, versionFileContent);
  
  console.log('✅ Versión actualizada exitosamente:');
  console.log(`📦 Versión anterior: v${currentVersion}`);
  console.log(`🚀 Versión nueva: v${newVersion}`);
  console.log(`📅 Fecha: ${buildDate}`);
  console.log(`📝 Notas: ${releaseNotes}`);
  console.log('');
  console.log('💡 Recuerda:');
  console.log('   - Revisar los cambios en git');
  console.log('   - Hacer commit de los archivos actualizados');
  console.log('   - Crear un tag si es necesario: git tag v' + newVersion);
  
} catch (error) {
  console.error('❌ Error al actualizar la versión:', error.message);
  process.exit(1);
} 