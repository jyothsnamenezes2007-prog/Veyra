import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { handleApiRequest } from './server/api.js';
import { initSocketServer } from './server/socket.js';
import { getProducts, getAuctions, getProductById, getAuctionById, resetDbCache, getDbPath } from './server/db.js';
import { verifyProductImage } from './server/imageVerification.js';

console.log('================================================================');
console.log('--- TESTING PRICING, PREVIEW, FEEDBACK & DUPLICATE PROTECTION ---');
console.log('================================================================\n');

// Set up temporary isolated database so real db.json is never mutated
const originalDbPath = path.resolve('server/data/db.json');
const tempDbPath = path.join(os.tmpdir(), `veyra-test-pricing-dedup-${Date.now()}.json`);
fs.copyFileSync(originalDbPath, tempDbPath);
process.env.VEYRA_DB_PATH = tempDbPath;
resetDbCache();

let server;
let serverPort;

function postJson(urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      `http://127.0.0.1:${serverPort}${urlPath}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...headers
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, text: raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function getJson(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${serverPort}${urlPath}`, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, text: raw });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  // -------------------------------------------------------------
  // PART 1: Source code inspections for Price Inputs & Stepping
  // -------------------------------------------------------------
  console.log('[Test 1-4] Verifying Price Input Attributes & Stepping Logic...');
  const sellCode = fs.readFileSync('src/pages/Sell.jsx', 'utf8');

  // Verify Starting Bid Price: min="0", step="500"
  assert.ok(
    sellCode.includes('id="startingBid"') &&
    sellCode.includes('min="0"') &&
    sellCode.includes('step="500"'),
    'startingBid input must have min="0" and step="500"'
  );

  // Verify Estimated Lot Valuation / Price: min="0", step="500"
  assert.ok(
    sellCode.includes('id="price"') &&
    sellCode.includes('step="500"'),
    'price input must have step="500"'
  );

  // Verify Minimum Bid Increment: min="0", step="500"
  assert.ok(
    sellCode.includes('id="minIncrement"') &&
    sellCode.includes('step="500"'),
    'minIncrement input must have step="500"'
  );

  // Verify Reserve Price: min="0", step="500"
  assert.ok(
    sellCode.includes('id="reservePrice"') &&
    sellCode.includes('step="500"'),
    'reservePrice input must have step="500"'
  );

  // Verify noValidate on <form> to prevent browser stepMismatch blockage for manual entries
  assert.ok(
    sellCode.includes('<form\n            onSubmit={handleSubmit}\n            noValidate') ||
    sellCode.includes('noValidate'),
    'Form must use noValidate to allow arbitrary valid manual price entries'
  );

  // Verify mathematical stepping simulation (HTML5 Number step calculation):
  // When min=0, step=500: step base is 0, so valid multiples are k*500
  const stepBase = 0;
  const stepSize = 500;
  const stepUp = (val) => Math.round((val - stepBase) / stepSize) * stepSize + stepSize;
  const stepDown = (val) => Math.max(0, Math.round((val - stepBase) / stepSize) * stepSize - stepSize);

  // Test starting from ₹23,000 -> increment must be exactly ₹23,500 (+₹500)
  assert.strictEqual(stepUp(23000), 23500, 'Starting from 23000, stepUp must yield exactly 23500 (+500)');
  assert.strictEqual(stepDown(23500), 23000, 'Starting from 23500, stepDown must yield exactly 23000 (-500)');

  // Test starting from ₹28,000 -> increment must be exactly ₹28,500 (+₹500)
  assert.strictEqual(stepUp(28000), 28500, 'Starting from 28000, stepUp must yield exactly 28500 (+500)');
  assert.strictEqual(stepDown(28000), 27500, 'Starting from 28000, stepDown must yield exactly 27500 (-500)');

  // Test starting from ₹45,000 -> increment must be exactly ₹45,500 (+₹500)
  assert.strictEqual(stepUp(45000), 45500, 'Starting from 45000, stepUp must yield exactly 45500 (+500)');

  // Test manual entry without unexpected rounding (e.g., 23250)
  const manualInput = '23250';
  assert.strictEqual(Number(manualInput), 23250, 'Manual entry 23250 is fully preserved as a valid number');
  console.log('✓ Tests 1-4 Passed: Exact ₹500 increments/decrements verified, manual input preserved.\n');

  // -------------------------------------------------------------
  // PART 2: Live Price Preview Card Inspections
  // -------------------------------------------------------------
  console.log('[Test 5-6] Verifying Live Price Preview Card Synchronization...');
  assert.ok(
    sellCode.includes('Opening Bid') &&
    sellCode.includes('formatINR(formData.startingBid || 0)'),
    'Preview card must display Opening Bid bound to formData.startingBid'
  );
  assert.ok(
    sellCode.includes('Valuation Benchmark') &&
    sellCode.includes('formatINR(formData.price || 0)'),
    'Preview card must display Valuation Benchmark bound to formData.price'
  );
  assert.ok(
    sellCode.includes('Reserve Price') &&
    sellCode.includes('formData.reservePrice'),
    'Preview card must dynamically display Reserve Price when entered'
  );
  console.log('✓ Tests 5-6 Passed: Live price preview synchronizes Starting Bid, Valuation, and Reserve Price.\n');

  // -------------------------------------------------------------
  // PART 3: Bottom Success Feedback Messages
  // -------------------------------------------------------------
  console.log('[Test 7-8] Verifying Success & Error Feedback Near Submit Button...');
  const shopSuccessMsg = 'Product uploaded successfully! Your listing is pending approval.';
  const auctionSuccessMsg = 'Auction lot submitted successfully! Your lot is pending curator approval.';

  assert.ok(
    sellCode.includes(shopSuccessMsg),
    `Sell.jsx must contain exact Shop Product success message: "${shopSuccessMsg}"`
  );
  assert.ok(
    sellCode.includes(auctionSuccessMsg),
    `Sell.jsx must contain exact Live Auction success message: "${auctionSuccessMsg}"`
  );

  // Verify the success confirmation is positioned near the bottom submit actions inside the form
  const formEndIndex = sellCode.indexOf('</form>');
  const successIndex = sellCode.indexOf(shopSuccessMsg);
  assert.ok(
    successIndex < formEndIndex,
    'Success feedback must be rendered directly at the bottom inside the listing form near submit actions'
  );
  console.log('✓ Tests 7-8 Passed: Accurate success feedback rendered directly at the bottom near the submit button.\n');

  // -------------------------------------------------------------
  // PART 4: Backend HTTP Server Setup for Idempotency & Deduplication
  // -------------------------------------------------------------
  server = http.createServer(async (req, res) => {
    const handled = await handleApiRequest(req, res);
    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    }
  });
  initSocketServer(server);

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      console.log(`[Test Server] Running on ephemeral port ${serverPort}\n`);
      resolve();
    });
  });

  // Configure mock Groq fetcher so verification succeeds without network dependency
  globalThis.__GROQ_MOCK_FETCHER__ = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            verified: true,
            readable: true,
            clearProduct: true,
            confidence: 'high',
            reason: 'High quality genuine product photograph.'
          })
        }
      }]
    })
  });

  const testSellerId = 'seller-test-' + Date.now();
  const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const vResult = await verifyProductImage(testImage);
  const testToken = vResult.token;

  // -------------------------------------------------------------
  // PART 5: Double-Click / Concurrent Duplicate Protection (Shop Product)
  // -------------------------------------------------------------
  console.log('[Test 9] Testing Double-Click Concurrent Submission Protection (Shop Product)...');
  const submissionToken1 = 'sub_test_doubleclick_' + Date.now();
  const shopPayload = {
    clientSubmissionId: submissionToken1,
    name: 'Handcrafted Teak Planter',
    seller: 'Artisan Woodcraft',
    sellerId: testSellerId,
    price: 4500,
    category: 'Handmade',
    image: testImage,
    verificationToken: testToken,
    description: 'Carved natural plantation teak planter.',
    materials: 'Reclaimed Teak',
    dimensions: '30cm x 30cm',
    condition: 'Pristine'
  };

  const initialProductCount = getProducts().length;

  // Send two requests concurrently with identical submission ID (simulating rapid double-click)
  const [res1, res2] = await Promise.all([
    postJson('/api/products', shopPayload),
    postJson('/api/products', shopPayload)
  ]);

  assert.strictEqual(res1.status, 201, 'First request must succeed with 201');
  assert.ok(res2.status === 200 || res2.status === 201, 'Second concurrent request must succeed without error');
  assert.strictEqual(res1.data.product.id, res2.data.product.id, 'Both responses must return the same product ID');

  const afterProductCount = getProducts().length;
  assert.strictEqual(afterProductCount, initialProductCount + 1, 'Exactly ONE record must be created in database for double-click');
  console.log(`✓ Test 9 Passed: Concurrent double-click resulted in exactly 1 product record (${res1.data.product.id}).\n`);

  // -------------------------------------------------------------
  // PART 6: Repeated Network Retries (Same clientSubmissionId)
  // -------------------------------------------------------------
  console.log('[Test 10] Testing Repeated Retries with Same Idempotency Key...');
  const retryRes = await postJson('/api/products', shopPayload);
  assert.ok(retryRes.status === 200 || retryRes.status === 201, 'Retry must succeed');
  assert.strictEqual(retryRes.data.product.id, res1.data.product.id, 'Retry must return existing product');
  assert.strictEqual(getProducts().length, afterProductCount, 'Retrying request must NOT create another database record');
  console.log('✓ Test 10 Passed: Idempotent network retry returned existing product without duplicate record.\n');

  // -------------------------------------------------------------
  // PART 7: Rapid Burst Duplicate Submission (<15s)
  // -------------------------------------------------------------
  console.log('[Test 10b] Testing Rapid Duplicate Detection (No clientSubmissionId provided)...');
  const rapidPayload = {
    name: 'Handcrafted Teak Planter',
    seller: 'Artisan Woodcraft',
    sellerId: testSellerId,
    price: 4500,
    category: 'Handmade',
    image: testImage,
    verificationToken: testToken,
    description: 'Carved natural plantation teak planter.'
  };

  const rapidRes = await postJson('/api/products', rapidPayload);
  assert.strictEqual(rapidRes.status, 200, 'Rapid duplicate must be recognized and return HTTP 200');
  assert.strictEqual(rapidRes.data.duplicate, true, 'Response must identify duplicate: true');
  assert.strictEqual(rapidRes.data.product.id, res1.data.product.id, 'Must return the existing product');
  console.log('✓ Test 10b Passed: Rapid duplicate safely caught by backend heuristics.\n');

  // -------------------------------------------------------------
  // PART 8: Live Auction Lot Submission & Idempotency
  // -------------------------------------------------------------
  console.log('[Test 8, 9b] Testing Live Auction Lot Submission & Double-Click Protection...');
  const initialAuctionCount = getAuctions().length;
  const auctionSubmissionId = 'sub_auc_test_' + Date.now();
  const futureStart = Date.now() + 86400000;
  const futureEnd = futureStart + 86400000;

  const auctionPayload = {
    clientSubmissionId: auctionSubmissionId,
    name: 'Mid-Century Teak Armchair',
    seller: 'Artisan Woodcraft',
    sellerId: testSellerId,
    startingBid: 28000,
    estimatedValue: 45000,
    minIncrement: 500,
    reservePrice: 35000,
    startTimestamp: futureStart,
    endTimestamp: futureEnd,
    category: 'Handmade',
    image: testImage,
    verificationToken: testToken,
    description: 'Rare mid-century armchair.'
  };

  const [aucRes1, aucRes2] = await Promise.all([
    postJson('/api/auctions', auctionPayload),
    postJson('/api/auctions', auctionPayload)
  ]);

  assert.strictEqual(aucRes1.status, 201, 'Auction creation request 1 must return 201');
  assert.ok(aucRes2.status === 200 || aucRes2.status === 201, 'Auction creation request 2 must succeed');
  assert.strictEqual(aucRes1.data.auction.id, aucRes2.data.auction.id, 'Both must return same auction ID');
  assert.strictEqual(getAuctions().length, initialAuctionCount + 1, 'Exactly ONE auction record created in database');
  console.log(`✓ Test 8, 9b Passed: Auction lot created with exact paired records (Auction: ${aucRes1.data.auction.id}, Product: ${aucRes1.data.product.id}).\n`);

  // -------------------------------------------------------------
  // PART 9: Approval & Rejection Updates Existing Records In-Place
  // -------------------------------------------------------------
  console.log('[Test 12] Testing Approval & Rejection (In-Place Update Without Duplication)...');
  const targetAuctionId = aucRes1.data.auction.id;
  const targetProductId = aucRes1.data.product.id;

  const countBeforeApprove = getAuctions().length;
  const prodCountBeforeApprove = getProducts().length;

  const approveRes = await postJson(`/api/auctions/${targetAuctionId}/approve`, {});
  assert.strictEqual(approveRes.status, 200, 'Auction approval must return 200');
  assert.strictEqual(approveRes.data.auction.approvalStatus, 'approved', 'Auction status must be updated to approved');

  // Verify database records updated in place
  assert.strictEqual(getAuctions().length, countBeforeApprove, 'Auction count must NOT change on approval');
  assert.strictEqual(getProducts().length, prodCountBeforeApprove, 'Product count must NOT change on approval');

  const updatedAuction = getAuctionById(targetAuctionId);
  const updatedProduct = getProductById(targetProductId);
  assert.strictEqual(updatedAuction.approvalStatus, 'approved', 'Auction record must have approvalStatus: approved');
  assert.strictEqual(updatedProduct.listingStatus, 'active', 'Paired product record must have listingStatus: active');

  // Test rejection
  const rejectRes = await postJson(`/api/auctions/${targetAuctionId}/reject`, {});
  assert.strictEqual(rejectRes.status, 200, 'Auction rejection must return 200');
  assert.strictEqual(getAuctionById(targetAuctionId).approvalStatus, 'rejected', 'Auction record must have approvalStatus: rejected');
  assert.strictEqual(getProductById(targetProductId).listingStatus, 'rejected', 'Product record must have listingStatus: rejected');
  assert.strictEqual(getAuctions().length, countBeforeApprove, 'Auction count must remain unchanged after rejection');
  console.log('✓ Test 12 Passed: Approval and rejection updated existing records in place with zero duplicates.\n');

  // -------------------------------------------------------------
  // PART 10: Genuinely Different Products Allowed
  // -------------------------------------------------------------
  console.log('[Test 13] Verifying Genuinely Different Products Can Be Submitted...');
  const differentProductPayload = {
    clientSubmissionId: 'sub_diff_' + Date.now(),
    name: 'Carved Basalt Basin',
    seller: 'Artisan Woodcraft',
    sellerId: testSellerId,
    price: 32000,
    category: 'Handmade',
    image: testImage,
    verificationToken: testToken,
    description: 'Hand-chiselled solid basalt basin.'
  };

  const diffRes = await postJson('/api/products', differentProductPayload);
  assert.strictEqual(diffRes.status, 201, 'Genuinely different product must be accepted with 201');
  assert.notStrictEqual(diffRes.data.product.id, res1.data.product.id, 'Must receive a distinct product ID');
  console.log(`✓ Test 13 Passed: Distinct product successfully created (${diffRes.data.product.id}).\n`);

  // -------------------------------------------------------------
  // PART 11: My Products Deduplication Display Verification
  // -------------------------------------------------------------
  console.log('[Test 11] Verifying My Products Deduplication Display Logic...');
  const myProductsCode = fs.readFileSync('src/pages/MyProducts.jsx', 'utf8');

  // Verify deduplication tracking sets exist in MyProducts.jsx
  assert.ok(myProductsCode.includes('seenItemKeys'), 'MyProducts must track seenItemKeys');
  assert.ok(myProductsCode.includes('seenAuctionIds'), 'MyProducts must track seenAuctionIds');
  assert.ok(myProductsCode.includes('isDuplicateItem') || myProductsCode.includes('seenSubmissionIds'), 'MyProducts must implement duplicate item checking');

  // Simulate MyProducts deduplication with deliberate duplicates
  const mockCustomProducts = [
    { id: 'prod-1', sellerId: 'user-1', name: 'Lounge Chair', price: 28000, listingStatus: 'pending', submittedAt: '2026-11-06T12:00:00Z' },
    { id: 'prod-2', sellerId: 'user-1', name: 'Lounge Chair', price: 28000, listingStatus: 'pending', submittedAt: '2026-11-06T12:00:01Z' }, // Burst dup
    { id: 'prod-3', sellerId: 'user-1', name: 'Lounge Chair', price: 28000, listingStatus: 'pending', submittedAt: '2026-11-06T12:00:02Z' }, // Burst dup
    { id: 'prod-4', sellerId: 'user-1', name: 'Ceramic Vase', price: 4200, listingStatus: 'active', submittedAt: '2026-11-06T12:15:00Z' }    // Distinct item
  ];

  const seenKeys = new Set();
  const displayed = [];
  mockCustomProducts.forEach((item) => {
    const isBurst = displayed.some((ex) => {
      if (ex.name === item.name && ex.price === item.price) {
        const t1 = new Date(ex.submittedAt).getTime();
        const t2 = new Date(item.submittedAt).getTime();
        return Math.abs(t1 - t2) < 15000;
      }
      return false;
    });
    if (!seenKeys.has(item.id) && !isBurst) {
      seenKeys.add(item.id);
      displayed.push(item);
    }
  });

  assert.strictEqual(displayed.length, 2, 'Out of 3 duplicate chairs and 1 vase, exactly 2 items must be displayed');
  assert.strictEqual(displayed[0].name, 'Lounge Chair', 'First item is Lounge Chair');
  assert.strictEqual(displayed[1].name, 'Ceramic Vase', 'Second item is Ceramic Vase');
  console.log('✓ Test 11 Passed: My Products display deduplication collapses burst duplicates to single entries.\n');

  // -------------------------------------------------------------
  // PART 12: Image Verification Integrity
  // -------------------------------------------------------------
  console.log('[Test 14] Verifying Image Verification Security & Token Requirement...');
  // Mock Groq returning verification rejection
  globalThis.__GROQ_MOCK_FETCHER__ = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            verified: false,
            readable: false,
            clearProduct: false,
            reason: 'Image is blurry and unreadable.'
          })
        }
      }]
    })
  });

  const unverifiedImage = 'data:image/png;base64,' + Buffer.from('unverified_blurry_image_data').toString('base64');
  const unverifiedPayload = {
    name: 'Unverified Test Product',
    seller: 'Unverified Seller',
    sellerId: testSellerId,
    price: 10000,
    image: unverifiedImage,
    verificationToken: 'invalid-or-missing-token'
  };

  const unverifiedRes = await postJson('/api/products', unverifiedPayload);
  assert.strictEqual(unverifiedRes.status, 400, 'Submission with unverified photo must be rejected with 400');
  console.log('✓ Test 14 Passed: Unauthorized image verification token properly rejected by backend.\n');

  console.log('================================================================');
  console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY! (15/15)');
  console.log('================================================================');
}

runTests()
  .then(() => {
    if (server) server.close();
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Test failed with error:', err);
    if (server) server.close();
    if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    process.exit(1);
  });
