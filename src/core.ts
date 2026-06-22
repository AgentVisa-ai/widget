/**
 * Shared server-side verification logic.
 * Used by Express and Next.js middleware — no framework deps here.
 */

export const DEFAULT_API_BASE = "https://api.agentvisa.ai";
export const DEFAULT_REDIRECT_URL = "https://agentvisa.ai/for-agents";

// ── Agent signal detection ────────────────────────────────────────────────────

/**
 * Known AI agent / LLM user-agent substrings (case-insensitive).
 * Not exhaustive — the UA check is a medium-confidence signal only.
 * The strongest signals are RFC 9421 headers (Signature-Input, Agent-Authorization).
 */
const AI_UA_PATTERNS: RegExp[] = [
  /claude/i,
  /anthropic/i,
  /openai/i,
  /chatgpt/i,
  /gpt-[0-9]/i,
  /gemini/i,
  /cursor\//i,
  /windsurf/i,
  /codeium/i,
  /perplexity/i,
  /copilot/i,
  /agentvisa/i,
  /python-httpx/i,
  /python-requests/i,
];

/**
 * Detect whether an incoming request looks like an AI agent.
 *
 * Used to guard the viral redirect loop — we only send requests to
 * agentvisa.ai/for-agents when there is evidence the requester is an
 * AI agent that can act on the instructions there. Bot scrapers and
 * human browsers get a plain 401 instead.
 *
 * Detection hierarchy:
 *   Strong  (any one → true): RFC 9421 Signature-Input, Agent-Authorization header
 *   Medium  (any one → true): known AI User-Agent pattern
 *   Weak combo (both needed): no browser fingerprint headers + no text/html in Accept
 */
export function isLikelyAiAgent(
  headers: Record<string, string | string[] | undefined>
): boolean {
  const h = (name: string): string => {
    const v = headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : (v ?? "");
  };

  // Strong: RFC 9421 Web Bot Auth — signed request almost certainly from AI operator
  if (h("signature-input") || h("agent-authorization")) return true;

  // Medium: known AI User-Agent
  const ua = h("user-agent");
  if (ua && AI_UA_PATTERNS.some((p) => p.test(ua))) return true;

  // Weak combo: no browser fingerprint + no HTML in Accept
  // Real browsers always send sec-fetch-* and always include text/html in Accept.
  const hasBrowserFingerprint =
    !!h("sec-fetch-mode") || !!h("sec-fetch-site") || !!h("sec-ch-ua");
  const accept = h("accept");
  const acceptsHtml = accept.includes("text/html");
  const looksLikeApiClient =
    accept.includes("application/json") || accept === "*/*" || accept === "";

  if (!hasBrowserFingerprint && !acceptsHtml && looksLikeApiClient) return true;

  return false;
}

export interface AgentVisaConfig {
  /** Your widget ID from the AgentVisa dashboard */
  widgetId: string;
  /** Your widget API key — keep server-side only, never expose to the browser */
  apiKey: string;
  /** Override API base URL (e.g. for staging) */
  apiBaseUrl?: string;
  /**
   * What to do when verification fails or token is missing.
   * "redirect" (default) — redirect the agent to redirectUrl (agentvisa.ai/for-agents).
   * "block"    — return 401 and stop the request. The redirect_url is still included
   *              in the JSON body so the agent knows where to go.
   * "passthrough" — attach result to request and continue; let your
   *   handler decide. Useful for soft-gating or analytics.
   */
  onUnverified?: "redirect" | "block" | "passthrough";
  /**
   * Where to send unverified agents.
   * Defaults to "https://agentvisa.ai/for-agents".
   * Only used when onUnverified is "redirect".
   */
  redirectUrl?: string;
  /**
   * Timeout in milliseconds for the /v1/verify API call.
   * Defaults to 5000ms (5 seconds).
   * If the AgentVisa API does not respond within this window, callVerify()
   * returns { valid: false, reason: "network_error" } — your onUnverified
   * policy then applies, so your site stays up even if AgentVisa is down.
   */
  timeoutMs?: number;
}

export interface VerifyResult {
  valid: boolean;
  reason: string;
  plan?: string;
  widget_id?: string;

  // Timestamps — present on successful verifications
  verified_at?: string | null;
  expires_at?: string | null;

  // Domain verification (both plans)
  domain_verified?: boolean;

  // === Pro-only confirmation flags (AVS-style — no raw PII ever returned) ===
  age_over_18?: "y" | "n" | "null";
  age_over_21?: "y" | "n" | "null";
  gov_id_pic_validation?: "y" | "n" | "null";
  multiple_agents_authorized?: "y" | "n" | "null";
  member_since?: string;

  // AVS-style attribute confirmation — Pro only
  // Send confirm_email / confirm_phone_last4 in the verify request body to get these back
  email_confirmed?: boolean;
  phone_last4_confirmed?: boolean;

  // Web Bot Auth (RFC 9421) binding — Pro only
  // True if "agentvisa-assertion" appeared in Signature-Input on the original request
  web_bot_auth_bound?: boolean;
}

/**
 * Call /v1/verify with a TemporaryToken.
 *
 * @param temporaryToken  The tmp_xxx token from the agent's request header
 * @param config          Resolved widget config (widgetId, apiKey, apiBaseUrl)
 * @param forwardHeaders  Optional headers from the original agent request.
 *                        Pass these so the backend can detect Web Bot Auth binding
 *                        (Signature-Input header) and populate web_bot_auth_bound.
 *
 * Returns the full VerifyResult or a synthetic error result on network failure.
 */
export async function callVerify(
  temporaryToken: string,
  config: Required<AgentVisaConfig>,
  forwardHeaders?: Record<string, string | string[] | undefined>,
): Promise<VerifyResult> {
  // Forward Signature-Input from the original agent request so the backend
  // can detect Web Bot Auth binding and set web_bot_auth_bound in Pro responses.
  const extraHeaders: Record<string, string> = {};
  if (forwardHeaders) {
    const sigInput = forwardHeaders["signature-input"];
    if (sigInput) {
      extraHeaders["signature-input"] = Array.isArray(sigInput) ? sigInput[0] : sigInput;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(`${config.apiBaseUrl}/v1/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Widget-Api-Key": config.apiKey,
        ...extraHeaders,
      },
      body: JSON.stringify({
        token: temporaryToken,
        widget_id: config.widgetId,
      }),
      signal: controller.signal,
    });
    return await response.json() as VerifyResult;
  } catch {
    // Covers AbortError (timeout) and genuine network errors.
    // Returning network_error lets the caller's onUnverified policy decide
    // what to do — the site stays up even when AgentVisa is unreachable.
    return { valid: false, reason: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

export function resolveConfig(config: AgentVisaConfig): Required<AgentVisaConfig> {
  return {
    apiBaseUrl: DEFAULT_API_BASE,
    onUnverified: "redirect",
    redirectUrl: DEFAULT_REDIRECT_URL,
    timeoutMs: 5000,
    ...config,
  };
}
