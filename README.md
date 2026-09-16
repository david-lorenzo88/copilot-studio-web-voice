# Copilot Studio on the web, with a voice

**Baltic Summit 2026 · Talk to the Future · Lab 6 (Scenario E)**
Samir Makwana · David Lorenzo López

A Copilot Studio agent on your own web page over **Direct Line**, with **speech to text** and **text to speech** from **Azure AI Speech**, all in the browser. No framework and no build step.

This is the finished code for Lab 6, the self-paced take-home. The lab guide (`06_Lab6_CopilotStudio_WebVoice.html`) walks through every line.

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
| `index.html`, `style.css` | The page: a status line, a chat area, a text box and a mic button |
| `app.js` | Everything the lab builds, in order: Direct Line chat → ears → mouth → speakable text → voice loop → barge-in |
| `api/src/functions/tokens.js` | Two Azure Functions routes that swap your secrets for tokens |
| `api/local.settings.json.example` | The three settings you need |
| `package.json`, `scripts/copy-vendor.mjs` | `npm install` fetches the two browser SDKs and copies them into `vendor/`. No CDN and no bundler |
| `agent/instructions.txt` | The agent instructions for Copilot Studio |
| `knowledge/b_desk.md` | The Amber Line knowledge file (Scenario B) to upload to the agent |

---

## Before you start

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

## The settings worth touching

| Where | Setting | Default here |
|---|---|---|
| `app.js` → `speechConfig()` | `Speech_SegmentationSilenceTimeoutMs`: how much silence ends a phrase (100–5000) | `800` |
| `app.js` → `LANGS` | Candidate languages for detection (at most four) | `en-US`, `pl-PL` |
| `app.js` → `VOICES` | One neural voice per language | `en-US-AvaMultilingualNeural`, `pl-PL-AgnieszkaNeural` |
| `app.js` → `speakInterruptibly()` | Words heard before the agent stops talking | `2` |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "DirectLine is not a constructor" | The bundle exposes a namespace: `new DirectLine.DirectLine({ token })` |
| Status says "failed to connect" | The token route failed. Run the `curl` above |
| 401/403 from a token route | Wrong or regenerated secret or key; key and region from different resources |
| No microphone prompt | Use `localhost`, not your IP address |
| No audio | Start from the Mic button: browsers block audio before a click |
| `DirectLine is not defined` | `vendor/` is empty. Run `npm install` in the repo root |
| Polish transcribed as English | `pl-PL` is missing from `LANGS` |
| It interrupts itself | Headset |

---

## Before this goes anywhere public

The token routes are anonymous, which is fine on your laptop and not fine on the internet. Put them behind your site's sign-in or a rate limit. For the Speech resource, prefer Entra ID over a key.

## Sources

- [Configure web and Direct Line channel security](https://learn.microsoft.com/microsoft-copilot-studio/configure-web-security)
- [How to recognize speech (timeouts)](https://learn.microsoft.com/azure/ai-services/speech-service/how-to-recognize-speech)
- [Language identification](https://learn.microsoft.com/azure/ai-services/speech-service/language-identification)
- [Authenticate requests to Azure AI services](https://learn.microsoft.com/azure/ai-services/authentication)
- [Direct Line JavaScript SDK](https://github.com/microsoft/BotFramework-DirectLineJS)

All organisations in the knowledge file are fictional. Verified against Microsoft Learn in September 2026.
