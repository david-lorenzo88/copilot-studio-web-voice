// api/src/functions/tokens.js, exercised without the Functions host:
// @azure/functions is swapped for a stub that captures the two handlers,
// and fetch is stubbed so nothing leaves the machine.
import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const routes = new Map();
const stub = { app: { http: (_name, opts) => routes.set(opts.route, opts) } };
const load = Module._load;
Module._load = (req, ...rest) => (req === "@azure/functions" ? stub : load(req, ...rest));

createRequire(import.meta.url)(
  resolve(dirname(fileURLToPath(import.meta.url)), "../api/src/functions/tokens.js"));

const ctx = () => ({ error: () => {}, log: () => {}, warn: () => {} });

/** Run a route with an exact environment and a scripted upstream. */
async function call(route, env, upstream) {
  const seen = [];
  const realFetch = globalThis.fetch;
  const realEnv = process.env;
  globalThis.fetch = async (url, init) => { seen.push({ url: String(url), init }); return upstream(String(url)); };
  process.env = { ...env };
  try {
    return { res: await routes.get(route).handler({}, ctx()), seen };
  } finally {
    globalThis.fetch = realFetch;
    process.env = realEnv;
  }
}

const ok = body => async () => new Response(body, { status: 200 });
const status = code => async () => new Response("", { status: code });
const unreachable = () => { throw new TypeError("fetch failed"); };

test("both routes are registered", () => {
  assert.deepEqual([...routes.keys()].sort(), ["directline/token", "speech/token"]);
});

test("directline: swaps the secret for a token, and never returns the secret", async () => {
  const { res, seen } = await call("directline/token", { DIRECTLINE_SECRET: "s3cr3t" },
    ok(JSON.stringify({ conversationId: "c1", token: "DL", expires_in: 1800 })));
  assert.equal(seen[0].url, "https://directline.botframework.com/v3/directline/tokens/generate");
  assert.equal(seen[0].init.headers.Authorization, "Bearer s3cr3t");
  assert.deepEqual(res.jsonBody, { conversationId: "c1", token: "DL", expires_in: 1800 });
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.doesNotMatch(JSON.stringify(res), /s3cr3t/);
});

test("speech: issueToken takes the KEY header, not Authorization", async () => {
  const { res, seen } = await call("speech/token",
    { SPEECH_KEY: "k3y", SPEECH_REGION: "swedencentral" }, ok("JWT"));
  assert.equal(seen[0].url, "https://swedencentral.api.cognitive.microsoft.com/sts/v1.0/issueToken");
  assert.equal(seen[0].init.headers["Ocp-Apim-Subscription-Key"], "k3y");
  assert.equal(seen[0].init.headers.Authorization, undefined);
  // 540 not 600: the page refreshes a minute before the token really dies
  assert.deepEqual(res.jsonBody, { token: "JWT", region: "swedencentral", expires_in: 540 });
  assert.doesNotMatch(JSON.stringify(res), /k3y/);
});

test("a rejected secret or key is passed through, not swallowed", async () => {
  for (const [route, env, code] of [
    ["directline/token", { DIRECTLINE_SECRET: "wrong" }, 403],
    ["speech/token", { SPEECH_KEY: "wrong", SPEECH_REGION: "swedencentral" }, 401]
  ]) {
    const { res } = await call(route, env, status(code));
    assert.equal(res.status, code);
    assert.match(res.jsonBody.error, /_token_failed$/);
  }
});

test("a missing setting names itself instead of throwing a bare 500", async () => {
  const a = await call("directline/token", {}, unreachable);
  assert.equal(a.res.status, 500);
  assert.deepEqual(a.res.jsonBody, { error: "missing_setting", missing: ["DIRECTLINE_SECRET"] });
  assert.equal(a.seen.length, 0, "must not call upstream with an undefined secret");

  const b = await call("speech/token", {}, unreachable);
  assert.deepEqual(b.res.jsonBody.missing, ["SPEECH_KEY", "SPEECH_REGION"]);
  assert.equal(b.seen.length, 0, "must not resolve https://undefined.api.cognitive.microsoft.com");
});

test("an unreachable upstream is a 502, not an unhandled throw", async () => {
  const a = await call("directline/token", { DIRECTLINE_SECRET: "s" }, unreachable);
  assert.equal(a.res.status, 502);
  const b = await call("speech/token", { SPEECH_KEY: "k", SPEECH_REGION: "nowhere" }, unreachable);
  assert.equal(b.res.status, 502);
});
