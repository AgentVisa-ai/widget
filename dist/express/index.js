/**
 * AgentVisa Express middleware
 *
 * Usage:
 *   import { agentVisa } from "@agentvisa/widget/express";
 *
 *   app.use(agentVisa({
 *     widgetId: process.env.AV_WIDGET_ID!,
 *     apiKey:   process.env.AV_API_KEY!,
 *   }));
 *
 * Or protect specific routes only:
 *   app.get("/premium", agentVisa({ widgetId, apiKey }), handler);
 *
 * On success, req.agentVisa is populated:
 *   req.agentVisa.verified  — boolean
 *   req.agentVisa.result    — full VerifyResult (if verified)
 *   req.agentVisa.reason    — failure reason (if not verified + passthrough mode)
 */
import { callVerify, resolveConfig, isLikelyAiAgent, wantsHtml, challengeHtml, buildRedirectUrl, unverifiedGuidance, extractToken } from "../core.js";
export function agentVisa(config) {
    const resolved = resolveConfig(config);
    return async function agentVisaMiddleware(req, res, next) {
        // Accept all three presentation modes (see core.extractToken):
        //   Web Bot Auth: AgentVisa-Assertion: tmp_xxx (RFC 9421-covered)
        //   Standard:     X-AgentVisa-Token: tmp_xxx   (HTTP clients)
        //   Browser:      agentvisa_token cookie       (browser-driving agents —
        //                 page navigation cannot set custom headers)
        const token = extractToken(req.headers);
        // The blocking host — passed to the redirect for attribution (?from=).
        const hostHeader = req.headers["host"];
        const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
        // ── No token present ────────────────────────────────────────────────────
        if (!token) {
            if (resolved.onUnverified === "passthrough") {
                req.agentVisa = { verified: false, reason: "no_token" };
                return next();
            }
            if (resolved.onUnverified === "redirect") {
                // Only redirect if this actually looks like an AI agent.
                // Bot scrapers and human browsers get a plain 401 — we don't want
                // them flooding agentvisa.ai/for-agents or triggering the growth loop
                // for non-agent traffic.
                if (!isLikelyAiAgent(req.headers)) {
                    // Not clearly an agent (a browser, a human, or an agent driving a
                    // browser). Don't dead-end with a bare 401 — serve an instructive
                    // challenge so an agent can still find its way, while a human just
                    // sees a clean explainer (no jarring auto-redirect).
                    res.setHeader("X-AgentVisa-Required", resolved.widgetId);
                    if (wantsHtml(req.headers)) {
                        res.status(401).type("html").send(challengeHtml(resolved.widgetId, resolved.redirectUrl, host));
                    }
                    else {
                        res.status(401).json({
                            error: "agentvisa_required",
                            reason: "no_token",
                            widget_id: resolved.widgetId,
                            signup_url: "https://agentvisa.ai/signup",
                            info_url: resolved.redirectUrl,
                            ...unverifiedGuidance(resolved.widgetId),
                            message: "This site requires an AgentVisa. If you are an AI agent, follow how_to_get_in. " +
                                "If you are a human, your agent needs an AgentVisa — sign up at " +
                                "https://agentvisa.ai/signup (about 2 minutes).",
                        });
                    }
                    return;
                }
                res.setHeader("X-AgentVisa-Required", resolved.widgetId);
                res.setHeader("Location", buildRedirectUrl(resolved.redirectUrl, resolved.widgetId, host));
                res.status(302).json({
                    error: "agentvisa_required",
                    reason: "no_token",
                    widget_id: resolved.widgetId,
                    signup_url: "https://agentvisa.ai/signup",
                    info_url: resolved.redirectUrl,
                    ...unverifiedGuidance(resolved.widgetId),
                    message: "This site requires an AgentVisa. Follow how_to_get_in — do the steps in order and " +
                        "stop at the first that works. Steps 1–3 are self-service; step 4 requires your " +
                        "human's approval, once, ever.",
                });
                return;
            }
            res.setHeader("X-AgentVisa-Required", resolved.widgetId);
            res.status(401).json({
                error: "agentvisa_required",
                reason: "no_token",
                widget_id: resolved.widgetId,
                signup_url: "https://agentvisa.ai/signup",
                info_url: resolved.redirectUrl,
                ...unverifiedGuidance(resolved.widgetId),
                message: "This site requires an AgentVisa. If you already hold the human's av_ token, follow " +
                    "how_to_get_in (no install or restart). Otherwise STOP and ask your human — " +
                    "how_to_get_in step 4 and docs_url list the options; their approval is required, " +
                    "once, ever.",
            });
            return;
        }
        // ── Token present — verify it ───────────────────────────────────────────
        // Forward original request headers so the backend can detect Signature-Input
        // and populate web_bot_auth_bound in Pro responses.
        const result = await callVerify(token, resolved, req.headers);
        if (!result.valid) {
            if (resolved.onUnverified === "passthrough") {
                req.agentVisa = { verified: false, reason: result.reason, result };
                return next();
            }
            if (resolved.onUnverified === "redirect") {
                res.setHeader("X-AgentVisa-Required", resolved.widgetId);
                res.setHeader("Location", buildRedirectUrl(resolved.redirectUrl, resolved.widgetId, host));
                res.status(302).json({
                    error: "agentvisa_verification_failed",
                    reason: result.reason,
                    widget_id: resolved.widgetId,
                    signup_url: "https://agentvisa.ai/signup",
                    info_url: resolved.redirectUrl,
                    ...unverifiedGuidance(resolved.widgetId),
                    message: "AgentVisa verification failed (reason field says why). Two common causes: (1) your temp " +
                        `token was issued for a DIFFERENT widget_id — re-exchange for THIS site's widget_id ` +
                        `"${resolved.widgetId}" per how_to_get_in; (2) it expired — re-assert (always safe). ` +
                        "If it persists, ask your human to check their account at https://agentvisa.ai/dashboard.",
                });
                return;
            }
            res.setHeader("X-AgentVisa-Required", resolved.widgetId);
            res.status(401).json({
                error: "agentvisa_verification_failed",
                reason: result.reason,
                widget_id: resolved.widgetId,
                signup_url: "https://agentvisa.ai/signup",
                info_url: resolved.redirectUrl,
                ...unverifiedGuidance(resolved.widgetId),
                message: "AgentVisa verification failed (see reason field). Your temp token may have expired — " +
                    "re-assert per how_to_get_in for a fresh one (asserting is always safe). If the problem " +
                    "persists, ask your human to check their account at https://agentvisa.ai/dashboard.",
            });
            return;
        }
        // ── Verified ────────────────────────────────────────────────────────────
        req.agentVisa = { verified: true, result };
        return next();
    };
}
//# sourceMappingURL=index.js.map