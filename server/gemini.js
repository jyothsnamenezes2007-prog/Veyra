// Veyra Server-Side Agentic AI Auto-Bidding Module using Gemini 3.8 Flash
// Authoritative decision support with deterministic rule-based fallback

const DEFAULT_MODEL = 'gemini-3.8-flash';

/**
 * Evaluates an auction auto-bid opportunity using Gemini 3.8 Flash.
 * Falls back to deterministic rule-based bid calculation if API key is missing or call fails.
 *
 * @param {Object} params
 * @param {Object} params.auction - Authoritative auction object
 * @param {Object} params.config - User's private auto-bid configuration
 * @param {Object|null} params.leadingBid - Current top bid object
 * @returns {Promise<{ decision: 'BID'|'PASS', amount: number|null, reasoning: string, source: 'gemini'|'rules' }>}
 */
export async function evaluateAutoBid({ auction, config, leadingBid }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const currentBid = Number(auction.currentBid || auction.startingBid || 0);
  const minIncrement = Number(auction.minIncrement || 500);
  const maxBudget = Number(config.maxBudget);
  const preferredIncrement = Number(config.preferredIncrement || minIncrement);

  // 1. Strict pre-flight checks (Rule-based guarantees)
  const minRequiredBid = currentBid + (auction.bidCount > 0 ? minIncrement : 0);

  // If already leading, never bid against oneself
  if (leadingBid && leadingBid.bidderId === config.userId) {
    return {
      decision: 'PASS',
      amount: null,
      reasoning: 'User is already the leading bidder.',
      source: 'rules'
    };
  }

  // If next required bid exceeds budget, immediately PASS
  if (minRequiredBid > maxBudget) {
    return {
      decision: 'PASS',
      amount: null,
      reasoning: `Next minimum bid of ₹${minRequiredBid.toLocaleString('en-IN')} exceeds authorized budget of ₹${maxBudget.toLocaleString('en-IN')}.`,
      source: 'rules'
    };
  }

  // Compute the rule-based candidate amount
  // Ensure the increment is at least the auction's minIncrement
  const effectiveIncrement = Math.max(preferredIncrement, minIncrement);
  let ruleCalculatedAmount = currentBid + (auction.bidCount > 0 ? effectiveIncrement : 0);
  if (ruleCalculatedAmount < minRequiredBid) {
    ruleCalculatedAmount = minRequiredBid;
  }
  // Cap at max budget if candidate exceeds maxBudget but maxBudget satisfies minRequiredBid
  if (ruleCalculatedAmount > maxBudget && maxBudget >= minRequiredBid) {
    ruleCalculatedAmount = maxBudget;
  }

  // 2. If Gemini API key is available, consult Gemini 3.8 Flash for agentic evaluation
  if (apiKey) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const prompt = `You are the authoritative autonomous auto-bidding agent for Veyra Luxury & Artisan Marketplace.
You represent the collector "${config.bidderName || 'Collector'}".

AUCTION SITUATION:
- Lot Name: "${auction.name}"
- Current Price: ₹${currentBid}
- Minimum Next Bid: ₹${minRequiredBid}
- Auction Minimum Increment: ₹${minIncrement}
- Total Bids Placed: ${auction.bidCount}
- Leading Bidder: "${leadingBid ? leadingBid.bidder : 'None'}"

BIDDER CONSTRAINTS (CONFIDENTIAL):
- Maximum Authorized Budget: ₹${maxBudget}
- Preferred Bid Increment: ₹${preferredIncrement}

INSTRUCTIONS:
1. Determine if a new bid should be submitted ("BID") or passed ("PASS").
2. If "BID", calculate the exact bid amount in INR:
   - Must be strictly > ₹${currentBid}
   - Must be >= ₹${minRequiredBid}
   - Must be <= ₹${maxBudget}
   - Respect the user's preferred increment of ₹${preferredIncrement} while meeting the minimum required increment of ₹${minIncrement}.
3. If minRequiredBid (₹${minRequiredBid}) > maxBudget (₹${maxBudget}), you MUST return "PASS".

Respond strictly with a JSON object:
{
  "decision": "BID" | "PASS",
  "amount": number or null,
  "reasoning": "brief concise rationale"
}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        }),
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const json = await response.json();
        const candidateText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          const parsed = JSON.parse(candidateText.trim());
          if (parsed.decision === 'BID' && typeof parsed.amount === 'number') {
            const proposedAmount = Math.round(parsed.amount);

            // Server-side Authoritative Guard: Validate LLM output against hard rules
            if (
              proposedAmount >= minRequiredBid &&
              proposedAmount <= maxBudget &&
              proposedAmount > currentBid
            ) {
              return {
                decision: 'BID',
                amount: proposedAmount,
                reasoning: parsed.reasoning || `Gemini ${model} calculated optimal increment within budget.`,
                source: 'gemini'
              };
            }
          } else if (parsed.decision === 'PASS') {
            return {
              decision: 'PASS',
              amount: null,
              reasoning: parsed.reasoning || 'Gemini recommended pass based on constraints.',
              source: 'gemini'
            };
          }
        }
      } else {
        console.warn(`[Veyra Gemini Agent] API returned HTTP ${response.status}, falling back to rule engine.`);
      }
    } catch (err) {
      console.warn('[Veyra Gemini Agent] Call failed or timed out, activating deterministic fallback:', err.message);
    }
  }

  // 3. Deterministic rule-based fallback
  if (ruleCalculatedAmount >= minRequiredBid && ruleCalculatedAmount <= maxBudget) {
    return {
      decision: 'BID',
      amount: ruleCalculatedAmount,
      reasoning: `Rule engine placed bid respecting increment preference (₹${preferredIncrement}) within budget (₹${maxBudget}).`,
      source: 'rules'
    };
  }

  return {
    decision: 'PASS',
    amount: null,
    reasoning: `Calculated bid ₹${ruleCalculatedAmount} exceeds authorized maximum budget of ₹${maxBudget}.`,
    source: 'rules'
  };
}
