type Plan = "basic" | "pro";
interface WidgetOptions {
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
interface VerificationResult {
    valid: boolean;
    reason: string;
    plan: Plan;
    widget_id: string;
    verified_at: string | null;
    expires_at: string | null;
    domain_verified?: boolean;
    age_over_18?: "y" | "n" | "null";
    age_over_21?: "y" | "n" | "null";
    gov_id_pic_validation?: "y" | "n" | "null";
    multiple_agents_authorized?: "y" | "n" | "null";
    member_since?: string;
    web_bot_auth_bound?: boolean;
}

declare class AgentVisa {
    private options;
    constructor(options: WidgetOptions);
    /**
     * Verify the current token for this widget.
     * Returns the unified VerificationResult.
     */
    verify(): Promise<VerificationResult>;
    /**
     * Quick static helper for one-off verification (commonly used pattern).
     */
    static verify(options: WidgetOptions): Promise<VerificationResult>;
}

export { AgentVisa };
