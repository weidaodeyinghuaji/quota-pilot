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
  updateLayout(layout) {
    ipcRenderer.send('desktop-layout-update', layout);
  },
  setSavedPosition(position) {
    ipcRenderer.send('desktop-saved-position', position);
  },
  layoutApplied(sequence) {
    ipcRenderer.send('desktop-window-layout-applied', sequence);
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
  }
});
