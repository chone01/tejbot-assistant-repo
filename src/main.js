// Tejbot Assistent - hlavní část aplikace (ikona u hodin, okno, klávesové zkratky)
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, globalShortcut, shell, nativeImage } = require("electron");
const path = require("path");
const { randomUUID } = require("crypto");
const config = require("./config");
const api = require("./api");
const obs = require("./obs");
const media = require("./media");
const actions = require("./actions");

let win = null;
let tray = null;
let quitting = false;
let premium = { active: false, until: null, lifetime: false };
let webState = "unknown"; // ok | offline | unpaired | nopremium
let lastClips = [];
let hotkeyErrors = [];

const L = (cs, en) => (config.get().lang === "en" ? en : cs);
const send = (name, data) => win && !win.isDestroyed() && win.webContents.send(`tb:${name}`, data);
const enabled = () => webState === "ok";

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => showWindow());
app.setAppUserModelId("eu.tejbot.assistent");

function showWindow() {
  if (!win || win.isDestroyed()) return createWindow();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: "#0a0a0f",
    title: "Tejbot Assistent",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    autoHideMenuBar: true,
    show: !process.argv.includes("--hidden"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "ui", "index.html"));
  // zavřít křížkem = schovat k hodinám (aplikace běží dál, ať fungují zkratky)
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
}

function buildTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "tray.png"));
  if (!tray) {
    tray = new Tray(img);
    tray.setToolTip("Tejbot Assistent");
    tray.on("click", showWindow);
  }
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: L("Otevřít Tejbot Assistent", "Open Tejbot Assistent"), click: showWindow },
      { label: L("Uložit klip", "Save a clip"), enabled: enabled(), click: () => runAction("clip", "") },
      { label: L("Otevřít složku s klipy", "Open the clips folder"), click: () => actions.run("open_clips") },
      { type: "separator" },
      { label: L("Ukončit", "Quit"), click: () => ((quitting = true), app.quit()) },
    ])
  );
}

async function runAction(action, param) {
  if (!enabled() && action !== "open_clips") {
    const r = { ok: false, message: L("Aplikace potřebuje spárovaný kanál s Premium.", "The app needs a paired channel with Premium.") };
    send("toast", r);
    return r;
  }
  const r = await actions.run(action, param);
  if (r.message) send("toast", r);
  if (!r.ok && (!win || !win.isVisible())) actions.notify("Tejbot Assistent", r.message);
  return r;
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  hotkeyErrors = [];
  if (!enabled()) return;
  for (const c of config.get().commands) {
    if (!c.hotkey) continue;
    let ok = false;
    try {
      ok = globalShortcut.register(c.hotkey, () => runAction(c.action, c.param));
    } catch {
      ok = false;
    }
    if (!ok) hotkeyErrors.push(c.id); // zkratku už používá jiný program
  }
}

/** Zeptá se webu, ke kterému kanálu aplikace patří a jestli má Premium */
async function refreshMe() {
  const cfg = config.get();
  const before = webState;
  if (!cfg.token) webState = "unpaired";
  else {
    try {
      const r = await api.me();
      if (r.status === 401) {
        cfg.token = "";
        cfg.channel = null;
        config.save();
        webState = "unpaired";
      } else if (r.ok) {
        cfg.channel = r.data.channel;
        config.save();
        premium = r.data.premium;
        webState = premium.active ? "ok" : "nopremium";
      } else if (webState === "unknown") webState = "offline";
    } catch {
      if (webState !== "ok") webState = "offline"; // krátký výpadek internetu nic nevypíná
    }
  }
  if (before !== webState) applyState();
  send("state", fullState());
}

function applyState() {
  registerHotkeys();
  buildTray();
  if (enabled()) {
    obs.start();
    media.start();
  } else {
    obs.stop();
    media.stop();
  }
}

function fullState() {
  const cfg = config.get();
  return {
    version: app.getVersion(),
    platform: process.platform,
    site: api.SITE,
    web: webState,
    premium,
    config: { ...cfg, token: undefined, obs: { ...cfg.obs, password: cfg.obs.password ? "••••••" : "" } },
    hasObsPassword: !!cfg.obs.password,
    obs: obs.state(),
    track: media.current(),
    musicAvailable: media.available(),
    actions: actions.ACTIONS,
    clips: lastClips,
    hotkeyErrors,
  };
}

// ------------------------------------------------------------ hudba -> web
let lastSent = 0;
async function sendTrack(changed) {
  if (!enabled() || !config.get().music.enabled) return;
  try {
    await api.nowPlaying(media.current(), changed);
    lastSent = Date.now();
  } catch {
    /* zkusí to při další změně */
  }
}
media.events.on("track", () => {
  send("state", fullState());
  void sendTrack(true);
});
// jednou za minutu dá webu vědět, že aplikace pořád běží (jinak widget skladbu schová)
setInterval(() => media.current() && Date.now() - lastSent > 55000 && void sendTrack(false), 15000);

let wasConnected = false;
obs.events.on("state", (st) => {
  send("state", fullState());
  if (st.connected && !wasConnected) send("toast", { ok: true, message: L("OBS připojeno.", "OBS connected.") });
  wasConnected = st.connected;
});
actions.setOnClip((c) => {
  lastClips = [c, ...lastClips].slice(0, 10);
  send("state", fullState());
  send("toast", { ok: true, message: `${L("Klip uložen", "Clip saved")}: ${path.basename(c.file)}` });
});

// ------------------------------------------------------------ příkazy z okna
const handle = (name, fn) => ipcMain.handle(`tb:${name}`, (_e, ...args) => fn(...args));

handle("state", () => fullState());
handle("pair", async (code) => {
  try {
    const r = await api.pair(String(code || ""));
    if (!r.ok) return { ok: false, error: r.data.error || "server" };
    const cfg = config.get();
    cfg.token = r.data.token;
    cfg.channel = r.data.channel;
    config.save();
    webState = "unknown";
    await refreshMe();
    return { ok: true };
  } catch {
    return { ok: false, error: "offline" };
  }
});
handle("unpair", async () => {
  try {
    await api.unpair();
  } catch {
    /* web nedostupný: odpojíme se aspoň tady */
  }
  const cfg = config.get();
  cfg.token = "";
  cfg.channel = null;
  config.save();
  await refreshMe();
  return true;
});
handle("refresh", () => refreshMe());
handle("pickClipsDir", async () => {
  const r = await dialog.showOpenDialog(win, { title: L("Kam ukládat klipy", "Where to save clips"), defaultPath: config.get().clipsDir, properties: ["openDirectory", "createDirectory"] });
  if (r.canceled || !r.filePaths[0]) return null;
  config.get().clipsDir = r.filePaths[0];
  config.save();
  return r.filePaths[0];
});
handle("finishSetup", () => {
  config.get().setupDone = true;
  config.save();
  return fullState();
});
handle("saveSettings", (patch) => {
  const cfg = config.get();
  if (patch.lang === "cs" || patch.lang === "en") cfg.lang = patch.lang;
  if (typeof patch.autostart === "boolean") {
    cfg.autostart = patch.autostart;
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: cfg.autostart, args: ["--hidden"] });
  }
  if (patch.music) {
    cfg.music = { enabled: patch.music.enabled !== false, sources: { ...cfg.music.sources, ...(patch.music.sources || {}) } };
    if (enabled()) {
      media.start();
      if (!cfg.music.enabled) void api.nowPlaying(null, true).catch(() => {});
    }
  }
  if (patch.obs) {
    const o = patch.obs;
    const reconnect = (typeof o.url === "string" && o.url !== cfg.obs.url) || typeof o.password === "string";
    if (typeof o.url === "string") cfg.obs.url = o.url.trim() || "ws://127.0.0.1:4455";
    if (typeof o.password === "string") cfg.obs.password = o.password;
    if (typeof o.mic === "string") cfg.obs.mic = o.mic;
    if (typeof o.autoReplay === "boolean") cfg.obs.autoReplay = o.autoReplay;
  }
  config.save();
  buildTray();
  return fullState();
});
handle("saveCommands", (list) => {
  const known = new Set(actions.ACTIONS.map((a) => a.key));
  const s = (v, n) => String(v || "").slice(0, n);
  config.get().commands = (Array.isArray(list) ? list : [])
    .slice(0, 40)
    .filter((c) => c && known.has(c.action))
    .map((c) => ({ id: s(c.id, 40) || randomUUID(), name: s(c.name, 60), phrase: s(c.phrase, 80).toLowerCase(), hotkey: s(c.hotkey, 40), action: c.action, param: s(c.param, 120) }));
  config.save();
  registerHotkeys();
  return fullState();
});
handle("run", (action, param) => runAction(action, param));
handle("obsLists", async () => {
  try {
    return await obs.lists();
  } catch {
    return { inputs: [], scenes: [] };
  }
});
handle("obsReconnect", () => obs.reconnect());
handle("openSite", (p) => shell.openExternal(`${api.SITE}${typeof p === "string" && p.startsWith("/") ? p : "/"}`));
handle("showClip", (file) => shell.showItemInFolder(String(file)));
// při nastavování zkratky je potřeba ostatní zkratky na chvíli vypnout, jinak by se rovnou spustily
handle("hotkeysPause", (pause) => (pause ? globalShortcut.unregisterAll() : registerHotkeys()));

// ------------------------------------------------------------ start
app.whenReady().then(async () => {
  config.load();
  createWindow();
  buildTray();
  await refreshMe();
  setInterval(refreshMe, 10 * 60 * 1000);
  if (app.isPackaged) {
    try {
      const { autoUpdater } = require("electron-updater");
      autoUpdater.on("update-downloaded", () => send("toast", { ok: true, message: L("Nová verze je stažená. Nainstaluje se po ukončení aplikace.", "A new version is downloaded. It installs when you quit the app.") }));
      autoUpdater.on("error", () => {});
      autoUpdater.checkForUpdates().catch(() => {});
      setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
    } catch {
      /* bez aktualizací */
    }
  }
});
app.on("window-all-closed", () => {
  /* běží dál u hodin */
});
app.on("before-quit", () => {
  quitting = true;
  media.stop();
});
app.on("will-quit", () => globalShortcut.unregisterAll());
