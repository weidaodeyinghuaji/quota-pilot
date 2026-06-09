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
      setSavedPosition(position: { x: number; y: number }): void;
      layoutApplied(sequence?: number): void;
      onDetailState(callback: (open: boolean) => void): () => void;
      onPopoverPlacement(callback: (placement: 'top' | 'bottom') => void): () => void;
      onWindowLayout(callback: (layout: {
        placement: 'top' | 'bottom';
        offsetX: number;
        offsetY: number;
        detailOffset: number;
        popoverShiftX: number;
        hideCapsule?: boolean;
        ready?: boolean;
        sequence?: number;
      }) => void): () => void;
      onPositionChanged(callback: (position: { x: number; y: number }) => void): () => void;
    };
  }
}
