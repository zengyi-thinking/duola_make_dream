import { useEffect, useState } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';
import type { MemorySummary, ModelProfile, RuntimeConfig, UserProfile } from '@/lib/agent/types';
import type { SkillDefinition } from '@/lib/skills/types';
import { createToolDefinition, labelToolCategory, type ToolDefinition } from '@/lib/tools/types';
import {
  describeProfileHealth,
  formatEndpointHost,
  formatModelProfileSummary,
  getActiveModelProfile,
  getModelProfiles,
  maskApiKey,
} from '@/lib/agent/model-profiles';
import { pocketAvatarIds, pocketAvatars, type PocketAvatarId } from '@/lib/brand/avatars';
import { getVoice } from '@/lib/agent/voices';
import { saveProfile } from '@/lib/memory';
import {
  createMemoryDeleteMessage,
  createPocketModelTestMessage,
  createPocketSkillListMessage,
  createPocketToolDeleteMessage,
  createPocketToolListMessage,
  createPocketToolSaveMessage,
  createPocketToolToggleMessage,
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
  creativeBrief: string;
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
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [toolDraft, setToolDraft] = useState<{ name: string; description: string; promptHint: string }>({ name: '', description: '', promptHint: '' });
  const [showToolForm, setShowToolForm] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState('');
  const [voiceDirty, setVoiceDirty] = useState(false);

  useEffect(() => {
    if (profileDirty) return;
    setProfileDraft(buildProfileDraft(memory?.profile ?? DEFAULT_PROFILE));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memory?.profile]);

  useEffect(() => {
    void loadSkills();
    void loadTools();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (voiceDirty) return;
    const aid = config?.avatarId ?? 'yunyu-main';
    setVoiceDraft(config?.voiceOverrides?.[aid] ?? getVoice(aid).personaPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.avatarId, config?.voiceOverrides, voiceDirty]);

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

  async function loadTools() {
    try {
      const response = await sendRuntimeMessage(createPocketToolListMessage());
      if (response.success) setTools(response.payload.tools);
    } catch {
      // 静默
    }
  }

  async function handleToggleTool(toolId: string, enabled: boolean) {
    setTools((cur) => cur.map((t) => (t.id === toolId ? { ...t, enabled } : t)));
    try {
      const response = await sendRuntimeMessage(createPocketToolToggleMessage(toolId, enabled));
      if (response.success) setTools(response.payload.tools);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '切换工具失败');
    }
  }

  async function handleCreateTool() {
    if (!toolDraft.name.trim()) { setErrorText('工具名称不能为空'); return; }
    const tool = createToolDefinition({
      name: toolDraft.name.trim(),
      emoji: '🛠️',
      description: toolDraft.description.trim() || '用户自定义工具',
      category: 'custom',
      enabled: true,
      builtIn: false,
      promptHint: toolDraft.promptHint.trim() || undefined,
    });
    try {
      const response = await sendRuntimeMessage(createPocketToolSaveMessage(tool));
      if (response.success) {
        setTools(response.payload.tools);
        setToolDraft({ name: '', description: '', promptHint: '' });
        setShowToolForm(false);
        setNoticeText('工具已创建。');
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '创建工具失败');
    }
  }

  async function handleDeleteTool(toolId: string) {
    try {
      const response = await sendRuntimeMessage(createPocketToolDeleteMessage(toolId));
      if (response.success) setTools(response.payload.tools);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '删除工具失败');
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
      const base = memory.profile ?? DEFAULT_PROFILE;
      const nextProfile: UserProfile = {
        ...base,
        creativeBrief: profileDraft.creativeBrief.trim(),
        lastUpdated: Date.now(),
      };
      await saveProfile(nextProfile, 'manual');
      await refreshMemory();
      setProfileDirty(false);
      setNoticeText('创作画像已保存。');
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

  async function handleSaveVoice() {
    if (!config || busyAction) return;
    const aid = config.avatarId;
    const overrides: RuntimeConfig['voiceOverrides'] = { ...(config.voiceOverrides ?? {}) };
    const trimmed = voiceDraft.trim();
    if (trimmed && trimmed !== getVoice(aid).personaPrompt) {
      overrides[aid] = trimmed;
    } else {
      delete overrides[aid];
    }
    await updateConfigPatch({ voiceOverrides: overrides });
    setVoiceDirty(false);
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
                  onClick={() => { setVoiceDirty(false); updateConfigPatch({ avatarId: candidateAvatarId as RuntimeConfig['avatarId'] }); }}
                  disabled={Boolean(busyAction)}
                  aria-pressed={active}
                >
                  <PocketBuddyAvatar avatar={candidateAvatarId} mood={active ? 'spark' : 'warm'} size={40} />
                  <strong>{meta.name}</strong>
                  <span>{describeAvatarStyle(candidateAvatarId)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="settings-section">
          <label>人格设定 · {getVoice(avatarId).name}</label>
          <p className="micro-copy">编辑后会覆盖该人格的默认 personaPrompt，注入到所有加工链路的 system prompt。</p>
          <textarea
            className="settings-input settings-textarea"
            value={voiceDraft}
            onChange={(e) => { setVoiceDraft(e.target.value); setVoiceDirty(true); }}
            placeholder={getVoice(avatarId).personaPrompt}
            disabled={Boolean(busyAction)}
            rows={4}
          />
          <div className="inline-actions">
            <LineButton variant="primary" onClick={handleSaveVoice} disabled={Boolean(busyAction)}>
              保存人格
            </LineButton>
            <LineButton variant="ghost" onClick={() => { setVoiceDraft(getVoice(avatarId).personaPrompt); setVoiceDirty(true); }} disabled={Boolean(busyAction)}>
              恢复默认文案
            </LineButton>
          </div>
        </div>
      </section>

      {/* 模块2：创作画像（单自由文本框，注入所有加工链路 system prompt） */}
      <section className="panel-card settings-console-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Persona Lab</p>
            <h2>创作画像</h2>
          </div>
          <span className="micro-status">{memory ? `${memory.counts.profileChanges} 次历史变化` : '等待记忆加载'}</span>
        </div>
        <div className="settings-section">
          <label>你的创作画像</label>
          <p className="micro-copy">告诉 Agent 你的领域、受众、风格与偏好。它会注入到所有加工链路（发明/喂养/生图）的 system prompt，让产出更贴合你。</p>
          <textarea
            className="settings-input settings-textarea"
            value={profileDraft.creativeBrief}
            onChange={(e) => updateProfileField('creativeBrief', e.target.value)}
            placeholder={'例如：\n· 我做面向独立开发者的效率工具，偏爱蓝白极简风\n· 受众是技术人，喜欢直接、有数据支撑的表达\n· 近期关注 AI Agent 与浏览器插件'}
            disabled={Boolean(busyAction)}
            rows={6}
          />
          <div className="inline-actions">
            <LineButton variant="primary" onClick={handleSaveProfile} disabled={!profileDirty || Boolean(busyAction) || !memory}>
              保存画像
            </LineButton>
            <LineButton variant="ghost" onClick={resetProfileDraft} disabled={!profileDirty || Boolean(busyAction)}>
              恢复当前画像
            </LineButton>
          </div>
        </div>
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

      {/* 模块5：Tool 注册表（声明式） */}
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Tool Registry</p>
            <h2>工具注册表</h2>
          </div>
          <span className="micro-status">{tools.length} 个</span>
        </div>
        <p className="micro-copy">规划/搜索/执行是内置必选工具（对应 agent 能力），可开关。自定义工具的提示词会注入加工链路，让 agent 按你的规则干活。</p>
        <div className="candidate-stack">
          {tools.map((t) => (
            <div key={t.id} className={`candidate-card${t.enabled ? '' : ' candidate-card--disabled'}`}>
              <div className="candidate-head">
                <strong>{t.emoji} {t.name}</strong>
                <span className="token-chip">{labelToolCategory(t.category)}</span>
              </div>
              <p className="soft-text">{t.description}</p>
              {t.promptHint ? <p className="micro-copy">提示词：{t.promptHint}</p> : null}
              <div className="inline-actions" style={{ marginTop: 6 }}>
                <label className="tool-toggle">
                  <input type="checkbox" checked={t.enabled} onChange={(e) => handleToggleTool(t.id, e.target.checked)} disabled={Boolean(busyAction)} />
                  <span>{t.enabled ? '已启用' : '已停用'}</span>
                </label>
                {!t.builtIn ? (
                  <LineButton variant="ghost" onClick={() => handleDeleteTool(t.id)} disabled={Boolean(busyAction)}>删除</LineButton>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {showToolForm ? (
          <div className="settings-tool-form">
            <div className="settings-section">
              <label>工具名称</label>
              <input type="text" className="settings-input" value={toolDraft.name} onChange={(e) => setToolDraft((c) => ({ ...c, name: e.target.value }))} placeholder="例如：竞品对比" disabled={Boolean(busyAction)} />
            </div>
            <div className="settings-section">
              <label>工具描述</label>
              <input type="text" className="settings-input" value={toolDraft.description} onChange={(e) => setToolDraft((c) => ({ ...c, description: e.target.value }))} placeholder="这个工具帮 agent 做什么" disabled={Boolean(busyAction)} />
            </div>
            <div className="settings-section">
              <label>提示词包（注入 agent）</label>
              <textarea className="settings-input settings-textarea" value={toolDraft.promptHint} onChange={(e) => setToolDraft((c) => ({ ...c, promptHint: e.target.value }))} placeholder="例如：分析时优先对比 3 个竞品的核心差异，给出差异化建议" rows={3} disabled={Boolean(busyAction)} />
            </div>
            <div className="inline-actions">
              <LineButton variant="primary" onClick={handleCreateTool} disabled={Boolean(busyAction)}>创建工具</LineButton>
              <LineButton variant="ghost" onClick={() => setShowToolForm(false)} disabled={Boolean(busyAction)}>取消</LineButton>
            </div>
          </div>
        ) : (
          <div className="inline-actions" style={{ marginTop: 8 }}>
            <LineButton variant="ghost" onClick={() => setShowToolForm(true)} disabled={Boolean(busyAction)}>+ 让 agent 创建新工具</LineButton>
          </div>
        )}
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
      // 保存后自动测连通性（apiKey + endpoint 齐全才测）
      if (nextProfile.apiKey.trim() && nextProfile.endpoint.trim()) {
        setNoticeText(`${title}已保存，正在测试连通性…`);
        await onTest(kind, nextProfile.id);
      } else {
        setNoticeText(`${title}已保存。`);
      }
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
    creativeBrief: profile.creativeBrief ?? '',
  };
}

/** 四人格风格标签（用于 avatar 卡片） */
function describeAvatarStyle(avatarId: PocketAvatarId): string {
  switch (getVoice(avatarId).outputStyle) {
    case 'divergent': return '探索发散型';
    case 'warm': return '温暖陪伴型';
    case 'focused': return '聚焦落地型';
    case 'rigorous': return '严谨学者型';
    default: return getVoice(avatarId).name;
  }
}
