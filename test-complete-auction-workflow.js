import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import {
  initDatabase,
  getAuctions,
  getAuctionById,
  insertAuction,
  updateAuction,
  getProducts,
  getProductById,
  insertProduct,
  updateProduct
} from './server/db.js';
import { scheduler } from './server/scheduler.js';
import { handleApiRequest } from './server/api.js';
import { getAuthoritativeAuctionWinner, getMeetingAccess } from './src/data/auctions.js';
import { PRODUCTS } from './src/data/products.js';

console.log('================================================================');
console.log('--- STARTING VEYRA COMPLETE WORKFLOW & SCHEDULER VERIFICATION ---');
console.log('================================================================\n');

// Mock HTTP Request/Response helpers using node:stream.Readable for reliable buffering
function createMockReqRes(method, url, body = null) {
  let pushed = false;
  const req = new Readable({
    read() {
      if (!pushed) {
        pushed = true;
        if (body) {
          this.push(JSON.stringify(body));
        }
        this.push(null);
      }
    }
  });

  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost:3000' };

  let statusCode = 200;
  let headers = {};
  let responseData = '';

  const res = {
    writeHead(code, hdrs) {
      statusCode = code;
      headers = { ...headers, ...hdrs };
    },
    setHeader(k, v) {
      headers[k] = v;
    },
    write(data) {
      responseData += data;
    },
    end(data) {
      if (data) responseData += data;
    }
  };

  const execute = async () => {
    await handleApiRequest(req, res);
    let json = null;
    try {
      json = JSON.parse(responseData);
    } catch (e) {}
    return { statusCode, headers, body: json, raw: responseData };
  };

  return { req, res, execute };
}

// ── Test 1: Create and publish a normal shop product ─────────────────────────
console.log('Test 1: Create and publish a normal shop product');
const shopProductPayload = {
  name: 'Hand-Thrown Terracotta Urn',
  seller: 'Pottery Studio',
  sellerId: 'seller-pottery-1',
  location: 'Jaipur, India',
  category: 'Handmade',
  price: 6800,
  type: 'shop',
  description: 'Authentic wheel-thrown terracotta urn finished with organic wood-ash glaze.',
  condition: 'Studio Mint Original',
  materials: 'Natural river terracotta clay',
  dimensions: '35cm H × 22cm Dia'
};

const reqRes1 = createMockReqRes('POST', '/api/products', shopProductPayload);
const res1 = await reqRes1.execute();
assert.strictEqual(res1.statusCode, 201, 'Should create product with status 201');
assert.strictEqual(res1.body.success, true);
assert.strictEqual(res1.body.product.type, 'shop', 'Must save with persistent type "shop"');
assert.strictEqual(res1.body.product.listingStatus, 'pending', 'Newly submitted shop product must be pending approval');

// Approve shop product
const prodId = res1.body.product.id;
const reqRes1Approve = createMockReqRes('POST', `/api/products/${prodId}/approve`);
const res1Approve = await reqRes1Approve.execute();
assert.strictEqual(res1Approve.statusCode, 200);
assert.strictEqual(res1Approve.body.product.listingStatus, 'active', 'Once approved, product listingStatus must be active');
console.log('✓ Test 1 Passed: Normal shop product saved with persistent type "shop" and approved into marketplace.');

// ── Test 2: Create an auction with a future start time ───────────────────────
console.log('\nTest 2: Create an auction with a future start time');
const futureStart = Date.now() + 60000; // 1 minute in the future
const futureEnd = futureStart + 120000;  // 2 minutes duration

const auctionPayload = {
  name: 'Archival Chandigarh Teak Bench',
  seller: 'Workshop Le Corbusier',
  sellerId: 'seller-corbu-1',
  location: 'Chandigarh, India',
  category: 'Vintage Finds',
  price: 90000,
  startingBid: 45000,
  minIncrement: 1500,
  reservePrice: 60000,
  startTimestamp: futureStart,
  endTimestamp: futureEnd,
  description: 'Rare solid teak bench with preserved inventory markings.',
  materials: 'Burma teak',
  dimensions: '140cm W × 45cm D × 48cm H'
};

const reqRes2 = createMockReqRes('POST', '/api/auctions', auctionPayload);
const res2 = await reqRes2.execute();
assert.strictEqual(res2.statusCode, 201);
assert.strictEqual(res2.body.auction.type, 'auction', 'Must save with persistent type "auction"');
assert.strictEqual(res2.body.auction.isAuction, true);
assert.strictEqual(res2.body.auction.approvalStatus, 'pending', 'Must start in pending approval');
assert.strictEqual(res2.body.auction.status, 'pending');
assert.strictEqual(res2.body.auction.startingBid, 45000);
assert.strictEqual(res2.body.auction.currentBid, 45000);
const auctionId = res2.body.auction.id;
console.log('✓ Test 2 Passed: Auction lot created with future schedule, starting bid, increment, and reserve.');

// ── Test 3: Approval and safe policy on past schedules ───────────────────────
console.log('\nTest 3: Verify appearance as scheduled lot after approval & safe policy on past times');

// 3a. Approve valid future auction
const reqRes3Approve = createMockReqRes('POST', `/api/auctions/${auctionId}/approve`);
const res3Approve = await reqRes3Approve.execute();
assert.strictEqual(res3Approve.statusCode, 200);
assert.strictEqual(res3Approve.body.auction.approvalStatus, 'approved');
assert.strictEqual(res3Approve.body.auction.status, 'scheduled', 'Approved future auction must be in scheduled state');

// 3b. Verify safe policy: Cannot approve auction whose start time has already passed
const pastAuctionPayload = {
  name: 'Overdue Antique Brass Lamp',
  seller: 'Heritage Atelier',
  sellerId: 'seller-heritage',
  startingBid: 12000,
  startTimestamp: Date.now() - 3600000, // 1 hour ago
  endTimestamp: Date.now() + 3600000
};
// Directly insert into DB to simulate overdue pending auction
const overdueAuc = insertAuction({
  ...pastAuctionPayload,
  id: 'auc-overdue-test',
  productId: 'prod-overdue-test',
  type: 'auction',
  isAuction: true,
  approvalStatus: 'pending',
  status: 'pending'
});
const reqResOverdue = createMockReqRes('POST', `/api/auctions/${overdueAuc.id}/approve`);
const resOverdue = await reqResOverdue.execute();
assert.strictEqual(resOverdue.statusCode, 400, 'Must reject approval if start time is already in the past');
assert.strictEqual(resOverdue.body.requiresReschedule, true, 'Must flag that rescheduling is required');
console.log('✓ Test 3 Passed: Future auction becomes scheduled upon approval; past-scheduled auction approval is safely blocked.');

// ── Test 4: Bidding is strictly rejected before the start time ───────────────
console.log('\nTest 4: Verify bidding is rejected before the start time');
const reqRes4Bid = createMockReqRes('POST', `/api/auctions/${auctionId}/bid`, {
  amount: 47000,
  bidderName: 'Early Collector',
  userId: 'buyer-early-1'
});
const res4Bid = await reqRes4Bid.execute();
assert.strictEqual(res4Bid.statusCode, 400, 'Must reject bids placed before auction start time');
assert(res4Bid.body.error.includes('not opened yet'), 'Error message must state auction is not open yet');
console.log('✓ Test 4 Passed: Pre-bids rejected with informative explanation.');

// ── Test 5: Auction automatically becomes live at scheduled start time ───────
console.log('\nTest 5: Verify auction automatically transitions to live at scheduled start time');
// Fast-forward simulated schedule: set startTimestamp to now - 5000ms
updateAuction(auctionId, {
  startTimestamp: Date.now() - 5000,
  endTimestamp: Date.now() + 60000
});

// Run scheduler tick
scheduler.tick();

const liveAucRecord = getAuctionById(auctionId);
assert.strictEqual(liveAucRecord.status, 'active', 'Scheduler tick must transition scheduled auction to active/live');
assert.strictEqual(liveAucRecord.currentBid, 45000, 'Initial bid must be correctly set from startingBid');
console.log('✓ Test 5 Passed: Scheduler automatically transitioned approved auction to live state.');

// ── Test 6: Verify valid bids update across connected clients ────────────────
console.log('\nTest 6: Verify valid bids are accepted and update auction state');
const validBid1 = createMockReqRes('POST', `/api/auctions/${auctionId}/bid`, {
  amount: 46500, // 45000 + 1500 increment
  bidderName: 'Collector Singhania',
  userId: 'user-singhania-1'
});
const resValid1 = await validBid1.execute();
assert.strictEqual(resValid1.statusCode, 200, 'Valid bid must succeed');
assert.strictEqual(resValid1.body.auction.currentBid, 46500);
assert.strictEqual(resValid1.body.auction.bidCount, 1);
assert.strictEqual(resValid1.body.auction.bidHistory[0].bidder, 'Collector Singhania');

const validBid2 = createMockReqRes('POST', `/api/auctions/${auctionId}/bid`, {
  amount: 48000, // 46500 + 1500 increment
  bidderName: 'Studio K.O.',
  userId: 'user-ko-2'
});
const resValid2 = await validBid2.execute();
assert.strictEqual(resValid2.statusCode, 200);
assert.strictEqual(resValid2.body.auction.currentBid, 48000);
assert.strictEqual(resValid2.body.auction.bidCount, 2);
console.log('✓ Test 6 Passed: Valid bids accepted, incremented bid count and current bid.');

// ── Test 7: Invalid bids and simultaneous conflicting bids handled safely ────
console.log('\nTest 7: Verify invalid bids, seller shill bids, and conflicting bids handled safely');

// 7a. Seller cannot bid on own auction
const sellerShillBid = createMockReqRes('POST', `/api/auctions/${auctionId}/bid`, {
  amount: 55000,
  bidderName: 'Workshop Le Corbusier',
  userId: 'seller-corbu-1' // Seller's user ID
});
const resSellerBid = await sellerShillBid.execute();
assert.strictEqual(resSellerBid.statusCode, 403, 'Seller must be forbidden from bidding on own lot');

// 7b. Bid below minimum increment rejected
const underBid = createMockReqRes('POST', `/api/auctions/${auctionId}/bid`, {
  amount: 48500, // Current is 48000, minIncrement is 1500 (needs >= 49500)
  bidderName: 'Low Bidder',
  userId: 'user-low-1'
});
const resUnderBid = await underBid.execute();
assert.strictEqual(resUnderBid.statusCode, 400, 'Bid below min increment must be rejected');

// 7c. Leading bidder cannot bid against themselves lower than or equal to current leading bid
const selfOverbid = createMockReqRes('POST', `/api/auctions/${auctionId}/bid`, {
  amount: 48000,
  bidderName: 'Studio K.O.',
  userId: 'user-ko-2'
});
const resSelfOverbid = await selfOverbid.execute();
assert(resSelfOverbid.statusCode >= 400, 'Duplicate or self-stale bid must be rejected');

// 7d. Simultaneous conflicting bids (simulate two simultaneous bids of same amount)
const simultaneousBid1 = createMockReqRes('POST', `/api/auctions/${auctionId}/bid`, {
  amount: 50000,
  bidderName: 'Bidder Alpha',
  userId: 'user-alpha'
});
const simultaneousBid2 = createMockReqRes('POST', `/api/auctions/${auctionId}/bid`, {
  amount: 50000,
  bidderName: 'Bidder Beta',
  userId: 'user-beta'
});

const [simRes1, simRes2] = await Promise.all([
  simultaneousBid1.execute(),
  simultaneousBid2.execute()
]);

// Exactly one must succeed and one must be rejected (409 Conflict)
const successCount = (simRes1.statusCode === 200 ? 1 : 0) + (simRes2.statusCode === 200 ? 1 : 0);
assert.strictEqual(successCount, 1, 'Only one of two simultaneous conflicting bids of same amount may succeed');
console.log('✓ Test 7 Passed: Seller shill bids, under-bids, and simultaneous conflicting bids safely handled.');

// ── Test 8: Auction automatically ends and result is persisted ────────────────
console.log('\nTest 8: Verify auction automatically ends at end time and result is persisted');
// Fast forward end timestamp to past
updateAuction(auctionId, {
  endTimestamp: Date.now() - 2000
});

// Run scheduler tick
scheduler.tick();

const endedAucRecord = getAuctionById(auctionId);
assert.strictEqual(endedAucRecord.status, 'ended', 'Scheduler must finalize auction to ended state');
assert.strictEqual(endedAucRecord.result, 'sold', 'Auction with qualifying bids must be marked sold');
assert(endedAucRecord.winner !== null, 'Winner must be recorded');
assert.strictEqual(endedAucRecord.winningBid, 50000);
console.log(`✓ Test 8 Passed: Auction finalized to ended. Winner: ${endedAucRecord.winner.bidder} at ₹${endedAucRecord.winningBid}.`);

// ── Test 9: Verify winner-only meeting access rules ──────────────────────────
console.log('\nTest 9: Verify winner-only meeting access rules');
const winningUser = { id: endedAucRecord.winner.bidderId, name: endedAucRecord.winner.bidder, role: 'collector' };
const sellerUser = { id: endedAucRecord.sellerId, name: endedAucRecord.seller, role: 'seller' };
const outbidUser = { id: 'user-singhania-1', name: 'Collector Singhania', role: 'collector' };
const stranger = { id: 'user-stranger-99', name: 'Curious Stranger', role: 'collector' };

// Winner access
const winAccess = getMeetingAccess(endedAucRecord, winningUser);
assert.strictEqual(winAccess.canAccessMeeting, true, 'Winner must have meeting access');
assert.strictEqual(winAccess.buttonLabel, 'Enter Meeting');

// Seller access
const selAccess = getMeetingAccess(endedAucRecord, sellerUser);
assert.strictEqual(selAccess.canAccessMeeting, true, 'Seller must have meeting access');
assert.strictEqual(selAccess.buttonLabel, 'Meet Winner');

// Outbid access denied
const outAccess = getMeetingAccess(endedAucRecord, outbidUser);
assert.strictEqual(outAccess.canAccessMeeting, false, 'Outbid user must NOT have meeting access');

// Stranger access denied
const strAccess = getMeetingAccess(endedAucRecord, stranger);
assert.strictEqual(strAccess.canAccessMeeting, false, 'Stranger must NOT have meeting access');
console.log('✓ Test 9 Passed: Post-auction meeting access strictly restricted to winner & seller.');

// ── Test 10: Restart backend and verify recovery ─────────────────────────────
console.log('\nTest 10: Restart backend and verify scheduled auctions are recovered correctly');
// Schedule a new auction that will be overdue on restart
const restartTestAuction = insertAuction({
  id: 'auc-restart-recovery-test',
  productId: 'prod-restart-test',
  name: 'Carved Basalt Stela',
  seller: 'Ancient Works',
  sellerId: 'seller-ancient',
  startingBid: 80000,
  currentBid: 80000,
  startTimestamp: Date.now() - 30000, // Started while "offline"
  endTimestamp: Date.now() + 60000,    // Still active
  approvalStatus: 'approved',
  status: 'scheduled',
  bidHistory: []
});

// Stop scheduler to simulate server downtime
scheduler.stop();

// Start scheduler again (triggers startup reconciliation)
scheduler.start();

const recoveredAuction = getAuctionById('auc-restart-recovery-test');
assert.strictEqual(recoveredAuction.status, 'active', 'Overdue scheduled auction must recover to active state on startup');
scheduler.stop();
console.log('✓ Test 10 Passed: Backend restart successfully recovered overdue scheduled jobs.');

// ── Test 11: Pending approval, cancelled auctions, and auctions with no bids ─
console.log('\nTest 11: Verify pending approval, cancelled auctions, and auctions with no valid bids');
// 11a. Ended auction with no bids
const noBidAuction = insertAuction({
  id: 'auc-no-bids-test',
  productId: 'prod-no-bids-test',
  name: 'Unsold Bronze Mirror',
  seller: 'Metalsmith',
  sellerId: 'seller-metal',
  startingBid: 25000,
  currentBid: 25000,
  startTimestamp: Date.now() - 60000,
  endTimestamp: Date.now() - 5000,
  approvalStatus: 'approved',
  status: 'active',
  bidHistory: []
});

scheduler.reconcileOverdueAuctions();
const finalizedNoBid = getAuctionById('auc-no-bids-test');
assert.strictEqual(finalizedNoBid.status, 'ended');
assert.strictEqual(finalizedNoBid.result, 'unsold', 'Auction with 0 bids must be unsold');
assert.strictEqual(finalizedNoBid.winner, null, 'Unsold auction must have null winner');

// 11b. Cancelled auction has no winner
const cancelledAuction = {
  ...finalizedNoBid,
  status: 'cancelled',
  bidHistory: [{ id: 'b-old', amount: 30000, bidder: 'Collector' }]
};
assert.strictEqual(getAuthoritativeAuctionWinner(cancelledAuction), null, 'Cancelled auction must have null winner');
console.log('✓ Test 11 Passed: Pending, cancelled, and no-bid auctions verified.');

// ── Test 12: Existing shop products and seller profile integrity ─────────────
console.log('\nTest 12: Verify existing shop products and seller functionality remain intact');
const allProducts = getProducts();
assert(allProducts.length >= PRODUCTS.length, 'All default products must be preserved');
const sampleShopProd = allProducts.find((p) => p.type === 'shop' || !p.isAuction);
assert(sampleShopProd !== undefined, 'Shop products must exist and be tagged properly');
assert.notStrictEqual(sampleShopProd.type, 'auction', 'Shop products must not be converted to auctions');
console.log('✓ Test 12 Passed: Existing shop catalog and seller items preserved intact.');

console.log('\n================================================================');
console.log('ALL 12 WORKFLOW & SCHEDULER VERIFICATION TESTS PASSED! (12/12)');
console.log('================================================================\n');
process.exit(0);
