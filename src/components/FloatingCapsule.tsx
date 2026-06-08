import React from 'react';
import { getCapsuleDisplay } from '../lib/display.mjs';
import type { ProviderSnapshot } from '../types/provider';

interface Props {
  snapshot: ProviderSnapshot | null;
  activity?: ProviderSnapshot['activity'];
  expanded?: boolean;
  onClick?: () => void;
}

export default function FloatingCapsule({ snapshot, activity, expanded = false, onClick }: Props) {
  const display = getCapsuleDisplay(snapshot);
  const signal = getSignalState(activity ?? snapshot?.activity);

  return (
    <button
      aria-expanded={expanded}
      className="floating-capsule capsule-drag-handle"
      type="button"
      onClick={onClick}
    >
      <div className="traffic-lights" aria-label={signal.label} title={signal.label}>
        <span className={`traffic-light traffic-close ${signal.red ? 'is-active' : ''}`} />
        <span className={`traffic-light traffic-minimize ${signal.yellow ? 'is-active' : ''} ${signal.blink ? 'is-blinking' : ''}`} />
        <span className={`traffic-light traffic-ok ${signal.green ? 'is-active' : ''}`} />
      </div>
      <div className="capsule-copy">
        <div className="capsule-heading">
          <strong>{display.title}</strong>
          {display.meta ? <span className="capsule-inline">{display.subtitle}</span> : null}
        </div>
        <span>{display.meta || display.subtitle}</span>
      </div>
    </button>
  );
}

function getSignalState(activity: ProviderSnapshot['activity'] | undefined) {
  const status = activity?.status;
  const label = activity?.label || fallbackActivityLabel(status);
  if (status === 'answering') {
    return { red: true, yellow: false, green: false, blink: false, label };
  }
  if (status === 'waiting_for_user' || status === 'auto_reviewing') {
    return {
      red: false,
      yellow: true,
      green: false,
      blink: Boolean(activity?.needsHumanAttention),
      label
    };
  }
  if (status === 'finished') {
    return { red: false, yellow: false, green: true, blink: false, label };
  }
  return { red: false, yellow: false, green: true, blink: false, label: label || '状态未知' };
}

function fallbackActivityLabel(status?: string) {
  if (status === 'answering') return 'Codex 执行中';
  if (status === 'waiting_for_user') return 'Codex 思考中或等待授权';
  if (status === 'auto_reviewing') return 'Codex 自动审核中';
  if (status === 'finished') return 'Codex 空闲';
  return 'Codex 状态未知';
}
