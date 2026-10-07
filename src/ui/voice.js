// Neviditelné okno, které poslouchá mikrofon a hledá v řeči oslovení ("Tejbot") a větu z příkazů.
// Rozpoznávání běží celé v tomhle počítači (knihovna Vosk), hlas se nikam neposílá.
const tb = window.tejbot;
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function start() {
  const cfg = await tb.call("voiceConfig");
  const phrases = [...new Set(cfg.phrases.map(norm).filter(Boolean))];
  let wakes = [...new Set((cfg.wakes || []).map(norm).filter(Boolean))];
  // seznam mikrofonů pro výběr v nastavení (názvy jsou vidět až po povolení mikrofonu)
  const report = async () => {
    const list = await navigator.mediaDevices.enumerateDevices();
    tb.call("voiceDevices", list.filter((d) => d.kind === "audioinput" && d.deviceId !== "communications").map((d) => ({ id: d.deviceId, name: d.label || "Mikrofon" })));
  };
  if (!phrases.length) {
    await report().catch(() => {});
    return tb.call("voiceStatus", { status: "nophrases" });
  }
  tb.call("voiceStatus", { status: "loading" });

  let stream;
  try {
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, ...(cfg.deviceId ? { deviceId: { exact: cfg.deviceId } } : {}) };
    stream = await navigator.mediaDevices.getUserMedia({ audio, video: false }).catch(() => navigator.mediaDevices.getUserMedia({ audio: true, video: false }));
  } catch (e) {
    return tb.call("voiceStatus", { status: "error", error: `mic: ${e.name || e}` });
  }
  await report().catch(() => {});

  let model;
  try {
    model = await Vosk.createModel(`tbmodel://model/${cfg.lang}.tar.gz`, 0);
  } catch (e) {
    return tb.call("voiceStatus", { status: "error", error: `model: ${e && e.message ? e.message : e}` });
  }

  const ctx = new AudioContext();
  let armedUntil = 0; // oslovení zaznělo samo -> chvíli čekáme na větu
  let last = 0;
  const onResult = (m) => {
    const raw = String((m.result && m.result.text) || "");
    // "[unk]" = jiná řeč. Věta platí, jen když zazněla celá a souvisle (kousek věty nestačí).
    const parts = raw.split("[unk]").map(norm).filter(Boolean);
    if (!parts.length) return;
    const words = (m.result.result || []).filter((w) => w.word !== "[unk]");
    const conf = words.length ? words.reduce((a, w) => a + (w.conf || 0), 0) / words.length : 1;
    let found = null;
    let wake = false;
    let alone = null; // věta bez oslovení
    for (const p of parts) {
      if (!wakes.length) {
        if (phrases.includes(p)) found = p;
        continue;
      }
      const w = wakes.find((x) => p === x || p.startsWith(`${x} `) || p.endsWith(` ${x}`) || p.includes(` ${x} `));
      if (w) {
        wake = true;
        const after = norm(p.slice(p.lastIndexOf(w) + w.length));
        if (phrases.includes(after)) found = after;
        else if (!after) armedUntil = Date.now() + 5000;
      } else if (phrases.includes(p)) {
        if (Date.now() < armedUntil) found = p;
        else alone = p;
      }
    }
    const hit = !!found && conf >= cfg.minConf && Date.now() - last > 2500;
    if (found) armedUntil = 0;
    if (hit) last = Date.now();
    tb.call("voiceHeard", { text: found || alone || "", wake: wake || (!!found && wakes.length > 0), hit, conf: Math.round(conf * 100), reason: found ? (hit ? "" : "unsure") : alone ? "nowake" : wake ? "wakeonly" : "other" });
  };
  const make = () => {
    // jen oslovení + věty z příkazů + "[unk]" pro všechno ostatní: přesnější a nespouští se to náhodnou řečí
    const r = new model.KaldiRecognizer(ctx.sampleRate, JSON.stringify([...wakes, ...phrases, "[unk]"]));
    r.setWords(true);
    r.on("result", onResult);
    return r;
  };
  let rec = make();
  // model ohlásí slova, která nezná. Oslovení s neznámým slovem vyřadíme a zkusíme další podobu.
  await wait(1200);
  const unknown = new Set(((await tb.call("voiceUnknown")) || []).map(norm));
  const usable = wakes.filter((w) => !w.split(" ").some((x) => unknown.has(x)));
  if (usable.length !== wakes.length) {
    wakes = usable;
    const old = rec;
    rec = make();
    try {
      old.remove();
    } catch {
      /* nevadí */
    }
  }
  tb.call("voiceWakes", wakes);

  const src = ctx.createMediaStreamSource(stream);
  const gain = ctx.createGain(); // zesílení mikrofonu (nastaví se při zkoušce)
  gain.gain.value = cfg.gain || 1;
  const node = ctx.createScriptProcessor(4096, 1, 1);
  let peak = 0;
  let calib = null; // { until, peak }
  node.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    let max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const a = Math.abs(d[i]);
      if (a > max) max = a;
    }
    if (max > peak) peak = max;
    if (calib && max > calib.peak) calib.peak = max;
    try {
      rec.acceptWaveform(e.inputBuffer);
    } catch {
      /* model se ještě chystá */
    }
  };
  setInterval(() => {
    tb.call("voiceLevel", Math.min(1, peak));
    peak = 0;
    if (calib && Date.now() > calib.until) {
      const before = gain.gain.value;
      const real = calib.peak / before; // hlasitost bez zesílení
      calib = null;
      if (real < 0.004) return void tb.call("voiceCalibrated", { ok: false });
      const g = Math.min(8, Math.max(0.3, 0.6 / real));
      gain.gain.value = g;
      tb.call("voiceCalibrated", { ok: true, gain: Math.round(g * 100) / 100 });
    }
  }, 150);
  tb.on("calibrate", () => {
    calib = { until: Date.now() + 4000, peak: 0 };
  });
  const mute = ctx.createGain(); // ať se mikrofon nepouští do reproduktorů
  mute.gain.value = 0;
  src.connect(gain);
  gain.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  stream.getAudioTracks()[0].addEventListener("ended", () => tb.call("voiceStatus", { status: "error", error: "mic: ended" }));
  tb.call("voiceStatus", { status: "listening" });
}
start().catch((e) => tb.call("voiceStatus", { status: "error", error: String((e && e.message) || e) }));
