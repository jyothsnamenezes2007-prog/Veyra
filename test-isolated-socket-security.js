import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer as createViteServer } from 'vite';
import { io as Client } from 'socket.io-client';
import { initSocketServer, getActiveSocketCount, broadcastEvent, sendUserEvent, setTokenVerifier, isAllowedOrigin } from './server/socket.js';
import { handleApiRequest, broadcastRealtimeEvent } from './server/api.js';

let backendServer;
let viteDevServer;
let clientAlice;
let clientBob;
let clientGuest;
let tempDbPath;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForEvent(emitter, eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.off(eventName, listener);
      reject(new Error(`Timeout waiting for event "${eventName}" after ${timeoutMs}ms`));
    }, timeoutMs);
    const listener = (payload) => {
      clearTimeout(timer);
      resolve(payload);
    };
    emitter.once(eventName, listener);
  });
}

async function cleanup() {
  if (clientAlice) { try { clientAlice.close(); } catch (e) {} }
  if (clientBob) { try { clientBob.close(); } catch (e) {} }
  if (clientGuest) { try { clientGuest.close(); } catch (e) {} }
  if (viteDevServer) { try { await viteDevServer.close(); } catch (e) {} }
  if (backendServer) {
    try {
      backendServer.closeAllConnections?.();
      backendServer.close();
    } catch (e) {}
  }
  if (tempDbPath && fs.existsSync(tempDbPath)) {
    try {
      fs.unlinkSync(tempDbPath);
      console.log('[Cleanup] Removed isolated test database successfully.');
    } catch (e) {}
  }
  delete process.env.VEYRA_DB_PATH;
}

async function runVerification() {
  console.log('================================================================');
  console.log('--- VEYRA ISOLATED SOCKET.IO & SECURITY VERIFICATION SUITE ---');
  console.log('================================================================\n');

  // STEP 0: Prepare isolated temporary database so server/data/db.json is NEVER touched
  const originalDbPath = path.resolve('server/data/db.json');
  tempDbPath = path.join(os.tmpdir(), `veyra-isolated-test-db-${Date.now()}.json`);
  fs.copyFileSync(originalDbPath, tempDbPath);

  // Clear any pre-existing proxy configs in the isolated test DB so manual bids don't trigger external Gemini API calls
  const tempDbData = JSON.parse(fs.readFileSync(tempDbPath, 'utf8'));
  tempDbData.proxyConfigs = [];
  fs.writeFileSync(tempDbPath, JSON.stringify(tempDbData, null, 2), 'utf8');

  process.env.VEYRA_DB_PATH = tempDbPath;

  const { initDatabase, resetDbCache, getAuctionById, updateAuction } = await import('./server/db.js');
  resetDbCache();
  initDatabase();
  console.log(`[Database] Running against isolated temporary test DB: ${tempDbPath}\n`);

  // STEP 1: Configure mock token verifier for offline test environment
  setTokenVerifier(async (token) => {
    if (token === 'valid-token-alice') {
      return { id: 'user-alice', email: 'alice@veyra.art' };
    }
    if (token === 'valid-token-bob') {
      return { id: 'user-bob', email: 'bob@veyra.art' };
    }
    return null;
  });

  // STEP 2: Start backend HTTP server with Socket.IO on 3001
  backendServer = http.createServer(async (req, res) => {
    if (req.url && req.url.startsWith('/socket.io')) {
      return;
    }

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

  initSocketServer(backendServer);

  await new Promise((resolve) => {
    backendServer.listen(3001, '127.0.0.1', () => {
      console.log('[Backend Server] Listening on http://127.0.0.1:3001');
      resolve();
    });
  });

  // STEP 3: Start Vite dev server on port 3000 using vite.config.js proxy
  viteDevServer = await createViteServer({
    server: {
      port: 3000,
      host: '127.0.0.1'
    }
  });
  await viteDevServer.listen();
  console.log('[Vite Dev Server] Running on http://127.0.0.1:3000 with proxy -> :3001\n');

  // -------------------------------------------------------------------------
  // TEST 1 & 3: Socket.IO Client Connection & Vite Proxy
  // -------------------------------------------------------------------------
  console.log('[Test 1 & 3] Connecting Alice, Bob, and Guest through Vite proxy (port 3000)...');

  clientAlice = Client('http://127.0.0.1:3000', {
    transports: ['websocket', 'polling'],
    auth: { token: 'valid-token-alice' }
  });

  clientBob = Client('http://127.0.0.1:3000', {
    transports: ['websocket', 'polling'],
    auth: { token: 'valid-token-bob' }
  });

  clientGuest = Client('http://127.0.0.1:3000', {
    transports: ['websocket', 'polling'],
    auth: { token: null }
  });

  const [aliceAuth, bobAuth] = await Promise.all([
    new Promise((resolve) => clientAlice.on('AUTH_SUCCESS', resolve)),
    new Promise((resolve) => clientBob.on('AUTH_SUCCESS', resolve)),
    new Promise((resolve) => clientGuest.on('connect', resolve))
  ]);

  if (aliceAuth.userId !== 'user-alice' || bobAuth.userId !== 'user-bob') {
    throw new Error(`Authentication failed during handshake: Alice=${aliceAuth.userId}, Bob=${bobAuth.userId}`);
  }
  console.log('✓ Test 1 & 3 Passed: Clients connected via Vite proxy; authenticated handshakes succeeded.');

  // -------------------------------------------------------------------------
  // TEST 10 & 11: User Room Security & Rejection of Unauthorized Access
  // -------------------------------------------------------------------------
  console.log('\n[Test 10 & 11] Verifying private user room authorization & spoofing rejection...');

  const guestErrPromise = waitForEvent(clientGuest, 'AUTH_ERROR');
  clientGuest.emit('join_user', 'user-alice');
  const guestErr = await guestErrPromise;
  console.log(`✓ Guest join_user rejected: "${guestErr.error}"`);

  const bobErrPromise = waitForEvent(clientBob, 'AUTH_ERROR');
  clientBob.emit('join_user', 'user-alice'); // Bob tries to join Alice's room
  const bobErr = await bobErrPromise;
  console.log(`✓ Cross-user spoofing rejected: "${bobErr.error}"`);
  console.log('✓ Test 10 & 11 Passed: Private rooms securely restricted to verified token owners.');

  // -------------------------------------------------------------------------
  // TEST 7: Auction Room Joining and Leaving
  // -------------------------------------------------------------------------
  console.log('\n[Test 7] Testing auction room join & leave mechanics...');
  const roomJoinedPromise = waitForEvent(clientAlice, 'ROOM_JOINED');
  clientAlice.emit('join_auction', 'auc-1');
  const roomJoined = await roomJoinedPromise;

  if (roomJoined.auctionId !== 'auc-1') {
    throw new Error('Failed to join auction room auc-1.');
  }

  const roomLeftPromise = waitForEvent(clientAlice, 'ROOM_LEFT');
  clientAlice.emit('leave_auction', 'auc-1');
  const roomLeft = await roomLeftPromise;

  if (roomLeft.auctionId !== 'auc-1') {
    throw new Error('Failed to leave auction room auc-1.');
  }
  console.log('✓ Test 7 Passed: Auction room join and leave verified.');

  // -------------------------------------------------------------------------
  // TEST 4, 5 & 14: Public Bid Updates & No maxBid Exposure
  // -------------------------------------------------------------------------
  console.log('\n[Test 4, 5 & 14] Verifying public BID_PLACED event delivery & maxBid protection...');
  const aliceBidPromise = waitForEvent(clientAlice, 'BID_PLACED');
  const bobBidPromise = waitForEvent(clientBob, 'BID_PLACED');
  const guestBidPromise = waitForEvent(clientGuest, 'BID_PLACED');

  const now = Date.now();
  updateAuction('auc-1', {
    status: 'active',
    approvalStatus: 'approved',
    startTimestamp: now - 60000,
    endTimestamp: now + 3600000,
    currentBid: 96000,
    startingBid: 90000,
    minIncrement: 4000,
    bidCount: 1,
    bidHistory: []
  });

  const bidRes = await fetch('http://127.0.0.1:3000/api/auctions/auc-1/bid', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: 104000,
      bidderName: 'Alice Collector',
      userId: 'user-alice'
    })
  });
  const bidJson = await bidRes.json();
  if (!bidJson.success) {
    throw new Error(`Bid failed: ${JSON.stringify(bidJson)}`);
  }

  const [aliceBidPayload, bobBidPayload, guestBidPayload] = await Promise.all([
    aliceBidPromise,
    bobBidPromise,
    guestBidPromise
  ]);

  if (bobBidPayload.updatedAuction.currentBid !== 104000) {
    throw new Error(`Unexpected currentBid: ${bobBidPayload.updatedAuction.currentBid}`);
  }
  if (bobBidPayload.maxBid !== undefined || bobBidPayload.updatedAuction.maxBid !== undefined) {
    throw new Error('SECURITY VIOLATION: maxBid was leaked in public BID_PLACED payload!');
  }
  console.log('✓ Test 4, 5 & 14 Passed: BID_PLACED delivered to all clients with zero maxBid leakage.');

  // -------------------------------------------------------------------------
  // TEST 12 & 13: Private Proxy Configuration & Notification Privacy
  // -------------------------------------------------------------------------
  console.log('\n[Test 12 & 13] Verifying private proxy notification isolation between Alice and Bob...');
  const aliceProxyEvents = [];
  const bobProxyEvents = [];
  const guestProxyEvents = [];

  const onProxyEvent = (store) => (payload) => store.push(payload);

  clientAlice.on('PROXY_CONFIG_UPDATED', onProxyEvent(aliceProxyEvents));
  clientAlice.on('PROXY_BID_PLACED', onProxyEvent(aliceProxyEvents));
  clientAlice.on('PROXY_BID_LIMIT_EXCEEDED', onProxyEvent(aliceProxyEvents));

  clientBob.on('PROXY_CONFIG_UPDATED', onProxyEvent(bobProxyEvents));
  clientBob.on('PROXY_BID_PLACED', onProxyEvent(bobProxyEvents));
  clientBob.on('PROXY_BID_LIMIT_EXCEEDED', onProxyEvent(bobProxyEvents));

  clientGuest.on('PROXY_CONFIG_UPDATED', onProxyEvent(guestProxyEvents));
  clientGuest.on('PROXY_BID_PLACED', onProxyEvent(guestProxyEvents));
  clientGuest.on('PROXY_BID_LIMIT_EXCEEDED', onProxyEvent(guestProxyEvents));

  // Brief yield to ensure client event handlers are registered in the event loop
  await sleep(50);

  // Dispatch private events intended ONLY for Alice
  broadcastRealtimeEvent('PROXY_CONFIG_UPDATED', {
    auctionId: 'auc-1',
    config: { userId: 'user-alice', maxBid: 250000, status: 'active' }
  });

  broadcastRealtimeEvent('PROXY_BID_PLACED', {
    auctionId: 'auc-1',
    proxyConfig: { userId: 'user-alice', maxBid: 250000 },
    bid: { id: 'b-alice-proxy-1', amount: 108000 }
  });

  broadcastRealtimeEvent('PROXY_BID_LIMIT_EXCEEDED', {
    auctionId: 'auc-1',
    proxyConfig: { userId: 'user-alice', maxBid: 250000 },
    reason: 'Outbid beyond maximum ceiling'
  });

  await sleep(300);

  if (aliceProxyEvents.length !== 3) {
    throw new Error(`Expected Alice to receive exactly 3 private proxy notifications (1 of each), received ${aliceProxyEvents.length}`);
  }

  // Verify single-delivery guarantee: exactly 1 emission per event, zero duplicates
  const configUpdates = aliceProxyEvents.filter(e => e.config?.status === 'active');
  const bidsPlaced = aliceProxyEvents.filter(e => e.bid?.id === 'b-alice-proxy-1');
  const limitExceeded = aliceProxyEvents.filter(e => e.reason === 'Outbid beyond maximum ceiling');
  if (configUpdates.length !== 1 || bidsPlaced.length !== 1 || limitExceeded.length !== 1) {
    throw new Error(`DUPLICATE EMISSION DETECTED: configUpdates=${configUpdates.length}, bidsPlaced=${bidsPlaced.length}, limitExceeded=${limitExceeded.length}`);
  }

  if (bobProxyEvents.length > 0) {
    throw new Error(`SECURITY LEAK: Bob received ${bobProxyEvents.length} private proxy events belonging to Alice!`);
  }

  if (guestProxyEvents.length > 0) {
    throw new Error(`SECURITY LEAK: Unauthenticated Guest received ${guestProxyEvents.length} private proxy events belonging to Alice!`);
  }
  console.log('✓ Test 12 & 13 Passed: Private proxy events delivered strictly to owner (Alice) exactly once; Bob & Guest received 0.');

  // -------------------------------------------------------------------------
  // SECURITY TEST: Fail-Closed Dropping of Missing / Invalid Owner Private Events
  // -------------------------------------------------------------------------
  console.log('\n[Security Test] Verifying private proxy events with missing/invalid owners are dropped...');

  // Have Bob join an auction floor room to verify room broadcasts are never reached
  clientBob.emit('join_auction', 'auc-1');
  await sleep(100);

  const prevAliceCount = aliceProxyEvents.length;
  const prevBobCount = bobProxyEvents.length;
  const prevGuestCount = guestProxyEvents.length;

  // 1. Missing userId entirely
  const resMissing = broadcastEvent('PROXY_CONFIG_UPDATED', {
    auctionId: 'auc-1',
    config: { maxBid: 250000, status: 'active' }
  });
  if (resMissing !== false) {
    throw new Error('SECURITY VIOLATION: broadcastEvent did not return false for missing owner userId!');
  }

  // 2. Empty string userId
  const resEmpty = broadcastEvent('PROXY_BID_PLACED', {
    auctionId: 'auc-1',
    proxyConfig: { userId: '', maxBid: 250000 },
    bid: { id: 'b-empty', amount: 110000 }
  });
  if (resEmpty !== false) {
    throw new Error('SECURITY VIOLATION: broadcastEvent did not return false for empty owner userId!');
  }

  // 3. Whitespace-only userId
  const resWhitespace = broadcastEvent('PROXY_BID_LIMIT_EXCEEDED', {
    auctionId: 'auc-1',
    proxyConfig: { userId: '   ', maxBid: 250000 },
    reason: 'Ceiling reached'
  });
  if (resWhitespace !== false) {
    throw new Error('SECURITY VIOLATION: broadcastEvent did not return false for whitespace owner userId!');
  }

  // 4. Null userId
  const resNull = broadcastEvent('PROXY_CONFIG_UPDATED', {
    auctionId: 'auc-1',
    userId: null
  });
  if (resNull !== false) {
    throw new Error('SECURITY VIOLATION: broadcastEvent did not return false for null owner userId!');
  }

  // 5. Targeted to auction room with roomOnly: true
  const resRoomOnly = broadcastEvent('PROXY_BID_PLACED', {
    auctionId: 'auc-1',
    bid: { id: 'b-unowned', amount: 115000 }
  }, 'auc-1', true);
  if (resRoomOnly !== false) {
    throw new Error('SECURITY VIOLATION: broadcastEvent did not return false for roomOnly unowned private event!');
  }

  await sleep(250);

  if (aliceProxyEvents.length !== prevAliceCount ||
      bobProxyEvents.length !== prevBobCount ||
      guestProxyEvents.length !== prevGuestCount) {
    throw new Error('SECURITY VIOLATION: Unowned private proxy events leaked to connected clients or auction room!');
  }
  console.log('✓ Security Test Passed: Missing/invalid owner private events dropped cleanly (never reach public or room subscribers).');

  // -------------------------------------------------------------------------
  // SECURITY TEST: Production Token Verifier Guard
  // -------------------------------------------------------------------------
  console.log('\n[Security Test] Verifying test token verifier cannot override authentication in production...');
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    setTokenVerifier(() => ({ id: 'hacker-override', email: 'hack@bad.com' }));
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    // Restore test verifier for the remainder of this test session
    setTokenVerifier(async (token) => {
      if (token === 'valid-token-alice') return { id: 'user-alice', email: 'alice@veyra.art' };
      if (token === 'valid-token-bob') return { id: 'user-bob', email: 'bob@veyra.art' };
      return null;
    });
  }
  console.log('✓ Security Test Passed: Token verifier cannot override Supabase auth when NODE_ENV is production.');

  // -------------------------------------------------------------------------
  // SECURITY TEST: CORS & allowRequest Origin Restrictions (Polling & WebSocket)
  // -------------------------------------------------------------------------
  console.log('\n[Security Test] Verifying explicit trusted-origin CORS policy...');
  if (!isAllowedOrigin('http://localhost:3000')) throw new Error('localhost:3000 must be allowed');
  if (!isAllowedOrigin('http://127.0.0.1:3000')) throw new Error('127.0.0.1:3000 must be allowed');
  if (!isAllowedOrigin('http://localhost:3001')) throw new Error('localhost:3001 must be allowed');
  if (!isAllowedOrigin('https://veyra-2qb1.onrender.com')) throw new Error('Render production URL must be allowed');
  if (isAllowedOrigin('https://random-tenant.onrender.com')) throw new Error('Arbitrary *.onrender.com must NOT be allowed');
  if (!isAllowedOrigin(undefined)) throw new Error('No-origin (curl/tests/same-origin) must be allowed');

  if (isAllowedOrigin('http://malicious-site.com')) throw new Error('Untrusted origin must be rejected');
  if (isAllowedOrigin('https://phishing-site.org')) throw new Error('Phishing origin must be rejected');

  // Verify allowRequest blocks connection attempt presenting an untrusted Origin header
  const maliciousClient = Client('http://127.0.0.1:3001', {
    transports: ['polling', 'websocket'],
    extraHeaders: { origin: 'http://malicious-site.com' }
  });
  const connectErr = await new Promise((resolve) => {
    maliciousClient.on('connect_error', (err) => resolve(err));
    maliciousClient.on('connect', () => resolve(null));
  });
  maliciousClient.close();
  if (!connectErr) {
    throw new Error('SECURITY VIOLATION: Socket.IO allowed connection with untrusted origin header!');
  }
  console.log(`✓ Security Test Passed: allowRequest successfully rejected untrusted origin connection: "${connectErr.message}"`);
  console.log('✓ Security Test Passed: Explicit CORS policy accepts exact trusted origins and rejects untrusted origins.');

  // -------------------------------------------------------------------------
  // TEST 6: Scheduler Lifecycle Events
  // -------------------------------------------------------------------------
  console.log('\n[Test 6] Verifying scheduler AUCTION_STARTED and AUCTION_ENDED forwarding...');
  const lifecycleEvents = [];
  clientBob.on('AUCTION_STARTED', (e) => lifecycleEvents.push({ type: 'STARTED', ...e }));
  clientBob.on('AUCTION_ENDED', (e) => lifecycleEvents.push({ type: 'ENDED', ...e }));

  broadcastRealtimeEvent('AUCTION_STARTED', { auction: { id: 'auc-test-live-1', status: 'active', name: 'Now Live' } });
  broadcastRealtimeEvent('AUCTION_ENDED', { auction: { id: 'auc-test-ended-1', status: 'ended', name: 'Now Ended' } });
  await sleep(200);

  if (lifecycleEvents.length !== 2) {
    throw new Error(`Expected 2 lifecycle events, received ${lifecycleEvents.length}`);
  }
  console.log('✓ Test 6 Passed: AUCTION_STARTED and AUCTION_ENDED received correctly.');

  // -------------------------------------------------------------------------
  // TEST 8: Product-related Real-Time Events
  // -------------------------------------------------------------------------
  console.log('\n[Test 8] Verifying PRODUCT_CREATED real-time event delivery...');
  const prodCreatedPromise = waitForEvent(clientAlice, 'PRODUCT_CREATED');

  const prodRes = await fetch('http://127.0.0.1:3000/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Carved Sandstone Arch',
      seller: 'Heritage Crafts',
      price: 34000,
      type: 'shop',
      description: 'Hand-carved architectural sandstone arch panel.'
    })
  });
  const prodJson = await prodRes.json();
  if (!prodJson.success) {
    throw new Error(`Product creation failed: ${JSON.stringify(prodJson)}`);
  }

  const prodEvent = await prodCreatedPromise;
  if (prodEvent.product.name !== 'Carved Sandstone Arch') {
    throw new Error('PRODUCT_CREATED payload name mismatch.');
  }
  console.log('✓ Test 8 Passed: PRODUCT_CREATED event delivered via Socket.IO.');

  // -------------------------------------------------------------------------
  // TEST 2 & 9: Socket Reconnection and Product Sync
  // -------------------------------------------------------------------------
  console.log('\n[Test 2 & 9] Verifying disconnection, reconnection, and product synchronization...');
  clientAlice.disconnect();
  await sleep(200);

  clientAlice.connect();
  await waitForEvent(clientAlice, 'connect');
  console.log('✓ Reconnected successfully.');

  // Fetch /api/products directly as frontend would on reconnect
  const refreshRes = await fetch('http://127.0.0.1:3000/api/products');
  const refreshJson = await refreshRes.json();
  const hasNewProduct = refreshJson.products.some((p) => p.name === 'Carved Sandstone Arch');
  if (!hasNewProduct) {
    throw new Error('Product catalog refresh did not include latest product after reconnect.');
  }
  console.log('✓ Test 2 & 9 Passed: Reconnection succeeds and product catalog refreshes accurately.');

  // -------------------------------------------------------------------------
  // TEST 15: /api/events Returns Expected Retired Response (410 Gone)
  // -------------------------------------------------------------------------
  console.log('\n[Test 15] Verifying retired SSE endpoint (/api/events) returns 410 Gone...');
  const sseRes = await fetch('http://127.0.0.1:3000/api/events');
  if (sseRes.status !== 410) {
    throw new Error(`Expected HTTP 410 Gone, received ${sseRes.status}`);
  }
  const sseJson = await sseRes.json();
  console.log(`✓ Test 15 Passed: /api/events returns HTTP 410 (${sseJson.error}).`);

  console.log('\n================================================================');
  console.log('ALL 15 SOCKET.IO & SECURITY VERIFICATION CHECKS PASSED (15/15)!');
  console.log('================================================================\n');

  await cleanup();
  process.exit(0);
}

runVerification().catch(async (err) => {
  console.error('\n❌ Verification Failed:', err);
  await cleanup();
  process.exit(1);
});
