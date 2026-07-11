const DEFAULT_API_BASE = "https://api.agentvisa.ai";
const DEFAULT_REDIRECT_URL = "https://agentvisa.ai/for-agents";
export async function verifyToken(options) {
    const { widgetId, plan = "basic", apiBaseUrl = DEFAULT_API_BASE, redirectOnFail = false, redirectUrl = DEFAULT_REDIRECT_URL, } = options;
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
        const result = {
            valid: false,
            reason: "network_error",
            plan,
            widget_id: widgetId,
            verified_at: null,
            expires_at: null,
        };
        if (redirectOnFail && typeof window !== "undefined") {
            window.location.href = redirectUrl;
        }
        return result;
    }
    const result = await response.json();
    if (!result.valid && redirectOnFail && typeof window !== "undefined") {
        window.location.href = redirectUrl;
    }
    return result;
}
