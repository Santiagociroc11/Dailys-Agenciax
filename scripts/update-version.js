#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Leer argumentos de línea de comandos
const args = process.argv.slice(2);
const versionType = args[0]; // patch, minor, major

if (!versionType || !['patch', 'minor', 'major'].includes(versionType)) {
  console.error('❌ Uso: node scripts/update-version.js <patch|minor|major>');
  console.error('📝 Ejemplo: node scripts/update-version.js patch');
  process.exit(1);
}

// Rutas de archivos
const packageJsonPath = path.join(__dirname, '../package.json');

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
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\\n');
  
  console.log('✅ Versión actualizada exitosamente en package.json:');
  console.log(`📦 Versión anterior: v${currentVersion}`);
  console.log(`🚀 Versión nueva: v${newVersion}`);
  console.log('');
  console.log('💡 Recuerda:');
  console.log('   - El archivo src/lib/version.ts debe actualizarse manualmente.');
  console.log('   - Revisar los cambios en git');
  console.log('   - Hacer commit de los archivos actualizados');
  console.log('   - Crear un tag si es necesario: git tag v' + newVersion);
  
} catch (error) {
  console.error('❌ Error al actualizar la versión:', error.message);
  process.exit(1);
} 