import { useEffect, useState } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';
import type { MemorySummary, ModelProfile, RuntimeConfig, UserProfile } from '@/lib/agent/types';
import type { SkillDefinition } from '@/lib/skills/types';
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
import {
  createMemoryDeleteMessage,
  createPocketModelTestMessage,
  createPocketSkillListMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import { flushRuntimeConfigWrites, updateRuntimeConfig } from '@/lib/storage/local';
import { DEFAULT_PROFILE } from '@/lib/storage/schema';
import { useToast } from '../context/ToastContext';
import { useBusy } from '../context/BusyContext';
import { useMemory } from '../context/MemoryContext';
import { useRuntimeConfig } from '../context/RuntimeConfigContext';
import { useWorkspace } from '../context/WorkspaceContext';

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

/**
 * 设置页（演进式重建自 SettingsTab）：5 模块——身份 / 用户画像 / 模型档 / Skill / Tool。
 *
 * 相对旧 SettingsTab 的变化：
 * - props 全部改走 Context（RuntimeConfig/Memory/Toast/Busy/Workspace）
 * - 模型档新增「测试连接」按钮（pocket.model.test，真 ping）
 * - 新增 Skill 注册表面板（pocket.skill.list）
 * - 新增 Tool 占位面板（阶段4 接入 builtin.search/plan/execute）
 */
export default function SettingsPage() {
  const { config, setConfig, refresh: refreshConfig } = useRuntimeConfig();
  const { memory, setMemory, refresh: refreshMemory } = useMemory();
  const { setErrorText, setNoticeText } = useToast();
  const { busyAction, setBusyAction } = useBusy();
  const { refreshArtifacts, refreshImages } = useWorkspace();

  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() => buildProfileDraft(DEFAULT_PROFILE));
  const [profileDirty, setProfileDirty] = useState(false);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);

  useEffect(() => {
    if (profileDirty) return;
    setProfileDraft(buildProfileDraft(memory?.profile ?? DEFAULT_PROFILE));
  }, [memory?.profile.lastUpdated, profileDirty]);

  useEffect(() => {
    void loadSkills();
  }, []);

  async function loadSkills() {
    try {
      const response = await sendRuntimeMessage(createPocketSkillListMessage());
      if (response.success) {
        setSkills(response.payload.skills);
        setMemory(response.payload.memorySummary);
      }
    } catch {
      // 静默：skill 系统阶段4 才完善，加载失败不阻塞设置页
    }
  }

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

  async function handleTestConnection(kind: 'llm' | 'image', profileId: string) {
    if (busyAction || !profileId) return;
    setBusyAction(`test-${kind}`);
    setErrorText('');
    try {
      const response = await sendRuntimeMessage(createPocketModelTestMessage(kind, profileId));
      if (!response.success) { setErrorText(response.error ?? '测试失败。'); return; }
      const r = response.payload;
      if (r.ok) {
        setNoticeText(`${kind === 'llm' ? 'LLM' : '图片'} 连接成功（${r.latencyMs}ms）。`);
      } else {
        setErrorText(`连接失败：${r.error ?? `HTTP ${r.status}`}`);
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '测试失败。');
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
      await refreshConfig();
      await refreshArtifacts();
      await refreshImages();
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
          <p className="soft-text">只保留会影响输出的配置。</p>
          <div className="settings-cover__chips">
            <span className="status-pill status-pill--mocked">{avatarMeta.name}</span>
            <span className="status-pill status-pill--approved">{llmProfiles.length} 个 LLM 档</span>
            <span className="status-pill status-pill--spark">{imageProfiles.length} 个图片档</span>
          </div>
        </div>
      </section>

      {/* 模块1：身份 */}
      <section className="panel-card settings-console-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Identity Console</p>
            <h2>Agent 身份</h2>
          </div>
          <span className="micro-status">同步到标题和头像</span>
        </div>
        <div className="settings-console-grid">
          <div className="settings-field">
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
          <div className="settings-field">
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
        </div>
        <div className="settings-section">
          <label>头像风格（四人格）</label>
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
      </section>

      {/* 模块2：用户画像 */}
      <section className="panel-card settings-console-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Persona Lab</p>
            <h2>用户画像</h2>
          </div>
          <span className="micro-status">{memory ? `${memory.counts.profileChanges} 次历史变化` : '等待记忆加载'}</span>
        </div>
        <div className="signal-chip-row settings-profile-summary__chips">
          <span className="signal-chip">{(memory?.profile ?? DEFAULT_PROFILE).visualLikes.length} 视觉偏好</span>
          <span className="signal-chip">{(memory?.profile ?? DEFAULT_PROFILE).productPreferences.length} 产品偏好</span>
          <span className="signal-chip">{(memory?.profile ?? DEFAULT_PROFILE).recentThemes.length} 近期主题</span>
        </div>
        <details className="settings-advanced">
          <summary className="settings-advanced__summary">
            <span>编辑画像细项</span>
            <span className="micro-status">折叠</span>
          </summary>
          <div className="settings-advanced__body">
            <div className="settings-section">
              <label>视觉偏好</label>
              <textarea className="settings-input settings-textarea" value={profileDraft.visualLikes}
                onChange={(e) => updateProfileField('visualLikes', e.target.value)} placeholder="蓝白线条&#10;口袋感" disabled={Boolean(busyAction)} />
            </div>
            <div className="settings-section">
              <label>视觉排斥</label>
              <textarea className="settings-input settings-textarea" value={profileDraft.visualDislikes}
                onChange={(e) => updateProfileField('visualDislikes', e.target.value)} placeholder="太花哨" disabled={Boolean(busyAction)} />
            </div>
            <div className="settings-section">
              <label>语气偏好</label>
              <input type="text" className="settings-input" value={profileDraft.tonePreference}
                onChange={(e) => updateProfileField('tonePreference', e.target.value)} placeholder="温暖、直接、产品化" disabled={Boolean(busyAction)} />
            </div>
            <div className="settings-section">
              <label>产品偏好</label>
              <textarea className="settings-input settings-textarea" value={profileDraft.productPreferences}
                onChange={(e) => updateProfileField('productPreferences', e.target.value)} placeholder="轻量工具&#10;浏览器插件" disabled={Boolean(busyAction)} />
            </div>
            <div className="settings-section">
              <label>近期主题</label>
              <textarea className="settings-input settings-textarea" value={profileDraft.recentThemes}
                onChange={(e) => updateProfileField('recentThemes', e.target.value)} placeholder="效率工具&#10;创作辅助" disabled={Boolean(busyAction)} />
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

      {/* 模块3：模型配置档（含连接测试） */}
      <ModelProfileSection
        kind="llm"
        sectionLabel="LLM Profile Deck"
        title="LLM 配置档"
        profiles={llmProfiles}
        activeProfile={llmActiveProfile}
        activeProfileId={config.activeLlmProfileId}
        busyAction={busyAction}
        disabled={Boolean(busyAction)}
        onUpdate={updateConfigPatch}
        onTest={handleTestConnection}
        setErrorText={setErrorText}
        setNoticeText={setNoticeText}
      />
      <ModelProfileSection
        kind="image"
        sectionLabel="Image Profile Deck"
        title="图片配置档"
        profiles={imageProfiles}
        activeProfile={imageActiveProfile}
        activeProfileId={config.activeImageProfileId}
        busyAction={busyAction}
        disabled={Boolean(busyAction)}
        onUpdate={updateConfigPatch}
        onTest={handleTestConnection}
        setErrorText={setErrorText}
        setNoticeText={setNoticeText}
      />

      {/* 模块4：Skill 注册表 */}
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Skill Registry</p>
            <h2>技能注册表</h2>
          </div>
          <span className="micro-status">{skills.length} 个</span>
        </div>
        {skills.length > 0 ? (
          <div className="candidate-stack">
            {skills.map((s) => (
              <div key={s.id} className="candidate-card">
                <div className="candidate-head">
                  <strong>{s.emoji} {s.name}</strong>
                  <span className="token-chip">{s.category}</span>
                </div>
                <p className="soft-text">{s.description}</p>
                <p className="micro-copy">{s.inputs.length} 个参数 · {s.builtIn ? '内置' : '自定义'}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="soft-text">暂无技能。阶段4 会接入内置 skill（图片生成/页面提取/图谱/归档等）。</p>
        )}
      </section>

      {/* 模块5：Tool 注册表（占位） */}
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Tool Registry</p>
            <h2>工具注册表</h2>
          </div>
        </div>
        <p className="soft-text">工具系统将在阶段4 接入：builtin.search / builtin.plan / builtin.execute，以及用户自定义工具注册。</p>
      </section>

      {/* 数据管理 */}
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
  profiles: ModelProfile[];
  activeProfile: ModelProfile | null;
  activeProfileId: string | null;
  busyAction: string;
  disabled: boolean;
  onUpdate: (patch: Partial<RuntimeConfig>) => Promise<void>;
  onTest: (kind: 'llm' | 'image', profileId: string) => Promise<void>;
  setErrorText: (t: string) => void;
  setNoticeText: (t: string) => void;
}) {
  const { kind, sectionLabel, title, profiles, activeProfile, activeProfileId, disabled, onUpdate, onTest, setErrorText, setNoticeText } = props;

  const [selectedId, setSelectedId] = useState<string>(activeProfile?.id ?? profiles[0]?.id ?? '');
  const [draft, setDraft] = useState<ModelProfileDraft>(() => profileToDraft(activeProfile ?? profiles[0] ?? createProfileDraft(kind, null)));
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    const current = profiles.find((p) => p.id === selectedId) ?? activeProfile ?? profiles[0] ?? null;
    if (!current) return;
    if (current.id !== selectedId) setSelectedId(current.id);
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
    const exists = profiles.some((p) => p.id === nextProfile.id);
    const nextProfiles = exists ? profiles.map((p) => (p.id === nextProfile.id ? nextProfile : p)) : [...profiles, nextProfile];
    const nextActiveId = activeProfileId && nextProfiles.some((p) => p.id === activeProfileId) ? activeProfileId : nextProfiles[0]?.id ?? nextProfile.id;
    setErrorText('');
    try {
      await onUpdate(kind === 'llm' ? { llmProfiles: nextProfiles, activeLlmProfileId: nextActiveId } : { imageProfiles: nextProfiles, activeImageProfileId: nextActiveId });
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
      await onUpdate(kind === 'llm' ? { activeLlmProfileId: draft.id } : { activeImageProfileId: draft.id });
      setNoticeText(`${title}已切换为活跃档。`);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : `${title}切换失败`);
    }
  }

  async function handleDuplicate() {
    if (disabled) return;
    const copy = createProfileDraft(kind, profiles.find((p) => p.id === selectedId) ?? activeProfile ?? profiles[0] ?? null);
    const duplicate: ModelProfile = { id: copy.id, name: copy.name, apiKey: copy.apiKey, endpoint: copy.endpoint, model: copy.model };
    const nextProfiles = [...profiles, duplicate];
    try {
      await onUpdate(kind === 'llm' ? { llmProfiles: nextProfiles, activeLlmProfileId: activeProfileId } : { imageProfiles: nextProfiles, activeImageProfileId: activeProfileId });
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
    const remaining = profiles.filter((p) => p.id !== currentId);
    const nextActiveId = remaining.some((p) => p.id === activeProfileId) ? activeProfileId : remaining[0]?.id ?? null;
    try {
      await onUpdate(kind === 'llm' ? { llmProfiles: remaining, activeLlmProfileId: nextActiveId } : { imageProfiles: remaining, activeImageProfileId: nextActiveId });
      const nextSelection = remaining.find((p) => p.id === nextActiveId) ?? remaining[0] ?? null;
      if (nextSelection) { setSelectedId(nextSelection.id); setDraft(profileToDraft(nextSelection)); }
      setNoticeText(`${title}已删除。`);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : `${title}删除失败`);
    }
  }

  return (
    <section className="panel-card model-profile-card">
      <div className="panel-head">
        <div>
          <p className="section-label">{sectionLabel}</p>
          <h2>{title}</h2>
        </div>
        <span className={`status-pill status-pill--${activeProfile ? 'approved' : 'mocked'}`}>
          {describeProfileHealth(activeProfile)}
        </span>
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
              onClick={() => { setSelectedId(profile.id); setDraft(profileToDraft(profile)); setShowKey(false); }}
              disabled={disabled}
              aria-pressed={selected}
            >
              <strong>{profile.name || defaultProfileName(kind)}</strong>
              <span>{formatModelProfileSummary(profile)}</span>
            </button>
          );
        })}
      </div>

      <div className="profile-editor__grid">
        <div className="settings-field">
          <label>配置档名称</label>
          <input type="text" className="settings-input" value={draft.name}
            onChange={(e) => setDraft((c) => ({ ...c, name: e.target.value }))} placeholder={defaultProfileName(kind)} disabled={disabled} />
        </div>
        <div className="settings-field">
          <label>模型名</label>
          <input type="text" className="settings-input" value={draft.model}
            onChange={(e) => setDraft((c) => ({ ...c, model: e.target.value }))}
            placeholder={kind === 'llm' ? 'MiniMax-M3' : 'gpt-image-2'} disabled={disabled} />
        </div>
        <div className="settings-field">
          <label>API 端点</label>
          <input type="text" className="settings-input" value={draft.endpoint}
            onChange={(e) => setDraft((c) => ({ ...c, endpoint: e.target.value }))}
            placeholder={kind === 'llm' ? 'https://api.minimaxi.com/anthropic' : 'https://api.apimart.ai/v1/images/generations'} disabled={disabled} />
        </div>
        <div className="settings-field">
          <label>API Key</label>
          <div className="inline-field inline-field--compact">
            <input type={showKey ? 'text' : 'password'} className="settings-input" style={{ flex: 1, minWidth: 0 }}
              value={draft.apiKey} onChange={(e) => setDraft((c) => ({ ...c, apiKey: e.target.value }))}
              placeholder="sk-..." disabled={disabled} />
            <LineButton variant="ghost" onClick={() => setShowKey((c) => !c)} disabled={disabled}>{showKey ? '隐藏' : '显示'}</LineButton>
          </div>
        </div>
      </div>

      <div className="inline-actions">
        <LineButton variant="primary" onClick={handleSave} disabled={disabled}>保存档</LineButton>
        <LineButton variant="ghost" onClick={handleActivate} disabled={disabled}>设为活跃</LineButton>
        <LineButton variant="ghost" onClick={() => onTest(kind, draft.id)} disabled={disabled || !draft.apiKey.trim()}>
          测试连接
        </LineButton>
        <LineButton variant="ghost" onClick={handleDuplicate} disabled={disabled}>复制一档</LineButton>
        <LineButton variant="ghost" onClick={handleDelete} disabled={disabled || profiles.length <= 1}>删除当前</LineButton>
      </div>
      <p className="micro-copy" style={{ marginTop: 4 }}>
        密钥：{maskApiKey(draft.apiKey)} · 端点：{formatEndpointHost(draft.endpoint)}
      </p>
    </section>
  );
}

function createProfileDraft(kind: 'llm' | 'image', seed: ModelProfile | null): ModelProfileDraft {
  if (seed) {
    return { id: crypto.randomUUID(), name: `${seed.name || defaultProfileName(kind)} 副本`, apiKey: seed.apiKey, endpoint: seed.endpoint, model: seed.model };
  }
  return kind === 'llm'
    ? { id: crypto.randomUUID(), name: 'MiniMax 副本', apiKey: '', endpoint: 'https://api.minimaxi.com/anthropic', model: 'MiniMax-M3' }
    : { id: crypto.randomUUID(), name: 'GPT Image 副本', apiKey: '', endpoint: 'https://api.apimart.ai/v1/images/generations', model: 'gpt-image-2' };
}

function profileToDraft(profile: ModelProfile): ModelProfileDraft {
  return { id: profile.id, name: profile.name, apiKey: profile.apiKey, endpoint: profile.endpoint, model: profile.model };
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
  return Array.from(new Set(value.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean)));
}
