// Lets the game know it runs as the desktop app (it then starts on the highest graphics quality).
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('urbaniaDesktop', { platform: process.platform });
