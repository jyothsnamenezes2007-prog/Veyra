/**
 * Veyra Client-Side Socket.IO Service
 *
 * Requirements:
 * - Singleton Socket.IO connection.
 * - Automatic reconnection with exponential backoff.
 * - Clean join/leave auction rooms.
 * - Robust cleanup on unmount to prevent duplicate event listeners.
 */

import { io } from 'socket.io-client';
import { supabase } from './supabase';

let socketInstance = null;

/**
 * Returns the singleton Socket.IO client instance.
 * Automatically connects to the current host origin.
 */
export function getSocket() {
  if (!socketInstance && typeof window !== 'undefined') {
    // Connects to configured VITE_SOCKET_URL or defaults to current host origin
    const socketUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCKET_URL)
      ? import.meta.env.VITE_SOCKET_URL
      : window.location.origin;

    socketInstance = io(socketUrl, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
      auth: (cb) => {
        if (supabase) {
          supabase.auth.getSession()
            .then(({ data }) => {
              cb({ token: data?.session?.access_token || null });
            })
            .catch(() => {
              cb({ token: null });
            });
        } else {
          cb({ token: null });
        }
      }
    });

    socketInstance.on('connect', () => {
      console.log('[Socket.IO] Connected to Veyra real-time server:', socketInstance.id);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected from real-time server:', reason);
    });

    socketInstance.on('connect_error', (error) => {
      console.warn('[Socket.IO] Connection warning:', error.message);
    });

    socketInstance.on('AUTH_SUCCESS', (info) => {
      console.log('[Socket.IO] Authenticated user session established:', info.userId);
    });

    socketInstance.on('AUTH_ERROR', (error) => {
      console.warn('[Socket.IO] Private room authorization notice:', error.error);
    });
  }

  return socketInstance;
}

/**
 * Synchronize socket credentials when user logs in, logs out, or token refreshes.
 * Disconnects and reconnects the socket to renegotiate private channels.
 * @param {string|null} token
 */
export function updateSocketAuthToken(token) {
  if (!socketInstance) return;
  socketInstance.auth = { token: token || null };
  if (socketInstance.connected) {
    socketInstance.disconnect().connect();
  }
}

/**
 * Join an auction-specific room on the server to receive targeted updates.
 * @param {string} auctionId
 */
export function joinAuctionRoom(auctionId) {
  if (!auctionId || typeof auctionId !== 'string') return;
  const socket = getSocket();
  if (!socket) return;

  const room = auctionId.trim();
  if (socket.connected) {
    socket.emit('join_auction', room);
  } else {
    socket.once('connect', () => {
      socket.emit('join_auction', room);
    });
  }
}

/**
 * Leave an auction-specific room when leaving the auction floor.
 * @param {string} auctionId
 */
export function leaveAuctionRoom(auctionId) {
  if (!auctionId || typeof auctionId !== 'string') return;
  const socket = getSocket();
  if (socket && socket.connected) {
    socket.emit('leave_auction', auctionId.trim());
  }
}

/**
 * Join private authenticated user room for direct alerts.
 * @param {string} userId
 */
export function joinUserRoom(userId) {
  if (!userId || typeof userId !== 'string') return;
  const socket = getSocket();
  if (!socket) return;

  const userChannel = userId.trim();
  if (socket.connected) {
    socket.emit('join_user', userChannel);
  } else {
    socket.once('connect', () => {
      socket.emit('join_user', userChannel);
    });
  }
}
