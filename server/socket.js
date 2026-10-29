/**
 * Veyra Real-time Communication Service via Socket.IO
 *
 * Requirements:
 * - Authoritative auction event broadcasting.
 * - Auction room isolation (join_auction, leave_auction).
 * - CORS configured for cross-origin local dev and production.
 * - Connection tracking and graceful error handling.
 * - High-fidelity payload preservation for bids, countdowns, auto-bids, and comments.
 * - Privacy protection: Never broadcast max_bid or private budgets.
 */

import { Server } from 'socket.io';

let io = null;
const activeSockets = new Set();

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
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 30000,
    pingInterval: 25000,
    connectTimeout: 45000
  });

  io.on('connection', (socket) => {
    activeSockets.add(socket.id);

    // Initial handshake acknowledging connection
    const serverTime = Date.now();
    socket.emit('CONNECTED', { socketId: socket.id, serverTime });
    socket.emit('event', {
      type: 'CONNECTED',
      payload: { socketId: socket.id },
      serverTime
    });

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
    socket.on('join_user', (userId) => {
      if (userId && typeof userId === 'string') {
        const roomName = `user:${userId.trim()}`;
        socket.join(roomName);
      }
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
 * Emits in two complementary channels to ensure 100% interoperability:
 * 1. Dedicated named event: `socket.on(type, payload)`
 * 2. Unified event envelope: `socket.on('event', { type, payload, serverTime })`
 *
 * If roomOnly is true and auctionId is specified, restricts broadcast to `auction:${auctionId}` room.
 * Otherwise, broadcasts to all connected clients exactly once (preventing duplicate events).
 *
 * @param {string} type - Event name (e.g. 'BID_PLACED', 'AUCTION_STARTED')
 * @param {object} payload - Event data payload
 * @param {string|null} auctionId - Optional auction room identifier
 * @param {boolean} roomOnly - Whether to restrict delivery exclusively to room members
 */
export function broadcastEvent(type, payload = {}, auctionId = null, roomOnly = false) {
  if (!io) {
    return false;
  }

  const serverTime = Date.now();
  const envelope = { type, payload, serverTime };

  if (roomOnly && auctionId && typeof auctionId === 'string') {
    const roomName = `auction:${auctionId.trim()}`;
    io.to(roomName).emit(type, payload);
    io.to(roomName).emit('event', envelope);
  } else {
    io.emit(type, payload);
    io.emit('event', envelope);
  }

  return true;
}

/**
 * Emit an event privately to an authenticated user's private channel.
 * @param {string} userId
 * @param {string} type
 * @param {object} payload
 */
export function sendUserEvent(userId, type, payload = {}) {
  if (!io || !userId) return false;
  const roomName = `user:${userId.trim()}`;
  const envelope = { type, payload, serverTime: Date.now() };
  io.to(roomName).emit(type, payload);
  io.to(roomName).emit('event', envelope);
  return true;
}
