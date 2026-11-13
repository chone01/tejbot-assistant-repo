// Automatické připojení k OBS: přečte nastavení WebSocket serveru přímo ze složky OBS (OBS 28 a novější),
// když je vypnutý, zapne ho a vyplní adresu a heslo do aplikace. Když to nejde (jiné OBS, chybí složka), nic nedělá.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomBytes } = require("crypto");
const { execFile } = require("child_process");

/** Kde má OBS nastavení WebSocketu */
function configPath() {
  const home = os.homedir();
  const base =
    process.platform === "win32"
      ? path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "obs-studio")
      : process.platform === "darwin"
        ? path.join(home, "Library", "Application Support", "obs-studio")
        : path.join(home, ".config", "obs-studio");
  return { base, file: path.join(base, "plugin_config", "obs-websocket", "config.json") };
}

/** Běží teď OBS? (změna nastavení se pak projeví až po restartu OBS) */
function obsRunning() {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      execFile("tasklist", ["/FI", "IMAGENAME eq obs64.exe", "/NH"], { windowsHide: true, timeout: 5000 }, (err, out) => resolve(!err && /obs64\.exe/i.test(String(out))));
    } else {
      execFile("pgrep", ["-x", process.platform === "darwin" ? "OBS" : "obs"], { timeout: 5000 }, (err, out) => resolve(!err && String(out).trim().length > 0));
    }
  });
}

/** Přečte nastavení WebSocketu z OBS, nebo null, když OBS na tomhle počítači není */
function read() {
  const { base, file } = configPath();
  if (!fs.existsSync(base)) return null; // OBS tu není (nebo je přenosná verze jinde)
  let cfg = null;
  try {
    cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    cfg = null; // soubor ještě není (OBS starší než 28, nebo WebSocket nikdy neotevřený)
  }
  return {
    exists: !!cfg,
    enabled: !!cfg?.server_enabled,
    port: Number(cfg?.server_port) || 4455,
    auth: cfg ? cfg.auth_required !== false : true,
    password: typeof cfg?.server_password === "string" ? cfg.server_password : "",
    raw: cfg || {},
    file,
  };
}

/**
 * Nastaví připojení: vrátí { url, password, changed, restart } nebo { skip: důvod }.
 * changed = WebSocket byl vypnutý a aplikace ho zapnula; restart = OBS běží a změnu načte až po restartu.
 */
async function setup() {
  const st = read();
  if (!st) return { skip: "no_obs" };
  const url = `ws://127.0.0.1:${st.port}`;
  if (st.enabled) return { url, password: st.auth ? st.password : "", changed: false, restart: false };
  // WebSocket je vypnutý -> zapnout (heslo zachovat, nebo vytvořit nové)
  const password = st.password || randomBytes(12).toString("base64url");
  const next = { ...st.raw, server_enabled: true, server_port: st.port, auth_required: true, server_password: password, first_load: false };
  try {
    fs.mkdirSync(path.dirname(st.file), { recursive: true });
    fs.writeFileSync(st.file, JSON.stringify(next, null, 4));
  } catch {
    return { skip: "no_write" };
  }
  return { url, password, changed: true, restart: await obsRunning() };
}

module.exports = { setup, read };
