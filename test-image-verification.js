import assert from 'node:assert';
import { Readable } from 'node:stream';
import { initDatabase, getProductById, getAuctionById } from './server/db.js';
import { handleApiRequest } from './server/api.js';
import {
  verifyProductImage,
  isImageAuthorized,
  invalidateImageVerification,
  clearVerificationRegistry,
  getGroqConfig
} from './server/imageVerification.js';

console.log('================================================================');
console.log('--- STARTING VEYRA GROQ VISION API TEST SUITE ---');
console.log('================================================================\n');

// Mock HTTP Request / Response helper for API endpoint testing
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

// Manipulated test image
const TAMPERED_IMAGE =
  'data:image/png;base64,' + Buffer.from('different_tampered_replacement_bytes_888').toString('base64');

// Helper to create mock OpenAI-compatible chat completion responses for Groq
function createMockCompletion(contentObject, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      id: 'chatcmpl-groq-' + Math.random().toString(36).slice(2),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'qwen/qwen3.8-27b',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: typeof contentObject === 'string' ? contentObject : JSON.stringify(contentObject)
          },
          finish_reason: 'stop'
        }
      ]
    }),
    text: async () => typeof contentObject === 'string' ? contentObject : JSON.stringify(contentObject)
  };
}

async function runTests() {
  const originalEnvKey = process.env.GROQ_API_KEY;
  const originalEnvUrl = process.env.GROQ_API_BASE_URL;
  const originalEnvModel = process.env.GROQ_VISION_MODEL;

  try {
    initDatabase();
    clearVerificationRegistry();

    // Set test environment configuration
    process.env.GROQ_API_KEY = 'gsk_test_secret_api_key_9988';
    process.env.GROQ_API_BASE_URL = 'https://api.groq.com/openai/v1';
    process.env.GROQ_VISION_MODEL = 'qwen/qwen3.8-27b';

    // Verify config helper
    const config = getGroqConfig();
    assert.strictEqual(config.hasValidKey, true);
    assert.strictEqual(config.apiKey, 'gsk_test_secret_api_key_9988');
    assert.strictEqual(config.endpoint, 'https://api.groq.com/openai/v1/chat/completions');
    assert.strictEqual(config.model, 'qwen/qwen3.8-27b');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 1: Successful Groq vision API response (returns verified + token)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('Test 1: Successful Groq vision API response returns verified + token');
    let lastCapturedRequest = null;

    globalThis.__GROQ_MOCK_FETCHER__ = async (url, options) => {
      lastCapturedRequest = { url, options, body: JSON.parse(options.body) };
      return createMockCompletion({
        verified: true,
        readable: true,
        clearProduct: true,
        suspiciousArtifacts: false,
        watermarks: false,
        confidence: 'high',
        reason: 'Product is clearly depicted with high quality catalog presentation.'
      });
    };

    const reqRes1 = createMockReqRes('POST', '/api/verify-image', {
      image: VALID_PRODUCT_IMAGE,
      title: 'Handcrafted Teak Table',
      description: 'Solid teak table with dovetail joinery.',
      category: 'Furniture'
    });
    const res1 = await reqRes1.execute();

    assert.strictEqual(res1.statusCode, 200, 'Should return status 200 for successful verification');
    assert.strictEqual(res1.body.success, true);
    assert.strictEqual(res1.body.verified, true);
    assert.strictEqual(res1.body.message, 'Image Verified — You can proceed.');
    assert.ok(res1.body.token && res1.body.token.startsWith('vtok-'), 'Must issue vtok- verification token');
    const validToken = res1.body.token;

    // Verify outbound request shape matched Groq OpenAI chat completions spec
    assert.strictEqual(lastCapturedRequest.url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.strictEqual(lastCapturedRequest.options.headers.Authorization, 'Bearer gsk_test_secret_api_key_9988');
    assert.strictEqual(lastCapturedRequest.body.model, 'qwen/qwen3.8-27b');
    assert.ok(Array.isArray(lastCapturedRequest.body.messages));
    assert.strictEqual(lastCapturedRequest.body.messages[0].content[1].type, 'image_url');
    // Verify prompt included product details
    assert.ok(lastCapturedRequest.body.messages[0].content[0].text.includes('Handcrafted Teak Table'));
    console.log('✓ Test 1 Passed: Genuine image verified with authoritative token: ' + validToken.slice(0, 16) + '...\n');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 2: Flagged/suspicious image response (returns verified: false)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('Test 2: Flagged/suspicious image response is rejected');
    globalThis.__GROQ_MOCK_FETCHER__ = async () => {
      return createMockCompletion({
        verified: false,
        readable: false,
        clearProduct: false,
        suspiciousArtifacts: true,
        watermarks: true,
        confidence: 'high',
        reason: 'Image is unreadable and exhibits heavy watermark overlays.'
      });
    };

    const reqRes2 = createMockReqRes('POST', '/api/verify-image', { image: REJECTED_UNSUITABLE_IMAGE });
    const res2 = await reqRes2.execute();

    assert.ok(res2.statusCode === 200 || res2.statusCode === 400);
    assert.strictEqual(res2.body.verified, false);
    assert.strictEqual(res2.body.error, 'Image verification failed. Please upload a clearer, genuine product photo.');
    assert.strictEqual(res2.body.token, undefined);
    assert.strictEqual(res2.body.unavailable, false);
    console.log('✓ Test 2 Passed: Suspicious image flagged and rejected without issuing a token.\n');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 3: Missing or invalid image payload
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('Test 3: Missing or invalid image payload handling');
    // 3a. Missing image in request body
    const res3a = await createMockReqRes('POST', '/api/verify-image', { image: '' }).execute();
    assert.strictEqual(res3a.statusCode, 400);
    assert.strictEqual(res3a.body.success, false);
    assert.strictEqual(res3a.body.verified, false);

    // 3b. Unsupported format (e.g. GIF)
    const res3b = await createMockReqRes('POST', '/api/verify-image', {
      image: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    }).execute();
    assert.strictEqual(res3b.statusCode, 400);
    assert.strictEqual(res3b.body.verified, false);
    assert.ok(res3b.body.error.includes('Unsupported image format'));

    // 3c. Oversized image (> 5MB)
    const largeBuffer = Buffer.alloc(5.2 * 1024 * 1024, 0);
    const res3c = await createMockReqRes('POST', '/api/verify-image', {
      image: `data:image/jpeg;base64,${largeBuffer.toString('base64')}`
    }).execute();
    assert.strictEqual(res3c.statusCode, 400);
    assert.strictEqual(res3c.body.verified, false);
    assert.ok(res3c.body.error.includes('5MB'));
    console.log('✓ Test 3 Passed: Missing image, invalid format, and oversized payloads cleanly blocked.\n');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 4: Missing or placeholder API key (returns unavailable: true, 503)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('Test 4: Missing or placeholder API key safely marks service unavailable');
    // Set to placeholder
    process.env.GROQ_API_KEY = 'your_groq_api_key_here';
    const configPlaceholder = getGroqConfig();
    assert.strictEqual(configPlaceholder.hasValidKey, false);

    const testUnavailImage = 'data:image/png;base64,' + Buffer.from('missing_key_test_bytes_123').toString('base64');
    const res4 = await createMockReqRes('POST', '/api/verify-image', { image: testUnavailImage }).execute();

    assert.strictEqual(res4.statusCode, 503, 'Must return 503 when API key is placeholder');
    assert.strictEqual(res4.body.success, false);
    assert.strictEqual(res4.body.verified, false);
    assert.strictEqual(res4.body.unavailable, true);
    assert.strictEqual(res4.body.error, 'Verification is temporarily unavailable. Please try again.');
    console.log('✓ Test 4 Passed: Missing/placeholder API key returns exact required 503 unavailable message.\n');

    // Restore test API key
    process.env.GROQ_API_KEY = 'gsk_test_secret_api_key_9988';

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 5: Timeout, rate limit (429), and auth error handling
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('Test 5: Timeout, rate limit (429), and auth error handling');
    // 5a. Rate limit (429)
    globalThis.__GROQ_MOCK_FETCHER__ = async () => ({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
      json: async () => ({ error: { message: 'Too Many Requests' } })
    });
    const res5a = await createMockReqRes('POST', '/api/verify-image', {
      image: 'data:image/png;base64,' + Buffer.from('rate_limit_test_bytes_321').toString('base64')
    }).execute();
    assert.strictEqual(res5a.statusCode, 503);
    assert.strictEqual(res5a.body.unavailable, true);
    assert.strictEqual(res5a.body.error, 'Verification is temporarily unavailable. Please try again.');

    // 5b. Auth failure (401)
    globalThis.__GROQ_MOCK_FETCHER__ = async () => ({
      ok: false,
      status: 401,
      text: async () => 'Invalid credentials',
      json: async () => ({ error: { message: 'Unauthorized' } })
    });
    const res5b = await createMockReqRes('POST', '/api/verify-image', {
      image: 'data:image/png;base64,' + Buffer.from('auth_fail_test_bytes_654').toString('base64')
    }).execute();
    assert.strictEqual(res5b.statusCode, 503);
    assert.strictEqual(res5b.body.unavailable, true);

    // 5c. Network timeout exception
    globalThis.__GROQ_MOCK_FETCHER__ = async () => {
      throw new Error('Connect timeout after 25000ms');
    };
    const res5c = await createMockReqRes('POST', '/api/verify-image', {
      image: 'data:image/png;base64,' + Buffer.from('timeout_test_bytes_987').toString('base64')
    }).execute();
    assert.strictEqual(res5c.statusCode, 503);
    assert.strictEqual(res5c.body.unavailable, true);
    assert.strictEqual(res5c.body.error, 'Verification is temporarily unavailable. Please try again.');
    console.log('✓ Test 5 Passed: Rate limits, auth errors, and timeouts return 503 unavailable.\n');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 6: Invalid or unexpected API response (returns 503)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('Test 6: Invalid or unexpected API response format handling');
    // 6a. Malformed non-JSON completion
    globalThis.__GROQ_MOCK_FETCHER__ = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'This is not valid json at all' } }]
      }),
      text: async () => 'raw text'
    });
    const res6a = await createMockReqRes('POST', '/api/verify-image', {
      image: 'data:image/png;base64,' + Buffer.from('invalid_json_test_bytes_111').toString('base64')
    }).execute();
    assert.strictEqual(res6a.statusCode, 503);
    assert.strictEqual(res6a.body.unavailable, true);
    assert.strictEqual(res6a.body.error, 'Verification is temporarily unavailable. Please try again.');

    // 6b. Empty choices structure
    globalThis.__GROQ_MOCK_FETCHER__ = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
      text: async () => '{}'
    });
    const res6b = await createMockReqRes('POST', '/api/verify-image', {
      image: 'data:image/png;base64,' + Buffer.from('empty_choices_test_bytes_222').toString('base64')
    }).execute();
    assert.strictEqual(res6b.statusCode, 503);
    assert.strictEqual(res6b.body.unavailable, true);
    console.log('✓ Test 6 Passed: Unparseable responses and malformed payloads handled gracefully.\n');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 7: Seller-upload flow correctly enforcing verification results
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('Test 7: Seller upload flow and curator workflow enforcement');
    // 7a. Legitimate submission with verified image and valid token
    const verifiedUploadPayload = {
      name: 'Archival Teak Armchair',
      seller: 'Pierre Jeanneret Atelier',
      sellerId: 'artisan-jeanneret',
      price: 65000,
      image: VALID_PRODUCT_IMAGE,
      images: [VALID_PRODUCT_IMAGE],
      verificationToken: validToken,
      category: 'Handmade',
      description: 'Handcrafted teak armchair with cane weaving.'
    };

    const res7a = await createMockReqRes('POST', '/api/products', verifiedUploadPayload).execute();
    assert.strictEqual(res7a.statusCode, 201, 'Verified product must be accepted with 201 Created');
    assert.strictEqual(res7a.body.success, true);
    assert.strictEqual(res7a.body.product.listingStatus, 'pending', 'Must start in pending status awaiting curator review');
    const createdProductId = res7a.body.product.id;

    // 7b. Tampered image payload (using validToken with different image bytes)
    const tamperedPayload = {
      name: 'Tampered Teak Armchair',
      seller: 'Pierre Jeanneret Atelier',
      price: 65000,
      image: TAMPERED_IMAGE,
      verificationToken: validToken
    };
    // Rejection response for the tampered image
    globalThis.__GROQ_MOCK_FETCHER__ = async () => {
      return createMockCompletion({
        verified: false,
        reason: 'Tampered image does not match verified token.'
      });
    };
    const res7b = await createMockReqRes('POST', '/api/products', tamperedPayload).execute();
    assert.strictEqual(res7b.statusCode, 400, 'Tampered image mismatch must be rejected with 400');
    assert.strictEqual(res7b.body.success, false);

    // 7c. Direct upload with rejected image
    const res7c = await createMockReqRes('POST', '/api/products', {
      name: 'Unverified Junk Product',
      seller: 'Unknown',
      price: 1000,
      image: REJECTED_UNSUITABLE_IMAGE
    }).execute();
    assert.strictEqual(res7c.statusCode, 400);
    assert.strictEqual(res7c.body.success, false);

    // 7d. Curator approval preserves existing workflow
    const res7d = await createMockReqRes('POST', `/api/products/${createdProductId}/approve`).execute();
    assert.strictEqual(res7d.statusCode, 200);
    assert.strictEqual(res7d.body.product.listingStatus, 'active', 'Curator approval moves product to active');
    console.log('✓ Test 7 Passed: Product upload enforcement and curator approval flow fully verified.\n');

    console.log('================================================================');
    console.log('ALL 7 GROQ VISION API TEST CASES PASSED SUCCESSFULLY!');
    console.log('================================================================\n');
  } finally {
    delete globalThis.__GROQ_MOCK_FETCHER__;
    delete globalThis.__QWEN_MOCK_FETCHER__;
    clearVerificationRegistry();
    if (originalEnvKey !== undefined) process.env.GROQ_API_KEY = originalEnvKey;
    else delete process.env.GROQ_API_KEY;
    if (originalEnvUrl !== undefined) process.env.GROQ_API_BASE_URL = originalEnvUrl;
    else delete process.env.GROQ_API_BASE_URL;
    if (originalEnvModel !== undefined) process.env.GROQ_VISION_MODEL = originalEnvModel;
    else delete process.env.GROQ_VISION_MODEL;
  }
}

runTests().catch((err) => {
  console.error('Test suite execution failed:', err);
  process.exit(1);
});
