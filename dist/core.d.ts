/**
 * Shared server-side verification logic.
 * Used by Express and Next.js middleware — no framework deps here.
 */
export declare const DEFAULT_API_BASE = "https://api.agentvisa.ai";
export declare const DEFAULT_REDIRECT_URL = "https://agentvisa.ai/verify";
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
export declare function isLikelyAiAgent(headers: Record<string, string | string[] | undefined>): boolean;
/**
 * True when the caller will render HTML (a browser, or an agent driving one).
 * Used to decide whether to serve an HTML challenge page vs a JSON challenge.
 */
export declare function wantsHtml(headers: Record<string, string | string[] | undefined>): boolean;
/**
 * Machine-actionable guidance included in every unverified response body.
 *
 * Live agent testing (2026-07-11) showed agents act on the 401/302 JSON body
 * first and follow links second — so the body itself must carry the complete
 * get-in procedure, not just pointers. The direct API path is listed first
 * because it works mid-task with no install or restart.
 */
export declare const ASSERT_ENDPOINT = "https://api.agentvisa.ai/v1/token/assert";
export declare const TOKEN_HEADER = "X-AgentVisa-Token";
export declare function unverifiedGuidance(widgetId: string): {
    assert_endpoint: string;
    token_header: string;
    how_to_get_in: string;
};
/**
 * Instructive challenge page served to browser-class unverified requests.
 *
 * A bare 401 dead-ends AI agents that drive a browser (they never discover
 * /for-agents). This page guides BOTH audiences: a human sees a short
 * explainer; an agent sees the token instructions, the <meta agentvisa-required>
 * discovery tag, and the link to follow — so no agent is ever stranded.
 */
export declare function challengeHtml(widgetId: string, redirectUrl: string, host?: string): string;
/**
 * Append attribution params to the redirect URL so the landing page — and your
 * analytics — know which site sent the agent: `?w=<widgetId>&from=<host>`.
 * widget_id maps to a registered domain, so this is clean attribution with no PII.
 * (We deliberately pass only the host, never the full path, which could carry the
 * customer site's own query params.)
 */
export declare function buildRedirectUrl(redirectUrl: string, widgetId: string, host?: string): string;
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
    verified_at?: string | null;
    expires_at?: string | null;
    domain_verified?: boolean;
    age_over_18?: "y" | "n" | "null";
    age_over_21?: "y" | "n" | "null";
    gov_id_pic_validation?: "y" | "n" | "null";
    multiple_agents_authorized?: "y" | "n" | "null";
    member_since?: string;
    email_confirmed?: boolean;
    phone_last4_confirmed?: boolean;
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
export declare function callVerify(temporaryToken: string, config: Required<AgentVisaConfig>, forwardHeaders?: Record<string, string | string[] | undefined>): Promise<VerifyResult>;
export declare function resolveConfig(config: AgentVisaConfig): Required<AgentVisaConfig>;
//# sourceMappingURL=core.d.ts.map