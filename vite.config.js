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
    port: 3000,
    open: true
  }
});
