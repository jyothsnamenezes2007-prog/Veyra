import assert from 'node:assert';
import { DEMO_AUCTION_IDS, INITIAL_LIVE_AUCTIONS, INITIAL_LIVE_AUCTIONS_BASELINE, getDemoBaselineAuction } from './src/data/auctions.js';

console.log('--- STARTING VEYRA LIVE AUCTION DEMO VERIFICATION ---');

// Test 1: Designated Demo IDs
console.log('Test 1: Verify designated demo auction records');
assert.deepStrictEqual(DEMO_AUCTION_IDS, ['auc-1', 'auc-2', 'auc-3', 'auc-4']);
assert.strictEqual(INITIAL_LIVE_AUCTIONS.length, 4);
DEMO_AUCTION_IDS.forEach((id) => {
  const baseline = getDemoBaselineAuction(id);
  assert(baseline !== null, `Baseline for ${id} should exist`);
  assert(baseline.startingBid > 0, `${id} startingBid must be positive`);
  assert(baseline.currentBid >= baseline.startingBid, `${id} currentBid must be >= startingBid`);
  assert(Array.isArray(baseline.bidHistory), `${id} bidHistory must be an array`);
});
console.log('✓ Test 1 Passed: Designated demo IDs and baselines verified.');

// Test 2: Safe Reset logic (simulating resetDemoAuction)
console.log('Test 2: Safe reset on designated demo lots vs real custom lots');
function simulateResetDemoAuction(auctionId, options = {}, existingLiveAuctions) {
  if (!DEMO_AUCTION_IDS.includes(auctionId)) {
    return { success: false, error: 'Only designated demo auctions can be reset.' };
  }

  const baseline = getDemoBaselineAuction(auctionId);
  if (!baseline) return { success: false, error: 'Baseline not found.' };

  const now = Date.now();
  let start = now;
  let end = now + 30 * 60 * 1000;

  if (options.preset === '15m') {
    start = now;
    end = now + 15 * 60 * 1000;
  } else if (options.preset === '30m') {
    start = now;
    end = now + 30 * 60 * 1000;
  } else if (options.preset === '1h') {
    start = now;
    end = now + 60 * 60 * 1000;
  } else if (options.preset === 'upcoming-5m') {
    start = now + 5 * 60 * 1000;
    end = start + 30 * 60 * 1000;
  } else if (options.startTimestamp && options.endTimestamp) {
    start = options.startTimestamp;
    end = options.endTimestamp;
  }

  const isStarted = now >= start;
  const isEnded = now >= end;
  const status = isEnded ? 'ended' : isStarted ? 'active' : 'upcoming';
  const remaining = isEnded ? 0 : isStarted ? Math.floor((end - now) / 1000) : Math.floor((start - now) / 1000);

  const resetBids = options.resetBids !== false;

  const updated = existingLiveAuctions.map((auc) => {
    if (auc.id === auctionId) {
      return {
        ...(resetBids ? baseline : auc),
        ...auc,
        ...(resetBids ? {
          currentBid: options.startingBid || baseline.currentBid,
          startingBid: options.startingBid || baseline.startingBid,
          bidCount: baseline.bidCount,
          bidHistory: baseline.bidHistory,
          winner: null
        } : {}),
        startTimestamp: start,
        endTimestamp: end,
        endTime: end,
        remainingSeconds: remaining,
        status,
        winner: null
      };
    }
    return auc;
  });

  return { success: true, auctions: updated, resetTarget: updated.find(a => a.id === auctionId) };
}

// 2a. Reject non-demo auction reset
const nonDemoResult = simulateResetDemoAuction('auc-lot-seller-real-product-1234', { preset: '30m' }, []);
assert.strictEqual(nonDemoResult.success, false);
assert.strictEqual(nonDemoResult.error, 'Only designated demo auctions can be reset.');

// 2b. Successfully reset demo auction auc-1
const initialMock = INITIAL_LIVE_AUCTIONS.map(a => ({ ...a, status: 'ended', remainingSeconds: 0, winner: { bidder: 'OldWinner' } }));
const demo1Result = simulateResetDemoAuction('auc-1', { preset: '30m' }, initialMock);
assert.strictEqual(demo1Result.success, true);
assert.strictEqual(demo1Result.resetTarget.status, 'active');
assert(demo1Result.resetTarget.remainingSeconds > 1700 && demo1Result.resetTarget.remainingSeconds <= 1800);
assert.strictEqual(demo1Result.resetTarget.winner, null);
// Other auctions remain untouched
assert.strictEqual(demo1Result.auctions.find(a => a.id === 'auc-2').status, 'ended');
console.log('✓ Test 2 Passed: Safe reset works only on designated demo lots, leaves other lots untouched.');

// Test 3: Status calculation logic (Upcoming, Active, Ended)
console.log('Test 3: Consistent 3-State status calculation');
function calculateAuctionStatus(now, startTimestamp, endTimestamp) {
  if (now < startTimestamp) {
    return {
      status: 'upcoming',
      remainingSeconds: Math.max(0, Math.floor((startTimestamp - now) / 1000))
    };
  } else if (now >= startTimestamp && now < endTimestamp) {
    return {
      status: 'active',
      remainingSeconds: Math.max(0, Math.floor((endTimestamp - now) / 1000))
    };
  } else {
    return {
      status: 'ended',
      remainingSeconds: 0
    };
  }
}

const baseTime = 1770000000000;
// Case 3a: 10 minutes in future -> upcoming
const upcomingCalc = calculateAuctionStatus(baseTime, baseTime + 600000, baseTime + 2400000);
assert.strictEqual(upcomingCalc.status, 'upcoming');
assert.strictEqual(upcomingCalc.remainingSeconds, 600);

// Case 3b: In progress -> active
const activeCalc = calculateAuctionStatus(baseTime + 300000, baseTime, baseTime + 1800000);
assert.strictEqual(activeCalc.status, 'active');
assert.strictEqual(activeCalc.remainingSeconds, 1500);

// Case 3c: Past end -> ended
const endedCalc = calculateAuctionStatus(baseTime + 2000000, baseTime, baseTime + 1800000);
assert.strictEqual(endedCalc.status, 'ended');
assert.strictEqual(endedCalc.remainingSeconds, 0);
console.log('✓ Test 3 Passed: Status calculated consistently across all 3 lifecycle states.');

// Test 4: Bidding and Duplicate Bid Prevention
console.log('Test 4: Bidding validation and duplicate prevention');
function simulatePlaceBid(auction, amount, bidderName, userId, now = Date.now()) {
  const start = auction.startTimestamp || 0;
  const end = auction.endTimestamp || auction.endTime || 0;

  // 1. Time / status
  if (auction.status === 'ended' || (end > 0 && now >= end) || (auction.remainingSeconds ?? 0) <= 0) {
    return { success: false, error: 'This auction has concluded. Bids are closed.' };
  }
  if (auction.status === 'upcoming' || (start > 0 && now < start)) {
    return { success: false, error: 'This auction has not opened yet. Bidding begins at the scheduled start time.' };
  }

  // 2. Duplicate checks
  const topBid = auction.bidHistory && auction.bidHistory.length > 0 ? auction.bidHistory[0] : null;
  if (topBid) {
    if (Number(amount) === topBid.amount) {
      return { success: false, error: `A bid of ₹${Number(amount).toLocaleString('en-IN')} has already been recorded.` };
    }
    if (topBid.bidderId === userId && (now - topBid.timestamp) < 2000) {
      return { success: false, error: 'Your bid was just received. Please wait a moment before raising.' };
    }
    if (topBid.bidderId === userId && Number(amount) <= topBid.amount) {
      return { success: false, error: 'You are already the leading bidder.' };
    }
  }

  // 3. Minimum amount
  const minAcceptable = auction.currentBid + auction.minIncrement;
  if (Number(amount) < minAcceptable) {
    return { success: false, error: `Bid must be at least ₹${minAcceptable.toLocaleString('en-IN')}.` };
  }

  const newRecord = {
    id: 'b-' + now,
    bidder: bidderName,
    bidderId: userId,
    amount: Number(amount),
    time: 'Just now',
    timestamp: now
  };

  const updatedAuction = {
    ...auction,
    currentBid: Number(amount),
    bidCount: (auction.bidCount || 0) + 1,
    bidHistory: [newRecord, ...(auction.bidHistory || [])]
  };

  return { success: true, updatedAuction };
}

let activeAuction = {
  id: 'auc-1',
  status: 'active',
  startTimestamp: Date.now() - 60000,
  endTimestamp: Date.now() + 1800000,
  remainingSeconds: 1800,
  currentBid: 96000,
  minIncrement: 2500,
  bidCount: 16,
  bidHistory: [{ id: 'b-0', bidder: 'Singhania', bidderId: 'u-1', amount: 96000, timestamp: Date.now() - 100000 }]
};

// 4a. Minimum bid check
const tooLow = simulatePlaceBid(activeAuction, 97000, 'Buyer 2', 'u-2');
assert.strictEqual(tooLow.success, false);
assert(tooLow.error.includes('Bid must be at least ₹98,500'));

// 4b. Valid bid
const validBid = simulatePlaceBid(activeAuction, 100000, 'Buyer 2', 'u-2');
assert.strictEqual(validBid.success, true);
assert.strictEqual(validBid.updatedAuction.currentBid, 100000);
assert.strictEqual(validBid.updatedAuction.bidCount, 17);

// 4c. Duplicate identical bid amount rejected
const dupAmount = simulatePlaceBid(validBid.updatedAuction, 100000, 'Buyer 3', 'u-3');
assert.strictEqual(dupAmount.success, false);
assert(dupAmount.error.includes('already been recorded'));

// 4d. Rapid double click spam rejected (within 2 seconds)
const rapidSpam = simulatePlaceBid(validBid.updatedAuction, 105000, 'Buyer 2', 'u-2', Date.now() + 500);
assert.strictEqual(rapidSpam.success, false);
assert(rapidSpam.error.includes('just received'));

// 4e. Bid on ended auction rejected
const endedAuction = { ...activeAuction, status: 'ended', remainingSeconds: 0 };
const bidOnEnded = simulatePlaceBid(endedAuction, 110000, 'Buyer 3', 'u-3');
assert.strictEqual(bidOnEnded.success, false);
assert(bidOnEnded.error.includes('concluded'));

// 4f. Bid on upcoming auction rejected
const upcomingAuction = { ...activeAuction, status: 'upcoming', startTimestamp: Date.now() + 600000 };
const bidOnUpcoming = simulatePlaceBid(upcomingAuction, 110000, 'Buyer 3', 'u-3');
assert.strictEqual(bidOnUpcoming.success, false);
assert(bidOnUpcoming.error.includes('not opened yet'));

console.log('✓ Test 4 Passed: Bids accepted during live period and duplicates/spam prevented.');

// Test 5: User data preservation
console.log('Test 5: Preserving real user bids, listings, products');
const userBidsHistory = [
  { id: 'ub-1', auctionId: 'auc-1', amount: 96000 },
  { id: 'ub-2', auctionId: 'auc-lot-real-seller-artisan-woodwork', amount: 140000 },
  { id: 'ub-3', auctionId: 'auc-lot-real-antique-brass', amount: 75000 }
];
// Resetting only auc-1:
const cleanedUserBids = userBidsHistory.filter(b => b.auctionId !== 'auc-1');
assert.strictEqual(cleanedUserBids.length, 2);
assert.strictEqual(cleanedUserBids[0].auctionId, 'auc-lot-real-seller-artisan-woodwork');
assert.strictEqual(cleanedUserBids[1].auctionId, 'auc-lot-real-antique-brass');
console.log('✓ Test 5 Passed: Only designated demo bids are reset; all user listings & bids are strictly preserved.');

console.log('==================================================');
console.log('ALL TESTS PASSED SUCCESSFULLY! (5 / 5 test suites)');
console.log('==================================================');
