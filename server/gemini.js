/**
 * server/gemini.js
 * Direct Gemini API Integration for Automatic Proxy Bidding
 * 
 * Strict constraints enforced:
 * - Direct Gemini REST API (no Genkit, LangChain, or other framework)
 * - Gemini 3.6 Flash only if confirmed available via API model verification
 * - No silent fallback to another model
 * - Server-side only; API key never exposed to client or logs
 * - Observe -> Reason -> Request Action -> Verify workflow
 * - Authoritative backend validation always independently enforced
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Securely load .env.local if not already loaded into process.env
 */
function loadEnvFileIfNeeded() {
  if (process.env.GEMINI_API_KEY) return;
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

let modelVerificationCache = null;

/**
 * Verify whether the requested Gemini model is available via the configured API.
 */
export async function verifyGeminiModel() {
  loadEnvFileIfNeeded();
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return {
      configured: false,
      available: false,
      modelId: null,
      message: 'GEMINI_API_KEY is not configured on the server. Authoritative deterministic bidding logic is active.'
    };
  }

  if (modelVerificationCache) {
    return modelVerificationCache;
  }

  // Derive normalized model ID (e.g. "Gemini 3.6 Flash" -> "gemini-3.6-flash")
  const rawModelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const targetModelId = rawModelName.toLowerCase().replace(/\s+/g, '-').replace(/^models\//, '');

  try {
    const res = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      const errText = await res.text();
      modelVerificationCache = {
        configured: true,
        available: false,
        modelId: null,
        message: `Gemini API authentication/connection error (${res.status}): ${errText.slice(0, 100)}`
      };
      return modelVerificationCache;
    }

    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];
    
    // Look specifically for target model ID in models list
    const found = models.find((m) => {
      const name = (m.name || '').replace(/^models\//, '');
      return name === targetModelId;
    });

    if (found) {
      modelVerificationCache = {
        configured: true,
        available: true,
        modelId: targetModelId,
        message: `Gemini model '${targetModelId}' verified and active.`
      };
    } else {
      // Model not available — do NOT silently fall back to another model!
      modelVerificationCache = {
        configured: true,
        available: false,
        modelId: null,
        message: `Model '${targetModelId}' is not available in configured Gemini API. Deterministic bidding logic is active.`
      };
    }

    return modelVerificationCache;
  } catch (err) {
    modelVerificationCache = {
      configured: true,
      available: false,
      modelId: null,
      message: `Failed to verify Gemini API model: ${err.message}. Deterministic bidding logic is active.`
    };
    return modelVerificationCache;
  }
}

/**
 * Structured reasoning using Gemini API: Observe -> Reason -> Request Action -> Verify.
 * If Gemini is unavailable or model is invalid, honestly returns status without pretending AI succeeded.
 */
export async function reasonWithGemini(auctionState, proxyConfig, proposedBid) {
  const status = await verifyGeminiModel();

  if (!status.available) {
    return {
      aiAssisted: false,
      status: status.message,
      decision: {
        action: proposedBid <= proxyConfig.maxBid ? 'BID' : 'STOP',
        recommendedBid: proposedBid,
        reasoning: 'Deterministic authoritative calculation applied.'
      }
    };
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const targetModel = status.modelId || 'gemini-3.6-flash';

  const prompt = `
You are the AI reasoning engine for Veyra Automatic Proxy Bidding.
Observe the following auction state and authorized proxy parameters:

[AUCTION OBSERVATION]
- Lot ID: ${auctionState.id}
- Title: ${auctionState.name}
- Current Highest Bid: ₹${auctionState.currentBid}
- Minimum Increment: ₹${auctionState.minIncrement}
- Total Bids Placed: ${auctionState.bidCount}
- Time Remaining (seconds): ${auctionState.remainingSeconds}

[PROXY BUYER CONSTRAINTS]
- Authorized Maximum Bid: ₹${proxyConfig.maxBid}
- Preferred Increment: ₹${proxyConfig.preferredIncrement}
- Proposed Next Bid: ₹${proposedBid}

Task:
1. Reason about whether the proposed bid of ₹${proposedBid} is within the authorized maximum of ₹${proxyConfig.maxBid}.
2. If proposedBid <= maxBid, recommend action 'BID' with recommendedBid: ${proposedBid}.
3. If proposedBid > maxBid, recommend action 'STOP' with a clear explanation of budget limit.

Respond strictly with valid JSON only in this schema:
{
  "action": "BID" | "STOP",
  "recommendedBid": number,
  "reasoning": string,
  "confidence": number
}
`;

  try {
    const res = await fetch(`${GEMINI_API_BASE}/models/${targetModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        aiAssisted: false,
        status: `Gemini API error during reasoning (${res.status}): ${errText.slice(0, 100)}`,
        decision: {
          action: proposedBid <= proxyConfig.maxBid ? 'BID' : 'STOP',
          recommendedBid: proposedBid,
          reasoning: 'Fallback to authoritative deterministic calculation due to Gemini API response error.'
        }
      };
    }

    const data = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const decision = JSON.parse(candidateText);

    return {
      aiAssisted: true,
      status: `Reasoning verified by ${targetModel}`,
      decision
    };
  } catch (err) {
    return {
      aiAssisted: false,
      status: `Gemini reasoning call failed: ${err.message}`,
      decision: {
        action: proposedBid <= proxyConfig.maxBid ? 'BID' : 'STOP',
        recommendedBid: proposedBid,
        reasoning: 'Fallback to authoritative deterministic calculation.'
      }
    };
  }
}
