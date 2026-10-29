import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ArrowRight, Check, Eye, EyeOff, ArrowLeft } from 'lucide-react';

export const SignUp = () => {
  const { signUp, signInWithGoogle, resendConfirmationEmail } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const redirectPath = new URLSearchParams(location.search).get('redirect') || '/';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'collector'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError('');
    setSuccessMessage('');
    setResendStatus('');

    if (!formData.name || !formData.email || !formData.password) {
      setError('Please complete all required fields.');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    const res = await signUp(formData);
    setIsSubmitting(false);

    if (res.success) {
      if (res.needsEmailConfirmation) {
        setSuccessMessage(
          'Registration initiated! Please check your email inbox to confirm your account before signing in.'
        );
      } else {
        navigate(redirectPath);
      }
    } else {
      setError(res.error || 'Registration failed.');
    }
  };

  const handleResend = async () => {
    const cleanEmail = formData.email.trim();
    if (!cleanEmail) return;

    setIsResending(true);
    setResendStatus('');

    const res = await resendConfirmationEmail(cleanEmail);
    setIsResending(false);

    if (res.success) {
      setResendStatus(`Verification email resent to ${cleanEmail}.`);
    } else {
      setResendStatus(res.error || 'Failed to resend confirmation email.');
    }
  };

  const handleGoogleClick = async () => {
    setError('');
    const res = await signInWithGoogle();
    if (!res.success && res.error) {
      setError(res.error);
    }
  };

  return (
    <div style={{ paddingTop: '48px', paddingBottom: '96px', backgroundColor: 'var(--bg-primary)' }}>
      <div className="container" style={{ maxWidth: '480px' }}>
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
            Join the Community
          </span>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '8px' }}>Create your account</h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
            Discover independent ateliers, bid on curated lots, or present your craft.
          </p>
        </div>

        {/* Success Confirmation (Email verification) */}
        {successMessage ? (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid var(--border-color)',
              padding: '32px',
              borderRadius: 'var(--radius-xs)',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'var(--badge-shipping-bg)',
                color: 'var(--success-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}
            >
              <Check size={24} />
            </div>
            <h3 style={{ fontSize: '1.35rem', marginBottom: '8px' }}>Check Your Email</h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
              {successMessage}
            </p>

            <div style={{ marginBottom: '24px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              {resendStatus ? (
                <p style={{ color: 'var(--accent-burgundy)', fontWeight: 500, margin: 0 }}>
                  {resendStatus}
                </p>
              ) : (
                <p style={{ margin: 0 }}>
                  Didn't receive the email?{' '}
                  <button
                    type="button"
                    disabled={isResending}
                    onClick={handleResend}
                    style={{
                      color: 'var(--accent-burgundy)',
                      textDecoration: 'underline',
                      fontWeight: 600,
                      cursor: isResending ? 'not-allowed' : 'pointer',
                      padding: 0,
                      background: 'none',
                      border: 'none',
                      fontSize: 'inherit'
                    }}
                  >
                    {isResending ? 'Sending...' : 'Click to resend'}
                  </button>
                </p>
              )}
            </div>

            <Link to={`/signin${location.search}`} className="btn btn-primary" style={{ width: '100%' }}>
              Proceed to Sign In
            </Link>
          </div>
        ) : (
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
              <label className="form-label" htmlFor="name">
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                className="form-input"
                value={formData.name}
                onChange={handleChange}
                placeholder="Enter your full name"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="email">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className="form-input"
                value={formData.email}
                onChange={handleChange}
                placeholder="name@example.com"
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '24px' }}>
              <label className="form-label" htmlFor="password">
                Password (minimum 6 characters)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  style={{ paddingRight: '40px' }}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Create secure password"
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
              <span>{isSubmitting ? 'Creating Account...' : 'Create Account'}</span>
              <ArrowRight size={15} />
            </button>

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
              <span>Sign up with Google</span>
            </button>

            {/* Sign In Link (inside card) */}
            <p
              style={{
                textAlign: 'center',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
                marginTop: '24px',
                marginBottom: 0
              }}
            >
              Already have an account?{' '}
              <Link
                to={`/signin${location.search}`}
                style={{
                  color: 'var(--accent-burgundy)',
                  textDecoration: 'underline',
                  fontWeight: 600
                }}
              >
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
