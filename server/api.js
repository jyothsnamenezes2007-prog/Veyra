import {
  getAuctions,
  getAuctionById,
  insertAuction,
  updateAuction,
  getProducts,
  getProductById,
  insertProduct,
  updateProduct,
  saveDatabase
} from './db.js';
import { scheduler } from './scheduler.js';

// Connected SSE clients
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

// Broadcast SSE event to all connected clients
export function broadcastSSE(type, payload) {
  const message = `event: message\ndata: ${JSON.stringify({ type, payload, serverTime: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(message);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Hook scheduler events to SSE broadcast
scheduler.on('event', ({ type, payload }) => {
  broadcastSSE(type, payload);
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
      activeClients: sseClients.size
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
        const bidderName = data.bidderName || data.bidder || 'Collector';
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

        sendJson(res, 200, {
          success: true,
          auction: updated,
          bid: newBid
        });
        return true;
      } catch (err) {
        sendJson(res, 500, { success: false, error: err.message });
        return true;
      }
    });
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

  return false;
}
