// The page's whole world, faked: static files, the two token routes, and a
// Direct Line v3 service (HTTP + WebSocket) with a bot the test scripts.
// Nothing here reaches Azure, so the tests need no keys and no network.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

/**
 * @param {number} port
 * @param {(activity, push) => void} bot  called with each activity the page posts
 */
export function start(port, bot) {
  const sockets = new Set();
  const posted = [];
  let seq = 0;

  const pushActivities = activities => {
    const frame = JSON.stringify({ activities, watermark: String(++seq) });
    for (const s of sockets) if (s.readyState === 1) s.send(frame);
  };

  const server = http.createServer(async (req, res) => {
    const { pathname, search } = new URL(req.url, "http://x");
    const json = (code, body) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };

    // --- what api/src/functions/tokens.js returns when it is happy ---
    if (pathname === "/api/directline/token" && req.method === "POST")
      return json(200, { conversationId: "conv1", token: "FAKE_DL_TOKEN", expires_in: 1800 });
    if (pathname === "/api/speech/token" && req.method === "POST")
      return json(200, { token: "FAKE_SPEECH_TOKEN", region: "swedencentral", expires_in: 540 });

    // --- fake Direct Line v3 ---
    if (pathname === "/v3/directline/conversations" && req.method === "POST")
      return json(201, {
        conversationId: "conv1", token: "FAKE_DL_TOKEN", expires_in: 1800,
        streamUrl: `ws://127.0.0.1:${port}/stream`
      });

    if (pathname.startsWith("/v3/directline/conversations/") &&
        pathname.endsWith("/activities") && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const activity = JSON.parse(body);
      posted.push(activity);
      // the real service echoes your own activity back on the stream
      pushActivities([{ ...activity, id: `u${seq}`, timestamp: new Date().toISOString() }]);
      setTimeout(() => bot(activity, pushActivities), 10);
      return json(200, { id: `u${seq}` });
    }

    if (pathname === "/v3/directline/tokens/refresh" && req.method === "POST")
      return json(200, { conversationId: "conv1", token: "FAKE_DL_TOKEN", expires_in: 1800 });

    // --- static, the way swa serves it ---
    try {
      const file = join(ROOT, normalize(pathname === "/" ? "/index.html" : pathname));
      if (!file.startsWith(ROOT)) throw new Error("outside root");
      const buf = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      res.end(buf);
    } catch {
      res.writeHead(404);
      res.end(`not found: ${pathname}${search}`);
    }
  });

  const wss = new WebSocketServer({ server, path: "/stream" });
  wss.on("connection", s => { sockets.add(s); s.on("close", () => sockets.delete(s)); });

  return new Promise(ready => server.listen(port, "127.0.0.1", () => ready({
    posted,
    pushActivities,
    close: () => new Promise(done => { for (const s of sockets) s.terminate(); server.close(done); })
  })));
}
