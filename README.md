# @agentvisa/widget

Lightweight JavaScript/TypeScript widget for **AgentVisa** verification.

Drop-in verification for websites that need to confirm a real human has approved an AI agent's action.

## Features

- Works with both **Basic** and **Pro** tiers
- Unified response shape for all plans
- Zero runtime dependencies
- < 5KB gzipped
- TypeScript support

## Installation

```bash
npm install @agentvisa/widget
```

Or via CDN:

```html
<script src="https://cdn.agentvisa.ai/widget.js"></script>
```

## Usage

### Basic Usage (Recommended)

```ts
import { AgentVisa } from "@agentvisa/widget";

const result = await AgentVisa.verify({
  widgetId: "widget_abc123",
  plan: "basic"
});

console.log(result.valid);     // true | false
console.log(result.reason);    // "ok" | "expired" | "invalid" ...
console.log(result.plan);      // "basic" | "pro"
```

### Instance Usage

```ts
const visa = new AgentVisa({
  widgetId: "widget_abc123",
  plan: "pro"
});

const result = await visa.verify();
```

### Browser (UMD)

```html
<script src="https://cdn.agentvisa.ai/widget.js"></script>
<script>
  const result = await AgentVisa.verify({
    widgetId: "widget_abc123",
    plan: "basic"
  });
</script>
```

## Response Shape

The widget always returns the unified response:

```json
{
  "valid": true,
  "reason": "ok",
  "plan": "basic",
  "widget_id": "widget_abc123",
  "human_name": null,
  "email": null,
  "phone": null,
  "verified_at": null,
  "expires_at": null
}
```

## Configuration

| Option       | Type               | Default                  | Description                     |
|--------------|--------------------|--------------------------|---------------------------------|
| `widgetId`   | `string`           | **required**             | Your AgentVisa widget ID        |
| `plan`       | `"basic" \| "pro"` | `"basic"`                | Verification tier               |
| `apiBaseUrl` | `string`           | `"https://api.agentvisa.ai"` | Backend API base URL        |

## Development

```bash
npm install
npm run build
```

Build output is in `dist/`:

- `widget.js` — UMD bundle (browser)
- `widget.esm.js` — ESM bundle
- `index.d.ts` — TypeScript definitions

## Examples

See the `examples/` folder:

- `basic.html` — Basic tier demo
- `pro.html` — Pro tier demo with richer data

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT © [AgentVisa](https://agentvisa.ai)