// Bridge for the local shell page (titlebar, splash, offline screen).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kessoku', {
  platform: process.platform,
  onState: (callback) => {
    ipcRenderer.on('shell:state', (_event, state) => callback(state));
  },
  action: (name) => ipcRenderer.send('shell:action', name),
});
