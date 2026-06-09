import React from 'react';
import DetailPanel from './components/DetailPanel';
import DraggableCapsule from './components/DraggableCapsule';
import FloatingCapsule from './components/FloatingCapsule';
import SettingsPage from './components/SettingsPage';
import SpendToast from './components/SpendToast';
import { fetchCodexStatus } from './lib/codexStatusStore.mjs';
import { selectPrimarySnapshot } from './lib/display.mjs';
import { diagnoseNewApiAccount, fetchLocalLogSummary, syncLocalNewApiLogs } from './lib/localLogStore.mjs';
import { canUseNewApiLocalData } from './lib/newApiClient.mjs';
import { buildSnapshots } from './lib/snapshotFactory.mjs';
import { fetchCodexTokenSummary, fetchLatestCodexTokenUsage } from './lib/spendEvents.mjs';
import { estimateTokenCost } from './lib/pricing.mjs';
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
    codexStatusLoaded && codexStatus?.accountType !== 'official_login' && canUseNewApiLocalData(settings.newApi);
  const shouldPollCodexToken = codexStatusLoaded;
  const shouldPollCodexStatusFast = codexStatusLoaded;

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
    if (isDesktopCapsule) return;
    runUpdateCheck({ silent: true });
  }, [isDesktopCapsule, runUpdateCheck]);

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
    if (!codexStatusLoaded || codexStatus?.accountType !== 'api') return;
    setSettings((current) => selectProviderForCodexStatus(current, codexStatus));
  }, [
    codexStatusLoaded,
    codexStatus?.accountType,
    codexStatus?.apiKeyFingerprint,
    codexStatus?.baseUrl
  ]);

  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof window.setInterval> | undefined;
    const refresh = () => {
      fetchCodexStatus()
        .then((status) => {
          if (active) {
            setCodexStatus(status ?? null);
            setCodexStatusLoaded(true);
          }
        })
        .catch(() => {
          if (active) {
            setCodexStatus(null);
            setCodexStatusLoaded(true);
          }
        });
    };
    refresh();
    timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof window.setInterval> | undefined;

    if (!shouldPollCodexStatusFast) {
      return () => {
        active = false;
      };
    }

    const refresh = () => {
      fetchCodexStatus()
        .then((status) => {
          if (active) {
            setCodexStatus(status ?? null);
            setCodexStatusLoaded(true);
          }
        })
        .catch(() => {});
    };

    const intervalMs = Math.max(1, Number(settings.newApi.codexTokenPollIntervalSeconds) || 2) * 1000;
    timer = window.setInterval(refresh, intervalMs);

    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [
    settings.newApi.codexTokenPollIntervalSeconds,
    shouldPollCodexStatusFast
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

    if (!shouldPollCodexToken) {
      return () => {
        active = false;
      };
    }

    const refresh = () => {
      fetchLatestCodexTokenUsage()
        .then((event) => {
          if (!active || !event?.id) return;
          const estimatedEvent = enrichSpendEventWithEstimate(event, settings.pricingProfile);
          setLatestCodexTokenEvent(estimatedEvent);
          fetchCodexTokenSummary()
            .then((summary) => {
              if (active) setCodexTokenSummary(summary ?? null);
            })
            .catch(() => {});
          if (event.id === seenSpendEventIdRef.current) return;
          seenSpendEventIdRef.current = event.id;
          setSpendEvent(estimatedEvent);
        })
        .catch(() => {});
    };

    refresh();
    const intervalMs = Math.max(1, Number(settings.newApi.codexTokenPollIntervalSeconds) || 2) * 1000;
    timer = window.setInterval(refresh, intervalMs);

    return () => {
      active = false;
      if (timer) window.clearInterval(timer);
    };
  }, [
    settings.newApi.codexTokenPollIntervalSeconds,
    settings.pricingProfile,
    shouldPollCodexToken
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

  if (isSettingsWindow) {
    return (
      <>
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
            connectionState={connectionState}
          />
        </main>
        <UpdateReminder
          updateCheckState={updateCheckState}
          dismissed={updateReminderDismissed}
          onDismiss={() => setUpdateReminderDismissed(true)}
        />
      </>
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
              snapshot={activeSnapshot}
            />
            {detailOpen && (
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
            connectionState={connectionState}
          />
        </div>
      )}
      <UpdateReminder
        updateCheckState={updateCheckState}
        dismissed={updateReminderDismissed}
        onDismiss={() => setUpdateReminderDismissed(true)}
      />
    </main>
  );
}

function UpdateReminder({
  updateCheckState,
  dismissed,
  onDismiss
}: {
  updateCheckState: UpdateCheckState;
  dismissed: boolean;
  onDismiss: () => void;
}) {
  if (!updateCheckState.isNewer || dismissed) return null;
  return (
    <div className="update-reminder-backdrop" role="presentation" data-no-drag="true">
      <section className="update-reminder" role="dialog" aria-modal="true" aria-label="发现新版本">
        <h2>发现新版本</h2>
        <p>
          当前版本 {updateCheckState.currentVersion}，最新版本 {updateCheckState.latestTagName}。
        </p>
        <div className="settings-actions">
          <a
            className="primary-action update-link-button"
            href={updateCheckState.releaseUrl || GITHUB_RELEASES_URL}
            target="_blank"
            rel="noreferrer"
          >
            打开发布页
          </a>
          <button className="secondary-action" type="button" onClick={onDismiss}>
            本次运行不再提醒
          </button>
        </div>
      </section>
    </div>
  );
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

