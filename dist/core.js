/**
 * Shared server-side verification logic.
 * Used by Express and Next.js middleware — no framework deps here.
 */
export const DEFAULT_API_BASE = "https://api.agentvisa.ai";
/**
 * Call /v1/verify with a TemporaryToken.
 * Returns the full API response or a synthetic error result on network failure.
 */
export async function callVerify(temporaryToken, config) {
    try {
        const url = `${config.apiBaseUrl}/v1/verify?token=${encodeURIComponent(temporaryToken)}&widget_id=${encodeURIComponent(config.widgetId)}`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Widget-Api-Key": config.apiKey,
            },
        });
        return await response.json();
    }
    catch {
        return { valid: false, reason: "network_error" };
    }
}
export function resolveConfig(config) {
    return {
        apiBaseUrl: DEFAULT_API_BASE,
        onUnverified: "block",
        ...config,
    };
}
//# sourceMappingURL=core.js.map