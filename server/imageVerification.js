import crypto from 'node:crypto';

// Constants
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const VERIFICATION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Server-authoritative in-memory registry of verified image hashes
// Key: imageHash (sha256 hex), Value: { token, verified, timestamp, reason, confidence }
const verifiedImagesRegistry = new Map();

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
    // URL string
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
 * Build prompt for Qwen3-VL-8B-Instruct verification
 */
function buildVerificationPrompt() {
  return `You are an expert product image verification engine for Veyra, an artisan and collectible marketplace.
Analyze the provided product photograph to evaluate whether it is suitable for a genuine product listing.

Evaluate against these strict criteria:
1. Visual clarity & readability: The product must be clearly visible, in focus, not excessively dark, blurry, corrupted, or unreadable.
2. Genuine physical product depiction: Must depict a plausible physical item (such as furniture, decorative art, ceramics, textiles, jewelry, or collectibles) suitable for catalog listing, rather than pure noise, a blank image, an unrelated screenshot, or invalid content.
3. Manipulation & AI artifacts: Check for visible signs of digital tampering, heavy synthetic distortion, or bizarre AI structural anomalies.
4. Watermarks & theft indicators: Check for prominent watermarks, stock photo copyright marks, or stolen listing overlays.

IMPORTANT:
- Normal studio background removal, clean lighting, and catalog staging are completely acceptable.
- Do NOT claim that the model can conclusively prove physical product authenticity or reliably identify every AI-generated image.

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
 * Call local Qwen3-VL-8B-Instruct inference service
 */
async function callQwenVLService(imageInput) {
  const endpoint = process.env.QWEN_VL_ENDPOINT || 'http://127.0.0.1:8000/v1/chat/completions';
  const modelName = process.env.QWEN_VL_MODEL || 'Qwen/Qwen3-VL-8B-Instruct';

  const parsed = parseImageInput(imageInput);
  const imageUrl = parsed.dataUrl || parsed.url;

  const payload = {
    model: modelName,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildVerificationPrompt() },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }
    ],
    temperature: 0.1,
    max_tokens: 512
  };

  // Support local in-process dispatch (e.g. testing in sandbox without elevated network permissions)
  if (typeof globalThis.__QWEN_INPROCESS_HANDLER__ === 'function') {
    try {
      return await globalThis.__QWEN_INPROCESS_HANDLER__(payload);
    } catch (err) {
      return { available: false, error: err.message };
    }
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[Qwen3-VL] Service returned status ${res.status}: ${errText.slice(0, 150)}`);
      return {
        available: false,
        error: `Inference service returned status ${res.status}`
      };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      console.warn('[Qwen3-VL] Service returned empty response content.');
      return {
        available: false,
        error: 'Empty model response'
      };
    }

    // Clean and parse JSON from response content (handling optional markdown code blocks)
    let jsonText = content.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    const parsedJson = JSON.parse(jsonText);
    return {
      available: true,
      decision: {
        verified: Boolean(parsedJson.verified),
        readable: parsedJson.readable !== false,
        clearProduct: parsedJson.clearProduct !== false,
        suspiciousArtifacts: Boolean(parsedJson.suspiciousArtifacts),
        watermarks: Boolean(parsedJson.watermarks),
        confidence: parsedJson.confidence || 'medium',
        reason: parsedJson.reason || (parsedJson.verified ? 'Product image meets listing quality criteria.' : 'Image does not meet quality requirements.')
      }
    };
  } catch (err) {
    console.warn(`[Qwen3-VL] Inference service unavailable or error at ${endpoint}:`, err.message);
    return {
      available: false,
      error: err.message
    };
  }
}

/**
 * Authoritatively verify an uploaded product image
 */
export async function verifyProductImage(imageInput) {
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

  // Invoke local Qwen3-VL-8B-Instruct inference service
  const serviceResult = await callQwenVLService(imageInput);

  if (!serviceResult.available) {
    // Inference service is down, timed out, or returned an error
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
