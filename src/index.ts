import { WidgetOptions, VerificationResult } from "./types";
import { verifyToken } from "./verify";

export class AgentVisa {
  private options: Required<WidgetOptions>;

  constructor(options: WidgetOptions) {
    this.options = {
      plan: "basic",
      apiBaseUrl: "https://api.agentvisa.ai",
      ...options,
    } as Required<WidgetOptions>;
  }

  /**
   * Verify the current token for this widget.
   * Returns the unified VerificationResult.
   */
  async verify(): Promise<VerificationResult> {
    return verifyToken(this.options);
  }

  /**
   * Quick static helper for one-off verification (commonly used pattern).
   */
  static async verify(options: WidgetOptions): Promise<VerificationResult> {
    return verifyToken({
      plan: "basic",
      apiBaseUrl: "https://api.agentvisa.ai",
      ...options,
    });
  }
}

// Allow usage as a global script if desired (lightweight CDN use)
if (typeof window !== "undefined") {
  (window as any).AgentVisa = AgentVisa;
}
