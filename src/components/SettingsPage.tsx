import React from 'react';
import PricingEditor from './PricingEditor';
import { validateBaseUrl } from '../lib/validation.mjs';
import { GITHUB_RELEASES_URL, GITHUB_REPOSITORY_URL } from '../lib/updateChecker.mjs';
import type { AppSettings, NewApiManagedProvider, UpdateCheckState } from '../types/settings';

type SettingsTab = 'api' | 'sync' | 'about';

interface Props {
  settings: AppSettings;
  onNewApiChange: (key: string, value: string) => void;
  onPricingChange: (key: string, value: string) => void;
  onProviderSave: (provider: NewApiManagedProvider) => void;
  onProviderSelect: (providerId: string) => void;
  onProviderDelete: (providerId: string) => void;
  onProviderDuplicate: (providerId: string) => void;
  createProviderDraft: () => NewApiManagedProvider;
  onTestConnection: (provider?: NewApiManagedProvider) => void;
  onManualSync: () => void;
  manualSyncState: {
    status: string;
    message: string;
  };
  updateCheckState: UpdateCheckState;
  onCheckUpdate: () => void;
  connectionState: {
    status: string;
    message: string;
    rawRequest?: string;
  };
}

export default function SettingsPage({
  settings,
  onNewApiChange,
  onPricingChange,
  onProviderSave,
  onProviderSelect,
  onProviderDelete,
  onProviderDuplicate,
  createProviderDraft,
  onTestConnection,
  onManualSync,
  manualSyncState,
  updateCheckState,
  onCheckUpdate,
  connectionState
}: Props) {
  const { newApi } = settings;
  const [activeTab, setActiveTab] = React.useState<SettingsTab>('api');
  const [editingProvider, setEditingProvider] = React.useState<NewApiManagedProvider | null>(null);
  const baseUrlValidation = validateBaseUrl(newApi.baseUrl);

  if (editingProvider) {
    return (
      <ProviderEditor
        provider={editingProvider}
        connectionState={connectionState}
        onCancel={() => setEditingProvider(null)}
        onSave={(provider) => {
          onProviderSave(provider);
          setEditingProvider(null);
        }}
        onTestConnection={onTestConnection}
      />
    );
  }

  return (
    <section className="settings-page" aria-label="软件设置">
      <header className="settings-header">
        <div>
          <h2>设置</h2>
          <p>管理供应商、同步和显示方式</p>
        </div>
        <nav className="settings-tabs" aria-label="设置分类">
          <TabButton active={activeTab === 'api'} onClick={() => setActiveTab('api')}>
            供应商
          </TabButton>
          <TabButton active={activeTab === 'sync'} onClick={() => setActiveTab('sync')}>
            同步
          </TabButton>
          <TabButton active={activeTab === 'about'} onClick={() => setActiveTab('about')}>
            关于/更新
          </TabButton>
        </nav>
      </header>

      <div className="settings-grid">
        {activeTab === 'api' && (
          <section className="settings-section provider-manager">
            <div className="provider-toolbar">
              <h2>API Key 管理</h2>
              <button
                className="primary-action provider-add-button"
                type="button"
                onClick={() => setEditingProvider(createProviderDraft())}
              >
                <PlusIcon /> 添加供应商
              </button>
            </div>

            <div className="provider-list">
              {newApi.providers.map((provider) => {
                const active = provider.id === newApi.activeProviderId;
                return (
                  <article className={`provider-card ${active ? 'is-active' : ''}`} key={provider.id}>
                    <span className="drag-dots" aria-hidden="true">••</span>
                    <span className="provider-avatar">{firstGlyph(provider.displayName)}</span>
                    <div className="provider-copy">
                      <strong>{provider.displayName || '未命名供应商'}</strong>
                      <span>{providerSummary(provider)}</span>
                    </div>
                    <div className="provider-actions">
                      <button
                        className={`provider-use-button ${active ? 'is-active' : ''}`}
                        type="button"
                        onClick={() => onProviderSelect(provider.id)}
                      >
                        <CheckCircleIcon /> 使用
                      </button>
                      <button className="icon-button ghost-icon" type="button" title="测试连接" onClick={() => onTestConnection(provider)}>
                        <TestTubeIcon />
                      </button>
                      <button className="icon-button ghost-icon" type="button" title="编辑" onClick={() => setEditingProvider(provider)}>
                        <EditIcon />
                      </button>
                      <button className="icon-button ghost-icon" type="button" title="复制" onClick={() => onProviderDuplicate(provider.id)}>
                        <CopyIcon />
                      </button>
                      <button
                        className="icon-button ghost-icon"
                        type="button"
                        title="删除"
                        disabled={newApi.providers.length <= 1}
                        onClick={() => onProviderDelete(provider.id)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="field-group compact-field-group">
              <span>金额显示</span>
              <div className="segmented-control" role="group" aria-label="金额显示">
                <button
                  className={newApi.amountDisplayMode !== 'usd' ? 'is-active' : ''}
                  type="button"
                  onClick={() => onNewApiChange('amountDisplayMode', 'cny')}
                >
                  人民币
                </button>
                <button
                  className={newApi.amountDisplayMode === 'usd' ? 'is-active' : ''}
                  type="button"
                  onClick={() => onNewApiChange('amountDisplayMode', 'usd')}
                >
                  美元
                </button>
              </div>
            </div>

            {connectionState.message && (
              <span className={`connection-message connection-${connectionState.status}`}>
                {connectionState.message}
              </span>
            )}
            {connectionState.rawRequest && (
              <pre className="request-debug-block">{connectionState.rawRequest}</pre>
            )}
          </section>
        )}

        {activeTab === 'sync' && (
          <section className="settings-section">
            <h2>同步</h2>
            <label>
              页面刷新频率（秒）
              <input
                value={newApi.refreshIntervalSeconds}
                inputMode="numeric"
                onChange={(event) => onNewApiChange('refreshIntervalSeconds', event.currentTarget.value)}
              />
            </label>
            <label>
              本机 Token 检查（秒）
              <input
                value={newApi.codexTokenPollIntervalSeconds}
                inputMode="numeric"
                onChange={(event) => onNewApiChange('codexTokenPollIntervalSeconds', event.currentTarget.value)}
              />
              <span className="field-hint">只读取本机 Codex 会话文件，不请求平台。</span>
            </label>
            <label>
              平台日志同步（秒）
              <input
                value={newApi.platformSyncIntervalSeconds}
                inputMode="numeric"
                onChange={(event) => onNewApiChange('platformSyncIntervalSeconds', event.currentTarget.value)}
              />
              <span className="field-hint">最低 60 秒；余额和日志低频校准，平时优先使用本地数据。</span>
            </label>
            <label>
              余额校准间隔（秒）
              <input
                value={newApi.accountRefreshIntervalSeconds}
                inputMode="numeric"
                onChange={(event) => onNewApiChange('accountRefreshIntervalSeconds', event.currentTarget.value)}
              />
            </label>
            <label>
              充值校准间隔（秒）
              <input
                value={newApi.topupRefreshIntervalSeconds}
                inputMode="numeric"
                onChange={(event) => onNewApiChange('topupRefreshIntervalSeconds', event.currentTarget.value)}
              />
            </label>
            <label>
              提醒停留（秒）
              <input
                value={newApi.spendToastSeconds}
                inputMode="numeric"
                onChange={(event) => onNewApiChange('spendToastSeconds', event.currentTarget.value)}
              />
            </label>
            <div className="settings-actions">
              <button
                className="secondary-action"
                type="button"
                disabled={manualSyncState.status === 'loading' || !baseUrlValidation.valid}
                onClick={onManualSync}
              >
                手动同步平台
              </button>
              {manualSyncState.message && (
                <span className={`connection-message connection-${manualSyncState.status}`}>
                  {manualSyncState.message}
                </span>
              )}
            </div>
          </section>
        )}

        {activeTab === 'about' && (
          <AboutUpdateSection updateCheckState={updateCheckState} onCheckUpdate={onCheckUpdate} />
        )}
      </div>
    </section>
  );
}

function AboutUpdateSection({
  updateCheckState,
  onCheckUpdate
}: {
  updateCheckState: UpdateCheckState;
  onCheckUpdate: () => void;
}) {
  return (
    <section className="settings-section">
      <h2>关于/更新</h2>
      <dl>
        <dt>当前版本</dt>
        <dd>{updateCheckState.currentVersion}</dd>
        <dt>GitHub 仓库</dt>
        <dd>
          <a href={GITHUB_REPOSITORY_URL} target="_blank" rel="noreferrer">
            {GITHUB_REPOSITORY_URL}
          </a>
        </dd>
        <dt>Releases</dt>
        <dd>
          <a href={GITHUB_RELEASES_URL} target="_blank" rel="noreferrer">
            {GITHUB_RELEASES_URL}
          </a>
        </dd>
        <dt>更新状态</dt>
        <dd>{formatUpdateStatus(updateCheckState)}</dd>
      </dl>
      <div className="settings-actions">
        <button
          className="secondary-action"
          type="button"
          disabled={updateCheckState.status === 'loading'}
          onClick={onCheckUpdate}
        >
          {updateCheckState.status === 'loading' ? '检查中...' : '检查更新'}
        </button>
        {updateCheckState.message && (
          <span className={`connection-message connection-${updateCheckState.status}`}>
            {updateCheckState.message}
          </span>
        )}
      </div>
    </section>
  );
}

function formatUpdateStatus(state: UpdateCheckState) {
  if (state.status === 'loading') return '正在检查 GitHub Releases...';
  if (state.status === 'error') return state.message || '检查失败';
  if (state.latestTagName) {
    const prefix = state.isNewer ? '发现新版本' : '已是最新版本';
    return `${prefix}：${state.latestTagName}`;
  }
  return state.message || '尚未检查';
}

function ProviderEditor({
  provider,
  connectionState,
  onCancel,
  onSave,
  onTestConnection
}: {
  provider: NewApiManagedProvider;
  connectionState: Props['connectionState'];
  onCancel: () => void;
  onSave: (provider: NewApiManagedProvider) => void;
  onTestConnection: (provider?: NewApiManagedProvider) => void;
}) {
  const [draft, setDraft] = React.useState(provider);
  const [apiKeyVisible, setApiKeyVisible] = React.useState(false);
  const [accessTokenVisible, setAccessTokenVisible] = React.useState(false);
  const baseUrlValidation = validateBaseUrl(draft.baseUrl);

  const updateDraft = (key: keyof NewApiManagedProvider, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const updatePricing = (key: string, value: string) => {
    setDraft((current) => ({
      ...current,
      pricingProfile: {
        ...current.pricingProfile,
        [key]: value
      }
    }));
  };

  return (
    <section className="settings-page provider-editor-page" aria-label="供应商编辑">
      <header className="settings-header provider-editor-header">
        <div>
          <h2>{provider.displayName ? '编辑供应商' : '添加供应商'}</h2>
          <p>连接信息和单价只影响这个 API Key</p>
        </div>
        <button className="secondary-action" type="button" onClick={onCancel}>返回</button>
      </header>

      <div className="settings-grid provider-editor-grid">
        <section className="settings-section">
          <h2>连接信息</h2>
          <label>
            显示名称
            <input value={draft.displayName} onChange={(event) => updateDraft('displayName', event.currentTarget.value)} />
          </label>
          <label>
            Base URL
            <input
              value={draft.baseUrl}
              aria-invalid={!baseUrlValidation.valid}
              onChange={(event) => updateDraft('baseUrl', event.currentTarget.value)}
            />
            {!baseUrlValidation.valid && <span className="field-error">{baseUrlValidation.message}</span>}
          </label>
          <label>
            API Key
            <span className="secret-input">
              <input
                value={draft.apiKey}
                type={apiKeyVisible ? 'text' : 'password'}
                onChange={(event) => updateDraft('apiKey', event.currentTarget.value)}
              />
              <button className="icon-button" type="button" onClick={() => setApiKeyVisible((visible) => !visible)}>
                {apiKeyVisible ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </span>
          </label>
          <label>
            系统访问令牌
            <span className="secret-input">
              <input
                value={draft.accessToken}
                type={accessTokenVisible ? 'text' : 'password'}
                onChange={(event) => updateDraft('accessToken', event.currentTarget.value)}
              />
              <button className="icon-button" type="button" onClick={() => setAccessTokenVisible((visible) => !visible)}>
                {accessTokenVisible ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </span>
          </label>
          <label>
            New-Api-User
            <input value={draft.newApiUser} inputMode="numeric" onChange={(event) => updateDraft('newApiUser', event.currentTarget.value)} />
          </label>
          <div className="settings-actions">
            <button className="secondary-action" type="button" disabled={!baseUrlValidation.valid} onClick={() => onTestConnection(draft)}>
              测试连接
            </button>
            {connectionState.message && (
              <span className={`connection-message connection-${connectionState.status}`}>{connectionState.message}</span>
            )}
          </div>
        </section>

        <PricingEditor profile={draft.pricingProfile} onChange={updatePricing} />
      </div>

      <div className="settings-actions provider-editor-actions">
        <button className="secondary-action" type="button" onClick={onCancel}>取消</button>
        <button className="primary-action" type="button" disabled={!baseUrlValidation.valid} onClick={() => onSave(draft)}>
          保存并返回
        </button>
      </div>
    </section>
  );
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button className={active ? 'is-active' : ''} type="button" onClick={onClick}>{children}</button>;
}

function providerSummary(provider: NewApiManagedProvider) {
  const mode = provider.apiKey ? '纯 API' : '未填写 API Key';
  const url = provider.baseUrl || '未填写 URL';
  return `本地 · ${mode} · Responses API · ${url}`;
}

function firstGlyph(value: string) {
  return String(value || '供').trim().slice(0, 1) || '供';
}

function PlusIcon() {
  return <svg aria-hidden="true" fill="none" height="17" viewBox="0 0 24 24" width="17"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>;
}

function CheckCircleIcon() {
  return <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M9 12.5 11.2 15 16 9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="2" /></svg>;
}

function TestTubeIcon() {
  return <svg aria-hidden="true" fill="none" height="17" viewBox="0 0 24 24" width="17"><path d="M10 2v6l-4.8 8.4A3.7 3.7 0 0 0 8.4 22h7.2a3.7 3.7 0 0 0 3.2-5.6L14 8V2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /><path d="M8 14h8" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>;
}

function EditIcon() {
  return <svg aria-hidden="true" fill="none" height="17" viewBox="0 0 24 24" width="17"><path d="M4 20h4L19 9l-4-4L4 16v4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" /><path d="m13 7 4 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>;
}

function CopyIcon() {
  return <svg aria-hidden="true" fill="none" height="17" viewBox="0 0 24 24" width="17"><path d="M8 8h11v11H8z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" /><path d="M5 16H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>;
}

function TrashIcon() {
  return <svg aria-hidden="true" fill="none" height="17" viewBox="0 0 24 24" width="17"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>;
}

function EyeIcon() {
  return <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>;
}

function EyeOffIcon() {
  return <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="m3 3 18 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /><path d="M10.6 6.2A9.4 9.4 0 0 1 12 6c6 0 9.5 6 9.5 6a16.8 16.8 0 0 1-3.1 3.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /><path d="M14.1 14.1A3 3 0 0 1 9.9 9.9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /><path d="M6.6 6.7C3.9 8.4 2.5 12 2.5 12s3.5 6 9.5 6c1.3 0 2.5-.3 3.6-.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>;
}
