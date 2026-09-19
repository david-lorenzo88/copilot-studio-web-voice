# Tests

For whoever maintains this repo — **attendees do not need any of this.**

They check the lab still works without a Copilot Studio agent, an Azure Speech
resource or a microphone: the Direct Line service and the Speech SDK are
replaced by fakes, and the page runs in a real browser against them. So they
catch our bugs, not Microsoft's.

```bash
npm install --prefix test          # once: playwright + ws
npx --prefix test playwright install chromium
npm test
```

| File | What it covers |
|---|---|
| `api.test.mjs` | Both token routes: the right header to the right URL, the response shape, upstream failures, and a missing setting |
| `page.test.mjs` | The page end to end: connect, greeting, text chat, the voice loop, `speakable()`, language detection, barge-in, and the failure modes |
| `server.mjs` | Static files + fake token routes + a fake Direct Line v3 service (HTTP and WebSocket) |
| `fake-speech.js` | Stands in for `vendor/speech.js`; the test drives what is "heard" and records what is "said" |

`page.test.mjs` maps onto the ten spoken utterances in the README, so a failure
there names the utterance that would fail in the room.
