import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase } from './db.js';
import { scheduler } from './scheduler.js';
import { handleApiRequest } from './api.js';
import { initSocketServer } from './socket.js';

// Securely load environment variables from root .env.local if present
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnvLocal = path.resolve(__dirname, '..', '.env.local');

if (fs.existsSync(rootEnvLocal)) {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(rootEnvLocal);
    } catch (e) {}
  } else {
    try {
      const raw = fs.readFileSync(rootEnvLocal, 'utf8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[k]) process.env[k] = v;
        }
      }
    } catch (e) {}
  }
}

const PORT = process.env.PORT || 3001;

// Initialize database
initDatabase();

// Start background scheduler
scheduler.start();

const server = http.createServer(async (req, res) => {
  // Let Socket.IO handle /socket.io polling and upgrade requests
  if (req.url && req.url.startsWith('/socket.io')) {
    return;
  }

  // Enable CORS for local cross-origin development if needed
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const handled = await handleApiRequest(req, res);
  if (!handled) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  }
});

// Attach Socket.IO to the HTTP server
initSocketServer(server);

server.listen(PORT, () => {
  console.log(`[Veyra Server] Running on http://localhost:${PORT}`);
  console.log(`[Veyra Server] Authoritative auction scheduler is ACTIVE.`);
  console.log(`[Veyra Server] Socket.IO real-time engine attached and listening.`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Veyra Server] Shutting down...');
  scheduler.stop();
  server.close(() => {
    process.exit(0);
  });
});
