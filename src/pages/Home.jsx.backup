import React, { useState } from 'react';
import { CategoryCarousel } from '../components/CategoryCarousel';
import { WhyVeyra } from '../components/WhyVeyra';
import { QuickBidModal } from '../components/QuickBidModal';
import { useAuctions } from '../context/AuctionContext';

export const Home = () => {
  const { liveAuctions, upcomingAuctions } = useAuctions();
  const [selectedBidAuction, setSelectedBidAuction] = useState(null);

  return (
    <div style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* ====================================================================
          1. CHRISTIE'S-INSPIRED CATEGORY CAROUSEL
          ==================================================================== */}
      <CategoryCarousel
        liveAuctions={liveAuctions}
        upcomingAuctions={upcomingAuctions}
        onOpenBidModal={setSelectedBidAuction}
      />

      {/* ====================================================================
          2. WHY VEYRA CORE PILLARS
          ==================================================================== */}
      <WhyVeyra />

      {/* Modals */}
      {selectedBidAuction && (
        <QuickBidModal
          auction={selectedBidAuction}
          onClose={() => setSelectedBidAuction(null)}
        />
      )}
    </div>
  );
};
