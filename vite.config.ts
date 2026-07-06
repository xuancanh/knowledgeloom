import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = process.env.PORT || '8787';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // src/ee may be a symlink into the private EE repo during development
    // (knowledge-loom-ee/scripts/link-dev.sh); resolve imports against the
    // link location so EE files can reference OSS modules relatively.
    preserveSymlinks: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': `http://localhost:${apiPort}`,
    },
  },
});
