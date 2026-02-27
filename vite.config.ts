import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_TIMESTAMP = Date.now();

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify(BUILD_TIMESTAMP),
  },
  plugins: [
    react(),
    {
      name: 'version-file',
      buildStart() {
        writeFileSync(
          path.join(__dirname, 'public', 'version.json'),
          JSON.stringify({ timestamp: BUILD_TIMESTAMP })
        );
      },
    },
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
