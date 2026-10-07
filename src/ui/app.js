// Okno aplikace. Všechno důležité dělá hlavní část (main.js), tady se jen kreslí a kliká.
const tb = window.tejbot;
const $app = document.getElementById("app");
const $toast = document.getElementById("toast");

let S = null; // stav z hlavní části
let tab = "home";
let cmds = []; // rozpracované příkazy
let lists = { inputs: [], scenes: [] };
let pairError = "";

const t = (cs, en) => (S && S.config.lang === "en" ? en : cs);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function toast(r) {
  $toast.textContent = r.message;
  $toast.className = `toast ${r.ok ? "" : "bad"}`;
  $toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ($toast.hidden = true), 4500);
}

// ---------------------------------------------------------------- obrazovky před spárováním

function screenPair() {
  return `<div class="center"><div class="box">
    <img class="big" src="icon.png" alt="" />
    <h1>Tejbot Assistent</h1>
    <p class="soft">${t("Spáruj aplikaci se svým kanálem.", "Pair the app with your channel.")}</p>
    <div class="card">
      <label class="f" for="code">${t("Kód z webu TejBota", "Code from the TejBot website")}</label>
      <input id="code" class="code" type="text" maxlength="12" placeholder="ABCD2345" autofocus />
      ${pairError ? `<p class="error">${esc(pairError)}</p>` : ""}
      <div class="row sp" style="margin-top:14px">
        <a data-open="/dashboard">${t("Kde vezmu kód?", "Where do I get the code?")}</a>
        <button class="btn primary" id="pair">${t("Spárovat", "Pair")}</button>
      </div>
      <ol class="steps small">
        <li>${t("Na webu tejbot.eu otevři svůj dashboard.", "Open your dashboard on tejbot.eu.")}</li>
        <li>${t("V menu klikni na „Aplikace do PC“ a pak „Vytvořit kód“.", "Click “Desktop app” in the menu, then “Create a code”.")}</li>
        <li>${t("Kód opiš sem.", "Type the code here.")}</li>
      </ol>
    </div>
    <p class="muted small" style="margin-top:14px">${t("Aplikace nechce heslo ke Kicku. Premium se kupuje jen na webu.", "The app never asks for your Kick password. Premium is bought on the website only.")} · <a id="lang">${S.config.lang === "en" ? "Česky" : "English"}</a></p>
  </div></div>`;
}

function screenNoPremium() {
  const id = S.config.channel ? S.config.channel.id : "";
  return `<div class="center"><div class="box">
    <img class="big" src="icon.png" alt="" />
    <h1>${t("Aplikace je součástí Premium", "The app is part of Premium")}</h1>
    <p class="soft">${t("Kanál", "Channel")} <b>${esc(S.config.channel ? S.config.channel.name : "")}</b> ${t("teď Premium nemá. Pořídit ho jde jen na webu TejBota, v aplikaci se nic neplatí.", "doesn't have Premium right now. You can only get it on the TejBot website; nothing is paid in the app.")}</p>
    <div class="row" style="justify-content:center;margin-top:18px">
      <button class="btn gold" data-open="/dashboard/${esc(id)}/premium">👑 ${t("Otevřít Premium na webu", "Open Premium on the website")}</button>
      <button class="btn" id="refresh">${t("Zkusit znovu", "Try again")}</button>
    </div>
    <p style="margin-top:16px"><a id="unpair" class="muted small">${t("Odpojit aplikaci od kanálu", "Disconnect the app from the channel")}</a></p>
  </div></div>`;
}

function screenOffline() {
  return `<div class="center"><div class="box">
    <img class="big" src="icon.png" alt="" />
    <h1>${t("Nejde se připojit k TejBotu", "Can't reach TejBot")}</h1>
    <p class="soft">${t("Zkontroluj připojení k internetu a zkus to znovu.", "Check your internet connection and try again.")}</p>
    <div style="margin-top:18px"><button class="btn primary" id="refresh">${t("Zkusit znovu", "Try again")}</button></div>
  </div></div>`;
}

function screenSetup() {
  return `<div class="center"><div class="box">
    <img class="big" src="icon.png" alt="" />
    <h1>${t("Kam ukládat klipy?", "Where should clips go?")}</h1>
    <p class="soft">${t("Vyber složku v počítači. Kdykoli ji změníš v Nastavení.", "Pick a folder on your computer. You can change it anytime in Settings.")}</p>
    <div class="card">
      <div class="path" id="dir">${esc(S.config.clipsDir)}</div>
      <div class="row sp" style="margin-top:14px">
        <button class="btn" id="pickdir">📁 ${t("Vybrat jinou složku", "Pick another folder")}</button>
        <button class="btn primary" id="finish">${t("Hotovo", "Done")}</button>
      </div>
    </div>
  </div></div>`;
}

// ---------------------------------------------------------------- hlavní okno

const TABS = () => [
  ["home", "🏠", t("Přehled", "Overview")],
  ["cmds", "⌨️", t("Příkazy", "Commands")],
  ["obs", "🎥", "OBS"],
  ["voice", "🎙️", t("Hlas", "Voice")],
  ["music", "🎧", t("Hudba", "Music")],
  ["settings", "⚙️", t("Nastavení", "Settings")],
];

function obsLabel() {
  if (S.obs.connected) return ["ok", t("Připojeno", "Connected")];
  if (S.obs.connecting) return ["warn", t("Připojuji…", "Connecting…")];
  if (S.obs.error === "password") return ["bad", t("Špatné heslo", "Wrong password")];
  return ["warn", t("Nepřipojeno", "Not connected")];
}

const when = (ms) => new Date(ms).toLocaleString(S.config.lang === "en" ? "en-GB" : "cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

// přehrávač přes celé okno (je mimo #app, ať ho nezruší překreslení)
const $player = document.getElementById("player");
function closePlayer() {
  $player.hidden = true;
  $player.innerHTML = "";
}
function openPlayer(name) {
  $player.innerHTML = `<div class="pbox"><div class="row sp" style="margin-bottom:10px"><b>${esc(name)}</b><span class="row"><button class="btn sm" id="pext">${t("Otevřít v přehrávači", "Open in player")}</button><button class="btn sm" id="pclose">✕ ${t("Zavřít", "Close")}</button></span></div><video src="tbclip://clip/${encodeURIComponent(name)}" controls autoplay></video><p class="error" id="perr" hidden>${t("Tenhle formát aplikace neumí přehrát (třeba MKV). Otevři ho tlačítkem „Otevřít v přehrávači“.", "The app can't play this format (e.g. MKV). Use “Open in player”.")}</p></div>`;
  $player.hidden = false;
  $player.querySelector("video").addEventListener("error", () => ($player.querySelector("#perr").hidden = false));
  $player.querySelector("#pclose").addEventListener("click", closePlayer);
  $player.querySelector("#pext").addEventListener("click", () => tb.call("openClip", name));
}
$player.addEventListener("click", (e) => e.target === $player && closePlayer());
document.addEventListener("keydown", (e) => e.key === "Escape" && !$player.hidden && closePlayer());

function tabHome() {
  const [oc, ol] = obsLabel();
  const tr = S.track;
  const until = S.premium.lifetime ? t("napořád", "lifetime") : S.premium.until ? new Date(S.premium.until).toLocaleDateString(S.config.lang === "en" ? "en-GB" : "cs-CZ") : "";
  return `<div class="head"><h1>${t("Přehled", "Overview")}</h1><p class="muted">${t("Aplikace běží u hodin i po zavření okna, aby fungovaly klávesové zkratky.", "The app keeps running in the tray after you close the window so your hotkeys work.")}</p></div>
  <div class="grid">
    <div class="stat"><div class="k">TejBot</div><div class="v"><span class="dot ok"></span><span class="t">Premium ${until ? `· ${esc(until)}` : ""}</span></div></div>
    <div class="stat"><div class="k">OBS</div><div class="v"><span class="dot ${oc}"></span><span class="t">${ol}</span></div></div>
    <div class="stat"><div class="k">${t("Právě hraje", "Now playing")}</div><div class="v"><span class="dot ${tr ? "ok" : ""}"></span><span class="t">${tr ? esc(`${tr.artist ? `${tr.artist} – ` : ""}${tr.title}`) : S.config.music.enabled ? t("Nic", "Nothing") : t("Vypnuto", "Off")}</span></div></div>
  </div>
  ${!S.obs.connected ? `<div class="card"><h2>${t("OBS zatím není připojené", "OBS isn't connected yet")}</h2><p class="soft">${t("Spusť OBS a zapni v něm WebSocket server. Postup je v záložce OBS.", "Start OBS and enable its WebSocket server. See the OBS tab for the steps.")}</p><div style="margin-top:12px"><button class="btn" data-tab="obs">${t("Otevřít záložku OBS", "Open the OBS tab")}</button></div></div>` : ""}
  <div class="card">
    <h2>${t("Rychlé akce", "Quick actions")}</h2>
    <div class="row">
      <button class="btn primary" data-run="clip">✂️ ${t("Uložit klip", "Save a clip")}</button>
      <button class="btn" data-run="mic_toggle">🎙️ ${t("Mikrofon", "Microphone")}</button>
      <button class="btn" data-run="record_toggle">⏺️ ${t("Nahrávání", "Recording")}</button>
      <button class="btn" data-run="open_clips">📁 ${t("Složka s klipy", "Clips folder")}</button>
    </div>
  </div>
  <div class="card">
    <div class="row sp"><h2>${t("Moje klipy", "My clips")}</h2><button class="btn sm" data-run="open_clips">📁 ${t("Otevřít složku", "Open folder")}</button></div>
    ${
      S.clips.length
        ? `<div class="clipgrid">${S.clips
            .map(
              (c) => `<div class="clip">
            <button class="thumb" data-play="${esc(c.name)}" title="${t("Přehrát", "Play")}"><video src="tbclip://clip/${encodeURIComponent(c.name)}#t=1" preload="metadata" muted tabindex="-1"></video><span class="play">▶</span></button>
            <div class="cname" title="${esc(c.name)}">${esc(c.name)}</div>
            <div class="row sp"><span class="muted small">${when(c.at)} · ${(c.size / 1048576).toFixed(1)} MB</span>
            <span class="row" style="gap:4px"><button class="btn sm" data-show="${esc(c.name)}" title="${t("Ukázat ve složce", "Show in folder")}">📁</button><button class="btn sm danger" data-trash="${esc(c.name)}" title="${t("Smazat (do koše)", "Delete (to the bin)")}">🗑️</button></span></div>
          </div>`
            )
            .join("")}</div>`
        : `<p class="muted">${t("Zatím žádný. Klipy se ukládají do:", "None yet. Clips are saved to:")}</p><div class="path" style="margin-top:8px">${esc(S.config.clipsDir)}</div>`
    }
  </div>`;
}

function actionSelect(c, i) {
  return `<select data-cmd="${i}" data-k="action">${S.actions.map((a) => `<option value="${a.key}" ${a.key === c.action ? "selected" : ""}>${esc(t(a.cs, a.en))}</option>`).join("")}</select>`;
}
function tabCmds() {
  return `<div class="head"><h1>${t("Příkazy", "Commands")}</h1><p class="muted">${t("Každý příkaz má akci a způsob, jak ji spustit: klávesovou zkratku, která funguje i ve hře, a větu pro hlas.", "Each command has an action and a way to trigger it: a hotkey that works in-game too, and a phrase for voice.")}</p></div>
  <div class="card">
    ${cmds
      .map((c, i) => {
        const needsScene = c.action === "scene";
        return `<div class="cmd">
        <div><label class="f">${t("Název", "Name")}</label><input type="text" data-cmd="${i}" data-k="name" value="${esc(c.name)}" maxlength="60" /></div>
        <div><label class="f">${t("Akce", "Action")}</label>${actionSelect(c, i)}${needsScene ? `<select style="margin-top:6px" data-cmd="${i}" data-k="param"><option value="">${t("– vyber scénu –", "– pick a scene –")}</option>${[...new Set([...lists.scenes, c.param].filter(Boolean))].map((s) => `<option ${s === c.param ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>` : ""}</div>
        <div><label class="f">${t("Povel pro hlas (max. 3 slova)", "Voice command (max 3 words)")}</label><input type="text" data-cmd="${i}" data-k="phrase" value="${esc(c.phrase)}" maxlength="80" placeholder="${t("např. udělej klip", "e.g. make a clip")}" /></div>
        <div><label class="f">${t("Klávesová zkratka", "Hotkey")}</label><input type="text" class="key" readonly data-key="${i}" value="${esc(c.hotkey)}" placeholder="${t("klikni a zmáčkni", "click and press")}" /></div>
        <div class="row"><button class="btn sm" data-test="${i}" title="${t("Vyzkoušet", "Test")}">▶</button><button class="btn sm danger" data-del="${i}" title="${t("Smazat", "Delete")}">✕</button></div>
        ${S.hotkeyErrors.includes(c.id) ? `<div class="err">⚠ ${t("Tuhle zkratku už používá jiný program, zvol jinou.", "Another program already uses this hotkey, pick a different one.")}</div>` : ""}
      </div>`;
      })
      .join("")}
    ${cmds.length === 0 ? `<p class="muted">${t("Zatím žádný příkaz.", "No commands yet.")}</p>` : ""}
    <div class="row sp" style="margin-top:14px">
      <button class="btn" id="addcmd">+ ${t("Přidat příkaz", "Add a command")}</button>
      <button class="btn primary" id="savecmds">${t("Uložit příkazy", "Save commands")}</button>
    </div>
  </div>
  <p class="muted small">${t("Zkratku smažeš klávesou Backspace. Hlasové povely zapneš v záložce Hlas.", "Clear a hotkey with Backspace. Turn voice commands on in the Voice tab.")}</p>`;
}

function tabObs() {
  const [oc, ol] = obsLabel();
  const o = S.config.obs;
  return `<div class="head"><h1>OBS</h1><p class="muted">${t("Aplikace ovládá tvoje OBS přes vestavěný WebSocket server (OBS 28 a novější).", "The app controls your OBS through its built-in WebSocket server (OBS 28 or newer).")}</p></div>
  <div class="card">
    <div class="row sp"><h2 style="margin:0"><span class="dot ${oc}" style="display:inline-block;margin-right:8px"></span>${ol}</h2><button class="btn sm" id="obsre">${t("Připojit znovu", "Reconnect")}</button></div>
    ${!S.obs.connected && !S.obs.connecting && S.obs.error === "password" ? `<p class="error">${S.hasObsPassword ? t("OBS heslo odmítlo. Zkopíruj ho v OBS znovu (Zobrazit informace o připojení → Kopírovat) a vlož sem.", "OBS rejected the password. Copy it again in OBS (Show Connect Info → Copy) and paste it here.") : t("OBS chce heslo. Vlož ho níže.", "OBS wants a password. Paste it below.")}</p>` : ""}
    ${!S.obs.connected && !S.obs.connecting && S.obs.error === "offline" ? `<p class="error">${t("K OBS se nejde připojit. Běží OBS a je v něm zapnutý WebSocket server?", "Can't connect to OBS. Is OBS running with the WebSocket server enabled?")}</p>` : ""}
    ${!S.obs.connected && S.obs.detail ? `<p class="muted small" style="margin-top:4px">${t("Podrobnosti", "Details")}: ${esc(S.obs.detail)}</p>` : ""}
    <ol class="steps">
      <li>${t("V OBS nahoře klikni na Nástroje → Nastavení WebSocket serveru.", "In OBS click Tools → WebSocket Server Settings.")}</li>
      <li>${t("Zaškrtni „Povolit WebSocket server“.", "Tick “Enable WebSocket server”.")}</li>
      <li>${t("Klikni na „Zobrazit informace o připojení“, zkopíruj heslo a vlož ho sem.", "Click “Show Connect Info”, copy the password and paste it here.")}</li>
    </ol>
    <div class="two" style="margin-top:14px">
      <div><label class="f">${t("Adresa", "Address")}</label><input type="text" id="obsurl" value="${esc(o.url)}" /></div>
      <div><label class="f">${t("Heslo", "Password")}</label><input type="password" id="obspw" placeholder="${S.hasObsPassword ? t("uložené (napiš nové pro změnu)", "saved (type a new one to change)") : ""}" /></div>
    </div>
    <div style="margin-top:12px"><button class="btn primary" id="saveobs">${t("Uložit a připojit", "Save and connect")}</button></div>
  </div>
  <div class="card">
    <h2>${t("Mikrofon", "Microphone")}</h2>
    <div class="field"><label class="f">${t("Který vstup v OBS je tvůj mikrofon", "Which OBS input is your microphone")}</label>
      <select id="mic"><option value="">${t("– vyber –", "– pick –")}</option>${[...new Set([...lists.inputs, o.mic].filter(Boolean))].map((n) => `<option ${n === o.mic ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
      ${!S.obs.connected ? `<p class="muted small" style="margin-top:6px">${t("Seznam se načte, až bude OBS připojené.", "The list loads once OBS is connected.")}</p>` : ""}
    </div>
  </div>
  <div class="card">
    <h2>${t("Klipy", "Clips")}</h2>
    <p class="soft">${t("Klip je posledních pár vteřin, které OBS drží v paměti (v OBS se to jmenuje „Záznam do paměti“). Délku nastavíš v OBS: Nastavení → Výstup → Záznam do paměti → zaškrtni „Povolit záznam do paměti“ a zvol třeba 30 s.", "A clip is the last few seconds OBS keeps in memory (Replay Buffer). Set the length in OBS: Settings → Output → Replay Buffer → tick “Enable” and choose e.g. 30 s.")}</p>
    <label class="check"><input type="checkbox" id="autoreplay" ${o.autoReplay ? "checked" : ""} /><span>${t("Zapínat záznam do paměti automaticky, když se aplikace připojí k OBS", "Start the Replay Buffer automatically when the app connects to OBS")}</span></label>
    <label class="f" style="margin-top:8px">${t("Klipy se ukládají do", "Clips are saved to")}</label>
    <div class="row"><div class="path" style="flex:1">${esc(S.config.clipsDir)}</div><button class="btn" id="pickdir">📁 ${t("Změnit", "Change")}</button></div>
  </div>`;
}

function voiceLabel() {
  const v = S.voice;
  const mic = /^mic/.test(v.error);
  return {
    off: ["", t("Vypnuto", "Off")],
    loading: ["warn", t("Připravuji rozpoznávání… (poprvé to trvá až půl minuty)", "Preparing recognition… (the first time takes up to half a minute)")],
    listening: ["ok", t("Poslouchám", "Listening")],
    nophrases: ["warn", t("Žádný příkaz nemá větu pro hlas. Doplň ji v záložce Příkazy.", "No command has a voice phrase. Add one in the Commands tab.")],
    error: ["bad", mic ? t("Nejde použít mikrofon. Zkontroluj ve Windows: Nastavení → Soukromí a zabezpečení → Mikrofon → povolit aplikacím pro stolní počítače.", "Can't use the microphone. Check Windows: Settings → Privacy & security → Microphone → allow desktop apps.") : /^model/.test(v.error) ? t("Chybí hlasový model pro tenhle jazyk.", "The voice model for this language is missing.") : t("Rozpoznávání spadlo. Vypni ho a zapni.", "Recognition crashed. Turn it off and on.")],
  }[v.status] || ["", v.status];
}
const LANG_NAMES = { cs: "Čeština", en: "English" };
const wakeName = () => {
  const w = String(S.config.voice.wakeWord || "tejbot").trim();
  return esc(/^tej\s?bot$/i.test(w) || !w ? "Tejbot" : w.charAt(0).toUpperCase() + w.slice(1));
};
function heardRow(h) {
  const why = {
    "": [t("rozuměl", "understood"), "gold"],
    unsure: [t(`nejisté (${h.conf} %)`, `unsure (${h.conf}%)`), ""],
    nowake: [t("chybělo oslovení", "wake word missing"), ""],
    wakeonly: [t("jen oslovení, čekám na povel", "wake word only, waiting for a command"), ""],
    other: [t("jiná řeč", "other speech"), ""],
  }[h.reason] || ["", ""];
  const said = `${h.wake ? `${wakeName()} ` : ""}${esc(h.text)}`.trim();
  return `<li><span><b>${said ? `„${said}“` : "…"}</b></span><span class="tag ${why[1]}">${why[0]}</span></li>`;
}
function tabVoice() {
  const v = S.voice;
  const c = S.config.voice;
  const [dot, label] = voiceLabel();
  const withPhrase = S.config.commands.filter((x) => x.phrase);
  const fresh = v.heard && Date.now() - v.heardAt < 60000;
  return `<div class="head"><h1>${t("Hlasové povely", "Voice commands")}</h1><p class="muted">${t("Řekneš větu a aplikace udělá akci. Rozpoznávání běží jen v tvém počítači, hlas se nikam neposílá.", "Say a phrase and the app does the action. Recognition runs on your computer only; your voice is never sent anywhere.")}</p></div>
  <div class="card">
    <label class="check"><input type="checkbox" id="voiceon" ${c.enabled ? "checked" : ""} /><span><b>${t("Poslouchat hlasové povely", "Listen for voice commands")}</b></span></label>
    <p style="margin-top:8px"><span class="dot ${dot}" style="display:inline-block;margin-right:8px"></span>${label}</p>
    ${v.status === "error" && v.error ? `<p class="muted small" style="margin-top:4px">${t("Podrobnosti", "Details")}: ${esc(v.error)}</p>` : ""}
    <div class="two" style="margin-top:14px">
      <div><label class="f">${t("Mikrofon", "Microphone")}</label><select id="voicemic"><option value="">${t("Výchozí mikrofon systému", "System default microphone")}</option>${v.devices.filter((d) => d.id && d.id !== "default").map((d) => `<option value="${esc(d.id)}" ${d.id === c.deviceId ? "selected" : ""}>${esc(d.name)}</option>`).join("")}</select></div>
      <div><label class="f">${t("Jazyk povelů", "Command language")}</label><select id="voicelang">${v.langs.map((l) => `<option value="${l}" ${l === v.lang ? "selected" : ""}>${LANG_NAMES[l] || l}</option>`).join("")}</select></div>
    </div>
    <div class="two" style="margin-top:14px">
      <div><label class="f">${t("Oslovení před povelem", "Wake word before a command")}</label><input type="text" id="voicewake" value="${esc(c.wakeWord || "tejbot")}" maxlength="30" ${c.wake === false ? "disabled" : ""} /></div>
      <div><label class="f">${t("Jak moc si musí být jistý", "How sure it must be")}</label><select id="voicestrict">${[[60, t("Méně (reaguje snadno)", "Less (reacts easily)")], [75, t("Běžně", "Normal")], [90, t("Hodně (méně omylů)", "A lot (fewer mistakes)")]].map(([n, l]) => `<option value="${n}" ${(c.strict || 75) === n ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    </div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="voicewakeon" ${c.wake === false ? "" : "checked"} /><span><b>${t("Povel musí začínat oslovením", "A command must start with the wake word")}</b><br /><span class="muted small">${t(`Řekneš „${wakeName()} udělej klip“. Bez oslovení se nic nespustí, takže běžná řeč na streamu nevadí.`, `You say “${wakeName()} make a clip”. Nothing runs without the wake word, so normal talk on stream is fine.`)}</span></span></label>
    ${c.enabled && c.wake !== false && v.status === "listening" && !v.wakes.length ? `<p class="error">⚠ ${t("Tohle oslovení hlasový model nezná. Zvol jiné, běžné slovo (třeba „počítači“).", "The voice model doesn't know this wake word. Pick a common word (like “computer”).")}</p>` : ""}
  </div>
  <div class="card">
    <h2>${t("Zkouška mikrofonu", "Microphone test")}</h2>
    ${
      v.status !== "listening"
        ? `<p class="muted">${t("Nejdřív nahoře zapni poslouchání.", "Turn listening on above first.")}</p>`
        : `<p class="muted small">${t("Mluv normálně. Proužek má při řeči doskočit zhruba do dvou třetin.", "Speak normally. The bar should reach about two thirds while you talk.")}</p>
    <div class="meter"><div id="miclevel"></div></div>
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
      <button class="btn sm" id="voicecalib" ${v.calib === "run" ? "disabled" : ""}>${v.calib === "run" ? t("Mluv… (4 vteřiny)", "Speak… (4 seconds)") : t("Nastavit hlasitost mikrofonu", "Set microphone volume")}</button>
      <button class="btn sm ${v.test ? "primary" : ""}" id="voicetest">${v.test ? t("Ukončit zkoušku", "End test") : t("Zkoušet povely (nic se nespustí)", "Try commands (nothing runs)")}</button>
    </div>
    ${v.calib === "ok" ? `<p class="muted small" style="margin-top:8px">✓ ${t("Hlasitost nastavena.", "Volume set.")}</p>` : v.calib === "silent" ? `<p class="error" style="margin-top:8px">${t("Nic jsem neslyšel. Je vybraný správný mikrofon a není ztlumený?", "I heard nothing. Is the right microphone selected and not muted?")}</p>` : v.calib === "run" ? `<p class="muted small" style="margin-top:8px">${t(`Říkej třeba: „${wakeName()} ${esc((withPhrase[0] || {}).phrase || "")}“`, `Say for example: “${wakeName()} ${esc((withPhrase[0] || {}).phrase || "")}”`)}</p>` : ""}
    ${
      v.test
        ? `<p style="margin-top:12px">${t("Řekni postupně každý povel. Uvidíš, co aplikace slyšela:", "Say each command in turn. You'll see what the app heard:")}</p>
      <ul class="clips">${v.log.length ? v.log.map(heardRow).join("") : `<li><span class="muted">${t("Zatím nic…", "Nothing yet…")}</span></li>`}</ul>`
        : ""
    }`
    }
  </div>
  <div class="card">
    <h2>${t("Co naposledy slyšel", "Last heard")}</h2>
    ${fresh && v.log[0] ? `<ul class="clips">${heardRow(v.log[0])}</ul>` : `<p class="muted">${t("Zatím nic. Zkus říct některou větu níže.", "Nothing yet. Try saying one of the phrases below.")}</p>`}
  </div>
  <div class="card">
    <div class="row sp"><h2>${t("Věty, na které slyší", "Phrases it listens for")}</h2><button class="btn sm" data-tab="cmds">${t("Upravit v Příkazech", "Edit in Commands")}</button></div>
    ${
      withPhrase.length
        ? `<ul class="clips">${withPhrase.map((x) => `<li><span><b>„${S.config.voice.wake === false ? "" : `${wakeName()} `}${esc(x.phrase)}“</b></span><span class="muted small">${esc(t((S.actions.find((a) => a.key === x.action) || {}).cs || "", (S.actions.find((a) => a.key === x.action) || {}).en || ""))}${x.param ? `: ${esc(x.param)}` : ""}</span></li>`).join("")}</ul>`
        : `<p class="muted">${t("Žádná. V záložce Příkazy doplň u příkazu „Větu pro hlas“.", "None. Add a “Voice phrase” to a command in the Commands tab.")}</p>`
    }
    ${v.unknown.length ? `<p class="error">⚠ ${t("Tahle slova hlasový model nezná, věta s nimi nebude fungovat. Zkus jiné slovo:", "The voice model doesn't know these words, so phrases with them won't work. Try another word:")} <b>${v.unknown.map(esc).join(", ")}</b></p>` : ""}
  </div>
  <div class="card">
    <h2>${t("Tipy", "Tips")}</h2>
    <ol class="steps">
      <li>${t("Povel má nejvýš 3 slova. Dvě slova jsou spolehlivější než jedno („udělej klip“ místo „klip“).", "A command has at most 3 words. Two words are more reliable than one (“make a clip” rather than “clip”).")}</li>
      <li>${t("Oslovení a povel řekni vcelku, nebo po oslovení udělej krátkou pauzu (do 5 vteřin).", "Say the wake word and the command together, or pause briefly after the wake word (up to 5 seconds).")}</li>
      <li>${t("Model zná jen běžná slova. Vymyšlená slova a jména nezná, aplikace tě na ně upozorní.", "The model only knows common words. It doesn't know made-up words and names; the app warns you about them.")}</li>
      <li>${t("Piš věty běžnými slovy s háčky a čárkami, bez číslic (místo „2“ napiš „dva“).", "Write phrases in ordinary words, no digits (write “two” instead of “2”).")}</li>
      <li>${t("Každá věta ať zní jinak. Dvě podobné věty si aplikace může splést.", "Make each phrase sound different. Two similar phrases can get mixed up.")}</li>
    </ol>
  </div>`;
}

function tabMusic() {
  const m = S.config.music;
  const src = [
    ["spotify", "Spotify"],
    ["apple", "Apple Music"],
    ["browser", t("Prohlížeč (YouTube, SoundCloud a další weby)", "Browser (YouTube, SoundCloud and other sites)")],
    ["other", t("Ostatní aplikace (přehrávače videa, hry…)", "Other apps (video players, games…)")],
  ];
  const tr = S.track;
  return `<div class="head"><h1>${t("Hudba", "Music")}</h1><p class="muted">${t("Widget „Co poslouchám“ ve streamu ukazuje skladbu, která ti zrovna hraje.", "The “Listening to” stream widget shows the track you're playing.")}</p></div>
  ${!S.musicAvailable ? `<div class="card"><p class="soft">⚠ ${S.platform === "linux" ? t("Na Linuxu je potřeba program playerctl. Nainstaluj ho (např. sudo apt install playerctl) a aplikaci spusť znovu.", "On Linux this needs the playerctl program. Install it (e.g. sudo apt install playerctl) and restart the app.") : t("Na tomhle systému zjišťování hudby nefunguje.", "Music detection isn't available on this system.")}</p></div>` : ""}
  <div class="card">
    <label class="check"><input type="checkbox" id="musicon" ${m.enabled ? "checked" : ""} /><span><b>${t("Posílat do streamu, co poslouchám", "Send what I'm listening to to the stream")}</b><br /><span class="muted small">${t("Na web jde jen název skladby, interpret a název aplikace.", "Only the track title, artist and app name go to the website.")}</span></span></label>
    <h2 style="margin-top:14px">${t("Odkud se smí hudba brát", "Allowed sources")}</h2>
    ${src.map(([k, n]) => `<label class="check"><input type="checkbox" data-src="${k}" ${m.sources[k] ? "checked" : ""} /><span>${n}</span></label>`).join("")}
    <p class="muted small" style="margin-top:6px">${t("Prohlížeč ukáže cokoli, co v něm hraje se zvukem, tedy i video. Když to nechceš, nech zapnuté jen Spotify a Apple Music.", "The browser shows anything playing with sound, including videos. If you don't want that, keep only Spotify and Apple Music on.")}</p>
  </div>
  <div class="card">
    <h2>${t("Právě teď", "Right now")}</h2>
    <p>${tr ? `<b>${esc(tr.title)}</b>${tr.artist ? ` · ${esc(tr.artist)}` : ""}${tr.app ? ` <span class="tag">${esc(tr.app)}</span>` : ""}` : `<span class="muted">${t("Nic nehraje.", "Nothing is playing.")}</span>`}</p>
    <p class="muted small" style="margin-top:10px">${t("Odkaz na widget do OBS najdeš na webu:", "Find the OBS widget link on the website:")} <a data-open="/dashboard/${esc(S.config.channel.id)}/assistant">${t("Aplikace do PC", "Desktop app")}</a></p>
  </div>`;
}

function tabSettings() {
  return `<div class="head"><h1>${t("Nastavení", "Settings")}</h1></div>
  <div class="card">
    <h2>${t("Složka s klipy", "Clips folder")}</h2>
    <div class="row"><div class="path" style="flex:1">${esc(S.config.clipsDir)}</div><button class="btn" id="pickdir">📁 ${t("Změnit", "Change")}</button><button class="btn" data-run="open_clips">${t("Otevřít", "Open")}</button></div>
  </div>
  <div class="card">
    <h2>${t("Aplikace", "App")}</h2>
    <label class="check"><input type="checkbox" id="autostart" ${S.config.autostart ? "checked" : ""} /><span>${t("Spouštět po zapnutí počítače (schovaná u hodin)", "Start when the computer starts (hidden in the tray)")}</span></label>
    <div class="field" style="margin-top:8px;max-width:240px"><label class="f">${t("Jazyk", "Language")}</label><select id="langsel"><option value="cs" ${S.config.lang === "cs" ? "selected" : ""}>Čeština</option><option value="en" ${S.config.lang === "en" ? "selected" : ""}>English</option></select></div>
    <div class="row" style="margin-top:6px">
      <span>${t("Verze", "Version")} <b>${esc(S.version)}</b></span>
      ${
        S.update.status === "ready"
          ? `<button class="btn primary" id="installupdate">⬆️ ${t("Nainstalovat verzi", "Install version")} ${esc(S.update.version)}</button>`
          : `<button class="btn" id="checkupdate" ${S.update.status === "checking" || S.update.status === "downloading" ? "disabled" : ""}>🔄 ${t("Zkontrolovat aktualizace", "Check for updates")}</button>`
      }
    </div>
    <p class="${S.update.status === "error" ? "error" : "muted small"}" style="margin-top:8px">${
      {
        idle: t("Aplikace se aktualizuje i sama, při spuštění a pak každých 6 hodin.", "The app also updates itself, on launch and then every 6 hours."),
        checking: t("Hledám novou verzi…", "Looking for a new version…"),
        none: t("Máš nejnovější verzi.", "You have the latest version."),
        downloading: `${t("Stahuji verzi", "Downloading version")} ${esc(S.update.version)}… ${S.update.percent} %`,
        ready: t("Nová verze je stažená. Aplikace se při instalaci na chvilku zavře a sama znovu spustí.", "The new version is downloaded. The app closes briefly during install and restarts itself."),
        error: `${t("Aktualizace se nepovedla", "Update failed")}: ${esc(S.update.error)}`,
      }[S.update.status]
    }</p>
  </div>
  <div class="card">
    <h2>${t("Kanál", "Channel")}</h2>
    <div class="row sp"><span><b>${esc(S.config.channel.name)}</b> <span class="tag gold">Premium</span></span>
    <span class="row"><button class="btn" data-open="/dashboard/${esc(S.config.channel.id)}/assistant">${t("Otevřít web", "Open the website")}</button><button class="btn danger" id="unpair">${t("Odpojit aplikaci", "Disconnect the app")}</button></span></div>
  </div>
  <div class="card">
    <h2>${t("Odinstalovat", "Uninstall")}</h2>
    <p class="soft">${t("Odstraní aplikaci z počítače i s jejím nastavením a odpojí tenhle počítač od kanálu. Tvoje klipy zůstanou ve složce, kde jsou.", "Removes the app and its settings from this computer and disconnects it from the channel. Your clips stay in their folder.")}</p>
    <div style="margin-top:12px"><button class="btn danger" id="uninstall">🗑️ ${t("Odinstalovat Tejbot Assistent", "Uninstall Tejbot Assistent")}</button></div>
  </div>`;
}

function render() {
  if (!S) return;
  document.documentElement.lang = S.config.lang;
  if (S.web === "unpaired") return ($app.innerHTML = screenPair()), bind();
  if (S.web === "nopremium") return ($app.innerHTML = screenNoPremium()), bind();
  if (S.web === "offline" || S.web === "unknown") return ($app.innerHTML = screenOffline()), bind();
  if (!S.config.setupDone) return ($app.innerHTML = screenSetup()), bind();
  const body = { home: tabHome, cmds: tabCmds, obs: tabObs, voice: tabVoice, music: tabMusic, settings: tabSettings }[tab]();
  const ch = S.config.channel;
  $app.innerHTML = `<aside class="side">
    <div class="logo"><img src="icon.png" alt="" /> Tejbot Assistent</div>
    <nav class="nav">${TABS()
      .map(([k, i, n]) => `<button data-tab="${k}" class="${k === tab ? "on" : ""}"><span>${i}</span>${n}</button>`)
      .join("")}</nav>
    <div class="foot"><div class="chan">${ch.avatar ? `<img src="${esc(ch.avatar)}" alt="" />` : ""}<span>${esc(ch.name)}</span></div><p class="muted small" style="margin-top:4px">👑 Premium</p></div>
  </aside><main class="main">${body}</main>`;
  bind();
}

// ---------------------------------------------------------------- klikání

const on = (sel, ev, fn) => document.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(el, e)));
const apply = (s) => {
  S = s;
  render();
};

async function openTab(k) {
  tab = k;
  if (k === "cmds") cmds = S.config.commands.map((c) => ({ ...c }));
  if (k === "cmds" || k === "obs") lists = await tb.call("obsLists");
  render();
}

const PAIR_ERRORS = () => ({
  code: t("Kód neplatí. Vytvoř na webu nový (platí 10 minut).", "The code isn't valid. Create a new one on the website (valid 10 minutes)."),
  limit: t("Kanál už má spárovaných 5 počítačů. Některý na webu odpoj.", "The channel already has 5 paired computers. Disconnect one on the website."),
  rate: t("Moc pokusů. Zkus to za pár minut.", "Too many attempts. Try again in a few minutes."),
  offline: t("Nejde se připojit k TejBotu. Zkontroluj internet.", "Can't reach TejBot. Check your internet."),
});

function keyName(e) {
  const c = e.code;
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (/^F\d{1,2}$/.test(c)) return c;
  if (/^Numpad\d$/.test(c)) return `num${c.slice(6)}`;
  return { Space: "Space", Enter: "Enter", Tab: "Tab", Insert: "Insert", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Minus: "-", Equal: "=", Comma: ",", Period: ".", Slash: "/", Semicolon: ";", NumpadAdd: "numadd", NumpadSubtract: "numsub", NumpadMultiply: "nummult", NumpadDivide: "numdiv", NumpadDecimal: "numdec" }[c] || "";
}

function bind() {
  on("[data-tab]", "click", (el) => openTab(el.dataset.tab));
  on("[data-open]", "click", (el) => tb.call("openSite", el.dataset.open));
  on("[data-run]", "click", (el) => tb.call("run", el.dataset.run, ""));
  on("[data-show]", "click", (el) => tb.call("showClip", el.dataset.show));
  on("[data-play]", "click", (el) => openPlayer(el.dataset.play));
  on("[data-trash]", "click", async (el) => {
    if (!confirm(t("Smazat tenhle klip? Přesune se do koše.", "Delete this clip? It moves to the bin."))) return;
    const r = await tb.call("trashClip", el.dataset.trash);
    if (!r.ok) toast(r);
  });
  on("#refresh", "click", () => tb.call("refresh"));
  on("#lang", "click", async () => apply(await tb.call("saveSettings", { lang: S.config.lang === "en" ? "cs" : "en" })));
  on("#unpair", "click", async () => {
    if (confirm(t("Odpojit aplikaci od kanálu?", "Disconnect the app from the channel?"))) await tb.call("unpair");
  });

  // spárování
  const pair = async () => {
    const code = document.getElementById("code").value.trim();
    if (!code) return;
    document.getElementById("pair").disabled = true;
    const r = await tb.call("pair", code);
    pairError = r.ok ? "" : PAIR_ERRORS()[r.error] || t("Něco se nepovedlo, zkus to znovu.", "Something went wrong, try again.");
    apply(await tb.call("state"));
  };
  on("#pair", "click", pair);
  on("#code", "keydown", (_el, e) => e.key === "Enter" && pair());

  // složka s klipy
  on("#pickdir", "click", async () => {
    await tb.call("pickClipsDir");
    apply(await tb.call("state"));
  });
  on("#finish", "click", async () => apply(await tb.call("finishSetup")));

  // příkazy
  on("[data-cmd]", "change", (el) => {
    cmds[+el.dataset.cmd][el.dataset.k] = el.value;
    if (el.dataset.k === "action") render();
  });
  on("[data-cmd]", "input", (el) => (cmds[+el.dataset.cmd][el.dataset.k] = el.value));
  on("[data-key]", "focus", () => tb.call("hotkeysPause", true));
  on("[data-key]", "blur", () => tb.call("hotkeysPause", false));
  on("[data-key]", "keydown", (el, e) => {
    e.preventDefault();
    const i = +el.dataset.key;
    if (e.key === "Backspace" || e.key === "Delete" || e.key === "Escape") {
      if (e.key !== "Escape") el.value = cmds[i].hotkey = "";
      return el.blur();
    }
    const k = keyName(e);
    if (!k) return; // jen Ctrl / Alt / Shift samotné
    const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super"].filter(Boolean);
    if (!mods.length && !/^F\d/.test(k) && !/^num/.test(k)) return toast({ ok: false, message: t("Přidej Ctrl, Alt nebo Shift, nebo použij klávesu F1 až F24. Samotné písmeno by ti přestalo psát.", "Add Ctrl, Alt or Shift, or use F1–F24. A bare letter would stop typing.") });
    el.value = cmds[i].hotkey = [...mods, k].join("+");
    el.blur();
  });
  on("[data-test]", "click", (el) => tb.call("run", cmds[+el.dataset.test].action, cmds[+el.dataset.test].param));
  on("[data-del]", "click", (el) => {
    cmds.splice(+el.dataset.del, 1);
    render();
  });
  on("#addcmd", "click", () => {
    cmds.push({ id: "", name: "", phrase: "", hotkey: "", action: "clip", param: "" });
    render();
  });
  on("#savecmds", "click", async () => {
    S = await tb.call("saveCommands", cmds);
    cmds = S.config.commands.map((c) => ({ ...c }));
    render();
    toast({ ok: true, message: t("Příkazy uloženy.", "Commands saved.") });
  });

  // OBS
  on("#obsre", "click", () => tb.call("obsReconnect"));
  on("#saveobs", "click", async () => {
    const pw = document.getElementById("obspw").value;
    apply(await tb.call("saveSettings", { obs: { url: document.getElementById("obsurl").value, ...(pw ? { password: pw } : {}) } }));
    toast({ ok: true, message: pw ? t("Heslo uloženo, připojuji se k OBS…", "Password saved, connecting to OBS…") : t("Uloženo, připojuji se k OBS…", "Saved, connecting to OBS…") });
    tb.call("obsReconnect");
  });
  on("#mic", "change", async (el) => apply(await tb.call("saveSettings", { obs: { mic: el.value } })));
  on("#autoreplay", "change", async (el) => apply(await tb.call("saveSettings", { obs: { autoReplay: el.checked } })));

  // hlas
  on("#voiceon", "change", async (el) => apply(await tb.call("saveSettings", { voice: { enabled: el.checked } })));
  on("#voicemic", "change", async (el) => apply(await tb.call("saveSettings", { voice: { deviceId: el.value } })));
  on("#voicewake", "change", async (el) => apply(await tb.call("saveSettings", { voice: { wakeWord: el.value } })));
  on("#voicewakeon", "change", async (el) => apply(await tb.call("saveSettings", { voice: { wake: el.checked } })));
  on("#voicestrict", "change", async (el) => apply(await tb.call("saveSettings", { voice: { strict: Number(el.value) } })));
  on("#voicecalib", "click", async () => apply(await tb.call("voiceCalibrate")));
  on("#voicetest", "click", async () => apply(await tb.call("voiceTest", !S.voice.test)));
  on("#voicelang", "change", async (el) => apply(await tb.call("saveSettings", { voice: { lang: el.value } })));

  // hudba
  const saveMusic = async () => {
    const sources = {};
    document.querySelectorAll("[data-src]").forEach((el) => (sources[el.dataset.src] = el.checked));
    apply(await tb.call("saveSettings", { music: { enabled: document.getElementById("musicon").checked, sources } }));
  };
  on("#musicon", "change", saveMusic);
  on("[data-src]", "change", saveMusic);

  // nastavení
  on("#checkupdate", "click", () => tb.call("checkUpdate"));
  on("#installupdate", "click", () => tb.call("installUpdate"));
  on("#uninstall", "click", async () => {
    if (!confirm(t("Opravdu odinstalovat Tejbot Assistent? Aplikace se zavře a smaže se i její nastavení. Klipy zůstanou.", "Really uninstall Tejbot Assistent? The app will close and its settings will be deleted. Clips stay."))) return;
    const r = await tb.call("uninstall");
    if (!r.ok) toast(r);
  });
  on("#autostart", "change", async (el) => apply(await tb.call("saveSettings", { autostart: el.checked })));
  on("#langsel", "change", async (el) => apply(await tb.call("saveSettings", { lang: el.value })));
}

// ---------------------------------------------------------------- start

tb.on("toast", toast);
tb.on("level", (n) => {
  const el = document.getElementById("miclevel");
  if (el) el.style.width = `${Math.round(Math.min(1, Math.sqrt(n)) * 100)}%`;
});
tb.on("state", async (s) => {
  const before = S;
  S = s;
  // OBS se právě připojilo -> načíst seznam mikrofonů a scén
  if (before && !before.obs.connected && s.obs.connected && (tab === "obs" || tab === "cmds")) lists = await tb.call("obsLists");
  // ať se rozepsané pole nepřekreslí pod rukama
  const typing = document.activeElement && ["INPUT", "SELECT"].includes(document.activeElement.tagName);
  const screenChanged = !before || before.web !== s.web || before.config.setupDone !== s.config.setupDone;
  if (screenChanged || !typing) render();
});
tb.call("state").then(apply);
