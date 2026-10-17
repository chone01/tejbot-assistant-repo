// Překlady aplikace: čeština a angličtina jsou přímo v kódu (L("česky", "english")),
// slovenština, němčina a polština se dohledají ve slovnících i18n/<jazyk>.json podle anglického textu.
const fs = require("fs");
const path = require("path");

const LANGS = ["cs", "en", "sk", "de", "pl"];
const NAMES = { cs: "Čeština", en: "English", sk: "Slovenčina", de: "Deutsch", pl: "Polski" };
const raw = {};
const compiled = {};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function dict(lang) {
  if (lang === "cs" || lang === "en") return null;
  if (!raw[lang]) {
    try {
      raw[lang] = JSON.parse(fs.readFileSync(path.join(__dirname, "i18n", `${lang}.json`), "utf8"));
    } catch {
      raw[lang] = { s: {}, p: [] };
    }
    compiled[lang] = { s: raw[lang].s || {}, p: (raw[lang].p || []).map(([from, to]) => ({ re: new RegExp(`^${esc(from).replace(/\\\{(\d+)\\\}/g, "([\\s\\S]*?)")}$`), to })) };
  }
  return compiled[lang];
}
function tr(lang, cs, en) {
  if (lang === "cs") return cs;
  const d = dict(lang);
  if (!d) return en;
  if (d.s[en]) return d.s[en];
  for (const { re, to } of d.p) {
    const m = re.exec(en);
    if (m) return to.replace(/\{(\d+)\}/g, (_, i) => m[Number(i) + 1] ?? "");
  }
  return en;
}
/** Jazyk podle systému (cs, sk, de, pl), jinak angličtina */
function fromLocale(loc) {
  const l = String(loc || "").toLowerCase().slice(0, 2);
  return LANGS.includes(l) ? l : "en";
}
const LOCALE = { cs: "cs-CZ", en: "en-GB", sk: "sk-SK", de: "de-DE", pl: "pl-PL" };
module.exports = { LANGS, NAMES, LOCALE, tr, dict: (l) => raw[l] || (dict(l), raw[l]) || null, fromLocale };
