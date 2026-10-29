import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ArrowRight, Eye, EyeOff, ArrowLeft, Check, Mail } from 'lucide-react';

export const SignIn = () => {
  const { user, signIn, signInWithGoogle, resendConfirmationEmail } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect destination after successful login
  const redirectPath = new URLSearchParams(location.search).get('redirect') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [unconfirmedEmail, setUnconfirmedEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  const [confirmationNotice, setConfirmationNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If user is already authenticated, redirect
  useEffect(() => {
    if (user) {
      navigate(redirectPath, { replace: true });
    }
  }, [user, navigate, redirectPath]);

  // Inspect URL parameters and hash fragment for confirmation status or auth errors
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hash);

    if (searchParams.get('confirmed') === 'true' || hashParams.get('type') === 'signup') {
      setConfirmationNotice('Your email has been successfully confirmed. You can now sign in.');
    }

    const errorDesc =
      hashParams.get('error_description') ||
      searchParams.get('error_description') ||
      hashParams.get('error');

    if (errorDesc) {
      const decoded = decodeURIComponent(errorDesc).replace(/\+/g, ' ');
      if (decoded.toLowerCase().includes('expired') || decoded.toLowerCase().includes('invalid')) {
        setError('The confirmation link is invalid or has expired. You can request a new verification email below.');
      } else {
        setError(decoded);
      }
    }
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError('');
    setResendSuccess('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Please provide both your email and password.');
      return;
    }

    setIsSubmitting(true);
    const res = await signIn(cleanEmail, password);
    setIsSubmitting(false);

    if (res.success) {
      navigate(redirectPath);
    } else {
      setError(res.error || 'Authentication failed. Please verify your credentials.');
      if (res.isUnconfirmed) {
        setUnconfirmedEmail(res.email || cleanEmail);
      } else {
        setUnconfirmedEmail('');
      }
    }
  };

  const handleResend = async () => {
    const emailToSend = (unconfirmedEmail || email).trim();
    if (!emailToSend) {
      setError('Please provide your email address to resend verification.');
      return;
    }

    setIsResending(true);
    setResendSuccess('');
    setError('');

    const res = await resendConfirmationEmail(emailToSend);
    setIsResending(false);

    if (res.success) {
      setResendSuccess(`A new confirmation email has been dispatched to ${emailToSend}. Please check your inbox and spam folder.`);
    } else {
      setError(res.error || 'Failed to resend confirmation email. Please try again.');
    }
  };

  const handleGoogleClick = async () => {
    setError('');
    setUnconfirmedEmail('');
    const res = await signInWithGoogle();
    if (!res.success && res.error) {
      setError(res.error);
    }
  };

  return (
    <div style={{ paddingTop: '48px', paddingBottom: '96px', backgroundColor: 'var(--bg-primary)' }}>
      <div className="container" style={{ maxWidth: '440px' }}>
        {/* Return Home Link */}
        <div style={{ marginBottom: '24px' }}>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)'
            }}
          >
            <ArrowLeft size={14} />
            <span>Return to VEYRA Home</span>
          </Link>
        </div>

        {/* Card Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <Link
            to="/"
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '2rem',
              letterSpacing: '0.22em',
              fontWeight: 600,
              display: 'block',
              marginBottom: '6px'
            }}
          >
            VEYRA
          </Link>
          <span className="eyebrow" style={{ marginBottom: '6px' }}>
            Collector & Maker Portal
          </span>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '8px' }}>Sign in to your account</h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Access private acquisitions, live auction watchlist, and curated bids.
          </p>
        </div>

        {/* Confirmation Status Banner */}
        {confirmationNotice && (
          <div
            style={{
              backgroundColor: 'var(--badge-shipping-bg, #edf7ee)',
              border: '1px solid #b8d9c2',
              color: 'var(--badge-shipping-text, #276738)',
              borderRadius: 'var(--radius-xs)',
              padding: '12px 16px',
              marginBottom: '20px',
              fontSize: 'var(--text-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              lineHeight: 1.45
            }}
          >
            <Check size={16} style={{ flexShrink: 0 }} />
            <span>{confirmationNotice}</span>
          </div>
        )}

        {/* Unconfirmed Account Alert Banner */}
        {unconfirmedEmail && (
          <div
            style={{
              backgroundColor: '#faf8f5',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-xs)',
              padding: '16px',
              marginBottom: '20px',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <Mail size={18} color="var(--accent-burgundy)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginBottom: '4px', fontWeight: 600 }}>
                  Email Verification Required
                </h4>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.45 }}>
                  A confirmation link was sent to <strong>{unconfirmedEmail}</strong>. Please check your inbox (and spam folder) to activate your account before signing in.
                </p>
                {resendSuccess ? (
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--success-color, #276738)', fontWeight: 500, margin: 0 }}>
                    {resendSuccess}
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={isResending}
                    onClick={handleResend}
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--accent-burgundy)',
                      textDecoration: 'underline',
                      fontWeight: 600,
                      cursor: isResending ? 'not-allowed' : 'pointer',
                      padding: 0,
                      background: 'none',
                      border: 'none',
                      display: 'inline-block'
                    }}
                  >
                    {isResending ? 'Sending confirmation email...' : 'Resend confirmation email'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sign In Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-color)',
            padding: 'clamp(20px, 6vw, 32px)',
            borderRadius: 'var(--radius-xs)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.02)'
          }}
        >
          <div className="form-group">
            <label className="form-label" htmlFor="email-input">
              Email Address
            </label>
            <input
              id="email-input"
              name="email"
              type="email"
              autoComplete="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" htmlFor="password-input">
                Password
              </label>
              <Link
                to="/forgot-password"
                style={{ fontSize: '11px', color: 'var(--text-secondary)', textDecoration: 'underline' }}
              >
                Forgot password?
              </Link>
            </div>

            <div style={{ position: 'relative' }}>
              <input
                id="password-input"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="form-input"
                style={{ paddingRight: '40px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '12px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="form-error" style={{ marginBottom: '16px' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary"
            style={{ width: '100%', height: '46px', letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            <span>{isSubmitting ? 'Signing In...' : 'Sign In'}</span>
            <ArrowRight size={15} />
          </button>

          {/* OR Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              margin: '20px 0',
              fontSize: '11px',
              color: 'var(--text-secondary)'
            }}
          >
            <span style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
            <span>OR</span>
            <span style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-color)' }} />
          </div>

          {/* Google OAuth Option */}
          <button
            type="button"
            onClick={handleGoogleClick}
            className="btn btn-secondary"
            style={{
              width: '100%',
              height: '42px',
              fontSize: 'var(--text-xs)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.99 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          {/* Sign Up Link (inside card) */}
          <p
            style={{
              textAlign: 'center',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              marginTop: '24px',
              marginBottom: 0
            }}
          >
            Don't have an account yet?{' '}
            <Link
              to={`/signup${location.search}`}
              style={{
                color: 'var(--accent-burgundy)',
                textDecoration: 'underline',
                fontWeight: 600
              }}
            >
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};
