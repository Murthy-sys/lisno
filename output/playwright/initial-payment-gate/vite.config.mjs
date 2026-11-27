import { defineConfig } from '../../../frontend/node_modules/vite/dist/node/index.js';
import react from '../../../frontend/node_modules/@vitejs/plugin-react/dist/index.js';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [{ name: 'synthetic-auth', enforce: 'pre', resolveId(id) { if (id.endsWith('/auth/AuthProvider')) return fileURLToPath(new URL('./auth.tsx', import.meta.url)); } }, react()],
  server: { host: '127.0.0.1', port: 4181, strictPort: true, fs: { allow: [fileURLToPath(new URL('../../../', import.meta.url))] } },
  resolve: { alias: Object.fromEntries(['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'].map(name => [name, fileURLToPath(new URL('../../../frontend/node_modules/' + name, import.meta.url))])), dedupe: ['react', 'react-dom'] }
});
