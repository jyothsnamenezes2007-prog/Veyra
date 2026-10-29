import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { formatINR } from '../data/products';
import {
  INITIAL_LIVE_AUCTIONS,
  UPCOMING_AUCTIONS,
  DEMO_AUCTION_IDS,
  getDemoBaselineAuction,
  getAuthoritativeAuctionWinner,
  getMeetingAccess,
  DEV_TEST_AUCTION_ID,
  getDevTestAuction
} from '../data/auctions';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getSocket } from '../lib/socket';

const AuctionContext = createContext(null);
const AUCTIONS_STORAGE_KEY = 'veyra_live_auctions_data';
const CUSTOM_AUCTIONS_STORAGE_KEY = 'veyra_custom_auctions';
const REMINDERS_STORAGE_KEY = 'veyra_auction_reminders';
const REGISTRATIONS_STORAGE_KEY = 'veyra_auction_registrations';
const USER_BIDS_STORAGE_KEY = 'veyra_user_bids_history';
const AUCTION_COMMENTS_KEY = 'veyra_auction_comments';

export const AuctionProvider = ({ children }) => {
  const { addToast } = useToast();
  const { user } = useAuth();

  // 1. Base Demo / Live Auctions state
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
              type: 'auction',
              isAuction: true,
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
      type: 'auction',
      isAuction: true,
      approvalStatus: 'approved',
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
  const [baseUpcomingAuctions, setBaseUpcomingAuctions] = useState(UPCOMING_AUCTIONS);
  const [isSupabaseAuctionsLoading, setIsSupabaseAuctionsLoading] = useState(false);

  // Synchronize live and upcoming auctions with Supabase
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let isMounted = true;
    setIsSupabaseAuctionsLoading(true);

    async function fetchSupabaseAuctions() {
      try {
        const { data, error } = await supabase
          .from('auctions')
          .select('*')
          .order('created_at', { ascending: true });

        if (error) {
          console.warn('Error reading auctions from Supabase:', error.message);
          return;
        }

        if (isMounted && Array.isArray(data) && data.length > 0) {
          const now = Date.now();
          const liveList = [];
          const upcomingList = [];

          data.forEach((row) => {
            const isUpcoming =
              row.status === 'upcoming' ||
              row.status === 'scheduled' ||
              (row.starts_at && new Date(row.starts_at).getTime() > now);

            if (isUpcoming) {
              const baseline =
                UPCOMING_AUCTIONS.find((a) => a.id === row.legacy_id || a.id === row.id) || {};
              const schedTimestamp = row.starts_at
                ? new Date(row.starts_at).getTime()
                : baseline.scheduledTimestamp || now + 86400000;
              upcomingList.push({
                ...baseline,
                id: row.legacy_id || row.id,
                supabaseId: row.id,
                name: row.title || baseline.name || 'Curated Lot',
                maker: row.seller_name || baseline.maker || baseline.seller || 'Studio Workshop',
                seller: row.seller_name || baseline.seller || 'Studio Workshop',
                scheduledTimestamp: schedTimestamp,
                startingBid: Number(row.starting_price || baseline.startingBid || 0),
                currentBid: Number(row.current_price || row.starting_price || baseline.currentBid || 0),
                thumbnail: row.image_url || baseline.thumbnail || '',
                image: row.image_url || baseline.thumbnail || '',
                description: row.description || baseline.description || '',
                status: 'upcoming'
              });
            } else {
              const baseline =
                INITIAL_LIVE_AUCTIONS.find((a) => a.id === row.legacy_id || a.id === row.id) || {};
              const start = row.starts_at ? new Date(row.starts_at).getTime() : now - 60000;
              const end = row.ends_at ? new Date(row.ends_at).getTime() : now + 7200000;
              const isEnded = row.status === 'ended' || now >= end;
              const remainingSeconds = isEnded ? 0 : Math.max(0, Math.floor((end - now) / 1000));
              liveList.push({
                ...baseline,
                id: row.legacy_id || row.id,
                supabaseId: row.id,
                name: row.title || baseline.name || 'Curated Lot',
                maker: row.seller_name || baseline.maker || baseline.seller || 'Studio Workshop',
                seller: row.seller_name || baseline.seller || 'Studio Workshop',
                startingBid: Number(row.starting_price || baseline.startingBid || 0),
                currentBid: Number(row.current_price || row.starting_price || baseline.currentBid || 0),
                startTimestamp: start,
                scheduledTimestamp: start,
                endTimestamp: end,
                endTime: end,
                remainingSeconds,
                status: isEnded ? 'ended' : 'active',
                image: row.image_url || baseline.image || '',
                images:
                  baseline.images && baseline.images.length > 0
                    ? baseline.images
                    : [row.image_url || baseline.image].filter(Boolean),
                description: row.description || baseline.description || '',
                type: 'auction',
                isAuction: true,
                approvalStatus: 'approved'
              });
            }
          });

          if (liveList.length > 0) {
            setLiveAuctions(liveList);
          }
          if (upcomingList.length > 0) {
            setBaseUpcomingAuctions(upcomingList);
          }
        }
      } catch (err) {
        console.warn('Failed to connect to Supabase auctions table:', err);
      } finally {
        if (isMounted) setIsSupabaseAuctionsLoading(false);
      }
    }

    fetchSupabaseAuctions();

    return () => {
      isMounted = false;
    };
  }, []);

  // 4. User auction registrations
  const [registrations, setRegistrations] = useState(() => {
    try {
      const saved = localStorage.getItem(REGISTRATIONS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : ['up-1'];
    } catch (e) {
      return [];
    }
  });

  // 5. User auction reminders
  const [reminders, setReminders] = useState(() => {
    try {
      const saved = localStorage.getItem(REMINDERS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : ['up-2'];
    } catch (e) {
      return [];
    }
  });

  // 6. User bids history
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
          status: 'Ongoing',
          image: 'https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=400&q=80'
        }
      ];
    } catch (e) {
      return [];
    }
  });

  // 7. Live comments / chat feeds
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

  // Storage persistence effects
  useEffect(() => {
    try {
      localStorage.setItem(AUCTIONS_STORAGE_KEY, JSON.stringify(liveAuctions));
    } catch (e) {}
  }, [liveAuctions]);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_AUCTIONS_STORAGE_KEY, JSON.stringify(customAuctions));
    } catch (e) {}
  }, [customAuctions]);

  useEffect(() => {
    try {
      localStorage.setItem(REGISTRATIONS_STORAGE_KEY, JSON.stringify(registrations));
    } catch (e) {}
  }, [registrations]);

  useEffect(() => {
    try {
      localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(reminders));
    } catch (e) {}
  }, [reminders]);

  useEffect(() => {
    try {
      localStorage.setItem(USER_BIDS_STORAGE_KEY, JSON.stringify(userBids));
    } catch (e) {}
  }, [userBids]);

  useEffect(() => {
    try {
      localStorage.setItem(AUCTION_COMMENTS_KEY, JSON.stringify(comments));
    } catch (e) {}
  }, [comments]);

  // Synchronize auction comments from server
  const fetchAuctionComments = useCallback(async (auctionId) => {
    if (!auctionId) return;
    try {
      const res = await fetch(`/api/auctions/${encodeURIComponent(auctionId)}/comments`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.comments)) {
          setComments((prev) => {
            const currentList = prev[auctionId] || [];
            const existingIds = new Set(currentList.map((c) => c.id));
            const newComments = data.comments.filter((c) => !existingIds.has(c.id));
            if (newComments.length === 0) return prev;
            return {
              ...prev,
              [auctionId]: [...currentList, ...newComments]
            };
          });
        }
      }
    } catch (e) {}
  }, []);

  // Synchronize with server backend and fetch initial authoritative state
  const syncWithServer = useCallback(async () => {
    try {
      const res = await fetch('/api/auctions');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.auctions)) {
          const demos = data.auctions.filter((a) => DEMO_AUCTION_IDS.includes(a.id));
          const customs = data.auctions.filter((a) => !DEMO_AUCTION_IDS.includes(a.id));

          const sanitizeAuction = (auc) => {
            const starting = Number(auc.startingBid) || 0;
            const current = typeof auc.currentBid === 'number' && !isNaN(auc.currentBid) ? auc.currentBid : starting;
            const minInc = typeof auc.minIncrement === 'number' && !isNaN(auc.minIncrement) && auc.minIncrement > 0
              ? auc.minIncrement
              : Math.max(500, Math.round((current * 0.05) / 500) * 500);
            const count = typeof auc.bidCount === 'number' && !isNaN(auc.bidCount) ? auc.bidCount : (auc.bidHistory?.length || 0);
            return {
              ...auc,
              startingBid: starting,
              currentBid: current,
              minIncrement: minInc,
              bidCount: count,
              bidHistory: Array.isArray(auc.bidHistory) ? auc.bidHistory : []
            };
          };

          if (demos.length > 0) {
            setLiveAuctions(demos.map(sanitizeAuction));
          }
          if (customs.length > 0) {
            setCustomAuctions(customs.map(sanitizeAuction));
          }
        }
      }
    } catch (err) {
      // Offline fallback: continue with local state
    }
  }, []);

  useEffect(() => {
    syncWithServer();
  }, [syncWithServer]);

  const remindersRef = useRef(reminders);
  useEffect(() => {
    remindersRef.current = reminders;
  }, [reminders]);

  // Real-time server push events via Socket.IO
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Resynchronize state upon reconnection to recover any missed updates
    const handleConnect = () => {
      syncWithServer();
    };

    const handleRealtimeEvent = (data) => {
      try {
        if (!data) return;
        const { type, payload } = data;

        if (type === 'AUCTION_STARTED') {
          const { auction } = payload;
          setLiveAuctions((prev) =>
            prev.map((a) => (a.id === auction.id ? { ...a, ...auction, status: 'active' } : a))
          );
          setCustomAuctions((prev) =>
            prev.map((a) => (a.id === auction.id ? { ...a, ...auction, status: 'active' } : a))
          );

          // Notify if reminder set
          if (remindersRef.current.includes(auction.id)) {
            addToast(`🔔 Live Now: "${auction.name}" has opened for competitive bidding!`);
          }
        } else if (type === 'AUCTION_ENDED') {
          const { auction } = payload;
          setLiveAuctions((prev) =>
            prev.map((a) => (a.id === auction.id ? { ...a, ...auction, status: 'ended' } : a))
          );
          setCustomAuctions((prev) =>
            prev.map((a) => (a.id === auction.id ? { ...a, ...auction, status: 'ended' } : a))
          );
          addToast(`Auction concluded for "${auction.name}".`);
        } else if (type === 'BID_PLACED') {
          const { auctionId, updatedAuction } = payload;
          setLiveAuctions((prev) =>
            prev.map((a) => (a.id === auctionId ? updatedAuction : a))
          );
          setCustomAuctions((prev) =>
            prev.map((a) => (a.id === auctionId ? updatedAuction : a))
          );
        } else if (type === 'AUCTION_APPROVED' || type === 'AUCTION_RESCHEDULED') {
          const { auction } = payload;
          setCustomAuctions((prev) => {
            const exists = prev.some((a) => a.id === auction.id);
            return exists ? prev.map((a) => (a.id === auction.id ? auction : a)) : [auction, ...prev];
          });
        } else if (type === 'AUCTION_CREATED') {
          const { auction } = payload;
          setCustomAuctions((prev) => {
            const exists = prev.some((a) => a.id === auction.id);
            return exists ? prev : [auction, ...prev];
          });
        } else if (type === 'PROXY_BID_PLACED') {
          const { bid, auctionId } = payload;
          addToast(`🤖 Auto-bid of ${formatINR(bid.amount)} placed for lot #${auctionId.toUpperCase()}.`);
        } else if (type === 'PROXY_BID_LIMIT_EXCEEDED') {
          const { reason, auctionId } = payload;
          addToast(`⚠️ Auto-bidding Alert (Lot #${auctionId.toUpperCase()}): ${reason}`, 'warning');
        } else if (type === 'COMMENT_ADDED') {
          const { auctionId, comment } = payload || {};
          if (auctionId && comment && comment.id) {
            setComments((prev) => {
              const list = prev[auctionId] || [];
              if (list.some((c) => c.id === comment.id)) {
                return prev;
              }
              return {
                ...prev,
                [auctionId]: [...list, comment]
              };
            });
          }
        }
      } catch (err) {
        console.warn('[AuctionContext] Real-time event handling error:', err);
      }
    };

    socket.on('connect', handleConnect);
    socket.on('event', handleRealtimeEvent);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('event', handleRealtimeEvent);
    };
  }, [addToast, syncWithServer]);

  // Cross-tab broadcast listener for multi-tab synchronization
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
          const { auctionId, comment } = payload || {};
          if (auctionId && comment && comment.id) {
            setComments((prev) => {
              const list = prev[auctionId] || [];
              if (list.some((c) => c.id === comment.id)) {
                return prev;
              }
              return {
                ...prev,
                [auctionId]: [...list, comment]
              };
            });
          }
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

  // 1-Second Smooth UI Countdown Ticker
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();

      // Tick liveAuctions
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
              winner = getAuthoritativeAuctionWinner(auc);
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

      // Tick customAuctions
      setCustomAuctions((prevCustom) => {
        let hasChanges = false;
        const updated = prevCustom.map((auc) => {
          if (auc.approvalStatus !== 'approved') return auc;

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
              winner = getAuthoritativeAuctionWinner(auc);
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

  // Filter approved active custom auctions
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

  // Combined Live Auctions
  const combinedLiveAuctions = useMemo(() => {
    const list = [...liveAuctions, ...activeApprovedCustomAuctions];
    if (import.meta.env.DEV && user?.id) {
      const devAuction = getDevTestAuction(user);
      if (devAuction && !list.some((a) => a.id === DEV_TEST_AUCTION_ID)) {
        list.push(devAuction);
      }
    }
    return list;
  }, [liveAuctions, activeApprovedCustomAuctions, user]);

  // Approved upcoming custom auctions
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

  // Create & Register a New Auction Lot
  const createAuctionLot = useCallback(
    async (lotData) => {
      // Validate locally first
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

      // Parse start date & time
      let startTimestamp = lotData.startTimestamp;
      if (!startTimestamp && lotData.startDate && lotData.startTime) {
        startTimestamp = new Date(`${lotData.startDate}T${lotData.startTime}`).getTime();
      }

      if (!startTimestamp || isNaN(startTimestamp)) {
        return { success: false, error: 'Auction start date and time are required.' };
      }

      if (startTimestamp <= Date.now()) {
        return { success: false, error: 'Auction start time must be scheduled in the future.' };
      }

      // Parse end date & time
      let endTimestamp = lotData.endTimestamp;
      if (!endTimestamp && lotData.endDate && lotData.endTime) {
        endTimestamp = new Date(`${lotData.endDate}T${lotData.endTime}`).getTime();
      } else if (!endTimestamp && lotData.durationDays) {
        endTimestamp = startTimestamp + Math.round(Number(lotData.durationDays) * 86400000);
      }

      if (!endTimestamp || isNaN(endTimestamp)) {
        return { success: false, error: 'Auction end date and time are required.' };
      }

      if (endTimestamp <= startTimestamp) {
        return { success: false, error: 'Auction end time must be after the start time.' };
      }

      const minIncrement = lotData.minIncrement
        ? Math.max(100, Number(lotData.minIncrement))
        : Math.max(500, Math.round((startingBidNum * 0.05) / 500) * 500);

      const payload = {
        ...lotData,
        startingBid: startingBidNum,
        estimatedValue: estimatedValueNum,
        startTimestamp,
        endTimestamp,
        minIncrement
      };

      try {
        // Authoritative server persistence (server coordinates Supabase sync, validation & paired catalog)
        const res = await fetch('/api/auctions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.auction) {
            setCustomAuctions((prev) => [data.auction, ...prev.filter((a) => a.id !== data.auction.id)]);
            addToast(`"${data.auction.name}" submitted successfully for curator approval.`);
            return { success: true, auction: data.auction };
          }
        }
      } catch (e) {
        // Fallback to local store if server offline
      }

      // Local fallback creation
      const endsInSeconds = Math.max(0, Math.floor((endTimestamp - startTimestamp) / 1000));
      const primaryImage = lotData.image || (lotData.images && lotData.images[0]) || '';
      const imagesList = lotData.images && lotData.images.length > 0 ? lotData.images : [primaryImage];

      const newLot = {
        id: 'auc-lot-' + Date.now(),
        productId: lotData.productId || ('prod-' + Date.now()),
        type: 'auction',
        isAuction: true,
        name: lotData.name.trim(),
        maker: lotData.maker || lotData.seller,
        seller: lotData.seller.trim(),
        sellerId: lotData.sellerId,
        location: lotData.location || 'Studio Atelier',
        provenance: lotData.provenance || '',
        category: lotData.category || 'Handmade',
        startingBid: startingBidNum,
        currentBid: startingBidNum,
        estimatedValue: estimatedValueNum,
        minIncrement: minIncrement,
        reservePrice: lotData.reservePrice ? Number(lotData.reservePrice) : null,
        bidCount: 0,
        bidHistory: [],
        startTimestamp: startTimestamp,
        scheduledTimestamp: startTimestamp,
        endTimestamp: endTimestamp,
        endTime: endTimestamp,
        endsInSeconds: endsInSeconds,
        remainingSeconds: endsInSeconds,
        approvalStatus: 'pending',
        status: 'pending',
        winner: null,
        image: primaryImage,
        images: imagesList,
        description: lotData.description || '',
        dimensions: lotData.dimensions || '',
        materials: lotData.materials || '',
        condition: lotData.condition || 'Pristine Studio Original',
        authenticityCertificate: lotData.authenticityCertificate || '',
        submittedAt: new Date().toISOString()
      };

      setCustomAuctions((prev) => [newLot, ...prev]);
      addToast(`"${newLot.name}" submitted successfully for curator approval.`);
      return { success: true, auction: newLot };
    },
    [addToast]
  );

  // Approve a pending auction lot
  const approveAuctionLot = useCallback(
    async (identifier) => {
      const found = customAuctions.find((a) => a.id === identifier || a.productId === identifier);
      const targetId = found ? found.id : identifier;

      try {
        const res = await fetch(`/api/auctions/${targetId}/approve`, { method: 'POST' });
        const data = await res.json();

        if (!data.success) {
          if (data.requiresReschedule) {
            addToast(data.error, 'error');
            return { success: false, error: data.error, requiresReschedule: true };
          }
          addToast(data.error || 'Failed to approve auction lot.', 'error');
          return { success: false, error: data.error };
        }

        if (data.auction) {
          setCustomAuctions((prev) =>
            prev.map((auc) => (auc.id === data.auction.id ? data.auction : auc))
          );
          addToast('Auction lot approved and published.');
          return { success: true, auction: data.auction };
        }
      } catch (err) {
        // Fallback
      }

      // Local fallback approval
      let outcome = { success: false };
      setCustomAuctions((prev) =>
        prev.map((auc) => {
          if (auc.id === identifier || auc.productId === identifier) {
            const now = Date.now();
            const start = auc.scheduledTimestamp || auc.startTimestamp || 0;

            if (now >= start) {
              outcome = {
                success: false,
                error: 'Cannot approve: scheduled start time has already passed. Please reschedule before activating.',
                requiresReschedule: true
              };
              return auc;
            }

            outcome = { success: true };
            const remaining = Math.max(0, Math.floor((start - now) / 1000));
            return {
              ...auc,
              approvalStatus: 'approved',
              status: 'scheduled',
              remainingSeconds: remaining
            };
          }
          return auc;
        })
      );

      if (outcome.success) {
        addToast('Auction lot approved and published.');
      } else if (outcome.error) {
        addToast(outcome.error, 'error');
      }

      return outcome;
    },
    [customAuctions, addToast]
  );

  // Reschedule an overdue or pending auction
  const rescheduleAuctionLot = useCallback(
    async (identifier, { startTimestamp, endTimestamp }) => {
      const found = customAuctions.find((a) => a.id === identifier || a.productId === identifier);
      const targetId = found ? found.id : identifier;

      try {
        const res = await fetch(`/api/auctions/${targetId}/reschedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startTimestamp, endTimestamp })
        });
        const data = await res.json();
        if (data.success && data.auction) {
          setCustomAuctions((prev) =>
            prev.map((auc) => (auc.id === data.auction.id ? data.auction : auc))
          );
          addToast('Auction lot rescheduled successfully.');
          return { success: true, auction: data.auction };
        }
      } catch (err) {}

      // Local fallback
      setCustomAuctions((prev) =>
        prev.map((auc) => {
          if (auc.id === identifier || auc.productId === identifier) {
            return {
              ...auc,
              startTimestamp,
              scheduledTimestamp: startTimestamp,
              endTimestamp,
              endTime: endTimestamp,
              approvalStatus: 'approved',
              status: 'scheduled'
            };
          }
          return auc;
        })
      );
      addToast('Auction lot rescheduled successfully.');
      return { success: true };
    },
    [customAuctions, addToast]
  );

  // Reject an auction lot
  const rejectAuctionLot = useCallback(
    async (identifier) => {
      const found = customAuctions.find((a) => a.id === identifier || a.productId === identifier);
      const targetId = found ? found.id : identifier;

      try {
        const res = await fetch(`/api/auctions/${targetId}/reject`, { method: 'POST' });
        const data = await res.json();
        if (data.success && data.auction) {
          setCustomAuctions((prev) =>
            prev.map((auc) => (auc.id === data.auction.id ? data.auction : auc))
          );
          addToast('Auction lot listing rejected.');
          return;
        }
      } catch (err) {}

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
    },
    [customAuctions, addToast]
  );

  // Authoritative Bid Placement Function
  const placeBid = useCallback(
    async (auctionId, amount, bidderName = 'Collector', userId = 'user-current') => {
      const now = Date.now();
      const numAmount = Number(amount);

      // Try server backend first
      try {
        const res = await fetch(`/api/auctions/${auctionId}/bid`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: numAmount, bidderName, userId })
        });

        const data = await res.json();
        if (!data.success) {
          return { success: false, error: data.error || 'Failed to place bid.' };
        }

        const updated = data.auction;
        setLiveAuctions((prev) => prev.map((a) => (a.id === auctionId ? updated : a)));
        setCustomAuctions((prev) => prev.map((a) => (a.id === auctionId ? updated : a)));

        addToast(`Bid of ₹${numAmount.toLocaleString('en-IN')} placed successfully.`);

        // Record in user's bids history
        setUserBids((prev) => [
          {
            id: 'ub-' + Date.now(),
            auctionId,
            auctionTitle: updated.name || 'Curated Lot',
            amount: numAmount,
            time: 'Just now',
            timestamp: Date.now(),
            status: 'Ongoing',
            image: updated.image || ''
          },
          ...prev.filter((b) => b.auctionId !== auctionId)
        ]);

        return { success: true, updatedAuction: updated };
      } catch (err) {
        // Fallback to local evaluation (e.g. offline unit testing)
      }

      // Local fallback bidding engine
      let outcome = { success: false, error: '' };

      const applyBidToAuction = (auction) => {
        if (!auction) return null;

        const start = auction.startTimestamp || auction.scheduledTimestamp || 0;
        const end = auction.endTimestamp || auction.endTime || 0;

        if (auction.status === 'ended' || (end > 0 && now >= end) || (auction.remainingSeconds ?? 0) <= 0) {
          outcome = { success: false, error: 'This auction has concluded. Bids are closed.' };
          return auction;
        }

        if (auction.status === 'upcoming' || auction.status === 'scheduled' || (start > 0 && now < start)) {
          outcome = {
            success: false,
            error: 'This auction has not opened yet. Bidding begins at the scheduled start time.'
          };
          return auction;
        }

        if (auction.sellerId && auction.sellerId === userId) {
          outcome = {
            success: false,
            error: 'Sellers are strictly prohibited from bidding on their own auction lots.'
          };
          return auction;
        }

        const topBid = auction.bidHistory && auction.bidHistory.length > 0 ? auction.bidHistory[0] : null;
        if (topBid) {
          if (numAmount === topBid.amount) {
            outcome = {
              success: false,
              error: `A bid of ₹${numAmount.toLocaleString('en-IN')} has already been recorded.`
            };
            return auction;
          }

          if (topBid.bidderId === userId && now - topBid.timestamp < 2000) {
            outcome = {
              success: false,
              error: 'Your bid was just received. Please wait a moment before raising.'
            };
            return auction;
          }

          if (topBid.bidderId === userId && numAmount <= topBid.amount) {
            outcome = {
              success: false,
              error: 'You are already the leading bidder.'
            };
            return auction;
          }

          if (numAmount <= topBid.amount) {
            outcome = {
              success: false,
              error: `A bid of ₹${topBid.amount.toLocaleString('en-IN')} or higher has already been placed.`
            };
            return auction;
          }
        }

        const minAcceptable = auction.currentBid + (auction.minIncrement || 500);
        if (numAmount < minAcceptable && auction.bidCount > 0) {
          outcome = {
            success: false,
            error: `Bid must be at least ₹${minAcceptable.toLocaleString('en-IN')}.`
          };
          return auction;
        }

        if (numAmount < auction.startingBid) {
          outcome = {
            success: false,
            error: `Bid cannot be lower than the starting price of ₹${auction.startingBid.toLocaleString('en-IN')}.`
          };
          return auction;
        }

        const newRecord = {
          id: 'b-' + Date.now(),
          bidder: bidderName,
          bidderId: userId,
          amount: numAmount,
          time: 'Just now',
          timestamp: now
        };

        const updated = {
          ...auction,
          currentBid: numAmount,
          bidCount: (auction.bidCount || 0) + 1,
          bidHistory: [newRecord, ...(auction.bidHistory || [])]
        };

        outcome = { success: true, updatedAuction: updated };
        return updated;
      };

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
        addToast(`Bid of ₹${numAmount.toLocaleString('en-IN')} placed successfully.`);

        if (typeof BroadcastChannel !== 'undefined') {
          try {
            const bc = new BroadcastChannel('veyra_auction_realtime_sync');
            bc.postMessage({
              type: 'BID_PLACED',
              payload: { auctionId, updatedAuction: outcome.updatedAuction }
            });
            bc.close();
          } catch (e) {}
        }

        setUserBids((prev) => [
          {
            id: 'ub-' + Date.now(),
            auctionId,
            auctionTitle: outcome.updatedAuction?.name || 'Curated Lot',
            amount: numAmount,
            time: 'Just now',
            timestamp: Date.now(),
            status: 'Ongoing',
            image: outcome.updatedAuction?.image || ''
          },
          ...prev.filter((b) => b.auctionId !== auctionId)
        ]);
      }

      return outcome;
    },
    [addToast]
  );

  // Safe Demo Auction Reset Function (resets designated demo lots ONLY)
  const resetDemoAuction = useCallback(
    (auctionId, options = {}) => {
      if (!DEMO_AUCTION_IDS.includes(auctionId)) {
        return { success: false, error: 'Only designated demo auctions can be reset.' };
      }

      const baseline = getDemoBaselineAuction(auctionId);
      if (!baseline) {
        return { success: false, error: 'Demo baseline data not found.' };
      }

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
        } catch (e) {}

        return nextList;
      });

      if (resetBids) {
        setUserBids((prev) => prev.filter((b) => b.auctionId !== auctionId));
      }

      if (typeof BroadcastChannel !== 'undefined' && updatedAuctionRecord) {
        try {
          const bc = new BroadcastChannel('veyra_auction_realtime_sync');
          bc.postMessage({
            type: 'AUCTION_RESET',
            payload: { auctionId, updatedAuction: updatedAuctionRecord }
          });
          bc.close();
        } catch (e) {}
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

  // Comments
  const sendAuctionComment = async (auctionId, message, userName = 'Collector') => {
    if (!message || !message.trim()) return;

    const trimmedMsg = message.trim();
    const commentId = 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const now = Date.now();

    const newComment = {
      id: commentId,
      user: userName,
      message: trimmedMsg,
      time: 'Just now',
      timestamp: now
    };

    // Optimistically update local state with duplicate ID guard
    setComments((prev) => {
      const list = prev[auctionId] || [];
      if (list.some((c) => c.id === commentId)) return prev;
      return {
        ...prev,
        [auctionId]: [...list, newComment]
      };
    });

    // Cross-tab synchronization
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('veyra_auction_realtime_sync');
        bc.postMessage({
          type: 'COMMENT_ADDED',
          payload: { auctionId, comment: newComment }
        });
        bc.close();
      } catch (e) {}
    }

    // Authoritative backend persistence & SSE broadcast
    try {
      await fetch(`/api/auctions/${encodeURIComponent(auctionId)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: commentId,
          user: userName,
          message: trimmedMsg
        })
      });
    } catch (e) {
      // Offline fallback maintained via local state
    }
  };

  // Registrations
  const isRegistered = (auctionId) => registrations.includes(auctionId);
  const toggleRegistration = (auctionId) => {
    const auction = combinedUpcomingAuctions.find((a) => a.id === auctionId || a.supabaseId === auctionId);
    const title = auction ? auction.name : 'Auction';

    if (registrations.includes(auctionId)) {
      setRegistrations((prev) => prev.filter((id) => id !== auctionId));
      addToast(`Registration cancelled for "${title}".`);
    } else {
      setRegistrations((prev) => [...prev, auctionId]);
      addToast(`Registration confirmed for "${title}". Your bidding pass is active.`);
    }
  };

  // Reminders
  const isReminderSet = (auctionId) => reminders.includes(auctionId);
  const toggleReminder = (auctionId) => {
    const auction = combinedUpcomingAuctions.find((a) => a.id === auctionId || a.supabaseId === auctionId);
    const title = auction ? auction.name : 'Auction';

    if (reminders.includes(auctionId)) {
      setReminders((prev) => prev.filter((id) => id !== auctionId));
      addToast(`Reminder removed for "${title}".`);
    } else {
      setReminders((prev) => [...prev, auctionId]);
      addToast(`Reminder confirmed for "${title}". Added to your schedule.`);
    }
  };

  // Leaderboard
  const getLeaderboard = (auctionId) => {
    const auction = combinedLiveAuctions.find((a) => a.id === auctionId || a.productId === auctionId || a.supabaseId === auctionId);
    if (!auction || !auction.bidHistory || auction.bidHistory.length === 0) {
      return [];
    }

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

  // Automatic Proxy Bidding Helpers
  const getProxyBidConfig = useCallback(async (auctionId, userId) => {
    if (!auctionId || !userId) return { success: false, config: null };
    try {
      const res = await fetch(`/api/auctions/${encodeURIComponent(auctionId)}/proxy-bid?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, []);

  const enableProxyBid = useCallback(async (auctionId, { maxBid, preferredIncrement, userId, userName }) => {
    try {
      const res = await fetch(`/api/auctions/${encodeURIComponent(auctionId)}/proxy-bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxBid, preferredIncrement, userId, userName })
      });
      const data = await res.json();
      if (data.success) {
        addToast(`Auto-bidding activated. Maximum authorized: ${formatINR(maxBid)}.`);
      } else {
        addToast(data.error || 'Failed to enable auto-bidding.', 'error');
      }
      return data;
    } catch (err) {
      addToast(err.message || 'Network error enabling proxy bidding.', 'error');
      return { success: false, error: err.message };
    }
  }, [addToast]);

  const disableProxyBid = useCallback(async (auctionId, userId) => {
    try {
      const res = await fetch(`/api/auctions/${encodeURIComponent(auctionId)}/proxy-bid/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success) {
        addToast('Auto-bidding disabled for this lot.');
      } else {
        addToast(data.error || 'Failed to disable proxy bidding.', 'error');
      }
      return data;
    } catch (err) {
      addToast(err.message || 'Network error disabling proxy bidding.', 'error');
      return { success: false, error: err.message };
    }
  }, [addToast]);

  return (
    <AuctionContext.Provider
      value={{
        liveAuctions: combinedLiveAuctions,
        upcomingAuctions: combinedUpcomingAuctions,
        customAuctions,
        createAuctionLot,
        approveAuctionLot,
        rescheduleAuctionLot,
        rejectAuctionLot,
        placeBid,
        getProxyBidConfig,
        enableProxyBid,
        disableProxyBid,
        comments,
        sendAuctionComment,
        fetchAuctionComments,
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
        DEMO_AUCTION_IDS,
        DEV_TEST_AUCTION_ID,
        getAuthoritativeAuctionWinner,
        getMeetingAccess
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
