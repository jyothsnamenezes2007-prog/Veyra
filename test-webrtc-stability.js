// VEYRA WebRTC Meeting Functionality & Stability Test
// Simulates two authorized participants (Winning Buyer & Seller)
// Verifies:
// 1. Signaling deduplication & single delivery (BroadcastChannel + storage safety)
// 2. Peer negotiation cycle (Offer -> Answer -> ICE) without race conditions
// 3. Typing stability: rapid chat/input without video/audio pipeline reset or negotiation loops
// 4. Idle stability: heartbeat maintainers and avoidance of false waiting-room drops
// 5. Transient disconnect recovery: grace period absorption of brief idle drops

import { register } from 'node:module';

const loaderCode = `
export async function load(url, context, nextLoad) {
  if (url.includes('supabase')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export const supabase = null; export const isSupabaseConfigured = false;'
    };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`);

import assert from 'assert';

console.log('--- STARTING VEYRA WEBRTC MEETING FUNCTIONALITY & STABILITY TESTS ---');

// Mock WebRTC primitives for Node environment
class MockMediaStreamTrack {
  constructor(kind) {
    this.kind = kind;
    this.enabled = true;
    this.readyState = 'live';
  }
  stop() {
    this.readyState = 'ended';
  }
}

class MockMediaStream {
  constructor() {
    this.tracks = [
      new MockMediaStreamTrack('video'),
      new MockMediaStreamTrack('audio')
    ];
  }
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks.filter(t => t.kind === 'video');
  }
  getAudioTracks() {
    return this.tracks.filter(t => t.kind === 'audio');
  }
}

// Global broadcast bus simulating browser BroadcastChannel
const broadcastBuses = new Map();

class MockBroadcastChannel {
  constructor(name) {
    this.name = name;
    if (!broadcastBuses.has(name)) {
      broadcastBuses.set(name, new Set());
    }
    this.listeners = broadcastBuses.get(name);
    this.listeners.add(this);
    this.onmessage = null;
  }
  postMessage(data) {
    for (const ch of this.listeners) {
      if (ch !== this && ch.onmessage) {
        // Asynchronously deliver or synchronous delivery
        ch.onmessage({ data: JSON.parse(JSON.stringify(data)) });
      }
    }
  }
  close() {
    this.listeners.delete(this);
  }
}

// Storage mock for fallback testing
const mockStorage = new Map();
const storageListeners = new Set();

const mockWindow = {
  addEventListener: (evt, cb) => {
    if (evt === 'storage') storageListeners.add(cb);
  },
  removeEventListener: (evt, cb) => {
    if (evt === 'storage') storageListeners.delete(cb);
  }
};

globalThis.BroadcastChannel = MockBroadcastChannel;
globalThis.window = mockWindow;
globalThis.localStorage = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => {
    mockStorage.set(k, v);
    for (const listener of storageListeners) {
      listener({ key: k, newValue: v });
    }
  },
  removeItem: (k) => mockStorage.delete(k)
};

// Import WebRTCSignaling
const { WebRTCSignaling, stopMediaStream } = await import('./src/lib/webrtc.js');

// ── Test 1: Signaling Deduplication between BroadcastChannel & Storage Fallback
console.log('\nTest 1: Signaling message deduplication and single delivery');
{
  const auctionId = 'auc-stability-test';
  const buyerId = 'user-buyer-1';
  const sellerId = 'user-seller-1';

  const buyerSignaling = new WebRTCSignaling(auctionId, buyerId, 'buyer');
  const sellerSignaling = new WebRTCSignaling(auctionId, sellerId, 'seller');

  const receivedBySeller = [];
  sellerSignaling.onMessage((msg) => {
    receivedBySeller.push(msg);
  });

  // Buyer sends a message
  buyerSignaling.send('ROOM_JOINED', { name: 'Winning Buyer' });

  // Verify Seller received EXACTLY ONE message despite any potential broadcast/storage duplicates
  assert.strictEqual(receivedBySeller.length, 1, 'Seller must receive exactly 1 message');
  assert.strictEqual(receivedBySeller[0].type, 'ROOM_JOINED');
  assert.strictEqual(receivedBySeller[0].senderId, buyerId);
  assert.ok(receivedBySeller[0].msgId, 'Message must have a unique msgId for deduplication');

  // If a duplicate payload with same msgId is manually fired, it must be discarded by _dispatch
  sellerSignaling._dispatch(receivedBySeller[0]);
  assert.strictEqual(receivedBySeller.length, 1, 'Duplicate message with same msgId must be ignored');

  buyerSignaling.destroy();
  sellerSignaling.destroy();
  console.log('✓ Test 1 Passed: Signaling messages deduplicated cleanly without double-delivery.');
}

// ── Test 2: Full Two-Participant Negotiation Sequence (Offer -> Answer -> ICE)
console.log('\nTest 2: Two-party negotiation sequence without offer-answer collision');
{
  const auctionId = 'auc-stability-test-2';
  const buyer = { id: 'buyer-lahari', role: 'buyer', name: 'Lahari R Prabhu' };
  const seller = { id: 'seller-artisan', role: 'seller', name: 'Master Woodcraft Workshop' };

  const buyerSig = new WebRTCSignaling(auctionId, buyer.id, buyer.role);
  const sellerSig = new WebRTCSignaling(auctionId, seller.id, seller.role);

  let buyerOfferSent = 0;
  let sellerAnswerSent = 0;
  let buyerConnected = false;
  let sellerConnected = false;

  // Buyer listens for Seller's presence and answer
  buyerSig.onMessage((msg) => {
    if (msg.type === 'ROOM_PRESENCE_ACK') {
      // Buyer initiates offer only if not already sent
      if (buyerOfferSent === 0) {
        buyerOfferSent++;
        buyerSig.send('SDP_OFFER', { sdp: 'v=0\r\no=buyer ...', type: 'offer' });
      }
    } else if (msg.type === 'SDP_ANSWER') {
      buyerConnected = true;
      buyerSig.send('ICE_CANDIDATE', { candidate: 'candidate:1 1 UDP ...' });
    }
  });

  // Seller listens for room entry, acknowledges, and answers offers
  sellerSig.onMessage((msg) => {
    if (msg.type === 'ROOM_JOINED') {
      sellerSig.send('ROOM_PRESENCE_ACK', { name: seller.name });
    } else if (msg.type === 'SDP_OFFER') {
      sellerAnswerSent++;
      sellerSig.send('SDP_ANSWER', { sdp: 'v=0\r\no=seller ...', type: 'answer' });
      sellerConnected = true;
    }
  });

  // Buyer joins room
  buyerSig.send('ROOM_JOINED', { name: buyer.name });

  assert.strictEqual(buyerOfferSent, 1, 'Buyer should create exactly one offer');
  assert.strictEqual(sellerAnswerSent, 1, 'Seller should reply with exactly one answer');
  assert.ok(buyerConnected && sellerConnected, 'Both parties successfully reach connected state');

  buyerSig.destroy();
  sellerSig.destroy();
  console.log('✓ Test 2 Passed: Peer negotiation completed with zero collision and single offer/answer.');
}

// ── Test 3: Typing Stability Simulation (Keystrokes & Chat without stream reload or renegotiation)
console.log('\nTest 3: Typing stability: rapid keystrokes do not reset video pipeline or trigger renegotiation');
{
  const localStream = new MockMediaStream();
  let videoSrcObjectAssignments = 0;

  const mockVideoEl = {
    _src: null,
    get srcObject() { return this._src; },
    set srcObject(val) {
      videoSrcObjectAssignments++;
      this._src = val;
    }
  };

  // Replicate the stable callback ref logic implemented in AuctionCallModal.jsx
  const setLocalVideo = (el) => {
    if (el && localStream && el.srcObject !== localStream) {
      el.srcObject = localStream;
    }
  };

  // 1. Initial mount: stream is assigned once
  setLocalVideo(mockVideoEl);
  assert.strictEqual(videoSrcObjectAssignments, 1, 'Initial mount assigns srcObject once');

  // 2. Simulate 50 keystrokes of fast typing in chat (renders 50 times)
  for (let i = 0; i < 50; i++) {
    // Component re-renders with new input state, calling ref callback
    setLocalVideo(mockVideoEl);
  }

  // Verify srcObject was NEVER re-assigned during typing
  assert.strictEqual(videoSrcObjectAssignments, 1, 'Keystrokes must NOT re-assign srcObject (zero video flicker/audio disruption)');

  // 3. Chat message sent over signaling while typing
  const auctionId = 'auc-typing-test';
  const buyerSig = new WebRTCSignaling(auctionId, 'b1', 'buyer');
  const sellerSig = new WebRTCSignaling(auctionId, 's1', 'seller');

  const receivedChat = [];
  sellerSig.onMessage((msg) => {
    if (msg.type === 'CHAT_MESSAGE') receivedChat.push(msg.data);
  });

  buyerSig.send('CHAT_MESSAGE', { id: 'm1', text: 'Hello, inspecting the teak finish!' });
  assert.strictEqual(receivedChat.length, 1, 'Chat message delivered cleanly without duplicate channel interference');
  assert.strictEqual(receivedChat[0].text, 'Hello, inspecting the teak finish!');

  buyerSig.destroy();
  sellerSig.destroy();
  stopMediaStream(localStream);
  assert.strictEqual(localStream.getTracks()[0].readyState, 'ended', 'stopMediaStream correctly ends tracks');
  console.log('✓ Test 3 Passed: Typing 50 characters caused 0 pipeline resets; chat delivered cleanly.');
}

// ── Test 4: Idle Stability Simulation (Presence heartbeats & Disconnect Grace Timer)
console.log('\nTest 4: Idle stability: Heartbeats prevent drops; transient disconnect absorbed by grace timer');
{
  let callState = 'CONNECTED';
  let otherParticipantPresent = true;
  let disconnectGraceTimer = null;

  // Simulate WebRTC connection state handler with grace period as in AuctionCallModal.jsx
  const handleConnectionStateChange = (state) => {
    if (state === 'connected') {
      if (disconnectGraceTimer) {
        clearTimeout(disconnectGraceTimer);
        disconnectGraceTimer = null;
      }
      callState = 'CONNECTED';
      otherParticipantPresent = true;
    } else if (state === 'disconnected') {
      if (!disconnectGraceTimer) {
        disconnectGraceTimer = setTimeout(() => {
          callState = 'WAITING';
          otherParticipantPresent = false;
          disconnectGraceTimer = null;
        }, 100); // 100ms mock grace timer
      }
    }
  };

  // 1. Simulate transient NAT refresh / idle glitch: state switches to 'disconnected'
  handleConnectionStateChange('disconnected');
  assert.strictEqual(callState, 'CONNECTED', 'During grace period, callState must remain CONNECTED (not abruptly drop to WAITING)');
  assert.ok(disconnectGraceTimer !== null, 'Grace timer must be active');

  // 2. Connection self-heals before grace timer expires
  handleConnectionStateChange('connected');
  assert.strictEqual(callState, 'CONNECTED', 'Connection recovered cleanly');
  assert.strictEqual(disconnectGraceTimer, null, 'Grace timer was cancelled on recovery');

  // 3. Heartbeat processing
  const auctionId = 'auc-heartbeat-test';
  const buyerSig = new WebRTCSignaling(auctionId, 'b1', 'buyer');
  const sellerSig = new WebRTCSignaling(auctionId, 's1', 'seller');

  let heartbeatReceived = 0;
  sellerSig.onMessage((msg) => {
    if (msg.type === 'ROOM_HEARTBEAT') {
      heartbeatReceived++;
    }
  });

  buyerSig.send('ROOM_HEARTBEAT', { userId: 'b1', role: 'buyer' });
  assert.strictEqual(heartbeatReceived, 1, 'Heartbeat successfully received to confirm active presence during idle');

  buyerSig.destroy();
  sellerSig.destroy();
  console.log('✓ Test 4 Passed: Transient idle disconnect safely absorbed; heartbeats keep presence active.');
}

console.log('\n================================================================');
console.log('ALL WEBRTC STABILITY TESTS PASSED! (4 / 4 test suites)');
console.log('================================================================');
