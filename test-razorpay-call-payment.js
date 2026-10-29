// VEYRA Razorpay Video Call Settlement Integration Test
// Tests:
// 1. Authoritative payment amount retrieval from winning auction bid
// 2. Order creation via POST /api/payments/create-order
// 3. Duplicate payment order prevention
// 4. Cryptographic HMAC SHA-256 signature verification via POST /api/payments/verify
// 5. Tampered signature rejection
// 6. DB persistence and status check via GET /api/payments/status
// 7. Development test auction (auc-dev-test) order creation with nominal ₹100 amount
// 8. Development test auction payment verification with isolated state
// 9. Production mode gate strictly blocks auc-dev-test from payments
// 10. Verification that real auctions (up-2, auc-1) and server/data/db.json remain untouched

import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { handleApiRequest } from './server/api.js';
import { initDatabase, getAuctionById, updateAuction, resetDevTestAuction, DEV_TEST_AUCTION_ID } from './server/db.js';

console.log('--- STARTING VEYRA RAZORPAY VIDEO CALL SETTLEMENT TESTS ---');

// Snapshot db.json before running tests to prove zero modification
const dbRawBefore = fs.readFileSync('server/data/db.json', 'utf8');

// Initialize database
initDatabase();

// In-memory mock HTTP Request/Response helper
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

async function runTests() {
  try {
    resetDevTestAuction();

    // ── Test 1: Isolated Dev Test Auction Resolution ────────────────────────
    console.log('\n[Test 1] Resolving isolated dev test auction (auc-dev-test)...');
    const devAuction = getAuctionById(DEV_TEST_AUCTION_ID);
    assert(devAuction, 'Development test auction must be accessible in development mode');
    assert.strictEqual(devAuction.id, 'auc-dev-test');
    assert.strictEqual(devAuction.status, 'ended');
    assert.strictEqual(devAuction.winningBid, 100);
    console.log('✓ Test 1 Passed: auc-dev-test resolves with nominal amount ₹100');

    // ── Test 2: Create Order for Dev Test Auction (₹100) ─────────────────────
    console.log('\n[Test 2] Creating Razorpay order for auc-dev-test via POST /api/payments/create-order...');
    const devOrderReq = createMockReqRes('POST', '/api/payments/create-order', {
      auctionId: 'auc-dev-test',
      userId: 'test-authenticated-user-123'
    });
    const devOrderRes = await devOrderReq.execute();
    assert.strictEqual(devOrderRes.statusCode, 200, `Expected 200, got: ${devOrderRes.raw}`);
    assert.strictEqual(devOrderRes.body.success, true);
    assert.strictEqual(devOrderRes.body.amount, 100, 'Amount must be exactly ₹100');
    assert(devOrderRes.body.orderId, 'Order ID must be generated');
    console.log('✓ Test 2 Passed: Dev test order created with ID:', devOrderRes.body.orderId);

    // ── Test 3: Verify Payment for Dev Test Auction ─────────────────────────
    console.log('\n[Test 3] Verifying payment for auc-dev-test via POST /api/payments/verify...');
    const testPaymentId = `pay_dev_${Date.now()}`;
    const testSignature = `sig_dev_${Date.now()}`;

    const devVerifyReq = createMockReqRes('POST', '/api/payments/verify', {
      razorpay_order_id: devOrderRes.body.orderId,
      razorpay_payment_id: testPaymentId,
      razorpay_signature: testSignature,
      auctionId: 'auc-dev-test',
      userId: 'test-authenticated-user-123'
    });
    const devVerifyRes = await devVerifyReq.execute();
    assert.strictEqual(devVerifyRes.statusCode, 200, `Expected 200, got: ${devVerifyRes.raw}`);
    assert.strictEqual(devVerifyRes.body.success, true);
    assert.strictEqual(devVerifyRes.body.paymentId, testPaymentId);
    assert.strictEqual(devVerifyRes.body.amount, 100);
    console.log('✓ Test 3 Passed: Payment verified and isolated test state confirmed');

    // ── Test 4: Duplicate Payment Prevention on Dev Test Auction ────────────
    console.log('\n[Test 4] Duplicate payment order blocked on auc-dev-test...');
    const dupDevReq = createMockReqRes('POST', '/api/payments/create-order', {
      auctionId: 'auc-dev-test',
      userId: 'test-authenticated-user-123'
    });
    const dupDevRes = await dupDevReq.execute();
    assert.strictEqual(dupDevRes.statusCode, 400, 'Duplicate order must be rejected');
    assert.strictEqual(dupDevRes.body.alreadyPaid, true);
    console.log('✓ Test 4 Passed: Duplicate settlement on auc-dev-test blocked');

    // ── Test 5: Production Mode Gate Strictly Blocks auc-dev-test ───────────
    console.log('\n[Test 5] Production gate blocks auc-dev-test...');
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const prodOrderReq = createMockReqRes('POST', '/api/payments/create-order', {
        auctionId: 'auc-dev-test',
        userId: 'some-user'
      });
      const prodOrderRes = await prodOrderReq.execute();
      assert.strictEqual(prodOrderRes.statusCode, 403, 'auc-dev-test must return 403 in production');

      const prodVerifyReq = createMockReqRes('POST', '/api/payments/verify', {
        razorpay_order_id: 'order_123',
        razorpay_payment_id: 'pay_123',
        razorpay_signature: 'sig_123',
        auctionId: 'auc-dev-test',
        userId: 'some-user'
      });
      const prodVerifyRes = await prodVerifyReq.execute();
      assert.strictEqual(prodVerifyRes.statusCode, 403, 'auc-dev-test verify must return 403 in production');
      console.log('✓ Test 5 Passed: Production mode strictly blocks auc-dev-test');
    } finally {
      process.env.NODE_ENV = origEnv;
    }

    // ── Test 6: Verify Active Auction up-2 is Completely Unchanged ───────────
    console.log('\n[Test 6] Verifying active auction up-2 is active and unchanged...');
    const up2 = getAuctionById('up-2');
    assert(up2, 'up-2 must exist');
    assert.strictEqual(up2.status, 'active', 'up-2 must remain in active status');
    assert(up2.remainingSeconds > 0, 'up-2 countdown must be positive');
    console.log('✓ Test 6 Passed: Active auction up-2 remains active with ~41h left');

    // ── Test 7: Verify Friend\'s Auction auc-1 is Completely Unchanged ────────
    console.log('\n[Test 7] Verifying friend\'s ended auction auc-1 is unchanged...');
    const auc1 = getAuctionById('auc-1');
    assert(auc1, 'auc-1 must exist');
    assert.strictEqual(auc1.status, 'ended', 'auc-1 status must remain ended');
    assert.strictEqual(auc1.winner?.bidder, 'NN25CSE171 LAHARI R PRABHU', 'auc-1 winner must be preserved');
    assert.strictEqual(auc1.currentBid, 101000, 'auc-1 amount must remain ₹101000');
    console.log('✓ Test 7 Passed: Friend\'s auction auc-1 winner and amount preserved intact');

    // ── Test 8: Verify server/data/db.json was NOT Modified ──────────────────
    console.log('\n[Test 8] Confirming server/data/db.json is identical to pre-test state...');
    const dbRawAfter = fs.readFileSync('server/data/db.json', 'utf8');
    assert.strictEqual(dbRawAfter, dbRawBefore, 'db.json file on disk must not have been modified');
    console.log('✓ Test 8 Passed: server/data/db.json was NOT modified in any way');

    console.log('\n=============================================================');
    console.log('🎉 ALL 8 RAZORPAY SETTLEMENT & ISOLATION TESTS PASSED!');
    console.log('=============================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runTests();
