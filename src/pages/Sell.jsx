import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useProducts } from '../context/ProductsContext';
import { useAuctions } from '../context/AuctionContext';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../data/products';
import {
  Upload,
  CheckCircle2,
  ArrowRight,
  Eye,
  Camera,
  Trash2,
  Gavel,
  ShoppingBag,
  Store,
  Clock,
  Calendar,
  AlertCircle,
  Plus,
  ShieldCheck,
  Loader2,
  Lock,
  Tag,
  MapPin,
  Sparkles
} from 'lucide-react';

const MAX_IMAGES = 6;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// Curated image presets for easy high-resolution demonstrations
const CURATED_IMAGE_PRESETS = [
  {
    label: 'Studio Teak & Cane Chair',
    url: 'https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=1000&q=80'
  },
  {
    label: 'Carved Basalt Basin',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1000&q=80'
  },
  {
    label: 'Silver Ewer & Basin',
    url: 'https://images.unsplash.com/photo-1534349762230-e0cadf78f5da?auto=format&fit=crop&w=1000&q=80'
  },
  {
    label: 'Soapstone Vessel',
    url: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=1000&q=80'
  }
];

export const Sell = () => {
  const navigate = useNavigate();
  const { addProduct } = useProducts();
  const { createAuctionLot } = useAuctions();
  const { user } = useAuth();

  const fileInputRef = useRef(null);

  // Authoritative seller name from authenticated user profile
  const defaultSellerName = useMemo(() => {
    if (!user) return 'Studio Atelier';
    if (user.studio && user.studio.trim()) return user.studio.trim();
    if (user.name && user.name !== 'Complete your profile') return user.name.trim();
    return 'Studio Atelier';
  }, [user]);

  // Default start date (tomorrow) and start time (18:00)
  const defaultStartDate = useMemo(() => {
    const d = new Date(Date.now() + 86400000);
    return d.toISOString().split('T')[0];
  }, []);
  const defaultStartTime = '18:00';

  // Default end date (4 days from now) and end time (21:00)
  const defaultEndDate = useMemo(() => {
    const d = new Date(Date.now() + 4 * 86400000);
    return d.toISOString().split('T')[0];
  }, []);
  const defaultEndTime = '21:00';

  // Two distinct selling options: 'shop' (Sell as a Shop Product) vs 'auction' (Sell through Live Auction)
  const [sellingOption, setSellingOption] = useState('shop');

  // Form fields state
  const [formData, setFormData] = useState({
    name: 'Archival Chandigarh Teak & Cane Lounge Chair',
    seller: defaultSellerName,
    location: 'Chandigarh, India',
    category: 'Handmade',
    price: 45000,          // Price in INR (or Estimated Lot Value)
    startingBid: 28000,    // Starting Bid in INR (Live Auction only)
    minIncrement: 1000,    // Minimum bid increment in INR
    reservePrice: '',      // Optional reserve price in INR
    startDate: defaultStartDate,
    startTime: defaultStartTime,
    endDate: defaultEndDate,
    endTime: defaultEndTime,
    description: 'Original solid Burma teak framework with renewed hand-woven natural cane seating. Features documented stenciled archival inventory markings on the rear apron.',
    materials: 'Aged reclaimed Burma teak, natural hand-woven cane',
    dimensions: '78cm H × 51cm W × 54cm D',
    provenance: 'Certified masterwork from Chandigarh architectural restoration',
    authenticityCertificate: 'Certificate of Provenance & Studio Hallmark',
    condition: 'Pristine Museum Restored'
  });

  // Images state (up to 6 images)
  const [images, setImages] = useState([
    'https://images.unsplash.com/photo-1580481077195-c3a821a58875?auto=format&fit=crop&w=1000&q=80',
    'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=1000&q=80'
  ]);

  const [customImageUrl, setCustomImageUrl] = useState('');
  const [imageError, setImageError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedData, setSubmittedData] = useState(null);
  const submissionTokenRef = useRef('sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
  const successRef = useRef(null);

  useEffect(() => {
    if (submittedData && successRef.current) {
      successRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [submittedData]);

  // Keep seller updated if user profile loads asynchronously
  useEffect(() => {
    if (user && formData.seller === 'Studio Atelier') {
      setFormData((prev) => ({ ...prev, seller: defaultSellerName }));
    }
  }, [user, defaultSellerName]);

  // Handle generic form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formError) setFormError('');
  };

  // Schedule timestamps and validation summary
  const scheduleSummary = useMemo(() => {
    if (sellingOption !== 'auction') return null;
    if (!formData.startDate || !formData.startTime || !formData.endDate || !formData.endTime) {
      return null;
    }

    const startDateTime = new Date(`${formData.startDate}T${formData.startTime}`);
    const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);

    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) return null;

    const startTimestamp = startDateTime.getTime();
    const endTimestamp = endDateTime.getTime();
    const isStartInPast = startTimestamp <= Date.now();
    const isEndBeforeStart = endTimestamp <= startTimestamp;
    const durationHours = Math.round((endTimestamp - startTimestamp) / 3600000);

    const formatDateString = (d) =>
      d.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });

    const formatTimeString = (d) =>
      d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

    return {
      startDateTime,
      endDateTime,
      startTimestamp,
      endTimestamp,
      isStartInPast,
      isEndBeforeStart,
      durationHours,
      startFormatted: `${formatDateString(startDateTime)} • ${formatTimeString(startDateTime)} IST`,
      endFormatted: `${formatDateString(endDateTime)} • ${formatTimeString(endDateTime)} IST`
    };
  }, [sellingOption, formData.startDate, formData.startTime, formData.endDate, formData.endTime]);

  // Handle file uploads with type & size validation
  const handleFileSelect = (e) => {
    setImageError('');
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (images.length + files.length > MAX_IMAGES) {
      setImageError(`You can attach up to ${MAX_IMAGES} photos per object listing.`);
      return;
    }

    files.forEach((file) => {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setImageError(`Unsupported image format (${file.name}). Please upload PNG, JPG, or WEBP.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setImageError(`Image "${file.name}" exceeds the 5MB size limit.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const dataUrl = loadEvent.target?.result;
        if (dataUrl) {
          setImages((prev) => (prev.length < MAX_IMAGES ? [...prev, dataUrl] : prev));
        }
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Add image by URL
  const handleAddUrlImage = () => {
    setImageError('');
    const trimmed = customImageUrl.trim();
    if (!trimmed) return;

    if (images.length >= MAX_IMAGES) {
      setImageError(`You can attach up to ${MAX_IMAGES} photos per object listing.`);
      return;
    }

    setImages((prev) => [...prev, trimmed]);
    setCustomImageUrl('');
  };

  // Remove individual image
  const handleRemoveImage = (indexToRemove) => {
    setImages((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setImageError('');
  };

  // Main Form Submission Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError('');

    // 1. Authentication check
    if (!user) {
      setFormError('You must be signed in with an artisan account to publish listings on Veyra.');
      navigate('/signin?redirect=/sell');
      return;
    }

    // 2. Specifications validation
    if (!formData.name.trim()) {
      setFormError('Please provide an authoritative product title.');
      return;
    }
    if (!formData.seller.trim()) {
      setFormError('Please specify the seller or studio name.');
      return;
    }
    if (!formData.price || Number(formData.price) <= 0) {
      setFormError(
        sellingOption === 'auction'
          ? 'Please enter a valid estimated lot valuation in INR.'
          : 'Please enter a valid marketplace selling price in INR.'
      );
      return;
    }
    if (!images.length) {
      setFormError('Please upload at least one photograph for the listing preview.');
      return;
    }
    if (!formData.description.trim()) {
      setFormError('Please provide a description of the craftsmanship story and narrative.');
      return;
    }

    const priceNum = Number(formData.price);

    // 3. Auction specific validation
    let startTimestamp = null;
    let endTimestamp = null;
    let startingBidNum = null;
    let minIncrementNum = null;
    let reservePriceNum = null;

    if (sellingOption === 'auction') {
      startingBidNum = Number(formData.startingBid);
      if (isNaN(startingBidNum) || startingBidNum <= 0) {
        setFormError('Starting bid must be a valid positive amount in INR.');
        return;
      }
      if (startingBidNum > priceNum) {
        setFormError('Starting bid cannot exceed the estimated lot valuation.');
        return;
      }

      if (!formData.startDate || !formData.startTime) {
        setFormError('Please provide an auction start date and time.');
        return;
      }
      if (!formData.endDate || !formData.endTime) {
        setFormError('Please provide an auction end date and time.');
        return;
      }

      const startDateTime = new Date(`${formData.startDate}T${formData.startTime}`);
      const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);

      if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
        setFormError('Invalid date or time specified. Please verify the schedule.');
        return;
      }

      startTimestamp = startDateTime.getTime();
      endTimestamp = endDateTime.getTime();

      if (startTimestamp <= Date.now()) {
        setFormError('Auction start date and time must be scheduled in the future.');
        return;
      }

      if (endTimestamp <= startTimestamp) {
        setFormError('Auction end date and time must be strictly after the start date and time.');
        return;
      }

      minIncrementNum = formData.minIncrement ? Number(formData.minIncrement) : 500;
      if (isNaN(minIncrementNum) || minIncrementNum <= 0) {
        setFormError('Minimum bid increment must be a positive number.');
        return;
      }

      if (formData.reservePrice && String(formData.reservePrice).trim()) {
        reservePriceNum = Number(formData.reservePrice);
        if (isNaN(reservePriceNum) || reservePriceNum < startingBidNum) {
          setFormError('Reserve price cannot be less than the starting bid.');
          return;
        }
      }
    }

    setIsSubmitting(true);

    try {
      if (sellingOption === 'shop') {
        // Normal Shop Product
        const productPayload = {
          clientSubmissionId: submissionTokenRef.current,
          name: formData.name.trim(),
          seller: formData.seller.trim(),
          sellerId: user.id,
          location: formData.location.trim() || 'Studio Atelier',
          category: formData.category,
          price: priceNum,
          type: 'shop',
          isAuction: false,
          images: images,
          image: images[0],
          description: formData.description.trim(),
          materials: formData.materials.trim(),
          dimensions: formData.dimensions.trim(),
          condition: formData.condition || 'Studio Mint Original',
          listingStatus: 'pending'
        };

        const createdProduct = await addProduct(productPayload);
        submissionTokenRef.current = 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        setSubmittedData({
          product: createdProduct,
          auction: null,
          sellingOption: 'shop'
        });
      } else {
        // Live Auction Lot
        const auctionPayload = {
          clientSubmissionId: submissionTokenRef.current,
          name: formData.name.trim(),
          seller: formData.seller.trim(),
          maker: formData.seller.trim(),
          sellerId: user.id,
          location: formData.location.trim() || 'Studio Atelier',
          category: formData.category,
          type: 'auction',
          isAuction: true,
          startingBid: startingBidNum,
          estimatedValue: priceNum,
          minIncrement: minIncrementNum,
          reservePrice: reservePriceNum,
          startDate: formData.startDate,
          startTime: formData.startTime,
          endDate: formData.endDate,
          endTime: formData.endTime,
          startTimestamp: startTimestamp,
          endTimestamp: endTimestamp,
          images: images,
          image: images[0],
          description: formData.description.trim(),
          dimensions: formData.dimensions.trim(),
          materials: formData.materials.trim(),
          provenance: formData.provenance.trim(),
          authenticityCertificate: formData.authenticityCertificate || 'Certificate of Provenance & Studio Hallmark',
          condition: formData.condition || 'Pristine Museum Restored',
          approvalStatus: 'pending',
          status: 'pending'
        };

        const outcome = await createAuctionLot(auctionPayload);
        if (!outcome.success) {
          throw new Error(outcome.error || 'Failed to register auction lot with scheduler.');
        }

        submissionTokenRef.current = 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        setSubmittedData({
          product: outcome.auction,
          auction: outcome.auction,
          sellingOption: 'auction'
        });
      }
    } catch (err) {
      console.error('Submission error:', err);
      setFormError(err.message || 'An error occurred while saving your listing. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setSubmittedData(null);
    setFormError('');
    setImageError('');
    submissionTokenRef.current = 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    setFormData((prev) => ({
      ...prev,
      name: '',
      price: '',
      startingBid: '',
      reservePrice: '',
      description: ''
    }));
    setImages([]);
  };

  return (
    <div style={{ paddingTop: '36px', paddingBottom: '96px', backgroundColor: 'var(--bg-primary)' }}>
      <div className="container" style={{ maxWidth: '1240px' }}>

        {/* Page Header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span className="eyebrow" style={{ letterSpacing: '0.12em' }}>
              ATELIER SELLER PORTAL
            </span>
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(2.2rem, 3.8vw, 3rem)',
              lineHeight: 1.15,
              fontWeight: 500,
              color: 'var(--text-primary)',
              margin: '0 0 10px 0'
            }}
          >
            Create Product Listing
          </h1>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', maxWidth: '680px', margin: 0, lineHeight: 1.55 }}>
            Choose whether to sell directly in the Veyra marketplace or schedule a live catalog auction session with real-time bidding.
          </p>
        </div>

        {/* Authentication Notice if Guest */}
        {!user && (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1.5px solid var(--accent-burgundy)',
              borderRadius: 'var(--radius-xs)',
              padding: '20px 24px',
              marginBottom: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--surface-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-burgundy)',
                  flexShrink: 0
                }}
              >
                <Lock size={20} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>Artisan Account Required</h4>
                <p style={{ margin: '3px 0 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  You are currently browsing as a guest. Please sign in or register to publish items and schedule live auctions.
                </p>
              </div>
            </div>
            <Link to="/signin?redirect=/sell" className="btn btn-burgundy btn-sm">
              <span>Sign In to Atelier</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {/* Selling Flow Selector: 2 Distinct Options */}
        <div style={{ marginBottom: '32px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
            Select Selling Method *
          </label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px'
            }}
          >
            {/* Option 1: Shop Product */}
            <div
              onClick={() => setSellingOption('shop')}
              style={{
                backgroundColor: '#FFFFFF',
                border: sellingOption === 'shop' ? '2px solid var(--accent-burgundy)' : '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                padding: '20px 24px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: sellingOption === 'shop' ? 'rgba(120, 59, 75, 0.12)' : 'var(--surface-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: sellingOption === 'shop' ? 'var(--accent-burgundy)' : 'var(--text-secondary)'
                  }}
                >
                  <ShoppingBag size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Sell as a Shop Product
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Normal marketplace listing
                  </span>
                </div>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Fixed-price object published to the regular shopping catalog. Collectors can add to bag and checkout immediately upon approval.
              </p>
            </div>

            {/* Option 2: Live Auction */}
            <div
              onClick={() => setSellingOption('auction')}
              style={{
                backgroundColor: '#FFFFFF',
                border: sellingOption === 'auction' ? '2px solid var(--accent-burgundy)' : '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                padding: '20px 24px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                position: 'relative'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: sellingOption === 'auction' ? 'rgba(120, 59, 75, 0.12)' : 'var(--surface-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: sellingOption === 'auction' ? 'var(--accent-burgundy)' : 'var(--text-secondary)'
                  }}
                >
                  <Gavel size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Sell through Live Auction
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--accent-burgundy)', fontWeight: 600 }}>
                    Scheduled catalogue session
                  </span>
                </div>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Scheduled lot with starting bid and reserve. Appears in Upcoming Lots upon approval; bidding opens automatically at start time.
              </p>
            </div>
          </div>
        </div>

        {/* Main Two-Column Layout */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, 0.85fr)',
            gap: '36px',
            alignItems: 'flex-start'
          }}
          className="sell-page-grid"
        >

          {/* LEFT COLUMN: Listing Form */}
          <form
            onSubmit={handleSubmit}
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-xs)',
              padding: 'clamp(24px, 3.5vw, 36px)',
              boxShadow: '0 1px 4px rgba(0, 0, 0, 0.02)'
            }}
          >

            {/* SECTION A: Object Specifications */}
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '24px', marginBottom: '28px' }}>
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.45rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                  {sellingOption === 'auction' ? 'Auction Lot Details' : 'Product Specifications'}
                </h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Enter authentic information describing the object and its craftsmanship.
                </p>
              </div>

              {/* Product Title */}
              <div className="form-group">
                <label className="form-label" htmlFor="name">
                  Product Title *
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  className="form-input"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Archival Chandigarh Teak & Cane V-Leg Chair"
                  required
                />
              </div>

              {/* 2 Columns: Seller / Studio Name & Studio Location */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="seller">
                    Seller / Studio Name *
                  </label>
                  <input
                    id="seller"
                    name="seller"
                    type="text"
                    className="form-input"
                    value={formData.seller}
                    onChange={handleInputChange}
                    placeholder="e.g. Studio Pierre Jeanneret"
                    required
                  />
                  <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    Populated from your authenticated artisan profile
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="location">
                    Studio Location
                  </label>
                  <input
                    id="location"
                    name="location"
                    type="text"
                    className="form-input"
                    value={formData.location}
                    onChange={handleInputChange}
                    placeholder="e.g. Chandigarh, India"
                  />
                </div>
              </div>

              {/* 2 Columns: Category & Price */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="category">
                    Category *
                  </label>
                  <select
                    id="category"
                    name="category"
                    className="form-select"
                    value={formData.category}
                    onChange={handleInputChange}
                  >
                    <option value="Handmade">Handmade</option>
                    <option value="Vintage Finds">Vintage Finds</option>
                    <option value="Collectibles">Collectibles</option>
                    <option value="Home & Living">Home & Living</option>
                    <option value="Art & Prints">Art & Prints</option>
                    <option value="Fashion & Accessories">Fashion & Accessories</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="price">
                    {sellingOption === 'auction' ? 'Estimated Lot Valuation (₹) *' : 'Marketplace Selling Price (₹) *'}
                  </label>
                  <input
                    id="price"
                    name="price"
                    type="number"
                    min="100"
                    step="100"
                    className="form-input"
                    value={formData.price}
                    onChange={handleInputChange}
                    placeholder="e.g. 45000"
                    required
                  />
                  <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    {sellingOption === 'auction'
                      ? 'Authoritative catalogue appraisal benchmark'
                      : 'Direct acquisition price paid by buyers'}
                  </span>
                </div>
              </div>
            </div>

            {/* SECTION B: Auction-Specific Configuration (Active when Live Auction selected) */}
            {sellingOption === 'auction' && (
              <div
                style={{
                  backgroundColor: 'rgba(120, 59, 75, 0.02)',
                  border: '1px solid rgba(120, 59, 75, 0.25)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '22px',
                  marginBottom: '28px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Gavel size={18} color="var(--accent-burgundy)" />
                  <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'var(--accent-burgundy)' }}>
                    Auction Schedule & Bidding Parameters
                  </h3>
                </div>

                {/* Starting Bid & Bid Increment */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" htmlFor="startingBid">
                      Starting Bid Price (₹) *
                    </label>
                    <input
                      id="startingBid"
                      name="startingBid"
                      type="number"
                      min="100"
                      step="500"
                      className="form-input"
                      value={formData.startingBid}
                      onChange={handleInputChange}
                      placeholder="e.g. 28000"
                      required={sellingOption === 'auction'}
                    />
                    <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                      Opening bid amount required to open lot
                    </span>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" htmlFor="minIncrement">
                      Minimum Bid Increment (₹) *
                    </label>
                    <input
                      id="minIncrement"
                      name="minIncrement"
                      type="number"
                      min="100"
                      step="100"
                      className="form-input"
                      value={formData.minIncrement}
                      onChange={handleInputChange}
                      placeholder="e.g. 1000"
                      required={sellingOption === 'auction'}
                    />
                    <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                      Minimum raise amount above current bid
                    </span>
                  </div>
                </div>

                {/* Reserve Price (Optional) */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label" htmlFor="reservePrice">
                    Reserve Price (₹) — <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>Optional</span>
                  </label>
                  <input
                    id="reservePrice"
                    name="reservePrice"
                    type="number"
                    min="100"
                    step="500"
                    className="form-input"
                    value={formData.reservePrice}
                    onChange={handleInputChange}
                    placeholder="e.g. 35000 (leave blank for no reserve)"
                  />
                  <span style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    Confidential minimum price. If highest bid is below reserve, seller is not obligated to conclude.
                  </span>
                </div>

                {/* Start Date & Time */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" htmlFor="startDate">
                      Auction Start Date *
                    </label>
                    <input
                      id="startDate"
                      name="startDate"
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
                      className="form-input"
                      value={formData.startDate}
                      onChange={handleInputChange}
                      required={sellingOption === 'auction'}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" htmlFor="startTime">
                      Auction Start Time *
                    </label>
                    <input
                      id="startTime"
                      name="startTime"
                      type="time"
                      className="form-input"
                      value={formData.startTime}
                      onChange={handleInputChange}
                      required={sellingOption === 'auction'}
                    />
                  </div>
                </div>

                {/* End Date & Time */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" htmlFor="endDate">
                      Auction End Date *
                    </label>
                    <input
                      id="endDate"
                      name="endDate"
                      type="date"
                      min={formData.startDate || new Date().toISOString().split('T')[0]}
                      className="form-input"
                      value={formData.endDate}
                      onChange={handleInputChange}
                      required={sellingOption === 'auction'}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" htmlFor="endTime">
                      Auction End Time *
                    </label>
                    <input
                      id="endTime"
                      name="endTime"
                      type="time"
                      className="form-input"
                      value={formData.endTime}
                      onChange={handleInputChange}
                      required={sellingOption === 'auction'}
                    />
                  </div>
                </div>

                {/* Schedule Summary Banner */}
                {scheduleSummary && (
                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: scheduleSummary.isStartInPast || scheduleSummary.isEndBeforeStart ? '1px solid var(--error-color)' : '1px dashed var(--accent-burgundy)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '12px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, color: 'var(--accent-burgundy)' }}>
                        Verified Server Schedule
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {scheduleSummary.durationHours > 0 ? `${scheduleSummary.durationHours} Hours Duration` : 'Invalid Duration'}
                      </span>
                    </div>

                    <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '2px' }}>
                      <strong>Start:</strong> {scheduleSummary.startFormatted}
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-primary)' }}>
                      <strong>End:</strong> {scheduleSummary.endFormatted}
                    </div>

                    {scheduleSummary.isStartInPast && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--error-color)', fontSize: '11.5px', marginTop: '4px' }}>
                        <AlertCircle size={13} />
                        <span>Start time must be scheduled in the future.</span>
                      </div>
                    )}

                    {scheduleSummary.isEndBeforeStart && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--error-color)', fontSize: '11.5px', marginTop: '4px' }}>
                        <AlertCircle size={13} />
                        <span>End time must be after the start time.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SECTION C: Product Photography (Up to 6 images) */}
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '24px', marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.45rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                  Product Photography
                </h2>
                <span style={{ fontSize: '12px', fontWeight: 600, color: images.length >= MAX_IMAGES ? 'var(--accent-burgundy)' : 'var(--text-secondary)' }}>
                  {images.length} / {MAX_IMAGES} Photos Selected
                </span>
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
                Upload up to 6 high-resolution photographs. The first photo will be presented as the main catalog image.
              </p>

              {/* Selected Images Thumbnail Strip */}
              {images.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  {images.map((imgUrl, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        width: '74px',
                        height: '74px',
                        borderRadius: 'var(--radius-xs)',
                        overflow: 'hidden',
                        border: idx === 0 ? '2px solid var(--accent-burgundy)' : '1px solid var(--border-color)',
                        backgroundColor: 'var(--surface-secondary)'
                      }}
                    >
                      <img src={imgUrl} alt={`Lot photo ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />

                      {idx === 0 && (
                        <span
                          style={{
                            position: 'absolute',
                            bottom: '0',
                            left: '0',
                            right: '0',
                            backgroundColor: 'rgba(120, 59, 75, 0.9)',
                            color: '#FFFFFF',
                            fontSize: '9px',
                            fontWeight: 700,
                            textAlign: 'center',
                            padding: '1px 0',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em'
                          }}
                        >
                          Cover
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        style={{
                          position: 'absolute',
                          top: '3px',
                          right: '3px',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(0, 0, 0, 0.65)',
                          color: '#FFFFFF',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Image Upload Area */}
              {images.length < MAX_IMAGES && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '1.5px dashed var(--border-color)',
                    borderRadius: 'var(--radius-xs)',
                    padding: '24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    backgroundColor: 'var(--bg-primary)',
                    marginBottom: '16px',
                    transition: 'border-color 150ms ease'
                  }}
                  className="upload-dropzone"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />
                  <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                    <Upload size={18} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block' }}>
                    Click to browse and upload photographs
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                    PNG, JPG, or WEBP up to 5MB each
                  </span>
                </div>
              )}

              {/* Add by URL */}
              {images.length < MAX_IMAGES && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  <input
                    type="url"
                    className="form-input"
                    value={customImageUrl}
                    onChange={(e) => setCustomImageUrl(e.target.value)}
                    placeholder="Or paste high-resolution image URL..."
                    style={{ flex: 1, fontSize: '12px' }}
                  />
                  <button
                    type="button"
                    onClick={handleAddUrlImage}
                    className="btn btn-secondary btn-sm"
                    disabled={!customImageUrl.trim()}
                  >
                    <Plus size={13} />
                    <span>Add URL</span>
                  </button>
                </div>
              )}

              {/* Curated Presets */}
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Quick demonstration presets:
                </span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {CURATED_IMAGE_PRESETS.map((preset, pIdx) => (
                    <button
                      key={pIdx}
                      type="button"
                      onClick={() => {
                        if (images.length < MAX_IMAGES && !images.includes(preset.url)) {
                          setImages((prev) => [...prev, preset.url]);
                        }
                      }}
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: 'var(--radius-xs)',
                        border: '1px solid var(--border-color)',
                        backgroundColor: '#FFFFFF',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      + {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {imageError && (
                <div style={{ marginTop: '10px', color: 'var(--error-color)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={14} />
                  <span>{imageError}</span>
                </div>
              )}
            </div>

            {/* SECTION D: Provenance, Story & Physical Specifications */}
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '24px', marginBottom: '28px' }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.45rem', fontWeight: 600, margin: '0 0 16px 0', color: 'var(--text-primary)' }}>
                Story, Provenance & Physical Specifications
              </h2>

              {/* Description */}
              <div className="form-group">
                <label className="form-label" htmlFor="description">
                  Craftsmanship Story & Editorial Narrative *
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={4}
                  className="form-textarea"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Describe the materials, studio technique, restoration work, and cultural history of this piece..."
                  required
                />
              </div>

              {/* Condition & Materials */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="condition">
                    Condition State
                  </label>
                  <input
                    id="condition"
                    name="condition"
                    type="text"
                    className="form-input"
                    value={formData.condition}
                    onChange={handleInputChange}
                    placeholder="e.g. Pristine Museum Restored"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="materials">
                    Materials Used
                  </label>
                  <input
                    id="materials"
                    name="materials"
                    type="text"
                    className="form-input"
                    value={formData.materials}
                    onChange={handleInputChange}
                    placeholder="e.g. Reclaimed teak, hand-woven cane"
                  />
                </div>
              </div>

              {/* Dimensions & Provenance */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="dimensions">
                    Dimensions
                  </label>
                  <input
                    id="dimensions"
                    name="dimensions"
                    type="text"
                    className="form-input"
                    value={formData.dimensions}
                    onChange={handleInputChange}
                    placeholder="e.g. 78cm H × 51cm W × 54cm D"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="provenance">
                    Archival Provenance
                  </label>
                  <input
                    id="provenance"
                    name="provenance"
                    type="text"
                    className="form-input"
                    value={formData.provenance}
                    onChange={handleInputChange}
                    placeholder="e.g. Documented restoration from Chandigarh archives"
                  />
                </div>
              </div>

              {/* Authenticity Certificate */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="authenticityCertificate">
                  Authenticity Certification Hallmark
                </label>
                <input
                  id="authenticityCertificate"
                  name="authenticityCertificate"
                  type="text"
                  className="form-input"
                  value={formData.authenticityCertificate}
                  onChange={handleInputChange}
                  placeholder="e.g. Certificate of Provenance & Studio Hallmark"
                />
              </div>
            </div>

            {/* Error Message */}
            {formError && (
              <div
                style={{
                  backgroundColor: 'rgba(158, 58, 58, 0.08)',
                  border: '1px solid var(--error-color)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '12px 16px',
                  marginBottom: '24px',
                  color: 'var(--error-color)',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{formError}</span>
              </div>
            )}

            {/* Submit Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <ShieldCheck size={14} color="var(--accent-burgundy)" />
                <span>Submitted with status <strong>Pending Approval</strong></span>
              </div>

              <button
                type="submit"
                className="btn btn-burgundy"
                disabled={isSubmitting}
                style={{ minWidth: '220px', height: '46px', fontWeight: 600 }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Publishing Listing...</span>
                  </>
                ) : (
                  <>
                    {sellingOption === 'auction' ? <Gavel size={16} /> : <ShoppingBag size={16} />}
                    <span>
                      {sellingOption === 'auction' ? 'Submit Live Auction Lot' : 'Submit Shop Product'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Success Confirmation Card (rendered below the form upon successful backend persistence) */}
          {submittedData && (
            <div
              ref={successRef}
              style={{
                backgroundColor: '#FFFFFF',
                border: '1.5px solid var(--accent-burgundy)',
                borderRadius: 'var(--radius-xs)',
                padding: '28px 32px',
                marginTop: '28px',
                boxShadow: '0 4px 16px rgba(120, 59, 75, 0.08)'
              }}
            >
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <CheckCircle2 size={28} color="var(--success-color)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-serif)', margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
                    {submittedData.sellingOption === 'auction'
                      ? 'Live Auction Lot Submitted for Approval!'
                      : 'Shop Product Submitted for Approval!'}
                  </h3>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 18px 0' }}>
                    <strong>"{submittedData.product.name}"</strong> has been successfully registered with persistent type{' '}
                    <code style={{ backgroundColor: 'var(--surface-secondary)', padding: '2px 6px', borderRadius: '3px', fontWeight: 600 }}>
                      {submittedData.sellingOption}
                    </code>{' '}
                    and queued for curator review with status{' '}
                    <span style={{ fontWeight: 600, color: 'var(--accent-burgundy)' }}>Pending Approval</span>.{' '}
                    {submittedData.sellingOption === 'auction'
                      ? 'Once approved, it will be published to the upcoming auction schedule and automatically transition to live at the scheduled start time.'
                      : 'Once approved, it will be published immediately to the marketplace catalog for purchase.'}
                  </p>

                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Link to="/my-products" className="btn btn-burgundy" style={{ height: '40px', padding: '0 20px', fontSize: '12.5px' }}>
                      <Store size={15} />
                      <span>View in Seller Dashboard</span>
                    </Link>
                    <button
                      type="button"
                      onClick={handleResetForm}
                      className="btn btn-secondary"
                      style={{ height: '40px', padding: '0 20px', fontSize: '12.5px' }}
                    >
                      <span>Submit Another Item</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* RIGHT COLUMN: Live Visual Preview Card */}
          <div style={{ position: 'sticky', top: '100px' }}>
            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="eyebrow" style={{ margin: 0 }}>Catalog Live Preview</span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {sellingOption === 'auction' ? 'Upcoming Auction Lot' : 'Marketplace Shop Item'}
              </span>
            </div>

            <div
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-xs)',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
              }}
            >
              {/* Image Preview */}
              <div style={{ width: '100%', aspectRatio: '4/3', backgroundColor: 'var(--surface-secondary)', position: 'relative' }}>
                {images.length > 0 ? (
                  <img
                    src={images[0]}
                    alt="Preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                    <Camera size={32} style={{ opacity: 0.3 }} />
                  </div>
                )}

                {/* Badge Overlay */}
                <div style={{ position: 'absolute', top: '12px', left: '12px' }}>
                  {sellingOption === 'auction' ? (
                    <span
                      style={{
                        backgroundColor: 'rgba(25, 25, 25, 0.85)',
                        color: '#FFFFFF',
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 'var(--radius-xs)',
                        letterSpacing: '0.06em',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Clock size={11} />
                      UPCOMING LOT
                    </span>
                  ) : (
                    <span
                      style={{
                        backgroundColor: 'var(--accent-burgundy)',
                        color: '#FFFFFF',
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 'var(--radius-xs)',
                        letterSpacing: '0.06em'
                      }}
                    >
                      MARKETPLACE
                    </span>
                  )}
                </div>

                {images.length > 1 && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '10px',
                      right: '10px',
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      color: '#FFFFFF',
                      fontSize: '10px',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-xs)'
                    }}
                  >
                    1 of {images.length}
                  </div>
                )}
              </div>

              {/* Information Body */}
              <div style={{ padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {formData.category}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {formData.location}
                  </span>
                </div>

                <h3
                  style={{
                    fontFamily: 'var(--font-serif)',
                    fontSize: '1.25rem',
                    margin: '0 0 6px 0',
                    lineHeight: 1.3,
                    color: 'var(--text-primary)'
                  }}
                >
                  {formData.name || 'Untitled Piece'}
                </h3>

                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
                  By {formData.seller || 'Studio Atelier'}
                </p>

                {/* Price Display */}
                <div
                  style={{
                    borderTop: '1px solid var(--border-color)',
                    borderBottom: '1px solid var(--border-color)',
                    padding: '12px 0',
                    marginBottom: '16px'
                  }}
                >
                  {sellingOption === 'auction' ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Opening Bid</span>
                        <strong style={{ fontSize: '1.3rem', color: 'var(--accent-burgundy)' }}>
                          {formatINR(formData.startingBid || 0)}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '4px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Valuation Benchmark</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {formatINR(formData.price || 0)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Direct Price</span>
                      <strong style={{ fontSize: '1.3rem', color: 'var(--text-primary)' }}>
                        {formatINR(formData.price || 0)}
                      </strong>
                    </div>
                  )}
                </div>

                {/* Schedule details if auction */}
                {sellingOption === 'auction' && scheduleSummary && (
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                      <Calendar size={12} color="var(--accent-burgundy)" />
                      <span>{scheduleSummary.startFormatted}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={12} color="var(--accent-burgundy)" />
                      <span>Duration: {scheduleSummary.durationHours} hours</span>
                    </div>
                  </div>
                )}

                {/* Mock action */}
                <div
                  style={{
                    backgroundColor: 'var(--surface-secondary)',
                    borderRadius: 'var(--radius-xs)',
                    padding: '10px',
                    textAlign: 'center',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)'
                  }}
                >
                  {sellingOption === 'auction'
                    ? 'Registration will open upon curator approval'
                    : 'Available for purchase upon curator approval'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
