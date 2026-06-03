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
import { callVerify, resolveConfig } from "../core.js";
export function agentVisa(config) {
    const resolved = resolveConfig(config);
    return async function agentVisaMiddleware(req, res, next) {
        const rawToken = req.headers["x-agentvisa-token"];
        const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
        // ── No token present ────────────────────────────────────────────────────
        if (!token) {
            if (resolved.onUnverified === "passthrough") {
                req.agentVisa = { verified: false, reason: "no_token" };
                return next();
            }
            res.setHeader("X-AgentVisa-Required", resolved.widgetId);
            res.status(401).json({
                error: "agentvisa_required",
                message: "This endpoint requires an AgentVisa verification token. " +
                    "Call POST /v1/token/assert with your api/token and this widget_id " +
                    "to get a TemporaryToken, then retry with X-AgentVisa-Token: <token>.",
                widget_id: resolved.widgetId,
            });
            return;
        }
        // ── Token present — verify it ───────────────────────────────────────────
        const result = await callVerify(token, resolved);
        if (!result.valid) {
            if (resolved.onUnverified === "passthrough") {
                req.agentVisa = { verified: false, reason: result.reason, result };
                return next();
            }
            res.setHeader("X-AgentVisa-Required", resolved.widgetId);
            res.status(401).json({
                error: "agentvisa_verification_failed",
                reason: result.reason,
                widget_id: resolved.widgetId,
            });
            return;
        }
        // ── Verified ────────────────────────────────────────────────────────────
        req.agentVisa = { verified: true, result };
        return next();
    };
}
//# sourceMappingURL=index.js.map