// Scény do OBS jedním klikem: web pošle, co má v každé scéně být, a tady se to postaví přes obs-websocket.
// Staví jen scény „TejBot – …“. Streamerovy vlastní scény a zdroje nemění, kameru a hru použije ty, co už má.
const obs = require("./obs");
const config = require("./config");
const { tr } = require("./i18n");

const L = (cs, en) => tr(config.get().lang, cs, en);
const CAM_KINDS = ["dshow_input", "av_capture_input_v2", "av_capture_input", "macos-avcapture", "v4l2_input"];
const GAME_KINDS = ["game_capture", "screen_capture", "display_capture", "monitor_capture", "xshm_input", "pipewire-desktop-capture-source", "pipewire-screen-capture-source"];
const camKind = () => (process.platform === "win32" ? "dshow_input" : process.platform === "darwin" ? "av_capture_input_v2" : "v4l2_input");
const gameKind = () => (process.platform === "win32" ? "game_capture" : process.platform === "darwin" ? "screen_capture" : "xshm_input");

async function itemId(scene, source) {
  try {
    return (await obs.call("GetSceneItemId", { sceneName: scene, sourceName: source })).sceneItemId;
  } catch {
    return (await obs.call("CreateSceneItem", { sceneName: scene, sourceName: source, sceneItemEnabled: true })).sceneItemId;
  }
}

async function exists(name) {
  return obs.call("GetInputSettings", { inputName: name }).then(
    () => true,
    () => false
  );
}

/** Postaví scény podle návrhu z webu. Vrátí zprávu pro streamera. */
async function buildScenes(payload) {
  const specs = Array.isArray(payload && payload.scenes) ? payload.scenes.slice(0, 10) : [];
  if (!specs.length) throw new Error(L("Web neposlal žádné scény.", "The web didn't send any scenes."));
  const video = await obs.call("GetVideoSettings");
  const sx = (Number(video.baseWidth) || 1920) / 1920;
  const sy = (Number(video.baseHeight) || 1080) / 1080;
  const inputs = (await obs.call("GetInputList")).inputs.map((i) => ({ name: i.inputName, kind: i.unversionedInputKind || i.inputKind }));
  let camera = (inputs.find((i) => CAM_KINDS.includes(i.kind)) || {}).name || "";
  let game = (inputs.find((i) => i.kind === "game_capture") || inputs.find((i) => GAME_KINDS.includes(i.kind)) || {}).name || "";
  const notes = [];
  const have = new Set((await obs.call("GetSceneList")).scenes.map((s) => s.sceneName));
  let built = 0;

  for (const spec of specs) {
    const scene = String(spec.name || "").slice(0, 100);
    if (!scene.startsWith("TejBot")) continue; // jen naše scény
    if (!have.has(scene)) {
      await obs.call("CreateScene", { sceneName: scene });
      have.add(scene);
    }
    const order = [];
    for (const it of Array.isArray(spec.items) ? spec.items : []) {
      if (it.kind === "browser") {
        const name = String(it.name || "TejBot").slice(0, 100);
        if (!/^https:\/\//.test(String(it.url || ""))) continue;
        const settings = { url: String(it.url), width: Math.round(Number(it.w) || 1920), height: Math.round(Number(it.h) || 1080) };
        if (await exists(name)) await obs.call("SetInputSettings", { inputName: name, inputSettings: settings, overlay: true });
        else await obs.call("CreateInput", { sceneName: scene, inputName: name, inputKind: "browser_source", inputSettings: settings, sceneItemEnabled: true });
        const id = await itemId(scene, name);
        await obs.call("SetSceneItemTransform", { sceneName: scene, sceneItemId: id, sceneItemTransform: { positionX: (Number(it.x) || 0) * sx, positionY: (Number(it.y) || 0) * sy, scaleX: sx, scaleY: sy, boundsType: "OBS_BOUNDS_NONE" } });
        order.push(id);
      } else if (it.kind === "camera") {
        if (!camera) {
          camera = "TejBot – Kamera";
          if (!(await exists(camera))) {
            await obs.call("CreateInput", { sceneName: scene, inputName: camera, inputKind: camKind(), inputSettings: {}, sceneItemEnabled: true });
            notes.push(L("V OBS dvakrát klikni na zdroj „TejBot – Kamera“ a vyber svoji kameru.", "In OBS, double-click the “TejBot – Kamera” source and pick your camera."));
          }
        }
        const id = await itemId(scene, camera);
        await obs.call("SetSceneItemTransform", {
          sceneName: scene,
          sceneItemId: id,
          sceneItemTransform: { positionX: (Number(it.x) || 0) * sx, positionY: (Number(it.y) || 0) * sy, boundsType: "OBS_BOUNDS_SCALE_INNER", boundsWidth: Math.max(2, (Number(it.w) || 480) * sx), boundsHeight: Math.max(2, (Number(it.h) || 270) * sy), boundsAlignment: 0 },
        });
        order.push(id);
      } else if (it.kind === "game") {
        if (!game) {
          game = "TejBot – Hra";
          if (!(await exists(game))) {
            await obs.call("CreateInput", { sceneName: scene, inputName: game, inputKind: gameKind(), inputSettings: gameKind() === "game_capture" ? { capture_mode: "any_fullscreen" } : {}, sceneItemEnabled: true });
            notes.push(L("Zdroj „TejBot – Hra“ zachytí hru přes celou obrazovku. Když hraješ v okně, dvakrát na něj klikni a vyber okno hry.", "The “TejBot – Hra” source captures a full-screen game. If you play in a window, double-click it and pick the game window."));
          }
        }
        const id = await itemId(scene, game);
        await obs.call("SetSceneItemTransform", { sceneName: scene, sceneItemId: id, sceneItemTransform: { positionX: 0, positionY: 0, boundsType: "OBS_BOUNDS_SCALE_INNER", boundsWidth: 1920 * sx, boundsHeight: 1080 * sy, boundsAlignment: 0 } });
        order.push(id);
      }
    }
    // pořadí vrstev: první položka úplně dole, alerty nahoře
    for (let i = 0; i < order.length; i++) await obs.call("SetSceneItemIndex", { sceneName: scene, sceneItemId: order[i], sceneItemIndex: i }).catch(() => {});
    built++;
  }
  return [L(`Hotovo, postavené scény „TejBot – …“ v OBS: ${built}.`, `Done, “TejBot – …” scenes built in OBS: ${built}.`), ...notes].join(" ");
}

module.exports = { buildScenes };
