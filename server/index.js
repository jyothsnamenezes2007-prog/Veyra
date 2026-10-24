import http from 'node:http';
import { initDatabase } from './db.js';
import { scheduler } from './scheduler.js';
import { handleApiRequest } from './api.js';

const PORT = process.env.PORT || 3001;

// Initialize database
initDatabase();

// Start background scheduler
scheduler.start();

const server = http.createServer(async (req, res) => {
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

server.listen(PORT, () => {
  console.log(`[Veyra Server] Running on http://localhost:${PORT}`);
  console.log(`[Veyra Server] Authoritative auction scheduler is ACTIVE.`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Veyra Server] Shutting down...');
  scheduler.stop();
  server.close(() => {
    process.exit(0);
  });
});
