# Copilot Studio on the web, with a voice

**Baltic Summit 2026 · Talk to the Future · Lab 6 (Scenario E)**
Samir Makwana · David Lorenzo López

A Copilot Studio agent on your own web page over **Direct Line**, with **speech to text** and **text to speech** from **Azure AI Speech**, all in the browser. No framework and no build step.

This is the finished code for Lab 6, the self-paced take-home. **You are meant to type it out,**
not clone it: the lab guide in this repo — [`06_Lab6_CopilotStudio_WebVoice.html`](06_Lab6_CopilotStudio_WebVoice.html)
— prints every file in full, in the order you create them, each with a Copy button. This repo is
the same code, for falling back on and for diffing against afterwards.

The two cannot drift apart. `test/guide.test.mjs` pulls the listings out of that HTML and fails if
any of them stops matching the file it builds — including pasting the seven `app.js` parts in
order and comparing the result, byte for byte, with `app.js`.

---

## The picture

```
          Your web app  (/api/directline/token · /api/speech/token)
                 │  two short-lived tokens
                 ▼
Azure AI Speech ◄──── Browser ────► Direct Line ────► Copilot Studio agent
 speech to text  ①   mic · page   ②                     (standard, not Real-time)
 text to speech  ③
```

Three hops: speech to text, the agent, text to speech. The audio never touches your server, and no secret ever reaches the browser.

| Secret | Stays in | The browser gets |
|---|---|---|
| Direct Line secret | `api/` settings | a token for one conversation, 30 minutes. The SDK refreshes it every 15. |
| Speech key | `api/` settings | a Speech token, valid 10 minutes, refreshed by `app.js` |

---

## What is in here

| Path | What it is |
|---|---|
| `06_Lab6_CopilotStudio_WebVoice.html` | The lab guide. The source of truth — every file below is printed in it |
| `index.html`, `style.css` | The page: a status line, a chat area, a text box and a mic button |
| `app.js` | Everything the lab builds, in order: Direct Line chat → ears → mouth → speakable text → voice loop → barge-in |
| `api/src/functions/tokens.js` | Two Azure Functions routes that swap your secrets for tokens |
| `api/local.settings.json.example` | The three settings you need |
| `package.json`, `scripts/copy-vendor.mjs` | `npm install` fetches the two browser SDKs and copies them into `vendor/`. No CDN and no bundler |
| `agent/instructions.txt` | The agent instructions for Copilot Studio |
| `test/` | Maintainer tests — the page in a real browser against a fake Direct Line service and a fake Speech SDK. Attendees can ignore this folder |
| `knowledge/b_desk.md` | The Amber Line knowledge file (Scenario B) to upload to the agent |

---

## Before you start

About **90 minutes** if the prerequisites are done, and closer to two hours if this is your
first Copilot Studio agent. It is built to be put down: the end of step 3 leaves you with text
chat working on your own page, and the end of step 6 with a working voice loop. The guide
carries the per-step budget.

- A Power Platform environment with **Copilot Studio**. A trial is fine.
- An **Azure AI Speech** resource (or a Foundry resource, which includes Speech), with its key and region.
- **Node.js** (current LTS), **Azure Functions Core Tools v4**, and the **Static Web Apps CLI**:
  `npm install -g @azure/static-web-apps-cli`
- A **headset**. Barge-in does not work with open speakers: the page hears the agent and interrupts itself.

---

## Run it

### 1 · Build the agent (ten minutes)

1. Copilot Studio → **Create** → **New agent**.
2. **Knowledge** → upload `knowledge/b_desk.md`.
3. Paste `agent/instructions.txt` into **Instructions**.
4. Test once in the test pane, then **Publish**.

> Do **not** switch this agent to Real-time. That choice cannot be undone, and this lab needs a standard agent: the voice lives on the page.

### 2 · Add your secrets

```bash
cp api/local.settings.json.example api/local.settings.json
```

| Setting | Where it is |
|---|---|
| `DIRECTLINE_SECRET` | Copilot Studio → Settings → Security → Web channel security → Secret 1 |
| `SPEECH_KEY` | Azure portal → your Speech/Foundry resource → Keys and Endpoint |
| `SPEECH_REGION` | Same blade, lower case, e.g. `swedencentral` |

`api/local.settings.json` is git-ignored. Keep it that way.

### 3 · Start it

```bash
npm install                  # also copies the two SDKs into vendor/
cd api && npm install && cd ..
npm start                    # swa start . --api-location api
```

Check the server half on its own first:

```bash
curl -X POST http://localhost:4280/api/directline/token
curl -X POST http://localhost:4280/api/speech/token
```

Then open **http://localhost:4280**. Type a question first, then press **Mic**.

If a route is unhappy it says which setting to look at, and the page prints the
same line in orange rather than sitting on "connecting…".

---

## Test it: ten utterances, out loud

| # | Say this | It passes when… |
|---|---|---|
| 1 | "What time is the morning ferry to Karlskrona?" | One short spoken answer, the same text on screen |
| 2 | "Tell me everything about travelling with a pet." | Two sentences spoken, then "the rest is on your screen" |
| 3 | "Czy mogę zabrać psa na prom?" | It hears Polish and answers in a Polish voice |
| 4 | "How do I get to PPNT from Gdynia Główna?" | The `HEARD` line in the console gets the place names right |
| 5 | "My booking reference is A L six six two four." | `HEARD` is right, and the agent says it cannot look it up |
| 6 | "I have a motorhome... about seven metres... is that a problem?" | It waits through the pauses |
| 7 | "Compare the cabin types for me." | No pipes or asterisks read aloud |
| 8 | "Where can I read more about the pet rules?" | No URL and no `[1]` read aloud |
| 9 | "Tell me about bringing a car on board." | Interrupt it after two seconds with #10 |
| 10 | "Actually — how long is the crossing?" | It stops, and answers this instead |

---

## Checking it without Azure

The tests replace Direct Line and the Speech SDK with fakes and drive the page
in a real browser, so they run with no agent, no Speech resource, no key and no
microphone. Worth doing before you present, and after any edit to `app.js`.

```bash
npm install --prefix test                       # once
npx --prefix test playwright install chromium   # once
npm test
```

They cover both token routes and the ten spoken utterances above, plus the
failures people actually hit: a wrong secret, a missing setting, silence, and a
two-message reply. Each case was checked to fail without the code that fixes it.

---

## The settings worth touching

| Where | Setting | Default here |
|---|---|---|
| `app.js` → `speechConfig()` | `Speech_SegmentationSilenceTimeoutMs`: how much silence ends a phrase (100–5000) | `800` |
| `app.js` → `LANGS` | Candidate languages for detection (at most four) | `en-US`, `pl-PL` |
| `app.js` → `VOICES` | One neural voice per language | `en-US-AvaMultilingualNeural`, `pl-PL-AgnieszkaNeural` |
| `app.js` → `speakInterruptibly()` | Words heard before the agent stops talking | `2` |
| `app.js` → `REPLY_GRACE_MS` | How long a second message may take to arrive before the mic reopens. Short on purpose: this sits between the agent finishing and the microphone opening | `250` |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "DirectLine is not a constructor" | The bundle exposes a namespace: `new DirectLine.DirectLine({ token })` |
| Status says "not connected", with an orange error line | Read the line — it names the route, the status code and the setting to check |
| `{"error":"missing_setting","missing":[…]}` from a route | `api/local.settings.json` is absent or incomplete. Copy the example and fill in all three |
| Status says "failed to connect" | The token arrived but Direct Line refused it, or a WebSocket is blocked on this network |
| 401/403 from a token route | Wrong or regenerated secret or key; key and region from different resources |
| No microphone prompt | Use `localhost`, not your IP address |
| No audio | Start from the Mic button: browsers block audio before a click |
| `DirectLine is not defined` | `vendor/` is empty. Run `npm install` in the repo root |
| Polish transcribed as English | `pl-PL` is missing from `LANGS` |
| It interrupts itself | Headset |
| "voice stopped" with an orange line naming `SPEECH_KEY` | The Speech token route refused. Key and region must come from the same Keys and Endpoint blade |
| You hear "let me check…" and then the answer | Expected. Copilot Studio answered in two messages; the page speaks both rather than losing the second. If the answer lands more than a second or so after the filler it is shown but not spoken — add "Answer in a single message" to the agent instructions |

---

## What changed after the first run-through

The guide and this repo were rebuilt together around five failures, each one something the guide
already warned about in a WATCH OUT or a troubleshooting row but that the code did not actually
handle. Kept here because the reasoning is worth more than the diff.

| What was wrong | Why it mattered |
|---|---|
| A failed `/api/directline/token` threw out of the module's top-level `await` | Module evaluation stopped there, so the mic button and the text box were never wired up. A wrong secret gave you a page stuck on "connecting…" that did nothing at all, silently. Every failure now names the setting behind it |
| Only the first of two messages was spoken | Copilot Studio answers some questions with a filler and then the answer; the answer was never spoken, only shown. Later messages are queued and spoken in order — queueing costs nothing on the usual single-message reply, where a settle window would tax every turn |
| A failed `/api/speech/token` said "did not catch that - press the mic" | It sent you to look at the microphone when the problem was `SPEECH_KEY` |
| `speakable()` missed a pipe left inline with prose | The line-based table strip only catches a row that starts *and* ends with `\|` |
| The token routes called out with undefined settings | A missing `SPEECH_REGION` resolved `https://undefined.api.cognitive.microsoft.com` and reached the browser as a bare 500 |

The mic button also reads **Stop** while the loop runs, because the loop is a toggle and nothing on
the page said whether it was on.

## Before this goes anywhere public

The token routes are anonymous, which is fine on your laptop and not fine on the internet. Put them behind your site's sign-in or a rate limit. For the Speech resource, prefer Entra ID over a key.

## Sources

- [Configure web and Direct Line channel security](https://learn.microsoft.com/microsoft-copilot-studio/configure-web-security)
- [How to recognize speech (timeouts)](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)
- [Language identification](https://learn.microsoft.com/azure/ai-services/speech-service/language-identification)
- [Authenticate requests to Azure AI services](https://learn.microsoft.com/azure/ai-services/authentication)
- [Direct Line JavaScript SDK](https://github.com/microsoft/BotFramework-DirectLineJS)

All organisations in the knowledge file are fictional. Verified against Microsoft Learn in September 2026.
