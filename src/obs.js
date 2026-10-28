// Spojení s OBS (OBS -> Nástroje -> Nastavení WebSocket serveru). Samo se znovu připojuje.
const { default: OBSWebSocket } = require("obs-websocket-js");
const { EventEmitter } = require("events");
const config = require("./config");

const obs = new OBSWebSocket();
const events = new EventEmitter();
let connected = false;
let busy = false; // právě se zkouší připojit
let lastError = "";
let detail = ""; // přesná chyba od OBS (ukáže se v aplikaci, ať se dá poznat, co je špatně)
let timer = null;
let stopped = true;
let run = 0; // číslo pokusu: starší pokus už nesmí nic přepsat

let streaming = false; // OBS právě vysílá
const state = () => ({ connected, connecting: busy && !connected, error: lastError, detail, streaming });
let lastEmit = "";
// stav hlásíme jen při změně (při opakovaném připojování k vypnutému OBS se jinak okno překreslovalo každých pár vteřin)
const emit = () => {
  const st = state();
  const key = JSON.stringify(st);
  if (key === lastEmit) return;
  lastEmit = key;
  events.emit("state", st);
};

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("OBS neodpovídá (vypršel čas)")), ms))]);

/** Adresy, které se zkusí: zadaná a k ní druhý zápis téhož počítače (některé Windows poslouchají jen na jednom) */
function candidates(url) {
  const list = [url];
  if (url.includes("127.0.0.1")) list.push(url.replace("127.0.0.1", "localhost"), url.replace("127.0.0.1", "[::1]"));
  else if (url.includes("localhost")) list.push(url.replace("localhost", "127.0.0.1"));
  return list;
}

async function connect() {
  if (stopped) return;
  const my = ++run;
  clearTimeout(timer);
  busy = true;
  // první pokus ukáže „Připojuji…“; další pokusy na pozadí (OBS je vypnuté) stav nemění
  if (!lastError) emit();
  const { url, password, autoReplay } = config.get().obs;
  let err = null;
  for (const u of candidates(url)) {
    try {
      await obs.disconnect().catch(() => {});
      if (my !== run) return;
      await withTimeout(obs.connect(u, password || undefined), 8000);
      if (my !== run) return;
      err = null;
      break;
    } catch (e) {
      if (my !== run) return;
      err = e;
      if (e && e.code === 4009) break; // špatné heslo: jiná adresa nepomůže
    }
  }
  busy = false;
  if (err) {
    const noPw = !password && /authentication|4009/i.test(String(err.message));
    connected = false;
    lastError = err.code === 4009 || noPw ? "password" : "offline";
    detail = `${err.code ? `${err.code}: ` : ""}${err.message || err}`.slice(0, 200);
    emit();
    schedule();
    return;
  }
  connected = true;
  lastError = "";
  detail = "";
  try {
    streaming = !!(await obs.call("GetStreamStatus")).outputActive;
  } catch {
    streaming = false;
  }
  emit();
  events.emit("scenes");
  if (autoReplay) {
    try {
      const r = await obs.call("GetReplayBufferStatus");
      if (!r.outputActive) await obs.call("StartReplayBuffer");
    } catch {
      /* Replay Buffer není v OBS zapnutý v nastavení */
    }
  }
}
function schedule() {
  clearTimeout(timer);
  if (!stopped) timer = setTimeout(connect, 5000);
}
obs.on("ConnectionClosed", () => {
  if (busy) return; // zavření během připojování řeší connect()
  if (connected) {
    connected = false;
    streaming = false;
    lastError = "offline";
    emit();
    events.emit("scenes");
  }
  schedule();
});
obs.on("ReplayBufferSaved", (d) => events.emit("replay", d.savedReplayPath));
obs.on("StreamStateChanged", (d) => {
  // STARTING / STOPPING se ignoruje, stav se mění až po skutečném startu nebo konci
  if (d.outputState === "OBS_WEBSOCKET_OUTPUT_STARTED" || d.outputState === "OBS_WEBSOCKET_OUTPUT_STOPPED") {
    streaming = !!d.outputActive;
    emit();
  }
});
// scény se změnily -> aplikace to řekne webu (pomocník pak vybírá, kam přidat zdroj)
for (const ev of ["SceneListChanged", "CurrentProgramSceneChanged", "SceneNameChanged", "SceneCreated", "SceneRemoved"]) obs.on(ev, () => events.emit("scenes"));

async function call(name, data) {
  if (!connected) throw Object.assign(new Error("OBS není připojené"), { code: "NO_OBS" });
  return obs.call(name, data);
}

module.exports = {
  events,
  state,
  call,
  start: () => {
    if (!stopped) return;
    stopped = false;
    connect();
  },
  stop: async () => {
    stopped = true;
    run++;
    busy = false;
    clearTimeout(timer);
    try {
      await obs.disconnect();
    } catch {
      /* nic */
    }
    connected = false;
    lastError = "";
    emit();
  },
  reconnect: () => {
    stopped = false;
    lastError = ""; // ruční „Připojit znovu“ ukáže „Připojuji…“
    detail = "";
    return connect();
  },
  /** scény pro web (bez zjišťování zvuku, rychlé) */
  scenes: async () => {
    const r = await call("GetSceneList");
    return { scenes: r.scenes.map((x) => x.sceneName).reverse(), current: r.currentProgramSceneName || "" };
  },
  /** seznam zvukových vstupů a scén pro výběr v nastavení */
  lists: async () => {
    const [inputs, scenes] = await Promise.all([call("GetInputList"), call("GetSceneList")]);
    const audio = [];
    for (const i of inputs.inputs) {
      try {
        await obs.call("GetInputMute", { inputName: i.inputName });
        audio.push(i.inputName); // jen vstupy, které mají zvuk
      } catch {
        /* vstup bez zvuku */
      }
    }
    return { inputs: audio, scenes: scenes.scenes.map((s) => s.sceneName).reverse() };
  },
};
