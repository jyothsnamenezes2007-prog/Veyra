import assert from 'node:assert';
import { getAuthoritativeAuctionWinner, getMeetingAccess } from './src/data/auctions.js';

console.log('--- STARTING VEYRA WINNER MEETING OPTION VERIFICATION ---');

const now = Date.now();

// Mock Seller and Buyers
const seller = { id: 'seller-jeanneret', name: 'Pierre Jeanneret Workshop', role: 'seller' };
const winningBuyer = { id: 'user-winner-1', name: 'A. Singhania', role: 'collector' };
const outbidBuyer = { id: 'user-bidder-2', name: 'Collector_90', role: 'collector' };
const strangerUser = { id: 'user-stranger-3', name: 'Random Visitor', role: 'collector' };

// Base ended auction
const endedAuctionWithBids = {
  id: 'auc-1',
  name: 'Archival Chandigarh Teak & Cane V-Leg Chair',
  seller: 'Pierre Jeanneret Workshop',
  sellerId: 'seller-jeanneret',
  status: 'ended',
  startTimestamp: now - 7200000,
  endTimestamp: now - 3600000,
  remainingSeconds: 0,
  currentBid: 96000,
  startingBid: 65000,
  bidHistory: [
    { id: 'b-1', bidder: 'A. Singhania', bidderId: 'user-winner-1', amount: 96000, timestamp: now - 3800000 },
    { id: 'b-2', bidder: 'Collector_90', bidderId: 'user-bidder-2', amount: 93500, timestamp: now - 4000000 },
    { id: 'b-3', bidder: 'Studio K.O.', bidderId: 'user-ko-3', amount: 90000, timestamp: now - 5000000 }
  ]
};

// ── Test 1: Authoritative Winner Determination ──────────────────────────────
console.log('Test 1: Authoritative Winner Determination');

// 1a: Active auction has NO finalized winner yet
const activeAuction = {
  ...endedAuctionWithBids,
  status: 'active',
  endTimestamp: now + 3600000,
  remainingSeconds: 3600
};
assert.strictEqual(getAuthoritativeAuctionWinner(activeAuction), null, 'Active auction must not have a finalized winner');

// 1b: Cancelled auction has NO winner
const cancelledAuction = {
  ...endedAuctionWithBids,
  status: 'cancelled'
};
assert.strictEqual(getAuthoritativeAuctionWinner(cancelledAuction), null, 'Cancelled auction must not have a winner');

// 1c: Ended auction with no bids has NO winner
const endedNoBids = {
  ...endedAuctionWithBids,
  bidHistory: []
};
assert.strictEqual(getAuthoritativeAuctionWinner(endedNoBids), null, 'Ended auction with no bids must not have a winner');

// 1d: Valid ended auction selects highest bidder
const winner = getAuthoritativeAuctionWinner(endedAuctionWithBids);
assert(winner !== null, 'Ended auction with bids must have a winner');
assert.strictEqual(winner.bidder, 'A. Singhania');
assert.strictEqual(winner.bidderId, 'user-winner-1');
assert.strictEqual(winner.amount, 96000);

console.log('✓ Test 1 Passed: Winner determined strictly when auction is ended, non-cancelled, with verified bids.');

// ── Test 2: Seller Cannot Win Their Own Auction ─────────────────────────────
console.log('Test 2: Seller cannot be treated as winning bidder');

const auctionWithSellerBid = {
  ...endedAuctionWithBids,
  bidHistory: [
    // Seller placed a shill bid higher than everyone
    { id: 'b-shill', bidder: 'Pierre Jeanneret Workshop', bidderId: 'seller-jeanneret', amount: 150000, timestamp: now - 3700000 },
    { id: 'b-legit-1', bidder: 'A. Singhania', bidderId: 'user-winner-1', amount: 96000, timestamp: now - 3800000 },
    { id: 'b-legit-2', bidder: 'Collector_90', bidderId: 'user-bidder-2', amount: 93500, timestamp: now - 4000000 }
  ]
};

const sanitizedWinner = getAuthoritativeAuctionWinner(auctionWithSellerBid);
assert(sanitizedWinner !== null);
assert.notStrictEqual(sanitizedWinner.bidderId, seller.id, 'Seller must never be the winning bidder');
assert.strictEqual(sanitizedWinner.bidderId, 'user-winner-1', 'Highest legitimate non-seller bidder must win');
assert.strictEqual(sanitizedWinner.amount, 96000);

console.log('✓ Test 2 Passed: Seller shill bids are filtered out; only legitimate non-seller can win.');

// ── Test 3: Tie-Breaking Rules ──────────────────────────────────────────────
console.log('Test 3: Tie-breaking rules (earlier timestamp wins)');

const auctionWithTiedBids = {
  ...endedAuctionWithBids,
  bidHistory: [
    // Later bid of same amount
    { id: 'b-tie-late', bidder: 'Late Bidder', bidderId: 'u-late', amount: 96000, timestamp: now - 3700000 },
    // Earlier bid of same amount
    { id: 'b-tie-early', bidder: 'Early Bidder', bidderId: 'u-early', amount: 96000, timestamp: now - 3900000 }
  ]
};

const tieWinner = getAuthoritativeAuctionWinner(auctionWithTiedBids);
assert.strictEqual(tieWinner.bidderId, 'u-early', 'Earlier timestamp must win in case of tied bid amounts');

console.log('✓ Test 3 Passed: Verified tie-breaking rule resolves to earlier timestamp.');

// ── Test 4: Meeting Access and Exact Button Labels ─────────────────────────
console.log('Test 4: Meeting access and button labels ("Enter Meeting" vs "Meet Winner")');

// 4a: Winning buyer gets "Enter Meeting"
const winnerAccess = getMeetingAccess(endedAuctionWithBids, winningBuyer);
assert.strictEqual(winnerAccess.canAccessMeeting, true);
assert.strictEqual(winnerAccess.isWinningBuyer, true);
assert.strictEqual(winnerAccess.isSeller, false);
assert.strictEqual(winnerAccess.userMeetingRole, 'buyer');
assert.strictEqual(winnerAccess.buttonLabel, 'Enter Meeting');

// 4b: Seller gets "Meet Winner"
const sellerAccess = getMeetingAccess(endedAuctionWithBids, seller);
assert.strictEqual(sellerAccess.canAccessMeeting, true);
assert.strictEqual(sellerAccess.isWinningBuyer, false);
assert.strictEqual(sellerAccess.isSeller, true);
assert.strictEqual(sellerAccess.userMeetingRole, 'seller');
assert.strictEqual(sellerAccess.buttonLabel, 'Meet Winner');

// 4c: Outbid buyer is denied access (no button)
const outbidAccess = getMeetingAccess(endedAuctionWithBids, outbidBuyer);
assert.strictEqual(outbidAccess.canAccessMeeting, false);
assert.strictEqual(outbidAccess.buttonLabel, null);

// 4d: Random authenticated visitor is denied access (no button)
const strangerAccess = getMeetingAccess(endedAuctionWithBids, strangerUser);
assert.strictEqual(strangerAccess.canAccessMeeting, false);
assert.strictEqual(strangerAccess.buttonLabel, null);

// 4e: Anonymous guest is denied access (no button)
const anonAccess = getMeetingAccess(endedAuctionWithBids, null);
assert.strictEqual(anonAccess.canAccessMeeting, false);
assert.strictEqual(anonAccess.buttonLabel, null);

// 4f: Active auction has no meeting buttons for anyone
const activeBuyerAccess = getMeetingAccess(activeAuction, winningBuyer);
assert.strictEqual(activeBuyerAccess.canAccessMeeting, false);
assert.strictEqual(activeBuyerAccess.buttonLabel, null);

const activeSellerAccess = getMeetingAccess(activeAuction, seller);
assert.strictEqual(activeSellerAccess.canAccessMeeting, false);
assert.strictEqual(activeSellerAccess.buttonLabel, null);

// 4g: Cancelled auction has no meeting buttons
const cancelledBuyerAccess = getMeetingAccess(cancelledAuction, winningBuyer);
assert.strictEqual(cancelledBuyerAccess.canAccessMeeting, false);
assert.strictEqual(cancelledBuyerAccess.buttonLabel, null);

console.log('✓ Test 4 Passed: Winning buyer gets "Enter Meeting", seller gets "Meet Winner", all unauthorized users denied.');

console.log('==================================================');
console.log('ALL WINNER MEETING TESTS PASSED! (4 / 4 test suites)');
console.log('==================================================');
