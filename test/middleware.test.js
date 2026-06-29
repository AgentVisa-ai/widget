/**
 * AgentVisa middleware — automated gate-logic tests.
 *
 * Runs against the built `dist/` (the artifact we actually publish), using
 * Node's built-in test runner (`node:test`) and a stubbed `globalThis.fetch`
 * so NO real token, widget, API key, or network access is required.
 *
 *   npm test        # builds dist, then runs this suite
 *   node --test     # run against existing dist
 *
 * What this proves:
 *   - VALID token  -> the gate steps aside (Express calls next(); Next emits
 *                     the `x-middleware-next` continue signal). This is the
 *                     "verified agent can navigate the site" path.
 *   - NO token     -> blocked (401) / redirected (302), never served.
 *   - INVALID token-> blocked, never served.
 *   - passthrough / redirect modes behave per config.
 *   - core helpers (isLikelyAiAgent, callVerify) behave correctly.
 *
 * NOTE: this validates the middleware LOGIC against a mocked verify endpoint.
 * The live end-to-end handshake against api.agentvisa.ai with a real
 * av_/tmp_ token is a separate, still-required pre-launch step
 * (see LAUNCH_READINESS.md).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { agentVisa } from "../dist/express/index.js";
import { withAgentVisa } from "../dist/next/index.js";
import { isLikelyAiAgent, callVerify, resolveConfig } from "../dist/core.js";

const CFG = { widgetId: "wgt_test123", apiKey: "wk_test123" };

// ── fetch stubbing ──────────────────────────────────────────────────────────
const realFetch = globalThis.fetch;

/** Make globalThis.fetch return a canned JSON body, and record the call. */
function stubFetch(jsonBody, { throwError = false } = {}) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (throwError) throw new Error("network down");
    return { json: async () => jsonBody };
  };
  return calls;
}
function restoreFetch() {
  globalThis.fetch = realFetch;
}

// ── Express test doubles ─────────────────────────────────────────────────────
function makeReq(headers = {}) {
  return { headers };
}
function makeRes() {
  const rec = { statusCode: null, body: null, headers: {}, contentType: null, sent: false };
  const res = {
    status(code) { rec.statusCode = code; return res; },
    json(body) { rec.body = body; rec.sent = true; },
    type(ct) { rec.contentType = ct; return res; },
    send(body) { rec.body = body; rec.sent = true; },
    setHeader(name, value) { rec.headers[name] = value; },
  };
  return { res, rec };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS
// ─────────────────────────────────────────────────────────────────────────────

test("express: VALID token → next() called, request served, not blocked", async () => {
  const calls = stubFetch({ valid: true, plan: "free", member_since: "2026-01" });
  try {
    const mw = agentVisa(CFG);
    const req = makeReq({ "x-agentvisa-token": "tmp_good" });
    const { res, rec } = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true, "next() must be called so the route handler runs");
    assert.equal(rec.sent, false, "middleware must NOT send a response on success");
    assert.equal(rec.statusCode, null, "no block status on success");
    assert.equal(req.agentVisa.verified, true);
    assert.equal(req.agentVisa.result.valid, true);
    // verify it actually called /v1/verify with the API key + token + widget_id
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/v1\/verify$/);
    assert.equal(calls[0].opts.headers["X-Widget-Api-Key"], CFG.apiKey);
    const body = JSON.parse(calls[0].opts.body);
    assert.equal(body.token, "tmp_good");
    assert.equal(body.widget_id, CFG.widgetId);
  } finally {
    restoreFetch();
  }
});

test("express: NO token (block mode) → 401, next() NOT called, no verify call", async () => {
  const calls = stubFetch({ valid: true }); // should never be hit
  try {
    const mw = agentVisa({ ...CFG, onUnverified: "block" });
    const req = makeReq({});
    const { res, rec } = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(rec.statusCode, 401);
    assert.equal(rec.body.error, "agentvisa_required");
    assert.equal(rec.body.reason, "no_token");
    assert.equal(rec.headers["X-AgentVisa-Required"], CFG.widgetId);
    assert.equal(calls.length, 0, "must not call verify when there is no token");
  } finally {
    restoreFetch();
  }
});

test("express: INVALID token (block mode) → 401, next() NOT called", async () => {
  stubFetch({ valid: false, reason: "expired" });
  try {
    const mw = agentVisa({ ...CFG, onUnverified: "block" });
    const req = makeReq({ "x-agentvisa-token": "tmp_bad" });
    const { res, rec } = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(rec.statusCode, 401);
    assert.equal(rec.body.error, "agentvisa_verification_failed");
    assert.equal(rec.body.reason, "expired");
  } finally {
    restoreFetch();
  }
});

test("express: passthrough mode → next() called even when unverified", async () => {
  stubFetch({ valid: false, reason: "expired" });
  try {
    const mw = agentVisa({ ...CFG, onUnverified: "passthrough" });
    const req = makeReq({ "x-agentvisa-token": "tmp_bad" });
    const { res, rec } = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(rec.sent, false);
    assert.equal(req.agentVisa.verified, false);
    assert.equal(req.agentVisa.reason, "expired");
  } finally {
    restoreFetch();
  }
});

test("express: redirect mode + AI user-agent, no token → 302 with Location", async () => {
  const mw = agentVisa({ ...CFG, onUnverified: "redirect" });
  const req = makeReq({ "user-agent": "ChatGPT-User/1.0 (+https://openai.com/bot)" });
  const { res, rec } = makeRes();
  let nextCalled = false;
  await mw(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(rec.statusCode, 302);
  assert.ok(rec.headers["Location"], "Location header must be set for redirect");
  assert.match(rec.headers["Location"], /agentvisa\.ai\/verify/);
});

test("express: DEFAULT mode is redirect — agent with no token is redirected (302), not served", async () => {
  // Pin the default: resolveConfig() defaults onUnverified to "redirect".
  const mw = agentVisa(CFG); // no onUnverified specified
  const req = makeReq({ "user-agent": "GPT-4 agent", "accept": "application/json" });
  const { res, rec } = makeRes();
  let nextCalled = false;
  await mw(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false, "unverified request must never reach the route handler");
  assert.equal(rec.statusCode, 302);
  assert.match(rec.headers["Location"], /agentvisa\.ai\/verify/);
});

test("express: Web Bot Auth header (AgentVisa-Assertion) is accepted as the token", async () => {
  const calls = stubFetch({ valid: true });
  try {
    const mw = agentVisa(CFG);
    const req = makeReq({ "agentvisa-assertion": "tmp_assert" });
    const { res } = makeRes();
    let nextCalled = false;
    await mw(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(JSON.parse(calls[0].opts.body).token, "tmp_assert");
  } finally {
    restoreFetch();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// NEXT.JS
// ─────────────────────────────────────────────────────────────────────────────

function nextReq(headers = {}) {
  return new Request("https://shop.example.com/account", { headers });
}

test("next: VALID token → continue signal (x-middleware-next), verified header", async () => {
  stubFetch({ valid: true });
  try {
    const mw = withAgentVisa(CFG);
    const resp = await mw(nextReq({ "x-agentvisa-token": "tmp_good" }));

    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get("x-middleware-next"), "1", "must signal Next to continue to the route");
    assert.equal(resp.headers.get("x-agentvisa-verified"), "true");
  } finally {
    restoreFetch();
  }
});

test("next: VALID token + custom handler → handler runs only when verified", async () => {
  stubFetch({ valid: true });
  try {
    let handlerRan = false;
    const mw = withAgentVisa(CFG, async () => {
      handlerRan = true;
      return new Response("secret", { status: 200 });
    });
    const resp = await mw(nextReq({ "x-agentvisa-token": "tmp_good" }));

    assert.equal(handlerRan, true);
    assert.equal(await resp.text(), "secret");
  } finally {
    restoreFetch();
  }
});

test("next: NO token (block mode) → 401 agentvisa_required", async () => {
  const calls = stubFetch({ valid: true });
  try {
    const mw = withAgentVisa({ ...CFG, onUnverified: "block" });
    const resp = await mw(nextReq({}));
    assert.equal(resp.status, 401);
    const body = await resp.json();
    assert.equal(body.error, "agentvisa_required");
    assert.equal(calls.length, 0);
  } finally {
    restoreFetch();
  }
});

test("next: INVALID token (block mode) → 401 verification_failed", async () => {
  stubFetch({ valid: false, reason: "revoked" });
  try {
    const mw = withAgentVisa({ ...CFG, onUnverified: "block" });
    const resp = await mw(nextReq({ "x-agentvisa-token": "tmp_bad" }));
    assert.equal(resp.status, 401);
    const body = await resp.json();
    assert.equal(body.error, "agentvisa_verification_failed");
    assert.equal(body.reason, "revoked");
  } finally {
    restoreFetch();
  }
});

test("next: redirect mode + AI user-agent, no token → 302 with Location", async () => {
  const mw = withAgentVisa({ ...CFG, onUnverified: "redirect" });
  const resp = await mw(nextReq({ "user-agent": "claude-web/1.0 anthropic-ai bot" }));
  assert.equal(resp.status, 302);
  assert.match(resp.headers.get("Location") ?? "", /agentvisa\.ai\/verify/);
});

// ─────────────────────────────────────────────────────────────────────────────
// CORE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

test("core: isLikelyAiAgent detects known agents and headless drivers", () => {
  assert.equal(isLikelyAiAgent({ "user-agent": "ChatGPT-User/1.0" }), true);
  assert.equal(isLikelyAiAgent({ "user-agent": "Mozilla/5.0 (compatible; HeadlessChrome/120)" }), true);
  assert.equal(isLikelyAiAgent({ "user-agent": "python-httpx/0.27" }), true);
  // a plain consumer browser should NOT be treated as an agent.
  // Real browsers send sec-fetch-* / sec-ch-ua and Accept: text/html, which
  // defeats both the UA pattern check and the weak-combo heuristic.
  assert.equal(
    isLikelyAiAgent({
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "sec-fetch-mode": "navigate",
      "sec-ch-ua": '"Chromium";v="124"',
    }),
    false,
  );
});

test("core: callVerify returns network_error (fail-safe) when fetch throws", async () => {
  stubFetch({ valid: true }, { throwError: true });
  try {
    const result = await callVerify("tmp_x", resolveConfig(CFG));
    assert.equal(result.valid, false);
    assert.equal(result.reason, "network_error");
  } finally {
    restoreFetch();
  }
});

test("core: callVerify passes the API key and returns the parsed verify result", async () => {
  const calls = stubFetch({ valid: true, plan: "pro" });
  try {
    const result = await callVerify("tmp_ok", resolveConfig(CFG));
    assert.equal(result.valid, true);
    assert.equal(result.plan, "pro");
    assert.equal(calls[0].opts.headers["X-Widget-Api-Key"], CFG.apiKey);
  } finally {
    restoreFetch();
  }
});
