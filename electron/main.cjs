const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PYTHON = process.env.CODEX_QUOTA_PYTHON || 'python';
const PORT = 1420;
const APP_URL = `http://127.0.0.1:${PORT}/`;
const APP_USER_MODEL_ID = 'CodexQuotaGlance.App';
const ICON_PATH = path.join(__dirname, 'icon.ico');
const DEFAULT_CAPSULE_SIZE = { width: 620, height: 72 };
const DEFAULT_DETAIL_SIZE = { width: 520, height: 320 };
const WINDOW_MARGIN = 8;
const SCREEN_MARGIN = 8;
const CAPSULE_WINDOW_PAD = 2;
const LAYOUT_SEND_DELAY_MS = 16;
const TOAST_WINDOW_OVERLAP = 1;
const SPEND_TOAST_HEIGHT = 24;
const RESERVED_TOAST_SPACE = SPEND_TOAST_HEIGHT - TOAST_WINDOW_OVERLAP;
const TEXT = {
  showHide: '\u663e\u793a/\u9690\u85cf\u80f6\u56ca',
  settings: '\u8bbe\u7f6e',
  quit: '\u9000\u51fa',
  settingsTitle: 'Codex Quota Glance \u8bbe\u7f6e'
};

let capsuleWindow = null;
let settingsWindow = null;
let tray = null;
let backendProcess = null;
let ownsBackend = false;
let dragState = null;
let detailOpen = false;
let toastOpen = false;
let capsuleAnchor = null;
let savedCapsulePosition = null;
let lastWindowLayout = {
  placement: 'bottom',
  offsetX: 0,
  offsetY: 0,
  detailOffset: 0,
  popoverShiftX: 0,
  ready: true
};
let lastLayout = {
  capsule: { x: 0, y: 0, width: DEFAULT_CAPSULE_SIZE.width, height: DEFAULT_CAPSULE_SIZE.height },
  toast: { height: 0 },
  detail: { width: DEFAULT_DETAIL_SIZE.width, height: DEFAULT_DETAIL_SIZE.height }
};

async function createApp() {
  app.setName('Codex Quota Glance');
  app.setAppUserModelId(APP_USER_MODEL_ID);
  Menu.setApplicationMenu(null);
  await ensureBackend();
  createTray();
  await createCapsuleWindow();
}

async function createCapsuleWindow() {
  const bounds = screen.getPrimaryDisplay().workArea;
  capsuleWindow = new BrowserWindow({
    width: DEFAULT_CAPSULE_SIZE.width,
    height: DEFAULT_CAPSULE_SIZE.height,
    x: Math.round(bounds.x + bounds.width - DEFAULT_CAPSULE_SIZE.width - 24),
    y: Math.round(bounds.y + 24),
    minWidth: 300,
    minHeight: 56,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    show: false,
    autoHideMenuBar: true,
    icon: ICON_PATH,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  capsuleWindow.setAlwaysOnTop(true, 'floating');
  capsuleWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  capsuleWindow.once('ready-to-show', () => capsuleWindow.showInactive());
  capsuleWindow.on('closed', () => {
    capsuleWindow = null;
  });
  capsuleWindow.setMenu(null);
  installWindowHandlers(capsuleWindow);
  await capsuleWindow.loadURL(`${APP_URL}?desktop=1`);
}

async function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 820,
    height: 620,
    minWidth: 560,
    minHeight: 420,
    show: false,
    autoHideMenuBar: true,
    skipTaskbar: false,
    title: TEXT.settingsTitle,
    backgroundColor: '#f6f8fb',
    icon: ICON_PATH,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  const showSettings = () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return;
    settingsWindow.show();
    settingsWindow.focus();
  };
  settingsWindow.once('ready-to-show', showSettings);
  settingsWindow.webContents.once('did-finish-load', showSettings);
  setTimeout(showSettings, 500);
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  settingsWindow.setMenu(null);
  installWindowHandlers(settingsWindow);
  await settingsWindow.loadURL(`${APP_URL}?view=settings`);
}

function createTray() {
  tray = new Tray(createTrayImage());
  tray.setToolTip('Codex Quota Glance');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => toggleCapsuleWindow());
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: TEXT.showHide, click: () => toggleCapsuleWindow() },
    { label: TEXT.settings, click: () => openSettingsWindow().catch(() => {}) },
    { type: 'separator' },
    { label: TEXT.quit, click: () => app.quit() }
  ]);
}

function toggleCapsuleWindow() {
  if (!capsuleWindow || capsuleWindow.isDestroyed()) {
    createCapsuleWindow().catch(() => {});
    return;
  }
  if (capsuleWindow.isVisible()) {
    detailOpen = false;
    capsuleWindow.hide();
  } else {
    capsuleWindow.showInactive();
  }
}

function createTrayImage() {
  const image = nativeImage.createFromPath(ICON_PATH);
  if (!image.isEmpty()) {
    return image.resize({ width: 16, height: 16 });
  }
  const svg = '<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg"><rect width="32" height="32" rx="8" fill="#17212b"/><circle cx="10.5" cy="15.5" r="4" fill="#ffbd2e"/><circle cx="21.5" cy="15.5" r="4" fill="#28c840"/></svg>';
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
}

function installWindowHandlers(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('context-menu', () => {
    Menu.buildFromTemplate([
      { label: TEXT.showHide, click: () => toggleCapsuleWindow() },
      { label: TEXT.settings, click: () => openSettingsWindow().catch(() => {}) },
      { type: 'separator' },
      { label: TEXT.quit, click: () => app.quit() }
    ]).popup({ window: win });
  });
}

ipcMain.on('desktop-drag-start', (event, point) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== capsuleWindow) return;
  const capsule = getCurrentCapsuleScreenBounds();
  dragState = {
    mouseX: Number(point?.screenX) || 0,
    mouseY: Number(point?.screenY) || 0,
    bounds: win.getBounds(),
    capsule
  };
});

ipcMain.on('desktop-drag-move', (event, point) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== capsuleWindow || !dragState) return;
  const nextX = dragState.bounds.x + Math.round((Number(point?.screenX) || 0) - dragState.mouseX);
  const nextY = dragState.bounds.y + Math.round((Number(point?.screenY) || 0) - dragState.mouseY);
  win.setPosition(nextX, nextY, false);
});

ipcMain.on('desktop-drag-end', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && win === capsuleWindow) {
    const capsule = getCurrentCapsuleScreenBounds();
    savedCapsulePosition = { x: capsule.x, y: capsule.y };
    capsuleAnchor = capsule;
    sendPositionChanged(savedCapsulePosition);
    keepFloatingWindowOnTop();
  }
  dragState = null;
});

ipcMain.on('desktop-detail-open', (event, open) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== capsuleWindow) return;
  detailOpen = Boolean(open);
  resizeCapsuleWindow();
});

ipcMain.on('desktop-toast-open', (event, open) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== capsuleWindow) return;
  toastOpen = Boolean(open);
  resizeCapsuleWindow();
});

ipcMain.on('desktop-layout-update', (event, layout) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== capsuleWindow) return;
  lastLayout = normalizeLayout(layout);
  resizeCapsuleWindow();
});

ipcMain.on('desktop-saved-position', (event, position) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== capsuleWindow) return;
  const next = normalizePosition(position);
  if (!next) return;
  savedCapsulePosition = next;
  if (!dragState) {
    capsuleAnchor = {
      x: next.x,
      y: next.y,
      width: lastLayout.capsule.width,
      height: lastLayout.capsule.height
    };
    resizeCapsuleWindow();
  }
});

function resizeCapsuleWindow() {
  if (!capsuleWindow || capsuleWindow.isDestroyed()) return;
  if (dragState) return;
  const current = capsuleWindow.getBounds();
  const layout = lastLayout;
  const workArea = screen.getDisplayMatching(current).workArea;
  const capsuleSize = normalizeSize(layout.capsule, DEFAULT_CAPSULE_SIZE);
  const detailSize = normalizeDetailSize(layout.detail);
  const currentCapsuleScreen = getAnchoredCapsuleBounds(current, capsuleSize, workArea);

  if (!detailOpen) {
    const width = capsuleSize.width + CAPSULE_WINDOW_PAD;
    const toastSpace = RESERVED_TOAST_SPACE;
    const height = capsuleSize.height + toastSpace + CAPSULE_WINDOW_PAD;
    const x = clamp(currentCapsuleScreen.x, workArea.x + SCREEN_MARGIN, workArea.x + workArea.width - width - SCREEN_MARGIN);
    const y = clamp(
      currentCapsuleScreen.y - toastSpace,
      workArea.y + SCREEN_MARGIN,
      workArea.y + workArea.height - height - SCREEN_MARGIN
    );
    const offsetX = clamp(currentCapsuleScreen.x - x, 0, Math.max(0, width - capsuleSize.width));
    const offsetY = clamp(currentCapsuleScreen.y - y, 0, Math.max(0, height - capsuleSize.height));
    capsuleAnchor = { x: x + offsetX, y: y + offsetY, width: capsuleSize.width, height: capsuleSize.height };
    const changed = setCapsuleWindowBounds({ x, y, width, height });
    sendWindowLayout({ placement: 'bottom', offsetX, offsetY, detailOffset: 0, popoverShiftX: 0 });
    if (changed) keepFloatingWindowOnTop();
    return;
  }

  capsuleAnchor = currentCapsuleScreen;
  const detailWidth = detailSize.width;
  const detailHeight = detailSize.height;
  if (detailWidth <= 0 || detailHeight <= 0) {
    sendWindowLayout({
      placement: lastWindowLayout.placement,
      offsetX: lastWindowLayout.offsetX,
      offsetY: lastWindowLayout.offsetY,
      detailOffset: lastWindowLayout.detailOffset,
      popoverShiftX: lastWindowLayout.popoverShiftX,
      ready: false
    });
    keepFloatingWindowOnTop();
    return;
  }
  const capsuleWindowWidth = capsuleSize.width + CAPSULE_WINDOW_PAD;
  const capsuleWindowHeight = capsuleSize.height + CAPSULE_WINDOW_PAD;
  const width = Math.max(capsuleWindowWidth, detailWidth);
  const height = capsuleWindowHeight + detailHeight + WINDOW_MARGIN;
  const below = workArea.y + workArea.height - (currentCapsuleScreen.y + currentCapsuleScreen.height);
  const above = currentCapsuleScreen.y - workArea.y;
  const placement = below < detailHeight + WINDOW_MARGIN && above > below ? 'top' : 'bottom';
  const rawX = currentCapsuleScreen.x;
  const x = clamp(rawX, workArea.x + SCREEN_MARGIN, workArea.x + workArea.width - width - SCREEN_MARGIN);
  const y = placement === 'top'
    ? clamp(currentCapsuleScreen.y - detailHeight - WINDOW_MARGIN, workArea.y + SCREEN_MARGIN, workArea.y + workArea.height - height - SCREEN_MARGIN)
    : clamp(currentCapsuleScreen.y, workArea.y + SCREEN_MARGIN, workArea.y + workArea.height - height - SCREEN_MARGIN);
  const offsetX = clamp(currentCapsuleScreen.x - x, 0, Math.max(0, width - capsuleWindowWidth));
  const offsetY = placement === 'top'
    ? clamp(currentCapsuleScreen.y - y, 0, Math.max(0, height - capsuleWindowHeight))
    : 0;
  const centeredDetailLeft = offsetX + Math.round((capsuleSize.width - detailWidth) / 2);
  const desiredDetailLeft = clamp(centeredDetailLeft, 0, Math.max(0, width - detailWidth));
  const nextLayout = {
    placement,
    offsetX,
    offsetY,
    detailOffset: placement === 'top' ? detailHeight + WINDOW_MARGIN : 0,
    popoverShiftX: desiredDetailLeft - centeredDetailLeft
  };
  if (placement === 'top') {
    const changed = setCapsuleWindowBounds({ x, y, width, height });
    sendWindowLayout(nextLayout);
    if (changed) keepFloatingWindowOnTop();
  } else {
    sendWindowLayout(nextLayout);
    const changed = setCapsuleWindowBounds({ x, y, width, height });
    if (changed) keepFloatingWindowOnTop();
  }
  sendWindowLayoutSoon(nextLayout);
}

function getAnchoredCapsuleBounds(current, capsuleSize, workArea) {
  const base = capsuleAnchor || (
    savedCapsulePosition
      ? { x: savedCapsulePosition.x, y: savedCapsulePosition.y, width: capsuleSize.width, height: capsuleSize.height }
      : {
          x: current.x + finite(lastWindowLayout.offsetX, 0),
          y: current.y + finite(lastWindowLayout.offsetY, 0),
          width: capsuleSize.width,
          height: capsuleSize.height
        }
  );
  const x = clamp(base.x, workArea.x + SCREEN_MARGIN, workArea.x + workArea.width - capsuleSize.width - SCREEN_MARGIN);
  const y = clamp(base.y, workArea.y + SCREEN_MARGIN, workArea.y + workArea.height - capsuleSize.height - SCREEN_MARGIN);
  return { x, y, width: capsuleSize.width, height: capsuleSize.height };
}

function getCurrentCapsuleScreenBounds() {
  const bounds = capsuleWindow?.getBounds() || { x: 0, y: 0 };
  const capsule = normalizeSize(lastLayout.capsule, DEFAULT_CAPSULE_SIZE);
  const offsetX = finite(lastWindowLayout.offsetX, 0);
  const offsetY = finite(lastWindowLayout.offsetY, 0);
  return {
    x: bounds.x + offsetX,
    y: bounds.y + offsetY,
    width: capsule.width,
    height: capsule.height
  };
}

function sendWindowLayout(layout) {
  if (!capsuleWindow || capsuleWindow.isDestroyed()) return;
  lastWindowLayout = {
    placement: layout.placement === 'top' ? 'top' : 'bottom',
    offsetX: Math.round(finite(layout.offsetX, 0)),
    offsetY: Math.round(finite(layout.offsetY, 0)),
    detailOffset: Math.round(finite(layout.detailOffset, 0)),
    popoverShiftX: Math.round(finite(layout.popoverShiftX, 0)),
    ready: layout.ready !== false
  };
  capsuleWindow.webContents.send('desktop-popover-placement', lastWindowLayout.placement);
  capsuleWindow.webContents.send('desktop-window-layout', lastWindowLayout);
}

function sendWindowLayoutSoon(layout) {
  if (!capsuleWindow || capsuleWindow.isDestroyed()) return;
  setTimeout(() => {
    if (!capsuleWindow || capsuleWindow.isDestroyed()) return;
    sendWindowLayout(layout);
  }, LAYOUT_SEND_DELAY_MS);
}

function sendPositionChanged(position) {
  if (!capsuleWindow || capsuleWindow.isDestroyed() || !position) return;
  capsuleWindow.webContents.send('desktop-position-changed', {
    x: Math.round(finite(position.x, 0)),
    y: Math.round(finite(position.y, 0))
  });
}

function keepFloatingWindowOnTop() {
  if (!capsuleWindow || capsuleWindow.isDestroyed()) return;
  capsuleWindow.setAlwaysOnTop(false);
  capsuleWindow.setAlwaysOnTop(true, 'floating');
  capsuleWindow.moveTop();
}

function setCapsuleWindowBounds(bounds) {
  if (!capsuleWindow || capsuleWindow.isDestroyed()) return false;
  const current = capsuleWindow.getBounds();
  const next = {
    x: Math.round(finite(bounds.x, current.x)),
    y: Math.round(finite(bounds.y, current.y)),
    width: Math.round(finite(bounds.width, current.width)),
    height: Math.round(finite(bounds.height, current.height))
  };
  if (
    current.x === next.x &&
    current.y === next.y &&
    current.width === next.width &&
    current.height === next.height
  ) {
    return false;
  }
  capsuleWindow.setBounds(next, false);
  return true;
}

function normalizeLayout(layout) {
  const capsule = normalizeRect(layout?.capsule, DEFAULT_CAPSULE_SIZE);
  const toast = { height: Math.max(0, finite(layout?.toast?.height, 0)) };
  const detail = normalizeRect(layout?.detail, DEFAULT_DETAIL_SIZE);
  return { capsule, toast, detail };
}

function normalizeRect(value, fallback) {
  return {
    x: finite(value?.x, 0),
    y: finite(value?.y, 0),
    width: Math.max(1, finite(value?.width, fallback.width)),
    height: Math.max(1, finite(value?.height, fallback.height))
  };
}

function normalizeSize(value, fallback) {
  return {
    width: Math.max(1, Math.ceil(finite(value?.width, fallback.width))),
    height: Math.max(1, Math.ceil(finite(value?.height, fallback.height)))
  };
}

function normalizeDetailSize(value) {
  const rawWidth = finite(value?.width, 0);
  const rawHeight = finite(value?.height, 0);
  if (rawWidth <= 0 || rawHeight <= 0) {
    return { width: 0, height: 0 };
  }
  return {
    width: Math.max(DEFAULT_DETAIL_SIZE.width, Math.ceil(rawWidth)),
    height: Math.max(DEFAULT_DETAIL_SIZE.height, Math.ceil(rawHeight))
  };
}

function normalizePosition(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

async function ensureBackend() {
  if (await canConnect()) return;

  const backend = resolveBackendCommand();
  backendProcess = spawn(backend.command, backend.args, {
    cwd: backend.cwd,
    windowsHide: true,
    stdio: 'ignore',
    detached: false,
    env: {
      ...process.env,
      CODEX_QUOTA_APP_ROOT: backend.appRoot,
      CODEX_QUOTA_DIST_DIR: path.join(backend.appRoot, 'dist')
    }
  });
  ownsBackend = true;

  backendProcess.on('exit', () => {
    backendProcess = null;
    ownsBackend = false;
  });

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await canConnect()) return;
    await delay(250);
  }
  throw new Error(`Local backend failed to start on ${APP_URL}`);
}

function resolveBackendCommand() {
  const packagedRoot = app.isPackaged ? process.resourcesPath : ROOT;
  const packagedBackend = path.join(packagedRoot, 'app', 'local-server.exe');
  if (fs.existsSync(packagedBackend)) {
    return {
      command: packagedBackend,
      args: [],
      cwd: path.dirname(packagedBackend),
      appRoot: path.dirname(packagedBackend)
    };
  }

  const localBackend = path.join(ROOT, 'local-server.exe');
  if (fs.existsSync(localBackend)) {
    return {
      command: localBackend,
      args: [],
      cwd: ROOT,
      appRoot: ROOT
    };
  }

  return {
    command: PYTHON,
    args: ['local-server.py'],
    cwd: ROOT,
    appRoot: ROOT
  };
}

function canConnect() {
  return new Promise((resolve) => {
    const req = http.get(APP_URL, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.whenReady().then(createApp);

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', () => {
  if (ownsBackend && backendProcess) {
    backendProcess.kill();
  }
});
