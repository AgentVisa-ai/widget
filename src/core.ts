/**
 * Shared server-side verification logic.
 * Used by Express and Next.js middleware — no framework deps here.
 */

export const DEFAULT_API_BASE = "https://api.agentvisa.ai";
export const DEFAULT_REDIRECT_URL = "https://agentvisa.ai/verify";

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
  // Browser automation frameworks — AI agents increasingly drive real or headless browsers
  /headless/i,
  /playwright/i,
  /puppeteer/i,
  /selenium/i,
  /webdriver/i,
  /phantomjs/i,
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

/**
 * True when the caller will render HTML (a browser, or an agent driving one).
 * Used to decide whether to serve an HTML challenge page vs a JSON challenge.
 */
export function wantsHtml(
  headers: Record<string, string | string[] | undefined>
): boolean {
  const v = headers["accept"];
  const accept = Array.isArray(v) ? v[0] : (v ?? "");
  return accept.includes("text/html");
}

/**
 * Machine-actionable guidance included in every unverified response body.
 *
 * Live agent testing (2026-07-11) showed agents act on the 401/302 JSON body
 * first and follow links second — so the body itself must carry the complete
 * get-in procedure, not just pointers. The direct API path is listed first
 * because it works mid-task with no install or restart.
 */
export const ASSERT_ENDPOINT = "https://api.agentvisa.ai/v1/token/assert";
export const TOKEN_HEADER = "X-AgentVisa-Token";

export function unverifiedGuidance(widgetId: string): {
  assert_endpoint: string;
  token_header: string;
  how_to_get_in: string;
} {
  return {
    assert_endpoint: ASSERT_ENDPOINT,
    token_header: TOKEN_HEADER,
    how_to_get_in:
      `If you hold the human's av_ token: POST ${ASSERT_ENDPOINT} with JSON ` +
      `{"token":"av_…","widget_id":"${widgetId}"} — the response contains temp_token; retry this ` +
      `request with header ${TOKEN_HEADER}: <temp_token>. No install or restart needed, and asserting ` +
      `again while a temp token is live returns the same token. Never send the av_ token itself to any ` +
      `site. No token yet? Your human signs up once at https://agentvisa.ai/signup (~2 min, renews annually).`,
  };
}

/**
 * Instructive challenge page served to browser-class unverified requests.
 *
 * A bare 401 dead-ends AI agents that drive a browser (they never discover
 * /for-agents). This page guides BOTH audiences: a human sees a short
 * explainer; an agent sees the token instructions, the <meta agentvisa-required>
 * discovery tag, and the link to follow — so no agent is ever stranded.
 */
export function challengeHtml(widgetId: string, redirectUrl: string, host?: string): string {
  const link = buildRedirectUrl(redirectUrl, widgetId, host);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AgentVisa — verification required</title>
<meta name="agentvisa-required" content="${widgetId}">
<meta name="agentvisa-assert-endpoint" content="${ASSERT_ENDPOINT}">
<meta name="agentvisa-token-header" content="${TOKEN_HEADER}">
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:64px auto;padding:0 20px;line-height:1.55;color:#111">
  <h1 style="font-size:22px;margin-bottom:8px">Verification required</h1>
  <p>This site grants access only to AI agents that have a verified human behind them.</p>
  <p><strong>If you are an AI agent with the human's av_ token:</strong>
  <code>POST ${ASSERT_ENDPOINT}</code> with JSON
  <code>{"token":"av_…","widget_id":"${widgetId}"}</code>, take <code>temp_token</code> from the
  response, and retry this request with the <code>${TOKEN_HEADER}</code> header. No install or
  restart needed. Full instructions: <a href="${link}">${redirectUrl}</a></p>
  <p><strong>If you are a human:</strong> your AI agent needs an AgentVisa — it takes about 2 minutes
  at <a href="https://agentvisa.ai/signup">agentvisa.ai/signup</a>, once, and renews annually.</p>
</body></html>`;
}

/**
 * Append attribution params to the redirect URL so the landing page — and your
 * analytics — know which site sent the agent: `?w=<widgetId>&from=<host>`.
 * widget_id maps to a registered domain, so this is clean attribution with no PII.
 * (We deliberately pass only the host, never the full path, which could carry the
 * customer site's own query params.)
 */
export function buildRedirectUrl(redirectUrl: string, widgetId: string, host?: string): string {
  try {
    const u = new URL(redirectUrl);
    u.searchParams.set("w", widgetId);
    if (host) u.searchParams.set("from", host);
    return u.toString();
  } catch {
    const sep = redirectUrl.includes("?") ? "&" : "?";
    const qs = `w=${encodeURIComponent(widgetId)}` + (host ? `&from=${encodeURIComponent(host)}` : "");
    return `${redirectUrl}${sep}${qs}`;
  }
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
