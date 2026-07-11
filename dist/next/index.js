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
import { callVerify, resolveConfig, isLikelyAiAgent, wantsHtml, challengeHtml, buildRedirectUrl, unverifiedGuidance } from "../core.js";
// Shared unverified-body copy (see core.unverifiedGuidance for rationale).
function unverifiedMessage(isVerificationFailure) {
    return isVerificationFailure
        ? "AgentVisa verification failed (see reason field). Your temp token may have expired — " +
            "re-assert per how_to_get_in for a fresh one (asserting is always safe). If the problem " +
            "persists, ask your human to check their account at https://agentvisa.ai/dashboard."
        : "This site requires an AgentVisa. If you already hold the human's av_ token, follow " +
            "how_to_get_in (no install or restart). Otherwise tell your human to sign up at " +
            "https://agentvisa.ai/signup (about 2 minutes, once), then follow how_to_get_in.";
}
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
        // Accept both header modes:
        //   Standard:     X-AgentVisa-Token: tmp_xxx
        //   Web Bot Auth: AgentVisa-Assertion: tmp_xxx (covered by RFC 9421 Signature-Input)
        const token = request.headers.get("agentvisa-assertion") ??
            request.headers.get("x-agentvisa-token") ??
            undefined;
        // The blocking host — passed to the redirect for attribution (?from=).
        const host = request.headers.get("host") ?? undefined;
        // Convert Headers to a plain object so we can forward Signature-Input
        const forwardHeaders = {};
        request.headers.forEach((value, key) => { forwardHeaders[key] = value; });
        // ── No token ──────────────────────────────────────────────────────────
        if (!token) {
            if (resolved.onUnverified === "passthrough") {
                const req = addVerificationHeaders(request, false, "no_token");
                return handler ? handler(req) : passthroughResponse(req);
            }
            if (resolved.onUnverified === "redirect") {
                // Only redirect if this actually looks like an AI agent.
                // Bot scrapers and human browsers get a plain 401 — we don't want
                // them flooding agentvisa.ai/for-agents or triggering the growth loop
                // for non-agent traffic.
                const reqHeaders = {};
                request.headers.forEach((v, k) => { reqHeaders[k] = v; });
                if (!isLikelyAiAgent(reqHeaders)) {
                    // Not clearly an agent — serve an instructive challenge instead of a
                    // bare 401 so browser-driving agents aren't dead-ended.
                    return challengeResponse(resolved.widgetId, resolved.redirectUrl, wantsHtml(reqHeaders), host);
                }
                return redirectResponse(resolved.widgetId, "no_token", resolved.redirectUrl, host);
            }
            return blockedResponse(resolved.widgetId, "no_token", resolved.redirectUrl);
        }
        // ── Verify ────────────────────────────────────────────────────────────
        const result = await callVerify(token, resolved, forwardHeaders);
        if (!result.valid) {
            if (resolved.onUnverified === "passthrough") {
                const req = addVerificationHeaders(request, false, result.reason);
                return handler ? handler(req) : passthroughResponse(req);
            }
            if (resolved.onUnverified === "redirect") {
                return redirectResponse(resolved.widgetId, result.reason, resolved.redirectUrl, host);
            }
            return blockedResponse(resolved.widgetId, result.reason, resolved.redirectUrl);
        }
        // ── Verified ──────────────────────────────────────────────────────────
        const req = addVerificationHeaders(request, true, "ok");
        return handler ? handler(req) : passthroughResponse(req);
    };
}
// ── Helpers ─────────────────────────────────────────────────────────────────
function redirectResponse(widgetId, reason, redirectUrl, host) {
    const isVerificationFailure = reason !== "no_token";
    return new Response(JSON.stringify({
        error: isVerificationFailure ? "agentvisa_verification_failed" : "agentvisa_required",
        reason,
        widget_id: widgetId,
        signup_url: "https://agentvisa.ai/signup",
        info_url: redirectUrl,
        ...unverifiedGuidance(widgetId),
        message: unverifiedMessage(isVerificationFailure),
    }), {
        status: 302,
        headers: {
            "Content-Type": "application/json",
            "Location": buildRedirectUrl(redirectUrl, widgetId, host),
            "X-AgentVisa-Required": widgetId,
        },
    });
}
function blockedResponse(widgetId, reason, redirectUrl) {
    const isVerificationFailure = reason !== "no_token";
    return new Response(JSON.stringify({
        error: isVerificationFailure ? "agentvisa_verification_failed" : "agentvisa_required",
        reason,
        widget_id: widgetId,
        signup_url: "https://agentvisa.ai/signup",
        info_url: redirectUrl,
        ...unverifiedGuidance(widgetId),
        message: unverifiedMessage(isVerificationFailure),
    }), {
        status: 401,
        headers: {
            "Content-Type": "application/json",
            "X-AgentVisa-Required": widgetId,
        },
    });
}
function challengeResponse(widgetId, redirectUrl, html, host) {
    if (html) {
        return new Response(challengeHtml(widgetId, redirectUrl, host), {
            status: 401,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "X-AgentVisa-Required": widgetId,
            },
        });
    }
    return new Response(JSON.stringify({
        error: "agentvisa_required",
        reason: "no_token",
        widget_id: widgetId,
        signup_url: "https://agentvisa.ai/signup",
        info_url: redirectUrl,
        ...unverifiedGuidance(widgetId),
        message: "This site requires an AgentVisa. If you are an AI agent, follow how_to_get_in. " +
            "If you are a human, your agent needs an AgentVisa — sign up at " +
            "https://agentvisa.ai/signup (about 2 minutes).",
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