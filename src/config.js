// Nastavení aplikace: soubor config.json ve složce uživatele. Klíč k webu a heslo k OBS
// se ukládají zašifrované (šifruje je sám operační systém), když to systém umí.
const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const file = () => path.join(app.getPath("userData"), "config.json");

const DEFAULTS = () => ({
  lang: "cs",
  token: "",
  channel: null,
  clipsDir: path.join(app.getPath("videos"), "Tejbot klipy"),
  setupDone: false,
  autostart: false,
  obs: { url: "ws://127.0.0.1:4455", password: "", mic: "", autoReplay: true },
  music: { enabled: true, sources: { spotify: true, apple: true, browser: true, other: false } },
  commands: [
    { id: randomUUID(), name: "Udělej klip", phrase: "udělej klip", hotkey: "", action: "clip", param: "" },
    { id: randomUUID(), name: "Vypni mikrofon", phrase: "vypni mikrofon", hotkey: "", action: "mic_mute", param: "" },
    { id: randomUUID(), name: "Zapni mikrofon", phrase: "zapni mikrofon", hotkey: "", action: "mic_unmute", param: "" },
  ],
});

const SECRET = [["token"], ["obs", "password"]];
const canEncrypt = () => {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
};
const enc = (v) => (v && canEncrypt() ? `enc:${safeStorage.encryptString(v).toString("base64")}` : v);
const dec = (v) => {
  if (typeof v !== "string" || !v.startsWith("enc:")) return v || "";
  try {
    return safeStorage.decryptString(Buffer.from(v.slice(4), "base64"));
  } catch {
    return "";
  }
};
const getIn = (o, p) => p.reduce((x, k) => (x ? x[k] : undefined), o);
const setIn = (o, p, v) => {
  const last = p[p.length - 1];
  const parent = p.slice(0, -1).reduce((x, k) => x[k], o);
  parent[last] = v;
};

let cfg = null;

function load() {
  const d = DEFAULTS();
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(file(), "utf8"));
  } catch {
    /* první spuštění */
  }
  cfg = { ...d, ...saved, obs: { ...d.obs, ...(saved.obs || {}) }, music: { ...d.music, ...(saved.music || {}), sources: { ...d.music.sources, ...((saved.music || {}).sources || {}) } } };
  if (!Array.isArray(cfg.commands)) cfg.commands = d.commands;
  for (const p of SECRET) setIn(cfg, p, dec(getIn(cfg, p)));
  return cfg;
}

function save() {
  const out = JSON.parse(JSON.stringify(cfg));
  for (const p of SECRET) setIn(out, p, enc(getIn(out, p)));
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(out, null, 2));
}

module.exports = { get: () => cfg || load(), load, save };
