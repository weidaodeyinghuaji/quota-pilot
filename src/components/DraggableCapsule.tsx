import React from 'react';

const DRAG_THRESHOLD_PX = 12;

interface Position {
  x: number;
  y: number;
}

interface DesktopWindowLayout {
  placement: 'top' | 'bottom';
  offsetX: number;
  offsetY: number;
  detailOffset: number;
  popoverShiftX: number;
}

interface Props {
  position: Position;
  onPositionChange: (position: Position) => void;
  onTap?: () => void;
  toastVisible?: boolean;
  children: React.ReactNode;
}

export default function DraggableCapsule({ position, onPositionChange, onTap, toastVisible = false, children }: Props) {
  const isDesktopShell =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('desktop') === '1' &&
    Boolean((window as any).codexQuotaDesktop);
  const [dragPosition, setDragPosition] = React.useState(position);
  const [popoverPlacement, setPopoverPlacement] = React.useState<'top' | 'bottom'>('bottom');
  const [desktopLayout, setDesktopLayout] = React.useState<DesktopWindowLayout>({
    placement: 'bottom',
    offsetX: 0,
    offsetY: 0,
    detailOffset: 0,
    popoverShiftX: 0
  });
  const [desktopLayoutReady, setDesktopLayoutReady] = React.useState(false);
  const capsuleRef = React.useRef<HTMLDivElement | null>(null);
  const movedRef = React.useRef(false);
  const suppressClickRef = React.useRef(false);
  const dragRef = React.useRef<{
    pointerId: number;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
  } | null>(null);

  React.useEffect(() => {
    if (isDesktopShell) return;
    setDragPosition(clampPosition(position, capsuleRef.current));
  }, [isDesktopShell, position.x, position.y]);

  React.useEffect(() => {
    if (isDesktopShell) return;
    updatePopoverPlacement();
  }, [isDesktopShell, dragPosition.x, dragPosition.y]);

  React.useEffect(() => {
    if (!isDesktopShell || !window.codexQuotaDesktop?.onPopoverPlacement) return undefined;
    return window.codexQuotaDesktop.onPopoverPlacement((placement) => {
      setPopoverPlacement(placement === 'top' ? 'top' : 'bottom');
    });
  }, [isDesktopShell]);

  React.useLayoutEffect(() => {
    if (!isDesktopShell || !window.codexQuotaDesktop?.setSavedPosition) return;
    window.codexQuotaDesktop.setSavedPosition(position);
  }, [isDesktopShell, position.x, position.y]);

  React.useEffect(() => {
    if (!isDesktopShell || !window.codexQuotaDesktop?.onWindowLayout) return undefined;
    return window.codexQuotaDesktop.onWindowLayout((layout) => {
      const placement = layout?.placement === 'top' ? 'top' : 'bottom';
      const ready = layout?.ready !== false;
      setPopoverPlacement(placement);
      if (ready) {
        setDesktopLayout({
          placement,
          offsetX: finite(layout?.offsetX, 0),
          offsetY: finite(layout?.offsetY, 0),
          detailOffset: finite(layout?.detailOffset, 0),
          popoverShiftX: finite(layout?.popoverShiftX, 0)
        });
      }
      setDesktopLayoutReady(ready);
    });
  }, [isDesktopShell]);

  React.useEffect(() => {
    if (!isDesktopShell || !window.codexQuotaDesktop?.onPositionChanged) return undefined;
    return window.codexQuotaDesktop.onPositionChanged((next) => {
      const nextPosition = {
        x: finite(next?.x, 0),
        y: finite(next?.y, 0)
      };
      if (nextPosition.x === position.x && nextPosition.y === position.y) return;
      onPositionChange(nextPosition);
    });
  }, [isDesktopShell, onPositionChange, position.x, position.y]);

  React.useLayoutEffect(() => {
    if (!isDesktopShell || !window.codexQuotaDesktop?.updateLayout) return undefined;
    let frame = 0;
    const sendLayout = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const root = capsuleRef.current;
        const capsuleNode = root?.querySelector('.floating-capsule') as HTMLElement | null;
        const capsule = capsuleNode?.getBoundingClientRect();
        const toastNode = root?.querySelector('.spend-toast') as HTMLElement | null;
        if (!capsule) return;
        const rootRect = root.getBoundingClientRect();
        const capsuleWidth = Math.max(capsule.width, capsuleNode?.scrollWidth ?? 0);
        const capsuleHeight = Math.max(capsule.height, capsuleNode?.scrollHeight ?? 0);
        const toastHeight = toastNode ? Math.max(toastNode.offsetHeight, toastNode.scrollHeight) : 0;
        window.codexQuotaDesktop?.updateLayout({
          capsule: {
            x: capsule.left - rootRect.left,
            y: capsule.top - rootRect.top,
            width: capsuleWidth,
            height: capsuleHeight
          },
          toast: {
            height: toastHeight
          },
          detail: {
            width: 0,
            height: 0
          }
        });
      });
    };
    sendLayout();
    const timeout = window.setTimeout(sendLayout, 50);
    const observer = new ResizeObserver(sendLayout);
    if (capsuleRef.current) observer.observe(capsuleRef.current);
    capsuleRef.current?.querySelectorAll('.floating-capsule, .spend-toast').forEach((node) => observer.observe(node));
    window.addEventListener('resize', sendLayout);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      observer.disconnect();
      window.removeEventListener('resize', sendLayout);
    };
  }, [
    children,
    isDesktopShell,
    popoverPlacement
  ]);

  React.useEffect(() => {
    const handleResize = () => {
      if (isDesktopShell) return;
      setDragPosition((current) => {
        const clamped = clampPosition(current, capsuleRef.current);
        if (clamped.x !== current.x || clamped.y !== current.y) {
          onPositionChange(clamped);
        }
        return clamped;
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isDesktopShell, onPositionChange]);

  const updatePopoverPlacement = React.useCallback(() => {
    const rect = capsuleRef.current?.getBoundingClientRect();
    if (!rect) return;
    const expectedPopoverHeight = Math.min(360, Math.max(220, window.innerHeight - 96));
    const bottomSpace = window.innerHeight - rect.bottom;
    const topSpace = rect.top;
    setPopoverPlacement(bottomSpace >= expectedPopoverHeight || bottomSpace >= topSpace ? 'bottom' : 'top');
  }, []);

  const commitPosition = React.useCallback((next: Position) => {
    const clamped = clampPosition(next, capsuleRef.current);
    setDragPosition(clamped);
    onPositionChange(clamped);
    window.requestAnimationFrame(updatePopoverPlacement);
  }, [onPositionChange, updatePopoverPlacement]);

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (!(event.target instanceof HTMLElement)) return;
    if (!event.target.closest('.capsule-drag-handle')) return;
    if (event.target.closest('[data-no-drag="true"]')) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    movedRef.current = false;
    suppressClickRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY
    };
    if (isDesktopShell) {
      (window as any).codexQuotaDesktop.dragStart({
        screenX: event.screenX,
        screenY: event.screenY
      });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [isDesktopShell]);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved =
      Math.abs(event.clientX - drag.startX) > DRAG_THRESHOLD_PX ||
      Math.abs(event.clientY - drag.startY) > DRAG_THRESHOLD_PX;
    if (moved) {
      movedRef.current = true;
      if (isDesktopShell) {
        (window as any).codexQuotaDesktop.dragMove({
          screenX: event.screenX,
          screenY: event.screenY
        });
        return;
      }
      setDragPosition(clampPosition({
        x: event.clientX - drag.offsetX,
        y: event.clientY - drag.offsetY
      }, capsuleRef.current));
    }
  }, [isDesktopShell]);

  const handlePointerEnd = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    suppressClickRef.current = movedRef.current;
    if (isDesktopShell) {
      (window as any).codexQuotaDesktop.dragEnd();
    }
    if (movedRef.current) {
      if (isDesktopShell) return;
      commitPosition({
        x: event.clientX - drag.offsetX,
        y: event.clientY - drag.offsetY
      });
    } else {
      onTap?.();
    }
  }, [commitPosition, onTap]);

  const handleClickCapture = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const desktopStyle = isDesktopShell
    ? ({
        left: `${desktopLayout.offsetX}px`,
        top: `${desktopLayout.offsetY}px`,
        '--popover-shift-x': `${desktopLayout.popoverShiftX}px`
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      ref={capsuleRef}
      className="draggable-capsule"
      aria-label="可拖动的用量胶囊"
      data-popover-placement={popoverPlacement}
      data-layout-ready={desktopLayoutReady ? 'true' : 'false'}
      data-desktop-shell={isDesktopShell ? 'true' : 'false'}
      data-toast-visible={toastVisible ? 'true' : 'false'}
      style={desktopStyle ?? { left: `${dragPosition.x}px`, top: `${dragPosition.y}px` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClickCapture={handleClickCapture}
    >
      {children}
    </div>
  );
}

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function clampPosition(position: Position, element?: HTMLElement | null): Position {
  const width = element?.offsetWidth || 320;
  const height = element?.offsetHeight || 84;
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return {
    x: Math.min(maxX, Math.max(margin, Math.round(position.x))),
    y: Math.min(maxY, Math.max(margin, Math.round(position.y)))
  };
}
