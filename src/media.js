// "Co zrovna hraje": Windows přes ovládání médií (PowerShell skript), Linux přes program playerctl.
const { spawn, execFile } = require("child_process");
const path = require("path");
const { EventEmitter } = require("events");
const config = require("./config");

const events = new EventEmitter();
let proc = null;
let timer = null;
let current = null; // { title, artist, app, playing }
let available = true;

const BROWSERS = /chrome|msedge|edge|firefox|opera|brave|vivaldi|chromium/i;

/** Zdroj -> skupina (spotify / apple / browser / other) a hezký název */
function classify(appId, title, windows, url) {
  const id = String(appId || "").toLowerCase();
  if (id.includes("spotify")) return { group: "spotify", app: "Spotify" };
  if (id.includes("applemusic") || id.includes("itunes") || id.includes("apple.music")) return { group: "apple", app: "Apple Music" };
  if (BROWSERS.test(id)) {
    // nejdřív okno, které má v názvu přímo tu skladbu; když žádné takové není, tak adresa (Linux)
    const mine = (windows || []).filter((w) => title && w.toLowerCase().includes(title.toLowerCase().slice(0, 25)));
    const site = (text) => {
      const t = String(text || "").toLowerCase();
      if (t.includes("soundcloud")) return "SoundCloud";
      if (t.includes("youtube") || t.includes("youtu.be")) return "YouTube";
      if (t.includes("spotify")) return "Spotify";
      if (t.includes("apple music") || t.includes("music.apple")) return "Apple Music";
      return "";
    };
    return { group: "browser", app: site(url) || site(mine.join(" ")) || "Web" };
  }
  return { group: "other", app: "" };
}

/** Ze všech přehrávačů vybere ten, který hraje a je povolený (Spotify má přednost před prohlížečem) */
function pick(sessions, windows) {
  const allowed = config.get().music.sources;
  const order = ["spotify", "apple", "browser", "other"];
  const playing = sessions
    .filter((s) => s.title && /playing/i.test(s.status))
    .map((s) => ({ ...s, ...classify(s.app, s.title, windows, s.url) }))
    .filter((s) => allowed[s.group])
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  const s = playing[0];
  return s ? { title: s.title, artist: s.artist || "", app: s.app, playing: true } : null;
}

function update(next) {
  const same = (a, b) => (!a && !b) || (a && b && a.title === b.title && a.artist === b.artist && a.app === b.app);
  if (same(current, next)) return;
  current = next;
  events.emit("track", current);
}

function startWindows() {
  const script = path.join(__dirname, "media-win.ps1").replace("app.asar", "app.asar.unpacked");
  proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", script], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  let buf = "";
  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("{")) continue;
      try {
        const j = JSON.parse(line);
        const sessions = Array.isArray(j.sessions) ? j.sessions : j.sessions ? [j.sessions] : [];
        const windows = Array.isArray(j.windows) ? j.windows : j.windows ? [j.windows] : [];
        update(pick(sessions, windows));
      } catch {
        /* neúplný řádek */
      }
    }
  });
  const child = proc;
  child.on("error", () => {
    available = false;
  });
  child.on("exit", () => {
    if (proc !== child) return; // mezitím už běží nový
    proc = null;
    // skript spadl (třeba po probuzení počítače) -> za chvíli ho pustíme znovu
    setTimeout(() => !proc && timer !== "stopped" && available && startWindows(), 10000);
  });
}

function pollLinux() {
  execFile("playerctl", ["metadata", "--all-players", "--format", "{{playerName}}\t{{status}}\t{{artist}}\t{{title}}\t{{xesam:url}}"], { timeout: 4000 }, (err, out) => {
    if (err && err.code === "ENOENT") {
      available = false; // playerctl není nainstalovaný
      return;
    }
    const sessions = String(out || "")
      .split("\n")
      .filter(Boolean)
      .map((l) => l.split("\t"))
      .map(([app, status, artist, title, url]) => ({ app, status, artist, title, url }));
    update(pick(sessions, []));
  });
}

module.exports = {
  events,
  current: () => current,
  available: () => available,
  classify,
  start() {
    this.stop();
    timer = null;
    if (!config.get().music.enabled) return;
    if (process.platform === "win32") startWindows();
    else if (process.platform === "linux") {
      pollLinux();
      timer = setInterval(pollLinux, 3000);
    } else available = false;
  },
  stop() {
    if (timer && timer !== "stopped") clearInterval(timer);
    timer = "stopped";
    if (proc) {
      try {
        proc.kill();
      } catch {
        /* už neběží */
      }
      proc = null;
    }
    update(null);
  },
};
