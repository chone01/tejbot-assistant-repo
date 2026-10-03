// Co aplikace umí udělat. Každý příkaz (klávesová zkratka, později hlas) spouští jednu z těchhle akcí.
const { Notification, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const obs = require("./obs");
const api = require("./api");

const ACTIONS = [
  { key: "clip", cs: "Uložit klip (posledních pár vteřin)", en: "Save a clip (last few seconds)" },
  { key: "mic_toggle", cs: "Mikrofon: přepnout", en: "Microphone: toggle" },
  { key: "mic_mute", cs: "Mikrofon: vypnout", en: "Microphone: mute" },
  { key: "mic_unmute", cs: "Mikrofon: zapnout", en: "Microphone: unmute" },
  { key: "scene", cs: "Přepnout scénu", en: "Switch scene", param: "scene" },
  { key: "record_toggle", cs: "Nahrávání: spustit / zastavit", en: "Recording: start / stop" },
  { key: "replay_toggle", cs: "Záznam do paměti: zapnout / vypnout", en: "Replay Buffer: on / off" },
  { key: "open_clips", cs: "Otevřít složku s klipy", en: "Open the clips folder" },
];

const L = (cs, en) => (config.get().lang === "en" ? en : cs);
function notify(title, body) {
  try {
    if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
  } catch {
    /* oznámení nejsou povolená */
  }
}

let onClip = () => {};
let chatClipAt = 0; // kdy přišel !clip z chatu (uložený záznam pak patří k němu)
const pad = (n) => String(n).padStart(2, "0");

/** OBS uložilo záznam -> přesuneme ho do složky s klipy, kterou si uživatel vybral */
async function handleReplay(saved) {
  const cfg = config.get();
  const d = new Date();
  const ext = path.extname(saved) || ".mp4";
  const name = `Klip_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}${ext}`;
  let final = saved;
  try {
    fs.mkdirSync(cfg.clipsDir, { recursive: true });
    const target = path.join(cfg.clipsDir, name);
    try {
      fs.renameSync(saved, target);
    } catch {
      // jiný disk: zkopírovat a původní smazat
      fs.copyFileSync(saved, target);
      fs.unlinkSync(saved);
    }
    final = target;
  } catch {
    /* soubor není na tomhle počítači (OBS běží jinde) nebo složka nejde vytvořit - necháme ho, kde je */
  }
  notify(L("Klip uložen", "Clip saved"), final);
  onClip({ file: final, at: d.toISOString() });
  try {
    const fromChat = Date.now() - chatClipAt < 30000;
    chatClipAt = 0;
    await api.clip(path.basename(final), "", fromChat);
  } catch {
    /* web je nedostupný, klip na disku zůstává */
  }
}
obs.events.on("replay", (p) => void handleReplay(p));

async function mic(mode) {
  const name = config.get().obs.mic;
  if (!name) throw new Error(L("Nejdřív v záložce OBS vyber, který vstup je tvůj mikrofon.", "First pick which input is your microphone in the OBS tab."));
  if (mode === "toggle") {
    const r = await obs.call("ToggleInputMute", { inputName: name });
    return r.inputMuted ? L("Mikrofon vypnutý", "Microphone muted") : L("Mikrofon zapnutý", "Microphone on");
  }
  await obs.call("SetInputMute", { inputName: name, inputMuted: mode === "mute" });
  return mode === "mute" ? L("Mikrofon vypnutý", "Microphone muted") : L("Mikrofon zapnutý", "Microphone on");
}

async function clip() {
  const st = await obs.call("GetReplayBufferStatus").catch(() => null);
  if (!st) throw new Error(L("V OBS není povolený záznam do paměti. Zapni ho v OBS: Nastavení → Výstup → Záznam do paměti.", "Replay Buffer isn't enabled in OBS. Turn it on in OBS: Settings → Output → Replay Buffer."));
  if (!st.outputActive) {
    await obs.call("StartReplayBuffer");
    return L("Záznam do paměti byl vypnutý, teď jsem ho zapnul. Klip půjde uložit za pár vteřin.", "Replay Buffer was off, I just turned it on. You can save a clip in a few seconds.");
  }
  await obs.call("SaveReplayBuffer");
  return L("Ukládám klip…", "Saving the clip…");
}

/** Spustí akci, vrátí { ok, message } */
async function run(action, param) {
  try {
    let message = "";
    switch (action) {
      case "clip":
        message = await clip();
        break;
      case "mic_toggle":
        message = await mic("toggle");
        break;
      case "mic_mute":
        message = await mic("mute");
        break;
      case "mic_unmute":
        message = await mic("unmute");
        break;
      case "scene":
        if (!param) throw new Error(L("U příkazu není vybraná scéna.", "No scene is picked for this command."));
        await obs.call("SetCurrentProgramScene", { sceneName: param });
        message = `${L("Scéna", "Scene")}: ${param}`;
        break;
      case "record_toggle": {
        const r = await obs.call("ToggleRecord");
        message = r.outputActive ? L("Nahrávání běží", "Recording started") : L("Nahrávání zastaveno", "Recording stopped");
        break;
      }
      case "replay_toggle": {
        const r = await obs.call("ToggleReplayBuffer");
        message = r.outputActive ? L("Záznam do paměti zapnutý", "Replay Buffer on") : L("Záznam do paměti vypnutý", "Replay Buffer off");
        break;
      }
      case "open_clips":
        fs.mkdirSync(config.get().clipsDir, { recursive: true });
        await shell.openPath(config.get().clipsDir);
        break;
      default:
        throw new Error(L("Neznámá akce", "Unknown action"));
    }
    return { ok: true, message };
  } catch (e) {
    const message = e && e.code === "NO_OBS" ? L("OBS není připojené. Je spuštěné a má zapnutý WebSocket server?", "OBS isn't connected. Is it running with the WebSocket server enabled?") : String((e && e.message) || e);
    return { ok: false, message };
  }
}

module.exports = { ACTIONS, run, notify, markChatClip: () => (chatClipAt = Date.now()), setOnClip: (fn) => (onClip = fn) };
