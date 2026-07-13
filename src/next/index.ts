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

import { AgentVisaConfig, VerifyResult, callVerify, resolveConfig, isLikelyAiAgent, wantsHtml, challengeHtml, buildRedirectUrl, unverifiedGuidance, extractToken } from "../core.js";

// Shared unverified-body copy (see core.unverifiedGuidance for rationale).
function unverifiedMessage(isVerificationFailure: boolean, widgetId: string): string {
  return isVerificationFailure
    ? "AgentVisa verification failed (reason field says why). Two common causes: (1) your temp " +
      `token was issued for a DIFFERENT widget_id — re-exchange for THIS site's widget_id ` +
      `"${widgetId}" per how_to_get_in; (2) it expired — re-assert (always safe). ` +
      "If it persists, ask your human to check their account at https://agentvisa.ai/dashboard."
    : "This site requires an AgentVisa. Follow how_to_get_in — do the steps in order and " +
      "stop at the first that works. A human is needed only at step 4, once, ever.";
}

export type { AgentVisaConfig, VerifyResult };

type NextHandler = (request: Request) => Response | Promise<Response>;

/**
 * Wrap a Next.js middleware handler (or use standalone).
 *
 * @param config  Widget ID + API key + options
 * @param handler Optional inner handler — called only when agent is verified.
 *                If omitted, passes through with Response headers set.
 */
export function withAgentVisa(
  config: AgentVisaConfig,
  handler?: NextHandler
): NextHandler {
  const resolved = resolveConfig(config);

  return async function agentVisaMiddleware(request: Request): Promise<Response> {
    // The blocking host — passed to the redirect for attribution (?from=).
    const host = request.headers.get("host") ?? undefined;

    // Convert Headers to a plain object so we can forward Signature-Input
    const forwardHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => { forwardHeaders[key] = value; });

    // Accept all three presentation modes (see core.extractToken):
    //   Web Bot Auth: AgentVisa-Assertion (RFC 9421-covered)
    //   Standard:     X-AgentVisa-Token   (HTTP clients)
    //   Browser:      agentvisa_token cookie — browser-driving agents cannot
    //                 set custom headers on page navigation
    const token = extractToken(forwardHeaders);

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
        const reqHeaders: Record<string, string | undefined> = {};
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

function redirectResponse(widgetId: string, reason: string, redirectUrl: string, host?: string): Response {
  const isVerificationFailure = reason !== "no_token";
  return new Response(
    JSON.stringify({
      error: isVerificationFailure ? "agentvisa_verification_failed" : "agentvisa_required",
      reason,
      widget_id: widgetId,
      signup_url: "https://agentvisa.ai/signup",
      info_url: redirectUrl,
      ...unverifiedGuidance(widgetId),
      message: unverifiedMessage(isVerificationFailure, widgetId),
    }),
    {
      status: 302,
      headers: {
        "Content-Type": "application/json",
        "Location": buildRedirectUrl(redirectUrl, widgetId, host),
        "X-AgentVisa-Required": widgetId,
      },
    }
  );
}

function blockedResponse(widgetId: string, reason: string, redirectUrl: string): Response {
  const isVerificationFailure = reason !== "no_token";
  return new Response(
    JSON.stringify({
      error: isVerificationFailure ? "agentvisa_verification_failed" : "agentvisa_required",
      reason,
      widget_id: widgetId,
      signup_url: "https://agentvisa.ai/signup",
      info_url: redirectUrl,
      ...unverifiedGuidance(widgetId),
      message: unverifiedMessage(isVerificationFailure, widgetId),
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "X-AgentVisa-Required": widgetId,
      },
    }
  );
}

function challengeResponse(widgetId: string, redirectUrl: string, html: boolean, host?: string): Response {
  if (html) {
    return new Response(challengeHtml(widgetId, redirectUrl, host), {
      status: 401,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-AgentVisa-Required": widgetId,
      },
    });
  }
  return new Response(
    JSON.stringify({
      error: "agentvisa_required",
      reason: "no_token",
      widget_id: widgetId,
      signup_url: "https://agentvisa.ai/signup",
      info_url: redirectUrl,
      ...unverifiedGuidance(widgetId),
      message:
        "This site requires an AgentVisa. If you are an AI agent, follow how_to_get_in. " +
        "If you are a human, your agent needs an AgentVisa — sign up at " +
        "https://agentvisa.ai/signup (about 2 minutes).",
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "X-AgentVisa-Required": widgetId,
      },
    }
  );
}

function addVerificationHeaders(
  request: Request,
  verified: boolean,
  reason: string
): Request {
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

function passthroughResponse(request: Request): Response {
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
