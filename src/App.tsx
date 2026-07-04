import React from 'react';
import DetailPanel from './components/DetailPanel';
import DraggableCapsule from './components/DraggableCapsule';
import FloatingCapsule from './components/FloatingCapsule';
import SettingsPage from './components/SettingsPage';
import SpendToast from './components/SpendToast';
import QuotaRecoveryDialog from './components/QuotaRecoveryDialog';
import { confirmCodexQuotaReminder, fetchCodexOverview } from './lib/codexOverviewStore.mjs';
import { selectPrimarySnapshot } from './lib/display.mjs';
import { diagnoseNewApiAccount, fetchLocalLogSummary, syncLocalNewApiLogs } from './lib/localLogStore.mjs';
import { canUseNewApiLocalData } from './lib/newApiClient.mjs';
import { buildSnapshots } from './lib/snapshotFactory.mjs';
import { estimateTokenCost } from './lib/pricing.mjs';
import { createRefreshCoordinator } from './lib/refreshCoordinator.mjs';
import { APP_VERSION, checkLatestRelease, GITHUB_RELEASES_URL } from './lib/updateChecker.mjs';
import type { UpdateCheckState } from './types/settings';
import {
  SETTINGS_STORAGE_KEY,
  loadAppSettings,
  saveAppSettings,
  updateCapsulePosition,
  createNewApiProviderDraft,
  deleteNewApiProvider,
  duplicateNewApiProvider,
  updateNewApiSettings,
  updatePricingProfile,
  selectNewApiProvider,
  selectProviderForCodexStatus,
  upsertNewApiProvider
} from './lib/settingsStore.mjs';

export default function App() {
  const urlParams = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const isDesktopCapsule = urlParams.get('desktop') === '1';
  const isSettingsWindow = urlParams.get('view') === 'settings';
  const isDetailWindow = urlParams.get('view') === 'detail';
  const isUpdateWindow = urlParams.get('view') === 'update';
  const isQuotaRecoveryWindow = urlParams.get('view') === 'quota-recovery';
  const isDesktopShell = typeof window !== 'undefined' && Boolean(window.codexQuotaDesktop);
  const shouldRunBackgroundData = !isSettingsWindow && !isUpdateWindow && !isQuotaRecoveryWindow && (!isDetailWindow || !isDesktopShell);
  const autoDownloadRequested = urlParams.get('download') === '1';
  const [settings, setSettings] = React.useState(() => loadAppSettings());
  const [newApiSnapshot, setNewApiSnapshot] = React.useState(null);
  const [codexStatus, setCodexStatus] = React.useState(null);
  const [codexStatusLoaded, setCodexStatusLoaded] = React.useState(false);
  const lastNewApiSnapshotRef = React.useRef(null);
  const [localLogSummary, setLocalLogSummary] = React.useState(null);
  const [localLogSync, setLocalLogSync] = React.useState(null);
  const [manualSyncState, setManualSyncState] = React.useState({ status: 'idle', message: '' });
  const [spendEvent, setSpendEvent] = React.useState(null);
  const [visibleSpendEvent, setVisibleSpendEvent] = React.useState(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(() => isSettingsWindow);
  const [latestCodexTokenEvent, setLatestCodexTokenEvent] = React.useState(null);
  const [codexTokenSummary, setCodexTokenSummary] = React.useState(null);
  const [quotaReminder, setQuotaReminder] = React.useState(null);
  const seenSpendEventIdRef = React.useRef('');
  const [newApiError, setNewApiError] = React.useState('');
  const [updateCheckState, setUpdateCheckState] = React.useState<UpdateCheckState>({
    status: 'idle',
    message: '尚未检查更新',
    currentVersion: APP_VERSION
  });
  const [updateReminderDismissed, setUpdateReminderDismissed] = React.useState(false);
  const [connectionState, setConnectionState] = React.useState({
    status: 'idle',
    message: '',
    rawRequest: ''
  });
  const snapshots = buildSnapshots(settings, new Date(), {
    newApiSnapshot,
    newApiError,
    localLogSummary,
    localLogSync,
    codexStatus,
    codexTokenEvent: latestCodexTokenEvent,
    codexTokenSummary
  });
  const activeSnapshot = selectPrimarySnapshot(snapshots);
  const shouldUseNewApiAutomation =
    shouldRunBackgroundData && codexStatusLoaded && codexStatus?.accountType !== 'official_login' && canUseNewApiLocalData(settings.newApi);

  React.useEffect(() => {
    saveAppSettings(undefined, settings);
  }, [settings]);

  const runUpdateCheck = React.useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setUpdateCheckState((current) => ({
        ...current,
        status: 'loading',
        message: '正在检查更新...'
      }));
    }

    try {
      const result = await checkLatestRelease({ currentVersion: APP_VERSION });
      const message = result.isNewer
        ? `发现新版本 ${result.latestTagName}`
        : `已是最新版本 ${result.currentVersion}`;
      setUpdateCheckState({
        status: 'success',
        message,
        ...result
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '检查更新失败';
      setUpdateCheckState((current) => ({
        ...current,
        status: 'error',
        message
      }));
      return undefined;
    }
  }, []);

  React.useEffect(() => {
    if (isDetailWindow) return;
    runUpdateCheck({ silent: true });
  }, [isDetailWindow, runUpdateCheck]);

  React.useEffect(() => {
    if (!window.codexQuotaDesktop?.onUpdateDismissed) return undefined;
    return window.codexQuotaDesktop.onUpdateDismissed(() => {
      setUpdateReminderDismissed(true);
    });
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SETTINGS_STORAGE_KEY) return;
      setSettings(loadAppSettings());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  React.useEffect(() => {
    if (!isDesktopCapsule || !window.codexQuotaDesktop?.setDetailOpen) return;
    window.codexQuotaDesktop.setDetailOpen(detailOpen);
  }, [detailOpen, isDesktopCapsule]);

  React.useEffect(() => {
    if (isDetailWindow || !codexStatusLoaded || codexStatus?.accountType !== 'api') return;
    setSettings((current) => selectProviderForCodexStatus(current, codexStatus));
  }, [
    isDetailWindow,
    codexStatusLoaded,
    codexStatus?.accountType,
    codexStatus?.apiKeyFingerprint,
    codexStatus?.baseUrl
  ]);

  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof window.setInterval> | undefined;
    if (!shouldRunBackgroundData) {
      return () => {
        active = false;
      };
    }

    const refresh = async () => {
      try {
        const overview = await fetchCodexOverview();
        if (!active || !overview) return;
        if (overview.status) setCodexStatus(overview.status);
        if (overview.tokenSummary) setCodexTokenSummary(overview.tokenSummary);
        setQuotaReminder(overview.quotaReminder ?? null);

        const event = overview.latestToken;
        const estimatedEvent = event?.id ? enrichSpendEventWithEstimate(event, settings.pricingProfile) : null;
        if (estimatedEvent) setLatestCodexTokenEvent(estimatedEvent);
        if (!event?.id || event.id === seenSpendEventIdRef.current) return;
        seenSpendEventIdRef.current = event.id;
        setSpendEvent(estimatedEvent);
      } finally {
        if (active) setCodexStatusLoaded(true);
      }
    };

    const coordinator = createRefreshCoordinator(refresh);
    coordinator.trigger();
    const intervalMs = Math.max(5, Number(settings.newApi.codexTokenPollIntervalSeconds) || 5) * 1000;
    timer = window.setInterval(() => coordinator.trigger(), intervalMs);
    const unsubscribeInvalidated = isDesktopCapsule
      ? window.codexQuotaDesktop?.onDataInvalidated?.(() => coordinator.trigger())
      : undefined;

    return () => {
      active = false;
      coordinator.dispose();
      unsubscribeInvalidated?.();
      if (timer) window.clearInterval(timer);
    };
  }, [
    isDesktopCapsule,
    settings.newApi.codexTokenPollIntervalSeconds,
    settings.pricingProfile,
    shouldRunBackgroundData
  ]);

  React.useEffect(() => {
    if (!isDesktopCapsule || !quotaReminder?.pending || !quotaReminder.resetAt) return undefined;
    let cancelled = false;
    window.codexQuotaDesktop?.openQuotaRecoveryReminder({ resetAt: quotaReminder.resetAt })
      .then(async (result) => {
        if (cancelled || result !== 'confirmed') return;
        const confirmed = await confirmCodexQuotaReminder(quotaReminder.resetAt);
        if (!confirmed || cancelled) return;
        setQuotaReminder((current) => current?.resetAt === quotaReminder.resetAt
          ? { ...current, pending: false }
          : current);
      });
    return () => {
      cancelled = true;
    };
  }, [isDesktopCapsule, quotaReminder]);

  React.useEffect(() => {
    if (!isDetailWindow || !window.codexQuotaDesktop?.onLiveData) return undefined;
    const unsubscribe = window.codexQuotaDesktop.onLiveData((payload) => {
      if (!payload || typeof payload !== 'object') return;
      setNewApiSnapshot(payload.newApiSnapshot ?? null);
      setNewApiError(payload.newApiError ?? '');
      setLocalLogSummary(payload.localLogSummary ?? null);
      setLocalLogSync(payload.localLogSync ?? null);
      setCodexStatus(payload.codexStatus ?? null);
      setCodexStatusLoaded(Boolean(payload.codexStatusLoaded));
      setLatestCodexTokenEvent(payload.latestCodexTokenEvent ?? null);
      setCodexTokenSummary(payload.codexTokenSummary ?? null);
    });
    window.codexQuotaDesktop.requestLiveData?.();
    return unsubscribe;
  }, [isDetailWindow]);

  React.useEffect(() => {
    if (!isDesktopCapsule || !window.codexQuotaDesktop?.publishLiveData) return;
    window.codexQuotaDesktop.publishLiveData({
      newApiSnapshot,
      newApiError,
      localLogSummary,
      localLogSync,
      codexStatus,
      codexStatusLoaded,
      latestCodexTokenEvent,
      codexTokenSummary
    });
  }, [
    isDesktopCapsule,
    newApiSnapshot,
    newApiError,
    localLogSummary,
    localLogSync,
    codexStatus,
    codexStatusLoaded,
    latestCodexTokenEvent,
    codexTokenSummary
  ]);

  React.useEffect(() => {
    if (!spendEvent) {
      setVisibleSpendEvent(null);
      if (isDesktopCapsule && window.codexQuotaDesktop?.setToastOpen) {
        window.codexQuotaDesktop.setToastOpen(false);
      }
      return undefined;
    }
    let frame = 0;
    if (isDesktopCapsule && window.codexQuotaDesktop?.setToastOpen) {
      window.codexQuotaDesktop.setToastOpen(true);
      frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setVisibleSpendEvent(spendEvent));
      });
    } else {
      setVisibleSpendEvent(spendEvent);
    }
    const seconds = Number(settings.newApi.spendToastSeconds);
    const timeout = window.setTimeout(
      () => {
        setVisibleSpendEvent(null);
        setSpendEvent(null);
        if (isDesktopCapsule && window.codexQuotaDesktop?.setToastOpen) {
          window.requestAnimationFrame(() => window.codexQuotaDesktop?.setToastOpen(false));
        }
      },
      Math.min(30, Math.max(1, Number.isFinite(seconds) ? seconds : 5)) * 1000
    );
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [isDesktopCapsule, spendEvent, settings.newApi.spendToastSeconds]);

  const runPlatformSync = React.useCallback(async (options = {}) => {
    if (!canUseNewApiLocalData(settings.newApi)) {
      if (options.manual) {
        setManualSyncState({ status: 'error', message: '请先填写 Base URL 和系统访问令牌或 API Key' });
      }
      return undefined;
    }

    if (options.manual) {
      setManualSyncState({ status: 'loading', message: '同步中...' });
    }

    try {
      const result = await syncLocalNewApiLogs(settings.newApi, { manual: options.manual === true });
      if (!result) throw new Error('平台同步无返回');
      const syncResult = {
        ...result,
        updatedAt: new Date().toISOString()
      };
      setLocalLogSync(syncResult);
      if (result.summary) {
        setLocalLogSummary(result.summary);
      } else {
        const summary = await fetchLocalLogSummary({ settings: settings.newApi });
        setLocalLogSummary(summary ?? null);
      }
      if (options.manual) {
        const inserted = Number.isFinite(Number(result.inserted)) ? Number(result.inserted) : 0;
        const fetched = Number.isFinite(Number(result.fetched)) ? Number(result.fetched) : 0;
        setManualSyncState({ status: 'success', message: `同步完成，新增 ${inserted} / 获取 ${fetched}` });
      }
      return syncResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : '平台同步失败';
      setLocalLogSync({
        mode: 'error',
        message,
        updatedAt: new Date().toISOString()
      });
      if (options.manual) {
        setManualSyncState({ status: 'error', message });
      }
      return undefined;
    }
  }, [
    settings.newApi.baseUrl,
    settings.newApi.apiKey,
    settings.newApi.accessToken,
    settings.newApi.newApiUser,
    settings.newApi.accountRefreshIntervalSeconds,
    settings.newApi.topupRefreshIntervalSeconds
  ]);

  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof window.setInterval> | undefined;

    if (!shouldUseNewApiAutomation) {
      setNewApiSnapshot(null);
      setNewApiError('');
      return () => {
        active = false;
      };
    }

    const refresh = () => {
      fetchLocalLogSummary({ settings: settings.newApi })
        .then((summary) => {
          if (!active) return;
          setLocalLogSummary(summary ?? null);
        })
        .catch((error) => {
          if (!active) return;
          setNewApiSnapshot(lastNewApiSnapshotRef.current);
          setNewApiError(error instanceof Error ? error.message : '本地数据读取失败');
        });
    };

    refresh();
    const intervalMs = Math.max(5, Number(settings.newApi.refreshIntervalSeconds) || 30) * 1000;
    timer = window.setInterval(refresh, intervalMs);

    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [
    settings.newApi.baseUrl,
    settings.newApi.apiKey,
    settings.newApi.accessToken,
    settings.newApi.newApiUser,
    settings.newApi.displayName,
    settings.newApi.refreshIntervalSeconds,
    settings.pricingProfile,
    shouldUseNewApiAutomation
  ]);

  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof window.setInterval> | undefined;

    if (!shouldUseNewApiAutomation) {
      setLocalLogSync(null);
      return () => {
        active = false;
      };
    }

    const sync = () => {
      runPlatformSync().then(() => {}).catch(() => {});
    };

    sync();
    const intervalMs = Math.max(60, Number(settings.newApi.platformSyncIntervalSeconds) || 600) * 1000;
    timer = window.setInterval(sync, intervalMs);

    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [
    settings.newApi.baseUrl,
    settings.newApi.apiKey,
    settings.newApi.accessToken,
    settings.newApi.newApiUser,
    settings.newApi.platformSyncIntervalSeconds,
    settings.newApi.accountRefreshIntervalSeconds,
    settings.newApi.topupRefreshIntervalSeconds,
    shouldUseNewApiAutomation,
    runPlatformSync
  ]);

  const handleTestConnection = React.useCallback(async (providerOverride?: any) => {
    const targetNewApi = providerOverride
      ? {
          ...settings.newApi,
          displayName: providerOverride.displayName,
          baseUrl: providerOverride.baseUrl,
          apiKey: providerOverride.apiKey,
          accessToken: providerOverride.accessToken,
          newApiUser: providerOverride.newApiUser
        }
      : settings.newApi;
    setConnectionState({ status: 'loading', message: '测试中...', rawRequest: '' });
    const diagnose = await diagnoseNewApiAccount(targetNewApi).catch(() => undefined);
    const success = diagnose?.response?.success === true;
    setConnectionState({
      status: success ? 'success' : 'error',
      message: diagnose ? formatDiagnose(diagnose) : '诊断请求失败',
      rawRequest: diagnose?.request?.rawHttpRequest ?? ''
    });
  }, [settings.newApi]);

  if (isQuotaRecoveryWindow) {
    return <QuotaRecoveryDialog />;
  }

  if (isUpdateWindow) {
    return (
      <UpdateWindowShell
        updateCheckState={updateCheckState}
        autoDownloadRequested={autoDownloadRequested}
        dismissed={updateReminderDismissed}
        onDismiss={() => {
          setUpdateReminderDismissed(true);
          window.codexQuotaDesktop?.dismissUpdateReminder?.();
        }}
        onOpenRelease={(url) => {
          window.codexQuotaDesktop?.openUpdateRelease?.(url);
        }}
        onDownloadUpdate={(asset) => {
          window.codexQuotaDesktop?.startUpdateDownload?.(asset);
        }}
      />
    );
  }

  if (isSettingsWindow) {
    return (
      <main className="settings-window-shell">
        <SettingsPage
          settings={settings}
          onNewApiChange={(key, value) => setSettings((current) => updateNewApiSettings(current, key, value))}
          onPricingChange={(key, value) => setSettings((current) => updatePricingProfile(current, key, value))}
          onProviderSave={(provider) => setSettings((current) => upsertNewApiProvider(current, provider))}
          onProviderSelect={(providerId) => setSettings((current) => selectNewApiProvider(current, providerId))}
          onProviderDelete={(providerId) => setSettings((current) => deleteNewApiProvider(current, providerId))}
          onProviderDuplicate={(providerId) => setSettings((current) => duplicateNewApiProvider(current, providerId))}
          createProviderDraft={() => createNewApiProviderDraft(settings)}
          onTestConnection={handleTestConnection}
          onManualSync={() => runPlatformSync({ manual: true })}
          manualSyncState={manualSyncState}
          updateCheckState={updateCheckState}
          onCheckUpdate={() => runUpdateCheck()}
          onOpenUpdateWindow={(options) => window.codexQuotaDesktop?.openUpdateWindow?.(options)}
          connectionState={connectionState}
        />
      </main>
    );
  }

  if (isDetailWindow) {
    return (
      <DetailWindowShell>
        <div className="capsule-popover is-detached-detail" data-no-drag="true">
          <DetailPanel snapshot={activeSnapshot} />
        </div>
      </DetailWindowShell>
    );
  }

  return (
    <main className="app-shell">
      <section className="glance-surface" aria-label="Quota glance" data-settings-open={settingsOpen ? 'true' : 'false'}>
        <DraggableCapsule
          position={settings.window.capsulePosition}
          onPositionChange={(position) => setSettings((current) => updateCapsulePosition(current, position))}
          onTap={() => setDetailOpen((open) => !open)}
          toastVisible={Boolean(visibleSpendEvent)}
        >
          <div className="capsule-stack">
            <SpendToast
              event={visibleSpendEvent}
              amountDisplayMode={settings.newApi.amountDisplayMode}
              cnyPerUsd={settings.pricingProfile.cnyPerUsd}
            />
            <FloatingCapsule
              activity={codexStatus?.activity}
              expanded={detailOpen}
              updateAvailable={Boolean(updateCheckState.isNewer)}
              snapshot={activeSnapshot}
            />
            {detailOpen && !isDesktopCapsule && (
              <div className="capsule-popover" data-no-drag="true">
                <DetailPanel snapshot={activeSnapshot} />
              </div>
            )}
          </div>
        </DraggableCapsule>
      </section>
      {!isDesktopCapsule && !isSettingsWindow && (
        <button
          className="settings-toggle"
          data-no-drag="true"
          type="button"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          {settingsOpen ? '关闭设置' : '设置'}
        </button>
      )}
      {settingsOpen && !isDesktopCapsule && (
        <div className="settings-drawer" data-no-drag="true">
          <SettingsPage
            settings={settings}
            onNewApiChange={(key, value) => setSettings((current) => updateNewApiSettings(current, key, value))}
            onPricingChange={(key, value) => setSettings((current) => updatePricingProfile(current, key, value))}
            onProviderSave={(provider) => setSettings((current) => upsertNewApiProvider(current, provider))}
            onProviderSelect={(providerId) => setSettings((current) => selectNewApiProvider(current, providerId))}
            onProviderDelete={(providerId) => setSettings((current) => deleteNewApiProvider(current, providerId))}
            onProviderDuplicate={(providerId) => setSettings((current) => duplicateNewApiProvider(current, providerId))}
            createProviderDraft={() => createNewApiProviderDraft(settings)}
            onTestConnection={handleTestConnection}
            onManualSync={() => runPlatformSync({ manual: true })}
            manualSyncState={manualSyncState}
            updateCheckState={updateCheckState}
            onCheckUpdate={() => runUpdateCheck()}
            onOpenUpdateWindow={(options) => window.codexQuotaDesktop?.openUpdateWindow?.(options)}
            connectionState={connectionState}
          />
        </div>
      )}
      {!isDesktopCapsule && (
        <UpdateReminder
          updateCheckState={updateCheckState}
          dismissed={updateReminderDismissed}
          onDismiss={() => {
            setUpdateReminderDismissed(true);
            window.codexQuotaDesktop?.dismissUpdateReminder?.();
          }}
        />
      )}
    </main>
  );
}

function UpdateWindowShell({
  updateCheckState,
  autoDownloadRequested,
  dismissed,
  onDismiss,
  onOpenRelease,
  onDownloadUpdate
}: {
  updateCheckState: UpdateCheckState;
  autoDownloadRequested: boolean;
  dismissed: boolean;
  onDismiss: () => void;
  onOpenRelease: (url: string) => void;
  onDownloadUpdate: (asset: NonNullable<UpdateCheckState['installerAsset']>) => void;
}) {
  const [downloadState, setDownloadState] = React.useState({
    status: 'idle',
    message: '',
    percent: 0,
    received: 0,
    total: 0
  });
  const [autoDownloadRequestedState, setAutoDownloadRequested] = React.useState(autoDownloadRequested);
  const autoDownloadStartedRef = React.useRef(false);

  React.useEffect(() => {
    if (updateCheckState.status === 'success' && updateCheckState.isNewer) {
      window.codexQuotaDesktop?.notifyUpdateReady?.();
    }
    if (updateCheckState.status === 'success' && !updateCheckState.isNewer) {
      window.codexQuotaDesktop?.dismissUpdateReminder?.();
    }
  }, [updateCheckState.status, updateCheckState.isNewer]);

  React.useEffect(() => {
    if (!window.codexQuotaDesktop?.onUpdateDownloadProgress) return undefined;
    return window.codexQuotaDesktop.onUpdateDownloadProgress((payload) => {
      setDownloadState({
        status: payload.status || 'idle',
        message: payload.message || '',
        percent: Number(payload.percent) || 0,
        received: Number(payload.received) || 0,
        total: Number(payload.total) || 0
      });
    });
  }, []);

  React.useEffect(() => {
    if (!window.codexQuotaDesktop?.onUpdateAutoDownload) return undefined;
    return window.codexQuotaDesktop.onUpdateAutoDownload(() => {
      autoDownloadStartedRef.current = false;
      setAutoDownloadRequested(true);
    });
  }, []);

  React.useEffect(() => {
    if (!autoDownloadRequestedState || autoDownloadStartedRef.current) return;
    if (updateCheckState.status !== 'success' || !updateCheckState.isNewer || !updateCheckState.installerAsset) return;
    autoDownloadStartedRef.current = true;
    setDownloadState({
      status: 'starting',
      message: '正在连接 GitHub，准备下载安装包...',
      percent: 0,
      received: 0,
      total: Number(updateCheckState.installerAsset.size) || 0
    });
    onDownloadUpdate(updateCheckState.installerAsset);
  }, [
    autoDownloadRequestedState,
    onDownloadUpdate,
    updateCheckState.status,
    updateCheckState.isNewer,
    updateCheckState.installerAsset
  ]);

  if (updateCheckState.status === 'loading' || updateCheckState.status === 'idle') {
    return (
      <main className="update-window-shell">
        <section className="update-reminder update-reminder-inline" aria-label="检查更新">
          <h2>正在检查更新</h2>
          <p>启动后自动检查 Codex Quota Glance 是否有新版本。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="update-window-shell">
      <UpdateReminder
        updateCheckState={updateCheckState}
        dismissed={dismissed}
        downloadState={downloadState}
        standalone
        onDismiss={onDismiss}
        onOpenRelease={onOpenRelease}
        onDownloadUpdate={(asset) => {
          setDownloadState({
            status: 'starting',
            message: '正在连接 GitHub，准备下载安装包...',
            percent: 0,
            received: 0,
            total: Number(asset.size) || 0
          });
          onDownloadUpdate(asset);
        }}
      />
    </main>
  );
}

function DetailWindowShell({ children }: { children: React.ReactNode }) {
  const shellRef = React.useRef<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    if (!window.codexQuotaDesktop?.updateDetailLayout) return undefined;
    let frame = 0;
    const sendLayout = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rect = shellRef.current?.getBoundingClientRect();
        if (!rect) return;
        window.codexQuotaDesktop?.updateDetailLayout({
          width: Math.ceil(rect.width),
          height: Math.ceil(rect.height)
        });
      });
    };

    sendLayout();
    const timeout = window.setTimeout(sendLayout, 80);
    const observer = new ResizeObserver(sendLayout);
    if (shellRef.current) observer.observe(shellRef.current);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, [children]);

  return (
    <main ref={shellRef} className="detail-window-shell">
      {children}
    </main>
  );
}

function UpdateReminder({
  updateCheckState,
  dismissed,
  onDismiss,
  onOpenRelease,
  onDownloadUpdate,
  downloadState,
  standalone = false
}: {
  updateCheckState: UpdateCheckState;
  dismissed: boolean;
  onDismiss: () => void;
  onOpenRelease?: (url: string) => void;
  onDownloadUpdate?: (asset: NonNullable<UpdateCheckState['installerAsset']>) => void;
  downloadState?: {
    status: string;
    message: string;
    percent: number;
    received: number;
    total: number;
  };
  standalone?: boolean;
}) {
  if (!updateCheckState.isNewer || dismissed) return null;
  const releaseUrl = updateCheckState.releaseUrl || GITHUB_RELEASES_URL;
  const installerAsset = updateCheckState.installerAsset;
  const downloadStarted = Boolean(downloadState?.status && downloadState.status !== 'idle');
  const canDownload = Boolean(onDownloadUpdate && installerAsset);
  const dialog = (
    <section className={`update-reminder ${standalone ? 'update-reminder-inline' : ''}`} role="dialog" aria-modal="true" aria-label="发现新版本">
      <h2>发现新版本</h2>
      <p>
        当前版本 {updateCheckState.currentVersion}，最新版本 {updateCheckState.latestTagName}。
      </p>
      {downloadState?.message && (
        <div className="update-download-status">
          <span>{downloadState.message}</span>
          {(downloadState.status === 'downloading' || downloadState.status === 'launching' || downloadState.status === 'launched') && (
            <progress max="100" value={downloadState.percent} />
          )}
          {downloadState.total > 0 && (
            <small>{formatBytes(downloadState.received)} / {formatBytes(downloadState.total)}</small>
          )}
        </div>
      )}
      <div className="settings-actions update-actions">
        {!downloadStarted && (
          canDownload ? (
            <button className="primary-action" type="button" onClick={() => onDownloadUpdate(installerAsset)}>
              更新
            </button>
          ) : (
            <a
              className="primary-action update-link-button"
              href={releaseUrl}
              target="_blank"
              rel="noreferrer"
            >
              更新
            </a>
          )
        )}
      </div>
    </section>
  );
  if (standalone) return dialog;
  return (
    <div className="update-reminder-backdrop" role="presentation" data-no-drag="true">
      {dialog}
    </div>
  );
}

function formatBytes(value: number) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function enrichSpendEventWithEstimate(event: any, pricingProfile: any) {
  if (!event || event.source !== 'codex') return event;
  const cost = estimateTokenCost(event, pricingProfile);
  const amount = Number(cost.estimatedCost);
  return {
    ...event,
    costAmount: Number.isFinite(amount) ? amount : undefined,
    currency: cost.currency ?? pricingProfile?.currency ?? 'CNY'
  };
}

function formatDiagnose(diagnose: any) {
  const request = diagnose?.request;
  const response = diagnose?.response;
  if (!request || !response) return '诊断不可用';
  const diagnostics = request.diagnostics ?? {};
  const dataKeys = Array.isArray(response.dataKeys) && response.dataKeys.length > 0
    ? `，字段 ${response.dataKeys.slice(0, 5).join('/')}`
    : '';
  const tokenLength = diagnostics.tokenTrimmedLength ?? diagnostics.apiKeyTrimmedLength ?? '-';
  const tokenHash = diagnostics.tokenHashPrefix ?? diagnostics.apiKeyHashPrefix ?? '-';
  return `HTTP ${response.httpStatus}，${response.success === true ? '连接成功' : response.message || '连接失败'}，令牌长度 ${tokenLength}，Hash ${tokenHash}${dataKeys}`;
}
