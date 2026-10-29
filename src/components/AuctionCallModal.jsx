import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  PhoneCall,
  ShieldCheck,
  AlertTriangle,
  X,
  Volume2,
  Clock,
  Send,
  MessageSquare,
  Loader2,
  UserCheck,
  CheckCircle2,
  CreditCard,
  Lock,
  RefreshCw
} from 'lucide-react';
import { WebRTCSignaling, RTC_CONFIGURATION, stopMediaStream } from '../lib/webrtc';
import { getMeetingAccess } from '../data/auctions';
import { useToast } from '../context/ToastContext';

// ─── Razorpay Script Loader ───────────────────────────────────────────────────
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.Razorpay) {
      return resolve(true);
    }
    const existing = typeof document !== 'undefined' ? document.querySelector('script[src*="checkout.razorpay.com"]') : null;
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_MESSAGE_LENGTH = 500;

const meetMessagesKey = (auctionId) => `veyra_meet_messages_${auctionId}`;

// ─── Persistence helpers ──────────────────────────────────────────────────────
const loadMessages = (auctionId) => {
  try {
    const raw = localStorage.getItem(meetMessagesKey(auctionId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const persistMessages = (auctionId, msgs) => {
  try {
    localStorage.setItem(meetMessagesKey(auctionId), JSON.stringify(msgs));
  } catch {
    // ignore
  }
};

// ─── Timestamp formatter ──────────────────────────────────────────────────────
const formatTime = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDuration = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// ─────────────────────────────────────────────────────────────────────────────
export const AuctionCallModal = ({ auction, currentUser, onClose }) => {
  const { addToast } = useToast();

  // ── Authoritative Role & Meeting Access Detection ───────────────────────────
  const access = getMeetingAccess(auction, currentUser);
  const isAuthorized = access.canAccessMeeting;
  const userRole = access.userMeetingRole || 'buyer';
  const isWinningBuyer = access.isWinningBuyer;
  const isSeller = access.isSeller;
  const winnerName = access.winner?.bidder || access.winner?.userName || access.winner?.user || 'Winning Collector';
  const sellerName = auction?.seller || auction?.maker || 'Artisan Workshop';
  const currentDisplayName =
    (currentUser?.name && currentUser.name !== 'Complete your profile' && currentUser.name !== 'undefined' && currentUser.name !== 'null'
      ? currentUser.name
      : null) ||
    currentUser?.username ||
    currentUser?.displayName ||
    (userRole === 'seller' ? sellerName : winnerName) ||
    'Participant';

  // ── State ──────────────────────────────────────────────────────────────────
  // States: 'INIT' | 'WAITING' | 'CONNECTING' | 'CONNECTED' | 'ENDED' | 'ERROR'
  const [callState, setCallState] = useState('INIT');
  const [errorMessage, setErrorMessage] = useState('');
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [meetMessages, setMeetMessages] = useState(() => loadMessages(auction?.id));
  const [meetInput, setMeetInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatError, setChatError] = useState('');
  const [otherParticipantPresent, setOtherParticipantPresent] = useState(false);

  // ── Payment & Settlement State ──────────────────────────────────────────────
  const [paymentStatus, setPaymentStatus] = useState(auction?.paymentStatus || 'pending'); // 'pending' | 'verifying' | 'completed' | 'failed'
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [paymentError, setPaymentError] = useState('');
  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);

  // Authoritative settlement amount based on winning bid / hammer price
  const paymentAmount = Math.round(
    Number(auction?.winningBid || auction?.winner?.amount || auction?.currentBid || auction?.startingBid || 0)
  );

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const remoteVideoRef = useRef(null);
  const chatEndRef = useRef(null);

  // ── Stable refs for WebRTC callbacks ────────────────────────────────────────
  const callStateRef = useRef('INIT');
  const isSellerRef = useRef(isSeller);
  const isWinningBuyerRef = useRef(isWinningBuyer);
  const auctionIdRef = useRef(auction?.id);
  const currentUserRef = useRef(currentUser);
  const onCloseRef = useRef(onClose);
  const addToastRef = useRef(addToast);
  const userRoleRef = useRef(userRole);

  const localVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const signalingRef = useRef(null);
  const durationTimerRef = useRef(null);
  const disconnectGraceTimerRef = useRef(null);
  const isNegotiatingRef = useRef(false);
  const iceCandidateQueueRef = useRef([]);
  const remoteDescSetRef = useRef(false);
  const setMeetMessagesRef = useRef(setMeetMessages);

  // Keep refs synchronized each render
  callStateRef.current = callState;
  isSellerRef.current = isSeller;
  isWinningBuyerRef.current = isWinningBuyer;
  auctionIdRef.current = auction?.id;
  currentUserRef.current = currentUser;
  onCloseRef.current = onClose;
  addToastRef.current = addToast;
  userRoleRef.current = userRole;
  setMeetMessagesRef.current = setMeetMessages;

  // ── Stable video element callbacks to avoid re-triggering media reload on typing ────
  const localVideoCallbackRef = useCallback((el) => {
    localVideoRef.current = el;
    if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
      el.srcObject = localStreamRef.current;
    }
  }, []);

  const remoteVideoCallbackRef = useCallback((el) => {
    remoteVideoRef.current = el;
    if (el && remoteStreamRef.current && el.srcObject !== remoteStreamRef.current) {
      el.srcObject = remoteStreamRef.current;
    }
  }, []);

  // ── Add chat message helper ─────────────────────────────────────────────────
  const addMessageToState = (msg) => {
    setMeetMessagesRef.current((prev) => {
      // Deduplicate by message ID
      if (prev.some((m) => m.id === msg.id)) return prev;
      const next = [...prev, msg];
      persistMessages(auctionIdRef.current, next);
      return next;
    });
  };

  // ── Drain queued ICE candidates ─────────────────────────────────────────────
  const drainIceCandidateQueue = async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    const queued = iceCandidateQueueRef.current.splice(0);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Failed to add queued ICE candidate', err);
      }
    }
  };

  // ── Obtain local media (Video + Audio) ──────────────────────────────────────
  const obtainLocalMedia = async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Your browser does not support media device capture.');
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true
        });
      } catch (videoErr) {
        // Fallback to audio only if camera is unavailable
        if (
          videoErr.name === 'NotFoundError' ||
          videoErr.name === 'DevicesNotFoundError' ||
          videoErr.name === 'NotReadableError'
        ) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          addToastRef.current('Camera unavailable — connected with audio only.');
        } else {
          throw videoErr;
        }
      }

      localStreamRef.current = stream;
      if (localVideoRef.current && localVideoRef.current.srcObject !== stream) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.error('Media capture error:', err);
      let msg = 'Camera and microphone access is required for the consultation.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Permission denied. Please allow camera and microphone access in your browser.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera or microphone found on this device.';
      } else if (err.name === 'NotReadableError') {
        msg = 'Hardware is currently occupied by another application.';
      }
      setErrorMessage(msg);
      setCallState('ERROR');
      return null;
    }
  };

  // ── Setup RTCPeerConnection ─────────────────────────────────────────────────
  const setupPeerConnection = (stream) => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    iceCandidateQueueRef.current = [];
    remoteDescSetRef.current = false;

    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    peerConnectionRef.current = pc;

    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (disconnectGraceTimerRef.current) {
        clearTimeout(disconnectGraceTimerRef.current);
        disconnectGraceTimerRef.current = null;
      }
      setCallState('CONNECTED');
      setOtherParticipantPresent(true);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && signalingRef.current) {
        signalingRef.current.send('ICE_CANDIDATE', event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        if (disconnectGraceTimerRef.current) {
          clearTimeout(disconnectGraceTimerRef.current);
          disconnectGraceTimerRef.current = null;
        }
        setCallState('CONNECTED');
        setOtherParticipantPresent(true);
      } else if (state === 'disconnected') {
        // Disconnected is an advisory state during idle or NAT refreshes.
        // Use a grace period before reverting to waiting room to avoid premature drops.
        if (!disconnectGraceTimerRef.current) {
          disconnectGraceTimerRef.current = setTimeout(() => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
              setCallState('WAITING');
              setOtherParticipantPresent(false);
            }
            disconnectGraceTimerRef.current = null;
          }, 6000);
        }
      } else if (state === 'failed') {
        if (disconnectGraceTimerRef.current) {
          clearTimeout(disconnectGraceTimerRef.current);
          disconnectGraceTimerRef.current = null;
        }
        setCallState('WAITING');
        setOtherParticipantPresent(false);
      } else if (state === 'closed') {
        if (disconnectGraceTimerRef.current) {
          clearTimeout(disconnectGraceTimerRef.current);
          disconnectGraceTimerRef.current = null;
        }
        if (callStateRef.current === 'CONNECTED') {
          setCallState('WAITING');
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      if (iceState === 'connected' || iceState === 'completed') {
        if (disconnectGraceTimerRef.current) {
          clearTimeout(disconnectGraceTimerRef.current);
          disconnectGraceTimerRef.current = null;
        }
        setCallState('CONNECTED');
        setOtherParticipantPresent(true);
      }
    };

    return pc;
  };

  // ── Initiate WebRTC call (Buyer side creates offer) ─────────────────────────
  const initiateCallOffer = async () => {
    // Guard against duplicate overlapping offers or when already connected
    if (isNegotiatingRef.current) return;
    if (callStateRef.current === 'CONNECTED' && peerConnectionRef.current?.connectionState === 'connected') {
      return;
    }

    try {
      isNegotiatingRef.current = true;
      const stream = localStreamRef.current || (await obtainLocalMedia());
      if (!stream) {
        isNegotiatingRef.current = false;
        return;
      }

      setCallState('CONNECTING');
      const pc = setupPeerConnection(stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signalingRef.current?.send('SDP_OFFER', offer);
    } catch (err) {
      console.error('Error creating offer:', err);
      setErrorMessage('Failed to establish peer connection.');
      setCallState('ERROR');
    } finally {
      isNegotiatingRef.current = false;
    }
  };

  // ── Main WebRTC Room Lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    if (!auction?.id || !currentUser?.id || !isAuthorized) return;

    let isMounted = true;

    // 1. Enter room: acquire media and show waiting room
    const initializeRoom = async () => {
      const stream = await obtainLocalMedia();
      if (!isMounted) return;

      if (stream) {
        setCallState('WAITING');
        // Announce entry into the meeting room
        signalingRef.current?.send('ROOM_JOINED', {
          userId: currentUser.id,
          role: userRole,
          name: currentDisplayName
        });
      }
    };

    // 2. Initialize signaling channel
    const signaling = new WebRTCSignaling(auction.id, currentUser.id, userRole);
    signalingRef.current = signaling;

    const unsubscribe = signaling.onMessage(async (message) => {
      if (!isMounted) return;
      const { type, data } = message;

      const _userRole = userRoleRef.current;
      const _currentUser = currentUserRef.current;

      switch (type) {
        case 'ROOM_JOINED':
          // The other participant has joined or rejoined the room!
          setOtherParticipantPresent(true);
          // Acknowledge our presence in the room
          signaling.send('ROOM_PRESENCE_ACK', {
            userId: _currentUser.id,
            role: _userRole,
            name: currentDisplayName
          });

          // Deterministic initiator: Buyer creates the SDP offer
          if (_userRole === 'buyer' && !isNegotiatingRef.current && callStateRef.current !== 'CONNECTED') {
            await initiateCallOffer();
          }
          break;

        case 'ROOM_PRESENCE_ACK':
          // The other participant was already present in the room!
          setOtherParticipantPresent(true);
          if (_userRole === 'buyer' && !isNegotiatingRef.current && callStateRef.current !== 'CONNECTED') {
            await initiateCallOffer();
          }
          break;

        case 'ROOM_HEARTBEAT':
          // Confirms peer presence without resetting connections or media streams
          setOtherParticipantPresent(true);
          break;

        case 'SDP_OFFER':
          // Seller receives offer from buyer and responds with answer
          if (_userRole === 'seller') {
            try {
              setCallState('CONNECTING');
              const stream = localStreamRef.current || (await obtainLocalMedia());
              if (!stream) return;

              const pc = setupPeerConnection(stream);
              await pc.setRemoteDescription(new RTCSessionDescription(data));
              remoteDescSetRef.current = true;
              await drainIceCandidateQueue();

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              signaling.send('SDP_ANSWER', answer);
            } catch (err) {
              console.error('Error handling SDP offer:', err);
              setErrorMessage('Failed to connect video stream with buyer.');
              setCallState('ERROR');
            }
          }
          break;

        case 'SDP_ANSWER':
          // Buyer receives answer from seller
          if (_userRole === 'buyer' && peerConnectionRef.current) {
            try {
              if (peerConnectionRef.current.signalingState === 'have-local-offer') {
                await peerConnectionRef.current.setRemoteDescription(
                  new RTCSessionDescription(data)
                );
                remoteDescSetRef.current = true;
                await drainIceCandidateQueue();
              }
            } catch (err) {
              console.error('Error setting remote description:', err);
            }
          }
          break;

        case 'ICE_CANDIDATE':
          if (data) {
            if (peerConnectionRef.current && remoteDescSetRef.current) {
              try {
                await peerConnectionRef.current.addIceCandidate(
                  new RTCIceCandidate(data)
                );
              } catch (err) {
                console.warn('Error adding ICE candidate', err);
              }
            } else {
              iceCandidateQueueRef.current.push(data);
            }
          }
          break;

        case 'CALL_ENDED':
          // Other participant left or hung up
          setOtherParticipantPresent(false);
          if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
          }
          stopMediaStream(localStreamRef.current);
          localStreamRef.current = null;
          remoteStreamRef.current = null;
          if (callStateRef.current === 'CONNECTED') {
            setCallState('ENDED');
            addToastRef.current('The other participant ended the consultation.');
          } else {
            setCallState('WAITING');
            addToastRef.current('The other participant left the room.');
          }
          break;

        case 'PAYMENT_CONFIRMED':
          if (data && (!data.auctionId || data.auctionId === auctionIdRef.current)) {
            setPaymentStatus('completed');
            setPaymentDetails({
              paymentId: data.paymentId,
              amount: data.amount,
              paidAt: data.verifiedAt || Date.now()
            });
            addToastRef.current('Payment confirmed and verified!');
          }
          break;

        case 'CHAT_MESSAGE':
          if (data && data.senderId !== _currentUser?.id) {
            addMessageToState(data);
          }
          break;

        default:
          break;
      }
    });

    // Start local media acquisition and announce entry
    initializeRoom();

    // Periodic heartbeat every 15s to maintain presence and prevent idle disconnects
    const heartbeatTimer = setInterval(() => {
      if (isMounted && signalingRef.current) {
        signalingRef.current.send('ROOM_HEARTBEAT', {
          userId: currentUser.id,
          role: userRole
        });
      }
    }, 15000);

    return () => {
      isMounted = false;
      clearInterval(heartbeatTimer);
      if (disconnectGraceTimerRef.current) {
        clearTimeout(disconnectGraceTimerRef.current);
        disconnectGraceTimerRef.current = null;
      }
      signaling.send('CALL_ENDED', { reason: 'participant_left' });
      unsubscribe();
      signaling.destroy();
      signalingRef.current = null;
      stopMediaStream(localStreamRef.current);
      localStreamRef.current = null;
      remoteStreamRef.current = null;
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
    };
  }, [auction?.id, currentUser?.id, isAuthorized, userRole]);

  // ── Call duration timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (callState === 'CONNECTED') {
      durationTimerRef.current = setInterval(
        () => setCallDuration((p) => p + 1),
        1000
      );
    } else {
      clearInterval(durationTimerRef.current);
    }
    return () => clearInterval(durationTimerRef.current);
  }, [callState]);

  // ── Auto-scroll chat ────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [meetMessages]);

  // ── Controls: Mic & Camera ──────────────────────────────────────────────────
  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicEnabled(track.enabled);
    }
  };

  const toggleCamera = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCameraEnabled(track.enabled);
    }
  };

  // ── Query Initial Payment Status ────────────────────────────────────────────
  useEffect(() => {
    if (auction?.id) {
      fetch(`/api/payments/status?auctionId=${encodeURIComponent(auction.id)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data && data.success && data.paid) {
            setPaymentStatus('completed');
            setPaymentDetails({
              paymentId: data.paymentId,
              amount: data.amount,
              paidAt: data.paidAt
            });
          }
        })
        .catch(() => {});
    }
  }, [auction?.id]);

  const handleHangUp = () => {
    if (disconnectGraceTimerRef.current) {
      clearTimeout(disconnectGraceTimerRef.current);
      disconnectGraceTimerRef.current = null;
    }
    signalingRef.current?.send('CALL_ENDED', {});
    stopMediaStream(localStreamRef.current);
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    setCallState('ENDED');
    addToast('You left the consultation room.');
  };

  // ── Handle Razorpay Checkout ────────────────────────────────────────────────
  const handlePayNow = async () => {
    if (isInitiatingPayment || isVerifyingPayment || paymentStatus === 'completed') return;
    setIsInitiatingPayment(true);
    setPaymentError('');

    try {
      // 1. Create order on the backend (authoritative amount determined by server)
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auctionId: auction.id,
          userId: currentUser?.id
        })
      });

      const orderData = await res.json();
      if (!res.ok || !orderData.success) {
        if (orderData.alreadyPaid) {
          setPaymentStatus('completed');
          setPaymentDetails({ paymentId: orderData.paymentId, amount: paymentAmount });
          addToast('This auction lot has already been settled.');
        } else {
          setPaymentError(orderData.error || 'Failed to initialize payment order on server.');
        }
        setIsInitiatingPayment(false);
        return;
      }

      // 2. Local simulation/test mode when keys are placeholder samples
      if (
        orderData.isSimulation &&
        (!orderData.keyId ||
          orderData.keyId === 'rzp_test_placeholder' ||
          orderData.keyId === 'rzp_test_sample')
      ) {
        setIsVerifyingPayment(true);
        const simVerifyRes = await fetch('/api/payments/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            razorpay_order_id: orderData.orderId,
            razorpay_payment_id: `pay_sim_${Date.now()}`,
            razorpay_signature: `sig_sim_${Date.now()}`,
            auctionId: auction.id,
            userId: currentUser?.id
          })
        });
        const simVerifyData = await simVerifyRes.json();
        if (simVerifyData.success) {
          setPaymentStatus('completed');
          setPaymentDetails({
            paymentId: simVerifyData.paymentId,
            amount: orderData.amount,
            paidAt: simVerifyData.verifiedAt || Date.now()
          });
          signalingRef.current?.send('PAYMENT_CONFIRMED', {
            auctionId: auction.id,
            paymentId: simVerifyData.paymentId,
            amount: orderData.amount,
            verifiedAt: simVerifyData.verifiedAt || Date.now()
          });
          addToast('Payment simulation verified and recorded successfully!');
        } else {
          setPaymentStatus('failed');
          setPaymentError(simVerifyData.error || 'Verification failed on server.');
        }
        setIsVerifyingPayment(false);
        setIsInitiatingPayment(false);
        return;
      }

      // 3. Live or genuine test keys: Load Razorpay Checkout SDK and open popup
      const sdkLoaded = await loadRazorpayScript();
      if (!sdkLoaded || typeof window.Razorpay === 'undefined') {
        setPaymentError('Razorpay Checkout SDK failed to load. Please check your internet connection.');
        setIsInitiatingPayment(false);
        return;
      }

      const options = {
        key: orderData.keyId,
        amount: orderData.amount * 100, // paise
        currency: orderData.currency || 'INR',
        name: 'VEYRA Marketplace',
        description: `Settlement for Lot #${auction.id.toUpperCase()} — ${auction.name || 'Artisan Consultation'}`,
        order_id: orderData.orderId,
        prefill: {
          name: currentDisplayName || currentUser?.name || '',
          email: currentUser?.email || '',
          contact: currentUser?.phone || ''
        },
        theme: {
          color: '#783b4b'
        },
        handler: async function (response) {
          try {
            setIsVerifyingPayment(true);
            const verifyRes = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                auctionId: auction.id,
                userId: currentUser?.id
              })
            });
            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              setPaymentStatus('completed');
              setPaymentDetails({
                paymentId: response.razorpay_payment_id,
                amount: orderData.amount,
                paidAt: verifyData.verifiedAt || Date.now()
              });
              signalingRef.current?.send('PAYMENT_CONFIRMED', {
                auctionId: auction.id,
                paymentId: response.razorpay_payment_id,
                amount: orderData.amount,
                verifiedAt: verifyData.verifiedAt || Date.now()
              });
              addToast('Payment verified and confirmed successfully!');
            } else {
              setPaymentStatus('failed');
              setPaymentError(verifyData.error || 'Payment signature verification failed on the server.');
            }
          } catch (err) {
            setPaymentStatus('failed');
            setPaymentError('Network failure during payment verification.');
          } finally {
            setIsVerifyingPayment(false);
          }
        },
        modal: {
          ondismiss: function () {
            setIsInitiatingPayment(false);
          }
        }
      };

      const rzpInstance = new window.Razorpay(options);
      rzpInstance.on('payment.failed', function (resp) {
        setPaymentStatus('failed');
        setPaymentError(resp.error?.description || 'Payment was declined or cancelled.');
        setIsInitiatingPayment(false);
      });
      rzpInstance.open();
      setIsInitiatingPayment(false);
    } catch (err) {
      console.error('[handlePayNow Error]:', err);
      setPaymentError(err.message || 'Payment initiation failed.');
      setIsInitiatingPayment(false);
    }
  };

  // ── Send Chat Message ───────────────────────────────────────────────────────
  const handleSendMessage = async (e) => {
    e.preventDefault();
    const text = meetInput.trim();
    if (!text) return;

    if (text.length > MAX_MESSAGE_LENGTH) {
      setChatError(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`);
      return;
    }
    setChatError('');
    setIsSendingMessage(true);

    const msg = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderId: currentUser.id,
      senderName: currentDisplayName,
      senderRole: userRole,
      text,
      timestamp: Date.now()
    };

    try {
      addMessageToState(msg);
      setMeetInput('');
      signalingRef.current?.send('CHAT_MESSAGE', msg);
    } catch {
      setChatError('Failed to send message. Please try again.');
      addToast('Message send failed.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  // ── Unauthorized Guard ──────────────────────────────────────────────────────
  if (!isAuthorized) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          backgroundColor: 'rgba(25, 25, 25, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px'
        }}
      >
        <div
          style={{
            maxWidth: '460px', backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-xs)', padding: '32px', textAlign: 'center'
          }}
        >
          <div
            style={{
              width: '48px', height: '48px', borderRadius: '50%',
              backgroundColor: 'var(--accent-lavender-bg)', color: 'var(--accent-burgundy)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px'
            }}
          >
            <ShieldCheck size={24} />
          </div>
          <h3 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>
            Private Consultation Restricted
          </h3>
          <p
            style={{
              fontSize: 'var(--text-xs)', color: 'var(--text-secondary)',
              lineHeight: 1.6, marginBottom: '24px'
            }}
          >
            Live video consultations are exclusively reserved for the authoritative
            winner (<strong>{winnerName}</strong>) and the artisan workshop (
            <strong>{sellerName}</strong>).
          </p>
          <button onClick={onClose} className="btn btn-primary" style={{ width: '100%', height: '40px' }}>
            Return to Auction Room
          </button>
        </div>
      </div>
    );
  }

  // ── Main WebRTC Meeting Room Modal ──────────────────────────────────────────
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        backgroundColor: 'rgba(15, 15, 15, 0.92)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: '1100px',
          backgroundColor: '#191919', color: '#FFFFFF',
          borderRadius: 'var(--radius-xs)', overflow: 'hidden',
          border: '1px solid #333333',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5)',
          display: 'flex', flexDirection: 'column',
          maxHeight: '92vh'
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            padding: '14px 20px', borderBottom: '1px solid #2a2a2a',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: '#1e1e1e', flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                width: '8px', height: '8px', borderRadius: '50%',
                backgroundColor: callState === 'CONNECTED' ? '#22c55e' : callState === 'ENDED' ? (paymentStatus === 'completed' ? '#22c55e' : '#888') : '#f59e0b'
              }}
            />
            <div>
              <span
                style={{
                  fontSize: '11px', letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: '#999', display: 'block'
                }}
              >
                {callState === 'ENDED' ? 'Concluded Consultation' : 'Post-Auction Private Consultation'} — Lot #{auction.id.toUpperCase()}
              </span>
              <strong style={{ fontSize: 'var(--text-sm)', color: '#FFF' }}>
                {isWinningBuyer
                  ? `Consultation with Maker: ${sellerName}`
                  : `Consultation with Winning Collector: ${winnerName}`}
              </strong>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {(callState === 'CONNECTED' || callState === 'ENDED') && (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  backgroundColor: '#262626', padding: '4px 10px',
                  borderRadius: 'var(--radius-xs)', fontSize: '12px',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                <Clock size={13} color={callState === 'CONNECTED' ? '#22c55e' : '#aaa'} />
                <span>{formatDuration(callDuration)}</span>
              </div>
            )}
            <button
              onClick={callState === 'ENDED' ? onClose : handleHangUp}
              style={{ background: 'transparent', border: 'none', color: '#AAA', cursor: 'pointer', padding: '4px' }}
              title={callState === 'ENDED' ? 'Close window' : 'Leave meeting'}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Body: Payment Screen (when call ends) OR WebRTC Video + Chat (when call active) ── */}
        {callState === 'ENDED' ? (
          /* ── Post-Call Payment Screen ── */
          <div
            style={{
              padding: '40px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: '580px',
              margin: '0 auto',
              width: '100%',
              minHeight: '440px',
              textAlign: 'center'
            }}
          >
            {/* Status Icon Badge */}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor:
                  paymentStatus === 'completed'
                    ? 'rgba(34, 197, 94, 0.15)'
                    : paymentStatus === 'failed'
                    ? 'rgba(239, 68, 68, 0.15)'
                    : 'rgba(120, 59, 75, 0.25)',
                border: `1.5px solid ${
                  paymentStatus === 'completed'
                    ? '#22c55e'
                    : paymentStatus === 'failed'
                    ? '#ef4444'
                    : 'var(--accent-burgundy)'
                }`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 18px'
              }}
            >
              {paymentStatus === 'completed' ? (
                <CheckCircle2 size={32} color="#22c55e" />
              ) : paymentStatus === 'failed' ? (
                <AlertTriangle size={30} color="#ef4444" />
              ) : (
                <PhoneOff size={28} color="var(--accent-burgundy)" />
              )}
            </div>

            {/* Title & Context */}
            {auction.id === 'auc-dev-test' && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: '16px',
                  fontSize: '11px',
                  color: '#f59e0b',
                  fontWeight: 600,
                  marginBottom: '10px',
                  letterSpacing: '0.04em'
                }}
              >
                <span>DEVELOPMENT TEST LOT (Nominal Amount ₹100)</span>
              </div>
            )}
            <h2
              style={{
                fontSize: '1.75rem',
                fontFamily: 'var(--font-heading)',
                color: '#FFFFFF',
                marginBottom: '6px'
              }}
            >
              Video Call Ended
            </h2>
            <p
              style={{
                fontSize: '13px',
                color: '#AAA',
                marginBottom: '24px',
                lineHeight: 1.5
              }}
            >
              {isWinningBuyer
                ? `Your post-auction consultation with ${sellerName} has concluded.`
                : `Your post-auction consultation with winning collector ${winnerName} has concluded.`}
            </p>

            {/* Consultation Summary & Payment Details Box */}
            <div
              style={{
                width: '100%',
                backgroundColor: '#222222',
                border: '1px solid #333333',
                borderRadius: 'var(--radius-xs)',
                padding: '20px',
                marginBottom: '20px',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingBottom: '12px',
                  borderBottom: '1px solid #2d2d2d'
                }}
              >
                <span style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Consultation Summary
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    color: '#22c55e',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontWeight: 600
                  }}
                >
                  Session Documented
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#BBB', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={15} color="var(--accent-burgundy)" />
                  Call Duration
                </span>
                <strong style={{ fontSize: '14px', color: '#FFF', fontVariantNumeric: 'tabular-nums' }}>
                  {formatDuration(callDuration)}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#BBB', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={15} color="var(--accent-burgundy)" />
                  Auction Object
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    color: '#EEE',
                    maxWidth: '260px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={auction.name}
                >
                  {auction.name}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  paddingTop: '12px',
                  borderTop: '1px solid #2d2d2d'
                }}
              >
                <div>
                  <span style={{ fontSize: '13px', color: '#FFF', fontWeight: 600, display: 'block' }}>
                    Payment Amount
                  </span>
                  <span style={{ fontSize: '11px', color: '#888' }}>
                    Authoritative Winning Hammer Price
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span
                    style={{
                      fontSize: '1.45rem',
                      fontWeight: 700,
                      color: 'var(--accent-gold, #c5a059)',
                      fontFamily: 'var(--font-heading)'
                    }}
                  >
                    ₹{paymentAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Status Banners & Actions ── */}

            {/* 1. Payment Successful */}
            {paymentStatus === 'completed' && (
              <div style={{ width: '100%', marginBottom: '16px' }}>
                <div
                  style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: 'var(--radius-xs)',
                    padding: '16px',
                    marginBottom: '16px',
                    textAlign: 'center'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      color: '#22c55e',
                      fontWeight: 600,
                      fontSize: '14px',
                      marginBottom: '4px'
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>Payment Successful</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#AAA', margin: '0 0 6px' }}>
                    The payment has been cryptographically verified and recorded in the escrow registry.
                  </p>
                  {paymentDetails?.paymentId && (
                    <p style={{ fontSize: '11px', color: '#888', fontVariantNumeric: 'tabular-nums', margin: 0 }}>
                      Payment ID: <code style={{ color: '#22c55e' }}>{paymentDetails.paymentId}</code>
                    </p>
                  )}
                </div>

                <button
                  onClick={onClose}
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    height: '44px',
                    backgroundColor: '#262626',
                    color: '#FFF',
                    border: '1px solid #444',
                    borderRadius: 'var(--radius-xs)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Close & Return to Auction Room
                </button>
              </div>
            )}

            {/* 2. Payment Verifying Spinner */}
            {isVerifyingPayment && (
              <div
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '16px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px'
                }}
              >
                <Loader2 size={18} color="#f59e0b" style={{ animation: 'spin 1s infinite linear' }} />
                <span style={{ fontSize: '13px', color: '#f59e0b', fontWeight: 500 }}>
                  Verifying cryptographic signature with server…
                </span>
              </div>
            )}

            {/* 3. Payment Failed Error & Retry */}
            {paymentStatus === 'failed' && !isVerifyingPayment && (
              <div style={{ width: '100%', marginBottom: '16px' }}>
                <div
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    borderRadius: 'var(--radius-xs)',
                    padding: '14px',
                    marginBottom: '16px',
                    textAlign: 'left'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      color: '#ef4444',
                      fontWeight: 600,
                      fontSize: '13px',
                      marginBottom: '4px'
                    }}
                  >
                    <AlertTriangle size={15} />
                    <span>Payment Failed</span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#DDD', margin: 0 }}>
                    {paymentError || 'Payment processing was unsuccessful. You can retry safely.'}
                  </p>
                </div>

                {isWinningBuyer ? (
                  <button
                    onClick={handlePayNow}
                    disabled={isInitiatingPayment}
                    style={{
                      width: '100%',
                      height: '46px',
                      backgroundColor: 'var(--accent-burgundy)',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: isInitiatingPayment ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {isInitiatingPayment ? (
                      <Loader2 size={16} style={{ animation: 'spin 1s infinite linear' }} />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                    <span>Retry Payment</span>
                  </button>
                ) : (
                  <button
                    onClick={onClose}
                    className="btn btn-secondary"
                    style={{ width: '100%', height: '42px', fontSize: '13px' }}
                  >
                    Close Consultation
                  </button>
                )}
              </div>
            )}

            {/* 4. Pending / Initial State */}
            {paymentStatus !== 'completed' && paymentStatus !== 'failed' && !isVerifyingPayment && (
              <div style={{ width: '100%' }}>
                {isWinningBuyer ? (
                  <div>
                    <button
                      onClick={handlePayNow}
                      disabled={isInitiatingPayment}
                      style={{
                        width: '100%',
                        height: '50px',
                        backgroundColor: 'var(--accent-burgundy)',
                        color: '#FFF',
                        border: 'none',
                        borderRadius: 'var(--radius-xs)',
                        fontSize: '15px',
                        fontWeight: 600,
                        letterSpacing: '0.03em',
                        cursor: isInitiatingPayment ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        boxShadow: '0 4px 18px rgba(120, 59, 75, 0.4)',
                        transition: 'all 150ms ease'
                      }}
                    >
                      {isInitiatingPayment ? (
                        <>
                          <Loader2 size={18} style={{ animation: 'spin 1s infinite linear' }} />
                          <span>Opening Razorpay Checkout…</span>
                        </>
                      ) : (
                        <>
                          <CreditCard size={18} />
                          <span>Pay Now • ₹{paymentAmount.toLocaleString('en-IN')}</span>
                        </>
                      )}
                    </button>

                    <div
                      style={{
                        marginTop: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        fontSize: '11px',
                        color: '#888'
                      }}
                    >
                      <Lock size={12} color="#22c55e" />
                      <span>Razorpay 256-Bit Escrow Protection • Backend Verified</span>
                    </div>

                    <button
                      onClick={onClose}
                      style={{
                        marginTop: '14px',
                        background: 'none',
                        border: 'none',
                        color: '#777',
                        fontSize: '12px',
                        textDecoration: 'underline',
                        cursor: 'pointer'
                      }}
                    >
                      Dismiss for now
                    </button>
                  </div>
                ) : (
                  /* Seller View */
                  <div>
                    <div
                      style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        borderRadius: 'var(--radius-xs)',
                        padding: '16px',
                        marginBottom: '20px',
                        textAlign: 'center'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          color: '#f59e0b',
                          fontWeight: 600,
                          fontSize: '13px',
                          marginBottom: '6px'
                        }}
                      >
                        <Clock size={16} />
                        <span>Awaiting Settlement from Winning Collector</span>
                      </div>
                      <p style={{ fontSize: '12px', color: '#AAA', margin: 0, lineHeight: 1.5 }}>
                        Collector <strong>{winnerName}</strong> has been presented with the payment screen for ₹
                        {paymentAmount.toLocaleString('en-IN')}. This window will update in real time when verified.
                      </p>
                    </div>

                    <button
                      onClick={onClose}
                      className="btn btn-secondary"
                      style={{ width: '100%', height: '44px', fontSize: '13px' }}
                    >
                      Close Consultation Window
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ── Body: Video Area + Chat ── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* ── Video Area ── */}
          <div
            style={{
              flex: 1, position: 'relative',
              backgroundColor: '#0F0F0F', minWidth: 0, minHeight: '380px',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            {/* Remote video (full size when CONNECTED) */}
            <video
              ref={remoteVideoCallbackRef}
              autoPlay
              playsInline
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                display: callState === 'CONNECTED' ? 'block' : 'none'
              }}
            />

            {/* Local video preview: Center during WAITING / INIT; PiP corner when CONNECTED */}
            {callState === 'CONNECTED' ? (
              /* PiP corner thumbnail when connected */
              <div
                style={{
                  position: 'absolute', bottom: '16px', right: '16px',
                  width: '180px', aspectRatio: '16 / 9',
                  backgroundColor: '#262626', borderRadius: 'var(--radius-xs)',
                  overflow: 'hidden', border: '1.5px solid #444',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)', zIndex: 10
                }}
              >
                <video
                  ref={localVideoCallbackRef}
                  autoPlay
                  muted
                  playsInline
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    transform: 'scaleX(-1)'
                  }}
                />
                <span
                  style={{
                    position: 'absolute', bottom: '4px', left: '6px',
                    fontSize: '9px', backgroundColor: 'rgba(0,0,0,0.7)',
                    padding: '1px 4px', borderRadius: '2px', color: '#EEE'
                  }}
                >
                  You ({userRole}) {!cameraEnabled && '(Camera Off)'}
                </span>
              </div>
            ) : (
              /* Full preview background when WAITING or CONNECTING */
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                <video
                  ref={localVideoCallbackRef}
                  autoPlay
                  muted
                  playsInline
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    transform: 'scaleX(-1)', opacity: cameraEnabled ? 0.35 : 0.05
                  }}
                />
              </div>
            )}

            {/* ── Waiting Room Overlay (when not yet connected) ── */}
            {callState !== 'CONNECTED' && (
              <div
                style={{
                  position: 'relative', zIndex: 5,
                  padding: '32px', textAlign: 'center', maxWidth: '480px'
                }}
              >
                {callState === 'WAITING' && (
                  <div>
                    <div
                      style={{
                        width: '64px', height: '64px', borderRadius: '50%',
                        backgroundColor: 'rgba(120, 59, 75, 0.25)',
                        border: '1.5px solid var(--accent-burgundy)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 16px'
                      }}
                    >
                      <Clock size={28} color="var(--accent-burgundy)" />
                    </div>

                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', backgroundColor: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '20px', marginBottom: '12px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b', animation: 'pulseLive 1.5s infinite ease-in-out' }} />
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#f59e0b' }}>
                        Waiting for the other participant…
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.45rem', marginBottom: '8px', color: '#FFF' }}>
                      Meeting Waiting Room
                    </h3>
                    <p style={{ fontSize: '13px', color: '#AAA', lineHeight: 1.6, marginBottom: '20px' }}>
                      {isWinningBuyer ? (
                        <>
                          You are in the consultation room. Waiting for maker <strong>{sellerName}</strong> to enter. Your camera & microphone preview are active below.
                        </>
                      ) : (
                        <>
                          You are in the consultation room. Waiting for winning collector <strong>{winnerName}</strong> to enter. Your camera & microphone preview are active below.
                        </>
                      )}
                    </p>

                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#888', backgroundColor: '#1c1c1c', padding: '6px 14px', borderRadius: 'var(--radius-xs)', border: '1px solid #333' }}>
                      <ShieldCheck size={14} color="#22c55e" />
                      <span>Camera & Audio Ready • You can send a message in chat while waiting</span>
                    </div>
                  </div>
                )}

                {callState === 'CONNECTING' && (
                  <div>
                    <div
                      style={{
                        width: '54px', height: '54px', borderRadius: '50%',
                        border: '3px solid #333', borderTopColor: 'var(--accent-burgundy)',
                        animation: 'spin 1s infinite linear', margin: '0 auto 16px'
                      }}
                    />
                    <h3 style={{ fontSize: '1.4rem', marginBottom: '6px', color: '#FFF' }}>
                      Connecting Media Streams…
                    </h3>
                    <p style={{ fontSize: '13px', color: '#AAA' }}>
                      Both participants are in the room. Establishing encrypted peer-to-peer WebRTC connection.
                    </p>
                  </div>
                )}

                {callState === 'INIT' && (
                  <div>
                    <div
                      style={{
                        width: '48px', height: '48px', borderRadius: '50%',
                        border: '3px solid #333', borderTopColor: '#f59e0b',
                        animation: 'spin 1s infinite linear', margin: '0 auto 16px'
                      }}
                    />
                    <h3 style={{ fontSize: '1.3rem', marginBottom: '6px', color: '#FFF' }}>
                      Initializing Meeting Room…
                    </h3>
                    <p style={{ fontSize: '13px', color: '#AAA' }}>
                      Accessing audio and video capture devices.
                    </p>
                  </div>
                )}

                {callState === 'ENDED' && (
                  <div>
                    <h3 style={{ fontSize: '1.4rem', marginBottom: '6px', color: '#FFF' }}>
                      Consultation Concluded
                    </h3>
                    <p style={{ fontSize: '13px', color: '#AAA' }}>
                      Thank you. This consultation has been successfully documented.
                    </p>
                  </div>
                )}

                {callState === 'ERROR' && (
                  <div>
                    <AlertTriangle size={36} color="#ef4444" style={{ margin: '0 auto 12px' }} />
                    <h3 style={{ fontSize: '1.3rem', marginBottom: '6px', color: '#FFF' }}>
                      Media Device Notice
                    </h3>
                    <p style={{ fontSize: '13px', color: '#AAA', marginBottom: '20px' }}>
                      {errorMessage || 'Unable to access audio or video capture hardware.'}
                    </p>
                    <button
                      onClick={async () => {
                        setErrorMessage('');
                        const stream = await obtainLocalMedia();
                        if (stream) setCallState('WAITING');
                      }}
                      className="btn btn-secondary"
                      style={{ height: '36px', fontSize: '12px' }}
                    >
                      Retry Camera / Audio
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Chat Panel ── */}
          <div
            style={{
              width: '320px', flexShrink: 0,
              borderLeft: '1px solid #2a2a2a',
              display: 'flex', flexDirection: 'column',
              backgroundColor: '#141414'
            }}
          >
            {/* Chat header */}
            <div
              style={{
                padding: '12px 16px', borderBottom: '1px solid #2a2a2a',
                display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0
              }}
            >
              <MessageSquare size={15} color="var(--accent-burgundy)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFF' }}>
                Private Consultation Notes
              </span>
              <span
                style={{
                  marginLeft: 'auto', fontSize: '10px', color: '#888',
                  backgroundColor: '#262626', padding: '2px 7px',
                  borderRadius: '4px', textTransform: 'capitalize'
                }}
              >
                {userRole}
              </span>
            </div>

            {/* Messages list */}
            <div
              style={{
                flex: 1, overflowY: 'auto', padding: '12px',
                display: 'flex', flexDirection: 'column', gap: '10px'
              }}
            >
              {meetMessages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: '#666' }}>
                  <MessageSquare size={24} style={{ marginBottom: '8px', opacity: 0.35 }} />
                  <p style={{ fontSize: '12px', lineHeight: 1.5 }}>
                    No messages yet.<br />Leave a note or discuss delivery details in real time.
                  </p>
                </div>
              ) : (
                meetMessages.map((msg) => {
                  const isOwn = msg.senderId === currentUser.id;
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: isOwn ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex', alignItems: 'center', gap: '5px',
                          marginBottom: '3px',
                          flexDirection: isOwn ? 'row-reverse' : 'row'
                        }}
                      >
                        <span
                          style={{
                            fontSize: '11px', fontWeight: 600,
                            color: isOwn ? 'var(--accent-burgundy)' : '#AAA'
                          }}
                        >
                          {isOwn
                            ? 'You'
                            : (msg.senderName && msg.senderName !== 'undefined' && msg.senderName !== 'null'
                                ? msg.senderName
                                : (msg.senderRole === 'seller' ? sellerName : winnerName) || 'Participant')}
                        </span>
                        <span
                          style={{
                            fontSize: '9px', padding: '1px 5px', borderRadius: '3px',
                            backgroundColor:
                              msg.senderRole === 'seller'
                                ? 'rgba(120, 59, 75, 0.25)'
                                : 'rgba(59, 130, 246, 0.2)',
                            color:
                              msg.senderRole === 'seller'
                                ? 'var(--accent-burgundy)'
                                : '#60a5fa',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em', fontWeight: 600
                          }}
                        >
                          {msg.senderRole}
                        </span>
                      </div>

                      <div
                        style={{
                          maxWidth: '240px', padding: '8px 10px',
                          borderRadius: isOwn ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                          backgroundColor: isOwn ? 'var(--accent-burgundy)' : '#262626',
                          fontSize: '12.5px', lineHeight: 1.5, color: '#FFF',
                          wordBreak: 'break-word'
                        }}
                      >
                        {msg.text}
                      </div>

                      <span style={{ fontSize: '10px', color: '#555', marginTop: '3px' }}>
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Inline error */}
            {chatError && (
              <div
                style={{
                  padding: '6px 16px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  borderTop: '1px solid rgba(239, 68, 68, 0.3)'
                }}
              >
                <p style={{ fontSize: '11px', color: '#ef4444' }}>{chatError}</p>
              </div>
            )}

            {/* Chat input */}
            <form
              onSubmit={handleSendMessage}
              style={{
                padding: '10px 12px', borderTop: '1px solid #2a2a2a',
                display: 'flex', gap: '8px', alignItems: 'flex-end', flexShrink: 0
              }}
            >
              <div style={{ flex: 1, position: 'relative' }}>
                <textarea
                  value={meetInput}
                  onChange={(e) => {
                    setMeetInput(e.target.value);
                    if (chatError) setChatError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  placeholder="Message floor… (Enter to send)"
                  maxLength={MAX_MESSAGE_LENGTH}
                  rows={2}
                  disabled={isSendingMessage}
                  style={{
                    width: '100%', backgroundColor: '#262626', color: '#FFF',
                    border: '1px solid #333', borderRadius: '6px',
                    padding: '7px 10px', fontSize: '12px', resize: 'none',
                    outline: 'none', fontFamily: 'inherit', lineHeight: 1.4,
                    boxSizing: 'border-box'
                  }}
                />
                {meetInput.length > MAX_MESSAGE_LENGTH * 0.8 && (
                  <span
                    style={{
                      position: 'absolute', bottom: '4px', right: '6px',
                      fontSize: '9px',
                      color: meetInput.length >= MAX_MESSAGE_LENGTH ? '#ef4444' : '#666'
                    }}
                  >
                    {meetInput.length}/{MAX_MESSAGE_LENGTH}
                  </span>
                )}
              </div>
              <button
                type="submit"
                disabled={!meetInput.trim() || isSendingMessage}
                style={{
                  width: '36px', height: '36px', borderRadius: '6px',
                  backgroundColor: meetInput.trim() ? 'var(--accent-burgundy)' : '#333',
                  color: '#FFF', border: 'none',
                  cursor: meetInput.trim() ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'background-color 150ms ease'
                }}
                title="Send message"
              >
                {isSendingMessage
                  ? <Loader2 size={15} style={{ animation: 'spin 1s infinite linear' }} />
                  : <Send size={15} />}
              </button>
            </form>
          </div>
        </div>

        {/* ── Controls Footer ── */}
        <div
          style={{
            padding: '14px 20px', borderTop: '1px solid #2a2a2a',
            backgroundColor: '#1e1e1e', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: '12px', flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#AAA' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Volume2 size={14} />
              <span>WebRTC Encrypted Stream</span>
            </span>
            <span style={{ opacity: 0.3 }}>|</span>
            <span>Room #{auction.id.toUpperCase()}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Mic toggle: active in both WAITING and CONNECTED */}
            <button
              onClick={toggleMic}
              style={{
                width: '40px', height: '40px', borderRadius: '50%',
                backgroundColor: micEnabled ? '#333333' : '#ef4444',
                color: '#FFF', border: 'none',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background-color 150ms ease'
              }}
              title={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
            >
              {micEnabled ? <Mic size={17} /> : <MicOff size={17} />}
            </button>

            {/* Camera toggle: active in both WAITING and CONNECTED */}
            <button
              onClick={toggleCamera}
              style={{
                width: '40px', height: '40px', borderRadius: '50%',
                backgroundColor: cameraEnabled ? '#333333' : '#ef4444',
                color: '#FFF', border: 'none',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background-color 150ms ease'
              }}
              title={cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {cameraEnabled ? <Video size={17} /> : <VideoOff size={17} />}
            </button>

            <button
              onClick={handleHangUp}
              style={{
                height: '40px', padding: '0 18px', borderRadius: '20px',
                backgroundColor: '#ef4444', color: '#FFF',
                display: 'inline-flex', alignItems: 'center', gap: '7px',
                cursor: 'pointer', border: 'none', fontSize: '13px', fontWeight: 600
              }}
            >
              <PhoneOff size={15} />
              <span>Leave Room</span>
            </button>
          </div>

          <button
            onClick={handleHangUp}
            style={{
              color: '#888', fontSize: '11px', textDecoration: 'underline',
              cursor: 'pointer', background: 'none', border: 'none'
            }}
          >
            Exit Consultation
          </button>
        </div>
      </>
    )}
  </div>

      <style>{`
        @keyframes spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulseLive {
          0%, 100% { transform: scale(1);    opacity: 1;    }
          50%       { transform: scale(1.12); opacity: 0.82; }
        }
      `}</style>
    </div>
  );
};
