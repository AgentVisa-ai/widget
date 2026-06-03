type Plan = "basic" | "pro";
interface WidgetOptions {
    widgetId: string;
    plan?: Plan;
    apiBaseUrl?: string;
}
interface VerificationResult {
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
