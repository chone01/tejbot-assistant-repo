// Živé zprávy z TejBota (Supabase Realtime, stejný kanál jako overlaye v OBS).
// Zatím jediná: divák napsal v chatu !clip -> aplikace uloží klip z OBS.
const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");
const { EventEmitter } = require("events");

const events = new EventEmitter();
let client = null;
let channel = null;
let current = "";

function stop() {
  try {
    if (client && channel) client.removeChannel(channel);
    if (client) client.realtime.disconnect();
  } catch {
    /* už odpojeno */
  }
  client = null;
  channel = null;
  current = "";
}

/** info = { url, key, topic } z webu (null = odpojit) */
function start(info) {
  const id = info ? `${info.url}|${info.key}|${info.topic}` : "";
  if (id === current) return;
  stop();
  if (!info) return;
  current = id;
  try {
    client = createClient(info.url, info.key, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket } });
    channel = client.channel(info.topic, { config: { private: false } });
    channel.on("broadcast", { event: "clip" }, (msg) => events.emit("clip", msg.payload || {}));
    channel.subscribe();
  } catch {
    stop();
  }
}

module.exports = { events, start, stop };
