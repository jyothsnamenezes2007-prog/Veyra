import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer as createViteServer } from 'vite';
import { io as Client } from 'socket.io-client';
import { initSocketServer, getActiveSocketCount, broadcastEvent } from './server/socket.js';
import { handleApiRequest } from './server/api.js';

let backendServer;
let viteDevServer;
let client;
let tempDbPath;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runE2EProxyVerification() {
  console.log('================================================================');
  console.log('--- STARTING VEYRA VITE PROXY & REAL-TIME SOCKET.IO E2E TEST ---');
  console.log('================================================================\n');

  const originalDbPath = path.resolve('server/data/db.json');
  tempDbPath = path.join(os.tmpdir(), `veyra-e2e-test-db-${Date.now()}.json`);
  fs.copyFileSync(originalDbPath, tempDbPath);
  const tempDbData = JSON.parse(fs.readFileSync(tempDbPath, 'utf8'));
  tempDbData.proxyConfigs = [];
  fs.writeFileSync(tempDbPath, JSON.stringify(tempDbData, null, 2), 'utf8');
  process.env.VEYRA_DB_PATH = tempDbPath;

  const { initDatabase, resetDbCache, getAuctions, getAuctionById, updateAuction } = await import('./server/db.js');
  resetDbCache();
  initDatabase();

  // 1. Start backend server on port 3001
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

  // 2. Start Vite dev server on port 3000 using vite.config.js
  viteDevServer = await createViteServer({
    server: {
      port: 3000,
      host: '127.0.0.1'
    }
  });
  await viteDevServer.listen();
  console.log('[Vite Dev Server] Running on http://127.0.0.1:3000 with proxy -> :3001\n');

  try {
    // -------------------------------------------------------------
    // Test 1: Proxy HTTP API request from :3000 to :3001
    // -------------------------------------------------------------
    console.log('[Test 1] Testing HTTP API proxy (/api/health) on localhost:3000...');
    const healthRes = await fetch('http://127.0.0.1:3000/api/health');
    if (healthRes.status !== 200) {
      throw new Error(`Expected HTTP 200 from proxied /api/health, got ${healthRes.status}`);
    }
    const healthData = await healthRes.json();
    if (healthData.status !== 'ok') {
      throw new Error(`Unexpected health response: ${JSON.stringify(healthData)}`);
    }
    console.log(`✓ Test 1 Passed: Vite successfully proxied HTTP API request to backend. (status: ${healthData.status})`);

    // -------------------------------------------------------------
    // Test 2: Connect Socket.IO client to frontend port 3000 via proxy
    // -------------------------------------------------------------
    console.log('\n[Test 2] Connecting Socket.IO client to http://127.0.0.1:3000 (Vite proxy)...');
    client = Client('http://127.0.0.1:3000', {
      transports: ['websocket', 'polling'],
      timeout: 10000
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Connection timed out on proxy port 3000')), 8000);
      client.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    if (!client.connected) {
      throw new Error('Socket.IO client failed to connect via Vite proxy.');
    }
    console.log(`✓ Test 2 Passed: Socket.IO client connected via proxy! Client ID: ${client.id}`);

    // Verify backend recognized connection
    if (getActiveSocketCount() < 1) {
      throw new Error(`Backend reports ${getActiveSocketCount()} active sockets, expected at least 1.`);
    }
    console.log(`✓ Backend reports ${getActiveSocketCount()} active socket client(s).`);

    // -------------------------------------------------------------
    // Test 3: Auction room joining & Real-time BID_PLACED event
    // -------------------------------------------------------------
    console.log('\n[Test 3] Testing Room join and BID_PLACED event delivery...');
    client.emit('join_auction', 'auc-1');
    await sleep(150);

    const receivedBids = [];
    client.on('BID_PLACED', (payload) => {
      receivedBids.push(payload);
    });

    // Make sure lot auc-1 exists and is active for bidding
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

    // Place a bid via proxied HTTP POST
    const bidPostRes = await fetch('http://127.0.0.1:3000/api/auctions/auc-1/bid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 105000,
        bidderName: 'Proxy Test Collector',
        userId: 'user-proxy-test-1'
      })
    });
    const bidJson = await bidPostRes.json();
    if (!bidJson.success) {
      throw new Error(`Bid placement failed: ${JSON.stringify(bidJson)}`);
    }

    await sleep(250);

    if (receivedBids.length === 0) {
      throw new Error('Socket client failed to receive BID_PLACED event after bid submission.');
    }
    const latestBid = receivedBids[0];
    if (latestBid.auctionId !== 'auc-1' || latestBid.updatedAuction.currentBid !== 105000) {
      throw new Error(`Received unexpected bid payload: ${JSON.stringify(latestBid)}`);
    }
    console.log(`✓ Test 3 Passed: Bid placed via proxied API, BID_PLACED received in real-time with currentBid ₹105,000.`);

    // -------------------------------------------------------------
    // Test 4: Live Auction Comments via Socket.IO
    // -------------------------------------------------------------
    console.log('\n[Test 4] Testing COMMENT_ADDED event delivery...');
    const receivedComments = [];
    client.on('COMMENT_ADDED', (payload) => {
      receivedComments.push(payload);
    });

    const commentRes = await fetch('http://127.0.0.1:3000/api/auctions/auc-1/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: 'Provenance Expert',
        message: 'Museum grade preservation.'
      })
    });
    const commentJson = await commentRes.json();
    if (!commentJson.success) {
      throw new Error(`Comment submission failed: ${JSON.stringify(commentJson)}`);
    }

    await sleep(250);

    if (receivedComments.length === 0) {
      throw new Error('Socket client failed to receive COMMENT_ADDED event.');
    }
    if (receivedComments[0].comment.message !== 'Museum grade preservation.') {
      throw new Error(`Unexpected comment payload: ${JSON.stringify(receivedComments[0])}`);
    }
    console.log('✓ Test 4 Passed: Comment broadcast and received via Socket.IO in real-time.');

    // -------------------------------------------------------------
    // Test 5: Scheduler lifecycle transitions (AUCTION_STARTED, AUCTION_ENDED)
    // -------------------------------------------------------------
    console.log('\n[Test 5] Testing lifecycle event delivery (AUCTION_STARTED, AUCTION_ENDED)...');
    const lifecycleEvents = [];
    client.on('AUCTION_STARTED', (p) => lifecycleEvents.push({ type: 'STARTED', ...p }));
    client.on('AUCTION_ENDED', (p) => lifecycleEvents.push({ type: 'ENDED', ...p }));

    broadcastEvent('AUCTION_STARTED', { auction: { id: 'auc-e2e-started', name: 'E2E Live Lot', status: 'active' } });
    broadcastEvent('AUCTION_ENDED', { auction: { id: 'auc-e2e-ended', name: 'E2E Ended Lot', status: 'ended' } });
    await sleep(250);

    if (lifecycleEvents.length !== 2) {
      throw new Error(`Expected 2 lifecycle events, received ${lifecycleEvents.length}`);
    }
    console.log('✓ Test 5 Passed: AUCTION_STARTED and AUCTION_ENDED received in real-time.');

    // -------------------------------------------------------------
    // Test 6: Product-related events (PRODUCT_CREATED, PRODUCT_APPROVED, PRODUCT_DELETED)
    // -------------------------------------------------------------
    console.log('\n[Test 6] Testing product real-time events (PRODUCT_CREATED)...');
    const receivedProducts = [];
    client.on('PRODUCT_CREATED', (p) => receivedProducts.push(p));

    const prodRes = await fetch('http://127.0.0.1:3000/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Handwoven Pashmina Scarf',
        seller: 'Kashmir Looms',
        sellerId: 'seller-kashmir-1',
        location: 'Srinagar, India',
        category: 'Handmade',
        price: 18500,
        type: 'shop',
        description: 'Finest handwoven cashmere pashmina.',
        condition: 'Mint Original',
        materials: 'Pure Cashmere wool',
        dimensions: '200cm × 70cm'
      })
    });
    const prodJson = await prodRes.json();
    if (!prodJson.success) {
      throw new Error(`Product creation failed: ${JSON.stringify(prodJson)}`);
    }

    await sleep(250);

    if (receivedProducts.length === 0) {
      throw new Error('Socket client failed to receive PRODUCT_CREATED event.');
    }
    if (receivedProducts[0].product.name !== 'Handwoven Pashmina Scarf') {
      throw new Error(`Unexpected product payload: ${JSON.stringify(receivedProducts[0])}`);
    }
    console.log('✓ Test 6 Passed: Product created via API, PRODUCT_CREATED delivered via Socket.IO.');

    // -------------------------------------------------------------
    // Test 7: Verify obsolete /api/events returns 410 Gone (SSE retired)
    // -------------------------------------------------------------
    console.log('\n[Test 7] Verifying retired SSE endpoint (/api/events) returns 410 Gone...');
    const sseRes = await fetch('http://127.0.0.1:3000/api/events');
    if (sseRes.status !== 410) {
      throw new Error(`Expected HTTP 410 Gone for /api/events, received ${sseRes.status}`);
    }
    const sseJson = await sseRes.json();
    console.log(`✓ Test 7 Passed: /api/events correctly returns 410 Gone (${sseJson.error}).`);

    console.log('\n================================================================');
    console.log('ALL 7 VITE PROXY & REAL-TIME SOCKET.IO E2E TESTS PASSED! (7/7)');
    console.log('================================================================\n');
    process.exit(0);
  } finally {
    if (client) client.close();
    if (viteDevServer) await viteDevServer.close();
    if (backendServer) {
      try {
        backendServer.closeAllConnections?.();
        backendServer.close();
      } catch (e) {}
    }
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch (e) {}
    }
    delete process.env.VEYRA_DB_PATH;
  }
}

runE2EProxyVerification().catch(async (err) => {
  console.error('\n❌ E2E Verification Failed:', err);
  if (client) client.close();
  if (viteDevServer) await viteDevServer.close();
  if (backendServer) backendServer.close();
  if (tempDbPath && fs.existsSync(tempDbPath)) {
    try {
      fs.unlinkSync(tempDbPath);
    } catch (e) {}
  }
  process.exit(1);
});
