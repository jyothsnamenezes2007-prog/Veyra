import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { INITIAL_LIVE_AUCTIONS, UPCOMING_AUCTIONS, DEMO_AUCTION_IDS, getDemoBaselineAuction } from '../data/auctions';
import { useToast } from './ToastContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const AuctionContext = createContext(null);
const AUCTIONS_STORAGE_KEY = 'veyra_live_auctions_data';
const CUSTOM_AUCTIONS_STORAGE_KEY = 'veyra_custom_auctions';
const REMINDERS_STORAGE_KEY = 'veyra_auction_reminders';
const REGISTRATIONS_STORAGE_KEY = 'veyra_auction_registrations';
const USER_BIDS_STORAGE_KEY = 'veyra_user_bids_history';
const AUCTION_COMMENTS_KEY = 'veyra_auction_comments';

export const AuctionProvider = ({ children }) => {
  const { addToast } = useToast();

  // 1. Base Live Auctions state
  const [liveAuctions, setLiveAuctions] = useState(() => {
    const now = Date.now();
    try {
      const saved = localStorage.getItem(AUCTIONS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((auc) => {
            const end = auc.endTimestamp || auc.endTime || (now + (auc.endsInSeconds || 3600) * 1000);
            const start = auc.startTimestamp || auc.scheduledTimestamp || (end - (auc.endsInSeconds || 7200) * 1000);
            const isStarted = now >= start;
            const isEnded = now >= end;
            const status = isEnded ? 'ended' : isStarted ? 'active' : 'upcoming';
            const remaining = isEnded ? 0 : isStarted ? Math.max(0, Math.floor((end - now) / 1000)) : Math.max(0, Math.floor((start - now) / 1000));
            return {
              ...auc,
              startTimestamp: start,
              scheduledTimestamp: start,
              endTimestamp: end,
              endTime: end,
              status,
              remainingSeconds: remaining
            };
          });
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved auctions', e);
    }

    return INITIAL_LIVE_AUCTIONS.map((auc) => ({
      ...auc,
      startTimestamp: now - 60000,
      scheduledTimestamp: now - 60000,
      endTimestamp: now + auc.endsInSeconds * 1000,
      endTime: now + auc.endsInSeconds * 1000,
      remainingSeconds: auc.endsInSeconds,
      status: auc.endsInSeconds > 0 ? 'active' : 'ended',
      winner: null
    }));
  });

  // 2. Custom Seller-Submitted Auctions (Pending, Scheduled, Active, or Ended)
  const [customAuctions, setCustomAuctions] = useState(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_AUCTIONS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.warn('Failed to parse custom auctions', e);
      return [];
    }
  });

  // 3. Base Upcoming auctions
  const [baseUpcomingAuctions] = useState(UPCOMING_AUCTIONS);

  // 4. User auction registrations
  const [registrations, setRegistrations] = useState(() => {
    try {
      const saved = localStorage.getItem(REGISTRATIONS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : ['up-1']; // Seed up-1 for initial demonstration
    } catch (e) {
      return [];
    }
  });

  // 5. User auction reminders
  const [reminders, setReminders] = useState(() => {
    try {
      const saved = localStorage.getItem(REMINDERS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : ['up-2']; // Seed up-2
    } catch (e) {
      return [];
    }
  });

  // 6. User bids history (for My Bids in Account)
  const [userBids, setUserBids] = useState(() => {
    try {
      const saved = localStorage.getItem(USER_BIDS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [
        {
          id: 'user-b-1',
          auctionId: 'auc-1',
          auctionTitle: 'Archival Chandigarh Teak & Cane V-Leg Chair (c. 1956)',
          amount: 96000,
          time: '1 hour ago',
          timestamp: Date.now() - 3600000,
          status: 'Leading',
          image: 'https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=400&q=80'
        }
      ];
    } catch (e) {
      return [];
    }
  });

  // 7. Live auction comments / chat feeds
  const [comments, setComments] = useState(() => {
    try {
      const saved = localStorage.getItem(AUCTION_COMMENTS_KEY);
      return saved ? JSON.parse(saved) : {
        'auc-1': [
          { id: 'c-1', user: 'ArchivalCurator', message: 'Incredible condition on the woven cane seating.', time: '12m ago', timestamp: Date.now() - 720000 },
          { id: 'c-2', user: 'Veyra Specialist', message: 'Stenciled inventory marks authenticated against Chandigarh archives.', time: '8m ago', timestamp: Date.now() - 480000 },
          { id: 'c-3', user: 'A. Singhania', message: 'Bid entered. Exceptional provenance.', time: '3m ago', timestamp: Date.now() - 180000 }
        ]
      };
    } catch (e) {
      return {};
    }
  });

  // Persistence effects
  useEffect(() => {
    try {
      localStorage.setItem(AUCTIONS_STORAGE_KEY, JSON.stringify(liveAuctions));
    } catch (e) {
      console.warn('Failed to save auctions to localStorage', e);
    }
  }, [liveAuctions]);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_AUCTIONS_STORAGE_KEY, JSON.stringify(customAuctions));
    } catch (e) {
      console.warn('Failed to save custom auctions to localStorage', e);
    }
  }, [customAuctions]);

  useEffect(() => {
    try {
      localStorage.setItem(REGISTRATIONS_STORAGE_KEY, JSON.stringify(registrations));
    } catch (e) {
      console.warn('Failed to save registrations to localStorage', e);
    }
  }, [registrations]);

  useEffect(() => {
    try {
      localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(reminders));
    } catch (e) {
      console.warn('Failed to save reminders to localStorage', e);
    }
  }, [reminders]);

  useEffect(() => {
    try {
      localStorage.setItem(USER_BIDS_STORAGE_KEY, JSON.stringify(userBids));
    } catch (e) {
      console.warn('Failed to save user bids to localStorage', e);
    }
  }, [userBids]);

  useEffect(() => {
    try {
      localStorage.setItem(AUCTION_COMMENTS_KEY, JSON.stringify(comments));
    } catch (e) {
      console.warn('Failed to save comments to localStorage', e);
    }
  }, [comments]);

  // Listen for storage events (e.g. status updates from MyProducts across tabs/contexts)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (!e.key || e.key === CUSTOM_AUCTIONS_STORAGE_KEY) {
        try {
          const fresh = localStorage.getItem(CUSTOM_AUCTIONS_STORAGE_KEY);
          if (fresh) {
            setCustomAuctions(JSON.parse(fresh));
          }
        } catch (err) {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Cross-tab broadcast listener for synchronized multi-tab bidding & chat
  useEffect(() => {
    let broadcast;
    if (typeof BroadcastChannel !== 'undefined') {
      broadcast = new BroadcastChannel('veyra_auction_realtime_sync');
      broadcast.onmessage = (event) => {
        const { type, payload } = event.data || {};
        if (type === 'BID_PLACED') {
          setLiveAuctions((prev) =>
            prev.map((auc) => (auc.id === payload.auctionId ? payload.updatedAuction : auc))
          );
          setCustomAuctions((prev) =>
            prev.map((auc) => (auc.id === payload.auctionId ? payload.updatedAuction : auc))
          );
        } else if (type === 'COMMENT_ADDED') {
          setComments((prev) => ({
            ...prev,
            [payload.auctionId]: [...(prev[payload.auctionId] || []), payload.comment]
          }));
        } else if (type === 'AUCTION_RESET') {
          if (payload.updatedAuctions) {
            setLiveAuctions(payload.updatedAuctions);
          } else if (payload.updatedAuction) {
            setLiveAuctions((prev) =>
              prev.map((auc) => (auc.id === payload.updatedAuction.id ? payload.updatedAuction : auc))
            );
          }
        }
      };
    }

    return () => {
      if (broadcast) broadcast.close();
    };
  }, []);

  // Authoritative server-synced countdown clock (runs every 1 second)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();

      // 1. Tick base live auctions
      setLiveAuctions((prevAuctions) => {
        let hasChanges = false;
        const updated = prevAuctions.map((auc) => {
          const start = auc.startTimestamp || (auc.endTimestamp - (auc.endsInSeconds || 7200) * 1000);
          const end = auc.endTimestamp || auc.endTime || (start + 3600000);

          let targetStatus;
          let remaining;
          let winner = auc.winner;

          if (now < start) {
            targetStatus = 'upcoming';
            remaining = Math.max(0, Math.floor((start - now) / 1000));
            winner = null;
          } else if (now >= start && now < end) {
            targetStatus = 'active';
            remaining = Math.max(0, Math.floor((end - now) / 1000));
            winner = null;
          } else {
            targetStatus = 'ended';
            remaining = 0;
            if (!winner && auc.bidHistory && auc.bidHistory.length > 0) {
              winner = auc.bidHistory[0];
            }
          }

          if (auc.remainingSeconds !== remaining || auc.status !== targetStatus || auc.winner !== winner) {
            hasChanges = true;
            return {
              ...auc,
              remainingSeconds: remaining,
              status: targetStatus,
              winner
            };
          }

          return auc;
        });

        return hasChanges ? updated : prevAuctions;
      });

      // 2. Check and tick approved custom auctions
      setCustomAuctions((prevCustom) => {
        let hasChanges = false;
        const updated = prevCustom.map((auc) => {
          // Only approved auctions participate in the live lifecycle
          if (auc.approvalStatus !== 'approved') {
            return auc;
          }

          const start = auc.scheduledTimestamp || auc.startTimestamp || 0;
          const end = auc.endTimestamp || auc.endTime || (start + 86400000);

          let targetStatus;
          let remaining;
          let winner = auc.winner;

          if (now < start) {
            targetStatus = 'scheduled';
            remaining = Math.max(0, Math.floor((start - now) / 1000));
            winner = null;
          } else if (now >= start && now < end) {
            targetStatus = 'active';
            remaining = Math.max(0, Math.floor((end - now) / 1000));
            winner = null;
          } else {
            targetStatus = 'ended';
            remaining = 0;
            if (!winner && auc.bidHistory && auc.bidHistory.length > 0) {
              winner = auc.bidHistory[0];
            }
          }

          if (auc.status !== targetStatus || auc.remainingSeconds !== remaining || auc.winner !== winner) {
            hasChanges = true;
            return {
              ...auc,
              status: targetStatus,
              remainingSeconds: remaining,
              winner
            };
          }

          return auc;
        });

        return hasChanges ? updated : prevCustom;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Approved active custom auctions
  const activeApprovedCustomAuctions = useMemo(() => {
    const now = Date.now();
    return customAuctions
      .filter((a) => a.approvalStatus === 'approved' && now >= a.scheduledTimestamp)
      .map((a) => {
        const remaining = Math.max(0, Math.floor((a.endTimestamp - now) / 1000));
        const isEnded = remaining <= 0;
        return {
          ...a,
          remainingSeconds: remaining,
          status: isEnded ? 'ended' : 'active'
        };
      });
  }, [customAuctions]);

  // Combined Live Auctions (base + approved active custom auctions)
  const combinedLiveAuctions = useMemo(() => {
    return [...liveAuctions, ...activeApprovedCustomAuctions];
  }, [liveAuctions, activeApprovedCustomAuctions]);

  // Approved scheduled upcoming custom auctions (in the future)
  const upcomingApprovedCustomAuctions = useMemo(() => {
    const now = Date.now();
    return customAuctions
      .filter((a) => a.approvalStatus === 'approved' && now < a.scheduledTimestamp)
      .map((a) => ({
        ...a,
        thumbnail: a.image || (a.images && a.images[0]) || ''
      }));
  }, [customAuctions]);

  // Combined Upcoming Auctions
  const combinedUpcomingAuctions = useMemo(() => {
    return [...baseUpcomingAuctions, ...upcomingApprovedCustomAuctions];
  }, [baseUpcomingAuctions, upcomingApprovedCustomAuctions]);

  // Create & Register a New Auction Lot (Saved with pending approval)
  const createAuctionLot = useCallback((lotData) => {
    // Validate required fields
    if (!lotData.name || !lotData.seller || !lotData.startingBid) {
      return { success: false, error: 'Title, seller, and starting bid are required.' };
    }

    const startingBidNum = Number(lotData.startingBid);
    const estimatedValueNum = Number(lotData.estimatedValue || lotData.price || startingBidNum);

    if (isNaN(startingBidNum) || startingBidNum <= 0) {
      return { success: false, error: 'Starting bid must be a valid positive amount.' };
    }

    if (isNaN(estimatedValueNum) || estimatedValueNum <= 0) {
      return { success: false, error: 'Estimated lot value must be a valid positive amount.' };
    }

    if (startingBidNum > estimatedValueNum) {
      return { success: false, error: 'Starting bid cannot exceed the estimated lot value.' };
    }

    // Parse start date and time
    if (!lotData.startDate || !lotData.startTime) {
      return { success: false, error: 'Auction start date and time are required.' };
    }

    const startTimestamp = new Date(`${lotData.startDate}T${lotData.startTime}`).getTime();
    if (isNaN(startTimestamp)) {
      return { success: false, error: 'Invalid auction start date or time format.' };
    }

    if (startTimestamp <= Date.now()) {
      return { success: false, error: 'Auction start time must be scheduled in the future.' };
    }

    const durationDaysNum = parseFloat(lotData.durationDays);
    if (isNaN(durationDaysNum) || durationDaysNum <= 0) {
      return { success: false, error: 'Auction duration must be at least 0.1 days.' };
    }

    const endTimestamp = startTimestamp + Math.round(durationDaysNum * 86400000);
    const endsInSeconds = Math.max(0, Math.floor((endTimestamp - startTimestamp) / 1000));
    const minIncrement = Math.max(500, Math.round((startingBidNum * 0.05) / 500) * 500);

    // Human-readable formatted scheduled session
    const startDateObj = new Date(startTimestamp);
    const dateFormatted = startDateObj.toLocaleDateString('en-GB', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    const timeFormatted = startDateObj.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    const scheduledDateStr = `${dateFormatted} • ${timeFormatted} IST`;

    const primaryImage = lotData.image || (lotData.images && lotData.images[0]) || '';
    const imagesList = lotData.images && lotData.images.length > 0 ? lotData.images : [primaryImage];

    const newLot = {
      id: 'auc-lot-' + Date.now(),
      productId: lotData.productId || ('prod-' + Date.now()),
      name: lotData.name.trim(),
      maker: lotData.maker || lotData.seller,
      seller: lotData.seller.trim(),
      sellerId: lotData.sellerId,
      location: lotData.location || 'Studio Atelier',
      provenance: lotData.provenance || 'Authenticated studio masterwork',
      category: lotData.category || 'Handmade',
      startingBid: startingBidNum,
      currentBid: startingBidNum,
      estimatedValue: estimatedValueNum,
      minIncrement: minIncrement,
      bidCount: 0,
      bidHistory: [],
      scheduledDate: scheduledDateStr,
      scheduledTimestamp: startTimestamp,
      startDate: lotData.startDate,
      startTime: lotData.startTime,
      durationDays: durationDaysNum,
      endTime: endTimestamp,
      endTimestamp: endTimestamp,
      endsInSeconds: endsInSeconds,
      remainingSeconds: endsInSeconds,
      // Approval lifecycle status
      approvalStatus: 'pending', // 'pending' | 'approved' | 'rejected'
      status: 'pending',         // 'pending' | 'scheduled' | 'active' | 'ended'
      winner: null,
      image: primaryImage,
      images: imagesList,
      description: lotData.description || '',
      dimensions: lotData.dimensions || '',
      materials: lotData.materials || '',
      condition: lotData.condition || 'Pristine Studio Original',
      authenticityCertificate: 'Certificate of Provenance & Studio Hallmark',
      submittedAt: new Date().toISOString()
    };

    setCustomAuctions((prev) => [newLot, ...prev]);
    addToast(`"${newLot.name}" submitted successfully for curator approval.`);

    return { success: true, auction: newLot };
  }, [addToast]);

  // Approve a pending auction lot
  const approveAuctionLot = useCallback((identifier) => {
    setCustomAuctions((prev) =>
      prev.map((auc) => {
        if (auc.id === identifier || auc.productId === identifier) {
          const now = Date.now();
          const isStarted = now >= auc.scheduledTimestamp;
          const isEnded = now >= auc.endTimestamp;
          const nextStatus = isEnded ? 'ended' : isStarted ? 'active' : 'scheduled';
          const remaining = Math.max(0, Math.floor((auc.endTimestamp - now) / 1000));
          return {
            ...auc,
            approvalStatus: 'approved',
            status: nextStatus,
            remainingSeconds: remaining
          };
        }
        return auc;
      })
    );
    addToast('Auction lot approved and published.');
  }, [addToast]);

  // Reject an auction lot
  const rejectAuctionLot = useCallback((identifier) => {
    setCustomAuctions((prev) =>
      prev.map((auc) => {
        if (auc.id === identifier || auc.productId === identifier) {
          return {
            ...auc,
            approvalStatus: 'rejected',
            status: 'rejected'
          };
        }
        return auc;
      })
    );
    addToast('Auction lot listing rejected.');
  }, [addToast]);

  // Safe Demo Auction Reset Function (resets designated demo lots ONLY)
  const resetDemoAuction = useCallback(
    (auctionId, options = {}) => {
      if (!DEMO_AUCTION_IDS.includes(auctionId)) {
        console.warn(`[Veyra Demo Safe Reset] Auction "${auctionId}" is not a designated demo lot. Aborting.`);
        return { success: false, error: 'Only designated demo auctions can be reset.' };
      }

      const baseline = getDemoBaselineAuction(auctionId);
      if (!baseline) {
        return { success: false, error: 'Demo baseline data not found.' };
      }

      const now = Date.now();
      let start = now;
      let end = now + 30 * 60 * 1000; // default 30 mins

      // Configure start and end times via presets or custom timestamps
      if (options.preset === '15m') {
        start = now;
        end = now + 15 * 60 * 1000;
      } else if (options.preset === '30m') {
        start = now;
        end = now + 30 * 60 * 1000;
      } else if (options.preset === '1h') {
        start = now;
        end = now + 60 * 60 * 1000;
      } else if (options.preset === '2h') {
        start = now;
        end = now + 120 * 60 * 1000;
      } else if (options.preset === 'upcoming-5m') {
        start = now + 5 * 60 * 1000;
        end = start + 30 * 60 * 1000;
      } else if (options.preset === 'upcoming-15m') {
        start = now + 15 * 60 * 1000;
        end = start + 30 * 60 * 1000;
      } else if (options.startTimestamp && options.endTimestamp) {
        start = new Date(options.startTimestamp).getTime();
        end = new Date(options.endTimestamp).getTime();
      } else if (options.durationMinutes) {
        start = options.startTimestamp ? new Date(options.startTimestamp).getTime() : now;
        end = start + Math.max(1, Number(options.durationMinutes)) * 60 * 1000;
      }

      if (isNaN(start) || isNaN(end) || end <= start) {
        return { success: false, error: 'Invalid start or end time specified.' };
      }

      const isStarted = now >= start;
      const isEnded = now >= end;
      const targetStatus = isEnded ? 'ended' : isStarted ? 'active' : 'upcoming';
      const remaining = isEnded ? 0 : isStarted ? Math.floor((end - now) / 1000) : Math.floor((start - now) / 1000);
      const endsInSeconds = Math.max(0, Math.floor((end - start) / 1000));

      const resetBids = options.resetBids !== false;
      const startingBidNum = options.startingBid ? Number(options.startingBid) : baseline.startingBid;
      const currentBidNum = options.startingBid ? Number(options.startingBid) : baseline.currentBid;

      let updatedAuctionRecord = null;

      setLiveAuctions((prev) => {
        const nextList = prev.map((auc) => {
          if (auc.id === auctionId) {
            const base = resetBids ? baseline : auc;
            const merged = {
              ...base,
              ...auc,
              startTimestamp: start,
              scheduledTimestamp: start,
              endTimestamp: end,
              endTime: end,
              endsInSeconds,
              remainingSeconds: remaining,
              status: targetStatus,
              winner: null
            };

            if (resetBids) {
              merged.startingBid = startingBidNum;
              merged.currentBid = currentBidNum;
              merged.bidCount = baseline.bidCount;
              merged.bidHistory = baseline.bidHistory || [];
            }

            updatedAuctionRecord = merged;
            return merged;
          }
          return auc;
        });

        try {
          localStorage.setItem(AUCTIONS_STORAGE_KEY, JSON.stringify(nextList));
        } catch (e) {
          console.warn('Failed saving reset auction to localStorage', e);
        }

        return nextList;
      });

      // Clear user bid history only for this specific demo auction lot
      if (resetBids) {
        setUserBids((prev) => prev.filter((b) => b.auctionId !== auctionId));
      }

      // Synchronize across open browser tabs
      if (typeof BroadcastChannel !== 'undefined' && updatedAuctionRecord) {
        try {
          const bc = new BroadcastChannel('veyra_auction_realtime_sync');
          bc.postMessage({
            type: 'AUCTION_RESET',
            payload: { auctionId, updatedAuction: updatedAuctionRecord }
          });
          bc.close();
        } catch (e) {
          // ignore
        }
      }

      const durationMin = Math.round((end - start) / 60000);
      addToast(`Demo lot "${baseline.name.slice(0, 30)}..." reset to ${targetStatus.toUpperCase()} (${durationMin}m duration).`);

      return { success: true, auction: updatedAuctionRecord };
    },
    [addToast]
  );

  // Safe Demo Reset Function for ALL designated demo auctions
  const resetAllDemoAuctions = useCallback(
    (options = {}) => {
      const now = Date.now();
      const durationMin = options.durationMinutes ? Number(options.durationMinutes) : 30;
      const durationMs = durationMin * 60 * 1000;

      let updatedAuctionsList = [];

      setLiveAuctions((prev) => {
        const nextList = prev.map((auc, index) => {
          if (DEMO_AUCTION_IDS.includes(auc.id)) {
            const baseline = getDemoBaselineAuction(auc.id);
            if (!baseline) return auc;

            const start = now;
            const end = now + durationMs + index * 60000;
            const remaining = Math.max(0, Math.floor((end - now) / 1000));
            const endsIn = Math.max(0, Math.floor((end - start) / 1000));

            return {
              ...baseline,
              startTimestamp: start,
              scheduledTimestamp: start,
              endTimestamp: end,
              endTime: end,
              endsInSeconds: endsIn,
              remainingSeconds: remaining,
              status: 'active',
              winner: null
            };
          }
          return auc;
        });

        updatedAuctionsList = nextList;
        try {
          localStorage.setItem(AUCTIONS_STORAGE_KEY, JSON.stringify(nextList));
        } catch (e) {}

        return nextList;
      });

      // Clear demo bids from user bids history
      setUserBids((prev) => prev.filter((b) => !DEMO_AUCTION_IDS.includes(b.auctionId)));

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('veyra_auction_realtime_sync');
          bc.postMessage({
            type: 'AUCTION_RESET',
            payload: { updatedAuctions: updatedAuctionsList }
          });
          bc.close();
        } catch (e) {}
      }

      addToast(`All ${DEMO_AUCTION_IDS.length} demo auction lots reset and reopened (${durationMin}m live).`);
      return { success: true, count: DEMO_AUCTION_IDS.length };
    },
    [addToast]
  );

  // Authoritative Bid Placement Function (supports base & custom auctions)
  const placeBid = useCallback(
    (auctionId, amount, bidderName = 'Collector', userId = 'user-current') => {
      const now = Date.now();
      let outcome = { success: false, error: '' };

      // Helper updater
      const applyBidToAuction = (auction) => {
        if (!auction) return null;

        const start = auction.startTimestamp || auction.scheduledTimestamp || 0;
        const end = auction.endTimestamp || auction.endTime || 0;

        // 1. Time / status validation
        if (auction.status === 'ended' || (end > 0 && now >= end) || (auction.remainingSeconds ?? 0) <= 0) {
          outcome = { success: false, error: 'This auction has concluded. Bids are closed.' };
          return auction;
        }

        if (auction.status === 'upcoming' || (start > 0 && now < start)) {
          outcome = { success: false, error: 'This auction has not opened yet. Bidding begins at the scheduled start time.' };
          return auction;
        }

        // 2. Duplicate bid prevention & rapid double-click guard
        const topBid = auction.bidHistory && auction.bidHistory.length > 0 ? auction.bidHistory[0] : null;
        if (topBid) {
          if (Number(amount) === topBid.amount) {
            outcome = {
              success: false,
              error: `A bid of ₹${Number(amount).toLocaleString('en-IN')} has already been recorded.`
            };
            return auction;
          }

          if (topBid.bidderId === userId && (now - topBid.timestamp) < 2000) {
            outcome = {
              success: false,
              error: 'Your bid was just received. Please wait a moment before raising.'
            };
            return auction;
          }

          if (topBid.bidderId === userId && Number(amount) <= topBid.amount) {
            outcome = {
              success: false,
              error: 'You are already the leading bidder.'
            };
            return auction;
          }
        }

        // 3. Minimum amount validation
        const minAcceptable = auction.currentBid + auction.minIncrement;
        if (Number(amount) < minAcceptable) {
          outcome = {
            success: false,
            error: `Bid must be at least ₹${minAcceptable.toLocaleString('en-IN')}.`
          };
          return auction;
        }

        const newRecord = {
          id: 'b-' + Date.now(),
          bidder: bidderName,
          bidderId: userId,
          amount: Number(amount),
          time: 'Just now',
          timestamp: now
        };

        const updated = {
          ...auction,
          currentBid: Number(amount),
          bidCount: (auction.bidCount || 0) + 1,
          bidHistory: [newRecord, ...(auction.bidHistory || [])]
        };

        outcome = { success: true, updatedAuction: updated };
        return updated;
      };

      // Try updating in liveAuctions
      setLiveAuctions((prev) => {
        const found = prev.find((a) => a.id === auctionId || a.productId === auctionId);
        if (found) {
          const updated = applyBidToAuction(found);
          if (outcome.success) {
            return prev.map((a) => (a.id === found.id ? updated : a));
          }
        }
        return prev;
      });

      // Also try in customAuctions
      setCustomAuctions((prev) => {
        const found = prev.find((a) => a.id === auctionId || a.productId === auctionId);
        if (found) {
          const updated = applyBidToAuction(found);
          if (outcome.success) {
            return prev.map((a) => (a.id === found.id ? updated : a));
          }
        }
        return prev;
      });

      if (outcome.success) {
        addToast(`Bid of ₹${Number(amount).toLocaleString('en-IN')} placed successfully.`);

        // Broadcast to other open browser windows
        if (typeof BroadcastChannel !== 'undefined') {
          try {
            const bc = new BroadcastChannel('veyra_auction_realtime_sync');
            bc.postMessage({
              type: 'BID_PLACED',
              payload: { auctionId, updatedAuction: outcome.updatedAuction }
            });
            bc.close();
          } catch (e) {
            // ignore
          }
        }

        // Record in user's bids history
        const auctionTitle = outcome.updatedAuction?.name || 'Curated Lot';
        setUserBids((prev) => [
          {
            id: 'ub-' + Date.now(),
            auctionId,
            auctionTitle,
            amount: Number(amount),
            time: 'Just now',
            timestamp: Date.now(),
            status: 'Leading',
            image: outcome.updatedAuction?.image || ''
          },
          ...prev.filter((b) => b.auctionId !== auctionId)
        ]);
      }

      return outcome;
    },
    [addToast]
  );

  // Send auction live comment
  const sendAuctionComment = (auctionId, message, userName = 'Collector') => {
    if (!message || !message.trim()) return;

    const newComment = {
      id: 'c-' + Date.now(),
      user: userName,
      message: message.trim(),
      time: 'Just now',
      timestamp: Date.now()
    };

    setComments((prev) => ({
      ...prev,
      [auctionId]: [...(prev[auctionId] || []), newComment]
    }));

    // Broadcast comment
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('veyra_auction_realtime_sync');
        bc.postMessage({
          type: 'COMMENT_ADDED',
          payload: { auctionId, comment: newComment }
        });
        bc.close();
      } catch (e) {
        // ignore
      }
    }
  };

  // Registrations management
  const isRegistered = (auctionId) => registrations.includes(auctionId);

  const toggleRegistration = (auctionId) => {
    const auction = combinedUpcomingAuctions.find((a) => a.id === auctionId);
    const title = auction ? auction.name : 'Auction';

    if (registrations.includes(auctionId)) {
      setRegistrations((prev) => prev.filter((id) => id !== auctionId));
      addToast(`Registration cancelled for "${title}".`);
    } else {
      setRegistrations((prev) => [...prev, auctionId]);
      addToast(`Registration confirmed for "${title}". Your bidding pass is active.`);
    }
  };

  // Reminders management
  const isReminderSet = (auctionId) => reminders.includes(auctionId);

  const toggleReminder = (auctionId) => {
    const auction = combinedUpcomingAuctions.find((a) => a.id === auctionId);
    const title = auction ? auction.name : 'Auction';

    if (reminders.includes(auctionId)) {
      setReminders((prev) => prev.filter((id) => id !== auctionId));
      addToast(`Reminder removed for "${title}".`);
    } else {
      setReminders((prev) => [...prev, auctionId]);
      addToast(`Reminder confirmed for "${title}". Added to your schedule.`);
    }
  };

  // Get ranked leaderboard for a given auction lot
  const getLeaderboard = (auctionId) => {
    const auction = combinedLiveAuctions.find((a) => a.id === auctionId || a.productId === auctionId);
    if (!auction || !auction.bidHistory || auction.bidHistory.length === 0) {
      return [];
    }

    // Map highest bid per unique bidder
    const bidderMap = new Map();
    auction.bidHistory.forEach((record) => {
      const existing = bidderMap.get(record.bidder);
      if (!existing || record.amount > existing.amount) {
        bidderMap.set(record.bidder, record);
      }
    });

    const ranked = Array.from(bidderMap.values()).sort((a, b) => b.amount - a.amount);
    return ranked.map((entry, index) => ({
      rank: index + 1,
      bidder: entry.bidder,
      amount: entry.amount,
      time: entry.time,
      timestamp: entry.timestamp,
      isLeading: index === 0,
      isWinner: auction.status === 'ended' && index === 0
    }));
  };

  return (
    <AuctionContext.Provider
      value={{
        liveAuctions: combinedLiveAuctions,
        upcomingAuctions: combinedUpcomingAuctions,
        customAuctions,
        createAuctionLot,
        approveAuctionLot,
        rejectAuctionLot,
        placeBid,
        comments,
        sendAuctionComment,
        isRegistered,
        toggleRegistration,
        registrations,
        isReminderSet,
        toggleReminder,
        reminders,
        userBids,
        getLeaderboard,
        resetDemoAuction,
        resetAllDemoAuctions,
        DEMO_AUCTION_IDS
      }}
    >
      {children}
    </AuctionContext.Provider>
  );
};

export const useAuctions = () => {
  const context = useContext(AuctionContext);
  if (!context) {
    throw new Error('useAuctions must be used within an AuctionProvider');
  }
  return context;
};
