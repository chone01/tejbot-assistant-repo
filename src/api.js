// Spojení s webem TejBota. Aplikace je jen prostředník: Premium se tu koupit nedá.
const { app } = require("electron");
const os = require("os");
const config = require("./config");

const SITE = (process.env.TEJBOT_SITE || "https://tejbot.eu").replace(/\/+$/, "");

async function call(method, pathname, body) {
  const cfg = config.get();
  const res = await fetch(`${SITE}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Tejbot-Version": app.getVersion(),
      ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* prázdná odpověď */
  }
  return { status: res.status, ok: res.ok, data };
}

module.exports = {
  SITE,
  pair: (code) => call("POST", "/api/assistant/pair", { code, name: os.hostname(), platform: process.platform, version: app.getVersion() }),
  me: () => call("GET", "/api/assistant/me"),
  unpair: () => call("DELETE", "/api/assistant/me"),
  nowPlaying: (track, changed) => call("POST", "/api/assistant/now-playing", { ...(track || { title: "" }), changed }),
  clip: (file, note) => call("POST", "/api/assistant/clip", { file, note }),
  // akce na webu (alerty, TTS, písničky, video, odpočet)
  action: (action) => call("POST", "/api/assistant/action", { action }),
};
