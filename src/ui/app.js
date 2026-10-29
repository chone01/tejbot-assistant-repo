// Okno aplikace. Všechno důležité dělá hlavní část (main.js), tady se jen kreslí a kliká.
const tb = window.tejbot;
const $app = document.getElementById("app");
const $toast = document.getElementById("toast");

let S = null; // stav z hlavní části
let tab = "home";
let cmds = []; // rozpracované příkazy
let lists = { inputs: [], scenes: [] };
let pairError = "";

// překlady: čeština a angličtina přímo, slovenština / němčina / polština ze slovníku od hlavní části (S.i18n)
let DICT = null, DICT_FOR = "";
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const t = (cs, en) => {
  const lang = S ? S.config.lang : "cs";
  if (lang === "cs") return cs;
  if (lang === "en" || !S.i18n) return en;
  // slovník se převede jen jednou pro jazyk (ne při každé změně stavu – to zpomalovalo okno)
  if (DICT_FOR !== lang) {
    DICT_FOR = lang;
    DICT = { s: S.i18n.s || {}, p: (S.i18n.p || []).map(([f, to]) => ({ re: new RegExp(`^${escRe(f).replace(/\\\{(\d+)\\\}/g, "([\\s\\S]*?)")}$`), to })) };
  }
  if (DICT.s[en]) return DICT.s[en];
  for (const { re, to } of DICT.p) {
    const m = re.exec(en);
    if (m) return to.replace(/\{(\d+)\}/g, (_, i) => m[Number(i) + 1] ?? "");
  }
  return en;
};
const LOCALE = { cs: "cs-CZ", en: "en-GB", sk: "sk-SK", de: "de-DE", pl: "pl-PL" };
const LANG_LIST = [["cs", "Čeština"], ["en", "English"], ["sk", "Slovenčina"], ["de", "Deutsch"], ["pl", "Polski"]];
const loc = () => LOCALE[S.config.lang] || "en-GB";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ikony (styl Lucide, kreslené čarou) – místo emoji, ať okno působí čistě a stejně na každém počítači
const ICONS = {
  home: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  keyboard: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 17h8"/>',
  obs: '<path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2.5"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  micoff: '<path d="m2 2 20 20M18.9 13.2A7 7 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 12 5M15 9.3V5a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 5.1 2.1M12 19v3"/>',
  wave: '<path d="M2 10v3M6 6v11M10 3v18M14 8v7M18 5v13M22 10v3"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  settings: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  rec: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M8 16H3v5"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  crown: '<path d="M2 20h20M3 7l4.5 4L12 4l4.5 7L21 7l-2 10H5z"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  power: '<path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  headphones: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.8 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  radio: '<path d="M4.9 19.1a10 10 0 0 1 0-14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M19.1 4.9a10 10 0 0 1 0 14.2"/><circle cx="12" cy="12" r="2"/>',
  monitorup: '<path d="m9 10 3-3 3 3M12 13V7"/><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M12 17v4M8 21h8"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/>',
};
const ic = (n, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;
const chip = (n, tone = "") => `<span class="chip ${tone}">${ic(n)}</span>`;
// Aplikace je zdarma; Premium odemyká ovládání OBS a webu zkratkou, hlas, hudbu, presety a odkazy od pomocníků
const PREM = () => !!(S && S.premium && S.premium.active);
const PREM_TABS = ["voice", "mic", "music"];
const isFreeAction = (key) => (S.actions.find((a) => a.key === key) || {}).free === true;
const premTag = () => `<span class="tag gold">${ic("crown")} Premium</span>`;
function lockCard(text) {
  const id = S.config.channel ? S.config.channel.id : "";
  return `<div class="card lockc"><div class="row sp"><div><h2 style="margin-bottom:4px">${chip("crown", "gold")}${t("Součást Premium", "Part of Premium")}</h2><p class="soft">${text}</p></div><button class="btn gold" data-open="/dashboard/${esc(id)}/premium">${ic("crown")} ${t("Pořídit Premium na webu", "Get Premium on the website")}</button></div></div>`;
}
function lockedTab(k) {
  const info = {
    voice: [t("Hlasové povely", "Voice commands"), t("Řekneš větu a aplikace udělá akci. Hlasové povely jsou součást Premium.", "Say a phrase and the app does the action. Voice commands are part of Premium.")],
    mic: [t("Zvuk mikrofonu", "Microphone sound"), t("Presety zvuku mikrofonu přímo v OBS (vlastní i komunitní) jsou součást Premium.", "Microphone sound presets right in OBS (your own and community ones) are part of Premium.")],
    music: [t("Hudba ve streamu", "Music on stream"), t("Widget „Co poslouchám“ ukazuje ve streamu skladbu, která ti hraje. Je součást Premium.", "The “Listening to” widget shows the track you're playing on stream. It's part of Premium.")],
  }[k];
  return `<div class="head"><h1>${info[0]} ${premTag()}</h1></div>${lockCard(info[1])}<p class="muted small">${t("Začít vysílat, klipy a ukládání klipů zkratkou máš zdarma.", "Go live, clips and saving clips with a hotkey are free.")}</p>`;
}

// hláška dole uprostřed na pár vteřin (stránka se kvůli ní nikam neposouvá)
function toast(r) {
  if (!r || !r.message) return;
  $toast.innerHTML = `<span class="ti">${ic(r.ok ? "check" : "x")}</span><span>${esc(r.message)}</span>`;
  $toast.className = `toast ${r.ok ? "" : "bad"}`;
  $toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ($toast.hidden = true), r.ok ? 2800 : 5500);
}

// potvrzovací okno v aplikaci (místo šedého systémového okénka)
function ask(title, text, okLabel, danger = false) {
  return new Promise((resolve) => {
    const m = document.createElement("div");
    m.className = "modal";
    m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true"><h2>${chip(danger ? "alert" : "info", danger ? "red" : "")}${esc(title)}</h2><p>${esc(text)}</p><div class="row"><button class="btn ghost" data-a="0">${t("Zrušit", "Cancel")}</button><button class="btn ${danger ? "danger" : "primary"}" data-a="1">${esc(okLabel)}</button></div></div>`;
    const done = (v) => {
      m.remove();
      document.removeEventListener("keydown", key);
      resolve(v);
    };
    const key = (e) => {
      if (e.key === "Escape") done(false);
      if (e.key === "Enter") done(true);
    };
    m.addEventListener("click", (e) => {
      if (e.target === m) return done(false);
      const b = e.target.closest("[data-a]");
      if (b) done(b.dataset.a === "1");
    });
    document.addEventListener("keydown", key);
    document.body.appendChild(m);
    m.querySelector('[data-a="1"]').focus();
  });
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
    <p class="muted small" style="margin-top:14px">${t("Aplikace nikdy nechce heslo k tvému účtu. Premium se kupuje jen na webu.", "The app never asks for your account password. Premium is bought on the website only.")} · <select id="langmini" style="width:auto;padding:2px 8px;font-size:11px;display:inline-block">${LANG_LIST.map(([l, n]) => `<option value="${l}" ${S.config.lang === l ? "selected" : ""}>${n}</option>`).join("")}</select></p>
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
        <button class="btn" id="pickdir">${ic("folder")} ${t("Vybrat jinou složku", "Pick another folder")}</button>
        <button class="btn primary" id="finish">${t("Hotovo", "Done")}</button>
      </div>
    </div>
  </div></div>`;
}

// ---------------------------------------------------------------- hlavní okno

// menu po skupinách: [klíč, ikona, název]
const NAV = () => [
  ["", [["home", "home", t("Přehled", "Overview")]]],
  [t("Ovládání", "Control"), [["cmds", "keyboard", t("Příkazy a zkratky", "Commands & hotkeys")], ["voice", "wave", t("Hlasové povely", "Voice commands")]]],
  [t("Stream", "Stream"), [["obs", "obs", t("OBS a klipy", "OBS & clips")], ["mic", "sliders", t("Zvuk mikrofonu", "Microphone sound")], ["music", "music", t("Hudba ve streamu", "Music on stream")]]],
  [t("Aplikace", "App"), [["settings", "settings", t("Nastavení", "Settings")]]],
];
const TABS = () => NAV().flatMap(([, items]) => items);

function obsLabel() {
  if (S.obs.connected) return ["ok", t("Připojeno", "Connected")];
  if (S.obs.connecting) return ["warn", t("Připojuji…", "Connecting…")];
  if (S.obs.error === "password") return ["bad", t("Špatné heslo", "Wrong password")];
  return ["warn", t("Nepřipojeno", "Not connected")];
}

const when = (ms) => new Date(ms).toLocaleString(loc(), { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

// přehrávač přes celé okno (je mimo #app, ať ho nezruší překreslení)
const $player = document.getElementById("player");
function closePlayer() {
  $player.hidden = true;
  $player.innerHTML = "";
}
function openPlayer(name) {
  $player.innerHTML = `<div class="pbox"><div class="row sp" style="margin-bottom:10px"><b>${esc(name)}</b><span class="row"><button class="btn sm" id="pext">${ic("external")} ${t("Otevřít v přehrávači", "Open in player")}</button><button class="btn sm ghost" id="pclose">${ic("x")} ${t("Zavřít", "Close")}</button></span></div><video src="tbclip://clip/${encodeURIComponent(name)}" controls autoplay></video><p class="error" id="perr" hidden>${t("Tenhle formát aplikace neumí přehrát (třeba MKV). Otevři ho tlačítkem „Otevřít v přehrávači“.", "The app can't play this format (e.g. MKV). Use “Open in player”.")}</p></div>`;
  $player.hidden = false;
  $player.querySelector("video").addEventListener("error", () => ($player.querySelector("#perr").hidden = false));
  $player.querySelector("#pclose").addEventListener("click", closePlayer);
  $player.querySelector("#pext").addEventListener("click", () => tb.call("openClip", name));
}
$player.addEventListener("click", (e) => e.target === $player && closePlayer());
document.addEventListener("keydown", (e) => e.key === "Escape" && !$player.hidden && closePlayer());

function hotkeyOf(action) {
  const c = S.config.commands.find((x) => x.action === action && x.hotkey);
  return c ? `<span class="kbd">${c.hotkey.split("+").map((k) => `<span>${esc(k)}</span>`).join("+")}</span>` : "";
}
function tabHome() {
  const [oc, ol] = obsLabel();
  const tr = S.track;
  const until = S.premium.lifetime ? t("napořád", "lifetime") : S.premium.until ? new Date(S.premium.until).toLocaleDateString(loc()) : "";
  const act = (run, icon, label, sub, main = false) => {
    const locked = !PREM() && !isFreeAction(run);
    return `<button class="act ${main ? "main" : ""} ${locked ? "locked" : ""}" data-run="${run}">${chip(icon, main ? "" : locked ? "gold" : "cyan")}<span>${label}<br /><span class="muted">${locked ? `${ic("crown")} Premium` : sub}</span></span></button>`;
  };
  return `<div class="head"><h1>${t("Ahoj", "Hi")}, ${esc(S.config.channel.name)} 👋</h1><p class="muted">${t("Aplikace běží u hodin i po zavření okna, aby fungovaly klávesové zkratky a hlasové povely.", "The app keeps running in the tray after you close the window so hotkeys and voice commands work.")}</p></div>
  <div class="grid">
    ${PREM() ? `<div class="stat premium"><div class="k">${ic("crown")} TejBot</div><div class="v"><span class="dot ok"></span><span class="t">Premium${until ? ` · ${esc(until)}` : ""}</span></div></div>` : `<div class="stat"><div class="k">${ic("crown")} TejBot</div><div class="v"><span class="dot"></span><span class="t">${t("Zdarma", "Free")} · <a data-open="/dashboard/${esc(S.config.channel.id)}/premium">Premium ›</a></span></div></div>`}
    <div class="stat"><div class="k">${ic("obs")} OBS</div><div class="v"><span class="dot ${oc}"></span><span class="t">${ol}${S.obs.streaming ? ` · <b class="livetxt">${t("ŽIVĚ", "LIVE")}</b>` : ""}</span></div></div>
    <div class="stat"><div class="k">${ic("music")} ${t("Právě hraje", "Now playing")}</div><div class="v"><span class="dot ${tr ? "ok" : ""}"></span><span class="t">${!PREM() ? "Premium" : tr ? esc(`${tr.artist ? `${tr.artist} – ` : ""}${tr.title}`) : S.config.music.enabled ? t("Nic", "Nothing") : t("Vypnuto", "Off")}</span></div></div>
  </div>
  ${!S.obs.connected ? `<div class="card warnc"><div class="row sp"><div><h2 style="margin-bottom:4px">${chip("alert", "gold")}${t("OBS zatím není připojené", "OBS isn't connected yet")}</h2><p class="soft">${t("Spusť OBS a zapni v něm WebSocket server. Bez něj nejdou klipy ani ovládání OBS.", "Start OBS and enable its WebSocket server. Clips and OBS control need it.")}</p></div><button class="btn" data-tab="obs">${t("Jak na to", "How to")} ›</button></div></div>` : ""}
  <div class="card">
    <h2>${chip("zap")}${t("Rychlé akce", "Quick actions")}</h2>
    <div class="golive ${S.obs.streaming ? "on" : ""}">
      <div><b>${S.obs.streaming ? t("Právě vysíláš", "You're live") : t("Připraven na stream?", "Ready to stream?")}</b><span class="muted small">${S.obs.streaming ? t("Stream běží v OBS.", "The stream is running in OBS.") : t("Nejdřív si nastavíš název a kategorii, stream začne až potom.", "Set the title and category first, the stream starts after that.")}</span></div>
      ${S.obs.streaming ? `<span class="row" style="gap:8px"><button class="btn" id="golive">${ic("edit")} ${t("Název a kategorie", "Title & category")}</button><button class="btn danger" id="stopstream">${ic("power")} ${t("Ukončit vysílání", "End stream")}</button></span>` : `<button class="btn live" id="golive" ${S.obs.connected ? "" : "disabled"}>${ic("radio")} ${t("Začít vysílat", "Go live")} ${hotkeyOf("golive")}</button>`}
    </div>
    <div class="actions">
      ${act("clip", "scissors", t("Uložit klip", "Save a clip"), hotkeyOf("clip") || t("posledních pár vteřin", "the last few seconds"), true)}
      ${act("mic_toggle", "micoff", t("Ztlumit mikrofon", "Mute microphone"), hotkeyOf("mic_toggle") || t("zapnout / vypnout", "on / off"))}
      ${act("record_toggle", "rec", t("Nahrávání", "Recording"), hotkeyOf("record_toggle") || t("spustit / zastavit", "start / stop"))}
      ${act("open_clips", "folder", t("Složka s klipy", "Clips folder"), t("otevřít v počítači", "open on your computer"))}
    </div>
  </div>
  <div class="card">
    <div class="row sp" style="margin-bottom:12px"><h2 style="margin:0">${chip("film")}${t("Moje klipy", "My clips")} ${S.clips.length ? `<span class="tag">${S.clips.length}</span>` : ""}</h2><button class="btn sm" data-run="open_clips">${ic("folder")} ${t("Otevřít složku", "Open folder")}</button></div>
    ${
      S.clips.length
        ? `<div class="clipgrid">${S.clips
            .map(
              (c) => `<div class="clip">
            <button class="thumb" data-play="${esc(c.name)}" title="${t("Přehrát", "Play")}"><video src="tbclip://clip/${encodeURIComponent(c.name)}#t=1" preload="metadata" muted tabindex="-1"></video><span class="play"><span>${ic("play")}</span></span></button>
            <div class="cname" title="${esc(c.name)}">${esc(c.name)}</div>
            <div class="row sp"><span class="muted small">${when(c.at)} · ${(c.size / 1048576).toFixed(1)} MB</span>
            <span class="row" style="gap:4px"><button class="btn sm icon ghost" data-show="${esc(c.name)}" title="${t("Ukázat ve složce", "Show in folder")}">${ic("folder")}</button><button class="btn sm icon danger" data-trash="${esc(c.name)}" title="${t("Smazat (do koše)", "Delete (to the bin)")}">${ic("trash")}</button></span></div>
          </div>`
            )
            .join("")}</div>`
        : `<div class="empty">${chip("film", "cyan")}<p>${t("Zatím žádný klip. Ulož první tlačítkem „Uložit klip“ nebo zkratkou.", "No clips yet. Save your first with “Save a clip” or a hotkey.")}</p><div class="path">${esc(S.config.clipsDir)}</div></div>`
    }
  </div>`;
}

function actionSelect(c, i) {
  return `<select data-cmd="${i}" data-k="action">${S.actions.map((a) => `<option value="${a.key}" ${a.key === c.action ? "selected" : ""}>${esc(t(a.cs, a.en))}${!a.free && !PREM() ? " · Premium" : ""}</option>`).join("")}</select>`;
}
function tabCmds() {
  return `<div class="head"><h1>${t("Příkazy a zkratky", "Commands & hotkeys")}</h1><p class="muted">${t("Každý příkaz má akci a způsob, jak ji spustit: klávesovou zkratku, která funguje i ve hře, a větu pro hlas.", "Each command has an action and a way to trigger it: a hotkey that works in-game too, and a phrase for voice.")}</p></div>
  ${PREM() ? "" : `<div class="note" style="margin:0 0 14px">${ic("crown")}<span>${t("Zdarma fungují zkratky pro klip, Začít vysílat, Ukončit vysílání, záznam do paměti a složku s klipy. Ostatní akce a hlasové povely jsou součást Premium.", "Free hotkeys: clip, Go live, End stream, Replay Buffer and the clips folder. Other actions and voice commands are part of Premium.")}</span></div>`}
  <div class="card">
    <h2>${chip("keyboard")}${t("Tvoje příkazy", "Your commands")} <span class="tag">${cmds.length}</span></h2>
    ${cmds
      .map((c, i) => {
        const needsScene = c.action === "scene";
        return `<div class="cmd">
        <div><label class="f">${t("Název", "Name")}</label><input type="text" data-cmd="${i}" data-k="name" value="${esc(c.name)}" maxlength="60" /></div>
        <div><label class="f">${t("Akce", "Action")}</label>${actionSelect(c, i)}${needsScene ? `<select style="margin-top:6px" data-cmd="${i}" data-k="param"><option value="">${t("– vyber scénu –", "– pick a scene –")}</option>${[...new Set([...lists.scenes, c.param].filter(Boolean))].map((s) => `<option ${s === c.param ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>` : ""}</div>
        <div><label class="f">${t("Věta pro hlas", "Voice phrase")}</label><input type="text" data-cmd="${i}" data-k="phrase" value="${esc(c.phrase)}" maxlength="80" placeholder="${t("např. udělej klip (max. 3 slova)", "e.g. make a clip (max 3 words)")}" /></div>
        <div><label class="f">${t("Klávesová zkratka", "Hotkey")}</label><input type="text" class="key" readonly data-key="${i}" value="${esc(c.hotkey)}" placeholder="${t("klikni a zmáčkni", "click and press")}" /></div>
        <div class="row" style="gap:6px"><button class="btn sm icon" data-test="${i}" title="${t("Vyzkoušet", "Test")}">${ic("play")}</button><button class="btn sm icon danger" data-del="${i}" title="${t("Smazat", "Delete")}">${ic("trash")}</button></div>
        ${!PREM() && !isFreeAction(c.action) ? `<div class="err">${ic("crown")} ${t("Tahle akce je součást Premium, bez něj zkratka ani hlas nefungují.", "This action is part of Premium; without it the hotkey and voice don't work.")}</div>` : ""}
        ${S.hotkeyErrors.includes(c.id) ? `<div class="err">${ic("alert")} ${t("Tuhle zkratku už používá jiný program, zvol jinou.", "Another program already uses this hotkey, pick a different one.")}</div>` : ""}
      </div>`;
      })
      .join("")}
    ${cmds.length === 0 ? `<div class="empty">${chip("keyboard", "cyan")}<p>${t("Zatím žádný příkaz.", "No commands yet.")}</p></div>` : ""}
    <div class="row sp" style="margin-top:14px">
      <button class="btn" id="addcmd">${ic("plus")} ${t("Přidat příkaz", "Add a command")}</button>
      <button class="btn primary" id="savecmds">${ic("check")} ${t("Uložit příkazy", "Save commands")}</button>
    </div>
  </div>
  <p class="muted small">${t("Zkratku smažeš klávesou Backspace. Hlasové povely zapneš v části Hlasové povely.", "Clear a hotkey with Backspace. Turn voice commands on under Voice commands.")}</p>`;
}

function tabObs() {
  const [oc, ol] = obsLabel();
  const o = S.config.obs;
  return `<div class="head"><h1>${t("OBS a klipy", "OBS & clips")}</h1><p class="muted">${t("Aplikace ovládá tvoje OBS přes vestavěný WebSocket server (OBS 28 a novější) a ukládá z něj klipy.", "The app controls your OBS through its built-in WebSocket server (OBS 28 or newer) and saves clips from it.")}</p></div>
  <div class="card ${S.obs.connected ? "glow" : ""}">
    <div class="row sp"><h2 style="margin:0">${chip("obs")}${t("Připojení k OBS", "OBS connection")}<span class="tag ${S.obs.connected ? "ok" : ""}"><span class="dot ${oc}"></span>${ol}</span></h2><button class="btn sm" id="obsre">${ic("refresh")} ${t("Připojit znovu", "Reconnect")}</button></div>
    ${!S.obs.connected && !S.obs.connecting && S.obs.error === "password" ? `<div class="note">${ic("alert")}<span>${S.hasObsPassword ? t("OBS heslo odmítlo. Zkopíruj ho v OBS znovu (Zobrazit informace o připojení → Kopírovat) a vlož sem.", "OBS rejected the password. Copy it again in OBS (Show Connect Info → Copy) and paste it here.") : t("OBS chce heslo. Vlož ho níže.", "OBS wants a password. Paste it below.")}</span></div>` : ""}
    ${!S.obs.connected && !S.obs.connecting && S.obs.error === "offline" ? `<div class="note">${ic("alert")}<span>${t("K OBS se nejde připojit. Běží OBS a je v něm zapnutý WebSocket server?", "Can't connect to OBS. Is OBS running with the WebSocket server enabled?")}</span></div>` : ""}
    ${!S.obs.connected && S.obs.detail ? `<p class="muted small" style="margin-top:6px">${t("Podrobnosti", "Details")}: ${esc(S.obs.detail)}</p>` : ""}
    <div class="two" style="margin-top:16px">
      <div><label class="f">${t("Adresa", "Address")}</label><input type="text" id="obsurl" value="${esc(o.url)}" /></div>
      <div><label class="f">${t("Heslo", "Password")}</label><input type="password" id="obspw" placeholder="${S.hasObsPassword ? t("uložené (napiš nové pro změnu)", "saved (type a new one to change)") : ""}" /></div>
    </div>
    <div style="margin-top:14px"><button class="btn primary" id="saveobs">${ic("link")} ${t("Uložit a připojit", "Save and connect")}</button></div>
    <details class="more" ${S.obs.connected ? "" : "open"}>
      <summary>${ic("info")} ${t("Jak zapnout WebSocket server v OBS", "How to enable the WebSocket server in OBS")}</summary>
      <ol class="steps">
        <li>${t("V OBS nahoře klikni na Nástroje → Nastavení WebSocket serveru.", "In OBS click Tools → WebSocket Server Settings.")}</li>
        <li>${t("Zaškrtni „Povolit WebSocket server“.", "Tick “Enable WebSocket server”.")}</li>
        <li>${t("Klikni na „Zobrazit informace o připojení“, zkopíruj heslo a vlož ho sem.", "Click “Show Connect Info”, copy the password and paste it here.")}</li>
      </ol>
    </details>
  </div>
  <div class="card">
    <h2>${chip("scissors")}${t("Klipy", "Clips")}</h2>
    <p class="soft">${t("Klip je posledních pár vteřin, které OBS drží v paměti (v OBS se to jmenuje „Záznam do paměti“). Délku nastavíš v OBS: Nastavení → Výstup → Záznam do paměti → zaškrtni „Povolit záznam do paměti“ a zvol třeba 30 s.", "A clip is the last few seconds OBS keeps in memory (Replay Buffer). Set the length in OBS: Settings → Output → Replay Buffer → tick “Enable” and choose e.g. 30 s.")}</p>
    <label class="check" style="margin-top:8px"><input type="checkbox" id="autoreplay" ${o.autoReplay ? "checked" : ""} /><span>${t("Zapínat záznam do paměti automaticky, když se aplikace připojí k OBS", "Start the Replay Buffer automatically when the app connects to OBS")}</span></label>
    <label class="f" style="margin-top:12px">${t("Klipy se ukládají do", "Clips are saved to")}</label>
    <div class="row"><div class="path" style="flex:1">${esc(S.config.clipsDir)}</div><button class="btn" id="pickdir">${ic("folder")} ${t("Změnit", "Change")}</button><button class="btn ghost" data-run="open_clips">${t("Otevřít", "Open")}</button></div>
  </div>
  <div class="card">
    <h2>${chip("radio", "red")}${t("Začít vysílat", "Go live")}</h2>
    <p class="soft">${t("Stream spouštěj tlačítkem Začít vysílat (tady v aplikaci nebo panelem TejBot v OBS), nejdřív se nastaví název a kategorie. Původní tlačítko si v OBS můžeš schovat: Doky → Ovládání (odškrtni).", "Start streams with Go live (here in the app or with the TejBot panel in OBS) so the title and category are set first. You can hide the original button in OBS: Docks → Controls (untick it).")}</p>
    <label class="check" style="margin-top:8px"><input type="checkbox" id="guard" ${S.config.golive && S.config.golive.guard === false ? "" : "checked"} /><span><b>${t("Pojistka: když pustím stream tlačítkem v OBS, otevřít okno s názvem a kategorií", "Safety net: when I start the stream with the OBS button, open the title and category window")}</b><br /><span class="muted small">${t("Stream už v tu chvíli běží, oznámení na Kicku odejde s původním názvem. Název a kategorie se změní hned po uložení.", "The stream is already running then, so the Kick notification goes out with the old title. The title and category change as soon as you save.")}</span></span></label>
    <p style="margin-top:8px"><a data-open="/dashboard/${esc(S.config.channel.id)}/assistant">${t("Panel TejBot do OBS najdeš na webu v Aplikace do PC", "Find the TejBot panel for OBS on the website under Desktop app")} ›</a></p>
  </div>
  <div class="card">
    <h2>${chip("monitorup")}${t("Odkazy od pomocníků", "Links from editors")} ${PREM() ? "" : premTag()}</h2>
    <p class="soft">${t("Pomocníci kanálu (i ty sám) můžou na webu TejBota u odkazu do OBS kliknout na „Do OBS“ a aplikace ho přidá do OBS jako zdroj Prohlížeč.", "Channel editors (and you) can click “To OBS” next to an OBS link on the TejBot website and the app adds it to OBS as a Browser source.")}</p>
    ${[
      ["ask", t("Vždycky se zeptat", "Always ask"), t("Okno se zeptá, než se cokoli přidá.", "A window asks before anything is added.")],
      ["tejbot", t("Odkazy z TejBota přidat hned", "Add TejBot links right away"), t("Odkazy z tejbot.eu se přidají samy, na ostatní se aplikace zeptá.", "Links from tejbot.eu are added automatically, the app asks about others.")],
      ["off", t("Nepřijímat", "Don't accept"), t("Odkazy z webu se do OBS nedostanou.", "Links from the website never reach OBS.")],
    ]
      .filter(() => PREM())
      .map(([v, n, d]) => `<label class="check radio"><input type="radio" name="remote" value="${v}" data-remote ${S.config.remote && S.config.remote.mode === v ? "checked" : ""} /><span>${n}<br /><span class="muted small">${d}</span></span></label>`)
      .join("")}
    ${PREM() ? "" : `<p class="muted small" style="margin-top:8px">${ic("crown")} ${t("Posílání odkazů do OBS od pomocníků je součást Premium.", "OBS links from editors are part of Premium.")}</p>`}
  </div>`;
}

function voiceLabel() {
  const v = S.voice;
  const mic = /^mic/.test(v.error);
  return {
    off: ["", t("Vypnuto", "Off")],
    loading: ["warn", t("Připravuji rozpoznávání… (poprvé to trvá až půl minuty)", "Preparing recognition… (the first time takes up to half a minute)")],
    listening: ["ok", t("Poslouchám", "Listening")],
    nophrases: ["warn", t("Žádný příkaz nemá větu pro hlas. Doplň ji v části Příkazy a zkratky.", "No command has a voice phrase. Add one under Commands & hotkeys.")],
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
// dva povely, které znějí skoro stejně (liší se nejvýš dvěma písmeny), si model plete
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function similarPhrases() {
  const p = [...new Set(S.config.commands.map((x) => x.phrase).filter(Boolean))];
  const out = [];
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (lev(p[i], p[j]) <= 2) out.push([p[i], p[j]]);
  return out;
}
function tabVoice() {
  const v = S.voice;
  const c = S.config.voice;
  const [dot, label] = voiceLabel();
  const withPhrase = S.config.commands.filter((x) => x.phrase);
  const fresh = v.heard && Date.now() - v.heardAt < 60000;
  return `<div class="head"><h1>${t("Hlasové povely", "Voice commands")}</h1><p class="muted">${t("Řekneš větu a aplikace udělá akci. Rozpoznávání běží jen v tvém počítači, hlas se nikam neposílá.", "Say a phrase and the app does the action. Recognition runs on your computer only; your voice is never sent anywhere.")}</p></div>
  <div class="card ${c.enabled && v.status === "listening" ? "glow" : ""}">
    <h2>${chip("wave")}${t("Poslouchání", "Listening")}<span class="tag ${dot === "ok" ? "ok" : ""}"><span class="dot ${dot}"></span>${dot === "ok" ? t("běží", "on") : c.enabled ? t("připravuji", "starting") : t("vypnuto", "off")}</span></h2>
    <label class="check"><input type="checkbox" id="voiceon" ${c.enabled ? "checked" : ""} /><span><b>${t("Poslouchat hlasové povely", "Listen for voice commands")}</b></span></label>
    <p class="soft small" style="margin-top:2px">${label}</p>
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
    ${c.enabled && c.wake !== false && v.status === "listening" && !v.wakes.length ? `<div class="note">${ic("alert")}<span>${t("Tohle oslovení hlasový model nezná. Zvol jiné, běžné slovo (třeba „počítači“).", "The voice model doesn't know this wake word. Pick a common word (like “computer”).")}</span></div>` : ""}
  </div>
  <div class="card">
    <h2>${chip("headphones", "cyan")}${t("Zkouška mikrofonu", "Microphone test")}</h2>
    ${
      v.status !== "listening"
        ? `<p class="muted">${t("Nejdřív nahoře zapni poslouchání.", "Turn listening on above first.")}</p>`
        : `<p class="muted small">${t("Mluv normálně. Proužek má při řeči doskočit zhruba do dvou třetin.", "Speak normally. The bar should reach about two thirds while you talk.")}</p>
    <div class="meter"><div id="miclevel"></div></div>
    <div class="row" style="margin-top:12px;gap:8px;flex-wrap:wrap">
      <button class="btn sm" id="voicecalib" ${v.calib === "run" ? "disabled" : ""}>${v.calib === "run" ? t("Mluv… (4 vteřiny)", "Speak… (4 seconds)") : t("Nastavit hlasitost mikrofonu", "Set microphone volume")}</button>
      <button class="btn sm ${v.test ? "primary" : ""}" id="voicetest">${v.test ? t("Ukončit zkoušku", "End test") : t("Zkoušet povely (nic se nespustí)", "Try commands (nothing runs)")}</button>
    </div>
    ${v.calib === "ok" ? `<p class="muted small" style="margin-top:8px">${ic("check")} ${t("Hlasitost nastavena.", "Volume set.")}</p>` : v.calib === "silent" ? `<p class="error" style="margin-top:8px">${t("Nic jsem neslyšel. Je vybraný správný mikrofon a není ztlumený?", "I heard nothing. Is the right microphone selected and not muted?")}</p>` : v.calib === "run" ? `<p class="muted small" style="margin-top:8px">${t(`Říkej třeba: „${wakeName()} ${esc((withPhrase[0] || {}).phrase || "")}“`, `Say for example: “${wakeName()} ${esc((withPhrase[0] || {}).phrase || "")}”`)}</p>` : ""}
    ${
      v.test
        ? `<p style="margin-top:12px">${t("Řekni postupně každý povel. Uvidíš, co aplikace slyšela:", "Say each command in turn. You'll see what the app heard:")}</p>
      <ul class="clips">${v.log.length ? v.log.map(heardRow).join("") : `<li><span class="muted">${t("Zatím nic…", "Nothing yet…")}</span></li>`}</ul>`
        : ""
    }`
    }
  </div>
  <div class="card">
    <h2>${chip("search", "cyan")}${t("Co naposledy slyšel", "Last heard")}</h2>
    ${fresh && v.log[0] ? `<ul class="clips">${heardRow(v.log[0])}</ul>` : `<p class="muted">${t("Zatím nic. Zkus říct některou větu níže.", "Nothing yet. Try saying one of the phrases below.")}</p>`}
  </div>
  <div class="card">
    <div class="row sp" style="margin-bottom:12px"><h2 style="margin:0">${chip("keyboard")}${t("Věty, na které slyší", "Phrases it listens for")}</h2><button class="btn sm" data-tab="cmds">${t("Upravit v Příkazech", "Edit in Commands")} ›</button></div>
    ${
      withPhrase.length
        ? `<ul class="clips">${withPhrase.map((x) => `<li><span><b>„${S.config.voice.wake === false ? "" : `${wakeName()} `}${esc(x.phrase)}“</b></span><span class="muted small">${esc(t((S.actions.find((a) => a.key === x.action) || {}).cs || "", (S.actions.find((a) => a.key === x.action) || {}).en || ""))}${x.param ? `: ${esc(x.param)}` : ""}</span></li>`).join("")}</ul>`
        : `<p class="muted">${t("Žádná. V části Příkazy a zkratky doplň u příkazu „Větu pro hlas“.", "None. Add a “Voice phrase” to a command under Commands & hotkeys.")}</p>`
    }
    ${similarPhrases().map(([a, b]) => `<div class="note">${ic("alert")}<span>${t(`Povely „${esc(a)}“ a „${esc(b)}“ znějí skoro stejně a budou se plést. Jeden z nich přepiš jinými slovy.`, `The commands “${esc(a)}” and “${esc(b)}” sound almost the same and will get mixed up. Reword one of them.`)}</span></div>`).join("")}
    ${v.unknown.length ? `<div class="note">${ic("alert")}<span>${t("Tahle slova hlasový model nezná, věta s nimi nebude fungovat. Zkus jiné slovo:", "The voice model doesn't know these words, so phrases with them won't work. Try another word:")} <b>${v.unknown.map(esc).join(", ")}</b></span></div>` : ""}
  </div>
  <div class="card">
    <details class="more" style="border:0;margin:0;padding:0">
    <summary>${chip("bulb", "gold")} ${t("Tipy pro spolehlivé povely", "Tips for reliable commands")}</summary>
    <ol class="steps">
      <li>${t("Povel má nejvýš 3 slova. Dvě slova jsou spolehlivější než jedno („udělej klip“ místo „klip“).", "A command has at most 3 words. Two words are more reliable than one (“make a clip” rather than “clip”).")}</li>
      <li>${t("Oslovení a povel řekni vcelku, nebo po oslovení udělej krátkou pauzu (do 5 vteřin).", "Say the wake word and the command together, or pause briefly after the wake word (up to 5 seconds).")}</li>
      <li>${t("Model zná jen běžná slova. Vymyšlená slova a jména nezná, aplikace tě na ně upozorní.", "The model only knows common words. It doesn't know made-up words and names; the app warns you about them.")}</li>
      <li>${t("Piš věty běžnými slovy s háčky a čárkami, bez číslic (místo „2“ napiš „dva“).", "Write phrases in ordinary words, no digits (write “two” instead of “2”).")}</li>
      <li>${t("Každá věta ať zní jinak. Dvě podobné věty si aplikace může splést.", "Make each phrase sound different. Two similar phrases can get mixed up.")}</li>
    </ol>
    </details>
  </div>`;
}

// ---------------------------------------------------------------- mikrofon (presety jako filtry v OBS)
let M = null; // stav z OBS
let mv = null; // právě nastavené hodnoty na posuvnících
let mpreset = "";
let micTimer = null;
// vlastní a veřejné presety (z webu)
let P = { loaded: false, loading: false, mine: [], list: [], max: 3, error: "" };
let pq = "";
let pcat = "";
let pform = { name: "", category: "talk", microphone: "", public: false };
const CATS = () => [
  ["talk", t("Mluvení / Just chatting", "Talking / Just chatting")],
  ["gaming", t("Hraní her", "Gaming")],
  ["podcast", t("Podcast", "Podcast")],
  ["singing", t("Zpěv", "Singing")],
  ["noisy", t("Hlučná místnost", "Noisy room")],
  ["asmr", t("Tichý hlas / ASMR", "Quiet voice / ASMR")],
  ["other", t("Ostatní", "Other")],
];
const catName = (k) => (CATS().find((c) => c[0] === k) || [k, k])[1];
async function loadPresets() {
  P.loading = true;
  const r = await tb.call("presetList", pq, pcat);
  P.loading = false;
  P.loaded = true;
  if (r.ok) P = { ...P, mine: r.data.mine || [], list: r.data.list || [], max: r.data.max || 3, error: "" };
  else P.error = r.message;
  if (tab === "mic") render();
}
const ownPreset = () => (mpreset.startsWith("p:") ? P.mine.find((x) => `p:${x.id}` === mpreset) : null);
async function loadMic() {
  M = await tb.call("micStatus");
  if (!mv) {
    mv = { ...M.values };
    mpreset = M.preset;
  }
  if (tab === "mic") render();
}
let msub = "preset"; // část stránky Zvuk mikrofonu
function micInput() {
  const o = S.config.obs;
  return `<div class="card">
    <h2>${chip("mic")}${t("Tvůj mikrofon v OBS", "Your microphone in OBS")}</h2>
    <select id="mic"><option value="">${t("– vyber zdroj zvuku z OBS –", "– pick an OBS audio source –")}</option>${[...new Set([...lists.inputs, o.mic].filter(Boolean))].map((n) => `<option ${n === o.mic ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
    <p class="muted small" style="margin-top:6px">${S.obs.connected ? t("Na tenhle zdroj se dávají presety a funguje na něj i zkratka pro ztlumení.", "Presets go on this source, and the mute hotkey works on it too.") : t("Seznam se načte, až bude OBS připojené.", "The list loads once OBS is connected.")}</p>
  </div>`;
}
function tabMic() {
  const head = `<div class="head"><h1>${t("Zvuk mikrofonu", "Microphone sound")}</h1><p class="muted">${t("Presety zvuku mikrofonu. Aplikace je nastaví jako filtry přímo v OBS, takže platí pro stream i nahrávky a fungují i s vypnutou aplikací.", "Microphone sound presets. The app sets them as filters right in OBS, so they apply to your stream and recordings and keep working with the app closed.")}</p></div>`;
  if (!M) return `${head}${micInput()}<div class="card"><p class="muted">${t("Načítám…", "Loading…")}</p></div>`;
  if (!M.ready) return `${head}${micInput()}<div class="card warnc"><div class="note" style="margin-top:0">${ic("alert")}<span>${esc(M.error)}</span></div><div style="margin-top:12px"><button class="btn sm" id="micreload">${ic("refresh")} ${t("Zkusit znovu", "Try again")}</button></div></div>`;
  const state = M.applied ? (M.bypass ? ["warn", t("Preset je v OBS, ale teď je vypnutý (porovnání)", "The preset is in OBS but currently off (comparison)")] : ["ok", t("Preset je v OBS zapnutý", "The preset is on in OBS")]) : ["", t("V OBS zatím žádný preset není", "No preset in OBS yet")];
  const slider = (f) =>
    f.type === "bool"
      ? `<label class="check" style="grid-column:1/-1"><input type="checkbox" data-mic="${f.key}" ${mv[f.key] ? "checked" : ""} /><span><b>${esc(t(f.cs, f.en))}</b></span></label>`
      : `<div><label class="f">${esc(t(f.cs, f.en))} <b data-micval="${f.key}">${mv[f.key]} ${f.unit}</b></label><input type="range" data-mic="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${mv[f.key]}" />${f.hintCs ? `<p class="muted small">${esc(t(f.hintCs, f.hintEn))}</p>` : ""}</div>`;
  const seg = [
    ["preset", "sliders", t("Preset", "Preset")],
    ["mine", "star", `${t("Moje presety", "My presets")} (${P.mine.length}/${P.max})`],
    ["community", "globe", t("Komunitní", "Community")],
    ["help", "info", t("Jak to vyzkoušet", "How to try it")],
  ];
  const body = {
    preset: `<div class="card ${M.applied && !M.bypass ? "glow" : ""}">
    <div class="row sp"><h2 style="margin:0">${chip("sliders")}${t("Preset", "Preset")}<span class="tag ${state[0] === "ok" ? "ok" : ""}"><span class="dot ${state[0]}"></span>${state[1]}</span></h2><button class="btn sm ghost" id="micreload">${ic("refresh")} ${t("Obnovit", "Refresh")}</button></div>
    <h3 style="margin-top:18px">1 · ${t("Vyber preset", "Pick a preset")}</h3>
    <div class="presets">${M.presets.map((p) => `<button class="preset ${p.key === mpreset ? "sel" : ""}" data-micpreset="${p.key}"><b>${esc(t(p.cs, p.en))}</b><span class="muted small">${esc(t(p.descCs, p.descEn))}</span></button>`).join("")}${P.mine.map(presetBtn).join("")}</div>
    <h3 style="margin-top:20px">2 · ${t("Dolaď si ho", "Fine-tune it")}</h3>
    <div class="sliders">${M.fields.map(slider).join("")}</div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="micothers" ${M.disableOthers ? "checked" : ""} /><span><b>${t("Vypnout moje ostatní filtry na mikrofonu", "Turn off my other microphone filters")}</b><br /><span class="muted small">${t(`Nesmažou se, jen se vypnou, ať se úpravy nesčítají. Teď jich tam máš: ${M.others}.`, `They aren't deleted, just turned off so effects don't stack. You have ${M.others} there now.`)}</span></span></label>
    <h3 style="margin-top:20px">3 · ${t("Použij a poslechni si", "Apply and listen")}</h3>
    <div class="row" style="gap:8px">
      <button class="btn primary" id="micapply">${ic("check")} ${M.applied ? t("Uložit změny do OBS", "Save changes to OBS") : t("Použít v OBS", "Apply in OBS")}</button>
      <button class="btn ${M.monitoring ? "gold" : ""}" id="micmon">${ic("headphones")} ${M.monitoring ? t("Vypnout poslech", "Stop listening") : t("Poslech ve sluchátkách", "Listen in headphones")}</button>
      <button class="btn" id="micab" ${M.applied ? "" : "disabled"}>${M.bypass ? t("Zapnout preset", "Turn preset on") : t("Porovnat: bez presetu", "Compare: without preset")}</button>
      <button class="btn danger" id="micrevert" ${M.applied ? "" : "disabled"}>${t("Vrátit zpět", "Revert")}</button>
    </div>
    <p class="muted small" style="margin-top:10px">${M.applied ? t("Posuvníky teď mění zvuk v OBS hned, jak s nimi pohneš.", "The sliders now change the sound in OBS as you move them.") : t("Dokud nedáš „Použít v OBS“, v OBS se nic nemění.", "Nothing changes in OBS until you click “Apply in OBS”.")}</p>
  </div>`,
    mine: tabPresets("mine"),
    community: tabPresets("community"),
    help: `<div class="card">
    <h2>${chip("bulb", "gold")}${t("Jak si to vyzkoušet", "How to try it")}</h2>
    <ol class="steps">
      <li>${t("Nasaď si sluchátka a klikni „Poslech ve sluchátkách“. Uslyšíš svůj mikrofon přes OBS.", "Put on headphones and click “Listen in headphones”. You'll hear your microphone through OBS.")}</li>
      <li>${t("Klikni „Použít v OBS“ a mluv. Posuvníky mění zvuk hned.", "Click “Apply in OBS” and talk. The sliders change the sound right away.")}</li>
      <li>${t("Tlačítkem „Porovnat“ přepínáš mezi zvukem bez presetu a s ním.", "Use “Compare” to switch between the sound without and with the preset.")}</li>
      <li>${t("Nelíbí se? „Vrátit zpět“ smaže jen filtry od TejBota a zapne ty tvoje. Mikrofon bude jako předtím.", "Don't like it? “Revert” removes only TejBot's filters and turns yours back on. The microphone is as before.")}</li>
    </ol>
    <div class="note">${ic("alert")}<span>${t("Pozor při živém vysílání: změny jdou rovnou do streamu. Zkoušej raději mimo stream, nebo si pusť nahrávání a poslechni si záznam. Když poslech neslyšíš, nastav v OBS Nastavení → Zvuk → Zařízení pro odposlech.", "Careful when live: changes go straight to the stream. Rather try it off stream, or record and listen back. If you can't hear the monitoring, set OBS Settings → Audio → Monitoring Device.")}</span></div>
    <p class="muted small" style="margin-top:10px">${t("Filtry najdeš v OBS: pravým tlačítkem na mikrofon → Filtry. Začínají slovem TejBot. Presety jsou výchozí bod, konečný zvuk záleží na místnosti, vzdálenosti od mikrofonu a zisku na zvukovce.", "Find the filters in OBS: right-click the microphone → Filters. They start with TejBot. Presets are a starting point; the final sound depends on your room, mic distance and interface gain.")}</p>
  </div>`,
  }[msub];
  return `${head}${micInput()}<div class="seg">${seg.map(([k, i, n]) => `<button data-msub="${k}" class="${k === msub ? "on" : ""}">${ic(i)}${n}</button>`).join("")}</div>${body}`;
}

function presetBtn(p) {
  const meta = [p.mine ? (p.public ? t("tvůj, veřejný", "yours, public") : t("tvůj, soukromý", "yours, private")) : p.author, catName(p.category), p.microphone, !p.mine && p.uses ? `${t("použito", "used")} ${p.uses}×` : ""].filter(Boolean).map(esc).join(" · ");
  return `<button class="preset ${`p:${p.id}` === mpreset ? "sel" : ""}" data-mypreset="${esc(p.id)}"><b>${p.mine ? "★ " : ""}${esc(p.name)}</b><span class="muted small">${meta}</span></button>`;
}
function tabPresets(part) {
  const own = ownPreset();
  const full = P.mine.length >= P.max;
  const catSel = (id, val, any) => `<select id="${id}">${any ? `<option value="">${t("Všechny kategorie", "All categories")}</option>` : ""}${CATS().map(([k, n]) => `<option value="${k}" ${k === val ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>`;
  if (part === "mine")
    return `<div class="card">
    <h2>${chip("star", "gold")}${t("Moje presety", "My presets")} <span class="tag">${P.mine.length}/${P.max}</span></h2>
    <p class="muted small">${t("Ulož si, co máš teď nastavené na posuvnících. Výchozí presety zůstanou, jak jsou. Presety se ukládají k tvému kanálu na webu, takže je máš i na jiném počítači.", "Save what you have on the sliders right now. The built-in presets stay as they are. Presets are stored with your channel on the website, so you have them on other computers too.")}</p>
    ${P.error ? `<p class="error">${esc(P.error)}</p>` : ""}
    ${
      P.mine.length
        ? `<ul class="clips" style="margin-top:10px">${P.mine
            .map(
              (p) => `<li><span><b>${esc(p.name)}</b> <span class="tag ${p.public ? "gold" : ""}">${p.public ? t("veřejný", "public") : t("soukromý", "private")}</span><br /><span class="muted small">${[catName(p.category), p.microphone].filter(Boolean).map(esc).join(" · ")}${p.public ? ` · ${t("použito", "used")} ${p.uses}×` : ""}</span></span>
              <span class="row" style="gap:6px"><button class="btn sm" data-mypreset="${esc(p.id)}">${t("Načíst", "Load")}</button><button class="btn sm ghost" data-pubtoggle="${esc(p.id)}">${p.public ? t("Skrýt", "Make private") : t("Zveřejnit", "Publish")}</button><button class="btn sm icon danger" data-pdel="${esc(p.id)}" title="${t("Smazat", "Delete")}">${ic("trash")}</button></span></li>`
            )
            .join("")}</ul>`
        : P.loaded ? `<div class="empty">${chip("star", "gold")}<p>${t("Zatím žádný.", "None yet.")}</p></div>` : `<p class="muted" style="margin-top:8px">${t("Načítám…", "Loading…")}</p>`
    }
    <h3 style="margin-top:18px">${own ? t(`Uložit nastavení (teď máš načtený „${esc(own.name)}“)`, `Save settings (you have “${esc(own.name)}” loaded)`) : t("Uložit současné nastavení jako preset", "Save the current settings as a preset")}</h3>
    <div class="two">
      <div><label class="f">${t("Název", "Name")}</label><input type="text" id="pname" maxlength="40" value="${esc(pform.name)}" placeholder="${t("např. Večerní stream", "e.g. Evening stream")}" /></div>
      <div><label class="f">${t("Mikrofon (nepovinné)", "Microphone (optional)")}</label><input type="text" id="pmic" maxlength="60" value="${esc(pform.microphone)}" placeholder="${t("např. Rode NT1-A, Shure SM7B", "e.g. Rode NT1-A, Shure SM7B")}" /></div>
      <div><label class="f">${t("Kategorie", "Category")}</label>${catSel("pcat", pform.category, false)}</div>
      <div><label class="check" style="margin-top:20px"><input type="checkbox" id="ppublic" ${pform.public ? "checked" : ""} /><span><b>${t("Veřejný", "Public")}</b> <span class="muted small">${t("najdou ho i ostatní streameři", "other streamers can find it")}</span></span></label></div>
    </div>
    <div class="row" style="gap:8px;margin-top:14px">
      ${own ? `<button class="btn primary" id="poverwrite">${t(`Přepsat „${esc(own.name)}“`, `Overwrite “${esc(own.name)}”`)}</button>` : ""}
      <button class="btn ${own ? "" : "primary"}" id="psave" ${full ? "disabled" : ""}>${ic("plus")} ${t("Uložit jako nový", "Save as new")}</button>
      ${full ? `<span class="muted small">${t("Máš plno (3/3). Některý smaž, nebo načti a přepiš.", "You're full (3/3). Delete one, or load and overwrite it.")}</span>` : ""}
    </div>
  </div>`;
  return `<div class="card">
    <h2>${chip("globe", "cyan")}${t("Komunitní presety", "Community presets")}</h2>
    <p class="muted small">${t("Veřejné presety streamerů, i tvoje (★). Hledej podle názvu nebo mikrofonu. Načtený preset si dolaď na záložce Preset a ulož jako svůj.", "Public presets from streamers, yours included (★). Search by name or microphone. Fine-tune a loaded preset on the Preset tab and save it as yours.")}</p>
    <div class="row" style="margin-top:12px;flex-wrap:nowrap">
      <div style="flex:1.4"><input type="text" id="pq" maxlength="60" value="${esc(pq)}" placeholder="${t("Hledat název nebo mikrofon (např. SM7B)", "Search name or microphone (e.g. SM7B)")}" /></div>
      <div style="flex:1">${catSel("pqcat", pcat, true)}</div>
      <button class="btn" id="psearch" ${P.loading ? "disabled" : ""}>${ic("search")} ${t("Hledat", "Search")}</button>
    </div>
    ${
      P.list.length
        ? `<div class="presets" style="margin-top:14px">${P.list.map(presetBtn).join("")}</div>`
        : P.loaded ? `<div class="empty">${chip("globe", "cyan")}<p>${t("Nic nenalezeno. Buď první, kdo sem dá svůj preset.", "Nothing found. Be the first to share yours.")}</p></div>` : ""
    }
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
  return `<div class="head"><h1>${t("Hudba ve streamu", "Music on stream")}</h1><p class="muted">${t("Widget „Co poslouchám“ ve streamu ukazuje skladbu, která ti zrovna hraje.", "The “Listening to” stream widget shows the track you're playing.")}</p></div>
  ${!S.musicAvailable ? `<div class="card warnc"><p class="soft">${S.platform === "linux" ? t("Na Linuxu je potřeba program playerctl. Nainstaluj ho (např. sudo apt install playerctl) a aplikaci spusť znovu.", "On Linux this needs the playerctl program. Install it (e.g. sudo apt install playerctl) and restart the app.") : t("Na tomhle systému zjišťování hudby nefunguje.", "Music detection isn't available on this system.")}</p></div>` : ""}
  <div class="card ${m.enabled ? "glow" : ""}">
    <h2>${chip("music")}${t("Widget „Co poslouchám“", "“Listening to” widget")}</h2>
    <label class="check"><input type="checkbox" id="musicon" ${m.enabled ? "checked" : ""} /><span><b>${t("Posílat do streamu, co poslouchám", "Send what I'm listening to to the stream")}</b><br /><span class="muted small">${t("Na web jde jen název skladby, interpret a název aplikace.", "Only the track title, artist and app name go to the website.")}</span></span></label>
    <h3 style="margin-top:16px">${t("Odkud se smí hudba brát", "Allowed sources")}</h3>
    ${src.map(([k, n]) => `<label class="check"><input type="checkbox" data-src="${k}" ${m.sources[k] ? "checked" : ""} /><span>${n}</span></label>`).join("")}
    <p class="muted small" style="margin-top:6px">${t("Prohlížeč ukáže cokoli, co v něm hraje se zvukem, tedy i video. Když to nechceš, nech zapnuté jen Spotify a Apple Music.", "The browser shows anything playing with sound, including videos. If you don't want that, keep only Spotify and Apple Music on.")}</p>
  </div>
  <div class="card">
    <h2>${chip("headphones", "cyan")}${t("Právě teď", "Right now")}</h2>
    <p style="font-size:15px">${tr ? `<b>${esc(tr.title)}</b>${tr.artist ? ` <span class="soft">· ${esc(tr.artist)}</span>` : ""}${tr.app ? ` <span class="tag">${esc(tr.app)}</span>` : ""}` : `<span class="muted">${t("Nic nehraje.", "Nothing is playing.")}</span>`}</p>
    <p class="muted small" style="margin-top:10px">${t("Odkaz na widget do OBS najdeš na webu:", "Find the OBS widget link on the website:")} <a data-open="/dashboard/${esc(S.config.channel.id)}/assistant">${t("Aplikace do PC", "Desktop app")}</a></p>
  </div>`;
}

function tabSettings() {
  return `<div class="head"><h1>${t("Nastavení", "Settings")}</h1><p class="muted">${t("Spouštění, jazyk, aktualizace a propojení s kanálem. Složku s klipy najdeš v OBS a klipy.", "Startup, language, updates and the channel link. The clips folder is under OBS & clips.")}</p></div>
  <div class="card">
    <h2>${chip("settings")}${t("Aplikace", "App")}</h2>
    <label class="check"><input type="checkbox" id="autostart" ${S.config.autostart ? "checked" : ""} /><span>${t("Spouštět po zapnutí počítače (schovaná u hodin)", "Start when the computer starts (hidden in the tray)")}</span></label>
    <div class="field" style="margin-top:10px;max-width:260px"><label class="f">${t("Jazyk", "Language")}</label><select id="langsel">${LANG_LIST.map(([l, n]) => `<option value="${l}" ${S.config.lang === l ? "selected" : ""}>${n}</option>`).join("")}</select></div>
  </div>
  <div class="card">
    <div class="row sp"><h2 style="margin:0">${chip("download", "cyan")}${t("Aktualizace", "Updates")} <span class="tag">v${esc(S.version)}</span></h2>
      ${
        S.update.status === "ready"
          ? `<button class="btn primary" id="installupdate">${ic("download")} ${t("Nainstalovat verzi", "Install version")} ${esc(S.update.version)}</button>`
          : `<button class="btn" id="checkupdate" ${S.update.status === "checking" || S.update.status === "downloading" ? "disabled" : ""}>${ic("refresh")} ${t("Zkontrolovat aktualizace", "Check for updates")}</button>`
      }
    </div>
    <p class="${S.update.status === "error" ? "error" : "muted small"}" style="margin-top:10px">${
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
    <h2>${chip("crown", "gold")}${t("Kanál", "Channel")}</h2>
    <div class="row sp"><span><b>${esc(S.config.channel.name)}</b> ${PREM() ? `<span class="tag gold">${ic("crown")} Premium</span>` : `<span class="tag">${t("Zdarma", "Free")}</span>`}</span>
    <span class="row"><button class="btn" data-open="/dashboard/${esc(S.config.channel.id)}/assistant">${ic("external")} ${t("Otevřít web", "Open the website")}</button><button class="btn danger" id="unpair">${ic("power")} ${t("Odpojit aplikaci", "Disconnect the app")}</button></span></div>
  </div>
  <div class="card">
    <h2>${chip("trash", "red")}${t("Odinstalovat", "Uninstall")}</h2>
    <p class="soft">${t("Odstraní aplikaci z počítače i s jejím nastavením a odpojí tenhle počítač od kanálu. Tvoje klipy zůstanou ve složce, kde jsou.", "Removes the app and its settings from this computer and disconnects it from the channel. Your clips stay in their folder.")}</p>
    <div style="margin-top:12px"><button class="btn danger" id="uninstall">${ic("trash")} ${t("Odinstalovat Tejbot Assistent", "Uninstall Tejbot Assistent")}</button></div>
  </div>`;
}

function render() {
  if (!S) return;
  document.documentElement.lang = S.config.lang;
  if (S.web === "unpaired") return paint(screenPair()), bind();
  if (S.web === "offline" || S.web === "unknown") return paint(screenOffline()), bind();
  if (!S.config.setupDone) return paint(screenSetup()), bind();
  const body = !PREM() && PREM_TABS.includes(tab) ? lockedTab(tab) : { home: tabHome, cmds: tabCmds, obs: tabObs, mic: tabMic, voice: tabVoice, music: tabMusic, settings: tabSettings }[tab]();
  const ch = S.config.channel;
  // překreslení nesmí okno posunout nahoru (třeba po uložení)
  const prevMain = document.querySelector(".main");
  const keep = prevMain && render.tab === tab ? prevMain.scrollTop : 0;
  render.tab = tab;
  const [oc] = obsLabel();
  const cur = TABS().find(([k]) => k === tab);
  paint(`<aside class="side">
    <div class="logo drag"><img src="icon.png" alt="" /><span>Tejbot Assistent<small>${PREM() ? "Premium" : t("Zdarma", "Free")}</small></span></div>
    <nav class="nav">${NAV()
      .map(([g, items]) => `${g ? `<div class="grp">${esc(g)}</div>` : ""}${items.map(([k, i, n]) => `<button data-tab="${k}" class="${k === tab ? "on" : ""}">${ic(i)}<span>${n}</span>${!PREM() && PREM_TABS.includes(k) ? `<span class="navlock" title="Premium">${ic("crown")}</span>` : ""}${k === "obs" && !S.obs.connected ? `<span class="badge dot warn" title="${t("OBS není připojené", "OBS isn't connected")}"></span>` : ""}</button>`).join("")}`)
      .join("")}</nav>
    <div class="foot">
      <div class="chan">${ch.avatar ? `<img src="${esc(ch.avatar)}" alt="" />` : `<span class="ava">${esc((ch.name || "?").slice(0, 1).toUpperCase())}</span>`}<span style="min-width:0"><span class="nm" style="display:block">${esc(ch.name)}</span>${PREM() ? `<span class="pr">${ic("crown")} PREMIUM</span>` : `<span class="pr free">${t("ZDARMA", "FREE")}</span>`}</span></div>
      <div class="minis"><span class="mini" title="OBS"><span class="dot ${oc}"></span>OBS</span><span class="mini" title="${t("Hlasové povely", "Voice commands")}"><span class="dot ${S.voice.status === "listening" ? "ok" : S.config.voice.enabled ? "warn" : ""}"></span>${t("Hlas", "Voice")}</span><span class="mini" title="${t("Hudba", "Music")}"><span class="dot ${S.track ? "ok" : ""}"></span>${t("Hudba", "Music")}</span></div>
    </div>
  </aside><div class="mainwrap"><div class="topbar drag"><span class="crumb">Tejbot Assistent <span>›</span> <b>${cur ? cur[2] : ""}</b></span></div><main class="main"><div class="page" id="pg-${tab}">${body}</div></main></div>`);
  if (keep && document.querySelector(".main").scrollTop !== keep) document.querySelector(".main").scrollTop = keep;
  bind();
}

// ---------------------------------------------------------------- překreslení bez blikání
// Okno se nepřepisuje celé (to restartovalo animaci stránky a náhledy klipů = problikávání),
// ale porovná se se starým a změní se jen to, co je jinak.
const sig = (n) => (n.nodeType !== 1 ? `#${n.nodeType}` : `${n.tagName}#${n.id}|${n.getAttribute("type") || ""}|${[...n.attributes].map((a) => a.name).filter((x) => x.startsWith("data-")).sort().join(",")}`);
function syncAttrs(a, b) {
  for (const at of [...a.attributes]) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
  for (const at of [...b.attributes]) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
}
function morph(from, to) {
  const a = [...from.childNodes];
  const b = [...to.childNodes];
  for (let i = 0; i < b.length; i++) {
    const nb = b[i];
    const na = a[i];
    if (!na) {
      from.appendChild(nb);
      continue;
    }
    if (sig(na) !== sig(nb)) {
      from.replaceChild(nb, na);
      continue;
    }
    if (na.nodeType !== 1) {
      if (na.nodeValue !== nb.nodeValue) na.nodeValue = nb.nodeValue;
      continue;
    }
    // stejné video (náhled klipu) nechat být, jinak by se znovu načítalo
    if (na.tagName === "VIDEO" && na.getAttribute("src") === nb.getAttribute("src")) continue;
    const focused = na === document.activeElement;
    const selVal = na.tagName === "SELECT" ? ((nb.querySelector("option[selected]") || nb.querySelector("option") || {}).value ?? "") : null;
    syncAttrs(na, nb);
    if (na.tagName === "INPUT" && !focused) {
      if (na.type === "checkbox" || na.type === "radio") na.checked = nb.hasAttribute("checked");
      else if (na.value !== (nb.getAttribute("value") || "")) na.value = nb.getAttribute("value") || "";
    }
    morph(na, nb);
    if (selVal !== null && !focused && na.value !== selVal) na.value = selVal;
  }
  for (let i = a.length - 1; i >= b.length; i--) if (a[i].parentNode === from) from.removeChild(a[i]);
}
function paint(html) {
  const tpl = document.createElement("div");
  tpl.innerHTML = html;
  morph($app, tpl);
}

// ---------------------------------------------------------------- klikání

// posluchač se přidá jen jednou (prvky, které překreslení nechá, ho už mají)
const BOUND = new WeakMap();
const on = (sel, ev, fn) =>
  document.querySelectorAll(sel).forEach((el) => {
    const key = `${ev} ${sel}`;
    let set = BOUND.get(el);
    if (!set) BOUND.set(el, (set = new Set()));
    if (set.has(key)) return;
    set.add(key);
    el.addEventListener(ev, (e) => fn(el, e));
  });
const apply = (s) => {
  S = s;
  render();
};

async function openTab(k) {
  tab = k;
  if (k === "cmds") cmds = S.config.commands.map((c) => ({ ...c }));
  if (k === "cmds" || k === "obs" || k === "mic") lists = await tb.call("obsLists");
  if (k === "mic") {
    void loadMic();
    void loadPresets();
  }
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
    if (!(await ask(t("Smazat klip?", "Delete the clip?"), t("Klip se přesune do koše, odkud ho jde vrátit.", "The clip moves to the bin, where you can restore it."), t("Smazat", "Delete"), true))) return;
    const r = await tb.call("trashClip", el.dataset.trash);
    if (!r.ok) toast(r);
  });
  on("#refresh", "click", () => tb.call("refresh"));
  on("#langmini", "change", async (el) => apply(await tb.call("saveSettings", { lang: el.value })));
  on("#unpair", "click", async () => {
    if (await ask(t("Odpojit aplikaci?", "Disconnect the app?"), t("Aplikace se odpojí od kanálu. Znovu ji spáruješ kódem z webu.", "The app disconnects from the channel. Pair it again with a code from the website."), t("Odpojit", "Disconnect"), true)) await tb.call("unpair");
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
  on("#mic", "change", async (el) => {
    apply(await tb.call("saveSettings", { obs: { mic: el.value } }));
    if (tab === "mic") void loadMic();
  });
  on("#autoreplay", "change", async (el) => apply(await tb.call("saveSettings", { obs: { autoReplay: el.checked } })));

  // hlas
  on("#voiceon", "change", async (el) => apply(await tb.call("saveSettings", { voice: { enabled: el.checked } })));
  on("#voicemic", "change", async (el) => apply(await tb.call("saveSettings", { voice: { deviceId: el.value } })));
  on("#voicewake", "change", async (el) => apply(await tb.call("saveSettings", { voice: { wakeWord: el.value } })));
  on("#voicewakeon", "change", async (el) => apply(await tb.call("saveSettings", { voice: { wake: el.checked } })));
  on("#voicestrict", "change", async (el) => apply(await tb.call("saveSettings", { voice: { strict: Number(el.value) } })));
  on("#voicecalib", "click", async () => apply(await tb.call("voiceCalibrate")));
  on("#voicetest", "click", async () => apply(await tb.call("voiceTest", !S.voice.test)));
  // mikrofon
  const micDo = async (name, ...args) => {
    toast(await tb.call(name, ...args));
    await loadMic();
  };
  const micLive = () => {
    if (!M || !M.applied) return;
    clearTimeout(micTimer);
    micTimer = setTimeout(() => void tb.call("micApply", mpreset, mv, false), 200);
  };
  on("#micreload", "click", () => void loadMic());
  on("[data-msub]", "click", (el) => {
    msub = el.dataset.msub;
    render();
  });
  on("[data-micpreset]", "click", (el) => {
    const p = M.presets.find((x) => x.key === el.dataset.micpreset);
    if (!p) return;
    mpreset = p.key;
    mv = { ...p.v };
    render();
    micLive();
  });
  on("[data-mic]", "input", (el) => {
    const f = M.fields.find((x) => x.key === el.dataset.mic);
    mv[f.key] = f.type === "bool" ? el.checked : Number(el.value);
    mpreset = mpreset || "custom";
    const out = document.querySelector(`[data-micval="${f.key}"]`);
    if (out) out.textContent = `${mv[f.key]} ${f.unit}`;
    micLive();
  });
  on("[data-mypreset]", "click", (el) => {
    const p = [...P.mine, ...P.list].find((x) => x.id === el.dataset.mypreset);
    if (!p) return;
    mpreset = `p:${p.id}`;
    mv = { ...mv, ...p.values };
    if (p.mine) pform = { name: p.name, category: p.category, microphone: p.microphone, public: p.public };
    else void tb.call("presetUsed", p.id);
    msub = "preset";
    render();
    micLive();
    toast({ ok: true, message: t(`Načteno: ${p.name}`, `Loaded: ${p.name}`) });
  });
  on("#pname", "input", (el) => (pform.name = el.value));
  on("#pmic", "input", (el) => (pform.microphone = el.value));
  on("#pcat", "change", (el) => (pform.category = el.value));
  on("#ppublic", "change", (el) => (pform.public = el.checked));
  on("#pq", "input", (el) => (pq = el.value));
  on("#pq", "keydown", (_el, e) => e.key === "Enter" && void loadPresets());
  on("#pqcat", "change", (el) => {
    pcat = el.value;
    void loadPresets();
  });
  on("#psearch", "click", () => void loadPresets());
  const presetSave = async (id) => {
    if (!pform.name.trim()) return toast({ ok: false, message: t("Napiš presetu název.", "Give the preset a name.") });
    const body = { ...pform, values: mv };
    const r = id ? await tb.call("presetUpdate", id, body) : await tb.call("presetCreate", body);
    toast(r);
    if (r.ok && !id && r.data && r.data.id) mpreset = `p:${r.data.id}`;
    await loadPresets();
  };
  on("#psave", "click", () => presetSave(""));
  on("#poverwrite", "click", () => {
    const own = ownPreset();
    if (own) void presetSave(own.id);
  });
  on("[data-pubtoggle]", "click", async (el) => {
    const p = P.mine.find((x) => x.id === el.dataset.pubtoggle);
    if (!p) return;
    const r = await tb.call("presetUpdate", p.id, { public: !p.public });
    toast(r.ok ? { ok: true, message: p.public ? t("Preset je teď soukromý.", "The preset is now private.") : t("Preset je teď veřejný.", "The preset is now public.") } : r);
    await loadPresets();
  });
  on("[data-pdel]", "click", async (el) => {
    const p = P.mine.find((x) => x.id === el.dataset.pdel);
    if (!p || !(await ask(t("Smazat preset?", "Delete the preset?"), t(`Preset „${p.name}“ se smaže i z webu.`, `The preset “${p.name}” is deleted from the website too.`), t("Smazat", "Delete"), true))) return;
    toast(await tb.call("presetDelete", p.id));
    if (mpreset === `p:${p.id}`) mpreset = "custom";
    await loadPresets();
  });
  on("#micapply", "click", () => micDo("micApply", mpreset, mv, document.querySelector("#micothers").checked));
  on("#micmon", "click", () => micDo("micMonitor", !M.monitoring));
  on("#micab", "click", () => micDo("micBypass", !M.bypass));
  on("#micrevert", "click", () => micDo("micRevert"));
  on("#voicelang", "change", async (el) => apply(await tb.call("saveSettings", { voice: { lang: el.value } })));

  // hudba
  const saveMusic = async () => {
    const sources = {};
    document.querySelectorAll("[data-src]").forEach((el) => (sources[el.dataset.src] = el.checked));
    apply(await tb.call("saveSettings", { music: { enabled: document.getElementById("musicon").checked, sources } }));
  };
  on("#musicon", "change", saveMusic);
  on("[data-src]", "change", saveMusic);

  // vysílání
  on("#golive", "click", () => openGoLive());
  on("#stopstream", "click", async () => {
    if (!(await ask(t("Ukončit vysílání?", "End the stream?"), t("Stream v OBS se zastaví.", "The stream in OBS will stop."), t("Ukončit", "End"), true))) return;
    toast(await tb.call("run", "stream_stop", ""));
  });
  on("#guard", "change", async (el) => apply(await tb.call("saveSettings", { golive: { guard: el.checked } })));
  on("[data-remote]", "change", async (el) => apply(await tb.call("saveSettings", { remote: { mode: el.value } })));

  // nastavení
  on("#checkupdate", "click", () => tb.call("checkUpdate"));
  on("#installupdate", "click", () => tb.call("installUpdate"));
  on("#uninstall", "click", async () => {
    if (!(await ask(t("Odinstalovat Tejbot Assistent?", "Uninstall Tejbot Assistent?"), t("Aplikace se zavře a smaže se i její nastavení. Klipy zůstanou.", "The app will close and its settings will be deleted. Clips stay."), t("Odinstalovat", "Uninstall"), true))) return;
    const r = await tb.call("uninstall");
    if (!r.ok) toast(r);
  });
  on("#autostart", "change", async (el) => apply(await tb.call("saveSettings", { autostart: el.checked })));
  on("#langsel", "change", async (el) => apply(await tb.call("saveSettings", { lang: el.value })));
}

// ---------------------------------------------------------------- okno „Začít vysílat“
// Jako ve Streamlabs: kliknutí stream hned nespustí, nejdřív se nastaví název a kategorie.
let goliveOpen = false;
async function openGoLive(opts) {
  if (goliveOpen || !S || S.web !== "ok") return;
  goliveOpen = true;
  // stream už běží (pustil ho třeba tlačítkem v OBS) -> jen uložit název a kategorii
  const live = !!((opts && opts.live) || S.obs.streaming);
  const m = document.createElement("div");
  m.className = "modal";
  const rec = S.config.golive || { record: false, recent: [] };
  let cat = null;
  let orig = { title: "", cat: "" };
  let timer = null;
  const catHtml = (c) => `${c.thumbnail ? `<img src="${esc(c.thumbnail)}" alt="" />` : `<span class="noimg">${ic("film")}</span>`}<span>${esc(c.name)}</span>`;
  m.innerHTML = `<div class="mbox wide" role="dialog" aria-modal="true">
    <h2>${chip("radio", "red")}${live ? t("Stream už běží", "You're already live") : t("Začít vysílat", "Go live")}</h2>
    ${live ? `<p class="soft small">${t("Zkontroluj název a kategorii. Po uložení se na Kicku změní hned.", "Check the title and category. They change on Kick as soon as you save.")}</p>` : ""}
    <p id="gl-load" class="muted small">${t("Načítám název a kategorii streamu…", "Loading the stream title and category…")}</p>
    <label class="f" for="gl-title">${t("Název streamu", "Stream title")} <span class="muted small" id="gl-cnt"></span></label>
    <input type="text" id="gl-title" maxlength="140" />
    <label class="f" for="gl-q" style="margin-top:12px">${t("Kategorie", "Category")}</label>
    <div id="gl-cat" class="catsel"></div>
    <input type="text" id="gl-q" placeholder="${t("Hledat kategorii (třeba Just Chatting, Minecraft…)", "Search a category (e.g. Just Chatting, Minecraft…)")}" />
    <div id="gl-res" class="catlist"></div>
    ${rec.recent && rec.recent.length ? `<div class="recent"><span class="muted small">${t("Naposledy:", "Recent:")}</span>${rec.recent.map((c, i) => `<button class="btn sm" data-recent="${i}">${esc(c.name)}</button>`).join("")}</div>` : ""}
    <label class="check" style="margin-top:8px${live ? ";display:none" : ""}"><input type="checkbox" id="gl-rec" ${rec.record && !live ? "checked" : ""} /><span>${t("Spustit i nahrávání (záznam pro Trim editor)", "Start recording too (a recording for the Trim editor)")}</span></label>
    ${S.obs.connected || live ? "" : `<div class="note">${ic("alert")}<span>${t("OBS není připojené, stream teď nejde spustit.", "OBS isn't connected, the stream can't start now.")}</span></div>`}
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn ghost" data-a="0">${t("Zrušit", "Cancel")}</button><button class="btn live" id="gl-go" ${S.obs.connected ? "" : "disabled"}>${live ? `${ic("check")} ${t("Uložit název a kategorii", "Save title and category")}` : `${ic("radio")} ${t("Začít vysílat", "Go live")}`}</button></div>
  </div>`;
  const $ = (sel) => m.querySelector(sel);
  const close = () => {
    m.remove();
    goliveOpen = false;
    document.removeEventListener("keydown", key);
  };
  const key = (e) => e.key === "Escape" && close();
  const setCat = (c) => {
    cat = c;
    $("#gl-cat").innerHTML = c ? `<span class="catitem on">${catHtml(c)}</span>` : `<span class="muted small">${t("Bez kategorie", "No category")}</span>`;
    $("#gl-res").innerHTML = "";
    $("#gl-q").value = "";
  };
  const count = () => ($("#gl-cnt").textContent = `${$("#gl-title").value.length}/140`);
  m.addEventListener("click", (e) => {
    if (e.target === m || e.target.closest('[data-a="0"]')) return close();
    const r = e.target.closest("[data-res]");
    if (r) setCat(JSON.parse(r.dataset.res));
    const rc = e.target.closest("[data-recent]");
    if (rc) setCat(rec.recent[Number(rc.dataset.recent)]);
  });
  document.addEventListener("keydown", key);
  document.body.appendChild(m);
  setCat(null);
  $("#gl-title").addEventListener("input", count);
  $("#gl-q").addEventListener("input", () => {
    clearTimeout(timer);
    const q = $("#gl-q").value.trim();
    if (q.length < 2) return ($("#gl-res").innerHTML = "");
    timer = setTimeout(async () => {
      const list = await tb.call("streamSearch", q);
      if ($("#gl-q").value.trim() !== q) return;
      $("#gl-res").innerHTML = list.length ? list.map((c) => `<button class="catitem" data-res="${esc(JSON.stringify(c))}">${catHtml(c)}</button>`).join("") : `<p class="muted small">${t("Nic jsem nenašel.", "Nothing found.")}</p>`;
    }, 350);
  });
  $("#gl-go").addEventListener("click", async () => {
    const b = $("#gl-go");
    b.disabled = true;
    b.innerHTML = `${ic("refresh")} ${live ? t("Ukládám…", "Saving…") : t("Spouštím…", "Starting…")}`;
    const title = $("#gl-title").value.trim();
    const changed = title !== orig.title || (cat ? String(cat.id) : "") !== orig.cat;
    const r = await tb.call("goLive", { title, category: cat, record: $("#gl-rec").checked, changed });
    toast(r);
    if (r.ok) close();
    else {
      b.disabled = false;
      b.innerHTML = live ? `${ic("check")} ${t("Uložit název a kategorii", "Save title and category")}` : `${ic("radio")} ${t("Začít vysílat", "Go live")}`;
    }
  });
  $("#gl-title").focus();
  const info = await tb.call("streamInfo");
  if (!m.isConnected) return;
  if (info && info.ok) {
    $("#gl-load").hidden = true;
    if (!$("#gl-title").value) $("#gl-title").value = info.title || "";
    orig = { title: info.title || "", cat: info.category && info.category.id ? String(info.category.id) : "" };
    if (!cat && info.category && info.category.name) setCat(info.category);
  } else $("#gl-load").textContent = t("Aktuální název se nepodařilo načíst (bot je offline?). Můžeš ho napsat znovu, nebo jen spustit stream.", "Couldn't load the current title (is the bot offline?). You can type it again or just start the stream.");
  count();
}
tb.on("golive", (d) => openGoLive(d && typeof d === "object" ? d : null));

// ---------------------------------------------------------------- odkaz od pomocníka -> zeptat se
const asking = new Set();
function showAsk(d) {
  if (!d || asking.has(d.id)) return;
  asking.add(d.id);
  const p = d.payload || {};
  const m = document.createElement("div");
  m.className = "modal";
  m.dataset.ask = d.id;
  m.innerHTML = `<div class="mbox wide" role="dialog" aria-modal="true"><h2>${chip("monitorup")}${t("Přidat do OBS?", "Add to OBS?")}</h2>
    <p><b>${esc(d.by || t("Pomocník", "An editor"))}</b> ${t("ti posílá zdroj do OBS:", "is sending you an OBS source:")}</p>
    <div class="askinfo"><div><span class="muted small">${t("Název", "Name")}</span><b>${esc(p.name)}</b></div><div><span class="muted small">${t("Scéna", "Scene")}</span><b>${esc(p.scene || t("aktuální", "current"))}</b></div><div><span class="muted small">${t("Velikost", "Size")}</span><b>${esc(p.width)} × ${esc(p.height)}</b></div></div>
    <div class="path" style="margin-top:10px">${esc(p.url)}</div>
    ${/^https:\/\/([a-z0-9-]+\.)*tejbot\.eu\//i.test(String(p.url)) ? "" : `<div class="note">${ic("alert")}<span>${t("Tohle není odkaz z TejBota. Přidej ho, jen když víš, co to je.", "This isn't a TejBot link. Only add it if you know what it is.")}</span></div>`}
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn ghost" data-a="0">${t("Nepřidávat", "Don't add")}</button><button class="btn primary" data-a="1">${ic("plus")} ${t("Přidat do OBS", "Add to OBS")}</button></div></div>`;
  const done = (yes) => {
    m.remove();
    asking.delete(d.id);
    void tb.call("remoteAnswer", d.id, yes);
  };
  m.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]");
    if (b) done(b.dataset.a === "1");
  });
  document.body.appendChild(m);
}
tb.on("remoteAsk", showAsk);
tb.on("remoteAskClose", (id) => {
  const m = document.querySelector(`[data-ask="${CSS.escape(String(id))}"]`);
  if (m) m.remove();
  asking.delete(id);
});
tb.call("pendingAsks").then((list) => (list || []).forEach(showAsk));

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
  if (before && !before.obs.connected && s.obs.connected && (tab === "obs" || tab === "cmds" || tab === "mic")) lists = await tb.call("obsLists");
  // ať se rozepsané pole nepřekreslí pod rukama
  const typing = document.activeElement && ["INPUT", "SELECT"].includes(document.activeElement.tagName);
  const screenChanged = !before || before.web !== s.web || before.config.setupDone !== s.config.setupDone;
  if (screenChanged || !typing) render();
});
tb.call("state").then(apply);
