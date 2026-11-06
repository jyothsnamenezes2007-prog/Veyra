/**
 * Veyra Real-time Communication Service via Socket.IO
 *
 * Requirements:
 * - Authoritative auction event broadcasting.
 * - Auction room isolation (join_auction, leave_auction).
 * - CORS configured for cross-origin local dev and production.
 * - Connection tracking and graceful error handling.
 * - Supabase token authentication and secure private user rooms.
 * - Privacy protection: Never broadcast max_bid or private proxy configurations.
 */

import { Server } from 'socket.io';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
const supabaseKey = (
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim();

const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

let io = null;
const activeSockets = new Set();
let tokenVerifier = null;

const TRUSTED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://veyra-2qb1.onrender.com'
]);

/**
 * Check whether an incoming request Origin is trusted.
 * Compatible with local Vite development, preview, and deployed Render application.
 * @param {string|undefined} origin
 * @returns {boolean}
 */
export function isAllowedOrigin(origin) {
  if (!origin) return true;

  const normalized = origin.trim().replace(/\/$/, '');
  if (TRUSTED_ORIGINS.has(normalized)) return true;

  const envOrigins = [
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    process.env.RENDER_EXTERNAL_URL,
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
  ].filter(Boolean).map((o) => o.trim().replace(/\/$/, ''));

  if (envOrigins.includes(normalized)) return true;

  return false;
}

/**
 * Configure a custom token verifier (used in unit/integration test suites).
 * Strictly disabled in production mode so test mocks cannot override Supabase auth.
 * @param {Function|null} fn
 */
export function setTokenVerifier(fn) {
  if (process.env.NODE_ENV === 'production') {
    console.warn('[Socket.IO Security] Custom token verifier cannot be set in production mode.');
    tokenVerifier = null;
    return;
  }
  tokenVerifier = fn;
}

/**
 * Authenticate token via custom verifier or authoritative Supabase API
 * @param {string|null} token
 * @returns {Promise<string|null>} authenticated userId or null
 */
async function authenticateToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  // 1. Test verifier override (strictly disabled in production)
  if (tokenVerifier && process.env.NODE_ENV !== 'production') {
    try {
      const result = await tokenVerifier(token);
      if (result?.id) return result.id;
    } catch (e) {}
  }

  // 2. Authoritative Supabase API token verification
  if (supabase) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user?.id) {
        return user.id;
      }
    } catch (err) {}
  }

  return null;
}

/**
 * Initialize Socket.IO on the provided HTTP server instance.
 * @param {import('node:http').Server} httpServer
 * @returns {Server}
 */
export function initSocketServer(httpServer) {
  if (io) {
    return io;
  }

  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked for untrusted origin: ${origin}`));
        }
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    },
    // Enforce origin restrictions on both HTTP polling and WebSocket upgrade handshakes
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (!isAllowedOrigin(origin)) {
        return callback('Origin not allowed by security policy', false);
      }
      callback(null, true);
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 25000,
    connectTimeout: 45000
  });

  // Authentication middleware: runs before connection handler
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const authUserId = await authenticateToken(token);
      if (authUserId) {
        socket.data.userId = authUserId;
        socket.data.authenticated = true;
      } else {
        socket.data.userId = null;
        socket.data.authenticated = false;
      }
    } catch (e) {
      socket.data.userId = null;
      socket.data.authenticated = false;
    }
    next();
  });

  io.on('connection', (socket) => {
    activeSockets.add(socket.id);

    // Initial handshake acknowledging connection
    const serverTime = Date.now();
    socket.emit('CONNECTED', { socketId: socket.id, serverTime });

    // Auto-join private room if authenticated
    if (socket.data.authenticated && socket.data.userId) {
      socket.join(`user:${socket.data.userId}`);
      socket.emit('AUTH_SUCCESS', { userId: socket.data.userId });
    }

    // Room: Join specific auction floor
    socket.on('join_auction', (auctionId) => {
      if (auctionId && typeof auctionId === 'string') {
        const roomName = `auction:${auctionId.trim()}`;
        socket.join(roomName);
        socket.emit('ROOM_JOINED', { auctionId, roomName });
      }
    });

    // Room: Leave specific auction floor
    socket.on('leave_auction', (auctionId) => {
      if (auctionId && typeof auctionId === 'string') {
        const roomName = `auction:${auctionId.trim()}`;
        socket.leave(roomName);
        socket.emit('ROOM_LEFT', { auctionId, roomName });
      }
    });

    // Room: Join private authenticated user channel for direct alerts (outbid, wins)
    socket.on('join_user', (requestedUserId) => {
      // SECURITY: Reject unauthorized user room access.
      // Must be authenticated via Supabase; untrusted client-supplied ID is never accepted.
      if (!socket.data.authenticated || !socket.data.userId) {
        socket.emit('AUTH_ERROR', {
          error: 'Unauthorized: authentication required to access private user rooms.'
        });
        return;
      }

      if (requestedUserId && requestedUserId !== socket.data.userId) {
        socket.emit('AUTH_ERROR', {
          error: 'Forbidden: cannot access another user’s private channel.'
        });
        return;
      }

      const roomName = `user:${socket.data.userId}`;
      socket.join(roomName);
      socket.emit('USER_ROOM_JOINED', { userId: socket.data.userId });
    });

    socket.on('disconnect', (reason) => {
      activeSockets.delete(socket.id);
    });

    socket.on('error', (err) => {
      console.warn(`[Socket.IO] Error on socket ${socket.id}:`, err.message);
    });
  });

  console.log('[Socket.IO] Real-time WebSocket server initialized successfully.');
  return io;
}

/**
 * Returns the active Socket.IO server instance.
 */
export function getIO() {
  return io;
}

/**
 * Returns total currently connected active socket clients.
 */
export function getActiveSocketCount() {
  return activeSockets.size;
}

/**
 * Broadcast real-time event to connected Socket.IO clients.
 *
 * If roomOnly is true and auctionId is specified, restricts broadcast to `auction:${auctionId}` room.
 * Otherwise, broadcasts to all connected clients exactly once (preventing duplicate events).
 *
 * Private proxy events are fail-closed: delivered strictly via sendUserEvent() to the
 * authenticated owner's private room. If the owner is missing or invalid, the event is
 * dropped and never broadcast to public or auction rooms.
 *
 * @param {string} type - Event name (e.g. 'BID_PLACED', 'AUCTION_STARTED')
 * @param {object} payload - Event data payload
 * @param {string|null} auctionId - Optional auction room identifier
 * @param {boolean} roomOnly - Whether to restrict delivery exclusively to room members
 * @returns {boolean}
 */
export function broadcastEvent(type, payload = {}, auctionId = null, roomOnly = false) {
  if (!io) {
    return false;
  }

  // Security guard: Private proxy events MUST be delivered strictly to the authenticated owner's private room
  const isPrivateProxyEvent =
    type === 'PROXY_CONFIG_UPDATED' ||
    type === 'PROXY_BID_LIMIT_EXCEEDED' ||
    type === 'PROXY_BID_PLACED';

  if (isPrivateProxyEvent) {
    const rawOwnerId = payload?.config?.userId || payload?.proxyConfig?.userId || payload?.userId || null;
    const ownerUserId = typeof rawOwnerId === 'string' && rawOwnerId.trim() ? rawOwnerId.trim() : null;

    if (!ownerUserId) {
      console.warn(`[Socket.IO Security] Dropped private event "${type}": missing or invalid owner user ID.`);
      return false;
    }

    return sendUserEvent(ownerUserId, type, payload);
  }

  if (roomOnly && auctionId && typeof auctionId === 'string') {
    const roomName = `auction:${auctionId.trim()}`;
    io.to(roomName).emit(type, payload);
  } else {
    io.emit(type, payload);
  }

  return true;
}

/**
 * Emit an event privately to an authenticated user's private channel.
 * @param {string} userId
 * @param {string} type
 * @param {object} payload
 * @returns {boolean}
 */
export function sendUserEvent(userId, type, payload = {}) {
  if (!io || !userId) return false;
  const safeUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!safeUserId) return false;
  const roomName = `user:${safeUserId}`;
  io.to(roomName).emit(type, payload);
  return true;
}
