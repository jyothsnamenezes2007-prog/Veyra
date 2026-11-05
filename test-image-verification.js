import assert from 'node:assert';
import { Readable } from 'node:stream';
import { initDatabase, getProductById, getAuctionById } from './server/db.js';
import { handleApiRequest } from './server/api.js';
import {
  verifyProductImage,
  isImageAuthorized,
  invalidateImageVerification,
  clearVerificationRegistry,
  getGroqConfig,
  computeImageHash,
  parseImageInput
} from './server/imageVerification.js';

console.log('================================================================');
console.log('--- STARTING VEYRA GROQ VISION VERIFICATION AUDIT SUITE ---');
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

// Helper to generate distinct valid base64 data URLs for testing
function makeTestImage(tag) {
  const content = `veyra_test_image_bytes_${tag}_${Math.random().toString(36).slice(2)}`;
  return 'data:image/png;base64,' + Buffer.from(content).toString('base64');
}

const VALID_PRODUCT_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Helper to create mock OpenAI-compatible chat completion responses for Groq
function createMockCompletion(contentObject, status = 200, statusText = 'OK') {
  const contentStr = typeof contentObject === 'string' ? contentObject : JSON.stringify(contentObject);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => ({
      id: 'chatcmpl-groq-' + Math.random().toString(36).slice(2),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'llama-3.2-11b-vision-preview',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: contentStr
          },
          finish_reason: 'stop'
        }
      ]
    }),
    text: async () => contentStr
  };
}

async function runAllTests() {
  const originalEnvKey = process.env.GROQ_API_KEY;
  const originalEnvUrl = process.env.GROQ_API_BASE_URL;
  const originalEnvModel = process.env.GROQ_VISION_MODEL;

  let passedCount = 0;
  const recordPass = (name) => {
    passedCount++;
    console.log(`✓ Test ${passedCount} Passed: ${name}`);
  };

  try {
    initDatabase();
    clearVerificationRegistry();

    // Verify default model configuration falls back to llama-3.2-11b-vision-preview
    delete process.env.GROQ_VISION_MODEL;
    delete process.env.GROQ_API_KEY;
    const defaultConfig = getGroqConfig();
    assert.strictEqual(
      defaultConfig.model,
      'llama-3.2-11b-vision-preview',
      'Default model must be vision-capable llama-3.2-11b-vision-preview'
    );

    // Setup test environment
    process.env.GROQ_API_KEY = 'gsk_test_mock_key_9988';
    process.env.GROQ_API_BASE_URL = 'https://api.groq.com/openai/v1';
    process.env.GROQ_VISION_MODEL = 'llama-3.2-11b-vision-preview';

    // =========================================================================
    // SECTION A: IMAGE ACCEPTANCE TESTS (Tests 1-7)
    // =========================================================================
    console.log('\n--- SECTION A: Image Acceptance Tests ---');

    // 1. Clear photograph of a genuine-looking product
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: true,
        readable: true,
        clearProduct: true,
        suspiciousArtifacts: false,
        watermarks: false,
        confidence: 'high',
        reason: 'Crisp, high-definition photograph clearly depicting a handcrafted rosewood sideboard.'
      });

    const res1 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('rosewood_sideboard'),
      title: 'Handcrafted Rosewood Sideboard',
      category: 'Furniture'
    }).execute();
    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(res1.body.verified, true);
    assert.ok(res1.body.token && res1.body.token.startsWith('vtok-'));
    recordPass('Clear photograph of genuine product is accepted with verification token');

    // 2. Vintage watch with natural scratches
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: true,
        readable: true,
        clearProduct: true,
        suspiciousArtifacts: false,
        watermarks: false,
        confidence: 'high',
        reason: 'Vintage 1968 chronometer showing authentic surface micro-scratches and bevel wear consistent with age.'
      });

    const res2 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('vintage_watch_scratches'),
      title: '1968 Vintage Chronometer Watch',
      category: 'Collectibles'
    }).execute();
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(res2.body.verified, true);
    assert.ok(res2.body.reason.includes('micro-scratches'));
    recordPass('Vintage watch with natural surface scratches is accepted');

    // 3. Antique object with natural patina
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: true,
        readable: true,
        clearProduct: true,
        suspiciousArtifacts: false,
        watermarks: false,
        confidence: 'high',
        reason: '18th century brass astrolabe exhibiting natural bronze oxidation and aged verdigris patina.'
      });

    const res3 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('antique_patina_bronze'),
      title: '18th Century Brass Astrolabe',
      category: 'Antiques'
    }).execute();
    assert.strictEqual(res3.statusCode, 200);
    assert.strictEqual(res3.body.verified, true);
    recordPass('Antique object with natural oxidation and patina is accepted');

    // 4. Close-up photograph of a watch component
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: true,
        readable: true,
        clearProduct: true,
        suspiciousArtifacts: false,
        watermarks: false,
        confidence: 'high',
        reason: 'Macro detail photograph clearly showing an escapement wheel and ruby jewel bearing.'
      });

    const res4 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('macro_escapement_component'),
      title: 'Audemars Calibre Escapement Assembly',
      category: 'Collectibles'
    }).execute();
    assert.strictEqual(res4.statusCode, 200);
    assert.strictEqual(res4.body.verified, true);
    recordPass('Macro close-up photograph of a component/part is accepted');

    // 5. Jewellery photograph with a plain background
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: true,
        readable: true,
        clearProduct: true,
        suspiciousArtifacts: false,
        watermarks: false,
        confidence: 'high',
        reason: 'Kundan polki necklace photographed against neutral cream backdrop with balanced illumination.'
      });

    const res5 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('kundan_plain_bg'),
      title: 'Royal Kundan Choker Necklace',
      category: 'Jewellery'
    }).execute();
    assert.strictEqual(res5.statusCode, 200);
    assert.strictEqual(res5.body.verified, true);
    recordPass('Jewellery photograph with plain background staging is accepted');

    // 6. Professional studio photograph
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: true,
        readable: true,
        clearProduct: true,
        suspiciousArtifacts: false,
        watermarks: false,
        confidence: 'high',
        reason: 'High-end studio lighting setup with softbox diffusion showcasing sculpted marble vessel.'
      });

    const res6 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('studio_marble_vessel'),
      title: 'Carved Makrana Marble Vessel',
      category: 'Decorative Objects'
    }).execute();
    assert.strictEqual(res6.statusCode, 200);
    assert.strictEqual(res6.body.verified, true);
    recordPass('Professional studio photograph with clean catalog lighting is accepted');

    // 7. Product with visible brand engraving / hallmarks
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: true,
        readable: true,
        clearProduct: true,
        suspiciousArtifacts: false,
        watermarks: false,
        confidence: 'high',
        reason: 'Solid silver punch bowl showing authentic London hallmark engravings and 1894 silversmith crest.'
      });

    const res7 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('hallmark_silver_bowl'),
      title: 'Victorian Sterling Silver Bowl',
      category: 'Antiques'
    }).execute();
    assert.strictEqual(res7.statusCode, 200);
    assert.strictEqual(res7.body.verified, true);
    recordPass('Product with visible maker hallmarks and brand engravings is accepted');

    // =========================================================================
    // SECTION B: IMAGE REJECTION TESTS (Tests 8-13)
    // =========================================================================
    console.log('\n--- SECTION B: Image Rejection Tests ---');

    // 8. Completely blank image
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: false,
        readable: false,
        clearProduct: false,
        suspiciousArtifacts: false,
        watermarks: false,
        confidence: 'high',
        reason: 'Image is completely blank with uniform solid pixels; no physical object is depicted.'
      });

    const res8 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('blank_pixels')
    }).execute();
    assert.strictEqual(res8.statusCode, 200);
    assert.strictEqual(res8.body.verified, false);
    assert.strictEqual(res8.body.rejected, true);
    assert.ok(res8.body.error.includes('completely blank'));
    recordPass('Completely blank image is rejected with specific diagnostic reason');

    // 9. Severely blurred photograph
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: false,
        readable: false,
        clearProduct: false,
        suspiciousArtifacts: false,
        watermarks: false,
        confidence: 'high',
        reason: 'Severe motion blur prevents visual recognition of the item geometry or condition.'
      });

    const res9 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('heavy_motion_blur')
    }).execute();
    assert.strictEqual(res9.statusCode, 200);
    assert.strictEqual(res9.body.verified, false);
    assert.ok(res9.body.error.includes('motion blur'));
    recordPass('Severely blurred photograph is rejected with clarity explanation');

    // 10. Extremely dark image
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: false,
        readable: false,
        clearProduct: false,
        suspiciousArtifacts: false,
        watermarks: false,
        confidence: 'high',
        reason: 'Underexposed near-black frame; product silhouette is indiscernible.'
      });

    const res10 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('underexposed_black')
    }).execute();
    assert.strictEqual(res10.statusCode, 200);
    assert.strictEqual(res10.body.verified, false);
    recordPass('Extremely dark image is rejected due to lack of visibility');

    // 11. Prominent third-party watermark
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: false,
        readable: true,
        clearProduct: true,
        suspiciousArtifacts: false,
        watermarks: true,
        confidence: 'high',
        reason: 'Image contains prominent diagonal Getty Images copyright watermark across the centre.'
      });

    const res11 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('watermark_stock_photo')
    }).execute();
    assert.strictEqual(res11.statusCode, 200);
    assert.strictEqual(res11.body.verified, false);
    assert.strictEqual(res11.body.details.watermarks, true);
    recordPass('Prominent third-party stock watermark is rejected');

    // 12. Clearly suspicious synthetic distortion
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: false,
        readable: true,
        clearProduct: false,
        suspiciousArtifacts: true,
        watermarks: false,
        confidence: 'high',
        reason: 'Severe AI synthetic anomalies: floating watch hands disconnected from dial and melted crown.'
      });

    const res12 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('ai_hallucinated_watch')
    }).execute();
    assert.strictEqual(res12.statusCode, 200);
    assert.strictEqual(res12.body.verified, false);
    assert.strictEqual(res12.body.details.suspiciousArtifacts, true);
    recordPass('Clearly suspicious synthetic distortion is flagged and rejected');

    // 13. Image that does not reasonably match the declared product
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: false,
        readable: true,
        clearProduct: true,
        suspiciousArtifacts: false,
        watermarks: false,
        confidence: 'high',
        reason: 'Declared item is a Rolex Submariner watch, but the photograph depicts an upholstered armchair.'
      });

    const res13 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('chair_not_watch'),
      title: 'Rolex Submariner Oyster Perpetual',
      category: 'Watches'
    }).execute();
    assert.strictEqual(res13.statusCode, 200);
    assert.strictEqual(res13.body.verified, false);
    assert.ok(res13.body.error.includes('Rolex Submariner'));
    recordPass('Image that does not match declared product details is rejected');

    // =========================================================================
    // SECTION C: INPUT VALIDATION TESTS (Tests 14-18)
    // =========================================================================
    console.log('\n--- SECTION C: Input Validation Tests ---');

    // 14. Invalid image payload (empty, null, non-string)
    const res14a = await createMockReqRes('POST', '/api/verify-image', {}).execute();
    assert.strictEqual(res14a.statusCode, 400);
    assert.strictEqual(res14a.body.verified, false);

    const res14b = await createMockReqRes('POST', '/api/verify-image', { image: 12345 }).execute();
    assert.strictEqual(res14b.statusCode, 400);
    assert.strictEqual(res14b.body.verified, false);
    recordPass('Invalid image payloads (empty, non-string) are cleanly rejected');

    // 15. Unsupported MIME type (e.g. GIF or BMP)
    const res15 = await createMockReqRes('POST', '/api/verify-image', {
      image: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    }).execute();
    assert.strictEqual(res15.statusCode, 400);
    assert.ok(res15.body.error.includes('Unsupported image format'));
    recordPass('Unsupported MIME type (GIF) is rejected with clear format guidance');

    // 16. Oversized image (> 5 MB)
    const largeBuffer = Buffer.alloc(5.2 * 1024 * 1024, 0);
    const res16 = await createMockReqRes('POST', '/api/verify-image', {
      image: `data:image/jpeg;base64,${largeBuffer.toString('base64')}`
    }).execute();
    assert.strictEqual(res16.statusCode, 400);
    assert.ok(res16.body.error.includes('5MB limit') || res16.body.error.includes('maximum allowed size'));
    recordPass('Oversized image (> 5MB) is rejected at server validation boundary');

    // 17. Malformed Base64 data
    assert.throws(() => {
      parseImageInput('not_a_valid_data_url_or_http_url');
    }, /Invalid image format/);
    recordPass('Malformed non-data-URL and non-HTTP string is safely rejected');

    // 18. Invalid remote image URL
    assert.throws(() => {
      parseImageInput('ftp://invalid-protocol.com/image.jpg');
    }, /Invalid image format/);
    recordPass('Invalid URL protocols (ftp://) are rejected; only HTTP/HTTPS supported');

    // =========================================================================
    // SECTION D: API AND FAILURE TESTS (Tests 19-26)
    // =========================================================================
    console.log('\n--- SECTION D: API and Failure Tests ---');

    // 19. Missing Groq API key (placeholder / unconfigured)
    process.env.GROQ_API_KEY = 'your_groq_api_key_here';
    const res19 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('missing_key_test')
    }).execute();
    assert.strictEqual(res19.statusCode, 503);
    assert.strictEqual(res19.body.unavailable, true);
    assert.strictEqual(res19.body.error, 'Verification is temporarily unavailable. Please try again.');
    process.env.GROQ_API_KEY = 'gsk_test_mock_key_9988';
    recordPass('Missing/unconfigured Groq API key returns 503 unavailable');

    // 20. Invalid API credentials (401/403)
    globalThis.__GROQ_MOCK_FETCHER__ = async () => ({
      ok: false,
      status: 401,
      text: async () => 'Invalid API Key',
      json: async () => ({ error: { message: 'Invalid API Key' } })
    });

    const res20 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('auth_error_test')
    }).execute();
    assert.strictEqual(res20.statusCode, 503);
    assert.strictEqual(res20.body.unavailable, true);
    recordPass('Groq authentication failure (401) is caught and surfaced as 503 unavailable');

    // 21. Rate-limit response (429)
    globalThis.__GROQ_MOCK_FETCHER__ = async () => ({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
      json: async () => ({ error: { message: 'Tokens per minute exceeded' } })
    });

    const res21 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('rate_limit_test')
    }).execute();
    assert.strictEqual(res21.statusCode, 503);
    assert.strictEqual(res21.body.unavailable, true);
    recordPass('Groq 429 rate limit is handled gracefully as 503 unavailable');

    // 22. API server error (500)
    globalThis.__GROQ_MOCK_FETCHER__ = async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
      json: async () => ({ error: { message: 'Internal Server Error' } })
    });

    const res22 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('server_error_test')
    }).execute();
    assert.strictEqual(res22.statusCode, 503);
    assert.strictEqual(res22.body.unavailable, true);
    recordPass('Groq 500 server error is safely handled without mistaking for image rejection');

    // 23. Network failure
    globalThis.__GROQ_MOCK_FETCHER__ = async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:443');
    };

    const res23 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('network_failure_test')
    }).execute();
    assert.strictEqual(res23.statusCode, 503);
    assert.strictEqual(res23.body.unavailable, true);
    recordPass('Network failure / socket error returns 503 unavailable');

    // 24. Request timeout
    globalThis.__GROQ_MOCK_FETCHER__ = async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    };

    const res24 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('timeout_test')
    }).execute();
    assert.strictEqual(res24.statusCode, 503);
    assert.strictEqual(res24.body.unavailable, true);
    recordPass('Request timeout is safely handled as 503 unavailable');

    // 25. Invalid JSON model response
    globalThis.__GROQ_MOCK_FETCHER__ = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Not a valid JSON response at all, plain conversation.' } }]
      }),
      text: async () => 'raw non-json'
    });

    const res25 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('invalid_json_model_test')
    }).execute();
    assert.strictEqual(res25.statusCode, 503);
    assert.strictEqual(res25.body.unavailable, true);
    recordPass('Unparseable model text is caught and returns 503 unavailable');

    // 26. Incomplete model response (missing required verified boolean)
    globalThis.__GROQ_MOCK_FETCHER__ = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ reason: 'Partial response without verified flag' }) } }]
      }),
      text: async () => '{}'
    });

    const res26 = await createMockReqRes('POST', '/api/verify-image', {
      image: makeTestImage('incomplete_response_test')
    }).execute();
    assert.strictEqual(res26.statusCode, 503);
    assert.strictEqual(res26.body.unavailable, true);
    recordPass('Incomplete model response missing required verified flag returns 503 unavailable');

    // =========================================================================
    // SECTION E: SECURITY TESTS (Tests 27-32)
    // =========================================================================
    console.log('\n--- SECTION E: Security Tests ---');

    // 27. Valid verification token authorizes submission
    const secImage1 = makeTestImage('security_valid_token_image');
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: true,
        readable: true,
        clearProduct: true,
        suspiciousArtifacts: false,
        watermarks: false,
        confidence: 'high',
        reason: 'Authorized genuine listing photograph.'
      });

    const verifyRes27 = await verifyProductImage(secImage1);
    assert.strictEqual(verifyRes27.verified, true);
    const validToken = verifyRes27.token;

    // Must be authorized prior to consumption
    assert.strictEqual(isImageAuthorized(secImage1, validToken), true);
    recordPass('Valid verification token authorizes listing image');

    // 28. Expired verification token
    const secImage2 = makeTestImage('security_expired_token_image');
    const verifyRes28 = await verifyProductImage(secImage2);
    const expiredToken = verifyRes28.token;

    // Simulate TTL expiry by advancing Date.now() beyond 2-hour VERIFICATION_TTL_MS
    const originalDateNow = Date.now;
    try {
      Date.now = () => originalDateNow() + 3 * 60 * 60 * 1000; // Fast-forward 3 hours
      const isAuthExpired = isImageAuthorized(secImage2, expiredToken);
      assert.strictEqual(isAuthExpired, false, 'Expired token must not authorize image');
    } finally {
      Date.now = originalDateNow;
    }
    recordPass('Expired token fails authorization check and is pruned from registry');

    // 29. Token associated with a different image (tampering attempt)
    const secImage3A = makeTestImage('image_3A');
    const secImage3B = makeTestImage('image_3B');
    const verifyRes29 = await verifyProductImage(secImage3A);
    const tokenFor3A = verifyRes29.token;

    // Token for 3A must NOT authorize 3B
    assert.strictEqual(isImageAuthorized(secImage3B, tokenFor3A), false);
    recordPass('Token issued for image A cannot authorize image B (binding integrity)');

    // 30. Image replaced after verification (stale state invalidation)
    const secImage4 = makeTestImage('image_to_be_replaced');
    const verifyRes30 = await verifyProductImage(secImage4);
    assert.strictEqual(isImageAuthorized(secImage4, verifyRes30.token), true);

    // Invalidate image upon replacement
    invalidateImageVerification(secImage4);
    assert.strictEqual(isImageAuthorized(secImage4, verifyRes30.token), false);
    recordPass('Replacing an image invalidates previous verification state');

    // 31. Attempted listing submission without verification is blocked
    const unverifiedImage = makeTestImage('unverified_listing_attempt');
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: false,
        reason: 'Unverified submission attempt image.'
      });

    const res31 = await createMockReqRes('POST', '/api/products', {
      name: 'Sneaky Unverified Listing',
      seller: 'Bad Actor',
      price: 50000,
      image: unverifiedImage
    }).execute();

    assert.strictEqual(res31.statusCode, 400);
    assert.strictEqual(res31.body.success, false);
    recordPass('Listing submission without verification is strictly blocked by server');

    // 32. Reuse of a single-use token is rejected
    const singleUseImage = makeTestImage('single_use_test_image');
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: true,
        reason: 'Single use test image approved.'
      });

    const verifyRes32 = await verifyProductImage(singleUseImage);
    const singleUseToken = verifyRes32.token;

    // First submission consumes the token
    const res32a = await createMockReqRes('POST', '/api/products', {
      name: 'First Authorized Listing',
      seller: 'Master Studio',
      sellerId: 'artisan-1',
      price: 45000,
      image: singleUseImage,
      verificationToken: singleUseToken
    }).execute();
    assert.strictEqual(res32a.statusCode, 201);
    assert.strictEqual(res32a.body.success, true);

    // Attempt second submission with the exact same consumed token:
    // Should be rejected by isImageAuthorized single-use check!
    globalThis.__GROQ_MOCK_FETCHER__ = async () =>
      createMockCompletion({
        verified: false,
        reason: 'Token already consumed, second verification required.'
      });

    const res32b = await createMockReqRes('POST', '/api/products', {
      name: 'Duplicate Replay Listing',
      seller: 'Master Studio',
      price: 45000,
      image: singleUseImage,
      verificationToken: singleUseToken
    }).execute();
    assert.strictEqual(res32b.statusCode, 400);
    assert.strictEqual(res32b.body.success, false);
    recordPass('Single-use token is consumed upon submission and cannot be replayed (Test 32)');

    console.log('\n================================================================');
    console.log(`ALL ${passedCount} COMPREHENSIVE TESTS PASSED SUCCESSFULLY!`);
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

runAllTests().catch((err) => {
  console.error('\n❌ Test suite execution failed:', err);
  process.exit(1);
});
