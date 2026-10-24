// VEYRA WebRTC Video & Audio Signaling Service
// Genuine peer-to-peer real-time communication between authenticated seller & confirmed winning buyer

import { supabase, isSupabaseConfigured } from './supabase.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

// Configurable optional TURN credentials via environment variables
if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TURN_SERVER_URL) {
  ICE_SERVERS.push({
    urls: import.meta.env.VITE_TURN_SERVER_URL,
    username: import.meta.env.VITE_TURN_USERNAME || '',
    credential: import.meta.env.VITE_TURN_CREDENTIAL || ''
  });
}

export const RTC_CONFIGURATION = {
  iceServers: ICE_SERVERS
};

/**
 * Creates an authenticated WebRTC signaling channel for an auction call.
 * Uses Supabase Realtime broadcast when configured, and BroadcastChannel/Storage as a robust
 * zero-config local communication channel between tabs/windows.
 */
export class WebRTCSignaling {
  constructor(auctionId, userId, role) {
    this.auctionId = auctionId;
    this.userId = userId;
    this.role = role; // 'buyer' or 'seller'
    this.listeners = new Set();
    this.seenMsgIds = new Set();
    this.recentMsgIds = [];
    this.channelName = `veyra_webrtc_call_${auctionId}`;

    // 1. BroadcastChannel for local/multi-tab peer testing
    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel(this.channelName);
      this.broadcastChannel.onmessage = (event) => {
        const payload = event.data;
        if (payload && payload.senderId !== this.userId) {
          this._dispatch(payload);
        }
      };
    }

    // 2. Storage event fallback for cross-process tab sync
    this.storageListener = (event) => {
      if (event.key === this.channelName && event.newValue) {
        try {
          const payload = JSON.parse(event.newValue);
          if (payload && payload.senderId !== this.userId) {
            this._dispatch(payload);
          }
        } catch (e) {
          // ignore parsing error
        }
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.storageListener);
    }

    // 3. Supabase Realtime broadcast channel when credentials exist
    if (isSupabaseConfigured && supabase) {
      this.supabaseChannel = supabase.channel(this.channelName, {
        config: { broadcast: { self: false } }
      });

      this.supabaseChannel
        .on('broadcast', { event: 'signal' }, ({ payload }) => {
          if (payload && payload.senderId !== this.userId) {
            this._dispatch(payload);
          }
        })
        .subscribe();
    }
  }

  onMessage(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _dispatch(payload) {
    if (!payload) return;

    // Deduplicate messages across BroadcastChannel, localStorage, and Supabase
    if (payload.msgId) {
      if (this.seenMsgIds.has(payload.msgId)) {
        return; // drop duplicate delivery
      }
      this.seenMsgIds.add(payload.msgId);
      this.recentMsgIds.push(payload.msgId);
      if (this.recentMsgIds.length > 200) {
        const oldest = this.recentMsgIds.shift();
        this.seenMsgIds.delete(oldest);
      }
    }

    this.listeners.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error('Signaling listener error:', err);
      }
    });
  }

  send(type, data = {}) {
    const msgId = `${this.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const payload = {
      msgId,
      type,
      data,
      auctionId: this.auctionId,
      senderId: this.userId,
      role: this.role,
      timestamp: Date.now()
    };

    // Track own message ID to prevent processing any self-reflections
    this.seenMsgIds.add(msgId);
    this.recentMsgIds.push(msgId);
    if (this.recentMsgIds.length > 200) {
      const oldest = this.recentMsgIds.shift();
      this.seenMsgIds.delete(oldest);
    }

    // Broadcast channel
    let broadcastSent = false;
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(payload);
        broadcastSent = true;
      } catch (e) {
        console.warn('BroadcastChannel error', e);
      }
    }

    // Storage fallback only if BroadcastChannel is not available
    if (!broadcastSent && typeof window !== 'undefined') {
      try {
        localStorage.setItem(this.channelName, JSON.stringify(payload));
      } catch (e) {
        // ignore
      }
    }

    // Supabase Realtime Broadcast
    if (this.supabaseChannel) {
      try {
        this.supabaseChannel.send({
          type: 'broadcast',
          event: 'signal',
          payload
        });
      } catch (e) {
        // ignore
      }
    }
  }

  destroy() {
    this.listeners.clear();
    this.seenMsgIds.clear();
    this.recentMsgIds = [];
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageListener);
    }
    if (this.supabaseChannel && supabase) {
      supabase.removeChannel(this.supabaseChannel);
    }
  }
}

/**
 * Cleanly stops all tracks on a MediaStream and releases hardware
 */
export const stopMediaStream = (stream) => {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
  } catch (e) {
    console.warn('Failed to stop track', e);
  }
};
