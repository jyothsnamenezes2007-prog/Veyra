import EventEmitter from 'node:events';
import { getAuctions, updateAuction, saveDatabase } from './db.js';
import { getAuthoritativeAuctionWinner } from '../src/data/auctions.js';

class AuctionScheduler extends EventEmitter {
  constructor() {
    super();
    this.timer = null;
    this.isRunning = false;
    this.tickIntervalMs = 1000;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[Scheduler] Background auction scheduler started.');

    // Run immediate startup reconciliation for downtime recovery
    this.reconcileOverdueAuctions();

    // Start 1-second server tick loop
    this.timer = setInterval(() => {
      this.tick();
    }, this.tickIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[Scheduler] Background auction scheduler stopped.');
  }

  /**
   * Reconcile any auctions that became overdue during server downtime or application restart.
   */
  reconcileOverdueAuctions() {
    const now = Date.now();
    const auctions = getAuctions();
    let changesMade = false;

    for (const auc of auctions) {
      if (auc.approvalStatus !== 'approved') continue;

      const start = auc.startTimestamp || auc.scheduledTimestamp || 0;
      const end = auc.endTimestamp || auc.endTime || (start + 86400000);

      // Case 1: Auction was scheduled and should have started while server was down
      if ((auc.status === 'scheduled' || auc.status === 'upcoming') && now >= start) {
        if (now < end) {
          // Started but not yet ended
          auc.status = 'active';
          auc.remainingSeconds = Math.max(0, Math.floor((end - now) / 1000));
          auc.currentBid = auc.currentBid || auc.startingBid;
          auc.minIncrement = auc.minIncrement || Math.max(500, Math.round(((auc.startingBid || 0) * 0.05) / 500) * 500);
          auc.bidCount = typeof auc.bidCount === 'number' && !isNaN(auc.bidCount) ? auc.bidCount : (auc.bidHistory?.length || 0);
          changesMade = true;
          console.log(`[Scheduler:Reconcile] Recovered auction "${auc.name}" (${auc.id}) -> transitioned to ACTIVE.`);
          this.emit('event', {
            type: 'AUCTION_STARTED',
            payload: { auction: auc, recovered: true }
          });
        } else {
          // Both started and ended during downtime -> finalize safely
          auc.status = 'ended';
          auc.remainingSeconds = 0;
          const winner = getAuthoritativeAuctionWinner(auc);
          auc.winner = winner;
          auc.winningBid = winner ? winner.amount : null;
          auc.result = winner ? 'sold' : 'unsold';
          changesMade = true;
          console.log(`[Scheduler:Reconcile] Recovered auction "${auc.name}" (${auc.id}) -> finalized as ENDED (Winner: ${winner?.bidder || 'None'}).`);
          this.emit('event', {
            type: 'AUCTION_ENDED',
            payload: { auction: auc, recovered: true }
          });
        }
      }

      // Case 2: Auction was active and ended while server was down
      if ((auc.status === 'active' || auc.status === 'live') && now >= end) {
        auc.status = 'ended';
        auc.remainingSeconds = 0;
        const winner = getAuthoritativeAuctionWinner(auc);
        auc.winner = winner;
        auc.winningBid = winner ? winner.amount : null;
        auc.result = winner ? 'sold' : 'unsold';
        changesMade = true;
        console.log(`[Scheduler:Reconcile] Finalized overdue active auction "${auc.name}" (${auc.id}) -> ENDED.`);
        this.emit('event', {
          type: 'AUCTION_ENDED',
          payload: { auction: auc, recovered: true }
        });
      }
    }

    if (changesMade) {
      saveDatabase();
    }
  }

  /**
   * Authoritative server tick: runs once every second.
   */
  tick() {
    const now = Date.now();
    const auctions = getAuctions();
    let hasChanges = false;

    for (const auc of auctions) {
      // Pending or non-approved listings never participate in active bidding
      if (auc.approvalStatus !== 'approved') continue;

      const start = auc.startTimestamp || auc.scheduledTimestamp || 0;
      const end = auc.endTimestamp || auc.endTime || (start + 86400000);

      // Check transition: Scheduled -> Active (Live)
      if ((auc.status === 'scheduled' || auc.status === 'upcoming') && now >= start) {
        if (now < end) {
          auc.status = 'active';
          auc.remainingSeconds = Math.max(0, Math.floor((end - now) / 1000));
          auc.currentBid = auc.currentBid || auc.startingBid;
          auc.minIncrement = auc.minIncrement || Math.max(500, Math.round(((auc.startingBid || 0) * 0.05) / 500) * 500);
          auc.bidCount = typeof auc.bidCount === 'number' && !isNaN(auc.bidCount) ? auc.bidCount : (auc.bidHistory?.length || 0);
          hasChanges = true;

          console.log(`[Scheduler] 🔔 Auction "${auc.name}" (${auc.id}) is now LIVE!`);
          this.emit('event', {
            type: 'AUCTION_STARTED',
            payload: { auction: auc }
          });
        } else {
          // Edge case: ended immediately
          auc.status = 'ended';
          auc.remainingSeconds = 0;
          const winner = getAuthoritativeAuctionWinner(auc);
          auc.winner = winner;
          auc.winningBid = winner ? winner.amount : null;
          auc.result = winner ? 'sold' : 'unsold';
          hasChanges = true;

          this.emit('event', {
            type: 'AUCTION_ENDED',
            payload: { auction: auc }
          });
        }
      }

      // Check transition: Active -> Ended
      else if ((auc.status === 'active' || auc.status === 'live') && now >= end) {
        auc.status = 'ended';
        auc.remainingSeconds = 0;

        // Authoritative winner calculation
        const winner = getAuthoritativeAuctionWinner(auc);
        auc.winner = winner;
        auc.winningBid = winner ? winner.amount : null;
        auc.result = winner ? 'sold' : 'unsold';
        hasChanges = true;

        console.log(`[Scheduler] 🏁 Auction "${auc.name}" (${auc.id}) has CONCLUDED. Result: ${auc.result.toUpperCase()}, Winner: ${winner?.bidder || 'None'}`);
        this.emit('event', {
          type: 'AUCTION_ENDED',
          payload: { auction: auc }
        });
      }

      // Live remaining seconds ticker
      else if (auc.status === 'active' || auc.status === 'live') {
        const remaining = Math.max(0, Math.floor((end - now) / 1000));
        if (auc.remainingSeconds !== remaining) {
          auc.remainingSeconds = remaining;
        }
      } else if (auc.status === 'scheduled' || auc.status === 'upcoming') {
        const remaining = Math.max(0, Math.floor((start - now) / 1000));
        if (auc.remainingSeconds !== remaining) {
          auc.remainingSeconds = remaining;
        }
      }
    }

    if (hasChanges) {
      saveDatabase();
    }
  }
}

export const scheduler = new AuctionScheduler();
