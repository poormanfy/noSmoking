const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state) => ipcRenderer.invoke('state:save', state),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  quit: () => ipcRenderer.invoke('window:quit'),
  togglePin: (pinned) => ipcRenderer.invoke('window:toggle-pin', pinned),
});
