import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { initDatabase } from './server/db.js';
import { scheduler } from './server/scheduler.js';
import { handleApiRequest } from './server/api.js';
import { initSocketServer } from './server/socket.js';

function veyraBackendPlugin() {
  return {
    name: 'veyra-backend-plugin',
    configureServer(server) {
      initDatabase();
      scheduler.start();

      if (server.httpServer) {
        initSocketServer(server.httpServer);
      }

      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api')) {
          try {
            const handled = await handleApiRequest(req, res);
            if (handled) return;
          } catch (err) {
            console.error('[Veyra Backend Plugin Error]:', err);
          }
        }
        next();
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), veyraBackendPlugin()],
  server: {
    port: Number(process.env.VITE_PORT) || 3000,
    open: false,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true
      },
      '/socket.io': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        ws: true
      }
    }
  },
  preview: {
    port: Number(process.env.VITE_PREVIEW_PORT) || 4173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true
      },
      '/socket.io': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        ws: true
      }
    }
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('socket.io-client') || id.includes('engine.io-client')) {
              return 'vendor-socket';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
          }
        }
      }
    }
  }
});

