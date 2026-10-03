// Neviditelné okno, které poslouchá mikrofon a hledá v řeči věty z příkazů.
// Rozpoznávání běží celé v tomhle počítači (knihovna Vosk), hlas se nikam neposílá.
const tb = window.tejbot;
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

async function start() {
  const cfg = await tb.call("voiceConfig");
  const phrases = [...new Set(cfg.phrases.map(norm).filter(Boolean))];
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
    const audio = { echoCancellation: true, noiseSuppression: true, channelCount: 1, ...(cfg.deviceId ? { deviceId: { exact: cfg.deviceId } } : {}) };
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
  // jen věty z příkazů + "[unk]" pro všechno ostatní: přesnější a nespouští se to náhodnou řečí
  const rec = new model.KaldiRecognizer(ctx.sampleRate, JSON.stringify([...phrases, "[unk]"]));
  rec.setWords(true);
  let last = 0;
  rec.on("result", (m) => {
    const raw = String((m.result && m.result.text) || "");
    // "[unk]" = jiná řeč. Věta platí, jen když zazněla celá a souvisle (kousek věty nestačí).
    const parts = raw.split("[unk]").map(norm).filter(Boolean);
    if (!parts.length) return;
    const found = parts.find((p) => phrases.includes(p));
    const words = (m.result.result || []).filter((w) => w.word !== "[unk]");
    const conf = words.length ? words.reduce((a, w) => a + (w.conf || 0), 0) / words.length : 1;
    const hit = !!found && conf >= 0.8 && Date.now() - last > 2500;
    if (hit) last = Date.now();
    tb.call("voiceHeard", { text: found || parts.join(" … "), hit, conf: Math.round(conf * 100) });
  });
  const src = ctx.createMediaStreamSource(stream);
  const node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (e) => {
    try {
      rec.acceptWaveform(e.inputBuffer);
    } catch {
      /* model se ještě chystá */
    }
  };
  const mute = ctx.createGain(); // ať se mikrofon nepouští do reproduktorů
  mute.gain.value = 0;
  src.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);
  stream.getAudioTracks()[0].addEventListener("ended", () => tb.call("voiceStatus", { status: "error", error: "mic: ended" }));
  tb.call("voiceStatus", { status: "listening" });
}
start().catch((e) => tb.call("voiceStatus", { status: "error", error: String((e && e.message) || e) }));
