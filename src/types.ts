export type Plan = "basic" | "pro";

export interface WidgetOptions {
  widgetId: string;
  plan?: Plan;
  apiBaseUrl?: string;
}

export interface VerificationResult {
  valid: boolean;
  reason: string;
  plan: Plan;
  widget_id: string;
  human_name: string | null;
  email: string | null;
  phone: string | null;
  verified_at: string | null;
  expires_at: string | null;
}
