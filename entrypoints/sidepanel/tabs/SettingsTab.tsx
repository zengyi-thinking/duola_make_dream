import { useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';
import type { MemorySummary, RuntimeConfig } from '@/lib/agent/types';
import { pocketAvatarIds, pocketAvatars } from '@/lib/brand/avatars';
import { createMemoryDeleteMessage, sendRuntimeMessage } from '@/lib/messaging/bus';
import { updateRuntimeConfig } from '@/lib/storage/local';

interface SettingsTabProps {
  config: RuntimeConfig | null;
  setConfig: Dispatch<SetStateAction<RuntimeConfig | null>>;
  setMemory: Dispatch<SetStateAction<MemorySummary | null>>;
  setErrorText: Dispatch<SetStateAction<string>>;
  setNoticeText: Dispatch<SetStateAction<string>>;
  refreshConfig: () => Promise<void>;
  resetWorkspaceState: () => void;
  busyAction: string;
  setBusyAction: Dispatch<SetStateAction<string>>;
}

export default function SettingsTab(props: SettingsTabProps) {
  const {
    config,
    setConfig,
    setMemory,
    setErrorText,
    setNoticeText,
    refreshConfig,
    resetWorkspaceState,
    busyAction,
    setBusyAction,
  } = props;
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [showImageKey, setShowImageKey] = useState(false);
  const configSaveQueueRef = useRef(Promise.resolve());

  async function updateField<K extends keyof RuntimeConfig>(key: K, value: RuntimeConfig[K]) {
    if (!config) return;

    const next = { ...config, [key]: value };
    setConfig(next);

    try {
      await enqueueRuntimeConfigUpdate({ [key]: value } as Partial<RuntimeConfig>);
      setNoticeText('配置已保存。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '保存配置失败');
    }
  }

  async function handleClearAll() {
    if (!window.confirm('确定要清除所有本地数据吗？此操作不可撤销。')) return;
    setBusyAction('clear-all');
    try {
      await configSaveQueueRef.current.catch(() => undefined);
      const response = await sendRuntimeMessage(createMemoryDeleteMessage('all'));
      if (!response.success) { setErrorText(response.error ?? '清除失败。'); return; }
      setMemory(response.payload);
      await refreshConfig();
      resetWorkspaceState();
      setNoticeText('所有本地数据已清除。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '清除失败。');
    } finally {
      setBusyAction('');
    }
  }

  function enqueueRuntimeConfigUpdate(patch: Partial<RuntimeConfig>) {
    const next = configSaveQueueRef.current
      .catch(() => undefined)
      .then(() => updateRuntimeConfig(patch));

    configSaveQueueRef.current = next.then(
      () => undefined,
      () => undefined,
    );

    return next;
  }

  if (!config) {
    return <div className="tab-panel"><p className="soft-text">加载设置中...</p></div>;
  }

  const llmIsReal = config.llmProvider !== 'mock';
  const imageIsReal = config.imageMode === 'proxy';
  const avatarId = pocketAvatars[config.avatarId] ? config.avatarId : 'yunyu-main';
  const avatarMeta = pocketAvatars[avatarId];

  return (
    <div className="tab-panel">
      <section className="settings-cover">
        <PocketBuddyAvatar avatar={avatarId} mood="warm" size={64} />
        <div className="settings-cover__copy">
          <p className="section-label">PocketBuddy</p>
          <h2>设置中心</h2>
          <p className="soft-text">这里配置模型、身份和头像，其他历史状态请去观察页查看。</p>
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Identity Console</p>
            <h2>Agent 身份</h2>
          </div>
          <span className="micro-status">会同步到侧边栏标题和头像</span>
        </div>

        <div className="settings-section">
          <label>Agent 名称</label>
          <input
            type="text"
            className="settings-input"
            value={config.agentName}
            onChange={(e) => updateField('agentName', e.target.value)}
            placeholder="PocketAgent"
          />
        </div>

        <div className="settings-section">
          <label>默认语气</label>
          <input
            type="text"
            className="settings-input"
            value={config.defaultTone}
            onChange={(e) => updateField('defaultTone', e.target.value)}
            placeholder="warm-product-designer"
          />
        </div>

        <div className="settings-section">
            <label>头像</label>
            <select
              className="settings-select"
              value={avatarId}
              onChange={(e) => updateField('avatarId', e.target.value as RuntimeConfig['avatarId'])}
            >
            {pocketAvatarIds.map((avatarId) => {
              const meta = pocketAvatars[avatarId];
              return (
                <option key={avatarId} value={avatarId}>
                  {meta.name}
                </option>
              );
            })}
          </select>
        </div>

        <div className="settings-avatar-preview">
          <PocketBuddyAvatar avatar={config.avatarId} mood="warm" size={72} />
          <div>
            <strong>{config.agentName}</strong>
            <p className="soft-text">{avatarMeta.name}</p>
            <p className="micro-copy">{avatarMeta.usage}</p>
          </div>
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">LLM Provider</p>
            <h2>LLM 接入</h2>
          </div>
          <span className="micro-status">{config.llmProvider === 'mock' ? '本地模拟' : '已启用'}</span>
        </div>

        <div className="settings-section">
          <label>选择供应商</label>
          <select
            className="settings-select"
            value={config.llmProvider}
            onChange={(e) => updateField('llmProvider', e.target.value as RuntimeConfig['llmProvider'])}
          >
            <option value="mock">Mock（本地模拟，无需 API）</option>
            <option value="minimax">MiniMax（Anthropic 兼容）</option>
            <option value="anthropic">Anthropic</option>
            <option value="custom">自定义端点</option>
          </select>
        </div>

        {llmIsReal ? (
          <>
            <div className="settings-section">
              <label>模型名</label>
              <input
                type="text"
                className="settings-input"
                value={config.llmModel}
                onChange={(e) => updateField('llmModel', e.target.value)}
                placeholder="MiniMax-M2.7"
              />
            </div>
            <div className="settings-section">
              <label>API Key</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type={showLlmKey ? 'text' : 'password'}
                  className="settings-input"
                  style={{ flex: 1 }}
                  value={config.llmApiKey}
                  onChange={(e) => updateField('llmApiKey', e.target.value)}
                  placeholder="sk-..."
                />
                <LineButton variant="ghost" onClick={() => setShowLlmKey(!showLlmKey)}>
                  {showLlmKey ? '隐藏' : '显示'}
                </LineButton>
              </div>
            </div>
            <div className="settings-section">
              <label>API 端点</label>
              <input
                type="text"
                className="settings-input"
                value={config.llmEndpoint}
                onChange={(e) => updateField('llmEndpoint', e.target.value)}
                placeholder="https://api.minimaxi.com/anthropic"
              />
            </div>
          </>
        ) : (
          <p className="soft-text">当前使用本地 Mock Agent，不会调用任何外部 API。</p>
        )}
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Image Provider</p>
            <h2>图片生成</h2>
          </div>
          <span className="micro-status">{config.imageMode === 'mock' ? '本地模拟' : '已启用'}</span>
        </div>

        <div className="settings-section">
          <label>选择供应商</label>
          <select
            className="settings-select"
            value={config.imageMode}
            onChange={(e) => updateField('imageMode', e.target.value as RuntimeConfig['imageMode'])}
          >
            <option value="mock">Mock（仅生成 Prompt 文本）</option>
            <option value="proxy">真实生成（GPT Image）</option>
          </select>
        </div>

        {imageIsReal ? (
          <>
            <div className="settings-section">
              <label>模型名</label>
              <input
                type="text"
                className="settings-input"
                value={config.imageModel}
                onChange={(e) => updateField('imageModel', e.target.value)}
                placeholder="gpt-image-2"
              />
            </div>
            <div className="settings-section">
              <label>API Key</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type={showImageKey ? 'text' : 'password'}
                  className="settings-input"
                  style={{ flex: 1 }}
                  value={config.imageApiKey}
                  onChange={(e) => updateField('imageApiKey', e.target.value)}
                  placeholder="sk-..."
                />
                <LineButton variant="ghost" onClick={() => setShowImageKey(!showImageKey)}>
                  {showImageKey ? '隐藏' : '显示'}
                </LineButton>
              </div>
            </div>
            <div className="settings-section">
              <label>API 端点</label>
              <input
                type="text"
                className="settings-input"
                value={config.imageProxyEndpoint}
                onChange={(e) => updateField('imageProxyEndpoint', e.target.value)}
                placeholder="https://api.apimart.ai/v1/images/generations"
              />
            </div>
          </>
        ) : (
          <p className="soft-text">当前使用 Mock，仅生成 Prompt 文本，不调用外部 API。</p>
        )}
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Data Management</p>
            <h2>数据管理</h2>
          </div>
        </div>
        <div className="inline-actions">
          <LineButton variant="ghost" onClick={handleClearAll} disabled={Boolean(busyAction)}>
            清除所有本地数据
          </LineButton>
        </div>
        <p className="soft-text" style={{ marginTop: 4 }}>
          所有数据仅存储在本地浏览器中。API Key 只保存在本地，不会上传到第三方服务器。
        </p>
      </section>
    </div>
  );
}
