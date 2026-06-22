export {};

declare global {
  interface Window {
    codexQuotaDesktop?: {
      dragStart(point: { screenX: number; screenY: number }): void;
      dragMove(point: { screenX: number; screenY: number }): void;
      dragEnd(): void;
      setDetailOpen(open: boolean): void;
      setToastOpen(open: boolean): void;
      updateLayout(layout: {
        capsule: { x: number; y: number; width: number; height: number };
        toast?: { height: number };
        detail: { width: number; height: number };
      }): void;
      updateDetailLayout(layout: { width: number; height: number }): void;
      setSavedPosition(position: { x: number; y: number }): void;
      updateHitTestRegions(payload: { interactive: boolean }): void;
      notifyUpdateReady(): void;
      dismissUpdateReminder(): void;
      openUpdateRelease(url: string): void;
      openUpdateWindow(options?: { autoDownload?: boolean }): void;
      startUpdateDownload(asset: { name?: string; url?: string; size?: number }): void;
      onUpdateDownloadProgress(callback: (payload: {
        status?: string;
        message?: string;
        received?: number;
        total?: number;
        percent?: number;
      }) => void): () => void;
      onUpdateAutoDownload(callback: () => void): () => void;
      onUpdateDismissed(callback: () => void): () => void;
      onDetailState(callback: (open: boolean) => void): () => void;
      onPopoverPlacement(callback: (placement: 'top' | 'bottom') => void): () => void;
      onWindowLayout(callback: (layout: {
        placement: 'top' | 'bottom';
        offsetX: number;
        offsetY: number;
        detailOffset: number;
        popoverShiftX: number;
        ready?: boolean;
      }) => void): () => void;
      onPositionChanged(callback: (position: { x: number; y: number }) => void): () => void;
    };
  }
}
