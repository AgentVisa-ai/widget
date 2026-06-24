# @agentvisa/widget

Server-side middleware for **AgentVisa** verification — protect your Express or Next.js API routes so only AI agents backed by a verified human can access them.

When an unverified agent hits a protected route, the middleware returns a `302` redirect (or `401`) pointing the agent to [agentvisa.ai/for-agents](https://agentvisa.ai/for-agents), where it prompts the human to sign up. Verified agents pass straight through.

> **Which package should I use?**
> - **`@agentvisa/widget`** (this package) — use when you want the full viral redirect loop: unverified AI agents are redirected to AgentVisa to get verified, then come back. Also works as a plain `block` or `passthrough` gate. Supports Express and Next.js.
> - **[`@agentvisa/verify`](https://www.npmjs.com/package/@agentvisa/verify)** — use when you just want to verify a token and get a result back. Simpler API, no redirect, no growth loop. Works with any Node.js framework.

## Installation

```bash
npm install @agentvisa/widget
```

## Quick start — Express

```ts
import express from 'express';
import { agentVisa } from '@agentvisa/widget/express';

const app = express();

app.use('/api', agentVisa({
  widgetId: process.env.AV_WIDGET_ID!,
  apiKey:   process.env.AV_API_KEY!,
}));

app.post('/api/order', (req, res) => {
  // Only reaches here if the agent is verified
  console.log(req.agentVisa.result.plan);  // "basic" | "pro"
  res.json({ ok: true });
});
```

## Quick start — Next.js

```ts
// middleware.ts (project root)
import { withAgentVisa } from '@agentvisa/widget/next';

export default withAgentVisa({
  widgetId: process.env.AV_WIDGET_ID!,
  apiKey:   process.env.AV_API_KEY!,
});

export const config = {
  matcher: ['/api/:path*'],
};
```

## How agents send their token

Agents use the [AgentVisa MCP server](https://www.npmjs.com/package/@agentvisa/mcp) (`@agentvisa/mcp`) to exchange their permanent token for a short-lived `tmp_xxx` token, then send it in one of two ways:

**Standard mode:**
```
X-AgentVisa-Token: tmp_xxxxxxxxxxxxxxxxxxxx
```

**Web Bot Auth mode** (RFC 9421 — token bound in the signature):
```
AgentVisa-Assertion: tmp_xxxxxxxxxxxxxxxxxxxx
Signature-Input: sig1=("@method" "@path" "host" "agentvisa-assertion");keyid="key-1";created=1234567890
Signature: sig1=:base64sig:
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `widgetId` | `string` | **required** | Your `wgt_xxx` widget ID |
| `apiKey` | `string` | **required** | Your `wk_xxx` API key — **server-side only** |
| `onUnverified` | `'redirect' \| 'block' \| 'passthrough'` | `'redirect'` | What to do when an agent is unverified |
| `redirectUrl` | `string` | `'https://agentvisa.ai/for-agents'` | Where to redirect unverified AI agents |
| `timeoutMs` | `number` | `5000` | Timeout for the `/v1/verify` API call |

### `onUnverified` modes

- **`'redirect'`** (default) — AI agents (including headless/automation browsers) get a `302` to the AgentVisa challenge page (`/verify`), with `?w=<widget_id>&from=<host>` appended for attribution. Other browser-class requests get an instructive `401` **challenge** — an HTML page for browsers, JSON otherwise — that points both agents and humans to the next step, never a bare dead-end. This is the viral growth mode: unverified agents reach the sign-up path, then come back verified.
- **`'block'`** — All unverified requests get `401`. Quiet hard gate.
- **`'passthrough'`** — Attach the result to `req.agentVisa` (Express) or response headers (Next.js) and continue. Use this for soft-gating or analytics.

## Express — reading the result

On verified requests, `req.agentVisa` is populated:

```ts
app.post('/api/action', (req, res) => {
  const av = req.agentVisa!;
  console.log(av.verified);          // true
  console.log(av.result.plan);       // "basic" | "pro"
  console.log(av.result.valid);      // true
  console.log(av.result.verified_at); // ISO timestamp
  console.log(av.result.web_bot_auth_bound); // true if RFC 9421 bound (Pro)
});
```

In `'passthrough'` mode, unverified requests also reach your handler:

```ts
app.use(agentVisa({ widgetId, apiKey, onUnverified: 'passthrough' }));

app.get('/api/data', (req, res) => {
  if (!req.agentVisa?.verified) {
    return res.json({ data: publicData, premium: null });
  }
  res.json({ data: publicData, premium: premiumData });
});
```

## Next.js — reading the result

On the edge or in a route handler, read the forwarded headers:

```ts
// app/api/route.ts
export async function POST(request: Request) {
  const verified = request.headers.get('x-agentvisa-verified') === 'true';
  const reason   = request.headers.get('x-agentvisa-reason');

  if (!verified) {
    return Response.json({ error: reason }, { status: 401 });
  }
  // Proceed
}
```

## Response shape from `/v1/verify`

```json
{
  "valid": true,
  "reason": "ok",
  "plan": "basic",
  "widget_id": "wgt_abc123",
  "verified_at": "2026-06-22T10:00:00Z",
  "expires_at": "2026-06-23T10:00:00Z",
  "domain_verified": true
}
```

Pro plan additionally returns `age_over_18`, `age_over_21`, `multiple_agents_authorized`, `web_bot_auth_bound`, and AVS-style attribute confirmations. Raw PII (name, email, phone) is never returned.

## Development

```bash
npm install
npm run build
```

Build output is in `dist/`:
- `dist/express/index.js` — Express middleware
- `dist/next/index.js` — Next.js middleware
- `dist/core.js` — Shared verification logic
- TypeScript declarations alongside each `.js` file

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT © [AgentVisa](https://agentvisa.ai)
