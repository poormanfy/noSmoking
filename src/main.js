const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const STATE_FILE = () => path.join(app.getPath('userData'), 'no-smoking-state.json');

let win = null;
let tray = null;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
  } catch (_) {
    return null;
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE(), JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 360,
    height: 520,
    minWidth: 320,
    minHeight: 420,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: '戒烟小助手',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);

  win.on('close', (e) => {
    // Minimize to tray instead of quitting
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  // 1x1 transparent fallback if no icon asset exists
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  const image = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip('戒烟小助手');
  const menu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏', click: () => (win.isVisible() ? win.hide() : win.show()) },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => (win.isVisible() ? win.hide() : (win.show(), win.focus())));
}

ipcMain.handle('state:load', () => loadState());
ipcMain.handle('state:save', (_e, state) => saveState(state));
ipcMain.handle('window:minimize', () => win && win.hide());
ipcMain.handle('window:quit', () => {
  app.isQuiting = true;
  app.quit();
});
ipcMain.handle('window:toggle-pin', (_e, pinned) => {
  if (win) win.setAlwaysOnTop(!!pinned);
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Keep running in tray on Windows
});
