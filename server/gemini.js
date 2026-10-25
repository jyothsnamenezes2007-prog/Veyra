/**
 * server/gemini.js
 * Direct Gemini API Integration for Automatic Proxy Bidding
 * 
 * Strict constraints enforced:
 * - Direct Gemini REST API (no Genkit, LangChain, or other framework)
 * - Gemini 3.6 Flash only if confirmed available via API model verification
 * - No silent fallback to another model
 * - Server-side only; API key never exposed to client
 * - Observe -> Reason -> Request Action -> Verify workflow
 * - Authoritative backend validation always independently enforced
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const REQUESTED_MODEL_ID = 'gemini-3.6-flash';

let modelVerificationCache = null;

/**
 * Verify whether the requested Gemini model is available via the configured API.
 */
export async function verifyGeminiModel() {
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

  try {
    const res = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
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
    
    // Look specifically for gemini-3.6-flash in models list
    const found = models.find((m) => {
      const name = m.name || '';
      return name === `models/${REQUESTED_MODEL_ID}` || name === REQUESTED_MODEL_ID;
    });

    if (found) {
      modelVerificationCache = {
        configured: true,
        available: true,
        modelId: REQUESTED_MODEL_ID,
        message: `Gemini model '${REQUESTED_MODEL_ID}' verified and active.`
      };
    } else {
      // Model not available — do NOT silently fall back to another model!
      modelVerificationCache = {
        configured: true,
        available: false,
        modelId: null,
        message: `Model '${REQUESTED_MODEL_ID}' is not available in configured Gemini API. Deterministic bidding logic is active.`
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
    const res = await fetch(`${GEMINI_API_BASE}/models/${REQUESTED_MODEL_ID}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      status: `Reasoning verified by ${REQUESTED_MODEL_ID}`,
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
