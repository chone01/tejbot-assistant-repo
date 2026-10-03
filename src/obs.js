// Spojení s OBS (OBS -> Nástroje -> Nastavení WebSocket serveru). Samo se znovu připojuje.
const { default: OBSWebSocket } = require("obs-websocket-js");
const { EventEmitter } = require("events");
const config = require("./config");

const obs = new OBSWebSocket();
const events = new EventEmitter();
let connected = false;
let connecting = false;
let lastError = "";
let timer = null;
let stopped = false;

function setState(ok, err = "") {
  const changed = connected !== ok || lastError !== err;
  connected = ok;
  lastError = err;
  if (changed) events.emit("state", state());
}
const state = () => ({ connected, error: lastError });

async function connect() {
  if (connecting || stopped) return;
  connecting = true;
  clearTimeout(timer);
  const { url, password, autoReplay } = config.get().obs;
  try {
    try {
      await obs.disconnect();
    } catch {
      /* nebylo připojeno */
    }
    await obs.connect(url, password || undefined);
    setState(true);
    if (autoReplay) {
      try {
        const r = await obs.call("GetReplayBufferStatus");
        if (!r.outputActive) await obs.call("StartReplayBuffer");
      } catch {
        /* Replay Buffer není v OBS zapnutý v nastavení */
      }
    }
  } catch (e) {
    // 4009 = špatné heslo
    setState(false, e && e.code === 4009 ? "password" : "offline");
    schedule();
  } finally {
    connecting = false;
  }
}
function schedule() {
  clearTimeout(timer);
  if (!stopped) timer = setTimeout(connect, 5000);
}
obs.on("ConnectionClosed", () => {
  if (connected) setState(false, "offline");
  schedule();
});
obs.on("ReplayBufferSaved", (d) => events.emit("replay", d.savedReplayPath));

async function call(name, data) {
  if (!connected) throw Object.assign(new Error("OBS není připojené"), { code: "NO_OBS" });
  return obs.call(name, data);
}

module.exports = {
  events,
  state,
  call,
  start: () => {
    stopped = false;
    connect();
  },
  stop: async () => {
    stopped = true;
    clearTimeout(timer);
    try {
      await obs.disconnect();
    } catch {
      /* nic */
    }
    setState(false);
  },
  reconnect: () => {
    stopped = false;
    connecting = false;
    return connect();
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
