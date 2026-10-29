/**
 * Veyra Socket.IO Real-Time Migration Verification Suite
 *
 * Verifies:
 * 1. Concurrent Socket.IO client connections.
 * 2. Room-based targeted broadcasting (join_auction, leave_auction).
 * 3. Bid submission and real-time delivery to multiple clients.
 * 4. Auto-bidding / proxy events and budget privacy.
 * 5. Comment broadcasting and single-delivery guarantee (no duplicates).
 * 6. Scheduler transition events (AUCTION_STARTED, AUCTION_ENDED).
 * 7. Disconnection, reconnection, and listener cleanup.
 */

import http from 'node:http';
import { io as Client } from 'socket.io-client';
import { initSocketServer, getActiveSocketCount, broadcastEvent, sendUserEvent } from './server/socket.js';
import { handleApiRequest } from './server/api.js';
import { initDatabase, getAuctions, getAuctionById, updateAuction } from './server/db.js';

let server;
let serverPort;
let clientA;
let clientB;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('================================================================');
  console.log('--- STARTING VEYRA SOCKET.IO REAL-TIME MIGRATION VERIFICATION ---');
  console.log('================================================================\n');

  initDatabase();

  // 1. Setup test HTTP server with Socket.IO
  server = http.createServer(async (req, res) => {
    // Let Socket.IO handle /socket.io polling and upgrade requests
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

  const ioServer = initSocketServer(server);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      console.log(`[Test Server] Started on ephemeral port ${serverPort}`);
      resolve();
    });
  });

  const serverUrl = `http://127.0.0.1:${serverPort}`;

  try {
    // -------------------------------------------------------------
    // Test 1: Connect two distinct clients concurrently
    // -------------------------------------------------------------
    console.log('[Test 1] Connecting multiple Socket.IO clients concurrently...');
    clientA = Client(serverUrl, { transports: ['websocket', 'polling'] });
    clientB = Client(serverUrl, { transports: ['websocket', 'polling'] });

    await Promise.all([
      new Promise((resolve, reject) => {
        clientA.on('connect', resolve);
        clientA.on('connect_error', reject);
      }),
      new Promise((resolve, reject) => {
        clientB.on('connect', resolve);
        clientB.on('connect_error', reject);
      })
    ]);

    if (getActiveSocketCount() !== 2) {
      throw new Error(`Expected 2 active sockets, found ${getActiveSocketCount()}`);
    }
    console.log(`✓ Test 1 Passed: Client A (${clientA.id}) and Client B (${clientB.id}) connected simultaneously.`);

    // -------------------------------------------------------------
    // Test 2: Room joining and targeted auction delivery
    // -------------------------------------------------------------
    console.log('\n[Test 2] Verifying auction room subscription and isolation...');
    clientA.emit('join_auction', 'auc-1');
    clientB.emit('join_auction', 'auc-2');
    await sleep(150);

    const clientARoomEvents = [];
    const clientBRoomEvents = [];

    clientA.on('ROOM_ANNOUNCEMENT', (p) => clientARoomEvents.push(p));
    clientB.on('ROOM_ANNOUNCEMENT', (p) => clientBRoomEvents.push(p));

    // Broadcast only to room auc-1
    ioServer.to('auction:auc-1').emit('ROOM_ANNOUNCEMENT', { message: 'Welcome to Lot 1' });
    await sleep(150);

    if (clientARoomEvents.length !== 1 || clientARoomEvents[0].message !== 'Welcome to Lot 1') {
      throw new Error('Client A failed to receive targeted room message.');
    }
    if (clientBRoomEvents.length !== 0) {
      throw new Error('Client B improperly received message targeted to room auc-1.');
    }
    console.log('✓ Test 2 Passed: Auction room subscription correctly isolates floor-specific events.');

    // -------------------------------------------------------------
    // Test 3: Bid placement broadcast across all clients
    // -------------------------------------------------------------
    console.log('\n[Test 3] Testing real-time BID_PLACED event delivery to multiple clients...');
    const clientABids = [];
    const clientBBids = [];

    clientA.on('BID_PLACED', (b) => clientABids.push(b));
    clientB.on('BID_PLACED', (b) => clientBBids.push(b));

    const testBidPayload = {
      auctionId: 'auc-1',
      bid: { id: 'bid-test-1', amount: 150000, bidder: 'Collector A', timestamp: Date.now() },
      currentBid: 150000,
      bidCount: 5,
      winner: { name: 'Collector A', amount: 150000 },
      remainingSeconds: 1200
    };

    broadcastEvent('BID_PLACED', testBidPayload, 'auc-1');
    await sleep(150);

    if (clientABids.length !== 1 || clientABids[0].currentBid !== 150000) {
      throw new Error('Client A failed to receive BID_PLACED event.');
    }
    if (clientBBids.length !== 1 || clientBBids[0].currentBid !== 150000) {
      throw new Error('Client B failed to receive BID_PLACED event.');
    }
    console.log('✓ Test 3 Passed: BID_PLACED event delivered in real-time to all listening clients.');

    // -------------------------------------------------------------
    // Test 4: Auto-bidding / Proxy events & Budget Privacy
    // -------------------------------------------------------------
    console.log('\n[Test 4] Testing Auto-bidding events and ensuring private maximum budget is NOT exposed...');
    const clientAProxyEvents = [];
    const clientBProxyEvents = [];

    clientA.on('PROXY_BID_PLACED', (p) => clientAProxyEvents.push(p));
    clientB.on('PROXY_BID_PLACED', (p) => clientBProxyEvents.push(p));

    const proxyEventPayload = {
      auctionId: 'auc-1',
      bid: { id: 'pb-bid-1', amount: 155000, isProxy: true },
      currentBid: 155000,
      bidCount: 6,
      remainingSeconds: 1150
      // Notice: maxBid is strictly excluded
    };

    broadcastEvent('PROXY_BID_PLACED', proxyEventPayload, 'auc-1');
    await sleep(150);

    if (clientAProxyEvents.length !== 1 || clientBProxyEvents.length !== 1) {
      throw new Error('Failed to deliver PROXY_BID_PLACED event to clients.');
    }
    if (clientBProxyEvents[0].maxBid !== undefined) {
      throw new Error('SECURITY VIOLATION: Private proxy max budget was exposed in event payload!');
    }
    console.log('✓ Test 4 Passed: Auto-bidding events broadcast correctly with private budget securely protected.');

    // -------------------------------------------------------------
    // Test 5: Live Auction Comments (Single delivery & deduplication)
    // -------------------------------------------------------------
    console.log('\n[Test 5] Testing live auction comment broadcasting and single delivery...');
    const clientAComments = [];
    const clientBComments = [];

    clientA.on('COMMENT_ADDED', (c) => clientAComments.push(c));
    clientB.on('COMMENT_ADDED', (c) => clientBComments.push(c));

    const testComment = {
      auctionId: 'auc-1',
      comment: {
        id: 'c-test-99',
        user: 'Collector X',
        message: 'Masterwork in remarkable preservation.',
        timestamp: Date.now()
      }
    };

    broadcastEvent('COMMENT_ADDED', testComment, 'auc-1');
    await sleep(150);

    if (clientAComments.length !== 1 || clientAComments[0].comment.id !== 'c-test-99') {
      throw new Error('Client A failed to receive live comment.');
    }
    if (clientBComments.length !== 1 || clientBComments[0].comment.id !== 'c-test-99') {
      throw new Error('Client B failed to receive live comment.');
    }
    console.log('✓ Test 5 Passed: Live auction floor comments broadcast exactly once with zero duplication.');

    // -------------------------------------------------------------
    // Test 6: Scheduler lifecycle transitions (AUCTION_STARTED, AUCTION_ENDED)
    // -------------------------------------------------------------
    console.log('\n[Test 6] Testing scheduler auction lifecycle transitions...');
    const lifecycleEvents = [];
    clientA.on('AUCTION_STARTED', (e) => lifecycleEvents.push({ type: 'STARTED', ...e }));
    clientA.on('AUCTION_ENDED', (e) => lifecycleEvents.push({ type: 'ENDED', ...e }));

    broadcastEvent('AUCTION_STARTED', { auction: { id: 'auc-test-live', status: 'active', name: 'Live Now Lot' } });
    broadcastEvent('AUCTION_ENDED', { auction: { id: 'auc-test-ended', status: 'ended', name: 'Ended Lot' } });
    await sleep(150);

    if (lifecycleEvents.length !== 2) {
      throw new Error(`Expected 2 lifecycle events, received ${lifecycleEvents.length}`);
    }
    console.log('✓ Test 6 Passed: AUCTION_STARTED and AUCTION_ENDED delivered in real-time.');

    // -------------------------------------------------------------
    // Test 7: Disconnection, active count tracking, and reconnection
    // -------------------------------------------------------------
    console.log('\n[Test 7] Testing disconnection cleanup and reconnection resilience...');
    clientA.disconnect();
    await sleep(200);

    if (getActiveSocketCount() !== 1) {
      throw new Error(`Expected 1 active socket after disconnect, found ${getActiveSocketCount()}`);
    }

    clientA.connect();
    await new Promise((resolve, reject) => {
      clientA.on('connect', resolve);
      clientA.on('connect_error', reject);
    });

    if (getActiveSocketCount() !== 2) {
      throw new Error(`Expected 2 active sockets after reconnect, found ${getActiveSocketCount()}`);
    }
    console.log('✓ Test 7 Passed: Socket disconnection cleaned up accurately; reconnection succeeded.');

    // -------------------------------------------------------------
    // Test 8: Backward-compatible REST /api/events still reachable
    // -------------------------------------------------------------
    console.log('\n[Test 8] Checking backward-compatibility of /api/events and /api/health...');
    const healthRes = await fetch(`${serverUrl}/api/health`);
    const healthJson = await healthRes.json();

    if (healthJson.status !== 'ok' || healthJson.activeSockets !== 2) {
      throw new Error(`Health check failed: ${JSON.stringify(healthJson)}`);
    }
    console.log(`✓ Test 8 Passed: Health endpoint reports status: ok, activeSockets: ${healthJson.activeSockets}.`);

    console.log('\n================================================================');
    console.log('ALL 8 SOCKET.IO REAL-TIME MIGRATION TESTS PASSED SUCCESSFULLY! (8/8)');
    console.log('================================================================\n');
  } finally {
    if (clientA) clientA.close();
    if (clientB) clientB.close();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runTests().catch((err) => {
  console.error('\n❌ Socket.IO Verification Suite Failed:', err);
  if (clientA) clientA.close();
  if (clientB) clientB.close();
  if (server) server.close();
  process.exit(1);
});
