import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.PORT || '8787';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // src/extensions may be a symlink into a private repo during development;
    // resolve imports against the link location so extension files can
    // reference core modules relatively.
    preserveSymlinks: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': `http://localhost:${apiPort}`,
    },
  },
});
