// The lab guide is the thing people build from - most attendees never clone
// this repo. So the listings in the HTML are not documentation of the code,
// they ARE the code, and these tests fail the moment the two drift apart.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(join(REPO, p), "utf8");

const unescape = s => s
  .replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&");                     // last, or we double-decode

/** Every `<div class="instr">` listing, by the label in its title bar. */
function listings() {
  const html = read("06_Lab6_CopilotStudio_WebVoice.html");
  const re = /<div class="instr"><div class="instr-bar"><b>(.*?)<\/b><button class="copy" data-copy="([\s\S]*?)"\s+onclick="copyBtn\(this\)">Copy<\/button><\/div><pre>([\s\S]*?)<\/pre><\/div>/g;
  const out = new Map();
  for (const [, label, copy, pre] of html.matchAll(re)) {
    assert.equal(unescape(copy), unescape(pre),
      `"${label}": the Copy button and the printed listing are not the same text`);
    out.set(label, unescape(copy));
  }
  assert.ok(out.size > 15, `only ${out.size} listings found - has the markup changed?`);
  return out;
}

// label in the guide -> file in this repo
const FILES = {
  "index.html": "index.html",
  "style.css": "style.css",
  "package.json": "package.json",
  "scripts/copy-vendor.mjs": "scripts/copy-vendor.mjs",
  "staticwebapp.config.json": "staticwebapp.config.json",
  ".gitignore": ".gitignore",
  "api/host.json": "api/host.json",
  "api/package.json": "api/package.json",
  "api/src/functions/tokens.js": "api/src/functions/tokens.js",
  "api/local.settings.json": "api/local.settings.json.example",
  "instructions · Scenario E": "agent/instructions.txt"
};

// the order the lab pastes them in
const APP_JS_PARTS = [
  "app.js — part 1", "app.js — part 2", "app.js — part 3",
  "app.js — speakable()", "app.js — part 4", "app.js — part 5",
  "app.js — replace voiceTurn"
];

describe("the guide builds this repo", () => {
  const blocks = listings();

  for (const [label, file] of Object.entries(FILES)) {
    test(`"${label}" is ${file}, verbatim`, () => {
      assert.equal(blocks.get(label)?.replace(/\n+$/, ""), read(file).replace(/\n+$/, ""));
    });
  }

  test("the app.js parts, pasted in order, are app.js", () => {
    for (const p of APP_JS_PARTS) assert.ok(blocks.has(p), `the guide has no "${p}" listing`);
    const built = APP_JS_PARTS.map(p => blocks.get(p)).join("\n\n") + "\n";
    assert.equal(built, read("app.js"),
      "typing the lab out top to bottom no longer produces the app.js in this repo");
  });

  test("step 6's throwaway loop is not mistaken for part of the file", () => {
    const first = blocks.get("app.js — the loop, version one");
    assert.ok(first, "the lab has no working loop at the end of step 6");
    assert.match(first, /replaced in step 7/);
    assert.doesNotMatch(first, /speakInterruptibly/, "step 6 cannot use step 7's code");
    assert.ok(!read("app.js").includes(first), "the throwaway loop leaked into app.js");
  });

  test("the browser half never touches a secret, only /api", () => {
    // Naming a setting in an error message is the point; reading one is the bug.
    for (const part of APP_JS_PARTS) {
      const code = blocks.get(part);
      assert.doesNotMatch(code, /process\.env/, `${part} reads a server setting`);
      assert.doesNotMatch(code, /Ocp-Apim-Subscription-Key/, `${part} sends the Speech key`);
      assert.doesNotMatch(code, /directline\.botframework\.com/,
        `${part} calls Direct Line's secret-exchange endpoint from the browser`);
    }
    // ...and the server half is where both secrets live
    const api = blocks.get("api/src/functions/tokens.js");
    for (const name of ["DIRECTLINE_SECRET", "SPEECH_KEY", "Ocp-Apim-Subscription-Key"])
      assert.match(api, new RegExp(name));
  });
});
