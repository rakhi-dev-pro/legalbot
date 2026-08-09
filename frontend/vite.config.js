import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/auth': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/docs': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/reports': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/tests': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
      '/openapi.json': {
        target: 'http://backend:8000',
        changeOrigin: true,
      },
    },
  },
});
