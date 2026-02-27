/**
 * Establece el timestamp de deploy. Se ejecuta antes del build (prebuild).
 * Escribe en public/version.json para que el front lo consulte.
 * El front compara su __BUILD_TIMESTAMP__ con este archivo: si el servidor
 * tiene timestamp mayor, hay nueva versión (como un service worker).
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const timestamp = Date.now();

writeFileSync(
  path.join(rootDir, 'public', 'version.json'),
  JSON.stringify({ timestamp }, null, 0)
);

console.log(`[deploy] Timestamp ${timestamp} → public/version.json`);
