import assert from 'node:assert';
import fs from 'node:fs';
import { PRODUCTS, CATEGORIES, hasValidImage, isDemoProduct, MAX_DEMO_PRODUCTS } from './src/data/products.js';
import { getDatabase, getProducts, getAuctions } from './server/db.js';
import { handleApiRequest } from './server/api.js';
import { registerVerifiedImageForTesting } from './server/imageVerification.js';
import { getSearchSuggestions } from './src/lib/searchSuggestions.js';

console.log('================================================================');
console.log('--- STARTING VEYRA PRODUCT VISIBILITY & MARKETPLACE TESTS ---');
console.log('================================================================\n');

function createMockReqRes(method, path, body = null, headers = {}) {
  const req = {
    method,
    url: path,
    headers: { host: 'localhost', ...headers },
    on: (event, handler) => {
      if (event === 'data' && body) {
        handler(Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
      }
      if (event === 'end') {
        setTimeout(handler, 0);
      }
      return req;
    }
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    json: null,
    setHeader: (key, val) => {
      res.headers[key.toLowerCase()] = val;
    },
    writeHead: (code, headers = {}) => {
      res.statusCode = code;
      Object.assign(res.headers, headers);
    },
    end: (chunk) => {
      if (chunk) res.body += chunk;
      try {
        res.json = JSON.parse(res.body);
      } catch (e) {}
    }
  };

  return { req, res };
}

async function runTests() {
  const db = getDatabase();

  // ===========================================================================
  // TEST 1: MAXIMUM 2 DEMO PRODUCTS VISIBLE
  // ===========================================================================
  console.log('[Test 1] Verifying maximum 2 demo products limit...');

  // 1a. Base static catalog in products.js must contain no more than 2 products
  assert(
    PRODUCTS.length <= 2,
    `PRODUCTS sample catalog must contain at most 2 items, got ${PRODUCTS.length}`
  );
  assert.strictEqual(PRODUCTS.length, 2, 'PRODUCTS catalog contains exactly 2 curated demo items');
  assert.strictEqual(MAX_DEMO_PRODUCTS, 2, 'MAX_DEMO_PRODUCTS constant must be 2');

  assert.strictEqual(PRODUCTS[0].id, 'prod-1', 'First demo product is prod-1');
  assert.strictEqual(PRODUCTS[1].id, 'prod-2', 'Second demo product is prod-2');

  // 1b. Server database db.json demo products count
  const demoInDb = db.products.filter((p) => p.id === 'prod-1' || p.id === 'prod-2');
  assert(demoInDb.length <= 2, 'db.products has at most 2 demo items');

  const excessDemoIds = [
    'prod-3', 'prod-4', 'prod-5', 'prod-6', 'prod-7', 'prod-8', 'prod-9', 'prod-10', 'prod-11', 'prod-12',
    'prod-auc-1', 'prod-auc-2', 'prod-auc-3', 'prod-auc-4',
    'prod-up-1', 'prod-up-2', 'prod-up-3', 'prod-up-4'
  ];
  const foundExcess = db.products.filter((p) => excessDemoIds.includes(p.id));
  assert.strictEqual(
    foundExcess.length,
    0,
    `No excess demo products should be in db.products, found: ${foundExcess.map((p) => p.id).join(', ')}`
  );

  console.log('✓ Test 1 Passed: Exactly 2 demo products maintained and all excess demo products removed.\n');

  // ===========================================================================
  // TEST 2: NO IMAGE-LESS PRODUCTS IN MARKETPLACE
  // ===========================================================================
  console.log('[Test 2] Verifying no image-less products in marketplace...');

  // 2a. hasValidImage unit validation
  assert.strictEqual(hasValidImage(null), false, 'Null product has no valid image');
  assert.strictEqual(hasValidImage({}), false, 'Empty product has no valid image');
  assert.strictEqual(hasValidImage({ image: '' }), false, 'Empty string image is invalid');
  assert.strictEqual(hasValidImage({ image: '   ' }), false, 'Whitespace image is invalid');
  assert.strictEqual(hasValidImage({ images: [] }), false, 'Empty images array is invalid');
  assert.strictEqual(hasValidImage({ images: [''] }), false, 'Images array with empty string is invalid');
  assert.strictEqual(
    hasValidImage({ image: 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c' }),
    true,
    'Valid image URL is recognized'
  );
  assert.strictEqual(
    hasValidImage({ images: ['https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c'] }),
    true,
    'Valid images array is recognized'
  );

  // 2b. Database check: No active products in db.products can be image-less
  const imagelessInDb = db.products.filter(
    (p) => (!p.image || p.image.trim() === '') && (!p.images || !p.images.some((img) => img && img.trim() !== ''))
  );
  assert.strictEqual(
    imagelessInDb.length,
    0,
    `db.products contains image-less listings: ${imagelessInDb.map((p) => p.id).join(', ')}`
  );

  // 2c. Sample image-less listings prod-1792823141997 and prod-custom-1792823141987 must not be in db.products
  assert(
    !db.products.some((p) => p.id === 'prod-custom-1792823141987'),
    'Image-less prod-custom-1792823141987 must not appear in db.products'
  );
  assert(
    !db.products.some((p) => p.id === 'prod-1792823141997'),
    'Image-less prod-1792823141997 must not appear in db.products'
  );

  // 2d. Search suggestions must exclude image-less products
  const fakeProductsWithImageless = [
    { id: 'img-1', name: 'Ceramic Bowl', category: 'Handmade', image: '', listingStatus: 'active', inStock: true },
    { id: 'img-2', name: 'Ceramic Plate', category: 'Handmade', image: 'https://example.com/plate.jpg', listingStatus: 'active', inStock: true }
  ];
  const suggestions = getSearchSuggestions('Ceramic', fakeProductsWithImageless, CATEGORIES);
  assert(suggestions.products.some((p) => p.id === 'img-2'), 'Should include valid image product');
  assert(!suggestions.products.some((p) => p.id === 'img-1'), 'Must exclude image-less product from suggestions');

  console.log('✓ Test 2 Passed: Image-less products strictly excluded from public marketplace.\n');

  // ===========================================================================
  // TEST 3: SELLER-CREATED PRODUCTS APPEAR AFTER SUBMISSION
  // ===========================================================================
  console.log('[Test 3] Verifying seller-created products appear upon creation...');

  const testSeller = 'Studio Veyra Artisan ' + Date.now();
  const testSellerId = 'seller_create_' + Date.now();
  const testImg = 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=1000&q=80';
  const vToken = registerVerifiedImageForTesting(testImg);

  const newProductPayload = {
    clientSubmissionId: 'sub_create_' + Date.now(),
    name: 'Handcrafted Teak Pedestal Bowl',
    seller: testSeller,
    sellerId: testSellerId,
    location: 'Kerala, India',
    category: 'Handmade',
    price: 14500,
    image: testImg,
    images: [testImg],
    verificationToken: vToken,
    description: 'Carved from single block of reclaimed Nilambur teak with beeswax polish.'
  };

  // Submit via POST /api/products
  const createReq = createMockReqRes('POST', '/api/products', newProductPayload);
  await handleApiRequest(createReq.req, createReq.res);
  assert.strictEqual(createReq.res.statusCode, 201, 'Product submission must succeed with status 201');
  assert(createReq.res.json.success, 'Response must indicate success');
  const createdProd = createReq.res.json.product;
  assert(createdProd && createdProd.id, 'Response must return created product');
  assert.strictEqual(createdProd.listingStatus, 'active', 'Newly created seller product with valid image is active');

  // Verify product is in getProducts()
  const currentProducts = getProducts();
  const foundCreated = currentProducts.find((p) => p.id === createdProd.id);
  assert(foundCreated, 'Newly created product must be retrieved via getProducts()');
  assert.strictEqual(foundCreated.seller, testSeller);
  assert(hasValidImage(foundCreated), 'Created product must have valid image');

  console.log('✓ Test 3 Passed: Seller-created products appear normally upon creation.\n');

  // ===========================================================================
  // TEST 4: SOLD PRODUCTS DISAPPEAR FROM ACTIVE MARKETPLACE LISTINGS
  // ===========================================================================
  console.log('[Test 4] Verifying sold products disappear from active marketplace listings...');

  // Mark the test product as sold via POST /api/products/:id/sold
  const soldReq = createMockReqRes('POST', `/api/products/${createdProd.id}/sold`);
  await handleApiRequest(soldReq.req, soldReq.res);
  assert.strictEqual(soldReq.res.statusCode, 200, 'Marking product as sold must return 200');
  assert.strictEqual(soldReq.res.json.product.listingStatus, 'sold', 'Listing status must be sold');
  assert.strictEqual(soldReq.res.json.product.inStock, false, 'inStock must be false');
  assert.strictEqual(soldReq.res.json.product.isSold, true, 'isSold must be true');

  // Verify that the record is PRESERVED in the database (not deleted)
  const productAfterSale = getProducts().find((p) => p.id === createdProd.id);
  assert(productAfterSale, 'Sold product record must be preserved in the database for transaction history');
  assert.strictEqual(productAfterSale.isSold, true, 'isSold flag must be preserved');

  // Verify that search suggestions exclude sold products
  const suggestionsWithSold = getSearchSuggestions(
    'Pedestal Bowl',
    getProducts(),
    CATEGORIES
  );
  assert(
    !suggestionsWithSold.products.some((p) => p.id === createdProd.id),
    'Sold product must NOT appear in search suggestions'
  );

  // Clean up test product
  const dbIndex = db.products.findIndex((p) => p.id === createdProd.id);
  if (dbIndex !== -1) {
    db.products.splice(dbIndex, 1);
  }

  // Confirm real auctions auc-1 and up-2 are intact
  const auctions = getAuctions();
  assert(auctions.some((a) => a.id === 'auc-1'), 'Real auction auc-1 must remain completely intact');
  assert(auctions.some((a) => a.id === 'up-2'), 'Real auction up-2 must remain completely intact');

  console.log('✓ Test 4 Passed: Sold products disappear from active listings while records are safely preserved.\n');

  console.log('================================================================');
  console.log('🎉 ALL 4 PRODUCT VISIBILITY & MARKETPLACE TESTS PASSED (4/4)!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
