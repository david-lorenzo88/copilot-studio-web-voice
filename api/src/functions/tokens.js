const { app } = require("@azure/functions");

// Both routes swap a secret for a short-lived token and return only the
// token. If a setting is missing, say which one: without this the host
// returns a bare 500 and the page cannot tell you why.
function missing(...names) {
  return names.filter(n => !process.env[n]);
}

// POST /api/directline/token -> { conversationId, token, expires_in }
// The Direct Line SECRET stays here. The browser gets a token that
// works for one conversation and expires in 30 minutes.
app.http("directlineToken", {
  route: "directline/token",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (_request, context) => {
    const absent = missing("DIRECTLINE_SECRET");
    if (absent.length) {
      context.error(`missing setting(s): ${absent.join(", ")}`);
      return { status: 500, jsonBody: { error: "missing_setting", missing: absent } };
    }
    let r;
    try {
      r = await fetch(
        "https://directline.botframework.com/v3/directline/tokens/generate",
        { method: "POST",
          headers: { Authorization: `Bearer ${process.env.DIRECTLINE_SECRET}` } });
    } catch (e) {
      context.error(e);
      return { status: 502, jsonBody: { error: "directline_unreachable" } };
    }
    if (!r.ok) return { status: r.status, jsonBody: { error: "directline_token_failed" } };
    return { jsonBody: await r.json(), headers: { "Cache-Control": "no-store" } };
  }
});

// POST /api/speech/token -> { token, region, expires_in }
// The Speech KEY stays here. The token is valid for 10 minutes;
// we tell the browser 9 so it refreshes early.
app.http("speechToken", {
  route: "speech/token",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async (_request, context) => {
    const absent = missing("SPEECH_KEY", "SPEECH_REGION");
    if (absent.length) {
      context.error(`missing setting(s): ${absent.join(", ")}`);
      return { status: 500, jsonBody: { error: "missing_setting", missing: absent } };
    }
    const { SPEECH_KEY, SPEECH_REGION } = process.env;
    let r;
    try {
      r = await fetch(
        `https://${SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
        { method: "POST",
          headers: { "Ocp-Apim-Subscription-Key": SPEECH_KEY, "Content-Length": "0" } });
    } catch (e) {
      context.error(e);
      return { status: 502, jsonBody: { error: "speech_unreachable", region: SPEECH_REGION } };
    }
    if (!r.ok) return { status: r.status, jsonBody: { error: "speech_token_failed" } };
    return {
      jsonBody: { token: await r.text(), region: SPEECH_REGION, expires_in: 540 },
      headers: { "Cache-Control": "no-store" }
    };
  }
});
