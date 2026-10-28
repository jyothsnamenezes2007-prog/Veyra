import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { initDatabase, getProductById, getAuctionById } from './server/db.js';
import { handleApiRequest } from './server/api.js';
import {
  verifyProductImage,
  isImageAuthorized,
  invalidateImageVerification,
  clearVerificationRegistry
} from './server/imageVerification.js';

console.log('================================================================');
console.log('--- STARTING VEYRA QWEN3-VL IMAGE VERIFICATION TEST SUITE ---');
console.log('================================================================\n');

// Mock HTTP Request / Response helper
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

// 1x1 clean PNG transparent pixel data URL for genuine test photo
const VALID_PRODUCT_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Unsuitable test image (distinct base64 bytes tagged with blurry / unreadable marker)
const REJECTED_UNSUITABLE_IMAGE =
  'data:image/png;base64,' + Buffer.from('blurry_unreadable_corrupt_test_image_bytes').toString('base64');

// Manipulated test image (distinct base64 bytes tagged with watermark marker)
const REJECTED_WATERMARKED_IMAGE =
  'data:image/png;base64,' + Buffer.from('manipulated_watermark_test_image_bytes').toString('base64');

// In-process handler implementing Qwen3-VL verification heuristics
function setupInProcessQwenHandler() {
  globalThis.__QWEN_INPROCESS_HANDLER__ = async (payload) => {
    const messages = payload?.messages || [];
    let imageUrl = '';
    let promptText = '';

    for (const msg of messages) {
      const content = msg.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === 'image_url') {
            imageUrl = item.image_url?.url || '';
          } else if (item.type === 'text') {
            promptText += item.text + ' ';
          }
        }
      }
    }

    let decoded = '';
    try {
      decoded = Buffer.from(imageUrl.replace(/^data:image\/[^;]+;base64,/, ''), 'base64').toString('utf8');
    } catch (e) {}

    const checkText = (imageUrl + ' ' + decoded).toLowerCase();

    // Check for failure triggers in image URL or image bytes
    if (checkText.includes('blurry') || checkText.includes('unreadable') || checkText.includes('corrupt') || checkText.includes('watermark') || checkText.includes('manipulated')) {
      return {
        available: true,
        decision: {
          verified: false,
          readable: !(checkText.includes('blurry') || checkText.includes('unreadable')),
          clearProduct: !(checkText.includes('unreadable') || checkText.includes('corrupt')),
          suspiciousArtifacts: checkText.includes('manipulated'),
          watermarks: checkText.includes('watermark'),
          confidence: 'high',
          reason: 'Image verification failed: Image contains visible watermarks, low clarity, or signs of manipulation unsuitable for a genuine listing.'
        }
      };
    }

    // Default genuine product pass
    return {
      available: true,
      decision: {
        verified: true,
        readable: true,
        clearProduct: true,
        suspiciousArtifacts: false,
        watermarks: false,
        confidence: 'high',
        reason: 'Product is clearly visible in genuine physical form with acceptable catalog clarity and no suspicious manipulation.'
      }
    };
  };
}

async function runTests() {
  try {
    initDatabase();
    clearVerificationRegistry();

    console.log('Initializing Qwen3-VL-8B-Instruct inference engine verification suite...');
    setupInProcessQwenHandler();
    console.log('✓ Qwen3-VL inference engine ready.\n');

    // ── Scenario 1: A suitable product photo receives verified status ───────────────
    console.log('Scenario 1: Suitable product photo receives verified status');
    const reqRes1 = createMockReqRes('POST', '/api/verify-image', { image: VALID_PRODUCT_IMAGE });
    const res1 = await reqRes1.execute();
    console.log('res1 result:', res1.statusCode, res1.body);

    assert.strictEqual(res1.statusCode, 200, 'Should return status 200 for verification call');
    assert.strictEqual(res1.body.success, true, 'Verification response must be successful');
    assert.strictEqual(res1.body.verified, true, 'Image must be verified as true');
    assert.strictEqual(res1.body.message, 'Image Verified — You can proceed.', 'Must output exact success message');
    assert.ok(res1.body.token && res1.body.token.startsWith('vtok-'), 'Must provide authoritative verification token');
    const validToken = res1.body.token;
    console.log('✓ Scenario 1 Passed: Suitable image received green verified state with token: ' + validToken.slice(0, 16) + '...\n');

    // ── Scenario 2: Unreadable or unsuitable image is rejected ──────────────────────
    console.log('Scenario 2: Unreadable or unsuitable image is rejected');
    const reqRes2 = createMockReqRes('POST', '/api/verify-image', { image: REJECTED_UNSUITABLE_IMAGE });
    const res2 = await reqRes2.execute();

    assert.ok(res2.statusCode === 200 || res2.statusCode === 400, 'Should return status 200/400 for verification assessment');
    assert.strictEqual(res2.body.verified, false, 'Unsuitable image must not be verified');
    assert.strictEqual(
      res2.body.error,
      'Image verification failed. Please upload a clearer, genuine product photo.',
      'Must output exact rejection message'
    );
    assert.strictEqual(res2.body.token, undefined, 'No verification token should be issued for rejected image');
    console.log('✓ Scenario 2 Passed: Unsuitable image rejected with exact required warning message.\n');

    // ── Scenario 3: Prevent direct API requests from bypassing verification ────────
    console.log('Scenario 3: Direct API submission with unverified image is blocked');
    const UNVERIFIED_IMAGE =
      'data:image/png;base64,' + Buffer.from('unverified_fresh_photo_content_999').toString('base64');

    const unverifiedShopPayload = {
      name: 'Direct Bypass Attempt Chair',
      seller: 'Shady Studio',
      price: 25000,
      image: UNVERIFIED_IMAGE
    };

    const reqRes3 = createMockReqRes('POST', '/api/products', unverifiedShopPayload);
    const res3 = await reqRes3.execute();

    assert.strictEqual(res3.statusCode, 400, 'Direct submission without verification must be rejected with 400');
    assert.strictEqual(res3.body.success, false);
    assert.strictEqual(
      res3.body.error,
      'Product image verification required. The uploaded image must pass verification before listing submission.'
    );
    console.log('✓ Scenario 3 Passed: Server-authoritative check blocked unverified direct API listing.\n');

    // ── Scenario 4: Submission succeeds with verified image and valid token ─────────
    console.log('Scenario 4: Submission succeeds with verified image and valid token');
    const verifiedShopPayload = {
      name: 'Archival Verified Artisan Table',
      seller: 'Studio Jeanneret',
      sellerId: 'artisan-1',
      price: 48000,
      image: VALID_PRODUCT_IMAGE,
      images: [VALID_PRODUCT_IMAGE],
      verificationToken: validToken,
      category: 'Handmade',
      description: 'Handcrafted teak table with authentic joinery.'
    };

    const reqRes4 = createMockReqRes('POST', '/api/products', verifiedShopPayload);
    const res4 = await reqRes4.execute();

    assert.strictEqual(res4.statusCode, 201, 'Verified listing must be accepted with 201 Created');
    assert.strictEqual(res4.body.success, true);
    assert.strictEqual(res4.body.product.listingStatus, 'pending', 'Must start in pending approval workflow');
    const createdProdId = res4.body.product.id;
    console.log('✓ Scenario 4 Passed: Verified listing accepted; entered pending curator approval status.\n');

    // ── Scenario 5: Replacing image invalidates previous verification ──────────────
    console.log('Scenario 5: Replacing an image invalidates previous result');
    const MODIFIED_IMAGE =
      'data:image/png;base64,' + Buffer.from('different_tampered_replacement_bytes_123').toString('base64');

    // Attacker tries to submit a different image using the previously issued validToken
    const tamperedPayload = {
      name: 'Tampered Image Table',
      seller: 'Studio Jeanneret',
      sellerId: 'artisan-1',
      price: 48000,
      image: MODIFIED_IMAGE,
      verificationToken: validToken,
      description: 'Modified image submission.'
    };

    const reqRes5 = createMockReqRes('POST', '/api/products', tamperedPayload);
    const res5 = await reqRes5.execute();

    assert.strictEqual(res5.statusCode, 400, 'Tampered image mismatch must be rejected with 400');
    assert.strictEqual(res5.body.success, false);
    assert.strictEqual(
      res5.body.error,
      'Product image verification required. The uploaded image must pass verification before listing submission.'
    );
    console.log('✓ Scenario 5 Passed: Tampered or replaced image correctly rejected because hash does not match token.\n');

    // ── Scenario 6: Model-service error / service offline handling ──────────────────
    console.log('Scenario 6: Model service unavailable or error handling');
    // Disable in-process handler and point to offline port to test service unavailable error path
    globalThis.__QWEN_INPROCESS_HANDLER__ = null;
    process.env.QWEN_VL_ENDPOINT = 'http://127.0.0.1:59999/v1/chat/completions';

    const reqRes6 = createMockReqRes('POST', '/api/verify-image', {
      image: 'data:image/png;base64,' + Buffer.from('offline_service_test_bytes_777').toString('base64')
    });
    const res6 = await reqRes6.execute();

    assert.strictEqual(res6.statusCode, 503, 'Should return status 503 when inference service is down');
    assert.strictEqual(res6.body.success, false);
    assert.strictEqual(res6.body.verified, false, 'Service failure must never result in false verified state');
    assert.strictEqual(res6.body.unavailable, true, 'Flag unavailable must be true');
    assert.strictEqual(
      res6.body.error,
      'Verification is temporarily unavailable. Please try again.',
      'Must output exact unavailable message'
    );
    console.log('✓ Scenario 6 Passed: Unavailable service safely returned exact required message and refused verification.\n');

    // Restore handler
    setupInProcessQwenHandler();

    // ── Scenario 7: Unsupported format and size limits ─────────────────────────────
    console.log('Scenario 7: Unsupported file formats and oversized images');
    // Unsupported format: GIF
    const reqRes7a = createMockReqRes('POST', '/api/verify-image', {
      image: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    });
    const res7a = await reqRes7a.execute();
    assert.strictEqual(res7a.statusCode, 400);
    assert.strictEqual(res7a.body.verified, false);
    assert.ok(res7a.body.error.includes('Unsupported image format'));

    // Oversized image (> 5MB)
    const largeBuffer = Buffer.alloc(5.2 * 1024 * 1024, 0);
    const reqRes7b = createMockReqRes('POST', '/api/verify-image', {
      image: `data:image/jpeg;base64,${largeBuffer.toString('base64')}`
    });
    const res7b = await reqRes7b.execute();
    assert.strictEqual(res7b.statusCode, 400);
    assert.strictEqual(res7b.body.verified, false);
    assert.ok(res7b.body.error.includes('5MB'));
    console.log('✓ Scenario 7 Passed: Invalid formats and oversized files rejected by server validation.\n');

    // ── Scenario 8: Existing seller approval workflow preserved ────────────────────
    console.log('Scenario 8: Existing curator/seller approval workflow preserved');
    const reqRes8Approve = createMockReqRes('POST', `/api/products/${createdProdId}/approve`);
    const res8Approve = await reqRes8Approve.execute();
    assert.strictEqual(res8Approve.statusCode, 200);
    assert.strictEqual(res8Approve.body.product.listingStatus, 'active', 'Curator approval transitions product to active');
    console.log('✓ Scenario 8 Passed: Verified product successfully approved and transitioned to active status.\n');

    console.log('================================================================');
    console.log('ALL 8 IMAGE VERIFICATION SCENARIO TESTS PASSED! (8/8)');
    console.log('================================================================\n');
  } finally {
    clearVerificationRegistry();
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
