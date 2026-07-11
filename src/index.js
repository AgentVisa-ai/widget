import { verifyToken } from "./verify";
export class AgentVisa {
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
