import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useToast } from './ToastContext';

const AuthContext = createContext(null);
const DEMO_USER_STORAGE_KEY = 'veyra_active_user';
const USERS_STORAGE_KEY = 'veyra_users_db';
const RESET_TOKENS_STORAGE_KEY = 'veyra_password_reset_tokens';

// Helper to access persistent registered users database
const getRegisteredUsers = () => {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('Failed to parse registered users db:', err);
    return {};
  }
};

const saveRegisteredUsers = (usersMap) => {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(usersMap));
  } catch (err) {
    console.warn('Failed to save registered users db:', err);
  }
};

// Helper for local password reset tokens
const getResetTokens = () => {
  try {
    const raw = localStorage.getItem(RESET_TOKENS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('Failed to parse reset tokens:', err);
    return {};
  }
};

const saveResetTokens = (tokensMap) => {
  try {
    localStorage.setItem(RESET_TOKENS_STORAGE_KEY, JSON.stringify(tokensMap));
  } catch (err) {
    console.warn('Failed to save reset tokens:', err);
  }
};

export const AuthProvider = ({ children }) => {
  const { addToast } = useToast();
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  // Helper to extract a friendly user object from Supabase user or session
  const mapSupabaseUser = (supabaseUser) => {
    if (!supabaseUser) return null;
    const metadata = supabaseUser.user_metadata || {};
    const normEmail = supabaseUser.email ? supabaseUser.email.toLowerCase().trim() : '';

    // Check saved full name from Supabase metadata or local database
    const usersDb = getRegisteredUsers();
    const localRecord = normEmail ? usersDb[normEmail] : null;

    const savedFullName = (
      metadata.full_name ||
      metadata.name ||
      localRecord?.name ||
      ''
    ).trim();

    // Do NOT derive user name from email prefix! Provide safe fallback
    const formattedName = savedFullName || 'Complete your profile';

    return {
      id: supabaseUser.id,
      email: supabaseUser.email,
      name: formattedName,
      username: metadata.username || localRecord?.username || null,
      phone: metadata.phone || supabaseUser.phone || localRecord?.phone || null,
      role: metadata.role || localRecord?.role || 'collector',
      studio: metadata.studio || localRecord?.studio || null,
      isSupabase: true,
      isProfileIncomplete: !savedFullName
    };
  };

  // Restore session and subscribe to auth changes
  useEffect(() => {
    let mounted = true;

    if (isSupabaseConfigured && supabase) {
      // 1. Fetch current active session from Supabase
      supabase.auth.getSession().then(({ data: { session: initialSession }, error }) => {
        if (!mounted) return;
        if (error) {
          console.warn('Supabase getSession warning:', error.message);
        }
        if (initialSession) {
          setSession(initialSession);
          setUser(mapSupabaseUser(initialSession.user));
        } else {
          // If no Supabase session, check if there was a local active user
          const savedDemo = localStorage.getItem(DEMO_USER_STORAGE_KEY);
          if (savedDemo) {
            try {
              const parsed = JSON.parse(savedDemo);
              if (parsed?.email) {
                const usersDb = getRegisteredUsers();
                const record = usersDb[parsed.email.toLowerCase().trim()];
                if (record?.name) {
                  parsed.name = record.name;
                  parsed.isProfileIncomplete = false;
                }
              }
              setUser(parsed);
            } catch (e) {
              setUser(null);
            }
          }
        }
        setLoading(false);
      });

      // 2. Listen to live Supabase auth state changes (login, logout, token refresh, password recovery)
      const {
        data: { subscription }
      } = supabase.auth.onAuthStateChange((event, currentSession) => {
        if (!mounted) return;
        setSession(currentSession);
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        }
        if (currentSession?.user) {
          setUser(mapSupabaseUser(currentSession.user));
          localStorage.removeItem(DEMO_USER_STORAGE_KEY);
        } else {
          setUser(null);
        }
        setLoading(false);
      });

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    } else {
      // Supabase credentials pending: restore session from persistent local database / storage
      try {
        const savedDemo = localStorage.getItem(DEMO_USER_STORAGE_KEY);
        if (savedDemo) {
          const parsed = JSON.parse(savedDemo);
          if (parsed && parsed.email) {
            const usersDb = getRegisteredUsers();
            const normEmail = parsed.email.toLowerCase().trim();
            const record = usersDb[normEmail];

            if (record && record.name) {
              // Exact saved name from persistent users db
              parsed.name = record.name;
              parsed.isProfileIncomplete = false;
            } else if (!record) {
              // Check if initial user's name was auto-derived from email prefix
              const emailPrefix = normEmail.split('@')[0];
              const wasAutoDerived = parsed.name && (
                parsed.name.toLowerCase() === emailPrefix.toLowerCase() ||
                parsed.name.toLowerCase() === (emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)).toLowerCase()
              );
              const nameToSave = wasAutoDerived ? '' : (parsed.name || '');

              usersDb[normEmail] = {
                id: parsed.id || 'usr_' + Date.now(),
                name: nameToSave,
                email: normEmail,
                username: parsed.username || null,
                phone: parsed.phone || null,
                role: parsed.role || 'collector',
                studio: parsed.studio || null
              };
              saveRegisteredUsers(usersDb);

              parsed.name = nameToSave || 'Complete your profile';
              parsed.isProfileIncomplete = !nameToSave;
            } else {
              parsed.name = 'Complete your profile';
              parsed.isProfileIncomplete = true;
            }

            setUser(parsed);
          } else {
            setUser(parsed);
          }
        }
      } catch (e) {
        setUser(null);
      }
      setLoading(false);
    }
  }, []);

  // Save active session if not using Supabase
  useEffect(() => {
    if (!isSupabaseConfigured) {
      if (user && !user.isSupabase) {
        localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(user));
      } else if (!user) {
        localStorage.removeItem(DEMO_USER_STORAGE_KEY);
      }
    }
  }, [user]);

  // Sign in with Email and Password
  const signIn = async (email, password) => {
    if (!email || !password) {
      return { success: false, error: 'Please enter both email and password.' };
    }

    const cleanEmail = email.trim();
    const normalizedEmail = cleanEmail.toLowerCase();

    if (isSupabaseConfigured && supabase) {
      setLoading(true);
      let authResponse = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });

      // If lower-case attempt failed with invalid credentials and original email had mixed case,
      // retry with the original cleanEmail
      if (
        authResponse.error &&
        cleanEmail !== normalizedEmail &&
        authResponse.error.message?.toLowerCase().includes('invalid login credentials')
      ) {
        const retryResponse = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        });
        if (!retryResponse.error) {
          authResponse = retryResponse;
        }
      }

      setLoading(false);

      if (authResponse.error) {
        const msg = authResponse.error.message || '';
        const isNetworkError =
          authResponse.error.status === 0 ||
          msg.toLowerCase().includes('fetch failed') ||
          msg.toLowerCase().includes('network');

        if (isNetworkError) {
          return {
            success: false,
            error: 'Network connection error. Please check your internet connection and try again.'
          };
        }

        const isUnconfirmed =
          authResponse.error.code === 'email_not_confirmed' ||
          msg.toLowerCase().includes('email not confirmed');

        if (isUnconfirmed) {
          return {
            success: false,
            isUnconfirmed: true,
            email: cleanEmail,
            error: 'Your email address has not been confirmed yet. Please verify your email before signing in.'
          };
        }

        if (msg.toLowerCase().includes('invalid login credentials')) {
          return {
            success: false,
            error: 'Invalid email or password. Please verify your credentials and try again.'
          };
        }

        return { success: false, error: msg || 'Authentication failed. Please verify your credentials.' };
      }

      const { data } = authResponse;
      const appUser = mapSupabaseUser(data.user);
      setUser(appUser);
      setSession(data.session);
      addToast(
        appUser.name && !appUser.isProfileIncomplete
          ? `Welcome back, ${appUser.name}.`
          : 'Welcome back.'
      );
      return { success: true };
    }

    // Local persistent user database sign-in
    const usersDb = getRegisteredUsers();
    const existingUser = usersDb[normalizedEmail];

    if (existingUser) {
      if (existingUser.password && existingUser.password !== password) {
        return { success: false, error: 'Incorrect password. Please verify your credentials.' };
      }

      const savedFullName = (existingUser.name || '').trim();
      const resolvedName = savedFullName || 'Complete your profile';

      const authenticatedUser = {
        id: existingUser.id || 'usr_' + Date.now(),
        name: resolvedName,
        email: existingUser.email,
        username: existingUser.username || null,
        phone: existingUser.phone || null,
        role: existingUser.role || 'collector',
        studio: existingUser.studio || null,
        isSupabase: false,
        isProfileIncomplete: !savedFullName
      };

      setUser(authenticatedUser);
      localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(authenticatedUser));
      addToast(
        savedFullName
          ? `Welcome back, ${savedFullName}.`
          : 'Signed in. Please complete your profile.'
      );
      return { success: true };
    }

    // Account not yet in database: create with empty name and prompt profile completion
    // Do NOT derive name from email address!
    const newDemoUser = {
      id: 'usr_' + Date.now(),
      name: '',
      email: normalizedEmail,
      password: password,
      username: null,
      phone: null,
      role: 'collector',
      studio: null,
      isSupabase: false,
      createdAt: new Date().toISOString()
    };
    usersDb[normalizedEmail] = newDemoUser;
    saveRegisteredUsers(usersDb);

    const authenticatedUser = {
      id: newDemoUser.id,
      name: 'Complete your profile',
      email: normalizedEmail,
      username: null,
      phone: null,
      role: 'collector',
      studio: null,
      isSupabase: false,
      isProfileIncomplete: true
    };
    setUser(authenticatedUser);
    localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(authenticatedUser));
    addToast('Signed in. Please complete your profile to set your full name.');
    return { success: true };
  };

  // Sign up with Name, Email, Password, and Role
  const signUp = async ({ name, email, password, role }) => {
    if (!name || !email || !password) {
      return { success: false, error: 'Please complete all required fields.' };
    }

    if (password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters long.' };
    }

    const trimmedName = name.trim();
    const cleanEmail = email.trim();
    const normalizedEmail = cleanEmail.toLowerCase();
    const newUserId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    // Save full name directly into persistent user database
    const usersDb = getRegisteredUsers();
    usersDb[normalizedEmail] = {
      id: newUserId,
      name: trimmedName,
      email: normalizedEmail,
      password: password,
      username: null,
      phone: null,
      role: role || 'collector',
      studio: null,
      isSupabase: Boolean(isSupabaseConfigured && supabase),
      createdAt: new Date().toISOString()
    };
    saveRegisteredUsers(usersDb);

    if (isSupabaseConfigured && supabase) {
      setLoading(true);
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/signin?confirmed=true`,
          data: {
            full_name: trimmedName,
            name: trimmedName,
            phone: null,
            role: role || 'collector'
          }
        }
      });
      setLoading(false);

      if (error) {
        if (error.status === 429 || error.message?.toLowerCase().includes('rate limit')) {
          return {
            success: false,
            error: 'Email rate limit reached. Please wait a few minutes before trying again.'
          };
        }
        return { success: false, error: error.message };
      }

      // Check if user already exists (Supabase enumeration protection returns empty identities array)
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return {
          success: false,
          error: 'An account with this email address already exists. Please sign in instead.'
        };
      }

      if (data.user?.id) {
        usersDb[normalizedEmail].id = data.user.id;
        saveRegisteredUsers(usersDb);
      }

      // Check if email confirmation is required by Supabase project settings
      if (data.user && !data.session) {
        addToast(`Confirmation link sent to ${normalizedEmail}. Please check your inbox.`);
        return {
          success: true,
          needsEmailConfirmation: true,
          email: cleanEmail,
          message: 'Please check your email to confirm your account.'
        };
      }

      const appUser = mapSupabaseUser(data.user);
      appUser.name = trimmedName;
      appUser.isProfileIncomplete = false;
      setUser(appUser);
      setSession(data.session);
      localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(appUser));
      addToast(`Account created. Welcome to VEYRA, ${trimmedName}.`);
      return { success: true };
    }

    // Local user database mode
    const appUser = {
      id: newUserId,
      name: trimmedName,
      email: normalizedEmail,
      username: null,
      phone: null,
      role: role || 'collector',
      studio: null,
      isSupabase: false,
      isProfileIncomplete: false
    };

    setUser(appUser);
    localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(appUser));
    addToast(`Account created. Welcome to VEYRA, ${trimmedName}.`);
    return { success: true };
  };

  // Google OAuth Client-side initiation
  const signInWithGoogle = async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${window.location.origin}/`
          }
        });
        if (error) {
          return { success: false, error: error.message };
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message || 'Google sign-in error.' };
      }
    }

    addToast(
      'Google OAuth requires VITE_SUPABASE_URL, API key in .env.local, and Google credentials in Supabase Dashboard.'
    );
    return {
      success: false,
      error: 'Supabase credentials pending in .env.local.'
    };
  };

  // Update profile details
  const updateProfile = async (updates) => {
    const updated = {
      ...user,
      ...updates
    };

    if (updates.name && updates.name.trim() && updates.name !== 'Complete your profile') {
      updated.isProfileIncomplete = false;
      updated.name = updates.name.trim();
    }

    setUser(updated);
    localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(updated));

    // Persist changes to registered users database
    if (updated.email) {
      const usersDb = getRegisteredUsers();
      const normEmail = updated.email.toLowerCase().trim();
      if (usersDb[normEmail]) {
        usersDb[normEmail] = {
          ...usersDb[normEmail],
          ...updates,
          name: updated.name,
          username: updates.username !== undefined ? updates.username : usersDb[normEmail].username,
          phone: updates.phone !== undefined ? updates.phone : usersDb[normEmail].phone,
          studio: updates.studio !== undefined ? updates.studio : usersDb[normEmail].studio
        };
        saveRegisteredUsers(usersDb);
      }
    }

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.updateUser({
          data: {
            full_name: updates.name || user?.name,
            name: updates.name || user?.name,
            username: updates.username !== undefined ? updates.username : user?.username,
            phone: updates.phone !== undefined ? updates.phone : user?.phone,
            studio: updates.studio !== undefined ? updates.studio : user?.studio
          }
        });
      } catch (err) {
        console.warn('Error saving profile to Supabase:', err);
      }
    }

    addToast('Account details updated successfully.');
    return { success: true };
  };

  // Sign out
  const signOut = async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.warn('Supabase signOut error:', error);
          addToast(error.message || 'Failed to sign out from authentication service.', 'error');
          return { success: false, error: error.message };
        }
      } catch (e) {
        console.warn('Supabase signOut error:', e);
        addToast(e.message || 'Failed to sign out.', 'error');
        return { success: false, error: e.message };
      }
    }
    setUser(null);
    setSession(null);
    localStorage.removeItem(DEMO_USER_STORAGE_KEY);
    addToast('Signed out successfully.');
    return { success: true };
  };

  // Request password reset email
  const sendPasswordResetEmail = async (email) => {
    if (!email || !email.trim()) {
      return { success: false, error: 'Please enter your registered email address.' };
    }
    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const redirectTo = `${window.location.origin}/reset-password`;
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo
        });
        if (error) {
          console.warn('Supabase resetPasswordForEmail error:', error);
          return { success: false, error: error.message };
        }
        return {
          success: true,
          message:
            'If an account exists with this email address, password reset instructions have been sent. Please check your inbox and spam folder.'
        };
      } catch (err) {
        return { success: false, error: err.message || 'Failed to send password reset email.' };
      }
    }

    // Local / offline database token flow
    const token = 'rst_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    const expiresAt = Date.now() + 1000 * 60 * 60; // 1 hour expiry

    const tokens = getResetTokens();
    tokens[token] = {
      email: normalizedEmail,
      expiresAt,
      used: false,
      createdAt: new Date().toISOString()
    };
    saveResetTokens(tokens);

    const resetLink = `${window.location.origin}/reset-password?token=${token}`;
    return {
      success: true,
      message:
        'If an account exists with this email address, password reset instructions have been sent. Please check your inbox and spam folder.',
      resetLink
    };
  };

  // Verify reset token validity (for local token flow)
  const verifyResetToken = (token) => {
    if (!token) return { valid: false, error: 'Missing or invalid password reset token.' };
    const tokens = getResetTokens();
    const record = tokens[token];
    if (!record) {
      return { valid: false, error: 'Invalid or unrecognized password reset token.' };
    }
    if (record.used) {
      return { valid: false, error: 'This password reset link has already been used.' };
    }
    if (Date.now() > record.expiresAt) {
      return { valid: false, error: 'This password reset link has expired. Please request a new one.' };
    }
    return { valid: true, email: record.email };
  };

  // Reset / update password
  const resetPassword = async (newPassword, token) => {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'Password must contain at least 6 characters.' };
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.auth.updateUser({
          password: newPassword
        });
        if (error) {
          return { success: false, error: error.message };
        }
        setIsPasswordRecovery(false);
        addToast('Your password has been successfully reset.');
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message || 'Failed to update password.' };
      }
    }

    // Local flow
    let targetEmail = '';
    if (token) {
      const tokenVerification = verifyResetToken(token);
      if (!tokenVerification.valid) {
        return { success: false, error: tokenVerification.error };
      }
      targetEmail = tokenVerification.email;

      const tokens = getResetTokens();
      if (tokens[token]) {
        tokens[token].used = true;
        saveResetTokens(tokens);
      }
    } else if (user?.email) {
      targetEmail = user.email;
    } else {
      return { success: false, error: 'No active reset session or token provided.' };
    }

    if (targetEmail) {
      const usersDb = getRegisteredUsers();
      const normEmail = targetEmail.toLowerCase().trim();
      if (usersDb[normEmail]) {
        usersDb[normEmail].password = newPassword;
        saveRegisteredUsers(usersDb);
      }
    }

    addToast('Your password has been successfully reset.');
    return { success: true };
  };

  // Resend confirmation email for unconfirmed accounts
  const resendConfirmationEmail = async (email) => {
    if (!email || !email.trim()) {
      return { success: false, error: 'Please enter your email address.' };
    }
    const cleanEmail = email.trim().toLowerCase();
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: cleanEmail,
          options: {
            emailRedirectTo: `${window.location.origin}/signin?confirmed=true`
          }
        });
        if (error) {
          if (error.status === 429 || error.message?.toLowerCase().includes('rate limit')) {
            return {
              success: false,
              error: 'Verification email rate limit reached. Please check your spam folder or wait a few minutes before requesting another.'
            };
          }
          return { success: false, error: error.message };
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message || 'Failed to resend confirmation email.' };
      }
    }
    return { success: false, error: 'Authentication service not configured.' };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isPasswordRecovery,
        signIn,
        signUp,
        signInWithGoogle,
        resendConfirmationEmail,
        sendPasswordResetEmail,
        verifyResetToken,
        resetPassword,
        updateProfile,
        signOut,
        isAuthenticated: !!user,
        isSupabaseConfigured
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

