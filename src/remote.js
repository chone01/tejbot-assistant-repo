// Odkazy od pomocníků z webu TejBota: aplikace se každých pár vteřin zeptá, jestli jí někdo neposlal
// odkaz do OBS, podle nastavení se streamera zeptá a přidá ho jako zdroj Prohlížeč.
// K tomu webu hlásí, jaké scény v OBS jsou (pomocník pak vybírá, kam zdroj přidat).
const config = require("./config");
const obs = require("./obs");
const api = require("./api");
const { tr } = require("./i18n");

const L = (cs, en) => tr(config.get().lang, cs, en);
const POLL_MS = 3000; // panel v OBS čeká na start streamu, ať to netrvá dlouho
const WAIT_OBS_MS = 15 * 60_000; // když OBS není připojené, odkaz počká

let running = false;
let pollTimer = null;
let sceneTimer = null;
let asker = async () => false; // okno se zeptá streamera (nastaví main.js)
let onDone = () => {};
const waiting = new Map(); // id -> { cmd, since } (čeká na připojení OBS)
const handled = new Set();

const isTejbot = (u) => {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return h === "tejbot.eu" || h.endsWith(".tejbot.eu");
  } catch {
    return false;
  }
};

async function report(id, status, message) {
  try {
    await api.commandDone(id, status, message);
  } catch {
    /* web nedostupný – příkaz na webu časem vyprší */
  }
}

/** Přidá (nebo u stejného názvu přepíše) zdroj Prohlížeč do OBS */
async function addSource(p) {
  const name = String(p.name || "TejBot").slice(0, 80);
  const settings = { url: String(p.url), width: Number(p.width) || 1920, height: Number(p.height) || 1080 };
  const exists = await obs.call("GetInputSettings", { inputName: name }).then(
    () => true,
    () => false
  );
  if (exists) {
    await obs.call("SetInputSettings", { inputName: name, inputSettings: settings, overlay: true });
    return L(`Zdroj „${name}“ už v OBS byl, změnil se mu odkaz.`, `Source “${name}” was already in OBS, its link was updated.`);
  }
  let scene = String(p.scene || "");
  if (!scene) scene = (await obs.call("GetCurrentProgramScene")).currentProgramSceneName;
  else {
    const list = (await obs.call("GetSceneList")).scenes.map((s) => s.sceneName);
    if (!list.includes(scene)) throw new Error(L(`Scéna „${scene}“ v OBS není.`, `There's no scene “${scene}” in OBS.`));
  }
  await obs.call("CreateInput", { sceneName: scene, inputName: name, inputKind: "browser_source", inputSettings: settings, sceneItemEnabled: true });
  return L(`Přidáno do scény „${scene}“.`, `Added to scene “${scene}”.`);
}

async function handle(cmd) {
  if (handled.has(cmd.id)) return;
  const p = cmd.payload || {};
  // panel „Začít vysílat“ v OBS (tajný odkaz streamera) – bez ptaní
  if (cmd.kind === "go_live" || cmd.kind === "stop_stream") {
    handled.add(cmd.id);
    if (!obs.state().connected) return report(cmd.id, "error", L("Tejbot Assistent není připojený k OBS.", "Tejbot Assistent isn't connected to OBS."));
    try {
      const st = await obs.call("GetStreamStatus");
      if (cmd.kind === "go_live") {
        if (!st.outputActive) {
          obs.markSelfStart();
          await obs.call("StartStream");
        }
        if (p.record) await obs.call("StartRecord").catch(() => {});
        onDone({ ok: true, message: L("Vysíláš! Ať se stream daří.", "You're live! Have a great stream.") });
      } else if (st.outputActive) await obs.call("StopStream");
      return report(cmd.id, "done", "");
    } catch (e) {
      return report(cmd.id, "error", `${L("OBS stream nespustilo", "OBS didn't start the stream")}: ${String((e && e.message) || e).slice(0, 200)}`);
    }
  }
  const mode = config.get().remote.mode;
  if (cmd.kind !== "add_source" || !/^https?:\/\//i.test(String(p.url || ""))) {
    handled.add(cmd.id);
    return report(cmd.id, "error", "unknown");
  }
  if (mode === "off") {
    handled.add(cmd.id);
    return report(cmd.id, "declined", L("Streamer má přijímání odkazů do OBS vypnuté.", "The streamer has turned off receiving OBS links."));
  }
  if (!obs.state().connected) {
    if (!waiting.has(cmd.id)) waiting.set(cmd.id, { cmd, since: Date.now() });
    return;
  }
  waiting.delete(cmd.id);
  handled.add(cmd.id);
  const ask = mode === "ask" || !isTejbot(p.url);
  if (ask && !(await asker(cmd))) return report(cmd.id, "declined", L("Streamer odkaz nepřidal.", "The streamer didn't add the link."));
  try {
    const msg = await addSource(p);
    await report(cmd.id, "done", msg);
    onDone({ ok: true, message: `${cmd.by_name ? `${cmd.by_name}: ` : ""}${p.name} – ${msg}` });
  } catch (e) {
    const msg = String((e && e.message) || e).slice(0, 280);
    await report(cmd.id, "error", msg);
    onDone({ ok: false, message: `${L("Odkaz do OBS se nepřidal", "The OBS link wasn't added")}: ${msg}` });
  }
}

async function poll() {
  if (!running) return;
  try {
    const r = await api.commands();
    for (const c of (r.ok && r.data && r.data.list) || []) await handle(c);
  } catch {
    /* web chvíli nejde */
  }
  // odkazy, které čekaly na OBS
  for (const [id, w] of [...waiting]) {
    if (Date.now() - w.since > WAIT_OBS_MS) {
      waiting.delete(id);
      handled.add(id);
      await report(id, "error", L("OBS nebylo připojené.", "OBS wasn't connected."));
    } else if (obs.state().connected) await handle(w.cmd);
  }
  if (running) pollTimer = setTimeout(poll, POLL_MS);
}

/** Pošle webu scény (s malým zpožděním, OBS jich při změně hlásí víc najednou) */
function reportScenes() {
  clearTimeout(sceneTimer);
  sceneTimer = setTimeout(async () => {
    if (!running) return;
    let st = { connected: false, scenes: [], current: "" };
    if (obs.state().connected) {
      try {
        st = { connected: true, ...(await obs.scenes()) };
      } catch {
        /* OBS se právě odpojuje */
      }
    }
    try {
      await api.obsState(st);
    } catch {
      /* zkusí se při další změně */
    }
  }, 1500);
}
obs.events.on("scenes", reportScenes);

module.exports = {
  start() {
    if (running) return;
    running = true;
    reportScenes();
    poll();
  },
  stop() {
    running = false;
    clearTimeout(pollTimer);
    clearTimeout(sceneTimer);
  },
  setAsker: (fn) => (asker = fn),
  setOnDone: (fn) => (onDone = fn),
  reportScenes,
};
