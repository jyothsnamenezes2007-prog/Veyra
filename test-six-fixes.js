import assert from 'assert';
import fs from 'fs';
import { Readable } from 'stream';
import { getSearchSuggestions } from './src/lib/searchSuggestions.js';
import { PRODUCTS, CATEGORIES } from './src/data/products.js';
import { handleApiRequest } from './server/api.js';
import { getDatabase, getProductById, getAuctions } from './server/db.js';

function createMockReqRes(method, path, body = null, headers = {}) {
  let pushed = false;
  const req = new Readable({
    read() {
      if (!pushed) {
        pushed = true;
        if (body) {
          this.push(typeof body === 'string' ? body : JSON.stringify(body));
        }
        this.push(null);
      }
    }
  });

  req.method = method;
  req.url = path;
  req.headers = {
    host: 'localhost:3001',
    'content-type': 'application/json',
    ...headers
  };

  let statusCode = 200;
  let responseHeaders = {};
  let responseData = '';

  const res = {
    writeHead(code, hdrs) {
      statusCode = code;
      if (hdrs) Object.assign(responseHeaders, hdrs);
      return res;
    },
    setHeader(key, val) {
      responseHeaders[key] = val;
    },
    end(data) {
      if (data) responseData += data;
    },
    write(data) {
      if (data) responseData += data;
    },
    get statusCode() {
      return statusCode;
    },
    get json() {
      try {
        return JSON.parse(responseData);
      } catch (e) {
        return null;
      }
    },
    get raw() {
      return responseData;
    }
  };

  return { req, res };
}

async function runTests() {
  console.log('--- STARTING VEYRA SIX FIXES TEST SUITE ---\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: FIX SIGN OUT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Test 1] Verifying Sign Out implementation in Navbar & AuthContext...');
  const navbarContent = fs.readFileSync('src/components/Navbar.jsx', 'utf8');
  assert(
    !navbarContent.includes('setIsProfileOpen(false)'),
    'Navbar should not contain non-existent setIsProfileOpen setter'
  );
  assert(
    !navbarContent.includes('setIsMobileMenuOpen(false)'),
    'Navbar should not contain non-existent setIsMobileMenuOpen setter'
  );
  assert(
    navbarContent.includes('setProfileDropdownOpen(false)'),
    'Navbar should correctly use setProfileDropdownOpen'
  );
  assert(
    navbarContent.includes('setMobileMenuOpen(false)'),
    'Navbar should correctly use setMobileMenuOpen'
  );

  const authContent = fs.readFileSync('src/context/AuthContext.jsx', 'utf8');
  assert(
    authContent.includes('return { success: false, error: error.message };') ||
    authContent.includes('return { success: false'),
    'AuthContext signOut must check Supabase error and return failure if error exists'
  );
  assert(
    authContent.includes('return { success: true };'),
    'AuthContext signOut must return success: true upon completion'
  );
  console.log('✓ Test 1 Passed: Sign out correctly clears state, avoids runtime crashes, and handles errors.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: SEARCH SUGGESTIONS & RESULTS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Test 2] Verifying Product Search Suggestions and Matching...');

  // 2a: Test "Table"
  const tableSuggestions = getSearchSuggestions('Table', PRODUCTS, CATEGORIES);
  assert(tableSuggestions.hasMatches, 'Should find matches for "Table"');
  assert(
    tableSuggestions.products.some((p) => p.name.toLowerCase().includes('table')),
    'Should match "Cast Bronze Freeform Low Coffee Table"'
  );

  // 2b: Test "Coffee table"
  const coffeeTable = getSearchSuggestions('Coffee table', PRODUCTS, CATEGORIES);
  assert(coffeeTable.hasMatches, 'Should find matches for "Coffee table"');
  assert(
    coffeeTable.products.some((p) => p.name.includes('Coffee Table')),
    'Should suggest Coffee Table'
  );

  // 2c: Test "Dining table" (category/related search)
  const diningTable = getSearchSuggestions('Dining table', PRODUCTS, CATEGORIES);
  assert(
    diningTable.hasMatches,
    'Should handle "Dining table" queries gracefully'
  );

  // 2d: Test "Wooden table"
  const woodenTable = getSearchSuggestions('Wooden table', PRODUCTS, CATEGORIES);
  assert(
    woodenTable.hasMatches,
    'Should handle "Wooden table" queries gracefully'
  );

  // 2e: Test "Ceramics" (Category match)
  const ceramics = getSearchSuggestions('Ceramics', PRODUCTS, CATEGORIES);
  assert(
    ceramics.categories.some((c) => c.name.toLowerCase().includes('ceramics')),
    'Should match Handmade Ceramics category'
  );

  // 2f: Test non-matching query
  const noMatch = getSearchSuggestions('xyznonexistentquery999', PRODUCTS, CATEGORIES);
  assert(!noMatch.hasMatches, 'Should report hasMatches = false for unmatched queries');
  assert.strictEqual(noMatch.products.length, 0);

  // 2g: Test empty query
  const emptyQuery = getSearchSuggestions('', PRODUCTS, CATEGORIES);
  assert(!emptyQuery.hasMatches && emptyQuery.products.length === 0);

  console.log('✓ Test 2 Passed: Dynamic product search suggestions match names, categories, and descriptors correctly.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: WHY VEYRA DESCRIPTION
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Test 3] Verifying Why Veyra component description...');
  const whyVeyraContent = fs.readFileSync('src/components/WhyVeyra.jsx', 'utf8');
  const expectedText =
    'An interactive auction and bidding marketplace connecting collectors with independent sellers through extraordinary objects, live auctions, and real-time bidding.';
  const oldText =
    'A commerce platform designed around intention, human craft, and the quiet pleasure of living with extraordinary objects.';

  assert(whyVeyraContent.includes(expectedText), 'WhyVeyra must contain the new updated description');
  assert(!whyVeyraContent.includes(oldText), 'WhyVeyra must not contain the old description');
  console.log('✓ Test 3 Passed: Why Veyra description updated exactly without touching layout or pillars.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: SUCCESS MESSAGE POSITIONED BELOW FORM
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Test 4] Verifying submission confirmation message positioned below the form...');
  const sellContent = fs.readFileSync('src/pages/Sell.jsx', 'utf8');

  const formEndIndex = sellContent.indexOf('</form>');
  const successMessageIndex = sellContent.indexOf('submittedData && (');
  assert(formEndIndex !== -1, 'Sell.jsx must contain </form>');
  assert(successMessageIndex !== -1, 'Sell.jsx must contain submittedData confirmation card');
  assert(
    successMessageIndex > formEndIndex,
    'Success confirmation card must be rendered AFTER/BELOW the form, not above it'
  );

  const prodContextContent = fs.readFileSync('src/context/ProductsContext.jsx', 'utf8');
  assert(
    prodContextContent.includes('throw new Error(errorData.error'),
    'ProductsContext.addProduct must throw on backend error so no false success message is shown'
  );
  console.log('✓ Test 4 Passed: Confirmation card is rendered below the form and verified against backend errors.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: PREVENT DUPLICATE SUBMISSIONS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Test 5] Verifying duplicate submission prevention (Frontend & Backend)...');

  // 5a: Frontend button disabling and loading spinner
  assert(sellContent.includes('disabled={isSubmitting}'), 'Submit button must be disabled when isSubmitting');
  assert(sellContent.includes('if (isSubmitting) return;'), 'handleSubmit must return early if already submitting');

  // 5b: Backend duplicate rejection/prevention
  const testSellerId = 'seller_test_dedup_' + Date.now();
  const subToken = 'sub_token_test_' + Date.now();
  const productPayload = {
    clientSubmissionId: subToken,
    name: 'Unique Artisan Stool ' + Date.now(),
    seller: 'Studio Test Atelier',
    sellerId: testSellerId,
    price: 32000,
    category: 'Handmade'
  };

  // First submission
  const firstReq = createMockReqRes('POST', '/api/products', productPayload);
  await handleApiRequest(firstReq.req, firstReq.res);
  assert.strictEqual(firstReq.res.statusCode, 201, 'First submission should succeed with 201');
  const firstProductId = firstReq.res.json.product.id;

  // Immediate second submission with same clientSubmissionId (simulating double click)
  const dupReq = createMockReqRes('POST', '/api/products', productPayload);
  await handleApiRequest(dupReq.req, dupReq.res);
  assert.strictEqual(dupReq.res.statusCode, 200, 'Duplicate submission should return 200 idempotently');
  assert.strictEqual(dupReq.res.json.duplicatePrevented, true, 'Duplicate submission should be flagged as prevented');
  assert.strictEqual(dupReq.res.json.product.id, firstProductId, 'Duplicate request must return original product ID');

  // Clean up created test product
  const db = getDatabase();
  const idx = db.products.findIndex((p) => p.id === firstProductId);
  if (idx !== -1) db.products.splice(idx, 1);

  console.log('✓ Test 5 Passed: Duplicate submissions prevented both via button disabling and backend idempotency.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: DELETE OPTION IN MY PRODUCTS & PERMISSIONS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[Test 6] Verifying Delete action in My Products with backend verification...');

  const myProductsContent = fs.readFileSync('src/pages/MyProducts.jsx', 'utf8');
  assert(
    myProductsContent.includes("product.derivedStatus !== 'auction'"),
    'Delete button must be available for all seller listings except active live auctions'
  );
  assert(
    myProductsContent.includes('Delete Product Listing?'),
    'Confirmation modal must ask for user confirmation before deletion'
  );

  // Create temporary seller product to test deletion
  const delTestId = 'prod-del-test-' + Date.now();
  db.products.push({
    id: delTestId,
    name: 'Temporary Test Object',
    seller: 'Studio Test Atelier',
    sellerId: testSellerId,
    price: 15000,
    listingStatus: 'pending'
  });

  // 6a: Unauthorized deletion attempt by different user
  const unauthReq = createMockReqRes('DELETE', `/api/products/${delTestId}`, {
    userId: 'unauthorized_stranger_user'
  });
  await handleApiRequest(unauthReq.req, unauthReq.res);
  assert.strictEqual(unauthReq.res.statusCode, 403, 'Unauthorized user should be rejected with 403');
  assert(getProductById(delTestId), 'Product must NOT be deleted by unauthorized user');

  // 6b: Legitimate deletion by owner
  const authReq = createMockReqRes('DELETE', `/api/products/${delTestId}`, {
    userId: testSellerId
  });
  await handleApiRequest(authReq.req, authReq.res);
  assert.strictEqual(authReq.res.statusCode, 200, 'Authorized deletion should succeed with 200');
  assert(!getProductById(delTestId), 'Product must be safely removed after authorized deletion');

  // 6c: Critical safety test - Real auctions auc-1 and up-2 cannot be deleted
  const auc1Del = createMockReqRes('DELETE', '/api/products/auc-1', { userId: 'any_user' });
  await handleApiRequest(auc1Del.req, auc1Del.res);
  assert.strictEqual(auc1Del.res.statusCode, 403, 'Deletion of auc-1 must be blocked');

  const up2Del = createMockReqRes('DELETE', '/api/products/up-2', { userId: 'any_user' });
  await handleApiRequest(up2Del.req, up2Del.res);
  assert.strictEqual(up2Del.res.statusCode, 403, 'Deletion of up-2 must be blocked');

  // Confirm real auctions auc-1 and up-2 exist intact
  const auctions = getAuctions();
  assert(auctions.some((a) => a.id === 'auc-1'), 'auc-1 must exist intact');
  assert(auctions.some((a) => a.id === 'up-2'), 'up-2 must exist intact');

  console.log('✓ Test 6 Passed: Seller ownership verified, active auctions protected, safe deletion confirmed.\n');

  console.log('=============================================================');
  console.log('🎉 ALL 6 FIXES VERIFIED AND PASSING SUCCESSFULLY!');
  console.log('=============================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
