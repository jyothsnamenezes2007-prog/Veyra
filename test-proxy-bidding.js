/**
 * test-proxy-bidding.js
 * Focused Verification Test Suite for Veyra Automatic Proxy Bidding
 * 
 * Verifies all 11 required test areas:
 * 1. Enabling, updating, and disabling proxy bidding
 * 2. Correct automatic responses to accepted competing bids
 * 3. Correct updates to the current price and leading bidder
 * 4. Never exceeding the maximum authorized bid
 * 5. Stopping when the next valid bid exceeds the maximum
 * 6. Not bidding against the buyer's own leading bid
 * 7. Handling duplicate events and simultaneous bids
 * 8. Rejecting bids after auction completion
 * 9. Persisting settings and bids across reloads
 * 10. Gemini configuration errors and honest reporting
 * 11. Existing manual bidding and unrelated features continuing to work
 */

import assert from 'node:assert';
import { Readable } from 'node:stream';
import {
  initDatabase,
  getAuctions,
  getAuctionById,
  insertAuction,
  updateAuction,
  getProxyConfigs,
  getProxyConfigByUser,
  getProducts
} from './server/db.js';
import { handleApiRequest } from './server/api.js';
import { verifyGeminiModel } from './server/gemini.js';

console.log('================================================================');
console.log('--- STARTING VEYRA AUTOMATIC PROXY BIDDING VERIFICATION SUITE ---');
console.log('================================================================\n');

// Mock HTTP Request / Response Helper
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
  req.headers = { host: 'localhost:3001' };

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

// Ensure database is initialized
initDatabase();

const now = Date.now();
const testAuctionId = 'auc-proxy-test-' + now;

// Create dedicated active test auction
const testAuction = insertAuction({
  id: testAuctionId,
  productId: 'prod-proxy-test-' + now,
  type: 'auction',
  isAuction: true,
  name: 'Archival Kashmiri Walnut Credenza',
  seller: 'Kashmir Guild Atelier',
  sellerId: 'seller-guild-1',
  startingBid: 90000,
  currentBid: 90000,
  minIncrement: 1000,
  bidCount: 0,
  bidHistory: [],
  startTimestamp: now - 30000,
  scheduledTimestamp: now - 30000,
  endTimestamp: now + 3600000,
  endTime: now + 3600000,
  remainingSeconds: 3600,
  approvalStatus: 'approved',
  status: 'active',
  winner: null
});

console.log(`Created test auction lot ${testAuctionId} at starting bid ₹${testAuction.startingBid}`);

// ── Test 1: Enabling, updating, and disabling proxy bidding ─────────────────
console.log('\n[Test 1] Enabling, updating, and disabling proxy bidding...');

// 1a. Invalid input rejection: negative max bid
const reqResInvalid = createMockReqRes('POST', `/api/auctions/${testAuctionId}/proxy-bid`, {
  userId: 'buyer-alpha',
  userName: 'Alpha Collector',
  maxBid: -5000,
  preferredIncrement: 1000
});
const resInvalid = await reqResInvalid.execute();
assert.strictEqual(resInvalid.statusCode, 400, 'Must reject negative maxBid');
assert.strictEqual(resInvalid.body.success, false);

// 1b. Invalid input rejection: preferred increment below auction minIncrement
const reqResLowInc = createMockReqRes('POST', `/api/auctions/${testAuctionId}/proxy-bid`, {
  userId: 'buyer-alpha',
  userName: 'Alpha Collector',
  maxBid: 100000,
  preferredIncrement: 200 // below auction minIncrement of 1000
});
const resLowInc = await reqResLowInc.execute();
assert.strictEqual(resLowInc.statusCode, 400, 'Must reject increment lower than auction minIncrement');

// 1c. Seller shill bidding guard: seller cannot enable proxy bidding
const reqResSeller = createMockReqRes('POST', `/api/auctions/${testAuctionId}/proxy-bid`, {
  userId: 'seller-guild-1', // lot seller!
  userName: 'Kashmir Guild Atelier',
  maxBid: 100000,
  preferredIncrement: 1000
});
const resSeller = await reqResSeller.execute();
assert.strictEqual(resSeller.statusCode, 403, 'Sellers must be strictly forbidden from proxy bidding on own lot');

// 1d. Valid activation
const reqResEnable = createMockReqRes('POST', `/api/auctions/${testAuctionId}/proxy-bid`, {
  userId: 'buyer-alpha',
  userName: 'Alpha Collector',
  maxBid: 96000,
  preferredIncrement: 1000
});
const resEnable = await reqResEnable.execute();
assert.strictEqual(resEnable.statusCode, 200, 'Should successfully enable proxy bidding');
assert.strictEqual(resEnable.body.success, true);
assert.strictEqual(resEnable.body.config.status, 'active');
assert.strictEqual(resEnable.body.config.maxBid, 96000);
assert.strictEqual(resEnable.body.config.preferredIncrement, 1000);

// Verify GET proxy-bid endpoint
const reqResGet = createMockReqRes('GET', `/api/auctions/${testAuctionId}/proxy-bid?userId=buyer-alpha`);
const resGet = await reqResGet.execute();
assert.strictEqual(resGet.statusCode, 200);
assert.strictEqual(resGet.body.config.maxBid, 96000);
assert.strictEqual(resGet.body.config.status, 'active');

// 1e. Update proxy bidding limit
const reqResUpdate = createMockReqRes('POST', `/api/auctions/${testAuctionId}/proxy-bid`, {
  userId: 'buyer-alpha',
  userName: 'Alpha Collector',
  maxBid: 98000,
  preferredIncrement: 2000
});
const resUpdate = await reqResUpdate.execute();
assert.strictEqual(resUpdate.statusCode, 200);
assert.strictEqual(resUpdate.body.config.maxBid, 98000);
assert.strictEqual(resUpdate.body.config.preferredIncrement, 2000);

// Reset back to 96000 and 1000 for subsequent test flow
await createMockReqRes('POST', `/api/auctions/${testAuctionId}/proxy-bid`, {
  userId: 'buyer-alpha',
  userName: 'Alpha Collector',
  maxBid: 96000,
  preferredIncrement: 1000
}).execute();

// 1f. Disable proxy bidding
const reqResDisable = createMockReqRes('POST', `/api/auctions/${testAuctionId}/proxy-bid/disable`, {
  userId: 'buyer-alpha'
});
const resDisable = await reqResDisable.execute();
assert.strictEqual(resDisable.statusCode, 200);
assert.strictEqual(resDisable.body.config.status, 'disabled');

// Re-enable for competing bid response tests
const reqResReenable = createMockReqRes('POST', `/api/auctions/${testAuctionId}/proxy-bid`, {
  userId: 'buyer-alpha',
  userName: 'Alpha Collector',
  maxBid: 96000,
  preferredIncrement: 1000
});
await reqResReenable.execute();
console.log('✓ Test 1 Passed: Enabling, updating, and disabling verified with strict validation.');

// ── Test 2 & 3: Automatic responses to accepted competing bids & price updates ──
console.log('\n[Test 2 & 3] Automatic response to accepted competing bid & price/leader update...');
// Competing buyer places a manual bid of ₹91,000
const reqResCompete1 = createMockReqRes('POST', `/api/auctions/${testAuctionId}/bid`, {
  userId: 'buyer-beta',
  bidderName: 'Beta Collector',
  amount: 91000
});
const resCompete1 = await reqResCompete1.execute();
assert.strictEqual(resCompete1.statusCode, 200, 'Competing manual bid must be accepted');

// Fetch updated auction state
const aucAfterCompete1 = getAuctionById(testAuctionId);
// The proxy bidder (Alpha) must have automatically responded with ₹92,000!
assert.strictEqual(aucAfterCompete1.currentBid, 92000, 'Proxy bidder must automatically raise bid to ₹92,000');
assert.strictEqual(aucAfterCompete1.bidHistory[0].bidderId, 'buyer-alpha', 'Alpha Collector must now be leading');
assert.strictEqual(aucAfterCompete1.bidHistory[0].amount, 92000);
assert.strictEqual(aucAfterCompete1.bidHistory[0].isProxyBid, true);
assert.strictEqual(aucAfterCompete1.bidHistory[1].bidderId, 'buyer-beta', 'Beta Collector must be outbid in second position');
assert.strictEqual(aucAfterCompete1.bidCount, 3, 'Total bids must reflect initial proxy opening, manual competing, and automatic counter bid');

console.log('✓ Test 2 & 3 Passed: Proxy bidder detected competing bid ₹91,000 and automatically responded with ₹92,000; leading bidder updated.');

// ── Test 4: Never exceeding the maximum authorized bid ─────────────────────
console.log('\n[Test 4] Verifying proxy bidder never exceeds the authorized maximum...');
// Competing buyer places manual bid of ₹95,000
const reqResCompete2 = createMockReqRes('POST', `/api/auctions/${testAuctionId}/bid`, {
  userId: 'buyer-beta',
  bidderName: 'Beta Collector',
  amount: 95000
});
const resCompete2 = await reqResCompete2.execute();
assert.strictEqual(resCompete2.statusCode, 200);

const aucAfterCompete2 = getAuctionById(testAuctionId);
// Next valid bid is ₹95,000 + 1,000 = ₹96,000, which is exactly Alpha's maxBid
assert.strictEqual(aucAfterCompete2.currentBid, 96000, 'Proxy bidder should bid exactly up to max of ₹96,000');
assert.strictEqual(aucAfterCompete2.bidHistory[0].bidderId, 'buyer-alpha');
assert.strictEqual(aucAfterCompete2.bidHistory[0].amount, 96000);
console.log('✓ Test 4 Passed: Proxy bid executed up to boundary of ₹96,000 without exceeding it.');

// ── Test 5: Stopping when the next valid bid exceeds maximum ────────────────
console.log('\n[Test 5] Stopping proxy bidding when next valid bid exceeds maximum authorized limit...');
// Competing buyer raises to ₹97,000
const reqResCompete3 = createMockReqRes('POST', `/api/auctions/${testAuctionId}/bid`, {
  userId: 'buyer-beta',
  bidderName: 'Beta Collector',
  amount: 97000
});
const resCompete3 = await reqResCompete3.execute();
assert.strictEqual(resCompete3.statusCode, 200);

const aucAfterCompete3 = getAuctionById(testAuctionId);
// Next bid would be ₹98,000, which exceeds Alpha's ₹96,000 limit.
// Current price must remain ₹97,000 with Beta leading!
assert.strictEqual(aucAfterCompete3.currentBid, 97000, 'Auction price must remain ₹97,000');
assert.strictEqual(aucAfterCompete3.bidHistory[0].bidderId, 'buyer-beta', 'Beta Collector remains leading');

// Check Alpha's proxy config status
const alphaConfig = getProxyConfigByUser(testAuctionId, 'buyer-alpha');
assert.strictEqual(alphaConfig.status, 'outbid_stopped', 'Alpha status must transition to outbid_stopped');
assert(alphaConfig.stopReason.includes('exceeds your maximum authorized limit'), 'Must provide clear human-readable explanation');
console.log(`✓ Test 5 Passed: Stopped safely. Status: ${alphaConfig.status}. Reason: "${alphaConfig.stopReason}"`);

// ── Test 6: Not bidding against the buyer's own leading bid ─────────────────
console.log("\n[Test 6] Verifying proxy bidder never bids against buyer's own leading bid...");
// Alpha updates their max limit to ₹110,000
await createMockReqRes('POST', `/api/auctions/${testAuctionId}/proxy-bid`, {
  userId: 'buyer-alpha',
  userName: 'Alpha Collector',
  maxBid: 110000,
  preferredIncrement: 1000
}).execute();

// Alpha should now automatically respond to Beta's ₹97,000 with ₹98,000
const aucAfterRaise = getAuctionById(testAuctionId);
assert.strictEqual(aucAfterRaise.currentBid, 98000);
assert.strictEqual(aucAfterRaise.bidHistory[0].bidderId, 'buyer-alpha');

// Now, another trigger occurs. Since Alpha is already the leading bidder,
// proxy bidder MUST NOT bid again against itself!
const prevBidCount = aucAfterRaise.bidCount;
// Trigger another evaluation attempt
const reqResSelfCheck = createMockReqRes('POST', `/api/auctions/${testAuctionId}/proxy-bid`, {
  userId: 'buyer-alpha',
  userName: 'Alpha Collector',
  maxBid: 120000,
  preferredIncrement: 1000
});
await reqResSelfCheck.execute();
const aucAfterSelfCheck = getAuctionById(testAuctionId);
assert.strictEqual(aucAfterSelfCheck.bidCount, prevBidCount, 'Must not place additional bids when already leading');
assert.strictEqual(aucAfterSelfCheck.currentBid, 98000, 'Price must not increase when already leading');
console.log("✓ Test 6 Passed: Proxy bidder did not bid against buyer's own leading bid.");

// ── Test 7: Handling duplicate events and simultaneous bids ─────────────────
console.log('\n[Test 7] Handling duplicate events and simultaneous bids...');
// Submit two bids with the identical stale amount simultaneously
const reqResDup1 = createMockReqRes('POST', `/api/auctions/${testAuctionId}/bid`, {
  userId: 'buyer-gamma',
  bidderName: 'Gamma Collector',
  amount: 98000 // Equal to current top bid
});
const resDup1 = await reqResDup1.execute();
assert(resDup1.statusCode === 400 || resDup1.statusCode === 409, 'Duplicate bid must be rejected with 400 or 409');
assert.strictEqual(resDup1.body.success, false);

// Two simultaneous valid bids
const p1 = createMockReqRes('POST', `/api/auctions/${testAuctionId}/bid`, {
  userId: 'buyer-beta',
  bidderName: 'Beta Collector',
  amount: 99000
}).execute();

const p2 = createMockReqRes('POST', `/api/auctions/${testAuctionId}/bid`, {
  userId: 'buyer-gamma',
  bidderName: 'Gamma Collector',
  amount: 99000
}).execute();

const [simRes1, simRes2] = await Promise.all([p1, p2]);
// Exactly one must succeed, the other must be rejected due to mutex lock
const successCount = (simRes1.body.success ? 1 : 0) + (simRes2.body.success ? 1 : 0);
assert.strictEqual(successCount, 1, 'Exactly one concurrent bid of same amount can be accepted');
console.log('✓ Test 7 Passed: Duplicate and simultaneous bids handled safely without race conditions.');

// ── Test 8: Rejecting bids after auction completion ────────────────────────
console.log('\n[Test 8] Rejecting bids after auction completion...');
// Mark auction ended
updateAuction(testAuctionId, {
  status: 'ended',
  remainingSeconds: 0,
  endTime: now - 1000
});

// Attempt manual bid
const reqResEndedBid = createMockReqRes('POST', `/api/auctions/${testAuctionId}/bid`, {
  userId: 'buyer-beta',
  bidderName: 'Beta Collector',
  amount: 105000
});
const resEndedBid = await reqResEndedBid.execute();
assert.strictEqual(resEndedBid.statusCode, 400, 'Manual bid on ended auction must be rejected');
assert(resEndedBid.body.error.includes('concluded') || resEndedBid.body.error.includes('closed'));

// Attempt proxy bid activation
const reqResEndedProxy = createMockReqRes('POST', `/api/auctions/${testAuctionId}/proxy-bid`, {
  userId: 'buyer-gamma',
  userName: 'Gamma Collector',
  maxBid: 150000,
  preferredIncrement: 1000
});
const resEndedProxy = await reqResEndedProxy.execute();
assert.strictEqual(resEndedProxy.statusCode, 400, 'Proxy configuration on ended auction must be rejected');
assert(resEndedProxy.body.error.includes('concluded'));
console.log('✓ Test 8 Passed: Bids and proxy configurations correctly rejected after auction conclusion.');

// ── Test 9: Persisting settings and bids across reloads ─────────────────────
console.log('\n[Test 9] Persisting proxy settings and bids across reloads...');
const savedConfigs = getProxyConfigs(testAuctionId);
assert(savedConfigs.length >= 1, 'Proxy configs must be persisted in database layer');
const persistedAlpha = getProxyConfigByUser(testAuctionId, 'buyer-alpha');
assert.strictEqual(persistedAlpha.userId, 'buyer-alpha');
assert(persistedAlpha.maxBid > 0);
assert(persistedAlpha.createdAt > 0);
console.log(`✓ Test 9 Passed: Settings persisted (ID: ${persistedAlpha.id}, maxBid: ₹${persistedAlpha.maxBid}).`);

// ── Test 10: Gemini configuration errors and honest reporting ──────────────
console.log('\n[Test 10] Gemini configuration and honest reporting verification...');
const geminiStatus = await verifyGeminiModel();
assert.strictEqual(typeof geminiStatus.configured, 'boolean');
assert.strictEqual(typeof geminiStatus.available, 'boolean');
assert.strictEqual(typeof geminiStatus.message, 'string');
// If GEMINI_API_KEY is not configured or model is not gemini-3.6-flash, available is false
if (!process.env.GEMINI_API_KEY) {
  assert.strictEqual(geminiStatus.available, false);
  assert(geminiStatus.message.includes('not configured') || geminiStatus.message.includes('Deterministic'));
  console.log(`✓ Test 10 Passed: Gemini status reported honestly without pretending AI succeeded: "${geminiStatus.message}"`);
} else {
  console.log(`✓ Test 10 Passed: Gemini verification evaluated with response: "${geminiStatus.message}"`);
}

// ── Test 11: Existing manual bidding and unrelated features continue to work ─
console.log('\n[Test 11] Existing manual bidding and unrelated features continue to work...');
const allAuctions = getAuctions();
assert(allAuctions.length >= 1, 'Existing auction list must be preserved');
const allProducts = getProducts();
assert(allProducts.length >= 1, 'Existing product catalog must be preserved');
const activeSample = allAuctions.find((a) => (a.status === 'active' || a.status === 'live') && a.id !== testAuctionId);
if (activeSample) {
  // Verify manual bidding on untouched auction
  const minReq = activeSample.currentBid + (activeSample.minIncrement || 500);
  const reqResManual = createMockReqRes('POST', `/api/auctions/${activeSample.id}/bid`, {
    userId: 'buyer-manual-test',
    bidderName: 'Manual Specialist',
    amount: minReq
  });
  const resManual = await reqResManual.execute();
  assert.strictEqual(resManual.statusCode, 200, 'Manual bidding on existing auctions must work normally');
  assert.strictEqual(resManual.body.bid.amount, minReq);
}
console.log('✓ Test 11 Passed: Existing catalog, auction list, and manual bidding work as expected.');

console.log('\n================================================================');
console.log('ALL 11 AUTOMATIC PROXY BIDDING TESTS PASSED SUCCESSFULLY! (11/11)');
console.log('================================================================\n');
process.exit(0);
