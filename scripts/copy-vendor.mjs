// Copies the two browser bundles from node_modules into vendor/,
// so index.html can load them with plain <script> tags. Runs on npm install.
import { mkdirSync, copyFileSync } from "node:fs";

const files = [
  ["node_modules/botframework-directlinejs/dist/directline.js", "vendor/directline.js"],
  ["node_modules/microsoft-cognitiveservices-speech-sdk/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js", "vendor/speech.js"]
];

mkdirSync("vendor", { recursive: true });
for (const [from, to] of files) {
  copyFileSync(from, to);
  console.log(`vendor: ${to}`);
}
