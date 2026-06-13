import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';
import type { MemorySummary, RuntimeConfig, UserProfile } from '@/lib/agent/types';
import { pocketAvatarIds, pocketAvatars } from '@/lib/brand/avatars';
import { saveProfile } from '@/lib/memory';
import { createMemoryDeleteMessage, sendRuntimeMessage } from '@/lib/messaging/bus';
import { flushRuntimeConfigWrites, updateRuntimeConfig } from '@/lib/storage/local';
import { DEFAULT_PROFILE } from '@/lib/storage/schema';

interface SettingsTabProps {
  config: RuntimeConfig | null;
  memory: MemorySummary | null;
  setConfig: Dispatch<SetStateAction<RuntimeConfig | null>>;
  setMemory: Dispatch<SetStateAction<MemorySummary | null>>;
  setErrorText: Dispatch<SetStateAction<string>>;
  setNoticeText: Dispatch<SetStateAction<string>>;
  refreshMemory: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  resetWorkspaceState: () => void;
  busyAction: string;
  setBusyAction: Dispatch<SetStateAction<string>>;
}

interface ProfileDraft {
  visualLikes: string;
  visualDislikes: string;
  tonePreference: string;
  productPreferences: string;
  recentThemes: string;
}

export default function SettingsTab(props: SettingsTabProps) {
  const {
    config,
    memory,
    setConfig,
    setMemory,
    setErrorText,
    setNoticeText,
    refreshMemory,
    refreshConfig,
    resetWorkspaceState,
    busyAction,
    setBusyAction,
  } = props;
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [showImageKey, setShowImageKey] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() => buildProfileDraft(DEFAULT_PROFILE));
  const [profileDirty, setProfileDirty] = useState(false);

  useEffect(() => {
    if (profileDirty) return;
    setProfileDraft(buildProfileDraft(memory?.profile ?? DEFAULT_PROFILE));
  }, [memory?.profile.lastUpdated, profileDirty]);

  async function updateField<K extends keyof RuntimeConfig>(key: K, value: RuntimeConfig[K]) {
    if (!config || busyAction) return;

    const next = { ...config, [key]: value };
    setConfig(next);

    try {
      await updateRuntimeConfig({ [key]: value } as Partial<RuntimeConfig>);
      setNoticeText('配置已保存。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '保存配置失败');
    }
  }

  function updateProfileField<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setProfileDraft((current) => ({ ...current, [key]: value }));
    setProfileDirty(true);
  }

  function resetProfileDraft() {
    setProfileDraft(buildProfileDraft(memory?.profile ?? DEFAULT_PROFILE));
    setProfileDirty(false);
    setNoticeText('已恢复当前画像草稿。');
  }

  async function handleSaveProfile() {
    if (!memory || busyAction || !profileDirty) return;

    setBusyAction('profile-save');
    setErrorText('');

    try {
      const nextProfile: UserProfile = {
        visualLikes: parseProfileList(profileDraft.visualLikes),
        visualDislikes: parseProfileList(profileDraft.visualDislikes),
        tonePreference: profileDraft.tonePreference.trim(),
        productPreferences: parseProfileList(profileDraft.productPreferences),
        recentThemes: parseProfileList(profileDraft.recentThemes),
        lastUpdated: Date.now(),
      };

      await saveProfile(nextProfile, 'manual');
      await refreshMemory();
      setProfileDirty(false);
      setNoticeText('用户画像已保存。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '保存画像失败');
    } finally {
      setBusyAction('');
    }
  }

  async function handleClearAll() {
    if (!window.confirm('确定要清除所有本地数据吗？此操作不可撤销。')) return;
    setBusyAction('clear-all');
    try {
      await flushRuntimeConfigWrites();
      const response = await sendRuntimeMessage(createMemoryDeleteMessage('all'));
      if (!response.success) { setErrorText(response.error ?? '清除失败。'); return; }
      setMemory(response.payload);
      setProfileDraft(buildProfileDraft(response.payload.profile));
      setProfileDirty(false);
      resetWorkspaceState();
      await refreshConfig();
      setNoticeText('所有本地数据已清除。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '清除失败。');
    } finally {
      setBusyAction('');
    }
  }

  if (!config) {
    return <div className="tab-panel"><p className="soft-text">加载设置中...</p></div>;
  }

  const llmIsReal = config.llmProvider !== 'mock';
  const imageIsReal = config.imageMode === 'proxy';
  const avatarId = pocketAvatars[config.avatarId] ? config.avatarId : 'yunyu-main';
  const avatarMeta = pocketAvatars[avatarId];
  const currentProfile = memory?.profile ?? DEFAULT_PROFILE;

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
            disabled={Boolean(busyAction)}
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
            disabled={Boolean(busyAction)}
          />
        </div>

        <div className="settings-section">
          <label>头像风格</label>
          <div className="settings-avatar-grid">
            {pocketAvatarIds.map((candidateAvatarId) => {
              const meta = pocketAvatars[candidateAvatarId];
              const active = avatarId === candidateAvatarId;
              return (
                <button
                  key={candidateAvatarId}
                  type="button"
                  className={`avatar-card ${active ? 'avatar-card--active' : ''}`}
                  onClick={() => updateField('avatarId', candidateAvatarId as RuntimeConfig['avatarId'])}
                  disabled={Boolean(busyAction)}
                  aria-pressed={active}
                >
                  <PocketBuddyAvatar avatar={candidateAvatarId} mood={active ? 'spark' : 'warm'} size={40} />
                  <strong>{meta.name}</strong>
                  <span>{meta.usage}</span>
                </button>
              );
            })}
          </div>
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
            <p className="section-label">Persona Lab</p>
            <h2>用户画像 / 大雄画像</h2>
          </div>
          <span className="micro-status">
            {memory ? `${memory.counts.profileChanges} 次历史变化` : '等待记忆加载'}
          </span>
        </div>

        <p className="soft-text">
          这些设置会直接影响 idea 收束、记忆更新和后续的生成结果。每次保存都会留下一个画像历史快照。
        </p>

        <div className="settings-profile-summary">
          <div className="settings-profile-summary__item">
            <span className="memory-label">当前视觉偏好</span>
            <div className="token-list">
              {(currentProfile.visualLikes.length > 0 ? currentProfile.visualLikes : ['暂无']).map((item) => (
                <span key={item} className="token-chip">{item}</span>
              ))}
            </div>
          </div>
          <div className="settings-profile-summary__item">
            <span className="memory-label">当前产品偏好</span>
            <div className="token-list">
              {(currentProfile.productPreferences.length > 0 ? currentProfile.productPreferences : ['暂无']).map((item) => (
                <span key={item} className="token-chip">{item}</span>
              ))}
            </div>
          </div>
          <div className="settings-profile-summary__item">
            <span className="memory-label">当前近期主题</span>
            <div className="token-list">
              {(currentProfile.recentThemes.length > 0 ? currentProfile.recentThemes : ['暂无']).map((item) => (
                <span key={item} className="token-chip">{item}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-section">
          <label>视觉偏好</label>
          <textarea
            className="settings-input settings-textarea"
            value={profileDraft.visualLikes}
            onChange={(e) => updateProfileField('visualLikes', e.target.value)}
            placeholder="蓝白线条\n口袋感\n轻陪伴"
            disabled={Boolean(busyAction)}
          />
        </div>

        <div className="settings-section">
          <label>视觉排斥</label>
          <textarea
            className="settings-input settings-textarea"
            value={profileDraft.visualDislikes}
            onChange={(e) => updateProfileField('visualDislikes', e.target.value)}
            placeholder="太花哨\n太重科技感"
            disabled={Boolean(busyAction)}
          />
        </div>

        <div className="settings-section">
          <label>语气偏好</label>
          <input
            type="text"
            className="settings-input"
            value={profileDraft.tonePreference}
            onChange={(e) => updateProfileField('tonePreference', e.target.value)}
            placeholder="温暖、直接、产品化"
            disabled={Boolean(busyAction)}
          />
        </div>

        <div className="settings-section">
          <label>产品偏好</label>
          <textarea
            className="settings-input settings-textarea"
            value={profileDraft.productPreferences}
            onChange={(e) => updateProfileField('productPreferences', e.target.value)}
            placeholder="轻量工具\n浏览器插件"
            disabled={Boolean(busyAction)}
          />
        </div>

        <div className="settings-section">
          <label>近期主题</label>
          <textarea
            className="settings-input settings-textarea"
            value={profileDraft.recentThemes}
            onChange={(e) => updateProfileField('recentThemes', e.target.value)}
            placeholder="效率工具\n创作辅助\n学习工具"
            disabled={Boolean(busyAction)}
          />
        </div>

        <div className="inline-actions">
          <LineButton variant="primary" onClick={handleSaveProfile} disabled={!profileDirty || Boolean(busyAction) || !memory}>
            保存画像
          </LineButton>
          <LineButton variant="ghost" onClick={resetProfileDraft} disabled={!profileDirty || Boolean(busyAction)}>
            恢复当前画像
          </LineButton>
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
                disabled={Boolean(busyAction)}
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
                  disabled={Boolean(busyAction)}
                />
                <LineButton variant="ghost" onClick={() => setShowLlmKey(!showLlmKey)} disabled={Boolean(busyAction)}>
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
                disabled={Boolean(busyAction)}
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
                disabled={Boolean(busyAction)}
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
                  disabled={Boolean(busyAction)}
                />
                <LineButton variant="ghost" onClick={() => setShowImageKey(!showImageKey)} disabled={Boolean(busyAction)}>
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
                disabled={Boolean(busyAction)}
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

function buildProfileDraft(profile: UserProfile): ProfileDraft {
  return {
    visualLikes: joinProfileList(profile.visualLikes),
    visualDislikes: joinProfileList(profile.visualDislikes),
    tonePreference: profile.tonePreference,
    productPreferences: joinProfileList(profile.productPreferences),
    recentThemes: joinProfileList(profile.recentThemes),
  };
}

function joinProfileList(values: string[]): string {
  return values.join('\n');
}

function parseProfileList(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}
