const DEFAULT_API_BASE = "https://api.agentvisa.ai";
async function verifyToken(options) {
    const { widgetId, plan = "basic", apiBaseUrl = DEFAULT_API_BASE, } = options;
    const url = new URL("/v1/verify", apiBaseUrl);
    url.searchParams.set("widget_id", widgetId);
    url.searchParams.set("plan", plan);
    // Note: token is currently empty — this is the skeleton.
    // In real usage the AI agent will pass the tmp_ token here.
    const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            token: "",
            widget_id: widgetId,
            plan,
        }),
    });
    if (!response.ok) {
        return {
            valid: false,
            reason: "network_error",
            plan,
            widget_id: widgetId,
            human_name: null,
            email: null,
            phone: null,
            verified_at: null,
            expires_at: null,
        };
    }
    return response.json();
}

class AgentVisa {
    constructor(options) {
        this.options = {
            plan: "basic",
            apiBaseUrl: "https://api.agentvisa.ai",
            ...options,
        };
    }
    /**
     * Verify the current token for this widget.
     * Returns the unified VerificationResult.
     */
    async verify() {
        return verifyToken(this.options);
    }
    /**
     * Quick static helper for one-off verification (commonly used pattern).
     */
    static async verify(options) {
        return verifyToken({
            plan: "basic",
            apiBaseUrl: "https://api.agentvisa.ai",
            ...options,
        });
    }
}
// Allow usage as a global script if desired (lightweight CDN use)
if (typeof window !== "undefined") {
    window.AgentVisa = AgentVisa;
}

export { AgentVisa };
