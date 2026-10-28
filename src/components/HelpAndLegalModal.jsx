import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  FileText,
  HelpCircle,
  Gavel,
  Store,
  Package,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';

export const HelpAndLegalModal = ({ isOpen, initialTab = 'help', initialTopic = null, onClose }) => {
  const [activeTab, setActiveTab] = useState(initialTab); // 'help' | 'privacy' | 'terms'
  const [selectedTopic, setSelectedTopic] = useState(initialTopic || 'buying');

  if (!isOpen) return null;

  const HELP_TOPICS = [
    {
      id: 'buying',
      icon: Gavel,
      title: 'Buying & Bidding',
      summary: 'Floor bidding rules, minimum increments, and auto-bidding automation.',
      content: (
        <div>
          <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Live Auction Bidding & Floor Mechanics
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
            Veyra operates synchronized live auction rooms where bids are accepted on an authoritative server ledger in real time. Each lot has a designated starting bid and a minimum increment rule (minimum ₹500 or 5% of lot value).
          </p>
          <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Auto-bidding (Automatic Proxy Bidding)
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
            Collectors can activate Auto-bidding on any active or upcoming lot. You specify your Maximum Authorized Limit and Preferred Bid Increment. When competing bids arrive, the system automatically places the minimum necessary counter-bid up to your authorized limit.
          </p>
          <ul style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: '18px' }}>
            <li>Every accepted bid is immediate and binding on the platform.</li>
            <li>Self-overbids and double-clicks are rejected by server concurrency locks.</li>
            <li>Bidding closes authoritatively when the auction countdown timer expires.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'selling',
      icon: Store,
      title: 'Selling & Consignment',
      summary: 'Listing handcrafted studio pieces, approval workflow, and fee structure.',
      content: (
        <div>
          <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Listing Studio Objects & Scheduling Lots
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
            Independent artisans and heritage workshops can list shop objects or schedule live auction lots using the Seller Atelier. All submissions undergo curator review for authenticity, quality standards, and craftsmanship provenance.
          </p>
          <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Commission & Transparent Fee Structure
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
            Veyra charges a flat 5% platform commission on completed sales, with no hidden listing fees, catalog fees, or withdrawal penalties for unsold lots.
          </p>
          <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Seller Management & Product Deletion
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Sellers can delete their own eligible sold products from the My Products dashboard. Historical auction ledgers, bid histories, and completed order invoices remain securely preserved. Active ongoing auction lots cannot be deleted while live.
          </p>
        </div>
      )
    },
    {
      id: 'authentication',
      icon: ShieldCheck,
      title: 'Authentication & Provenance',
      summary: 'Atelier standards, archival marks, and certificate verification.',
      content: (
        <div>
          <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Veyra Curation & Verification Standards
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
            Every object presented on Veyra is vetted against physical criteria: studio attribution, maker mark, material integrity, and verifiable ownership history. High-value lots include archival documentation or physical provenance inspection.
          </p>
          <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Studio Certificates of Authenticity
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Upon winning or purchasing an artisan lot, a digitally signed and physical Certificate of Authenticity is issued directly by the master workshop, detailing material specifications, edition number, and artisan signatures.
          </p>
        </div>
      )
    },
    {
      id: 'shipping',
      icon: Package,
      title: 'Orders & White-Glove Shipping',
      summary: 'Payment processing, insured white-glove transport, and returns.',
      content: (
        <div>
          <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Secured Escrow & Payment Processing
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
            Payments for auction wins and shop purchases are held in escrow until the object is safely received and verified by the collector. We support credit/debit cards, UPI, net banking, and verified wire transfers.
          </p>
          <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Insured White-Glove Delivery
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
            Fragile ceramics, archival furniture, and fine art pieces are transported via specialized climate-controlled carriers with 100% full-value transit insurance and end-to-end telemetry tracking.
          </p>
          <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Post-Auction Private Consultation (WebRTC)
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Winners of completed auction lots can enter a private, secure one-on-one video consultation with the artisan workshop to discuss packaging, custom crating, provenance documentation, and bespoke delivery arrangements.
          </p>
        </div>
      )
    },
    {
      id: 'security',
      icon: Lock,
      title: 'Account & Security',
      summary: 'Collector credentials, session privacy, and security practices.',
      content: (
        <div>
          <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Collector Identity & Privacy
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '14px' }}>
            Your personal information, phone number, and physical addresses are strictly protected. In live auction rooms, your bids appear with your chosen collector handle or pseudonym to safeguard privacy.
          </p>
          <h4 style={{ fontSize: '15px', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Cryptographic Integrity & Anti-Fraud
          </h4>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            All bids and transactions are authenticated with cryptographic timestamps. Shill bidding (sellers bidding on their own lots) is strictly prevented by automated backend identity validation.
          </p>
        </div>
      )
    }
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        backgroundColor: 'rgba(25, 25, 25, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 'var(--radius-xs)',
          maxWidth: '840px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--border-color)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.22)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Top Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-primary)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {activeTab === 'help' && <HelpCircle size={20} color="var(--accent-burgundy)" />}
            {activeTab === 'privacy' && <ShieldCheck size={20} color="var(--accent-burgundy)" />}
            {activeTab === 'terms' && <FileText size={20} color="var(--accent-burgundy)" />}
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'var(--font-serif)', color: 'var(--text-primary)' }}>
                {activeTab === 'help' && 'Veyra Help Centre & Support'}
                {activeTab === 'privacy' && 'Privacy Policy & Data Practices'}
                {activeTab === 'terms' && 'Marketplace Terms & Auction Conditions'}
              </h3>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Curated Craftsmanship & Authoritative Live Auctions
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '6px',
              borderRadius: 'var(--radius-xs)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: '#FFFFFF',
            padding: '0 24px'
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('help')}
            style={{
              padding: '12px 18px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              backgroundColor: 'transparent',
              color: activeTab === 'help' ? 'var(--accent-burgundy)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'help' ? '2px solid var(--accent-burgundy)' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <HelpCircle size={15} />
            <span>Help Centre</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            style={{
              padding: '12px 18px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              backgroundColor: 'transparent',
              color: activeTab === 'privacy' ? 'var(--accent-burgundy)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'privacy' ? '2px solid var(--accent-burgundy)' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <ShieldCheck size={15} />
            <span>Privacy Policy</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            style={{
              padding: '12px 18px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              backgroundColor: 'transparent',
              color: activeTab === 'terms' ? 'var(--accent-burgundy)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'terms' ? '2px solid var(--accent-burgundy)' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FileText size={15} />
            <span>Terms & Conditions</span>
          </button>
        </div>

        {/* Modal Scrollable Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* TAB 1: HELP CENTRE */}
          {activeTab === 'help' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) 1fr', gap: '24px' }}>
              {/* Sidebar of Topics */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Support Categories
                </span>
                {HELP_TOPICS.map((topic) => {
                  const Icon = topic.icon;
                  const isCurrent = selectedTopic === topic.id;
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      onClick={() => setSelectedTopic(topic.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid',
                        borderColor: isCurrent ? 'rgba(120,59,75,0.3)' : 'var(--border-color)',
                        backgroundColor: isCurrent ? 'rgba(120,59,75,0.06)' : '#FFFFFF',
                        color: isCurrent ? 'var(--accent-burgundy)' : 'var(--text-primary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '12.5px',
                        fontWeight: isCurrent ? 700 : 500
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Icon size={15} />
                        <span>{topic.title}</span>
                      </span>
                      <ChevronRight size={13} style={{ opacity: isCurrent ? 1 : 0.3 }} />
                    </button>
                  );
                })}

                <div
                  style={{
                    marginTop: '20px',
                    padding: '14px',
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                    Need Direct Assistance?
                  </span>
                  <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    Our curatorial concierge is available to assist collectors with bidding authorizations and provenance queries.
                  </p>
                  <a
                    href="mailto:concierge@veyra.art"
                    style={{
                      display: 'inline-block',
                      marginTop: '8px',
                      fontSize: '11.5px',
                      color: 'var(--accent-burgundy)',
                      fontWeight: 600
                    }}
                  >
                    concierge@veyra.art
                  </a>
                </div>
              </div>

              {/* Main Content Pane */}
              <div
                style={{
                  padding: '20px 24px',
                  backgroundColor: '#FFFFFF',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border-color)'
                }}
              >
                {HELP_TOPICS.find((t) => t.id === selectedTopic)?.content}
              </div>
            </div>
          )}

          {/* TAB 2: PRIVACY POLICY */}
          {activeTab === 'privacy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h4 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  1. Information We Collect
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  VEYRA collects personal credentials necessary to provide authoritative live auctions and marketplace transactions: account registration data (name, email, phone number, workshop studio handles), bidding audit logs, transaction records, and WebRTC consultation connection metadata.
                </p>
              </div>

              <div>
                <h4 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  2. Use of Collector Data & Real-Time Synchronization
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Data is processed to calculate authoritative current high bids, validate auto-bidding ceiling limits, send outbid alerts, verify seller item ownership, and ensure safe escrow fulfillment. Your financial payment data is never stored directly on our application servers.
                </p>
              </div>

              <div>
                <h4 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  3. Post-Auction Video Consultation Privacy
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Post-auction consultations between winning collectors and artisan workshops are conducted via direct peer-to-peer WebRTC connections. Video and audio media streams are end-to-end encrypted and are not recorded or persisted on platform servers.
                </p>
              </div>

              <div>
                <h4 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  4. Data Retention & Product Deletion Rules
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  When a seller deletes an eligible sold product, the public catalog listing is removed from active display. In compliance with commercial records retention standards, historical auction outcomes, financial transactions, and invoice records remain securely archived.
                </p>
              </div>

              {/* Mandatory Legal Disclaimer */}
              <div
                style={{
                  padding: '16px 20px',
                  backgroundColor: 'rgba(212, 163, 115, 0.12)',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid rgba(212, 163, 115, 0.4)',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                  marginTop: '10px'
                }}
              >
                <AlertTriangle size={18} color="#8C5A24" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ fontSize: '12.5px', color: '#8C5A24', display: 'block', marginBottom: '4px' }}>
                    Demonstration & Development Legal Disclaimer
                  </strong>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                    This document and the Veyra platform are currently deployed for demonstration, testing, and portfolio validation purposes. All marketplace terms, escrow mechanisms, and privacy provisions herein should be formally reviewed, modified, and ratified by certified legal counsel prior to commercial production deployment.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: TERMS & CONDITIONS */}
          {activeTab === 'terms' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h4 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  1. Authoritative Bidding Commitments
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  All bids submitted on Veyra live auction floors — whether entered manually or placed automatically via the Auto-bidding proxy engine — constitute legally binding purchase commitments. A bid cannot be retracted once verified on the server ledger.
                </p>
              </div>

              <div>
                <h4 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  2. Auto-bidding Execution Rules
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  By configuring Auto-bidding, the collector authorizes the platform to submit automatic incremental counter-bids on their behalf up to their stated Maximum Authorized Bid. Preferred increments must equal or exceed the lot minimum increment (₹500). Auto-bidding terminates immediately upon hitting the maximum ceiling or upon user deactivation.
                </p>
              </div>

              <div>
                <h4 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  3. Auction Conclusion & Hammer Price Settlement
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  The highest accepted bid recorded at the expiration of the lot countdown represents the final hammer price. The confirmed winning bidder is required to finalize payment within the designated settlement window and is granted immediate access to the private meeting room with the artisan workshop.
                </p>
              </div>

              <div>
                <h4 style={{ fontSize: '16px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  4. Seller Obligations & Shill Bidding Prohibition
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Sellers warrant that all listed objects are genuine, accurately represented, and free of encumbrances. Shill bidding — where a seller or associated party places bids on their own lots to artificially inflate the hammer price — is strictly prohibited and monitored by automated guard mechanisms.
                </p>
              </div>

              {/* Mandatory Legal Disclaimer */}
              <div
                style={{
                  padding: '16px 20px',
                  backgroundColor: 'rgba(212, 163, 115, 0.12)',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid rgba(212, 163, 115, 0.4)',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                  marginTop: '10px'
                }}
              >
                <AlertTriangle size={18} color="#8C5A24" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ fontSize: '12.5px', color: '#8C5A24', display: 'block', marginBottom: '4px' }}>
                    Demonstration & Development Legal Disclaimer
                  </strong>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                    This document and the Veyra platform are currently deployed for demonstration, testing, and portfolio validation purposes. All marketplace terms, escrow mechanisms, and privacy provisions herein should be formally reviewed, modified, and ratified by certified legal counsel prior to commercial production deployment.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-primary)'
          }}
        >
          <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            VEYRA Editorial Marketplace & Live Auction Platform
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{ height: '34px', padding: '0 18px', fontSize: '12.5px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
