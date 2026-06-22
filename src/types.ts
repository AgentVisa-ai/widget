export type Plan = "basic" | "pro";

export interface WidgetOptions {
  widgetId: string;
  plan?: Plan;
  apiBaseUrl?: string;
  /**
   * Redirect unverified agents to redirectUrl automatically.
   * Default: true. Set to false to handle the result yourself.
   */
  redirectOnFail?: boolean;
  /**
   * Where to send unverified agents.
   * Default: "https://agentvisa.ai/for-agents"
   */
  redirectUrl?: string;
}

export interface VerificationResult {
  valid: boolean;
  reason: string;
  plan: Plan;
  widget_id: string;

  // Present on successful verifications
  verified_at: string | null;
  expires_at: string | null;

  // Domain verification (both plans)
  domain_verified?: boolean;

  // === Pro-only fields (confirmation flags only — no raw PII is ever returned) ===
  age_over_18?: "y" | "n" | "null";
  age_over_21?: "y" | "n" | "null";
  gov_id_pic_validation?: "y" | "n" | "null";
  multiple_agents_authorized?: "y" | "n" | "null";
  member_since?: string;  // "YYYY"

  // Web Bot Auth (RFC 9421) binding — Pro only
  // True if the AgentVisa-Assertion token was covered by Signature-Input
  web_bot_auth_bound?: boolean;
}
