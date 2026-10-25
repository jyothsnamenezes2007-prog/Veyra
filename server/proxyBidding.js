/**
 * server/proxyBidding.js
 * Authoritative Automatic Proxy Bidding Engine for Veyra
 * 
 * Rules enforced:
 * - Atomic execution using auction locks to prevent race conditions and duplicate bids
 * - Never bids above the buyer's authorized maximum amount
 * - Never bids against the buyer's own leading bid
 * - Never bids on inactive, scheduled, or ended auctions
 * - Sellers strictly prohibited from bidding on their own lots
 * - Direct Gemini API reasoning support with server-side validation
 * - Clear human-readable stop reasons when limits are reached
 */

import {
  getAuctionById,
  updateAuction,
  getProxyConfigs,
  updateProxyConfig
} from './db.js';
import { reasonWithGemini } from './gemini.js';

const MAX_PROXY_BID_ITERATIONS = 50;

/**
 * Evaluate and execute automatic proxy bids for an auction lot.
 * Must be executed within withAuctionLock(auctionId, ...) or called from an existing locked context.
 * 
 * @param {string} auctionId
 * @param {Function} broadcastSSE - function to broadcast SSE events to all connected clients
 * @returns {Promise<{ executedBids: Array, stoppedConfigs: Array }>}
 */
export async function evaluateAndExecuteProxyBids(auctionId, broadcastSSE) {
  const executedBids = [];
  const stoppedConfigs = [];

  let iteration = 0;
  while (iteration < MAX_PROXY_BID_ITERATIONS) {
    iteration++;

    const auction = getAuctionById(auctionId);
    if (!auction) break;

    // Check 1: Auction must be active/live
    const now = Date.now();
    const start = auction.startTimestamp || auction.scheduledTimestamp || 0;
    const end = auction.endTimestamp || auction.endTime || 0;

    if (auction.status !== 'active' && auction.status !== 'live') {
      break;
    }
    if (start > 0 && now < start) {
      break;
    }
    if (end > 0 && now >= end) {
      break;
    }
    if (auction.remainingSeconds !== undefined && auction.remainingSeconds <= 0 && end > 0 && now >= end) {
      break;
    }

    // Top bid currently on the auction
    const topBid = auction.bidHistory && auction.bidHistory.length > 0 ? auction.bidHistory[0] : null;

    // Active proxy configurations for this auction
    const allConfigs = getProxyConfigs(auctionId);
    const activeConfigs = allConfigs.filter((c) => c.status === 'active');

    if (activeConfigs.length === 0) {
      break;
    }

    // Filter out configs where the user is already the leading bidder or is the seller
    const competingConfigs = activeConfigs.filter((c) => {
      // Seller cannot bid on own lot
      if (auction.sellerId && auction.sellerId === c.userId) {
        return false;
      }
      // Never bid against own leading bid
      if (topBid && topBid.bidderId === c.userId) {
        return false;
      }
      return true;
    });

    if (competingConfigs.length === 0) {
      // Current leading bidder is already one of our proxy bidders (or no competitors)
      break;
    }

    // Evaluate candidates and their next valid bids
    const minInc = auction.minIncrement || 500;
    const eligibleCandidates = [];

    for (const config of competingConfigs) {
      const prefInc = Math.max(minInc, Number(config.preferredIncrement) || minInc);
      const nextValidBid = auction.bidCount > 0 ? auction.currentBid + prefInc : auction.startingBid;

      if (nextValidBid > config.maxBid) {
        // Next valid bid exceeds maximum authorized limit -> stop proxy bidding
        const stopReason = `Next valid bid of ₹${nextValidBid.toLocaleString('en-IN')} exceeds your maximum authorized limit of ₹${config.maxBid.toLocaleString('en-IN')}.`;
        
        updateProxyConfig(config.id, {
          status: 'outbid_stopped',
          stopReason: stopReason,
          updatedAt: Date.now()
        });

        stoppedConfigs.push({ ...config, stopReason });

        if (broadcastSSE) {
          broadcastSSE('PROXY_CONFIG_UPDATED', {
            auctionId,
            config: { ...config, status: 'outbid_stopped', stopReason }
          });
          broadcastSSE('PROXY_BID_LIMIT_EXCEEDED', {
            auctionId,
            proxyConfig: config,
            reason: stopReason
          });
        }
      } else {
        // Eligible to place next bid
        eligibleCandidates.push({
          config,
          nextValidBid
        });
      }
    }

    if (eligibleCandidates.length === 0) {
      break;
    }

    // Order candidates by creation timestamp (FIFO tie-breaker)
    eligibleCandidates.sort((a, b) => (a.config.createdAt || 0) - (b.config.createdAt || 0));

    const selected = eligibleCandidates[0];
    const { config: chosenConfig, nextValidBid } = selected;

    // AI decision support via Gemini (Observe -> Reason -> Request Action -> Verify)
    const geminiReasoning = await reasonWithGemini(
      {
        id: auction.id,
        name: auction.name,
        currentBid: auction.currentBid,
        minIncrement: minInc,
        bidCount: auction.bidCount,
        remainingSeconds: auction.remainingSeconds || Math.max(0, Math.floor((end - now) / 1000))
      },
      chosenConfig,
      nextValidBid
    );

    // Strict Authoritative Backend Verification (Gemini cannot override constraints)
    const proposedAmount = geminiReasoning.decision?.recommendedBid || nextValidBid;

    if (proposedAmount > chosenConfig.maxBid) {
      console.warn(`[Proxy Bidding] Rejected proposed bid ₹${proposedAmount} exceeding max ₹${chosenConfig.maxBid}`);
      break;
    }

    const minRequired = auction.bidCount > 0 ? auction.currentBid + minInc : auction.startingBid;
    if (proposedAmount < minRequired) {
      console.warn(`[Proxy Bidding] Rejected proposed bid ₹${proposedAmount} below minRequired ₹${minRequired}`);
      break;
    }

    // Place authoritative proxy bid
    const bidRecord = {
      id: 'pb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      bidder: chosenConfig.userName || 'Proxy Collector',
      bidderId: chosenConfig.userId,
      amount: proposedAmount,
      time: 'Just now',
      timestamp: Date.now(),
      isProxyBid: true
    };

    const updatedHistory = [bidRecord, ...(auction.bidHistory || [])];
    const updatedAuction = updateAuction(auctionId, {
      currentBid: proposedAmount,
      bidCount: (auction.bidCount || 0) + 1,
      bidHistory: updatedHistory
    });

    updateProxyConfig(chosenConfig.id, {
      lastBidAmount: proposedAmount,
      lastBidTime: Date.now(),
      stopReason: null,
      aiReasoning: geminiReasoning.aiAssisted ? geminiReasoning.decision?.reasoning : null
    });

    executedBids.push(bidRecord);

    if (broadcastSSE) {
      broadcastSSE('BID_PLACED', {
        auctionId,
        updatedAuction,
        bid: bidRecord
      });

      broadcastSSE('PROXY_BID_PLACED', {
        auctionId,
        proxyConfig: chosenConfig,
        bid: bidRecord,
        aiStatus: geminiReasoning.status
      });
    }
  }

  return { executedBids, stoppedConfigs };
}
