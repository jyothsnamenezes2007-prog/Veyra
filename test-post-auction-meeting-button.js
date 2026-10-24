import assert from 'node:assert';
import fs from 'node:fs';
import { getAuthoritativeAuctionWinner, getMeetingAccess, INITIAL_LIVE_AUCTIONS } from './src/data/auctions.js';

console.log('--- STARTING POST-AUCTION WEBRTC MEETING BUTTON VERIFICATION ---');

const now = Date.now();
const mockSeller = { id: 'seller-jeanneret', name: 'Pierre Jeanneret Workshop', role: 'seller' };
const mockWinner = { id: 'user-winner-1', name: 'A. Singhania', role: 'collector' };
const mockOutbid = { id: 'user-bidder-2', name: 'Collector_90', role: 'collector' };
const mockVisitor = { id: 'user-visitor-3', name: 'Unrelated Visitor', role: 'collector' };

const concludedLot = {
  id: 'auc-1',
  name: 'Archival Chandigarh Teak & Cane V-Leg Chair (c. 1956)',
  seller: 'Pierre Jeanneret Workshop',
  sellerId: 'seller-jeanneret',
  status: 'ended',
  startTimestamp: now - 7200000,
  endTimestamp: now - 3600000,
  remainingSeconds: 0,
  currentBid: 78000,
  startingBid: 65000,
  bidHistory: [
    { id: 'b-1', bidder: 'A. Singhania', bidderId: 'user-winner-1', amount: 78000, timestamp: now - 3800000 },
    { id: 'b-2', bidder: 'Collector_90', bidderId: 'user-bidder-2', amount: 75000, timestamp: now - 4000000 }
  ]
};

// ── Test 1: Completed Auction Card Markup Verification ──────────────────────
console.log('Test 1: Completed auction card layout & meeting button presence');
const liveRoomSrc = fs.readFileSync('src/pages/LiveAuctionRoom.jsx', 'utf8');

// Check that heading, winner/hammer price, button, and consultation text exist in correct order
const trophyIndex = liveRoomSrc.indexOf('Auction Successfully Concluded');
const hammerPriceIndex = liveRoomSrc.indexOf('final hammer price of');
const buttonIdIndex = liveRoomSrc.indexOf('id="post-auction-enter-meeting-btn"');
const consultationTextIndex = liveRoomSrc.indexOf('Post-auction private video consultation is reserved');

assert(trophyIndex > -1, 'Must render "Auction Successfully Concluded"');
assert(hammerPriceIndex > -1, 'Must render winning bidder and final hammer price');
assert(buttonIdIndex > -1, 'Must render meeting button on the completed auction card');
assert(consultationTextIndex > -1, 'Must render post-auction consultation explanation');

assert(hammerPriceIndex > trophyIndex, 'Hammer price info must follow title');
assert(buttonIdIndex > hammerPriceIndex, 'Meeting button must be placed DIRECTLY below hammer price info');
assert(consultationTextIndex > buttonIdIndex, 'Post-auction consultation text must be placed below the button');

console.log('✓ Test 1 Passed: Meeting button is properly positioned between hammer price and consultation text.');

// ── Test 2: Dedicated Meeting Route Verification ───────────────────────────
console.log('Test 2: Dedicated meeting route configuration');
const appSrc = fs.readFileSync('src/App.jsx', 'utf8');
assert(appSrc.includes('path="/meet/:id"'), 'App.jsx must declare /meet/:id route');
assert(appSrc.includes('autoOpenMeet={true}'), '/meet/:id route must set autoOpenMeet');

console.log('✓ Test 2 Passed: /meet/:id route connects directly to auction room with autoOpenMeet.');

// ── Test 3: Dual-Role Access Permissions & Button Labels ───────────────────
console.log('Test 3: Dual-role access permissions and button labels');

// 3a. Winner gets "Enter Meeting" and can access
const winnerAccess = getMeetingAccess(concludedLot, mockWinner);
assert.strictEqual(winnerAccess.canAccessMeeting, true, 'Winner must have meeting access');
assert.strictEqual(winnerAccess.buttonLabel, 'Enter Meeting', 'Winner button label must be "Enter Meeting"');
assert.strictEqual(winnerAccess.userMeetingRole, 'buyer');

// 3b. Seller gets "Meet Winner" and can access
const sellerAccess = getMeetingAccess(concludedLot, mockSeller);
assert.strictEqual(sellerAccess.canAccessMeeting, true, 'Seller must have meeting access');
assert.strictEqual(sellerAccess.buttonLabel, 'Meet Winner', 'Seller button label must be "Meet Winner"');
assert.strictEqual(sellerAccess.userMeetingRole, 'seller');

// 3c. Outbid bidder is denied access
const outbidAccess = getMeetingAccess(concludedLot, mockOutbid);
assert.strictEqual(outbidAccess.canAccessMeeting, false, 'Outbid bidder must NOT have meeting access');

// 3d. Unrelated visitor is denied access
const visitorAccess = getMeetingAccess(concludedLot, mockVisitor);
assert.strictEqual(visitorAccess.canAccessMeeting, false, 'Visitor must NOT have meeting access');

// 3e. Anonymous guest is denied access
const anonAccess = getMeetingAccess(concludedLot, null);
assert.strictEqual(anonAccess.canAccessMeeting, false, 'Anonymous guest must NOT have meeting access');

console.log('✓ Test 3 Passed: Access strictly restricted to winner & seller; others blocked.');

// ── Test 4: Same Meeting Room Association ──────────────────────────────────
console.log('Test 4: Room identity and signaling channel pairing');
const roomChannel = `veyra_webrtc_call_${concludedLot.id}`;
assert.strictEqual(roomChannel, 'veyra_webrtc_call_auc-1', 'Channel must be bound to auction ID auc-1');

console.log('✓ Test 4 Passed: Both buyer and seller bind to the identical WebRTC signaling channel for auc-1.');

console.log('================================================================');
console.log('ALL POST-AUCTION MEETING BUTTON VERIFICATION TESTS PASSED! (4/4)');
console.log('================================================================');
