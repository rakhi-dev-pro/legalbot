import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const certPath = path.resolve(__dirname, 'certs/cert.pem');
const keyPath = path.resolve(__dirname, 'certs/key.pem');

const httpsConfig = (fs.existsSync(certPath) && fs.existsSync(keyPath))
  ? {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }
  : undefined;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    https: httpsConfig,
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
      '/admin': {
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

