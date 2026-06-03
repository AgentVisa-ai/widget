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
import { AgentVisaConfig, VerifyResult } from "../core.js";
export type { AgentVisaConfig, VerifyResult };
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
export declare function agentVisa(config: AgentVisaConfig): (req: Req, res: Res, next: NextFn) => Promise<void>;
//# sourceMappingURL=index.d.ts.map