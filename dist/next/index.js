/**
 * AgentVisa Next.js middleware
 *
 * Usage — middleware.ts (project root):
 *
 *   import { withAgentVisa } from "@agentvisa/widget/next";
 *
 *   export default withAgentVisa({
 *     widgetId: process.env.AV_WIDGET_ID!,
 *     apiKey:   process.env.AV_API_KEY!,
 *   });
 *
 *   export const config = {
 *     matcher: ["/api/:path*"],  // paths to protect
 *   };
 *
 * Or wrap your own middleware:
 *
 *   export default withAgentVisa({ widgetId, apiKey }, async (req) => {
 *     // only runs if agent is verified
 *     return NextResponse.next();
 *   });
 *
 * Uses only standard Web APIs (Request/Response) — works on Node.js
 * runtime and Edge runtime.
 *
 * On success, the forwarded request carries two headers your handlers can read:
 *   X-AgentVisa-Verified: true
 *   X-AgentVisa-Reason:   ok
 */
import { callVerify, resolveConfig } from "../core.js";
/**
 * Wrap a Next.js middleware handler (or use standalone).
 *
 * @param config  Widget ID + API key + options
 * @param handler Optional inner handler — called only when agent is verified.
 *                If omitted, passes through with Response headers set.
 */
export function withAgentVisa(config, handler) {
    const resolved = resolveConfig(config);
    return async function agentVisaMiddleware(request) {
        const token = request.headers.get("x-agentvisa-token") ?? undefined;
        // ── No token ──────────────────────────────────────────────────────────
        if (!token) {
            if (resolved.onUnverified === "passthrough") {
                const req = addVerificationHeaders(request, false, "no_token");
                return handler ? handler(req) : passthroughResponse(req);
            }
            return blockedResponse(resolved.widgetId, "no_token");
        }
        // ── Verify ────────────────────────────────────────────────────────────
        const result = await callVerify(token, resolved);
        if (!result.valid) {
            if (resolved.onUnverified === "passthrough") {
                const req = addVerificationHeaders(request, false, result.reason);
                return handler ? handler(req) : passthroughResponse(req);
            }
            return blockedResponse(resolved.widgetId, result.reason);
        }
        // ── Verified ──────────────────────────────────────────────────────────
        const req = addVerificationHeaders(request, true, "ok");
        return handler ? handler(req) : passthroughResponse(req);
    };
}
// ── Helpers ─────────────────────────────────────────────────────────────────
function blockedResponse(widgetId, reason) {
    return new Response(JSON.stringify({
        error: "agentvisa_required",
        reason,
        widget_id: widgetId,
        message: "This endpoint requires an AgentVisa verification token. " +
            "Call POST /v1/token/assert with your api/token and this widget_id " +
            "to get a TemporaryToken, then retry with X-AgentVisa-Token: <token>.",
    }), {
        status: 401,
        headers: {
            "Content-Type": "application/json",
            "X-AgentVisa-Required": widgetId,
        },
    });
}
function addVerificationHeaders(request, verified, reason) {
    // Clone the request and add verification headers so downstream handlers
    // can read them via request.headers.get("x-agentvisa-verified")
    const headers = new Headers(request.headers);
    headers.set("x-agentvisa-verified", String(verified));
    headers.set("x-agentvisa-reason", reason);
    return new Request(request.url, {
        method: request.method,
        headers,
        body: request.body,
        // @ts-ignore — duplex needed for streaming bodies in some runtimes
        duplex: "half",
    });
}
function passthroughResponse(request) {
    // Signal to Next.js to continue to the route handler.
    // Uses the NextResponse.next() equivalent via headers.
    return new Response(null, {
        status: 200,
        headers: {
            "x-middleware-next": "1",
            "x-agentvisa-verified": request.headers.get("x-agentvisa-verified") ?? "false",
            "x-agentvisa-reason": request.headers.get("x-agentvisa-reason") ?? "unknown",
        },
    });
}
//# sourceMappingURL=index.js.map