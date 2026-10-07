// Presety mikrofonu: aplikace nastaví filtry na mikrofon přímo v OBS (potlačení šumu, brána, ekvalizér, kompresor, limiter).
// Jsou to obyčejné filtry OBS, takže fungují i s vypnutou aplikací. Naše filtry mají v názvu "TejBot",
// "Vrátit zpět" smaže jen je a znovu zapne filtry, které jsme uživateli při použití vypnuli.
const config = require("./config");
const obs = require("./obs");

const L = (cs, en) => (config.get().lang === "en" ? en : cs);
const clamp = (v, min, max, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

// Hodnoty, které jdou ladit posuvníky. dB = decibely.
const FIELDS = [
  { key: "denoise", type: "bool", cs: "Potlačení šumu (větrák, klávesnice)", en: "Noise suppression (fan, keyboard)" },
  { key: "gate", min: -60, max: -10, step: 1, unit: "dB", cs: "Šumová brána: od jaké hlasitosti pustí hlas", en: "Noise gate: how loud before your voice passes", hintCs: "Níž = pustí i tichý hlas, výš = líp odřízne ruchy", hintEn: "Lower = lets quiet speech through, higher = cuts more noise" },
  { key: "low", min: -12, max: 12, step: 0.5, unit: "dB", cs: "Basy", en: "Bass" },
  { key: "mid", min: -12, max: 12, step: 0.5, unit: "dB", cs: "Středy", en: "Mids" },
  { key: "high", min: -12, max: 12, step: 0.5, unit: "dB", cs: "Výšky", en: "Treble" },
  { key: "comp", min: -40, max: 0, step: 1, unit: "dB", cs: "Kompresor: od jaké hlasitosti stlačuje", en: "Compressor: threshold", hintCs: "Níž = vyrovnanější a hutnější hlas", hintEn: "Lower = more even, denser voice" },
  { key: "ratio", min: 1, max: 10, step: 0.5, unit: ":1", cs: "Kompresor: síla", en: "Compressor: ratio" },
  { key: "gain", min: -6, max: 18, step: 0.5, unit: "dB", cs: "Výsledná hlasitost", en: "Output volume" },
  { key: "limit", min: -12, max: 0, step: 0.5, unit: "dB", cs: "Limiter: strop hlasitosti", en: "Limiter: ceiling", hintCs: "Hlas nikdy nepřeleze tuhle hodnotu (nepřebuzuje)", hintEn: "Your voice never goes above this (no clipping)" },
];

// Výchozí presety. Jsou to rozumné startovní hodnoty, doladění je na uchu (místnost, vzdálenost, zisk na zvukovce).
const PRESETS = [
  { key: "broadcast", cs: "Vysílací hlas", en: "Broadcast voice", descCs: "Plný, vyrovnaný hlas jako z rádia", descEn: "A full, even radio-style voice", v: { denoise: true, gate: -32, low: 2, mid: -1.5, high: 3, comp: -20, ratio: 4, gain: 4, limit: -3 } },
  { key: "natural", cs: "Přirozený", en: "Natural", descCs: "Jen lehké vyčištění, hlas zůstane tvůj", descEn: "A light clean-up, your voice stays yours", v: { denoise: true, gate: -40, low: 0, mid: 0, high: 1.5, comp: -18, ratio: 2.5, gain: 2, limit: -2 } },
  { key: "noisy", cs: "Hlučná místnost", en: "Noisy room", descCs: "Silnější brána proti větráku a klávesnici", descEn: "A stronger gate against fans and keyboards", v: { denoise: true, gate: -26, low: -2, mid: 0, high: 2, comp: -18, ratio: 4, gain: 3, limit: -3 } },
  { key: "nt1a", cs: "Rode NT1-A", en: "Rode NT1-A", descCs: "Pro citlivý kondenzátor s ostřejšími výškami", descEn: "For a sensitive condenser with brighter highs", v: { denoise: true, gate: -36, low: 1.5, mid: -2, high: 1, comp: -22, ratio: 3.5, gain: 5, limit: -3 } },
];

function clean(v) {
  const d = PRESETS[0].v;
  const o = v && typeof v === "object" ? v : {};
  const out = { denoise: typeof o.denoise === "boolean" ? o.denoise : d.denoise };
  for (const f of FIELDS) if (f.type !== "bool") out[f.key] = clamp(o[f.key], f.min, f.max, d[f.key]);
  return out;
}

// Naše filtry v pořadí, v jakém mají v OBS být. kind = označení filtru v OBS.
const TAG = "TejBot · ";
const CHAIN = (v) => [
  v.denoise ? { name: `${TAG}1 Potlačení šumu`, kind: "noise_suppress_filter_v2", settings: { method: "rnnoise" } } : null,
  { name: `${TAG}2 Šumová brána`, kind: "noise_gate_filter", settings: { open_threshold: v.gate, close_threshold: v.gate - 6, attack_time: 10, hold_time: 200, release_time: 150 } },
  { name: `${TAG}3 Ekvalizér`, kind: "basic_eq_filter", settings: { low: v.low, mid: v.mid, high: v.high } },
  { name: `${TAG}4 Kompresor`, kind: "compressor_filter", settings: { ratio: v.ratio, threshold: v.comp, attack_time: 6, release_time: 80, output_gain: v.gain } },
  { name: `${TAG}5 Limiter`, kind: "limiter_filter", settings: { threshold: v.limit, release_time: 60 } },
].filter(Boolean);

function micName() {
  const name = config.get().obs.mic;
  if (!name) throw new Error(L("Nejdřív v záložce OBS vyber, který vstup je tvůj mikrofon.", "First pick which input is your microphone in the OBS tab."));
  return name;
}
const listFilters = async (source) => (await obs.call("GetSourceFilterList", { sourceName: source })).filters || [];
const ours = (f) => String(f.filterName || "").startsWith(TAG);

/** Co je teď na mikrofonu v OBS (pro záložku Mikrofon) */
async function status() {
  const m = config.get().mic;
  const base = { fields: FIELDS, presets: PRESETS, preset: m.preset, values: clean(m.values), disableOthers: m.disableOthers !== false, applied: false, bypass: false, monitoring: false, others: 0, ready: false, error: "" };
  try {
    const source = micName();
    const filters = await listFilters(source);
    const mine = filters.filter(ours);
    const mon = await obs.call("GetInputAudioMonitorType", { inputName: source }).catch(() => null);
    return { ...base, ready: true, applied: mine.length > 0, bypass: mine.length > 0 && mine.every((f) => f.filterEnabled === false), others: filters.filter((f) => !ours(f)).length, monitoring: !!mon && mon.monitorType !== "OBS_MONITORING_TYPE_NONE" };
  } catch (e) {
    return { ...base, error: e && e.code === "NO_OBS" ? L("OBS není připojené.", "OBS isn't connected.") : String((e && e.message) || e) };
  }
}

/** Nastaví filtry podle hodnot. Existující naše filtry jen upraví (ať zvuk při ladění necuká), chybějící přidá, nadbytečné smaže. */
async function apply(preset, values, disableOthers) {
  const source = micName();
  const v = clean(values);
  const cfg = config.get();
  const filters = await listFilters(source);
  const have = new Map(filters.filter(ours).map((f) => [f.filterName, f]));
  const want = CHAIN(v);
  let skipped = "";
  for (const w of want) {
    try {
      if (have.has(w.name)) await obs.call("SetSourceFilterSettings", { sourceName: source, filterName: w.name, filterSettings: w.settings, overlay: true });
      else await obs.call("CreateSourceFilter", { sourceName: source, filterName: w.name, filterKind: w.kind, filterSettings: w.settings });
    } catch (e) {
      // starší OBS některý filtr nemá (třeba ekvalizér) -> ostatní se nastaví i tak
      skipped = w.name.slice(TAG.length + 2);
    }
    have.delete(w.name);
  }
  // pořadí: nejdřív filtry uživatele, pak naše v pořadí šum -> brána -> ekvalizér -> kompresor -> limiter
  const base = filters.filter((x) => !ours(x)).length;
  for (let i = 0; i < want.length; i++) await obs.call("SetSourceFilterIndex", { sourceName: source, filterName: want[i].name, filterIndex: base + i }).catch(() => {});
  for (const name of have.keys()) await obs.call("RemoveSourceFilter", { sourceName: source, filterName: name }).catch(() => {});
  // ostatní filtry uživatele: jen vypnout (nemazat) a zapamatovat si je pro "Vrátit zpět"
  const before = new Set(cfg.mic.disabled || []);
  if (disableOthers) {
    for (const f of filters.filter((x) => !ours(x) && x.filterEnabled !== false)) {
      await obs.call("SetSourceFilterEnabled", { sourceName: source, filterName: f.filterName, filterEnabled: false }).catch(() => {});
      before.add(f.filterName);
    }
  }
  cfg.mic = { ...cfg.mic, preset: String(preset || "custom").slice(0, 20), values: v, disableOthers: !!disableOthers, disabled: [...before].slice(0, 40), source };
  config.save();
  return { ok: true, message: skipped ? L(`Nastaveno. Filtr „${skipped}“ tvoje OBS nemá, zbytek funguje.`, `Applied. Your OBS doesn't have the “${skipped}” filter, the rest works.`) : L("Preset je v OBS nastavený.", "The preset is set in OBS.") };
}

/** Porovnání: naše filtry dočasně vypnout / zapnout */
async function bypass(on) {
  const source = micName();
  for (const f of (await listFilters(source)).filter(ours)) await obs.call("SetSourceFilterEnabled", { sourceName: source, filterName: f.filterName, filterEnabled: !on });
  return { ok: true, message: on ? L("Teď slyšíš mikrofon BEZ presetu.", "You now hear the microphone WITHOUT the preset.") : L("Teď slyšíš mikrofon S presetem.", "You now hear the microphone WITH the preset.") };
}

/** Poslech ve sluchátkách přes OBS (do streamu jde mikrofon dál) */
async function monitor(on) {
  const source = micName();
  const cfg = config.get();
  if (on) {
    const cur = await obs.call("GetInputAudioMonitorType", { inputName: source });
    if (cur.monitorType === "OBS_MONITORING_TYPE_NONE") cfg.mic.prevMonitor = cur.monitorType;
    await obs.call("SetInputAudioMonitorType", { inputName: source, monitorType: "OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT" });
  } else {
    await obs.call("SetInputAudioMonitorType", { inputName: source, monitorType: cfg.mic.prevMonitor || "OBS_MONITORING_TYPE_NONE" });
  }
  config.save();
  return { ok: true, message: on ? L("Poslech zapnutý. Vezmi si sluchátka, ať se zvuk nevrací do mikrofonu.", "Monitoring on. Use headphones so the sound doesn't feed back into the mic.") : L("Poslech vypnutý.", "Monitoring off.") };
}

/** Vrátit zpět: smaže jen naše filtry a zapne ty, které jsme vypnuli */
async function revert() {
  const source = micName();
  const cfg = config.get();
  for (const f of (await listFilters(source)).filter(ours)) await obs.call("RemoveSourceFilter", { sourceName: source, filterName: f.filterName }).catch(() => {});
  for (const name of cfg.mic.disabled || []) await obs.call("SetSourceFilterEnabled", { sourceName: source, filterName: name, filterEnabled: true }).catch(() => {});
  await obs.call("SetInputAudioMonitorType", { inputName: source, monitorType: cfg.mic.prevMonitor || "OBS_MONITORING_TYPE_NONE" }).catch(() => {});
  cfg.mic = { ...cfg.mic, disabled: [] };
  config.save();
  return { ok: true, message: L("Vráceno. Mikrofon v OBS je jako před presetem.", "Reverted. The microphone in OBS is as it was before the preset.") };
}

/** Obalí akci: chyby vrátí jako srozumitelnou zprávu */
const safe = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, message: e && e.code === "NO_OBS" ? L("OBS není připojené. Je spuštěné a má zapnutý WebSocket server?", "OBS isn't connected. Is it running with the WebSocket server enabled?") : String((e && e.message) || e) };
  }
};

module.exports = { status, apply: safe(apply), bypass: safe(bypass), monitor: safe(monitor), revert: safe(revert), PRESETS, FIELDS };
