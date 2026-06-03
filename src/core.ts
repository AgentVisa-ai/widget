/**
 * Shared server-side verification logic.
 * Used by Express and Next.js middleware — no framework deps here.
 */

export const DEFAULT_API_BASE = "https://api.agentvisa.ai";

export interface AgentVisaConfig {
  /** Your widget ID from the AgentVisa dashboard */
  widgetId: string;
  /** Your widget API key — keep server-side only, never expose to the browser */
  apiKey: string;
  /** Override API base URL (e.g. for staging) */
  apiBaseUrl?: string;
  /**
   * What to do when verification fails or token is missing.
   * "block" (default) — return 401 and stop the request.
   * "passthrough" — attach result to request and continue; let your
   *   handler decide. Useful for soft-gating or analytics.
   */
  onUnverified?: "block" | "passthrough";
}

export interface VerifyResult {
  valid: boolean;
  reason: string;
  plan?: string;
  widget_id?: string;
  human_name?: string | null;
  verified_at?: string | null;
  expires_at?: string | null;
  // Pro plan fields
  five_factor?: string;
  age_over_18?: string;
  age_over_21?: string;
  multiple_agents_authorized?: string;
  verifications_today?: number;
}

/**
 * Call /v1/verify with a TemporaryToken.
 * Returns the full API response or a synthetic error result on network failure.
 */
export async function callVerify(
  temporaryToken: string,
  config: Required<AgentVisaConfig>
): Promise<VerifyResult> {
  try {
    const url = `${config.apiBaseUrl}/v1/verify?token=${encodeURIComponent(temporaryToken)}&widget_id=${encodeURIComponent(config.widgetId)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Widget-Api-Key": config.apiKey,
      },
    });
    return await response.json() as VerifyResult;
  } catch {
    return { valid: false, reason: "network_error" };
  }
}

export function resolveConfig(config: AgentVisaConfig): Required<AgentVisaConfig> {
  return {
    apiBaseUrl: DEFAULT_API_BASE,
    onUnverified: "block",
    ...config,
  };
}
