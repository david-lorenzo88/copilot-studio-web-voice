// The page, in a real browser, against a fake Direct Line service and a fake
// Speech SDK. The cases follow the ten spoken utterances in the README, so a
// failure here names the one that would fail in the room.
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { start } from "./server.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FAKE_SPEECH = readFileSync(join(HERE, "fake-speech.js"), "utf8");
const PORT = Number(process.env.TEST_PORT ?? 5610);

let browser, server;
/** The bot's next reply. Each case sets it. */
let reply = () => [];

before(async () => {
  server = await start(PORT, (activity, push) => {
    if (activity.type === "event" && activity.name === "startConversation")
      return push([{ id: "greet", type: "message", from: { id: "bot" }, text: "Welcome to Amber Line." }]);
    if (activity.type !== "message") return;
    reply(activity.text).forEach((m, i) => setTimeout(
      () => push([{ id: `b${Date.now()}${i}`, type: "message", from: { id: "bot" }, text: m.text }]),
      m.delay ?? 0));
  });
  browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
after(async () => { await browser?.close(); await server?.close(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A loaded page with the Speech SDK faked and Direct Line pointed at our server. */
async function open({ routes } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/vendor/speech.js",
    r => r.fulfill({ contentType: "text/javascript", body: FAKE_SPEECH }));
  if (routes) await routes(page);
  await page.route("https://directline.botframework.com/**", async r => {
    const u = new URL(r.request().url());
    await r.fulfill({ response: await r.fetch({ url: `http://127.0.0.1:${PORT}${u.pathname}${u.search}` }) });
  });
  page.errors = errors;
  page.spoken = () => page.evaluate(() => window.__voice.spoken.map(s =>
    ({ text: s.text, voice: s.lang, ended: s.ended, interrupted: s.interrupted })));
  page.lastSpoken = async () => (await page.spoken()).at(-1) ?? {};
  page.bubbles = () => page.$$eval("#chat div", ds => ds.map(d => d.textContent));
  page.listening = () => page.waitForFunction(() => window.__voice.waitingForSpeech(), null, { timeout: 5000 });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  return page;
}

const online = page =>
  page.waitForFunction(() => document.getElementById("status").textContent === "online", null, { timeout: 10000 });

/** Open the page, connect, turn the mic on, and wait to be listening. */
async function openListening() {
  const page = await open();
  await online(page);
  await page.click("#mic");
  await page.listening();
  return page;
}

describe("the page comes up", () => {
  test("connects, greets, and no secret is in the browser", async () => {
    const page = await open();
    await online(page);
    await sleep(400);
    assert.ok(server.posted.some(a => a.type === "event" && a.name === "startConversation"),
      "the greeting topic is never asked for");
    assert.ok((await page.bubbles()).some(t => t.includes("Welcome to Amber Line")));
    const html = await page.content();
    assert.doesNotMatch(html, /DIRECTLINE_SECRET|Ocp-Apim-Subscription-Key/);
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  test("your own message is not echoed twice", async () => {
    const page = await open();
    await online(page);
    reply = () => [{ text: "The 09:00 leaves Gdynia daily." }];
    await page.fill("#text", "What time is the morning ferry?");
    await page.press("#text", "Enter");
    await sleep(500);
    const said = await page.bubbles();
    assert.equal(said.filter(t => t.includes("What time is the morning ferry?")).length, 1);
    assert.equal(said.filter(t => t.includes("09:00 leaves Gdynia")).length, 1);
    await page.close();
  });
});

describe("the ten utterances", () => {
  test("1 · a short answer is spoken as it stands", async () => {
    const page = await openListening();
    reply = () => [{ text: "The morning ferry leaves Gdynia at 09:00." }];
    await page.evaluate(() => window.__voice.say("What time is the morning ferry to Karlskrona?"));
    await sleep(800);
    assert.match((await page.lastSpoken()).text, /09:00/);
    await page.close();
  });

  test("2 · a long answer is cut to two sentences plus the pointer", async () => {
    const page = await openListening();
    reply = () => [{ text: "Dogs and cats travel in pet-friendly cabins. They must be booked in advance. An EU pet passport is required. Assistance dogs travel free." }];
    await page.evaluate(() => window.__voice.say("Tell me everything about travelling with a pet."));
    await sleep(800);
    const { text } = await page.lastSpoken();
    assert.match(text, /The rest is on your screen\.$/);
    assert.equal(text.split(/[.!?]/).filter(s => s.trim()).length, 3, text);
    // the screen still gets all four sentences
    assert.ok((await page.bubbles()).some(t => t.includes("Assistance dogs travel free")));
    await page.close();
  });

  test("3 · Polish in, Polish voice out", async () => {
    const page = await openListening();
    reply = () => [{ text: "Tak, psy mogą podróżować. Kabiny trzeba zarezerwować. Wymagany jest paszport." }];
    await page.evaluate(() => window.__voice.say("Czy mogę zabrać psa na prom?", "pl-PL"));
    await sleep(800);
    const { text, voice } = await page.lastSpoken();
    assert.equal(voice, "pl-PL-AgnieszkaNeural");
    assert.match(text, /Resztę widać na ekranie/);
    await page.close();
  });

  test("7+8 · no table, link, URL or [1] is ever read aloud", async () => {
    const page = await openListening();
    reply = () => [{ text:
      "There are four cabin types [1]. The comparison is below.\n\n| Type | Berths |\n| --- | --- |\n| Deluxe | 2 |\n\n**Cabins are compulsory** on the 21:00. See [the cabin page](https://amber.example/c) or https://amber.example/pets." }];
    await page.evaluate(() => window.__voice.say("Compare the cabin types for me."));
    await sleep(800);
    const { text } = await page.lastSpoken();
    for (const bad of [/\|/, /[*_`#>]/, /https?:\/\//, /\[\d+\]/, /---/]) assert.doesNotMatch(text, bad);
    await page.close();
  });

  test("a pipe left inline with prose is not read aloud either", async () => {
    const page = await openListening();
    reply = () => [{ text: "Prices are | Deluxe | 120 EUR | per cabin. Book early." }];
    await page.evaluate(() => window.__voice.say("How much is a deluxe cabin?"));
    await sleep(800);
    assert.doesNotMatch((await page.lastSpoken()).text, /\|/);
    await page.close();
  });

  test("9+10 · barge-in stops the agent and answers the interruption", async () => {
    const page = await openListening();
    await page.evaluate(() => window.__voice.setSpeakMs(2000));
    reply = () => [{ text: "Cars go on the vehicle deck. Check in sixty minutes before. Measure the total length. Oversize bands apply over six metres." }];
    await page.evaluate(() => window.__voice.say("Tell me about bringing a car on board."));
    await sleep(400);
    assert.equal(await page.evaluate(() => window.__voice.watcherCount()), 1,
      "nothing is listening while the agent speaks - barge-in cannot work");

    reply = () => [{ text: "The crossing takes about ten hours thirty minutes." }];
    await page.evaluate(() => window.__voice.bargeIn("Actually how long is the crossing"));
    await sleep(1500);
    const spoken = await page.spoken();
    assert.ok(spoken.some(s => s.interrupted), "the audio kept playing through the interruption");
    assert.ok(spoken.some(s => /ten hours/.test(s.text)), "the interruption did not become the next question");
    await page.close();
  });

  test("the loop survives two barge-ins in a row", async () => {
    const page = await openListening();
    await page.evaluate(() => window.__voice.setSpeakMs(1500));
    for (const [ask, long, cutIn, answer] of [
      ["Can I bring a bicycle?", "Bicycles are carried free. They must be declared. There is no extra fare.",
       "What about luggage limits", "Foot passengers have no weight limit."],
      ["Is there parking?", "There is a long stay lot. Book it in summer. It fills up in July.",
       "And what about the trains", "The SKM runs every ten minutes."]
    ]) {
      await page.listening();
      reply = () => [{ text: long }];
      await page.evaluate(q => window.__voice.say(q), ask);
      await sleep(400);
      reply = () => [{ text: answer }];
      await page.evaluate(q => window.__voice.bargeIn(q), cutIn);
      await sleep(1400);
      assert.ok((await page.spoken()).some(s => s.text.includes(answer.split(" ").slice(-2).join(" "))),
        `the loop stalled after interrupting "${ask}"`);
    }
    await page.close();
  });
});

describe("the failure modes an attendee will actually hit", () => {
  test("a broken token route says which setting, and leaves the page usable", async () => {
    const page = await open({ routes: p => p.route("**/api/directline/token",
      r => r.fulfill({ status: 500, jsonBody: { error: "missing_setting", missing: ["DIRECTLINE_SECRET"] } })) });
    await sleep(800);
    assert.equal(await page.textContent("#status"), "not connected");
    assert.match((await page.bubbles()).join(" "), /DIRECTLINE_SECRET/);
    assert.deepEqual(page.errors, [], "a thrown token error leaves the whole page inert");
    // the rest of the page still works: the mic button is still wired up
    await page.click("#mic");
    await sleep(200);
    assert.ok(await page.evaluate(() => window.__voice.waitingForSpeech()));
    await page.close();
  });

  test("an empty body from the token route does not kill the module", async () => {
    const page = await open({ routes: p => p.route("**/api/directline/token",
      r => r.fulfill({ status: 500, body: "" })) });
    await sleep(600);
    assert.deepEqual(page.errors, []);
    assert.match((await page.bubbles()).join(" "), /local\.settings\.json/);
    await page.close();
  });

  test("nothing recognised is recoverable with one press", async () => {
    const page = await openListening();
    await page.evaluate(() => window.__voice.sayNothing());
    await sleep(300);
    assert.match(await page.textContent("#status"), /did not catch that/);
    assert.equal(await page.textContent("#mic"), "Mic", "the button still claims to be listening");
    await page.click("#mic");
    await sleep(300);
    assert.ok(await page.evaluate(() => window.__voice.waitingForSpeech()));
    await page.close();
  });

  test("a filler message does not swallow the answer", async () => {
    // Copilot Studio answers some questions with "let me check..." and then
    // the answer. Speaking only the first one loses the answer entirely.
    const page = await openListening();
    await page.evaluate(() => window.__voice.setSpeakMs(1500));   // realistic TTS length
    reply = () => [{ text: "Let me check that for you.", delay: 0 },
                   { text: "Yes, a cabin is compulsory on the 21:00 sailing.", delay: 600 }];
    await page.evaluate(() => window.__voice.say("Do I need a cabin?"));
    await sleep(4000);
    const spoken = (await page.spoken()).map(s => s.text);
    assert.ok(spoken.some(t => /compulsory/.test(t)), `the answer was never spoken: ${JSON.stringify(spoken)}`);
    await page.close();
  });

  test("a bad SPEECH_KEY says so instead of blaming the microphone", async () => {
    const page = await open({ routes: p => p.route("**/api/speech/token",
      r => r.fulfill({ status: 401, jsonBody: { error: "speech_token_failed" } })) });
    await online(page);
    await page.click("#mic");
    await sleep(600);
    const shown = (await page.bubbles()).join(" ") + " " + await page.textContent("#status");
    assert.match(shown, /SPEECH_KEY/);
    assert.doesNotMatch(shown, /did not catch that/);
    assert.equal(await page.textContent("#mic"), "Mic", "the loop is dead but the button says Stop");
    await page.close();
  });

  test("the mic button shows whether the loop is running", async () => {
    const page = await open();
    await online(page);
    assert.equal(await page.textContent("#mic"), "Mic");
    await page.click("#mic");
    assert.equal(await page.textContent("#mic"), "Stop");
    assert.equal(await page.getAttribute("#mic", "aria-pressed"), "true");
    await page.click("#mic");
    assert.equal(await page.textContent("#mic"), "Mic");
    await page.close();
  });
});
