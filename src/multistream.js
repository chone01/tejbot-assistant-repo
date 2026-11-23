// Multistream: vysílání na víc platforem najednou.
// Varianta A (zdarma): OBS posílá stream do Assistenta (rtmp://127.0.0.1) a Assistent ho beze změny
// (bez přepočítávání videa) rozešle na všechny zapnuté platformy – jeden ffmpeg s výstupem „tee“.
// Varianta B (Premium, připravujeme): OBS pošle stream na server TejBota a ten ho rozešle. Až bude server,
// stačí v relayTarget() vrátit jeho adresu – zbytek (platformy, klíče, přepínání) zůstane stejný.
const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const config = require("./config");
const obs = require("./obs");

const events = new EventEmitter();
const PORT = 19350;
const LOCAL = `rtmp://127.0.0.1:${PORT}/live`;
const LOCAL_KEY = "tejbot";

/** platformy a jejich výchozí servery (server jde v nastavení změnit) */
const PLATFORMS = {
  kick: { name: "Kick", server: "rtmps://fa723fc1b171.global-contribute.live-video.net:443/app/" },
  twitch: { name: "Twitch", server: "rtmp://live.twitch.tv/app" },
  youtube: { name: "YouTube", server: "rtmp://a.rtmp.youtube.com/live2" },
};

let proc = null;
let want = false; // má teď běžet přeposílání (multistream zapnutý a víc než jedna platforma)
let restartTimer = null;
let status = { state: "off", detail: "", live: false, mode: "pc", failed: [], pending: false };
let pending = false; // změna nastavení během streamu: projeví se až po jeho konci

function ffmpegPath() {
  try {
    // v sestavené aplikaci je ffmpeg rozbalený vedle app.asar
    return require("ffmpeg-static").replace("app.asar", "app.asar.unpacked");
  } catch {
    return null;
  }
}

const cfg = () => config.get().multi;
const targets = () => Object.entries(cfg().targets || {}).filter(([k, t]) => PLATFORMS[k] && t && t.on && t.key);
const setStatus = (p) => {
  status = { ...status, ...p };
  events.emit("status");
};

/**
 * Kam má OBS posílat stream. Varianta B (server TejBota) zatím neexistuje → vždy PC.
 * Až bude server: když má streamer Premium a server je dostupný, vrátit { mode: "server", url, key }.
 */
function relayTarget(/* premium */) {
  // jen jedna platforma: OBS pošle stream rovnou na ni (přes počítač by to byla zbytečná zastávka navíc)
  const t = targets();
  if (t.length === 1) {
    const [k, x] = t[0];
    return { mode: "direct", url: String(x.server || PLATFORMS[k].server).replace(/\/+$/, ""), key: x.key };
  }
  return { mode: "pc", url: LOCAL, key: LOCAL_KEY };
}
/** míří OBS teď na nás (Assistenta nebo přímo nastavenou platformu)? */
const ourService = (cur) => {
  const set = (cur && cur.streamServiceSettings) || {};
  if (cur?.streamServiceType !== "rtmp_custom") return false;
  if (set.server === LOCAL) return true;
  return Object.entries(cfg().targets || {}).some(([k, t]) => PLATFORMS[k] && t && t.key && set.key === t.key);
};

// tee: ve výstupech se escapuje \ | [ ]
const teeEsc = (s) => String(s).replace(/([\\|[\]])/g, "\\$1");
function outputs() {
  return targets()
    .map(([k, t]) => {
      const server = String(t.server || PLATFORMS[k].server).replace(/\/+$/, "");
      return `[f=flv:onfail=ignore]${teeEsc(`${server}/${t.key}`)}`;
    })
    .join("|");
}

function spawnRelay() {
  clearTimeout(restartTimer);
  if (!want || proc) return;
  const bin = ffmpegPath();
  if (!bin) return setStatus({ state: "error", detail: "ffmpeg" });
  const args = ["-hide_banner", "-loglevel", "warning", "-listen", "1", "-i", `${LOCAL}/${LOCAL_KEY}`, "-map", "0", "-c", "copy", "-flvflags", "no_duration_filesize", "-f", "tee", outputs()];
  const p = spawn(bin, args, { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  proc = p;
  setStatus({ state: "ready", detail: "", live: false, failed: [] });
  let last = "";
  const hosts = targets().map(([k, t]) => [k, String(t.server || PLATFORMS[k].server).replace(/^rtmps?:\/\//, "").split(/[/:]/)[0]]);
  p.stderr.on("data", (b) => {
    const text = String(b);
    const line = text.trim().split("\n").pop();
    if (line) last = line.slice(0, 200);
    // platforma, která se nepřipojila (ostatní jedou dál) – špatný klíč, výpadek…
    for (const l of text.split("\n")) {
      if (!/Slave .*(error|failed)/i.test(l)) continue;
      const hit = hosts.find(([, h]) => h && l.includes(h));
      if (hit && !status.failed.includes(hit[0])) setStatus({ failed: [...status.failed, hit[0]] });
    }
    // první data od OBS = stream jede
    if (!status.live && obs.state().streaming) setStatus({ state: "live", live: true });
  });
  p.on("exit", (code) => {
    if (proc === p) proc = null;
    // konec streamu v OBS ukončí i ffmpeg → znovu poslouchat na další stream
    setStatus({ state: want ? "ready" : "off", live: false, detail: code && code !== 255 ? last : "" });
    if (want) restartTimer = setTimeout(spawnRelay, code ? 3000 : 500);
  });
  p.on("error", (e) => setStatus({ state: "error", detail: String(e.message || e).slice(0, 200) }));
}

function killRelay() {
  clearTimeout(restartTimer);
  if (proc) {
    try {
      proc.kill();
    } catch {
      /* už neběží */
    }
    proc = null;
  }
}

/** Nastaví OBS, aby posílal stream do Assistenta (původní nastavení si zapamatuje a pak vrátí). */
async function pointObs() {
  const c = cfg();
  const target = relayTarget();
  const cur = await obs.call("GetStreamServiceSettings");
  const cs = cur.streamServiceSettings || {};
  const exact = cur.streamServiceType === "rtmp_custom" && cs.server === target.url && cs.key === target.key;
  if (!exact) {
    // původní nastavení si pamatujeme jen jednou (ne naše vlastní, když se mění platformy)
    if (!c.prevService && !ourService(cur)) c.prevService = { type: cur.streamServiceType, settings: cur.streamServiceSettings };
    config.save();
    await obs.call("SetStreamServiceSettings", { streamServiceType: "rtmp_custom", streamServiceSettings: { server: target.url, key: target.key, use_auth: false } });
  }
  setStatus({ mode: target.mode });
}

/** Vrátí OBS původní nastavení streamu (vypnutý multistream). */
async function restoreObs() {
  const c = cfg();
  if (!c.prevService) return;
  try {
    const cur = await obs.call("GetStreamServiceSettings");
    if (ourService(cur)) {
      await obs.call("SetStreamServiceSettings", { streamServiceType: c.prevService.type, streamServiceSettings: c.prevService.settings });
    }
    c.prevService = null;
    config.save();
  } catch {
    /* OBS není připojené – vrátí se při dalším připojení */
  }
}

/** Zapne / vypne přeposílání podle nastavení. Volá se po uložení a po připojení OBS. */
async function sync() {
  const c = cfg();
  const on = !!c.enabled && targets().length >= 1;
  // během streamu se nic nepřepojuje ani nevypíná (stream by spadl) – změny se projeví po jeho konci
  if (obs.state().streaming) {
    pending = true;
    setStatus({ pending: true });
    return;
  }
  pending = false;
  setStatus({ pending: false });
  if (!on) {
    want = false;
    killRelay();
    setStatus({ state: "off", live: false, detail: "" });
    if (obs.state().connected && !obs.state().streaming) await restoreObs();
    return;
  }
  const direct = targets().length === 1;
  want = !direct;
  killRelay();
  if (direct) setStatus({ state: "ready", detail: "", live: false, failed: [] });
  else spawnRelay();
  if (obs.state().connected) {
    try {
      await pointObs();
    } catch (e) {
      setStatus({ state: "error", detail: String((e && e.message) || e).slice(0, 200) });
    }
  }
}

/**
 * Test uploadu: pošle pár MB na měřicí server Cloudflare a změří rychlost (Mb/s).
 * Nic se neukládá, data jsou náhodná.
 */
async function uploadTest() {
  const size = 4 * 1024 * 1024;
  const body = Buffer.alloc(size, 7);
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const r = await fetch("https://speed.cloudflare.com/__up", { method: "POST", body, headers: { "Content-Type": "application/octet-stream" }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await r.arrayBuffer().catch(() => {});
    const s = (Date.now() - t0) / 1000;
    runs.push((size * 8) / s / 1e6);
  }
  // nejrychlejší dvě (první bývá pomalejší kvůli navázání spojení)
  runs.sort((a, b) => b - a);
  const mbps = Math.round(((runs[0] + runs[1]) / 2) * 10) / 10;
  const c = cfg();
  c.upload = { mbps, at: Date.now() };
  config.save();
  return mbps;
}

/** Datový tok streamu z OBS (kb/s) – pro výpočet, kolik uploadu je potřeba */
async function obsBitrate() {
  try {
    const mode = (await obs.call("GetProfileParameter", { parameterCategory: "Output", parameterName: "Mode" })).parameterValue;
    if (mode !== "Advanced") {
      const v = Number((await obs.call("GetProfileParameter", { parameterCategory: "SimpleOutput", parameterName: "VBitrate" })).parameterValue) || 0;
      const a = Number((await obs.call("GetProfileParameter", { parameterCategory: "SimpleOutput", parameterName: "ABitrate" })).parameterValue) || 160;
      if (v) return v + a;
    }
  } catch {
    /* starší OBS / jiný režim */
  }
  return 6000;
}

/** stav pro okno (bez klíčů) */
function view() {
  const c = cfg();
  return {
    ...status,
    enabled: !!c.enabled,
    upload: c.upload || null,
    ffmpeg: !!ffmpegPath(),
    targets: Object.fromEntries(Object.keys(PLATFORMS).map((k) => {
      const t = (c.targets || {})[k] || {};
      return [k, { on: !!t.on, hasKey: !!t.key, server: t.server || "", defaultServer: PLATFORMS[k].server, name: PLATFORMS[k].name }];
    })),
  };
}

/** uložení z okna: { enabled, targets: { kick: { on, key?, server? } } } – prázdný klíč = beze změny */
function save(patch) {
  const c = cfg();
  if (typeof patch.enabled === "boolean") c.enabled = patch.enabled;
  for (const [k, p] of Object.entries(patch.targets || {})) {
    if (!PLATFORMS[k] || !p) continue;
    const t = (c.targets[k] = c.targets[k] || { on: false, key: "", server: "" });
    if (typeof p.on === "boolean") t.on = p.on;
    if (typeof p.key === "string" && p.key.trim()) t.key = p.key.trim().slice(0, 300);
    if (p.clear) t.key = "";
    if (typeof p.server === "string") t.server = /^rtmps?:\/\/[^\s"'|[\]]{3,200}$/i.test(p.server.trim()) ? p.server.trim() : "";
  }
  config.save();
  return sync();
}

// OBS se právě připojilo → nastavit, ať posílá stream na Assistenta; stream skončil → stav „live“ dolů
let wasConnected = false;
let wasStreaming = false;
obs.events.on("state", (st) => {
  const now = !!(st && st.connected);
  const streaming = !!(st && st.streaming);
  if (now && !wasConnected) {
    if (cfg().enabled && targets().length) {
      const direct = targets().length === 1;
      want = !direct;
      if (direct) killRelay();
      else if (!proc) spawnRelay();
      void pointObs().catch((e) => setStatus({ state: "error", detail: String((e && e.message) || e).slice(0, 200) }));
    } else if (cfg().prevService && !streaming) {
      // multistream se vypnul, když OBS nebylo připojené -> vrátit OBS původní nastavení teď
      void restoreObs();
    }
  }
  wasConnected = now;
  // stav „vysílá“ podle OBS (ffmpeg při bezchybném běhu nic nevypisuje)
  if (streaming && !status.live && (proc || status.mode === "direct") && cfg().enabled) setStatus({ state: "live", live: true });
  if (!streaming && status.live) setStatus({ state: proc || status.mode === "direct" ? "ready" : status.state, live: false });
  // stream skončil a během něj se měnilo nastavení -> teď ho použít
  if (wasStreaming && !streaming && pending) void sync().catch(() => {});
  wasStreaming = streaming;
});

/** běží teď stream přes multistream? (ukončení aplikace by ho shodilo) */
const liveViaUs = () => !!obs.state().streaming && (!!proc || status.mode === "direct") && !!cfg().enabled;
module.exports = { events, PLATFORMS, view, save, sync, uploadTest, obsBitrate, liveViaUs, restore: restoreObs, stop: () => ((want = false), killRelay()) };
