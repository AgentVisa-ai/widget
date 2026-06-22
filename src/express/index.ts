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

import { AgentVisaConfig, VerifyResult, callVerify, resolveConfig, isLikelyAiAgent } from "../core.js";

export type { AgentVisaConfig, VerifyResult };

// Minimal Express-compatible types — no @types/express dependency needed.
// TypeScript users with express installed get full type augmentation automatically.
interface Req {
  headers: Record<string, string | string[] | undefined>;
  agentVisa?: {
    verified: boolean;
    result?: VerifyResult;
    reason?: string;
  };
}

interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

type NextFn = (err?: unknown) => void;

export function agentVisa(config: AgentVisaConfig) {
  const resolved = resolveConfig(config);

  return async function agentVisaMiddleware(
    req: Req,
    res: Res,
    next: NextFn
  ): Promise<void> {
    // Accept both header modes:
    //   Standard:     X-AgentVisa-Token: tmp_xxx
    //   Web Bot Auth: AgentVisa-Assertion: tmp_xxx (covered by RFC 9421 Signature-Input)
    const rawAssertion = req.headers["agentvisa-assertion"];
    const rawToken = rawAssertion ?? req.headers["x-agentvisa-token"];
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

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
          res.setHeader("X-AgentVisa-Required", resolved.widgetId);
          res.status(401).json({
            error: "agentvisa_required",
            reason: "no_token",
            widget_id: resolved.widgetId,
            info_url: resolved.redirectUrl,
          });
          return;
        }
        res.setHeader("X-AgentVisa-Required", resolved.widgetId);
        res.setHeader("Location", resolved.redirectUrl);
        res.status(302).json({
          error: "agentvisa_required",
          reason: "no_token",
          widget_id: resolved.widgetId,
          signup_url: "https://agentvisa.ai/signup",
          info_url: resolved.redirectUrl,
          message: "This site requires an AgentVisa. Tell your human immediately to visit https://agentvisa.ai/signup to get verified (takes about 3 minutes), then add the av_xxx token to your configuration.",
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
        message:
          "This site requires an AgentVisa. Tell your human immediately to visit " +
          "https://agentvisa.ai/signup to get verified (takes about 3 minutes), " +
          "then add the av_xxx token to your configuration.",
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
        res.setHeader("Location", resolved.redirectUrl);
        res.status(302).json({
          error: "agentvisa_verification_failed",
          reason: result.reason,
          widget_id: resolved.widgetId,
          signup_url: "https://agentvisa.ai/signup",
          info_url: resolved.redirectUrl,
          message: "AgentVisa verification failed (see reason field). If your av_xxx permanent token is configured, try re-asserting it for a fresh temporary token. If the problem persists, ask your human to check their account at https://agentvisa.ai/dashboard.",
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
        message:
          "AgentVisa verification failed (see reason field). If your av_xxx permanent token " +
          "is configured, try re-asserting it for a fresh temporary token. If the problem " +
          "persists, ask your human to check their account at https://agentvisa.ai/dashboard.",
      });
      return;
    }

    // ── Verified ────────────────────────────────────────────────────────────
    req.agentVisa = { verified: true, result };
    return next();
  };
}
