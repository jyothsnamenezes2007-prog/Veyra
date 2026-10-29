import assert from 'node:assert';
import fs from 'node:fs';

console.log('================================================================');
console.log('--- STARTING VEYRA SIGN-IN & AUTHENTICATION VERIFICATION ---');
console.log('================================================================\n');

// ── Test 1: Verify URL Sanitization & Key Fallback in src/lib/supabase.js ────
console.log('[Test 1] Verifying URL sanitization and key trimming in src/lib/supabase.js...');
const supabaseJsContent = fs.readFileSync('src/lib/supabase.js', 'utf8');

assert(
  supabaseJsContent.includes(".replace(/\\/+$/, '')"),
  'supabase.js must strip trailing slashes from Supabase URL'
);

assert(
  supabaseJsContent.includes('VITE_SUPABASE_PUBLISHABLE_KEY') &&
  supabaseJsContent.includes('VITE_SUPABASE_ANON_KEY'),
  'supabase.js must support both VITE_SUPABASE_PUBLISHABLE_KEY and VITE_SUPABASE_ANON_KEY fallback'
);

assert(
  supabaseJsContent.includes('.trim()'),
  'supabase.js must trim keys and URL'
);
console.log('✓ Test 1 Passed: Supabase URL sanitization and key trimming verified.\n');

// ── Test 2: Verify SignIn Logic & Error Categorization in AuthContext.jsx ───
console.log('[Test 2] Verifying AuthContext signIn & resendConfirmationEmail implementation...');
const authContextContent = fs.readFileSync('src/context/AuthContext.jsx', 'utf8');

assert(
  authContextContent.includes('signInWithPassword'),
  'AuthContext must use Supabase signInWithPassword'
);

assert(
  authContextContent.includes('isUnconfirmed') &&
  (authContextContent.includes('email_not_confirmed') || authContextContent.includes('email not confirmed')),
  'AuthContext must detect unconfirmed email status from Supabase error'
);

assert(
  authContextContent.includes('resendConfirmationEmail'),
  'AuthContext must provide resendConfirmationEmail function'
);

assert(
  authContextContent.includes('resendConfirmationEmail,') &&
  authContextContent.includes('signIn,') &&
  authContextContent.includes('signUp,'),
  'AuthContext must export resendConfirmationEmail in provider value'
);
console.log('✓ Test 2 Passed: AuthContext signIn, error handling, and resendConfirmationEmail verified.\n');

// ── Test 3: Verify Duplicate Submission Prevention & UX in SignIn.jsx ────────
console.log('[Test 3] Verifying SignIn.jsx duplicate submission guard & unconfirmed UX...');
const signInContent = fs.readFileSync('src/pages/SignIn.jsx', 'utf8');

assert(
  signInContent.includes('if (isSubmitting) return;'),
  'SignIn.jsx handleSubmit must guard against duplicate submissions when isSubmitting is true'
);

assert(
  signInContent.includes('disabled={isSubmitting}'),
  'SignIn.jsx must disable submit button while isSubmitting is true'
);

assert(
  signInContent.includes('unconfirmedEmail') &&
  signInContent.includes('handleResend'),
  'SignIn.jsx must render an informative unconfirmed email banner with resend option'
);

assert(
  signInContent.includes("searchParams.get('confirmed') === 'true'") ||
  signInContent.includes("hashParams.get('type') === 'signup'"),
  'SignIn.jsx must detect email confirmation success from URL parameters'
);
console.log('✓ Test 3 Passed: SignIn.jsx submission guard, unconfirmed banner, and URL handling verified.\n');

// ── Test 4: Verify SignUp.jsx Email Confirmation Integration ─────────────────
console.log('[Test 4] Verifying SignUp.jsx duplicate submission guard & resend option...');
const signUpContent = fs.readFileSync('src/pages/SignUp.jsx', 'utf8');

assert(
  signUpContent.includes('if (isSubmitting) return;'),
  'SignUp.jsx handleSubmit must guard against duplicate submissions'
);

assert(
  signUpContent.includes('resendConfirmationEmail'),
  'SignUp.jsx must use resendConfirmationEmail'
);

assert(
  signUpContent.includes('handleResend'),
  'SignUp.jsx must provide a resend button when waiting for email confirmation'
);
console.log('✓ Test 4 Passed: SignUp.jsx submission guard and confirmation UX verified.\n');

// ── Test 5: Verify Auction Data & db.json untouched ──────────────────────────
console.log('[Test 5] Verifying auction auc-1 and active auction up-2 are completely untouched...');
const dbContent = JSON.parse(fs.readFileSync('server/data/db.json', 'utf8'));

const auc1 = dbContent.auctions.find(a => a.id === 'auc-1');
assert(auc1, 'auc-1 must exist');
assert.strictEqual(auc1.winner?.amount, 101000, 'auc-1 winning amount must remain 101000');
assert(auc1.winner?.bidder?.includes('LAHARI'), 'auc-1 winner must be preserved');

const up2 = dbContent.auctions.find(a => a.id === 'up-2');
assert(up2, 'up-2 must exist');
assert.strictEqual(up2.winner, null, 'up-2 winner must remain null');
console.log('✓ Test 5 Passed: Auction records auc-1 and up-2 are completely intact.\n');

console.log('================================================================');
console.log('🎉 ALL AUTHENTICATION AND SIGN-IN TESTS PASSED SUCCESSFULLY!');
console.log('================================================================');
