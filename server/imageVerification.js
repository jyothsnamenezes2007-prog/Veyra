import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const VERIFICATION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Server-authoritative in-memory registry of verified image hashes
// Key: imageHash (sha256 hex), Value: { token, verified, timestamp, reason, confidence }
const verifiedImagesRegistry = new Map();

/**
 * Securely load .env.local if not already loaded into process.env
 */
function loadEnvFileIfNeeded() {
  if (process.env.GROQ_API_KEY) return;
  const rootEnvLocal = path.resolve(__dirname, '..', '.env.local');
  if (fs.existsSync(rootEnvLocal)) {
    if (typeof process.loadEnvFile === 'function') {
      try {
        process.loadEnvFile(rootEnvLocal);
      } catch (e) {}
    } else {
      try {
        const raw = fs.readFileSync(rootEnvLocal, 'utf8');
        for (const line of raw.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const k = trimmed.slice(0, eqIdx).trim();
            const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[k]) process.env[k] = v;
          }
        }
      } catch (e) {}
    }
  }
}

/**
 * Retrieve validated Groq vision API configuration from environment
 */
export function getGroqConfig() {
  loadEnvFileIfNeeded();
  const rawKey = (process.env.GROQ_API_KEY || '').trim();
  const isPlaceholderKey = !rawKey || rawKey === 'your_groq_api_key_here';

  // Base URL & Endpoint
  let baseUrl = (process.env.GROQ_API_BASE_URL || 'https://api.groq.com/openai/v1').trim();
  baseUrl = baseUrl.replace(/\/+$/, '');
  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;

  // Vision-capable model confirmed by Groq documentation:
  // qwen/qwen3.8-27b (or llama-3.2-11b-vision-preview / llama-3.2-90b-vision-preview)
  const modelEnv = (process.env.GROQ_VISION_MODEL || '').trim();
  const model = (!modelEnv || modelEnv === 'your_groq_vision_model_id') ? 'qwen/qwen3.8-27b' : modelEnv;

  return {
    apiKey: isPlaceholderKey ? null : rawKey,
    hasValidKey: !isPlaceholderKey,
    baseUrl,
    endpoint,
    model
  };
}

// Backward-compatible alias for any legacy callers
export const getQwenConfig = getGroqConfig;

/**
 * Extract buffer and MIME type from an image string (data URL or regular URL)
 */
export function parseImageInput(imageInput) {
  if (!imageInput || typeof imageInput !== 'string') {
    throw new Error('Image data must be a valid string.');
  }

  const trimmed = imageInput.trim();

  // Handle data URL: data:image/png;base64,....
  const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1].toLowerCase();
    const base64Data = dataUrlMatch[2];
    const buffer = Buffer.from(base64Data, 'base64');

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error(`Unsupported image format: ${mimeType}. Please upload PNG, JPG, or WEBP.`);
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new Error(`Image size (${Math.round(buffer.length / 1024)} KB) exceeds the 5MB limit.`);
    }

    return {
      type: 'data_url',
      mimeType,
      buffer,
      dataUrl: trimmed
    };
  }

  // Handle HTTP/HTTPS URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return {
      type: 'url',
      url: trimmed,
      buffer: Buffer.from(trimmed, 'utf8')
    };
  }

  throw new Error('Invalid image format. Expected a base64 data URL or HTTP/HTTPS image URL.');
}

/**
 * Compute authoritative SHA-256 hash of image content
 */
export function computeImageHash(imageInput) {
  const parsed = parseImageInput(imageInput);
  return crypto.createHash('sha256').update(parsed.buffer).digest('hex');
}

/**
 * Build prompt for Groq vision verification
 */
function buildVerificationPrompt(metadata = {}) {
  const { title, description, category } = metadata;
  let contextInfo = '';
  if (title || description || category) {
    contextInfo = `\nDeclared product details for cross-check:\n` +
      (title ? `- Title: ${title}\n` : '') +
      (category ? `- Category: ${category}\n` : '') +
      (description ? `- Description: ${description}\n` : '');
  }

  return `You are an expert product image verification engine for Veyra, an artisan and collectible marketplace.
Analyze the provided product photograph to evaluate whether it is suitable for a genuine product listing.${contextInfo}

Evaluate against these strict criteria:
1. Visual clarity & readability: The product must be clearly visible, in focus, not excessively dark, blurry, corrupted, or unreadable.
2. Genuine physical product depiction: Must depict a plausible physical item (such as furniture, decorative art, ceramics, textiles, jewelry, or collectibles) suitable for catalog listing, rather than pure noise, a blank image, an unrelated screenshot, or invalid content.
3. Manipulation & AI artifacts: Check for visible signs of digital tampering, heavy synthetic distortion, or bizarre AI structural anomalies.
4. Watermarks & theft indicators: Check for prominent watermarks, stock photo copyright marks, or stolen listing overlays.
5. Product consistency: Check whether the photograph reasonably depicts the declared item if product details are provided.

IMPORTANT:
- Normal studio background removal, clean lighting, and catalog staging are completely acceptable.
- Treat this as an AI visual assessment, NOT absolute proof of physical authenticity. Do not claim that the model can conclusively prove authenticity or identify every AI-generated image.

Respond STRICTLY with a valid JSON object in this format (no markdown fences, just JSON):
{
  "verified": true,
  "readable": true,
  "clearProduct": true,
  "suspiciousArtifacts": false,
  "watermarks": false,
  "confidence": "high",
  "reason": "Clear 1-2 sentence explanation of your assessment."
}`;
}

/**
 * Robustly extract JSON decision object from model completion text
 */
function extractJsonDecision(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') return null;

  let cleaned = rawContent.trim();
  // Strip markdown code fences if wrapped
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }

  // Attempt direct parse
  try {
    const direct = JSON.parse(cleaned);
    if (typeof direct === 'object' && direct !== null) return direct;
  } catch (e) {}

  // Attempt regex match for first valid {...} block
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const extracted = JSON.parse(jsonMatch[0]);
      if (typeof extracted === 'object' && extracted !== null) return extracted;
    } catch (e) {}
  }

  return null;
}

/**
 * Sanitize and validate decision structure from model output
 */
function sanitizeDecision(raw) {
  const verified = Boolean(raw.verified);
  return {
    verified,
    status: raw.status || (verified ? 'verified' : 'rejected'),
    readable: raw.readable !== false,
    clearProduct: raw.clearProduct !== false,
    suspiciousArtifacts: Boolean(raw.suspiciousArtifacts),
    watermarks: Boolean(raw.watermarks),
    confidence: raw.confidence || 'high',
    findings: Array.isArray(raw.findings) ? raw.findings : [],
    suspiciousSigns: Array.isArray(raw.suspiciousSigns) ? raw.suspiciousSigns : [],
    reason: raw.reason || raw.explanation || (verified ? 'Product image meets listing quality criteria.' : 'Image does not meet quality requirements.')
  };
}

/**
 * Call Groq hosted vision API using OpenAI-compatible chat completions endpoint
 */
async function callGroqVisionService(imageInput, metadata = {}) {
  const config = getGroqConfig();

  // If API key is missing or still set to placeholder, mark service unavailable safely
  if (!config.hasValidKey) {
    console.warn('[Groq-Vision] Groq API key is not configured or is placeholder. Image verification temporarily unavailable.');
    return {
      available: false,
      error: 'Groq API key is not configured.'
    };
  }

  const parsed = parseImageInput(imageInput);
  const imageUrl = parsed.dataUrl || parsed.url;

  const payload = {
    model: config.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildVerificationPrompt(metadata) },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }
    ],
    temperature: 0.1,
    max_tokens: 1024
  };

  try {
    const fetchFn = globalThis.__GROQ_MOCK_FETCHER__ || globalThis.__QWEN_MOCK_FETCHER__ || fetch;
    const res = await fetchFn(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000)
    });

    if (res.status === 401 || res.status === 403) {
      console.warn(`[Groq-Vision] Authentication failed with status ${res.status}. Verify GROQ_API_KEY.`);
      return {
        available: false,
        error: `Authentication failed (status ${res.status})`
      };
    }

    if (res.status === 429) {
      console.warn('[Groq-Vision] Groq API rate limit encountered (status 429).');
      return {
        available: false,
        error: 'Rate limit exceeded (status 429)'
      };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[Groq-Vision] Groq API returned error status ${res.status}: ${errText.slice(0, 150)}`);
      return {
        available: false,
        error: `Groq vision service returned status ${res.status}`
      };
    }

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      console.warn('[Groq-Vision] Failed to parse API response as JSON.');
      return {
        available: false,
        error: 'Non-JSON response from API'
      };
    }

    if (!data || typeof data !== 'object') {
      return {
        available: false,
        error: 'Invalid response payload from API'
      };
    }

    // Support mock decision shortcut if present
    if (data.decision && typeof data.decision.verified === 'boolean') {
      return {
        available: true,
        decision: sanitizeDecision(data.decision)
      };
    }

    const rawContent = data.choices?.[0]?.message?.content;
    const parsedJson = extractJsonDecision(rawContent);

    if (!parsedJson || typeof parsedJson.verified !== 'boolean') {
      console.warn('[Groq-Vision] Could not parse decision JSON from model completion text.');
      return {
        available: false,
        error: 'Unparseable decision JSON from vision model'
      };
    }

    return {
      available: true,
      decision: sanitizeDecision(parsedJson)
    };
  } catch (err) {
    console.warn(`[Groq-Vision] Error contacting Groq vision API at ${config.endpoint}:`, err.message);
    return {
      available: false,
      error: err.message
    };
  }
}

/**
 * Authoritatively verify an uploaded product image
 */
export async function verifyProductImage(imageInput, metadata = {}) {
  let parsed;
  let imageHash;

  try {
    parsed = parseImageInput(imageInput);
    imageHash = crypto.createHash('sha256').update(parsed.buffer).digest('hex');
  } catch (validationErr) {
    return {
      success: false,
      verified: false,
      error: validationErr.message,
      unavailable: false
    };
  }

  // Check if this exact image has already been verified and is unexpired
  const existing = verifiedImagesRegistry.get(imageHash);
  if (existing && existing.verified && (Date.now() - existing.timestamp) < VERIFICATION_TTL_MS) {
    return {
      success: true,
      verified: true,
      token: existing.token,
      imageHash,
      message: 'Image Verified — You can proceed.',
      reason: existing.reason,
      confidence: existing.confidence
    };
  }

  // Invoke Groq vision API
  const serviceResult = await callGroqVisionService(imageInput, metadata);

  if (!serviceResult.available) {
    // Inference service is down, timed out, missing API key, or returned an error
    return {
      success: false,
      verified: false,
      unavailable: true,
      error: 'Verification is temporarily unavailable. Please try again.'
    };
  }

  const decision = serviceResult.decision;

  if (decision.verified) {
    // Generate authoritative single-use verification token bound to this image hash
    const token = 'vtok-' + crypto.randomBytes(16).toString('hex') + '-' + Date.now().toString(36);
    
    verifiedImagesRegistry.set(imageHash, {
      token,
      verified: true,
      timestamp: Date.now(),
      reason: decision.reason,
      confidence: decision.confidence
    });

    return {
      success: true,
      verified: true,
      token,
      imageHash,
      message: 'Image Verified — You can proceed.',
      reason: decision.reason,
      confidence: decision.confidence
    };
  } else {
    // Image failed criteria
    return {
      success: true,
      verified: false,
      unavailable: false,
      error: 'Image verification failed. Please upload a clearer, genuine product photo.',
      reason: decision.reason,
      details: {
        readable: decision.readable,
        clearProduct: decision.clearProduct,
        suspiciousArtifacts: decision.suspiciousArtifacts,
        watermarks: decision.watermarks
      }
    };
  }
}

/**
 * Server-authoritative check whether an image is authorized for listing submission
 */
export function isImageAuthorized(imageInput, token) {
  if (!imageInput) return false;

  try {
    const imageHash = computeImageHash(imageInput);
    const record = verifiedImagesRegistry.get(imageHash);

    if (!record || !record.verified) {
      return false;
    }

    // Check expiration
    if (Date.now() - record.timestamp > VERIFICATION_TTL_MS) {
      verifiedImagesRegistry.delete(imageHash);
      return false;
    }

    // Validate token if supplied
    if (token && record.token !== token) {
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Invalidate a verified image (e.g. when replaced or removed)
 */
export function invalidateImageVerification(imageInput) {
  try {
    const imageHash = computeImageHash(imageInput);
    return verifiedImagesRegistry.delete(imageHash);
  } catch (e) {
    return false;
  }
}

/**
 * Clear registry (used for test teardown)
 */
export function clearVerificationRegistry() {
  verifiedImagesRegistry.clear();
}
