// PNGtuber: aplikace čte hlasitost mikrofonu přímo z OBS (měřák hlasitosti) a posílá ji
// do overlaye PNGtuberu v OBS (událost „tejbot_pngtuber“ do všech zdrojů Prohlížeč). Nic nejde přes internet.
const obs = require("./obs");
const config = require("./config");

const MIC_KINDS = ["wasapi_input_capture", "coreaudio_input_capture", "pulse_input_capture", "alsa_input_capture", "jack_input_client"];
let on = false;
let mic = "";
let last = -1;
let lastAt = 0;

function emit(data) {
  return obs.call("CallVendorRequest", { vendorName: "obs-browser", requestType: "emit_event", requestData: { event_name: "tejbot_pngtuber", event_data: data } }).catch(() => {});
}

async function findMic() {
  const name = config.get().obs.mic;
  if (name) return name;
  try {
    const r = await obs.call("GetInputList");
    const i = r.inputs.find((x) => MIC_KINDS.includes(x.unversionedInputKind || x.inputKind));
    return i ? i.inputName : "";
  } catch {
    return "";
  }
}

function onMeters(d) {
  if (!on || !mic) return;
  const i = (d.inputs || []).find((x) => x.inputName === mic);
  if (!i) return;
  let peak = 0;
  for (const ch of i.inputLevelsMul || []) peak = Math.max(peak, Number(ch[1]) || 0);
  const db = 20 * Math.log10(peak || 1e-6);
  const level = Math.round(Math.max(0, Math.min(1, (db + 60) / 60)) * 100) / 100;
  const now = Date.now();
  // posílá se jen změna (a jednou za půl vteřiny pro jistotu)
  if (Math.abs(level - last) < 0.03 && now - lastAt < 500) return;
  last = level;
  lastAt = now;
  emit({ level });
}
obs.onRaw("InputVolumeMeters", onMeters);

/** Zapne / vypne posílání hlasu podle nastavení (volá se při připojení k OBS a změně nastavení) */
async function sync(allowed) {
  const want = !!(allowed && config.get().png && config.get().png.enabled && obs.state().connected);
  if (want) {
    mic = await findMic();
    await obs.meters(true);
    on = true;
  } else if (on) {
    on = false;
    if (obs.state().connected) {
      await emit({ level: 0 });
      await obs.meters(false);
    }
  }
}

module.exports = { sync, expr: (n) => emit({ expr: n }), micName: () => mic };
