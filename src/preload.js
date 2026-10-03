const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tejbot", {
  call: (name, ...args) => ipcRenderer.invoke(`tb:${name}`, ...args),
  on: (name, fn) => ipcRenderer.on(`tb:${name}`, (_e, data) => fn(data)),
});
