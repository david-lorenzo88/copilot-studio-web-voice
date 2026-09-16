// Baltic Summit 2026 · Talk to the Future · Lab 6 (Scenario E)
// A Copilot Studio agent on your own page over Direct Line,
// with speech to text and text to speech from Azure AI Speech.
// The browser never holds a secret: both tokens come from /api.

// ---------- part 1 · text chat over Direct Line (Lab 6 step 3) ----------
const chat = document.getElementById("chat");
const statusEl = document.getElementById("status");
const USER = { id: "web-user", name: "Guest" };

function bubble(who, text) {
  const d = document.createElement("div");
  d.className = who;
  d.textContent = `${who}: ${text}`;
  chat.appendChild(d);
}

// 1. a short-lived token from YOUR server - never the secret
const { token } = await (await fetch("/api/directline/token",
                                     { method: "POST" })).json();

// 2. the SDK opens the conversation (WebSocket by default)
//    NOTE: the bundle exposes a namespace, so it is DirectLine.DirectLine
const dl = new DirectLine.DirectLine({ token });

// 3. connection state: 0 uninitialised ... 2 online ... 5 ended
const STATES = ["uninitialised", "connecting", "online",
                "token expired", "failed to connect", "ended"];
dl.connectionStatus$.subscribe(s => { statusEl.textContent = STATES[s]; });

// 4. every activity arrives here - including your own messages
dl.activity$.subscribe(
  a => {
    if (a.from.id === USER.id) return;               // your echo
    if (a.type === "message" && a.text) onAgentReply(a.text);
  },
  err => bubble("error", `connection: ${err.message || err}`)
);

// 5. ask Copilot Studio to run its greeting topic
dl.postActivity({ from: USER, type: "event", name: "startConversation" })
  .subscribe({ error: e => console.warn("greeting failed", e) });

// 6. send what the user typed
function send(text) {
  bubble("you", text);
  dl.postActivity({ from: USER, type: "message", text })
    .subscribe({ error: e => bubble("error", e.message) });
}

document.getElementById("compose").addEventListener("submit", e => {
  e.preventDefault();
  const box = document.getElementById("text");
  if (box.value.trim()) send(box.value.trim());
  box.value = "";
});

// ---------- part 2 · ears: speech to text (Lab 6 step 4) ----------
let speechToken = "", speechRegion = "", speechExpiry = 0;

async function speechConfig() {
  if (Date.now() > speechExpiry) {            // tokens last 10 minutes
    const r = await (await fetch("/api/speech/token",
                                 { method: "POST" })).json();
    speechToken = r.token;
    speechRegion = r.region;
    speechExpiry = Date.now() + r.expires_in * 1000;
  }
  const cfg = SpeechSDK.SpeechConfig.fromAuthorizationToken(
    speechToken, speechRegion);
  // how much silence ends a phrase - the setting you tune in step 4
  cfg.setProperty(SpeechSDK.PropertyId.Speech_SegmentationSilenceTimeoutMs, "800");
  return cfg;
}

// at most FOUR candidates for at-start language detection
const LANGS = SpeechSDK.AutoDetectSourceLanguageConfig
  .fromLanguages(["en-US", "pl-PL"]);

function mic() { return SpeechSDK.AudioConfig.fromDefaultMicrophoneInput(); }

async function listen() {
  const rec = SpeechSDK.SpeechRecognizer.FromConfig(
    await speechConfig(), LANGS, mic());
  return new Promise((resolve, reject) => {
    rec.recognizeOnceAsync(result => {
      rec.close();
      if (result.reason !== SpeechSDK.ResultReason.RecognizedSpeech) {
        return reject(new Error("nothing recognised"));
      }
      const lang = SpeechSDK.AutoDetectSourceLanguageResult
        .fromResult(result).language;
      console.log("HEARD:", lang, result.text);
      resolve({ text: result.text, lang });
    }, err => { rec.close(); reject(new Error(err)); });
  });
}

// ---------- part 3 · mouth: text to speech (Lab 6 step 5) ----------
const VOICES = {
  "en-US": "en-US-AvaMultilingualNeural",
  "pl-PL": "pl-PL-AgnieszkaNeural"
};
let player = null;      // module scope - step 7 needs to pause it
let endSpeech = null;

async function speak(text, lang = "en-US") {
  const cfg = await speechConfig();
  cfg.speechSynthesisVoiceName = VOICES[lang] || VOICES["en-US"];
  player = new SpeechSDK.SpeakerAudioDestination();
  const synth = new SpeechSDK.SpeechSynthesizer(
    cfg, SpeechSDK.AudioConfig.fromSpeakerOutput(player));
  console.log("SAID :", lang, text);
  return new Promise(resolve => {
    endSpeech = resolve;
    player.onAudioEnd = () => { endSpeech = null; resolve(); };
    synth.speakTextAsync(text,
      () => synth.close(),
      err => { synth.close(); console.warn(err); resolve(); });
  });
}

function stopSpeaking() {
  if (player) { player.pause(); player.close(); player = null; }
  if (endSpeech) { endSpeech(); endSpeech = null; }
}

// ---------- part 4 · speakable text (Lab 6 step 6) ----------
// what the screen shows is not what the ear should get
const MORE = {
  "en-US": " The rest is on your screen.",
  "pl-PL": " Resztę widać na ekranie."
};

function speakable(raw, lang = "en-US") {
  const clean = raw
    .replace(/\s*\[\d+\]/g, "")                // reference markers [1]
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")       // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")     // links -> their label
    .replace(/https?:\/\/\S+/g, "")              // bare URLs
    .replace(/^\s*\|.*\|\s*$/gm, "")             // table rows
    .replace(/[*_`#>]+/g, "")                    // markdown symbols
    .replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  const said = sentences.slice(0, 2).map(x => x.trim()).join(" ");
  return sentences.length > 2 ? said + (MORE[lang] || MORE["en-US"]) : said;
}

// ---------- part 5 · the voice loop (Lab 6 step 6) ----------
let voiceOn = false;
let pendingReply = null;

function onAgentReply(text) {
  bubble("agent", text);                      // the screen gets it all
  if (pendingReply) { pendingReply(text); pendingReply = null; }
}

function ask(text) {
  return new Promise(resolve => { pendingReply = resolve; send(text); });
}

document.getElementById("mic").addEventListener("click", () => {
  voiceOn = !voiceOn;                         // the click also unlocks audio
  if (voiceOn) voiceTurn(); else stopSpeaking();
});

// ---------- part 6 · barge-in (Lab 6 step 7) ----------
const wait = ms => new Promise(r => setTimeout(() => r(null), ms));

async function speakInterruptibly(text, lang) {
  // a second recognizer listens WHILE the agent speaks
  const watcher = SpeechSDK.SpeechRecognizer.FromConfig(
    await speechConfig(), LANGS, mic());
  let cut = false;

  watcher.recognizing = (_, e) => {
    // two words, not one - a cough should not stop the agent
    if (!cut && e.result.text.trim().split(/\s+/).length >= 2) {
      cut = true;
      console.log("BARGE-IN");
      stopSpeaking();                         // pause the player NOW
    }
  };
  const said = new Promise(resolve => {
    watcher.recognized = (_, e) => {
      if (e.result.reason !== SpeechSDK.ResultReason.RecognizedSpeech) return;
      const lang = SpeechSDK.AutoDetectSourceLanguageResult
        .fromResult(e.result).language;
      resolve({ text: e.result.text, lang });
    };
  });

  watcher.startContinuousRecognitionAsync();
  await speak(text, lang);
  const next = cut ? await Promise.race([said, wait(4000)]) : null;
  watcher.stopContinuousRecognitionAsync(() => watcher.close());
  return next;          // what the user said over the agent, if anything
}

// the voice loop - an interruption becomes the next question
async function voiceTurn() {
  let next = null;
  while (voiceOn) {
    let heard = next;
    next = null;
    if (!heard) {
      try { heard = await listen(); }
      catch { statusEl.textContent = "did not catch that - press the mic";
              voiceOn = false; break; }
    }
    const reply = await ask(heard.text);
    next = await speakInterruptibly(speakable(reply, heard.lang), heard.lang);
  }
}
