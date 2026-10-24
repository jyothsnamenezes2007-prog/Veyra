import assert from 'node:assert';
import http from 'node:http';
import { io } from 'socket.io-client';
import {
  initDatabase,
  getAuctions,
  getAuctionById,
  insertAuction,
  updateAuction,
  getAutoBids,
  getUserAutoBid,
  upsertAutoBid,
  getAuctionMessages
} from './server/db.js';
import { handleApiRequest } from './server/api.js';
import { initSocketIO, executeAuthoritativeBid, triggerAutoBidLoop } from './server/socket.js';
import { evaluateAutoBid } from './server/gemini.js';

console.log('================================================================');
console.log('--- STARTING VEYRA SOCKET.IO, GEMINI AUTO-BID & MESSAGES TEST ---');
console.log('================================================================\n');

// 1. Initialize HTTP server + Socket.IO on ephemeral port
initDatabase();

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.url && req.url.startsWith('/socket.io/')) return;
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

const ioServer = initSocketIO(server);

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const serverUrl = 'http://127.0.0.1:' + port;
console.log(`Test server running on ${serverUrl}`);

try {
  // Setup a test live auction
  const testAuctionId = 'auc-socket-test-' + Date.now();
  const testAuction = {
    id: testAuctionId,
    productId: 'prod-test-' + Date.now(),
    type: 'auction',
    isAuction: true,
    name: 'Archival Kashi Chased Brass Urn',
    seller: 'Artisan Workshop',
    sellerId: 'seller-kashi-artisan',
    startingBid: 20000,
    currentBid: 20000,
    minIncrement: 1000,
    bidCount: 0,
    bidHistory: [],
    approvalStatus: 'approved',
    status: 'active',
    startTimestamp: Date.now() - 10000,
    endTimestamp: Date.now() + 3600000,
    remainingSeconds: 3600,
    winner: null
  };
  insertAuction(testAuction);

  // ── Test 1: Connect two authenticated clients via Socket.IO ─────────────────
  console.log('Test 1: Connect two authenticated clients via Socket.IO');

  const clientA = io(serverUrl, { transports: ['polling', 'websocket'] });
  const clientB = io(serverUrl, { transports: ['polling', 'websocket'] });

  await Promise.all([
    new Promise((resolve) => clientA.on('connect', resolve)),
    new Promise((resolve) => clientB.on('connect', resolve))
  ]);

  clientA.emit('auth', { userId: 'buyer-alpha', userName: 'Collector Alpha' });
  clientB.emit('auth', { userId: 'buyer-beta', userName: 'Collector Beta' });

  clientA.emit('join_auction', { auctionId: testAuctionId, userId: 'buyer-alpha', userName: 'Collector Alpha' });
  clientB.emit('join_auction', { auctionId: testAuctionId, userId: 'buyer-beta', userName: 'Collector Beta' });

  const roomState = await new Promise((resolve) => {
    clientB.on('room_state', (state) => {
      if (state.auctionId === testAuctionId) resolve(state);
    });
  });

  assert.strictEqual(roomState.currentBid, 20000);
  assert.strictEqual(roomState.minRequiredBid, 20000);
  console.log('✓ Test 1 Passed: Clients connected and received authoritative room state.');

  // ── Test 2: Confidential Auto-bid Configuration & Privacy ──────────────────
  console.log('\nTest 2: Configure confidential AI Auto-Bid agent');

  // Client A configures auto-bid with max budget ₹35,000, preferred increment ₹60
  const autoBidConfig = {
    auctionId: testAuctionId,
    userId: 'buyer-alpha',
    bidderName: 'Collector Alpha',
    maxBudget: 35000,
    preferredIncrement: 60,
    enabled: true,
    status: 'active'
  };

  const autoBidRes = await fetch(`${serverUrl}/api/auctions/${testAuctionId}/autobid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(autoBidConfig)
  });
  const autoBidData = await autoBidRes.json();

  assert.strictEqual(autoBidData.success, true);
  assert.strictEqual(autoBidData.config.maxBudget, 35000);
  assert.strictEqual(autoBidData.config.preferredIncrement, 60);

  // Privacy check: Public GET /api/auctions must NEVER leak auto-bid settings
  const publicAuctionsRes = await fetch(`${serverUrl}/api/auctions/${testAuctionId}`);
  const publicAuctionData = await publicAuctionsRes.json();
  assert.strictEqual(publicAuctionData.auction.maxBudget, undefined, 'Public auction record must not contain maxBudget');
  assert.strictEqual(publicAuctionData.auction.autoBids, undefined, 'Public auction record must not contain autoBids array');

  // Privacy check: User Beta cannot access User Alpha's confidential settings
  const betaFetchRes = await fetch(`${serverUrl}/api/auctions/${testAuctionId}/autobid?userId=buyer-beta`);
  const betaFetchData = await betaFetchRes.json();
  assert.strictEqual(betaFetchData.config, null, 'User Beta must not see User Alpha settings');
  console.log('✓ Test 2 Passed: Auto-bid configured securely; private constraints strictly protected.');

  // ── Test 3 & 4: Manual bid broadcast & Auto-bid agent response ───────────────
  console.log('\nTest 3 & 4: Manual bid broadcast via Socket.IO & Auto-Bid trigger');

  // Listen for Client B's manual bid and Client A's autonomous counter-bid
  const clientABidPromise = new Promise((resolve) => {
    clientA.on('bid_update', (payload) => {
      if (payload.auctionId === testAuctionId && payload.bid.bidderId === 'buyer-beta') {
        resolve(payload);
      }
    });
  });

  const clientBBidPromise = new Promise((resolve) => {
    clientB.on('bid_update', (payload) => {
      if (payload.auctionId === testAuctionId && payload.bid.bidderId === 'buyer-beta') {
        resolve(payload);
      }
    });
  });

  const autoBidPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Auto-bid agent response timed out')), 4000);
    clientB.on('bid_update', (payload) => {
      if (payload.auctionId === testAuctionId && payload.bid.bidderId === 'buyer-alpha') {
        clearTimeout(timeout);
        resolve(payload);
      }
    });
  });

  // Client B places a manual bid of ₹22,000 via Socket.IO
  const bidAck = await new Promise((resolve) => {
    clientB.emit('place_bid', {
      auctionId: testAuctionId,
      amount: 22000,
      userId: 'buyer-beta',
      bidderName: 'Collector Beta'
    }, resolve);
  });

  assert.strictEqual(bidAck.success, true);
  assert.strictEqual(bidAck.auction.currentBid, 22000);

  const [bidBroadcastA, bidBroadcastB] = await Promise.all([clientABidPromise, clientBBidPromise]);
  assert.strictEqual(bidBroadcastA.currentBid, 22000);
  assert.strictEqual(bidBroadcastB.currentBid, 22000);
  console.log('✓ Test 3 Passed: Manual bid instantly broadcast to all connected Socket.IO clients.');

  // Wait for the autonomous response from Buyer Alpha's auto-bid agent
  const autoBidUpdate = await autoBidPromise;
  assert.strictEqual(autoBidUpdate.bid.bidderId, 'buyer-alpha');
  assert(autoBidUpdate.currentBid >= 23000, 'Auto-bid must meet auction minimum increment');
  assert(autoBidUpdate.currentBid <= 35000, 'Auto-bid must not exceed max budget of 35000');
  console.log(`✓ Test 4 Passed: Autonomous agent responded with authoritative counter-bid ₹${autoBidUpdate.currentBid.toLocaleString('en-IN')}.`);

  // ── Test 5: Auto-Bid Stops at Maximum Budget ─────────────────────────────────
  console.log('\nTest 5: Auto-bid ceiling enforcement');

  // Client B now bids ₹36,000 (exceeding Client A's max budget of ₹35,000)
  const overBudgetAck = await new Promise((resolve) => {
    clientB.emit('place_bid', {
      auctionId: testAuctionId,
      amount: 36000,
      userId: 'buyer-beta',
      bidderName: 'Collector Beta'
    }, resolve);
  });

  assert.strictEqual(overBudgetAck.success, true);
  assert.strictEqual(overBudgetAck.auction.currentBid, 36000);

  // Allow time for agent evaluation
  await new Promise((r) => setTimeout(r, 600));

  // The latest bid must remain Client B's ₹36,000; Client A must NOT overbid
  const currentAuction = getAuctionById(testAuctionId);
  assert.strictEqual(currentAuction.currentBid, 36000, 'Agent must strictly refrain from bidding over max budget');
  assert.strictEqual(currentAuction.bidHistory[0].bidderId, 'buyer-beta');

  const userAutoBid = getUserAutoBid(testAuctionId, 'buyer-alpha');
  assert.strictEqual(userAutoBid.status, 'budget_reached', 'Status must transition to budget_reached');
  console.log('✓ Test 5 Passed: Auto-bid stopped at maximum budget and updated status.');

  // ── Test 6: Real-time Auction Messages via Socket.IO ───────────────────────
  console.log('\nTest 6: Real-time auction messages on same page via Socket.IO');

  const messagePromise = new Promise((resolve) => {
    clientA.on('new_message', (msg) => {
      if (msg.auctionId === testAuctionId) resolve(msg);
    });
  });

  const msgAck = await new Promise((resolve) => {
    clientB.emit('send_message', {
      auctionId: testAuctionId,
      text: 'Remarkable patina on the chased handles.',
      sender: 'Collector Beta',
      userId: 'buyer-beta'
    }, resolve);
  });

  assert.strictEqual(msgAck.success, true);
  assert.strictEqual(msgAck.message.text, 'Remarkable patina on the chased handles.');

  const receivedMsg = await messagePromise;
  assert.strictEqual(receivedMsg.text, 'Remarkable patina on the chased handles.');
  assert.strictEqual(receivedMsg.sender, 'Collector Beta');

  // Verify persistence in DB
  const storedMessages = getAuctionMessages(testAuctionId);
  assert(storedMessages.some((m) => m.text === 'Remarkable patina on the chased handles.'));
  console.log('✓ Test 6 Passed: Message sent, broadcast in real-time, and persisted.');

  // ── Test 7: Post-Auction WebRTC Call Authorization ──────────────────────────
  console.log('\nTest 7: Authoritative Winner–Seller WebRTC Call Access');

  // Conclude the auction with buyer-beta as winner
  updateAuction(testAuctionId, {
    status: 'ended',
    remainingSeconds: 0,
    winner: { bidder: 'Collector Beta', bidderId: 'buyer-beta', amount: 36000 }
  });

  // Client C (unrelated third buyer) tries to join call
  const clientC = io(serverUrl, { transports: ['polling', 'websocket'] });
  await new Promise((r) => clientC.on('connect', r));

  const clientCErrorPromise = new Promise((resolve) => {
    clientC.on('call_error', resolve);
  });

  clientC.emit('join_call', {
    auctionId: testAuctionId,
    userId: 'unauthorized-user-c',
    role: 'buyer'
  });

  const callError = await clientCErrorPromise;
  assert(callError.error.includes('Access restricted'), 'Unauthorized user must be blocked from call');

  // Winner (buyer-beta) joins call
  clientB.emit('join_call', {
    auctionId: testAuctionId,
    userId: 'buyer-beta',
    role: 'buyer'
  });

  clientC.disconnect();
  console.log('✓ Test 7 Passed: Post-auction WebRTC call strictly restricted to winning buyer and seller.');

  // ── Test 8: Deterministic Rule Fallback when Gemini is Unreachable ───────────
  console.log('\nTest 8: Graceful fallback when Gemini API is offline/unreachable');

  const testConfig = {
    userId: 'test-bidder',
    bidderName: 'Test Bidder',
    maxBudget: 50000,
    preferredIncrement: 65
  };

  const offlineEval = await evaluateAutoBid({
    auction: { currentBid: 30000, minIncrement: 1000, bidCount: 2 },
    config: testConfig,
    leadingBid: { bidderId: 'other-user', amount: 30000 }
  });

  assert.strictEqual(offlineEval.decision, 'BID');
  assert(offlineEval.amount >= 31000);
  assert(offlineEval.amount <= 50000);
  assert.strictEqual(offlineEval.source, 'rules');
  console.log('✓ Test 8 Passed: Deterministic rule fallback reliably operates without crashing.');

  // Cleanup
  clientA.disconnect();
  clientB.disconnect();

  console.log('\n================================================================');
  console.log('ALL SOCKET.IO, GEMINI AUTO-BID & WEBRTC INTEGRATION TESTS PASSED!');
  console.log('================================================================\n');

  server.close();
  process.exit(0);
} catch (err) {
  console.error('\n❌ Test failed with error:', err);
  server.close();
  process.exit(1);
}
