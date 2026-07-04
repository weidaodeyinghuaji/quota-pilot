import React from 'react';

export default function QuotaRecoveryDialog() {
  return (
    <main className="quota-recovery-shell">
      <section className="quota-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="quota-recovery-title">
        <h1 id="quota-recovery-title">官方额度已恢复</h1>
        <p>Codex 官方 5h 额度已刷新，可以切回官方登录模式。</p>
        <div className="quota-recovery-actions">
          <button type="button" onClick={() => window.codexQuotaDesktop?.confirmQuotaRecoveryReminder()}>
            知道了
          </button>
        </div>
      </section>
    </main>
  );
}
