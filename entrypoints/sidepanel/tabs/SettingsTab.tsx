import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';
import type { MemorySummary, ModelProfile, RuntimeConfig, UserProfile } from '@/lib/agent/types';
import {
  describeProfileHealth,
  formatEndpointHost,
  formatModelProfileSummary,
  getActiveModelProfile,
  getModelProfiles,
  maskApiKey,
} from '@/lib/agent/model-profiles';
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

interface ModelProfileDraft {
  id: string;
  name: string;
  apiKey: string;
  endpoint: string;
  model: string;
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
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() => buildProfileDraft(DEFAULT_PROFILE));
  const [profileDirty, setProfileDirty] = useState(false);

  useEffect(() => {
    if (profileDirty) return;
    setProfileDraft(buildProfileDraft(memory?.profile ?? DEFAULT_PROFILE));
  }, [memory?.profile.lastUpdated, profileDirty]);

  async function updateConfigPatch(patch: Partial<RuntimeConfig>) {
    if (!config || busyAction) return;

    const next = { ...config, ...patch };
    setConfig(next);

    try {
      await updateRuntimeConfig(patch);
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

  const avatarId = pocketAvatars[config.avatarId] ? config.avatarId : 'yunyu-main';
  const avatarMeta = pocketAvatars[avatarId];
  const currentProfile = memory?.profile ?? DEFAULT_PROFILE;
  const llmActiveProfile = getActiveModelProfile(config, 'llm');
  const imageActiveProfile = getActiveModelProfile(config, 'image');
  const llmProfiles = getModelProfiles(config, 'llm');
  const imageProfiles = getModelProfiles(config, 'image');

  return (
    <div className="tab-panel settings-panel">
      <section className="settings-cover">
        <PocketBuddyAvatar avatar={avatarId} mood="warm" size={64} />
        <div className="settings-cover__copy">
          <p className="section-label">Identity Lab</p>
          <h2>身份实验室</h2>
          <p className="soft-text">头像、语气、画像和模型配置都在这里，默认只保留真正会影响输出的内容。</p>
          <div className="settings-cover__chips">
            <span className="status-pill status-pill--mocked">{avatarMeta.name}</span>
            <span className="status-pill status-pill--approved">{llmProfiles.length} 个 LLM 档</span>
            <span className="status-pill status-pill--spark">{imageProfiles.length} 个图片档</span>
          </div>
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Identity Console</p>
            <h2>Agent 身份</h2>
          </div>
          <span className="micro-status">同步到标题和头像</span>
        </div>

        <div className="settings-section">
          <label>Agent 名称</label>
          <input
            type="text"
            className="settings-input"
            value={config.agentName}
            onChange={(e) => updateConfigPatch({ agentName: e.target.value })}
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
            onChange={(e) => updateConfigPatch({ defaultTone: e.target.value })}
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
                  onClick={() => updateConfigPatch({ avatarId: candidateAvatarId as RuntimeConfig['avatarId'] })}
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
            <h2>用户画像</h2>
          </div>
          <span className="micro-status">
            {memory ? `${memory.counts.profileChanges} 次历史变化` : '等待记忆加载'}
          </span>
        </div>

        <div className="settings-profile-summary">
          <div className="settings-profile-summary__item">
            <span className="memory-label">视觉偏好</span>
            <div className="token-list">
              {(currentProfile.visualLikes.length > 0 ? currentProfile.visualLikes : ['暂无']).map((item) => (
                <span key={item} className="token-chip">{item}</span>
              ))}
            </div>
          </div>
          <div className="settings-profile-summary__item">
            <span className="memory-label">产品偏好</span>
            <div className="token-list">
              {(currentProfile.productPreferences.length > 0 ? currentProfile.productPreferences : ['暂无']).map((item) => (
                <span key={item} className="token-chip">{item}</span>
              ))}
            </div>
          </div>
          <div className="settings-profile-summary__item">
            <span className="memory-label">近期主题</span>
            <div className="token-list">
              {(currentProfile.recentThemes.length > 0 ? currentProfile.recentThemes : ['暂无']).map((item) => (
                <span key={item} className="token-chip">{item}</span>
              ))}
            </div>
          </div>
        </div>

        <details className="settings-advanced">
          <summary className="settings-advanced__summary">
            <span>编辑画像细项</span>
            <span className="micro-status">折叠</span>
          </summary>
          <div className="settings-advanced__body">
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
          </div>
        </details>
      </section>

      <ModelProfileSection
        kind="llm"
        sectionLabel="LLM Profile Deck"
        title="LLM 配置档"
        summary="默认激活真实模型，必要时再切换到别的档。"
        profiles={llmProfiles}
        activeProfile={llmActiveProfile}
        activeProfileId={config.activeLlmProfileId}
        busyAction={busyAction}
        disabled={Boolean(busyAction)}
        onUpdate={updateConfigPatch}
        setErrorText={setErrorText}
        setNoticeText={setNoticeText}
      />

      <ModelProfileSection
        kind="image"
        sectionLabel="Image Profile Deck"
        title="图片配置档"
        summary="这里直接连到真实生图端点，默认只保留一个最常用档。"
        profiles={imageProfiles}
        activeProfile={imageActiveProfile}
        activeProfileId={config.activeImageProfileId}
        busyAction={busyAction}
        disabled={Boolean(busyAction)}
        onUpdate={updateConfigPatch}
        setErrorText={setErrorText}
        setNoticeText={setNoticeText}
      />

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
        <p className="soft-text" style={{ marginTop: 4 }}>本地保存，模型配置和 API Key 也只留在本机。</p>
      </section>
    </div>
  );
}

function ModelProfileSection(props: {
  kind: 'llm' | 'image';
  sectionLabel: string;
  title: string;
  summary: string;
  profiles: ModelProfile[];
  activeProfile: ModelProfile | null;
  activeProfileId: string | null;
  busyAction: string;
  disabled: boolean;
  onUpdate: (patch: Partial<RuntimeConfig>) => Promise<void>;
  setErrorText: Dispatch<SetStateAction<string>>;
  setNoticeText: Dispatch<SetStateAction<string>>;
}) {
  const {
    kind,
    sectionLabel,
    title,
    summary,
    profiles,
    activeProfile,
    activeProfileId,
    busyAction,
    disabled,
    onUpdate,
    setErrorText,
    setNoticeText,
  } = props;

  const [selectedId, setSelectedId] = useState<string>(activeProfile?.id ?? profiles[0]?.id ?? '');
  const [draft, setDraft] = useState<ModelProfileDraft>(() => createProfileDraft(kind, activeProfile ?? profiles[0] ?? null));
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const current = profiles.find((profile) => profile.id === selectedId)
      ?? activeProfile
      ?? profiles[0]
      ?? null;
    if (!current) return;
    if (current.id !== selectedId) {
      setSelectedId(current.id);
    }
    setDraft(profileToDraft(current));
  }, [activeProfile, profiles, selectedId]);

  async function handleSave() {
    if (disabled) return;

    const nextProfile: ModelProfile = {
      id: draft.id,
      name: draft.name.trim() || defaultProfileName(kind),
      apiKey: draft.apiKey.trim(),
      endpoint: draft.endpoint.trim(),
      model: draft.model.trim(),
    };
    const exists = profiles.some((profile) => profile.id === nextProfile.id);
    const nextProfiles = exists
      ? profiles.map((profile) => (profile.id === nextProfile.id ? nextProfile : profile))
      : [...profiles, nextProfile];
    const nextActiveId = activeProfileId && nextProfiles.some((profile) => profile.id === activeProfileId)
      ? activeProfileId
      : nextProfiles[0]?.id ?? nextProfile.id;

    setErrorText('');
    try {
      await onUpdate(kind === 'llm'
        ? { llmProfiles: nextProfiles, activeLlmProfileId: nextActiveId }
        : { imageProfiles: nextProfiles, activeImageProfileId: nextActiveId });
      setSelectedId(nextProfile.id);
      setDraft(profileToDraft(nextProfile));
      setNoticeText(`${title}已保存。`);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : `${title}保存失败`);
    }
  }

  async function handleActivate() {
    if (disabled || !draft.id) return;
    try {
      await onUpdate(kind === 'llm'
        ? { activeLlmProfileId: draft.id }
        : { activeImageProfileId: draft.id });
      setNoticeText(`${title}已切换为活跃档。`);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : `${title}切换失败`);
    }
  }

  async function handleDuplicate() {
    if (disabled) return;
    const seed = profiles.find((profile) => profile.id === selectedId) ?? activeProfile ?? profiles[0] ?? null;
    const copy = createProfileDraft(kind, seed);
    const duplicate: ModelProfile = {
      id: copy.id,
      name: copy.name,
      apiKey: copy.apiKey,
      endpoint: copy.endpoint,
      model: copy.model,
    };
    const nextProfiles = [...profiles, duplicate];
    try {
      await onUpdate(kind === 'llm'
        ? { llmProfiles: nextProfiles, activeLlmProfileId: activeProfileId }
        : { imageProfiles: nextProfiles, activeImageProfileId: activeProfileId });
      setSelectedId(duplicate.id);
      setDraft(copy);
      setNoticeText(`${title}副本已创建。`);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : `${title}复制失败`);
    }
  }

  async function handleDelete() {
    if (disabled || profiles.length <= 1) return;
    const currentId = selectedId || activeProfileId || profiles[0]?.id;
    if (!currentId) return;
    const remaining = profiles.filter((profile) => profile.id !== currentId);
    const nextActiveId = remaining.some((profile) => profile.id === activeProfileId)
      ? activeProfileId
      : remaining[0]?.id ?? null;
    try {
      await onUpdate(kind === 'llm'
        ? { llmProfiles: remaining, activeLlmProfileId: nextActiveId }
        : { imageProfiles: remaining, activeImageProfileId: nextActiveId });
      const nextSelection = remaining.find((profile) => profile.id === nextActiveId) ?? remaining[0] ?? null;
      if (nextSelection) {
        setSelectedId(nextSelection.id);
        setDraft(profileToDraft(nextSelection));
      }
      setNoticeText(`${title}已删除。`);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : `${title}删除失败`);
    }
  }

  function handleResetDraft() {
    const current = profiles.find((profile) => profile.id === selectedId) ?? activeProfile ?? profiles[0] ?? null;
    if (!current) return;
    setDraft(profileToDraft(current));
    setShowKey(false);
  }

  const selectionBadges = [
    `${profiles.length} 个档`,
    activeProfile ? `${activeProfile.model || '未命名模型'}` : '未激活',
    activeProfile ? formatEndpointHost(activeProfile.endpoint) : '未配置端点',
  ];

  return (
    <section className="panel-card model-profile-card">
      <div className="panel-head">
        <div>
          <p className="section-label">{sectionLabel}</p>
          <h2>{title}</h2>
          <p className="soft-text">{summary}</p>
        </div>
        <span className={`status-pill status-pill--${activeProfile ? 'approved' : 'mocked'}`}>
          {describeProfileHealth(activeProfile)}
        </span>
      </div>

      <div className="profile-summary-row">
        {selectionBadges.map((badge) => (
          <span key={badge} className="token-chip">{badge}</span>
        ))}
      </div>

      <div className="profile-rail" role="tablist" aria-label={`${title} 配置档`}>
        {profiles.map((profile) => {
          const active = profile.id === activeProfileId;
          const selected = profile.id === selectedId;
          return (
            <button
              key={profile.id}
              type="button"
              className={`profile-rail__chip ${selected ? 'profile-rail__chip--selected' : ''} ${active ? 'profile-rail__chip--active' : ''}`}
              onClick={() => {
                setSelectedId(profile.id);
                setDraft(profileToDraft(profile));
                setShowKey(false);
              }}
              disabled={disabled}
              aria-pressed={selected}
            >
              <strong>{profile.name || defaultProfileName(kind)}</strong>
              <span>{formatModelProfileSummary(profile)}</span>
            </button>
          );
        })}
      </div>

      <div className="profile-metrics">
        <div className="profile-metric">
          <span className="memory-label">当前档</span>
          <strong>{draft.name || defaultProfileName(kind)}</strong>
        </div>
        <div className="profile-metric">
          <span className="memory-label">模型</span>
          <strong>{draft.model || '未配置'}</strong>
        </div>
        <div className="profile-metric">
          <span className="memory-label">端点</span>
          <strong>{formatEndpointHost(draft.endpoint)}</strong>
        </div>
        <div className="profile-metric">
          <span className="memory-label">密钥</span>
          <strong>{maskApiKey(draft.apiKey)}</strong>
        </div>
      </div>

      <div className="profile-editor">
        <div className="settings-section">
          <label>配置档名称</label>
          <input
            type="text"
            className="settings-input"
            value={draft.name}
            onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
            placeholder={defaultProfileName(kind)}
            disabled={disabled}
          />
        </div>

        <div className="settings-section">
          <label>模型名</label>
          <input
            type="text"
            className="settings-input"
            value={draft.model}
            onChange={(e) => setDraft((current) => ({ ...current, model: e.target.value }))}
            placeholder={kind === 'llm' ? 'MiniMax-M3' : 'gpt-image-2'}
            disabled={disabled}
          />
        </div>

        <div className="settings-section">
          <label>API 端点</label>
          <input
            type="text"
            className="settings-input"
            value={draft.endpoint}
            onChange={(e) => setDraft((current) => ({ ...current, endpoint: e.target.value }))}
            placeholder={kind === 'llm'
              ? 'https://api.minimaxi.com/anthropic'
              : 'https://api.apimart.ai/v1/images/generations'}
            disabled={disabled}
          />
        </div>

        <div className="settings-section">
          <label>API Key</label>
          <div className="inline-field">
            <input
              type={showKey ? 'text' : 'password'}
              className="settings-input"
              style={{ flex: 1 }}
              value={draft.apiKey}
              onChange={(e) => setDraft((current) => ({ ...current, apiKey: e.target.value }))}
              placeholder="sk-..."
              disabled={disabled}
            />
            <LineButton variant="ghost" onClick={() => setShowKey((current) => !current)} disabled={disabled}>
              {showKey ? '隐藏' : '显示'}
            </LineButton>
          </div>
        </div>
      </div>

      <div className="inline-actions">
        <LineButton variant="primary" onClick={handleSave} disabled={disabled}>
          保存档
        </LineButton>
        <LineButton variant="ghost" onClick={handleActivate} disabled={disabled}>
          设为活跃
        </LineButton>
        <LineButton variant="ghost" onClick={handleDuplicate} disabled={disabled}>
          复制一档
        </LineButton>
        <LineButton variant="ghost" onClick={handleDelete} disabled={disabled || profiles.length <= 1}>
          删除当前
        </LineButton>
        <LineButton variant="ghost" onClick={handleResetDraft} disabled={disabled}>
          恢复选中
        </LineButton>
      </div>
    </section>
  );
}

function createProfileDraft(kind: 'llm' | 'image', seed: ModelProfile | null): ModelProfileDraft {
  if (seed) {
    return {
      id: crypto.randomUUID(),
      name: `${seed.name || defaultProfileName(kind)} 副本`,
      apiKey: seed.apiKey,
      endpoint: seed.endpoint,
      model: seed.model,
    };
  }

  return kind === 'llm'
    ? {
        id: crypto.randomUUID(),
        name: 'MiniMax 副本',
        apiKey: '',
        endpoint: 'https://api.minimaxi.com/anthropic',
        model: 'MiniMax-M3',
      }
    : {
        id: crypto.randomUUID(),
        name: 'GPT Image 副本',
        apiKey: '',
        endpoint: 'https://api.apimart.ai/v1/images/generations',
        model: 'gpt-image-2',
      };
}

function profileToDraft(profile: ModelProfile): ModelProfileDraft {
  return {
    id: profile.id,
    name: profile.name,
    apiKey: profile.apiKey,
    endpoint: profile.endpoint,
    model: profile.model,
  };
}

function defaultProfileName(kind: 'llm' | 'image'): string {
  return kind === 'llm' ? 'LLM 配置档' : '图片配置档';
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
