// Veyra Authoritative Socket.IO Server Engine
// Real-time live bidding, AI auto-bid dispatch, auction messages, and WebRTC signaling

import { Server } from 'socket.io';
import {
  getAuctionById,
  updateAuction,
  getAuctionMessages,
  insertAuctionMessage,
  getAutoBids,
  getUserAutoBid,
  updateAutoBid
} from './db.js';
import { evaluateAutoBid } from './gemini.js';
import { broadcastSSE } from './api.js';

let ioInstance = null;

// Mutex locks per auction lot to prevent concurrent bid race conditions
const auctionLocks = new Map();

export async function withAuctionLock(auctionId, fn) {
  let prevPromise = auctionLocks.get(auctionId) || Promise.resolve();
  let release;
  const currentPromise = new Promise((resolve) => {
    release = resolve;
  });
  auctionLocks.set(auctionId, prevPromise.then(() => currentPromise));

  try {
    await prevPromise;
    return await fn();
  } finally {
    release();
    if (auctionLocks.get(auctionId) === currentPromise) {
      auctionLocks.delete(auctionId);
    }
  }
}

/**
 * Executes authoritative bid validation and updates auction state in the database.
 * Returns { success: true, auction, bid } or { success: false, error, code }
 */
export async function executeAuthoritativeBid({ auctionId, amount, userId, bidderName }) {
  const auction = getAuctionById(auctionId);
  if (!auction) {
    return { success: false, error: 'Auction lot not found.' };
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return { success: false, error: 'Bid amount must be a positive number.' };
  }

  const now = Date.now();
  const start = auction.startTimestamp || auction.scheduledTimestamp || 0;
  const end = auction.endTimestamp || auction.endTime || 0;

  // Validation 1: Approval
  if (auction.approvalStatus !== 'approved') {
    return { success: false, error: 'This auction lot is pending curator approval.' };
  }

  // Validation 2: Lifecycle
  if (auction.status === 'scheduled' || auction.status === 'upcoming' || (start > 0 && now < start)) {
    return { success: false, error: 'This auction has not opened yet. Bidding opens at the scheduled time.' };
  }

  if (auction.status === 'ended' || (end > 0 && now >= end)) {
    return { success: false, error: 'This auction has concluded. Bids are closed.' };
  }

  if (auction.status !== 'active' && auction.status !== 'live') {
    return { success: false, error: 'This auction is not currently active.' };
  }

  // Validation 3: Seller shill bidding guard
  if (auction.sellerId && auction.sellerId === userId) {
    return { success: false, error: 'Sellers are strictly prohibited from bidding on their own lots.' };
  }

  // Validation 4: Leading bidder duplicate / self-overbid guard
  const topBid = auction.bidHistory && auction.bidHistory.length > 0 ? auction.bidHistory[0] : null;
  if (topBid) {
    if (topBid.bidderId === userId && (now - topBid.timestamp) < 2000) {
      return { success: false, error: 'Your bid was just accepted. Please wait a moment.' };
    }

    if (topBid.bidderId === userId && numAmount <= topBid.amount) {
      return { success: false, error: 'You are already the leading bidder.' };
    }

    // Validation 5: Stale bid check against current leader
    if (numAmount <= topBid.amount) {
      const minReq = topBid.amount + (auction.minIncrement || 500);
      return {
        success: false,
        error: `A higher bid of ₹${topBid.amount.toLocaleString('en-IN')} was already accepted. Minimum next bid is ₹${minReq.toLocaleString('en-IN')}.`
      };
    }
  }

  // Validation 6: Minimum increment
  const minAcceptable = auction.currentBid + (auction.bidCount > 0 ? (auction.minIncrement || 500) : 0);
  if (numAmount < minAcceptable) {
    return {
      success: false,
      error: `Bid must be at least ₹${minAcceptable.toLocaleString('en-IN')}.`
    };
  }

  if (numAmount < (auction.startingBid || 0)) {
    return {
      success: false,
      error: `Bid cannot be lower than the starting bid of ₹${(auction.startingBid || 0).toLocaleString('en-IN')}.`
    };
  }

  // Create valid bid entry
  const newBid = {
    id: 'b-' + now + '-' + Math.random().toString(36).slice(2, 6),
    bidder: bidderName || 'Collector',
    bidderId: userId || ('user-' + now),
    amount: numAmount,
    time: 'Just now',
    timestamp: now
  };

  const updatedHistory = [newBid, ...(auction.bidHistory || [])];
  const updatedAuction = updateAuction(auctionId, {
    currentBid: numAmount,
    bidCount: (auction.bidCount || 0) + 1,
    bidHistory: updatedHistory
  });

  return { success: true, auction: updatedAuction, bid: newBid };
}

/**
 * Triggers the autonomous AI auto-bid loop for an auction lot.
 * Runs under auction lock and respects user constraints & Gemini 3.8 Flash decisions.
 */
export async function triggerAutoBidLoop(auctionId, maxRounds = 10) {
  let round = 0;

  while (round < maxRounds) {
    round++;
    const auction = getAuctionById(auctionId);
    if (!auction || auction.status !== 'active') break;

    const topBid = auction.bidHistory && auction.bidHistory.length > 0 ? auction.bidHistory[0] : null;
    const currentHighestBidderId = topBid ? topBid.bidderId : null;

    // Retrieve all enabled auto-bids for this auction
    const autoBids = getAutoBids(auctionId).filter(
      (ab) => ab.enabled && ab.status === 'active' && ab.userId !== currentHighestBidderId
    );

    if (autoBids.length === 0) {
      break; // No competing auto-bids need to act
    }

    // Sort candidates (earliest registered or highest budget first)
    autoBids.sort((a, b) => a.createdAt - b.createdAt);

    let bidPlacedThisRound = false;

    for (const config of autoBids) {
      // Evaluate with Gemini 3.8 Flash (with rule fallback)
      const evaluation = await evaluateAutoBid({
        auction,
        config,
        leadingBid: topBid
      });

      if (evaluation.decision === 'BID' && typeof evaluation.amount === 'number') {
        const autoBidResult = await executeAuthoritativeBid({
          auctionId,
          amount: evaluation.amount,
          userId: config.userId,
          bidderName: config.bidderName || 'Auto-Bid Collector'
        });

        if (autoBidResult.success) {
          bidPlacedThisRound = true;

          // Broadcast to connected Socket.IO clients
          broadcastBidUpdate(auctionId, autoBidResult.auction, autoBidResult.bid);

          // Check if user's budget is now maxed out
          if (evaluation.amount >= config.maxBudget) {
            updateAutoBid(config.id, { status: 'budget_reached' });
            emitUserAutoBidStatus(config.userId, auctionId, {
              status: 'budget_reached',
              message: `Maximum budget of ₹${config.maxBudget.toLocaleString('en-IN')} reached.`
            });
          }

          // Small delay between auto-bid rounds for organic floor pacing
          await new Promise((r) => setTimeout(r, 400));
          break; // Next round with new top bid
        } else {
          // If bid execution failed (e.g. amount out of bounds), mark status
          if (evaluation.amount >= config.maxBudget) {
            updateAutoBid(config.id, { status: 'budget_reached' });
            emitUserAutoBidStatus(config.userId, auctionId, {
              status: 'budget_reached',
              message: autoBidResult.error
            });
          }
        }
      } else {
        // Agent chose to PASS (e.g. budget exceeded)
        updateAutoBid(config.id, { status: 'budget_reached' });
        emitUserAutoBidStatus(config.userId, auctionId, {
          status: 'budget_reached',
          message: evaluation.reasoning || 'Budget ceiling reached.'
        });
      }
    }

    if (!bidPlacedThisRound) {
      break; // No auto-bidder placed a bid, loop concludes
    }
  }
}

/**
 * Broadcasts bid updates through Socket.IO and SSE
 */
export function broadcastBidUpdate(auctionId, updatedAuction, newBid) {
  if (ioInstance) {
    const minNext = updatedAuction.currentBid + (updatedAuction.minIncrement || 500);
    const payload = {
      auctionId,
      currentBid: updatedAuction.currentBid,
      minRequiredBid: minNext,
      bidCount: updatedAuction.bidCount,
      bidHistory: updatedAuction.bidHistory,
      status: updatedAuction.status,
      bid: newBid,
      updatedAuction,
      serverTime: Date.now()
    };

    ioInstance.to(`auction:${auctionId}`).emit('bid_update', payload);
    ioInstance.emit('global_auction_update', { auctionId, currentBid: updatedAuction.currentBid, bidCount: updatedAuction.bidCount });
  }

  // Also maintain SSE broadcast for backward compatibility
  broadcastSSE('BID_PLACED', {
    auctionId,
    updatedAuction,
    bid: newBid
  });
}

/**
 * Broadcasts auction lifecycle changes
 */
export function broadcastAuctionStatus(type, auction) {
  if (ioInstance) {
    ioInstance.to(`auction:${auction.id}`).emit('status_change', {
      type,
      auction,
      serverTime: Date.now()
    });
    ioInstance.emit('global_status_change', { type, auctionId: auction.id });
  }
}

/**
 * Sends private auto-bid status notification to a specific user
 */
export function emitUserAutoBidStatus(userId, auctionId, statusData) {
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit('autobid_status_update', {
      auctionId,
      ...statusData,
      serverTime: Date.now()
    });
  }
}

/**
 * Initializes Socket.IO on the provided HTTP server
 */
export function initSocketIO(httpServer) {
  if (ioInstance) return ioInstance;

  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    pingInterval: 10000,
    pingTimeout: 5000
  });

  ioInstance = io;

  io.on('connection', (socket) => {
    let currentUserId = null;
    let currentAuctionId = null;

    // 1. Join user private room for confidential notifications
    socket.on('auth', ({ userId, userName }) => {
      if (userId) {
        currentUserId = userId;
        socket.join(`user:${userId}`);
        socket.emit('auth_success', { userId, serverTime: Date.now() });
      }
    });

    // 2. Join auction room
    socket.on('join_auction', ({ auctionId, userId, userName }) => {
      if (!auctionId) return;
      currentAuctionId = auctionId;
      if (userId) {
        currentUserId = userId;
        socket.join(`user:${userId}`);
      }

      socket.join(`auction:${auctionId}`);

      const auction = getAuctionById(auctionId);
      const messages = getAuctionMessages(auctionId);

      if (auction) {
        const minNext = auction.currentBid + (auction.bidCount > 0 ? (auction.minIncrement || 500) : 0);
        socket.emit('room_state', {
          auctionId,
          currentBid: auction.currentBid,
          minRequiredBid: minNext,
          bidCount: auction.bidCount,
          minIncrement: auction.minIncrement,
          status: auction.status,
          bidHistory: auction.bidHistory || [],
          messages: messages || [],
          serverTime: Date.now()
        });
      }
    });

    // 3. Leave auction room
    socket.on('leave_auction', ({ auctionId }) => {
      if (auctionId) {
        socket.leave(`auction:${auctionId}`);
      }
    });

    // 4. Authoritative Bid Placement via Socket
    socket.on('place_bid', async ({ auctionId, amount, userId, bidderName }, callback) => {
      const targetAuctionId = auctionId || currentAuctionId;
      const targetUserId = userId || currentUserId;

      if (!targetAuctionId) {
        if (typeof callback === 'function') callback({ success: false, error: 'Auction ID is required.' });
        return;
      }

      const lockResult = await withAuctionLock(targetAuctionId, async () => {
        const result = await executeAuthoritativeBid({
          auctionId: targetAuctionId,
          amount,
          userId: targetUserId,
          bidderName: bidderName || 'Collector'
        });

        if (result.success) {
          broadcastBidUpdate(targetAuctionId, result.auction, result.bid);
        }

        return result;
      });

      if (typeof callback === 'function') {
        callback(lockResult);
      }

      // If bid succeeded, trigger agentic auto-bid evaluation in background
      if (lockResult.success) {
        withAuctionLock(targetAuctionId, () => triggerAutoBidLoop(targetAuctionId)).catch((e) => {
          console.error('[AutoBid Dispatch Error]:', e);
        });
      }
    });

    // 5. Auction Messages
    socket.on('send_message', ({ auctionId, text, sender, userId }, callback) => {
      const targetAuctionId = auctionId || currentAuctionId;
      const targetUserId = userId || currentUserId;

      if (!targetAuctionId || !text || !text.trim()) {
        if (typeof callback === 'function') callback({ success: false, error: 'Valid message text is required.' });
        return;
      }

      const trimmed = text.trim();
      if (trimmed.length > 500) {
        if (typeof callback === 'function') callback({ success: false, error: 'Message cannot exceed 500 characters.' });
        return;
      }

      const record = insertAuctionMessage({
        auctionId: targetAuctionId,
        userId: targetUserId || 'anonymous',
        sender: sender || 'Collector',
        text: trimmed
      });

      // Broadcast to room
      io.to(`auction:${targetAuctionId}`).emit('new_message', record);

      if (typeof callback === 'function') {
        callback({ success: true, message: record });
      }
    });

    // 6. WebRTC Winner–Seller Signaling
    socket.on('join_call', ({ auctionId, userId, role }) => {
      if (!auctionId || !userId) return;

      const auction = getAuctionById(auctionId);
      if (!auction) {
        socket.emit('call_error', { error: 'Auction lot not found.' });
        return;
      }

      // Verify auction is concluded
      const isEnded = auction.status === 'ended' || (auction.endTimestamp && Date.now() >= auction.endTimestamp);
      if (!isEnded) {
        socket.emit('call_error', { error: 'Post-auction consultation opens only after auction concludes.' });
        return;
      }

      // Verify caller is either winner or seller
      const topBid = auction.bidHistory && auction.bidHistory.length > 0 ? auction.bidHistory[0] : null;
      const winnerId = auction.winner?.bidderId || topBid?.bidderId;
      const sellerId = auction.sellerId;

      const isWinner = winnerId && (winnerId === userId || auction.winner?.bidder === userId);
      const isSeller = sellerId && (sellerId === userId || auction.seller === userId);

      if (!isWinner && !isSeller) {
        socket.emit('call_error', { error: 'Access restricted: Only the winning buyer and artisan seller may join.' });
        return;
      }

      socket.join(`call:${auctionId}`);
      socket.to(`call:${auctionId}`).emit('peer_joined', { userId, role, auctionId });
    });

    socket.on('webrtc_signal', ({ auctionId, senderId, role, type, data, msgId }) => {
      if (!auctionId) return;
      // Relay signal to all other sockets in the call room
      socket.to(`call:${auctionId}`).emit('webrtc_signal', {
        auctionId,
        senderId,
        role,
        type,
        data,
        msgId,
        timestamp: Date.now()
      });
    });

    socket.on('leave_call', ({ auctionId, userId, role }) => {
      if (auctionId) {
        socket.leave(`call:${auctionId}`);
        socket.to(`call:${auctionId}`).emit('peer_left', { userId, role });
      }
    });

    socket.on('disconnect', () => {
      // Clean up rooms
    });
  });

  console.log('[Veyra Socket.IO] Live bidding & WebRTC signaling engine initialized.');
  return io;
}

export function getIO() {
  return ioInstance;
}
