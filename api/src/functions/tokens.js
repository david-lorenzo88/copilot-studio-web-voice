const { app } = require("@azure/functions");

// POST /api/directline/token -> { conversationId, token, expires_in }
// The Direct Line SECRET stays here. The browser gets a token that
// works for one conversation and expires in 30 minutes.
app.http("directlineToken", {
  route: "directline/token",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: async () => {
    const r = await fetch(
      "https://directline.botframework.com/v3/directline/tokens/generate",
      { method: "POST",
        headers: { Authorization: `Bearer ${process.env.DIRECTLINE_SECRET}` } });
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
  handler: async () => {
    const { SPEECH_KEY, SPEECH_REGION } = process.env;
    const r = await fetch(
      `https://${SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      { method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": SPEECH_KEY, "Content-Length": "0" } });
    if (!r.ok) return { status: r.status, jsonBody: { error: "speech_token_failed" } };
    return {
      jsonBody: { token: await r.text(), region: SPEECH_REGION, expires_in: 540 },
      headers: { "Cache-Control": "no-store" }
    };
  }
});
