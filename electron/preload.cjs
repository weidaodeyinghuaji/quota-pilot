const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('codexQuotaDesktop', {
  dragStart(point) {
    ipcRenderer.send('desktop-drag-start', point);
  },
  dragMove(point) {
    ipcRenderer.send('desktop-drag-move', point);
  },
  dragEnd() {
    ipcRenderer.send('desktop-drag-end');
  },
  setDetailOpen(open) {
    ipcRenderer.send('desktop-detail-open', Boolean(open));
  },
  setToastOpen(open) {
    ipcRenderer.send('desktop-toast-open', Boolean(open));
  },
  openQuotaRecoveryReminder(payload) {
    return ipcRenderer.invoke('desktop-quota-recovery-open', payload);
  },
  confirmQuotaRecoveryReminder() {
    ipcRenderer.send('desktop-quota-recovery-confirm');
  },
  updateLayout(layout) {
    ipcRenderer.send('desktop-layout-update', layout);
  },
  updateDetailLayout(layout) {
    ipcRenderer.send('desktop-detail-layout-update', layout);
  },
  setSavedPosition(position) {
    ipcRenderer.send('desktop-saved-position', position);
  },
  updateHitTestRegions(payload) {
    ipcRenderer.send('desktop-hit-test-regions', payload);
  },
  notifyUpdateReady() {
    ipcRenderer.send('desktop-update-ready');
  },
  dismissUpdateReminder() {
    ipcRenderer.send('desktop-update-dismiss');
  },
  openUpdateRelease(url) {
    ipcRenderer.send('desktop-update-open-release', url);
  },
  openUpdateWindow(options) {
    ipcRenderer.send('desktop-update-open-window', {
      autoDownload: Boolean(options?.autoDownload)
    });
  },
  startUpdateDownload(asset) {
    ipcRenderer.send('desktop-update-download', asset);
  },
  onUpdateDownloadProgress(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('desktop-update-download-progress', listener);
    return () => ipcRenderer.removeListener('desktop-update-download-progress', listener);
  },
  onUpdateAutoDownload(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('desktop-update-auto-download', listener);
    return () => ipcRenderer.removeListener('desktop-update-auto-download', listener);
  },
  onUpdateDismissed(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('desktop-update-dismissed', listener);
    return () => ipcRenderer.removeListener('desktop-update-dismissed', listener);
  },
  onDetailState(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, open) => callback(Boolean(open));
    ipcRenderer.on('desktop-detail-state', listener);
    return () => ipcRenderer.removeListener('desktop-detail-state', listener);
  },
  onPopoverPlacement(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, placement) => callback(placement);
    ipcRenderer.on('desktop-popover-placement', listener);
    return () => ipcRenderer.removeListener('desktop-popover-placement', listener);
  },
  onWindowLayout(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, layout) => callback(layout);
    ipcRenderer.on('desktop-window-layout', listener);
    return () => ipcRenderer.removeListener('desktop-window-layout', listener);
  },
  onPositionChanged(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, position) => callback(position);
    ipcRenderer.on('desktop-position-changed', listener);
    return () => ipcRenderer.removeListener('desktop-position-changed', listener);
  },
  onDataInvalidated(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('desktop-data-invalidated', listener);
    return () => ipcRenderer.removeListener('desktop-data-invalidated', listener);
  },
  publishLiveData(payload) {
    ipcRenderer.send('desktop-live-data-publish', payload);
  },
  requestLiveData() {
    ipcRenderer.send('desktop-live-data-request');
  },
  onLiveData(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('desktop-live-data', listener);
    return () => ipcRenderer.removeListener('desktop-live-data', listener);
  }
});
