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
import { getQuotaAlertCandidates } from './lib/quotaAlerts.mjs';
import { createRefreshCoordinator } from './lib/refreshCoordinator.mjs';
import { APP_VERSION, checkLatestRelease, GITHUB_RELEASES_URL } from './lib/updateChecker.mjs';
import type { UpdateCheckState } from './types/settings';
import {
  SETTINGS_STORAGE_KEY,
  loadAppSettings,
  saveAppSettings,
  updateCapsulePosition,
  updateAppearanceTheme,
  updateAlertSettings,
  updateCapsuleDensity,
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
  const [manualRefreshNonce, setManualRefreshNonce] = React.useState(0);
  const [quickRefreshState, setQuickRefreshState] = React.useState({ status: 'idle', updatedAt: '' });
  const quickRefreshInFlightRef = React.useRef(false);
  const [codexStatus, setCodexStatus] = React.useState(null);
  const [codexStatusLoaded, setCodexStatusLoaded] = React.useState(false);
  const lastNewApiSnapshotRef = React.useRef(null);
  const [localLogSummary, setLocalLogSummary] = React.useState(null);
  const [localLogSync, setLocalLogSync] = React.useState(null);
  const [manualSyncState, setManualSyncState] = React.useState({ status: 'idle', message: '' });
  const platformSyncInFlightRef = React.useRef<Promise<unknown> | null>(null);
  const [alertTestState, setAlertTestState] = React.useState({ status: 'idle', message: '' });
  const [spendEvent, setSpendEvent] = React.useState(null);
  const [visibleSpendEvent, setVisibleSpendEvent] = React.useState(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(() => isSettingsWindow);
  const [latestCodexTokenEvent, setLatestCodexTokenEvent] = React.useState(null);
  const [codexTokenSummary, setCodexTokenSummary] = React.useState(null);
  const [quotaReminder, setQuotaReminder] = React.useState(null);
  const seenQuotaAlertIdsRef = React.useRef(loadSeenQuotaAlertIds());
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
  const quietHoursActive = isQuietHours(settings.alerts);

  React.useEffect(() => {
    saveAppSettings(undefined, settings);
  }, [settings]);

  React.useEffect(() => {
    if (!isDesktopCapsule || !window.codexQuotaDesktop?.showQuotaAlert) return;
    const nextSeenIds = new Set(seenQuotaAlertIdsRef.current);
    if (quietHoursActive) return;
    const alerts = getQuotaAlertCandidates(activeSnapshot, settings.alerts);
    for (const alert of alerts) {
      if (nextSeenIds.has(alert.id)) continue;
      nextSeenIds.add(alert.id);
      window.codexQuotaDesktop.showQuotaAlert(alert);
    }
    if (nextSeenIds.size !== seenQuotaAlertIdsRef.current.size) {
      seenQuotaAlertIdsRef.current = nextSeenIds;
      saveSeenQuotaAlertIds(nextSeenIds);
    }
  }, [activeSnapshot, isDesktopCapsule, quietHoursActive, settings.alerts]);

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
    manualRefreshNonce,
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

  const runPlatformSync = React.useCallback((options = {}) => {
    if (platformSyncInFlightRef.current) {
      if (options.manual) {
        setManualSyncState({ status: 'loading', message: '已有同步正在进行，请稍候...' });
      }
      return platformSyncInFlightRef.current;
    }

    const task = (async () => {
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
    })();
    platformSyncInFlightRef.current = task;
    task.finally(() => {
      if (platformSyncInFlightRef.current === task) {
        platformSyncInFlightRef.current = null;
      }
    });
    return task;
  }, [
    settings.newApi.baseUrl,
    settings.newApi.apiKey,
    settings.newApi.accessToken,
    settings.newApi.newApiUser,
    settings.newApi.accountRefreshIntervalSeconds,
    settings.newApi.topupRefreshIntervalSeconds
  ]);

  const handleQuickRefresh = React.useCallback(async () => {
    if (quickRefreshInFlightRef.current) return;
    quickRefreshInFlightRef.current = true;
    setQuickRefreshState({ status: 'loading', updatedAt: quickRefreshState.updatedAt });
    setManualRefreshNonce((value) => value + 1);
    try {
      if (activeSnapshot?.providerType === 'new-api') {
        const result = await runPlatformSync({ manual: true });
        if (!result) throw new Error('刷新失败');
      }
      setQuickRefreshState({ status: 'success', updatedAt: new Date().toISOString() });
    } catch {
      setQuickRefreshState((current) => ({ ...current, status: 'error' }));
    } finally {
      quickRefreshInFlightRef.current = false;
    }
  }, [activeSnapshot?.providerType, quickRefreshState.updatedAt, runPlatformSync]);

  const handleTestQuotaAlert = React.useCallback(() => {
    if (!window.codexQuotaDesktop?.showQuotaAlert) {
      setAlertTestState({ status: 'error', message: '当前不是 Windows 桌面版，无法发送系统测试提醒。' });
      return;
    }
    window.codexQuotaDesktop.showQuotaAlert({
      title: 'QuotaPilot 测试提醒',
      body: '提醒功能正常。此通知不会影响真实额度提醒。'
    });
    setAlertTestState({ status: 'success', message: '测试提醒已发送；若没有看到，请检查 Windows 通知与专注模式。' });
  }, []);

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
    manualRefreshNonce,
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
        theme={settings.appearance.theme}
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
      <main className="settings-window-shell" data-theme={settings.appearance.theme}>
        <SettingsPage
          settings={settings}
          onThemeChange={(theme) => setSettings((current) => updateAppearanceTheme(current, theme))}
          onCapsuleDensityChange={(density) => setSettings((current) => updateCapsuleDensity(current, density))}
          onAlertSettingsChange={(key, value) => setSettings((current) => updateAlertSettings(current, key, value))}
          onTestQuotaAlert={handleTestQuotaAlert}
          alertTestState={alertTestState}
          quietHoursActive={quietHoursActive}
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
      <DetailWindowShell theme={settings.appearance.theme}>
        <div className="capsule-popover is-detached-detail" data-no-drag="true">
          <DetailPanel snapshot={activeSnapshot} />
        </div>
      </DetailWindowShell>
    );
  }

  return (
    <main className="app-shell" data-theme={settings.appearance.theme}>
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
              density={settings.appearance.capsuleDensity}
              expanded={detailOpen}
              onOpenSettings={() => {
                if (window.codexQuotaDesktop?.openSettings) {
                  window.codexQuotaDesktop.openSettings();
                  return;
                }
                setSettingsOpen(true);
              }}
              onRefresh={handleQuickRefresh}
              refreshState={quickRefreshState}
              onToggleTheme={() => setSettings((current) => updateAppearanceTheme(current, current.appearance.theme === 'dark' ? 'light' : 'dark'))}
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
          onThemeChange={(theme) => setSettings((current) => updateAppearanceTheme(current, theme))}
          onCapsuleDensityChange={(density) => setSettings((current) => updateCapsuleDensity(current, density))}
          onAlertSettingsChange={(key, value) => setSettings((current) => updateAlertSettings(current, key, value))}
          onTestQuotaAlert={handleTestQuotaAlert}
          alertTestState={alertTestState}
          quietHoursActive={quietHoursActive}
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
  theme,
  updateCheckState,
  autoDownloadRequested,
  dismissed,
  onDismiss,
  onOpenRelease,
  onDownloadUpdate
}: {
  theme: 'dark' | 'light';
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
      <main className="update-window-shell" data-theme={theme}>
        <section className="update-reminder update-reminder-inline" aria-label="检查更新">
          <h2>正在检查更新</h2>
          <p>启动后自动检查 QuotaPilot 是否有新版本。</p>
        </section>
      </main>
    );
  }

  return (
    <main className="update-window-shell" data-theme={theme}>
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

function DetailWindowShell({ children, theme }: { children: React.ReactNode; theme: 'dark' | 'light' }) {
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
    <main ref={shellRef} className="detail-window-shell" data-theme={theme}>
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

const QUOTA_ALERT_STORAGE_KEY = 'quotaPilotSeenQuotaAlerts';

function isQuietHours(alerts: { quietHoursStart?: string; quietHoursEnd?: string }) {
  const start = parseQuietHour(alerts.quietHoursStart);
  const end = parseQuietHour(alerts.quietHoursEnd);
  if (start === undefined || end === undefined || start === end) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function parseQuietHour(value?: string) {
  const match = String(value ?? '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : undefined;
}

function loadSeenQuotaAlertIds() {
  try {
    const raw = window.localStorage.getItem(QUOTA_ALERT_STORAGE_KEY);
    const values = JSON.parse(raw || '[]');
    return new Set(Array.isArray(values) ? values.filter((value) => typeof value === 'string').slice(-100) : []);
  } catch {
    return new Set();
  }
}

function saveSeenQuotaAlertIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(QUOTA_ALERT_STORAGE_KEY, JSON.stringify([...ids].slice(-100)));
  } catch {
    // Notifications can still work when browser storage is unavailable.
  }
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
