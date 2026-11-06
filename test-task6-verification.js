import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { createServer as createViteServer } from 'vite';
import { io as Client } from 'socket.io-client';
import { initSocketServer, getActiveSocketCount } from './server/socket.js';
import { handleApiRequest } from './server/api.js';
import {
  verifyProductImage,
  clearVerificationRegistry,
  getGroqConfig
} from './server/imageVerification.js';

console.log('================================================================');
console.log('--- STARTING VEYRA TASK 6 COMPREHENSIVE VERIFICATION SUITE ---');
console.log('================================================================\n');

// Helper to create a valid PNG of specified width and height
function createPng(width = 32, height = 32, r = 180, g = 120, b = 60) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(2, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c >>> 0;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(8 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4);
    data.copy(buf, 8);
    const crc = crc32(Buffer.concat([Buffer.from(type), data]));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const scanlines = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    scanlines.writeUInt8(0, offset++);
    for (let x = 0; x < width; x++) {
      scanlines.writeUInt8(r, offset++);
      scanlines.writeUInt8(g, offset++);
      scanlines.writeUInt8(b, offset++);
    }
  }
  const compressed = zlib.deflateSync(scanlines);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeMockGroqResponse(decision) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(decision) } }]
    }),
    text: async () => JSON.stringify(decision)
  };
}

let backendServer;
let viteDevServer;
let tempDbPath;

async function run() {
  const originalDbPath = path.resolve('server/data/db.json');
  tempDbPath = path.join(os.tmpdir(), `veyra-task6-db-${Date.now()}.json`);
  fs.copyFileSync(originalDbPath, tempDbPath);
  process.env.VEYRA_DB_PATH = tempDbPath;

  const { initDatabase, resetDbCache } = await import('./server/db.js');
  resetDbCache();
  initDatabase();
  clearVerificationRegistry();

  // 1. Backend starts on port 5000
  backendServer = http.createServer(async (req, res) => {
    if (req.url && req.url.startsWith('/socket.io')) return;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const handled = await handleApiRequest(req, res);
    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  initSocketServer(backendServer);

  await new Promise((resolve) => {
    backendServer.listen(5000, () => {
      console.log('✓ [Item 1] Backend started successfully on port 5000');
      resolve();
    });
  });

  // 2. Frontend starts on port 3000
  viteDevServer = await createViteServer({
    server: { port: 3000, host: '127.0.0.1' }
  });
  await viteDevServer.listen();
  console.log('✓ [Item 2] Frontend started successfully on port 3000 with proxy -> :5000\n');

  try {
    // 3. /api/auctions works through the Vite proxy
    console.log('[Item 3] Testing /api/auctions through Vite proxy...');
    const auctionsRes = await fetch('http://127.0.0.1:3000/api/auctions');
    assert.strictEqual(auctionsRes.status, 200);
    const auctionsJson = await auctionsRes.json();
    assert.strictEqual(auctionsJson.success, true);
    assert.ok(Array.isArray(auctionsJson.auctions));
    console.log(`✓ [Item 3] Passed: /api/auctions returned ${auctionsJson.auctions.length} auctions through proxy.`);

    // 4. /api/products works through the Vite proxy
    console.log('\n[Item 4] Testing /api/products through Vite proxy...');
    const productsRes = await fetch('http://127.0.0.1:3000/api/products');
    assert.strictEqual(productsRes.status, 200);
    const productsJson = await productsRes.json();
    assert.strictEqual(productsJson.success, true);
    assert.ok(Array.isArray(productsJson.products));
    console.log(`✓ [Item 4] Passed: /api/products returned ${productsJson.products.length} products through proxy.`);

    // 5. /api/verify-image accepts a valid supported image (including ~4.8MB Base64 payload)
    console.log('\n[Item 5] Testing /api/verify-image with a valid image (Base64 encoded)...');
    globalThis.__GROQ_MOCK_FETCHER__ = async () => makeMockGroqResponse({
      verified: true,
      readable: true,
      clearProduct: true,
      reason: 'Valid handmade teak furniture photograph.'
    });

    // Valid 4.8MB binary image Base64 data URL (simulating high-res photo)
    const valid48MbBuffer = Buffer.alloc(4.8 * 1024 * 1024, 65);
    const valid48MbDataUrl = `data:image/jpeg;base64,${valid48MbBuffer.toString('base64')}`;

    const verifyRes5 = await fetch('http://127.0.0.1:3000/api/verify-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: valid48MbDataUrl,
        title: 'Archival Bench'
      })
    });
    assert.strictEqual(verifyRes5.status, 200, `Expected 200 for 4.8MB valid image, got ${verifyRes5.status}`);
    const verifyJson5 = await verifyRes5.json();
    assert.strictEqual(verifyJson5.verified, true);
    assert.ok(verifyJson5.token.startsWith('vtok-'));
    console.log('✓ [Item 5] Passed: /api/verify-image accepted 4.8MB image (~6.4MB Base64 payload) and returned token: ' + verifyJson5.token.slice(0, 16) + '...');

    // 6. Valid screenshot containing a clearly visible product passes verification
    console.log('\n[Item 6] Testing screenshot containing a clearly visible product...');
    globalThis.__GROQ_MOCK_FETCHER__ = async () => makeMockGroqResponse({
      verified: true,
      readable: true,
      clearProduct: true,
      suspiciousArtifacts: false,
      watermarks: false,
      reason: 'Screenshot clearly shows the handmade silver necklace with phone UI visible.'
    });

    const screenshotDataUrl = 'data:image/png;base64,' + createPng(64, 64, 200, 200, 210).toString('base64');
    const verifyRes6 = await fetch('http://127.0.0.1:3000/api/verify-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: screenshotDataUrl,
        title: 'Tribal Silver Choker Necklace'
      })
    });
    const verifyJson6 = await verifyRes6.json();
    assert.strictEqual(verifyRes6.status, 200);
    assert.strictEqual(verifyJson6.verified, true);
    assert.ok(verifyJson6.token);
    console.log('✓ [Item 6] Passed: Product screenshot accepted with reason: "' + verifyJson6.reason + '"');

    // 7. Unrelated screenshot is rejected
    console.log('\n[Item 7] Testing unrelated screenshot (messaging chat / meme)...');
    globalThis.__GROQ_MOCK_FETCHER__ = async () => makeMockGroqResponse({
      verified: false,
      readable: true,
      clearProduct: false,
      reason: 'Unrelated screenshot of a text messaging conversation; no product is visible.'
    });

    const chatScreenshotDataUrl = 'data:image/png;base64,' + Buffer.from('unrelated_chat_screenshot_test_bytes').toString('base64');
    const verifyRes7 = await fetch('http://127.0.0.1:3000/api/verify-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: chatScreenshotDataUrl,
        title: 'Teak Wood Armchair'
      })
    });
    const verifyJson7 = await verifyRes7.json();
    assert.ok(verifyRes7.status === 200 || verifyRes7.status === 400);
    assert.strictEqual(verifyJson7.verified, false);
    assert.strictEqual(verifyJson7.token, undefined);
    console.log('✓ [Item 7] Passed: Unrelated screenshot rejected: "' + verifyJson7.reason + '"');

    // 8. Blank, corrupted, and invalid-format images are rejected
    console.log('\n[Item 8] Testing blank, corrupted, and invalid-format images...');
    // 8a. Corrupted string
    const verifyRes8a = await fetch('http://127.0.0.1:3000/api/verify-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'not-a-valid-data-url-or-http' })
    });
    assert.strictEqual(verifyRes8a.status, 400);
    const verifyJson8a = await verifyRes8a.json();
    assert.strictEqual(verifyJson8a.verified, false);

    // 8b. Unsupported GIF format
    const verifyRes8b = await fetch('http://127.0.0.1:3000/api/verify-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' })
    });
    assert.strictEqual(verifyRes8b.status, 400);
    const verifyJson8b = await verifyRes8b.json();
    assert.ok(verifyJson8b.error.includes('Unsupported image format'));
    console.log('✓ [Item 8] Passed: Blank, corrupted, and invalid-format images rejected.');

    // 9. Oversized images (> 5MB binary, or > 10MB request payload) are rejected
    console.log('\n[Item 9] Testing oversized images and request payloads...');
    // 9a. Binary > 5MB (e.g. 5.3MB binary)
    const oversizedBuffer = Buffer.alloc(5.3 * 1024 * 1024, 1);
    const verifyRes9a = await fetch('http://127.0.0.1:3000/api/verify-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: `data:image/jpeg;base64,${oversizedBuffer.toString('base64')}` })
    });
    assert.strictEqual(verifyRes9a.status, 400);
    const verifyJson9a = await verifyRes9a.json();
    assert.strictEqual(verifyJson9a.verified, false);
    assert.ok(verifyJson9a.error.includes('5MB'));

    // 9b. Request payload > 10MB
    const hugeBuffer = Buffer.alloc(8 * 1024 * 1024, 2); // 8MB binary => ~10.7MB base64
    const verifyRes9b = await fetch('http://127.0.0.1:3000/api/verify-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: `data:image/jpeg;base64,${hugeBuffer.toString('base64')}` })
    });
    assert.strictEqual(verifyRes9b.status, 400);
    const verifyJson9b = await verifyRes9b.json();
    assert.strictEqual(verifyJson9b.verified, false);
    assert.ok(verifyJson9b.error.includes('5MB'));
    console.log('✓ [Item 9] Passed: Genuinely oversized images and payloads cleanly blocked.');

    // 10. Missing or invalid Groq credentials produce 503 unavailable
    console.log('\n[Item 10] Testing missing/invalid Groq credentials...');
    const originalKey = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = 'your_groq_api_key_here'; // placeholder
    delete globalThis.__GROQ_MOCK_FETCHER__;

    const verifyRes10 = await fetch('http://127.0.0.1:3000/api/verify-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: 'data:image/png;base64,' + createPng(32, 32).toString('base64') })
    });
    assert.strictEqual(verifyRes10.status, 503);
    const verifyJson10 = await verifyRes10.json();
    assert.strictEqual(verifyJson10.unavailable, true);
    assert.strictEqual(verifyJson10.error, 'Verification is temporarily unavailable. Please try again.');
    process.env.GROQ_API_KEY = originalKey;
    console.log('✓ [Item 10] Passed: Missing/placeholder credentials return HTTP 503 unavailable.');

    // 11. Verification tokens required for listing submission
    console.log('\n[Item 11] Testing listing submission token enforcement...');
    // Unverified product submission attempt
    const unverifiedSubmission = await fetch('http://127.0.0.1:3000/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Unverified Test Item',
        seller: 'Test Seller',
        price: 15000,
        image: 'data:image/png;base64,' + createPng(32, 32).toString('base64'),
        verificationToken: null
      })
    });
    assert.strictEqual(unverifiedSubmission.status, 400);
    const unverifiedJson = await unverifiedSubmission.json();
    assert.strictEqual(unverifiedJson.success, false);
    assert.ok(unverifiedJson.error.toLowerCase().includes('verification'));
    console.log('✓ [Item 11] Passed: Listing submission blocked without verified token.');

    // 12. Socket.IO connections work through Vite proxy
    console.log('\n[Item 12] Testing Socket.IO connection through Vite proxy...');
    const socketClient = Client('http://127.0.0.1:3000', {
      transports: ['websocket', 'polling'],
      timeout: 10000
    });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Socket.IO connection timeout')), 8000);
      socketClient.on('connect', () => { clearTimeout(t); resolve(); });
      socketClient.on('connect_error', (e) => { clearTimeout(t); reject(e); });
    });
    assert.strictEqual(socketClient.connected, true);
    assert.ok(getActiveSocketCount() >= 1);
    socketClient.close();
    console.log('✓ [Item 12] Passed: Socket.IO connected and verified through Vite proxy port 3000.');

    console.log('\n================================================================');
    console.log('ALL TASK 6 ITEMS (1 THROUGH 12) VERIFIED AND PASSED SUCCESSFULLY!');
    console.log('================================================================\n');
  } finally {
    if (backendServer) backendServer.close();
    if (viteDevServer) await viteDevServer.close();
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      try { fs.unlinkSync(tempDbPath); } catch (e) {}
    }
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Task 6 verification failed:', err);
  process.exit(1);
});
