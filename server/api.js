import crypto from 'node:crypto';
import {
  getAuctions,
  getAuctionById,
  insertAuction,
  updateAuction,
  getProducts,
  getProductById,
  insertProduct,
  updateProduct,
  deleteProduct,
  deleteCustomAuction,
  saveDatabase,
  getProxyConfigs,
  getProxyConfigByUser,
  upsertProxyConfig,
  updateProxyConfig,
  getCommentsByAuction,
  insertComment,
  getPayments,
  getPaymentById,
  getPaymentByAuctionId,
  insertPayment,
  updatePayment
} from './db.js';
import { scheduler } from './scheduler.js';
import { evaluateAndExecuteProxyBids } from './proxyBidding.js';
import { verifyGeminiModel } from './gemini.js';
import { broadcastEvent, getActiveSocketCount } from './socket.js';

// Connected SSE clients (maintained for seamless backward-compatibility)
const sseClients = new Set();

// In-memory mutex locks for bidding to prevent race conditions
const auctionLocks = new Map();

async function withAuctionLock(auctionId, fn) {
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

// Duplicate submission protection cache (idempotency token & rapid submission de-bounce)
const recentSubmissions = new Map();
function cleanRecentSubmissions() {
  const now = Date.now();
  for (const [k, v] of recentSubmissions.entries()) {
    if (now - v.timestamp > 30000) {
      recentSubmissions.delete(k);
    }
  }
}

/**
 * Real-time Broadcast Service
 * Broadcasts via Socket.IO (primary WebSocket real-time engine)
 * and mirrors to any legacy SSE listeners for full backward-compatibility.
 */
export function broadcastRealtimeEvent(type, payload = {}) {
  // 1. Deliver to Socket.IO clients (global feed and targeted auction room)
  const auctionId = payload.auctionId || payload.auction?.id || null;
  broadcastEvent(type, payload, auctionId);

  // 2. Mirror to legacy SSE listeners
  const message = `event: message\ndata: ${JSON.stringify({ type, payload, serverTime: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(message);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Export as both broadcastRealtimeEvent and backward-compatible broadcastSSE alias
export const broadcastSSE = broadcastRealtimeEvent;

// Hook scheduler events to real-time broadcast
scheduler.on('event', ({ type, payload }) => {
  broadcastRealtimeEvent(type, payload);
});

// Helper to parse JSON body from incoming Node request
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) {
        // 5MB limit
        reject(new Error('Request payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Helper to send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  res.end(JSON.stringify(data));
}

/**
 * Main API request dispatcher
 */
export async function handleApiRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  // 1. SSE Events endpoint
  if (pathname === '/api/events' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', serverTime: Date.now() })}\n\n`);

    const client = { req, res };
    sseClients.add(client);

    req.on('close', () => {
      sseClients.delete(client);
    });
    return true;
  }

  // 2. Health & Server Time
  if (pathname === '/api/health' && method === 'GET') {
    sendJson(res, 200, {
      status: 'ok',
      serverTime: Date.now(),
      schedulerRunning: scheduler.isRunning,
      activeSockets: getActiveSocketCount(),
      activeSseClients: sseClients.size
    });
    return true;
  }

  // 3. GET /api/auctions
  if (pathname === '/api/auctions' && method === 'GET') {
    const auctions = getAuctions();
    sendJson(res, 200, {
      success: true,
      serverTime: Date.now(),
      auctions
    });
    return true;
  }

  // 4. GET /api/auctions/:id
  const auctionMatch = pathname.match(/^\/api\/auctions\/([a-zA-Z0-9_-]+)$/);
  if (auctionMatch && method === 'GET') {
    const id = auctionMatch[1];
    const auction = getAuctionById(id);
    if (!auction) {
      sendJson(res, 404, { success: false, error: 'Auction lot not found.' });
      return true;
    }
    sendJson(res, 200, {
      success: true,
      serverTime: Date.now(),
      auction
    });
    return true;
  }

  // 5. POST /api/auctions (Create new live auction lot)
  if (pathname === '/api/auctions' && method === 'POST') {
    try {
      const data = await parseJsonBody(req);

      if (!data.name || !data.seller || !data.startingBid) {
        sendJson(res, 400, { success: false, error: 'Title, seller, and starting bid are required.' });
        return true;
      }

      const startingBid = Number(data.startingBid);
      if (isNaN(startingBid) || startingBid <= 0) {
        sendJson(res, 400, { success: false, error: 'Starting bid must be a valid positive amount.' });
        return true;
      }

      cleanRecentSubmissions();

      // Check clientSubmissionId idempotency
      const clientSubmissionId = data.clientSubmissionId || data.submissionId;
      if (clientSubmissionId && recentSubmissions.has(clientSubmissionId)) {
        const cached = recentSubmissions.get(clientSubmissionId);
        sendJson(res, 200, { success: true, auction: cached.auction, duplicatePrevented: true });
        return true;
      }

      // Check rapid double-click duplicate (same seller, title, startingBid within 4 seconds)
      const rapidKey = `auc_${data.sellerId || data.seller}_${data.name.trim().toLowerCase()}_${startingBid}`;
      const recentMatch = recentSubmissions.get(rapidKey);
      if (recentMatch && Date.now() - recentMatch.timestamp < 4000) {
        sendJson(res, 200, { success: true, auction: recentMatch.auction, duplicatePrevented: true });
        return true;
      }

      const estimatedValue = Number(data.estimatedValue || data.price || startingBid);

      // Parse start and end timestamps
      let startTimestamp = data.startTimestamp;
      let endTimestamp = data.endTimestamp;

      if (!startTimestamp && data.startDate && data.startTime) {
        startTimestamp = new Date(`${data.startDate}T${data.startTime}`).getTime();
      }

      if (!startTimestamp || isNaN(startTimestamp)) {
        sendJson(res, 400, { success: false, error: 'Valid auction start date and time are required.' });
        return true;
      }

      // Start time must be in future (allowing 15 second leeway for network transmission)
      const now = Date.now();
      if (startTimestamp < now - 15000) {
        sendJson(res, 400, { success: false, error: 'Auction start time must be scheduled in the future.' });
        return true;
      }

      if (!endTimestamp) {
        if (data.endDate && data.endTime) {
          endTimestamp = new Date(`${data.endDate}T${data.endTime}`).getTime();
        } else if (data.durationDays) {
          endTimestamp = startTimestamp + Math.round(Number(data.durationDays) * 86400000);
        } else if (data.durationMinutes) {
          endTimestamp = startTimestamp + Math.round(Number(data.durationMinutes) * 60000);
        }
      }

      if (!endTimestamp || isNaN(endTimestamp)) {
        sendJson(res, 400, { success: false, error: 'Valid auction end date and time or duration are required.' });
        return true;
      }

      if (endTimestamp <= startTimestamp) {
        sendJson(res, 400, { success: false, error: 'Auction end time must be after start time.' });
        return true;
      }

      const minIncrement = data.minIncrement
        ? Math.max(100, Number(data.minIncrement))
        : Math.max(500, Math.round((startingBid * 0.05) / 500) * 500);

      const reservePrice = data.reservePrice ? Number(data.reservePrice) : null;
      if (reservePrice !== null && (isNaN(reservePrice) || reservePrice < startingBid)) {
        sendJson(res, 400, { success: false, error: 'Reserve price must be greater than or equal to starting bid.' });
        return true;
      }

      const primaryImage = data.image || (data.images && data.images[0]) || '';
      const imagesList = Array.isArray(data.images) && data.images.length > 0 ? data.images : [primaryImage];

      const lotId = data.id || ('auc-lot-' + Date.now());
      const prodId = data.productId || ('prod-' + Date.now());

      const newAuction = {
        id: lotId,
        productId: prodId,
        type: 'auction',
        isAuction: true,
        name: data.name.trim(),
        seller: data.seller.trim(),
        sellerId: data.sellerId || null,
        maker: data.maker || data.seller.trim(),
        location: data.location || 'Studio Atelier',
        category: data.category || 'Handmade',
        startingBid: startingBid,
        currentBid: startingBid,
        estimatedValue: estimatedValue,
        minIncrement: minIncrement,
        reservePrice: reservePrice,
        bidCount: 0,
        bidHistory: [],
        startTimestamp: startTimestamp,
        scheduledTimestamp: startTimestamp,
        endTimestamp: endTimestamp,
        endTime: endTimestamp,
        remainingSeconds: Math.max(0, Math.floor((startTimestamp - now) / 1000)),
        approvalStatus: 'pending',
        status: 'pending',
        winner: null,
        result: null,
        image: primaryImage,
        images: imagesList,
        description: data.description || '',
        materials: data.materials || '',
        dimensions: data.dimensions || '',
        condition: data.condition || 'Pristine Studio Original',
        provenance: data.provenance || '',
        authenticityCertificate: data.authenticityCertificate || '',
        submittedAt: new Date().toISOString()
      };

      // Also create paired product catalog record
      const newProduct = {
        id: prodId,
        auctionId: lotId,
        type: 'auction',
        isAuction: true,
        name: newAuction.name,
        seller: newAuction.seller,
        sellerId: newAuction.sellerId,
        location: newAuction.location,
        category: newAuction.category,
        price: estimatedValue,
        startingBid: startingBid,
        images: imagesList,
        image: primaryImage,
        description: newAuction.description,
        materials: newAuction.materials,
        dimensions: newAuction.dimensions,
        condition: newAuction.condition,
        provenance: newAuction.provenance,
        authenticityCertificate: newAuction.authenticityCertificate,
        listingStatus: 'pending',
        inStock: true,
        listedAt: newAuction.submittedAt
      };

      insertAuction(newAuction);
      insertProduct(newProduct);

      if (clientSubmissionId) {
        recentSubmissions.set(clientSubmissionId, { timestamp: Date.now(), auction: newAuction });
      }
      recentSubmissions.set(rapidKey, { timestamp: Date.now(), auction: newAuction });

      broadcastSSE('AUCTION_CREATED', { auction: newAuction, product: newProduct });
      sendJson(res, 201, { success: true, auction: newAuction, product: newProduct });
      return true;
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
      return true;
    }
  }

  // 6. POST /api/auctions/:id/approve
  const approveMatch = pathname.match(/^\/api\/auctions\/([a-zA-Z0-9_-]+)\/approve$/);
  if (approveMatch && method === 'POST') {
    const id = approveMatch[1];
    const auction = getAuctionById(id);
    if (!auction) {
      sendJson(res, 404, { success: false, error: 'Auction lot not found.' });
      return true;
    }

    const now = Date.now();
    const start = auction.startTimestamp || auction.scheduledTimestamp || 0;

    // Safety policy: If scheduled start time is in the past, do not silently activate or accept backdated bids!
    if (now >= start) {
      sendJson(res, 400, {
        success: false,
        error: 'Cannot approve auction: the scheduled start time has already passed. Please reschedule before publishing.',
        requiresReschedule: true,
        scheduledStart: start,
        currentTime: now
      });
      return true;
    }

    const updated = updateAuction(id, {
      approvalStatus: 'approved',
      status: 'scheduled',
      remainingSeconds: Math.max(0, Math.floor((start - now) / 1000))
    });

    // Also update associated product
    updateProduct(auction.productId, { listingStatus: 'active' });

    broadcastSSE('AUCTION_APPROVED', { auction: updated });
    sendJson(res, 200, { success: true, auction: updated });
    return true;
  }

  // 7. POST /api/auctions/:id/reschedule
  const rescheduleMatch = pathname.match(/^\/api\/auctions\/([a-zA-Z0-9_-]+)\/reschedule$/);
  if (rescheduleMatch && method === 'POST') {
    try {
      const id = rescheduleMatch[1];
      const auction = getAuctionById(id);
      if (!auction) {
        sendJson(res, 404, { success: false, error: 'Auction lot not found.' });
        return true;
      }

      const data = await parseJsonBody(req);
      const startTimestamp = Number(data.startTimestamp);
      const endTimestamp = Number(data.endTimestamp);

      const now = Date.now();
      if (!startTimestamp || isNaN(startTimestamp) || startTimestamp <= now) {
        sendJson(res, 400, { success: false, error: 'New start time must be in the future.' });
        return true;
      }

      if (!endTimestamp || isNaN(endTimestamp) || endTimestamp <= startTimestamp) {
        sendJson(res, 400, { success: false, error: 'New end time must be after the start time.' });
        return true;
      }

      const updated = updateAuction(id, {
        startTimestamp,
        scheduledTimestamp: startTimestamp,
        endTimestamp,
        endTime: endTimestamp,
        approvalStatus: 'approved',
        status: 'scheduled',
        remainingSeconds: Math.max(0, Math.floor((startTimestamp - now) / 1000))
      });

      updateProduct(auction.productId, { listingStatus: 'active' });

      broadcastSSE('AUCTION_RESCHEDULED', { auction: updated });
      sendJson(res, 200, { success: true, auction: updated });
      return true;
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
      return true;
    }
  }

  // 8. POST /api/auctions/:id/reject
  const rejectMatch = pathname.match(/^\/api\/auctions\/([a-zA-Z0-9_-]+)\/reject$/);
  if (rejectMatch && method === 'POST') {
    const id = rejectMatch[1];
    const auction = getAuctionById(id);
    if (!auction) {
      sendJson(res, 404, { success: false, error: 'Auction lot not found.' });
      return true;
    }

    const updated = updateAuction(id, {
      approvalStatus: 'rejected',
      status: 'rejected'
    });

    updateProduct(auction.productId, { listingStatus: 'rejected' });

    broadcastSSE('AUCTION_REJECTED', { auction: updated });
    sendJson(res, 200, { success: true, auction: updated });
    return true;
  }

  // 9. POST /api/auctions/:id/bid (Authoritative bid placement)
  const bidMatch = pathname.match(/^\/api\/auctions\/([a-zA-Z0-9_-]+)\/bid$/);
  if (bidMatch && method === 'POST') {
    const id = bidMatch[1];
    return withAuctionLock(id, async () => {
      try {
        const auction = getAuctionById(id);
        if (!auction) {
          sendJson(res, 404, { success: false, error: 'Auction lot not found.' });
          return true;
        }

        const data = await parseJsonBody(req);
        const amount = Number(data.amount);
        const rawBidder = (data.bidderName || data.bidder || data.userName || data.user || '').trim();
        const bidderName = rawBidder && rawBidder !== 'undefined' && rawBidder !== 'null' && rawBidder !== 'Complete your profile' ? rawBidder : (data.username || 'Collector');
        const userId = data.userId || 'user-' + Date.now();
        const now = Date.now();

        // Check 1: Must be approved
        if (auction.approvalStatus !== 'approved') {
          sendJson(res, 400, { success: false, error: 'This auction lot is pending curator approval.' });
          return true;
        }

        // Check 2: Lifecycle status and timestamps
        const start = auction.startTimestamp || auction.scheduledTimestamp || 0;
        const end = auction.endTimestamp || auction.endTime || 0;

        if (auction.status === 'scheduled' || auction.status === 'upcoming' || (start > 0 && now < start)) {
          sendJson(res, 400, {
            success: false,
            error: 'This auction has not opened yet. Bidding begins at the scheduled start time.'
          });
          return true;
        }

        if (auction.status === 'ended' || (end > 0 && now >= end)) {
          sendJson(res, 400, {
            success: false,
            error: 'This auction has concluded. Bids are closed.'
          });
          return true;
        }

        if (auction.status !== 'active' && auction.status !== 'live') {
          sendJson(res, 400, {
            success: false,
            error: 'This auction is not currently open for bidding.'
          });
          return true;
        }

        // Check 3: Seller cannot bid on their own lot (shill bidding guard)
        if (auction.sellerId && auction.sellerId === userId) {
          sendJson(res, 403, {
            success: false,
            error: 'Sellers are strictly prohibited from bidding on their own auction lots.'
          });
          return true;
        }

        // Check 4: Rapid double-click / self-overbid guard
        const topBid = auction.bidHistory && auction.bidHistory.length > 0 ? auction.bidHistory[0] : null;
        if (topBid) {
          if (topBid.bidderId === userId && (now - topBid.timestamp) < 2000) {
            sendJson(res, 429, {
              success: false,
              error: 'Your bid was just received. Please wait a moment before raising.'
            });
            return true;
          }

          if (topBid.bidderId === userId && amount <= topBid.amount) {
            sendJson(res, 400, {
              success: false,
              error: 'You are already the leading bidder.'
            });
            return true;
          }

          // Check 5: Duplicate or stale bid guard
          if (amount <= topBid.amount) {
            sendJson(res, 409, {
              success: false,
              error: `A bid of ₹${topBid.amount.toLocaleString('en-IN')} has already been recorded. Minimum required is ₹${(topBid.amount + (auction.minIncrement || 500)).toLocaleString('en-IN')}.`
            });
            return true;
          }
        }

        // Check 6: Minimum increment validation
        const minAcceptable = auction.currentBid + (auction.minIncrement || 500);
        if (amount < minAcceptable && auction.bidCount > 0) {
          sendJson(res, 400, {
            success: false,
            error: `Bid must be at least ₹${minAcceptable.toLocaleString('en-IN')}.`
          });
          return true;
        }

        if (amount < auction.startingBid) {
          sendJson(res, 400, {
            success: false,
            error: `Bid cannot be lower than the starting price of ₹${auction.startingBid.toLocaleString('en-IN')}.`
          });
          return true;
        }

        // Record valid bid
        const newBid = {
          id: 'b-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          bidder: bidderName,
          bidderId: userId,
          amount: amount,
          time: 'Just now',
          timestamp: now
        };

        const updatedHistory = [newBid, ...(auction.bidHistory || [])];
        const updated = updateAuction(id, {
          currentBid: amount,
          bidCount: (auction.bidCount || 0) + 1,
          bidHistory: updatedHistory
        });

        broadcastSSE('BID_PLACED', {
          auctionId: id,
          updatedAuction: updated,
          bid: newBid
        });

        // Trigger automatic proxy bidding evaluation for competing buyers
        await evaluateAndExecuteProxyBids(id, broadcastSSE);
        const finalAuction = getAuctionById(id);

        sendJson(res, 200, {
          success: true,
          auction: finalAuction || updated,
          bid: newBid
        });
        return true;
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message });
        return true;
      }
    });
  }

  // 9b. GET /api/auctions/:id/proxy-bid
  const proxyGetMatch = pathname.match(/^\/api\/auctions\/([a-zA-Z0-9_-]+)\/proxy-bid$/);
  if (proxyGetMatch && method === 'GET') {
    const id = proxyGetMatch[1];
    const userId = url.searchParams.get('userId');

    if (!userId) {
      sendJson(res, 400, { success: false, error: 'userId query parameter is required.' });
      return true;
    }

    const auction = getAuctionById(id);
    if (!auction) {
      sendJson(res, 404, { success: false, error: 'Auction lot not found.' });
      return true;
    }

    const config = getProxyConfigByUser(id, userId);
    const geminiStatus = await verifyGeminiModel();

    sendJson(res, 200, {
      success: true,
      config: config || null,
      geminiStatus
    });
    return true;
  }

  // 9c. POST /api/auctions/:id/proxy-bid (Enable / Update proxy bidding)
  const proxyPostMatch = pathname.match(/^\/api\/auctions\/([a-zA-Z0-9_-]+)\/proxy-bid$/);
  if (proxyPostMatch && method === 'POST') {
    const id = proxyPostMatch[1];
    return withAuctionLock(id, async () => {
      try {
        const auction = getAuctionById(id);
        if (!auction) {
          sendJson(res, 404, { success: false, error: 'Auction lot not found.' });
          return true;
        }

        const data = await parseJsonBody(req);
        const userId = data.userId;
        const userName = data.userName || data.bidderName || 'Collector';
        const maxBid = Number(data.maxBid);
        const preferredIncrement = Number(data.preferredIncrement);

        if (!userId) {
          sendJson(res, 400, { success: false, error: 'Authentication required. User ID is missing.' });
          return true;
        }

        // Sellers cannot bid or proxy bid on own lot
        if (auction.sellerId && auction.sellerId === userId) {
          sendJson(res, 403, {
            success: false,
            error: 'Sellers are strictly prohibited from bidding on their own auction lots.'
          });
          return true;
        }

        // Auction must not be concluded
        const now = Date.now();
        const end = auction.endTimestamp || auction.endTime || 0;
        if (auction.status === 'ended' || (end > 0 && now >= end)) {
          sendJson(res, 400, {
            success: false,
            error: 'This auction has concluded. Automatic proxy bidding cannot be configured.'
          });
          return true;
        }

        if (isNaN(maxBid) || maxBid <= 0) {
          sendJson(res, 400, {
            success: false,
            error: 'Maximum bid limit must be a valid positive amount.'
          });
          return true;
        }

        if (isNaN(preferredIncrement) || preferredIncrement <= 0) {
          sendJson(res, 400, {
            success: false,
            error: 'Preferred bid increment must be a valid positive amount.'
          });
          return true;
        }

        const minInc = auction.minIncrement || 500;
        if (preferredIncrement < minInc) {
          sendJson(res, 400, {
            success: false,
            error: `Preferred increment must be at least the auction minimum of ₹${minInc.toLocaleString('en-IN')}.`
          });
          return true;
        }

        const minRequired = auction.bidCount > 0 ? auction.currentBid + minInc : auction.startingBid;
        if (maxBid < minRequired) {
          sendJson(res, 400, {
            success: false,
            error: `Maximum bid limit must be at least ₹${minRequired.toLocaleString('en-IN')}.`
          });
          return true;
        }

        const savedConfig = upsertProxyConfig({
          auctionId: id,
          userId,
          userName,
          maxBid,
          preferredIncrement,
          status: 'active',
          stopReason: null
        });

        broadcastSSE('PROXY_CONFIG_UPDATED', {
          auctionId: id,
          config: savedConfig
        });

        // If auction is active, evaluate immediately
        if (auction.status === 'active' || auction.status === 'live') {
          await evaluateAndExecuteProxyBids(id, broadcastSSE);
        }

        const freshAuction = getAuctionById(id);
        const freshConfig = getProxyConfigByUser(id, userId);
        const geminiStatus = await verifyGeminiModel();

        sendJson(res, 200, {
          success: true,
          config: freshConfig,
          auction: freshAuction,
          geminiStatus
        });
        return true;
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message });
        return true;
      }
    });
  }

  // 9d. POST /api/auctions/:id/proxy-bid/disable or DELETE /api/auctions/:id/proxy-bid
  const proxyDisableMatch = pathname.match(/^\/api\/auctions\/([a-zA-Z0-9_-]+)\/proxy-bid\/(disable)$/) ||
    (pathname.match(/^\/api\/auctions\/([a-zA-Z0-9_-]+)\/proxy-bid$/) && method === 'DELETE');
  if (proxyDisableMatch && (method === 'POST' || method === 'DELETE')) {
    const id = proxyDisableMatch[1];
    return withAuctionLock(id, async () => {
      try {
        let bodyData = {};
        try {
          bodyData = await parseJsonBody(req);
        } catch (e) {}

        const userId = bodyData.userId || url.searchParams.get('userId');

        if (!userId) {
          sendJson(res, 400, { success: false, error: 'User ID is required to disable proxy bidding.' });
          return true;
        }

        const config = getProxyConfigByUser(id, userId);
        if (!config) {
          sendJson(res, 404, { success: false, error: 'No proxy configuration found for this user.' });
          return true;
        }

        // Ownership validation
        if (config.userId !== userId) {
          sendJson(res, 403, { success: false, error: 'Unauthorized: cannot modify another user’s proxy settings.' });
          return true;
        }

        const updated = updateProxyConfig(config.id, {
          status: 'disabled',
          stopReason: 'Automatic proxy bidding disabled by user.'
        });

        broadcastSSE('PROXY_CONFIG_UPDATED', {
          auctionId: id,
          config: updated
        });

        sendJson(res, 200, {
          success: true,
          config: updated
        });
        return true;
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message });
        return true;
      }
    });
  }

  // 9e. GET /api/auctions/:id/comments
  const commentsGetMatch = pathname.match(/^\/api\/auctions\/([a-zA-Z0-9_-]+)\/comments$/);
  if (commentsGetMatch && method === 'GET') {
    const id = commentsGetMatch[1];
    const comments = getCommentsByAuction(id);
    sendJson(res, 200, { success: true, comments, serverTime: Date.now() });
    return true;
  }

  // 9f. POST /api/auctions/:id/comments
  const commentsPostMatch = pathname.match(/^\/api\/auctions\/([a-zA-Z0-9_-]+)\/comments$/);
  if (commentsPostMatch && method === 'POST') {
    const id = commentsPostMatch[1];
    try {
      const data = await parseJsonBody(req);
      const message = (data.message || '').trim();
      if (!message) {
        sendJson(res, 400, { success: false, error: 'Comment message is required.' });
        return true;
      }
      const user = (data.user || data.userName || 'Collector').trim();
      const commentId = data.id || ('c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
      const now = Date.now();
      const newComment = {
        id: commentId,
        user,
        message,
        timestamp: now
      };
      insertComment(id, newComment);
      broadcastSSE('COMMENT_ADDED', {
        auctionId: id,
        comment: newComment
      });
      sendJson(res, 201, { success: true, comment: newComment });
      return true;
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
      return true;
    }
  }

  // ── Payment Endpoints (Razorpay Video Call Settlement) ──────────────────────

  // 9a. POST /api/payments/create-order
  if (pathname === '/api/payments/create-order' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { auctionId, userId } = body;

      if (!auctionId) {
        sendJson(res, 400, { success: false, error: 'auctionId is required to create a payment order.' });
        return true;
      }

      // Production gate: Strictly block development test auction in production
      if (auctionId === 'auc-dev-test' && process.env.NODE_ENV === 'production') {
        sendJson(res, 403, { success: false, error: 'Development test auctions cannot be accessed in production.' });
        return true;
      }

      const auction = getAuctionById(auctionId);
      if (!auction) {
        sendJson(res, 404, { success: false, error: `Auction "${auctionId}" not found.` });
        return true;
      }

      // Check if already paid to prevent duplicate payments
      const existingPayment = getPaymentByAuctionId(auctionId);
      if (existingPayment || auction.paymentStatus === 'completed') {
        sendJson(res, 400, {
          success: false,
          alreadyPaid: true,
          error: 'This auction lot consultation has already been successfully settled and paid.',
          paymentId: existingPayment?.paymentId || auction.paymentId
        });
        return true;
      }

      // Authoritative payment amount from winning bid / hammer price
      const authoritativeAmount =
        auction.id === 'auc-dev-test'
          ? 100
          : Math.round(
              Number(auction.winningBid || auction.winner?.amount || auction.currentBid || auction.startingBid || 0)
            );

      if (authoritativeAmount <= 0) {
        sendJson(res, 400, {
          success: false,
          error: 'Cannot create payment order: No valid winning bid amount found on this auction lot.'
        });
        return true;
      }

      const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '';
      const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

      const isLiveKeyConfigured =
        keyId &&
        keySecret &&
        keyId.startsWith('rzp_') &&
        keySecret !== 'sample_secret_key_change_me' &&
        !keySecret.includes('change_me');

      if (isLiveKeyConfigured) {
        // Genuine Razorpay Orders API call
        const amountInPaise = authoritativeAmount * 100;
        const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

        const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${basicAuth}`
          },
          body: JSON.stringify({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `rcpt_${auctionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}_${Date.now().toString().slice(-6)}`,
            notes: {
              auctionId,
              userId: userId || 'collector',
              lotTitle: auction.name || 'Post-Auction Consultation'
            }
          })
        });

        const rzpData = await rzpRes.json();
        if (!rzpRes.ok) {
          console.error('[Razorpay Order Creation Error]:', rzpData);
          sendJson(res, 502, {
            success: false,
            error: rzpData.error?.description || 'Razorpay order creation failed.'
          });
          return true;
        }

        insertPayment({
          id: `pay_rec_${Date.now()}`,
          orderId: rzpData.id,
          auctionId,
          userId,
          amount: authoritativeAmount,
          currency: 'INR',
          status: 'created',
          createdAt: Date.now()
        });

        sendJson(res, 200, {
          success: true,
          orderId: rzpData.id,
          amount: authoritativeAmount,
          currency: 'INR',
          keyId,
          auctionName: auction.name,
          sellerName: auction.seller || auction.maker
        });
        return true;
      }

      // Safe test/simulation fallback when placeholder keys are used in local development
      const simOrderId = `order_sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      insertPayment({
        id: `pay_rec_${Date.now()}`,
        orderId: simOrderId,
        auctionId,
        userId,
        amount: authoritativeAmount,
        currency: 'INR',
        status: 'created',
        createdAt: Date.now(),
        isSimulation: true
      });

      sendJson(res, 200, {
        success: true,
        orderId: simOrderId,
        amount: authoritativeAmount,
        currency: 'INR',
        keyId: keyId || 'rzp_test_placeholder',
        isSimulation: true,
        auctionName: auction.name,
        sellerName: auction.seller || auction.maker
      });
      return true;
    } catch (err) {
      console.error('[Payment Order Error]:', err);
      sendJson(res, 500, { success: false, error: err.message || 'Server error creating payment order.' });
      return true;
    }
  }

  // 9b. POST /api/payments/verify
  if (pathname === '/api/payments/verify' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, auctionId, userId } = body;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !auctionId) {
        sendJson(res, 400, {
          success: false,
          error: 'Missing required payment verification parameters (order_id, payment_id, signature, auctionId).'
        });
        return true;
      }

      // Production gate: Strictly block development test auction in production
      if (auctionId === 'auc-dev-test' && process.env.NODE_ENV === 'production') {
        sendJson(res, 403, { success: false, error: 'Development test payment verification blocked in production.' });
        return true;
      }

      const auction = getAuctionById(auctionId);
      if (!auction) {
        sendJson(res, 404, { success: false, error: `Auction "${auctionId}" not found.` });
        return true;
      }

      // Prevent duplicate verification/payments
      const existing = getPaymentByAuctionId(auctionId);
      if (existing && existing.status === 'completed') {
        sendJson(res, 200, {
          success: true,
          alreadyPaid: true,
          message: 'Payment has already been verified and recorded.',
          paymentId: existing.paymentId
        });
        return true;
      }

      const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
      let isAuthentic = false;

      if (razorpay_order_id.startsWith('order_sim_')) {
        // Simulation verification for test environments without live credentials
        isAuthentic = Boolean(razorpay_signature);
      } else if (keySecret) {
        // Cryptographic HMAC SHA-256 verification
        const expectedSignature = crypto
          .createHmac('sha256', keySecret)
          .update(`${razorpay_order_id}|${razorpay_payment_id}`)
          .digest('hex');

        try {
          const bufExpected = Buffer.from(expectedSignature, 'utf8');
          const bufActual = Buffer.from(razorpay_signature, 'utf8');
          isAuthentic = bufExpected.length === bufActual.length && crypto.timingSafeEqual(bufExpected, bufActual);
        } catch (e) {
          isAuthentic = false;
        }
      }

      if (!isAuthentic) {
        console.warn(`[Payment Verification Failed] Order: ${razorpay_order_id}, Payment: ${razorpay_payment_id}`);
        sendJson(res, 400, {
          success: false,
          error: 'Payment verification failed: Invalid cryptographic signature.'
        });
        return true;
      }

      const now = Date.now();
      const paymentRecord =
        updatePayment(razorpay_order_id, {
          paymentId: razorpay_payment_id,
          signature: razorpay_signature,
          status: 'completed',
          verifiedAt: now
        }) ||
        insertPayment({
          id: `pay_${now}`,
          orderId: razorpay_order_id,
          paymentId: razorpay_payment_id,
          signature: razorpay_signature,
          auctionId,
          userId,
          status: 'completed',
          verifiedAt: now
        });

      // Update auction record in database
      const updatedAuction = updateAuction(auctionId, {
        paymentStatus: 'completed',
        paymentId: razorpay_payment_id,
        paidAt: now,
        paidAmount: paymentRecord?.amount
      });

      // Broadcast real-time payment confirmation across all connected peers
      broadcastRealtimeEvent('PAYMENT_CONFIRMED', {
        auctionId,
        paymentId: razorpay_payment_id,
        amount: paymentRecord?.amount,
        userId,
        verifiedAt: now
      });

      console.log(`[Payment Verified] Lot #${auctionId} settled for ₹${paymentRecord?.amount || ''} (Payment ID: ${razorpay_payment_id})`);

      sendJson(res, 200, {
        success: true,
        message: 'Payment signature verified and settlement confirmed successfully.',
        paymentId: razorpay_payment_id,
        verifiedAt: now,
        amount: paymentRecord?.amount,
        auction: updatedAuction
      });
      return true;
    } catch (err) {
      console.error('[Payment Verification Error]:', err);
      sendJson(res, 500, { success: false, error: err.message || 'Server error verifying payment.' });
      return true;
    }
  }

  // 9c. GET /api/payments/status
  if (pathname === '/api/payments/status' && method === 'GET') {
    const auctionId = url.searchParams.get('auctionId');
    if (!auctionId) {
      sendJson(res, 400, { success: false, error: 'auctionId query parameter is required.' });
      return true;
    }

    // Production gate: Strictly block development test auction in production
    if (auctionId === 'auc-dev-test' && process.env.NODE_ENV === 'production') {
      sendJson(res, 403, { success: false, error: 'Test auction status unavailable in production.' });
      return true;
    }

    const payment = getPaymentByAuctionId(auctionId);
    const auction = getAuctionById(auctionId);
    const isPaid = Boolean(payment?.status === 'completed' || auction?.paymentStatus === 'completed');
    sendJson(res, 200, {
      success: true,
      paid: isPaid,
      paymentId: payment?.paymentId || auction?.paymentId || null,
      amount: payment?.amount || auction?.paidAmount || null,
      paidAt: payment?.verifiedAt || auction?.paidAt || null
    });
    return true;
  }

  // 10. GET /api/products
  if (pathname === '/api/products' && method === 'GET') {
    const products = getProducts();
    sendJson(res, 200, {
      success: true,
      serverTime: Date.now(),
      products
    });
    return true;
  }

  // 11. POST /api/products (Create normal shop product)
  if (pathname === '/api/products' && method === 'POST') {
    try {
      const data = await parseJsonBody(req);

      if (!data.name || !data.seller || !data.price) {
        sendJson(res, 400, { success: false, error: 'Product name, seller, and price are required.' });
        return true;
      }

      const price = Number(data.price);
      if (isNaN(price) || price <= 0) {
        sendJson(res, 400, { success: false, error: 'Price must be a valid positive amount.' });
        return true;
      }

      cleanRecentSubmissions();

      // Check clientSubmissionId idempotency
      const clientSubmissionId = data.clientSubmissionId || data.submissionId;
      if (clientSubmissionId && recentSubmissions.has(clientSubmissionId)) {
        const cached = recentSubmissions.get(clientSubmissionId);
        sendJson(res, 200, { success: true, product: cached.product, duplicatePrevented: true });
        return true;
      }

      // Check rapid double-click duplicate (same seller, title, price within 4 seconds)
      const rapidKey = `prod_${data.sellerId || data.seller}_${data.name.trim().toLowerCase()}_${price}`;
      const recentMatch = recentSubmissions.get(rapidKey);
      if (recentMatch && Date.now() - recentMatch.timestamp < 4000) {
        sendJson(res, 200, { success: true, product: recentMatch.product, duplicatePrevented: true });
        return true;
      }

      const primaryImage = data.image || (data.images && data.images[0]) || '';
      const imagesList = Array.isArray(data.images) && data.images.length > 0 ? data.images : [primaryImage];

      const newProduct = {
        id: data.id || ('prod-custom-' + Date.now()),
        type: 'shop',
        isAuction: false,
        name: data.name.trim(),
        seller: data.seller.trim(),
        sellerId: data.sellerId || null,
        location: data.location || 'Studio Atelier',
        category: data.category || 'Handmade',
        price: price,
        image: primaryImage,
        images: imagesList,
        description: data.description || '',
        materials: data.materials || '',
        dimensions: data.dimensions || '',
        condition: data.condition || 'Studio Mint Original',
        availability: 'In Stock • Studio Direct',
        rating: 5.0,
        featured: false,
        inStock: true,
        listingStatus: 'pending',
        listedAt: new Date().toISOString()
      };

      insertProduct(newProduct);

      if (clientSubmissionId) {
        recentSubmissions.set(clientSubmissionId, { timestamp: Date.now(), product: newProduct });
      }
      recentSubmissions.set(rapidKey, { timestamp: Date.now(), product: newProduct });

      broadcastSSE('PRODUCT_CREATED', { product: newProduct });
      sendJson(res, 201, { success: true, product: newProduct });
      return true;
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
      return true;
    }
  }

  // 12. POST /api/products/:id/approve
  const prodApproveMatch = pathname.match(/^\/api\/products\/([a-zA-Z0-9_-]+)\/approve$/);
  if (prodApproveMatch && method === 'POST') {
    const id = prodApproveMatch[1];
    const product = getProductById(id);
    if (!product) {
      sendJson(res, 404, { success: false, error: 'Product not found.' });
      return true;
    }

    const updated = updateProduct(id, { listingStatus: 'active' });
    broadcastSSE('PRODUCT_APPROVED', { product: updated });
    sendJson(res, 200, { success: true, product: updated });
    return true;
  }

  // 13. POST /api/products/:id/reject
  const prodRejectMatch = pathname.match(/^\/api\/products\/([a-zA-Z0-9_-]+)\/reject$/);
  if (prodRejectMatch && method === 'POST') {
    const id = prodRejectMatch[1];
    const product = getProductById(id);
    if (!product) {
      sendJson(res, 404, { success: false, error: 'Product not found.' });
      return true;
    }

    const updated = updateProduct(id, { listingStatus: 'rejected' });
    broadcastSSE('PRODUCT_REJECTED', { product: updated });
    sendJson(res, 200, { success: true, product: updated });
    return true;
  }

  // 14. DELETE /api/products/:id or POST /api/products/:id/delete
  const prodDeleteMatch = pathname.match(/^\/api\/products\/([a-zA-Z0-9_-]+)(?:\/delete)?$/);
  if (prodDeleteMatch && (method === 'DELETE' || (method === 'POST' && pathname.endsWith('/delete')))) {
    const id = prodDeleteMatch[1];

    // CRITICAL SAFETY CHECK: NEVER allow deletion of real production auctions
    if (id === 'auc-1' || id === 'up-2' || id === 'auc-dev-test') {
      sendJson(res, 403, { success: false, error: 'Cannot delete protected live auction records.' });
      return true;
    }

    let product = getProductById(id);
    let isAuctionRecord = false;
    if (!product) {
      const auctions = getAuctions();
      const matched = auctions.find((a) => a.id === id || a.productId === id);
      if (matched) {
        product = matched;
        isAuctionRecord = true;
      }
    }

    if (!product) {
      sendJson(res, 404, { success: false, error: 'Product or listing not found.' });
      return true;
    }

    let bodyData = {};
    try {
      bodyData = await parseJsonBody(req);
    } catch (e) {}

    const userId = bodyData.userId || url.searchParams.get('userId') || req.headers['x-user-id'];
    const userName = bodyData.userName || bodyData.user || url.searchParams.get('userName');

    // Ownership verification
    const isOwner = Boolean(
      (userId && product.sellerId && String(product.sellerId) === String(userId)) ||
      (userName && product.seller && product.seller.toLowerCase().trim() === userName.toLowerCase().trim()) ||
      (userName && product.maker && product.maker.toLowerCase().trim() === userName.toLowerCase().trim())
    );

    if (!isOwner) {
      sendJson(res, 403, { success: false, error: 'Unauthorized: You can only delete your own products.' });
      return true;
    }

    // Safety check: Cannot delete if associated with an active ongoing auction
    const auctions = getAuctions();
    const activeAuction = auctions.find(
      (a) => (a.productId === id || a.id === id || a.id === product.auctionId) && (a.status === 'active' || a.status === 'live')
    );
    if (activeAuction) {
      sendJson(res, 400, { success: false, error: 'Cannot delete product while associated with an active live auction.' });
      return true;
    }

    // Perform safe deletion (historical auctions, bids, and orders remain intact)
    const removedProduct = deleteProduct(id);
    const removedAuction = deleteCustomAuction(id);
    broadcastRealtimeEvent('PRODUCT_DELETED', { productId: id });
    broadcastSSE('PRODUCT_DELETED', { productId: id });
    sendJson(res, 200, {
      success: true,
      message: 'Product successfully deleted.',
      productId: id,
      removed: removedProduct || removedAuction
    });
    return true;
  }

  return false;
}
