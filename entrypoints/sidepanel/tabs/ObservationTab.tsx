import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';
import AnimatedTree from '@/components/AnimatedTree/AnimatedTree';
import type {
  HarnessPatch,
  MemorySummary,
  ProfileHistoryEntry,
  RuntimeConfig,
  ProductArtifact,
} from '@/lib/agent/types';
import { compareGeneratedImages, compareProductArtifacts, compareStateBackups } from '@/lib/agent/insights';
import type { GeneratedImageRecord } from '@/lib/image/types';
import type { StateBackup } from '@/lib/storage/schema';
import { pocketAvatars } from '@/lib/brand/avatars';
import {
  createImageDeleteMessage,
  createMemoryDeleteMessage,
  createMindmapDeleteMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import { flushRuntimeConfigWrites, restoreStateBackup, saveStateBackup } from '@/lib/storage/local';

interface ObservationTabProps {
  memory: MemorySummary | null;
  runtimeConfig: RuntimeConfig | null;
  artifactHistory: ProductArtifact[];
  imageHistory: GeneratedImageRecord[];
  busyAction: string;
  setBusyAction: Dispatch<SetStateAction<string>>;
  setErrorText: Dispatch<SetStateAction<string>>;
  setNoticeText: Dispatch<SetStateAction<string>>;
  refreshWorkspace: () => Promise<void>;
  resetWorkspaceState: () => void;
  onCopy: (text: string, successText: string) => void;
}

type TimelineKind = 'idea' | 'artifact' | 'feedback' | 'profile' | 'backup' | 'patch';

interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  title: string;
  detail: string;
  createdAt: number;
  badgeLabel: string;
}

const FEEDBACK_LABELS: Record<string, string> = {
  'more-minimal': '更极简',
  'cuter': '更可爱',
  'more-productized': '更产品化',
  'more-tech': '更有科技感',
  'dislike-direction': '不喜欢当前方向',
};

export default function ObservationTab(props: ObservationTabProps) {
  const {
    memory, runtimeConfig, artifactHistory, imageHistory, busyAction, setBusyAction,
    setErrorText, setNoticeText, refreshWorkspace, resetWorkspaceState, onCopy,
  } = props;

  const [backupLabel, setBackupLabel] = useState('手动快照');
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [artifactCompareLeftId, setArtifactCompareLeftId] = useState('');
  const [artifactCompareRightId, setArtifactCompareRightId] = useState('');
  const [imageCompareLeftId, setImageCompareLeftId] = useState('');
  const [imageCompareRightId, setImageCompareRightId] = useState('');

  const avatarId = runtimeConfig?.avatarId ?? 'yunyu-main';
  const avatarMeta = pocketAvatars[avatarId];

  const timelineEntries = useMemo(() => buildTimeline(memory), [memory]);
  const effectiveArtifactHistory = artifactHistory.length > 0
    ? artifactHistory
    : (memory?.recentArtifacts ?? []);
  const effectiveImageHistory = imageHistory.length > 0
    ? imageHistory
    : (memory?.generatedImages ?? []);
  const latestBackups = memory?.stateBackups ?? [];

  const artifactComparison = useMemo(() => {
    const left = effectiveArtifactHistory.find((item) => item.id === artifactCompareLeftId) ?? effectiveArtifactHistory[0];
    const right = effectiveArtifactHistory.find((item) => item.id === artifactCompareRightId)
      ?? effectiveArtifactHistory[1]
      ?? effectiveArtifactHistory[0];
    if (!left || !right || left.id === right.id) return null;
    return compareProductArtifacts(left, right);
  }, [artifactCompareLeftId, artifactCompareRightId, effectiveArtifactHistory]);

  const imageComparison = useMemo(() => {
    const left = effectiveImageHistory.find((item) => item.id === imageCompareLeftId) ?? effectiveImageHistory[0];
    const right = effectiveImageHistory.find((item) => item.id === imageCompareRightId)
      ?? effectiveImageHistory[1]
      ?? effectiveImageHistory[0];
    if (!left || !right || left.id === right.id) return null;
    return compareGeneratedImages(left, right);
  }, [effectiveImageHistory, imageCompareLeftId, imageCompareRightId]);

  const backupComparison = useMemo(() => {
    if (latestBackups.length < 2) return null;
    return compareStateBackups(latestBackups[0], latestBackups[1]);
  }, [latestBackups]);

  useEffect(() => {
    if (effectiveArtifactHistory.length > 1) {
      if (!effectiveArtifactHistory.some((item) => item.id === artifactCompareLeftId)) {
        setArtifactCompareLeftId(effectiveArtifactHistory[0].id);
      }
      if (!effectiveArtifactHistory.some((item) => item.id === artifactCompareRightId)) {
        setArtifactCompareRightId(effectiveArtifactHistory[1].id);
      }
    }
  }, [artifactCompareLeftId, artifactCompareRightId, effectiveArtifactHistory]);

  useEffect(() => {
    if (effectiveImageHistory.length > 1) {
      if (!effectiveImageHistory.some((item) => item.id === imageCompareLeftId)) {
        setImageCompareLeftId(effectiveImageHistory[0].id);
      }
      if (!effectiveImageHistory.some((item) => item.id === imageCompareRightId)) {
        setImageCompareRightId(effectiveImageHistory[1].id);
      }
    }
  }, [effectiveImageHistory, imageCompareLeftId, imageCompareRightId]);

  async function handleCreateBackup() {
    setBusyAction('backup-create');
    try {
      await flushRuntimeConfigWrites();
      const backup = await saveStateBackup(backupLabel.trim() || '手动快照');
      setNoticeText(`已创建快照：${backup.label}`);
      await refreshWorkspace();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '创建快照失败');
    } finally {
      setBusyAction('');
    }
  }

  async function handleRestoreBackup(backupId: string) {
    if (confirmRestoreId !== backupId) {
      setConfirmRestoreId(backupId);
      return;
    }

    setBusyAction(`backup-restore-${backupId}`);
    try {
      await flushRuntimeConfigWrites();
      const restored = await restoreStateBackup(backupId);
      setNoticeText('已恢复快照，当前状态已回滚。');
      resetWorkspaceState();
      await refreshWorkspace();
      if (restored) {
        setConfirmRestoreId(null);
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '恢复快照失败');
    } finally {
      setBusyAction('');
      setConfirmRestoreId(null);
    }
  }

  async function deleteApprovedMemory(memoryId: string) {
    setBusyAction(`approved-delete-${memoryId}`);
    try {
      const response = await sendRuntimeMessage(createMemoryDeleteMessage('approvedMemories', memoryId));
      if (!response.success) { setErrorText(response.error ?? '删除长期记忆失败。'); return; }
      await refreshWorkspace();
      setNoticeText('长期记忆已删除。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '删除长期记忆失败。');
    } finally {
      setBusyAction('');
    }
  }

  async function deleteImage(imageId: string) {
    setBusyAction(`image-delete-${imageId}`);
    try {
      const response = await sendRuntimeMessage(createImageDeleteMessage(imageId));
      if (!response.success) { setErrorText(response.error ?? '删除图片记录失败。'); return; }
      await refreshWorkspace();
      setNoticeText('图片生成记录已删除。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '删除图片记录失败。');
    } finally {
      setBusyAction('');
    }
  }

  async function deleteMindmap(mindmapId: string) {
    setBusyAction(`mindmap-delete-${mindmapId}`);
    try {
      const response = await sendRuntimeMessage(createMindmapDeleteMessage(mindmapId));
      if (!response.success) { setErrorText(response.error ?? '删除图谱记录失败。'); return; }
      await refreshWorkspace();
      setNoticeText('图谱记录已删除。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '删除图谱记录失败。');
    } finally {
      setBusyAction('');
    }
  }

  return (
    <div className="tab-panel">
      <section className="observation-hero panel-card">
        <div className="observation-hero__copy">
          <p className="section-label">Observation</p>
          <h2>观察 Agent 怎么变</h2>
          <p className="soft-text">这里看画像、补丁、备份和历史回放。它告诉我们，喂进去的东西到底有没有改变 Agent。</p>
          <div className="observation-hero__meta">
            <span className="status-pill status-pill--mocked">{runtimeConfig?.agentName ?? 'PocketAgent'}</span>
            <span className="status-pill status-pill--spark">{avatarMeta.name}</span>
            <span className="status-pill status-pill--approved">{runtimeConfig?.defaultTone ?? 'warm-product-designer'}</span>
          </div>
        </div>
        <PocketBuddyAvatar avatar={avatarId} mood="warm" size={72} />
      </section>

      <section className="status-grid">
        <StatCard
          label="创意"
          value={memory?.counts.ideas ?? 0}
          hint={`产物 ${memory?.counts.artifacts ?? 0}`}
        />
        <StatCard
          label="喂养"
          value={memory?.counts.pageContexts ?? 0}
          hint={`候选记忆 ${memory?.counts.memoryCandidates ?? 0}`}
        />
        <StatCard
          label="画像"
          value={memory?.counts.profileChanges ?? 0}
          hint={`快照 ${memory?.counts.backups ?? 0}`}
        />
        <StatCard
          label="补丁"
          value={memory?.pendingPatches.length ?? 0}
          hint={`历史 ${memory?.counts.feedback ?? 0}`}
        />
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">State</p>
            <h2>组件状态</h2>
          </div>
          <span className="micro-status">设置页改动后会同步到这里</span>
        </div>
        <div className="detail-grid">
          <InfoRow label="Agent / Avatar" value={`${runtimeConfig?.agentName ?? 'PocketAgent'} · ${avatarMeta.name}`} />
          <InfoRow label="LLM" value={`${runtimeConfig?.llmProvider ?? 'mock'} / ${runtimeConfig?.llmModel ?? '未配置'}`} />
          <InfoRow label="图片" value={`${runtimeConfig?.imageMode ?? 'mock'} / ${runtimeConfig?.imageModel ?? '未配置'}`} />
          <InfoRow
            label="用户画像"
            value={`${memory?.profile.visualLikes.slice(0, 3).join(' / ') || '暂无'} · ${memory?.profile.tonePreference || '暂无'}`}
          />
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Causal Chain</p>
            <h2>喂养 -&gt; 变化 -&gt; 产出</h2>
          </div>
          <span className="micro-status">帮我们确认这一步有没有真的改变 Agent</span>
        </div>
        <div className="detail-grid">
          <InfoRow
            label="最近喂养"
            value={memory?.recentPageContexts[0]?.pageTitle ?? memory?.recentContextSnippets[0]?.pageTitle ?? '暂无'}
          />
          <InfoRow
            label="最近变化"
            value={memory?.profileHistory[0]
              ? `${formatProfileSource(memory.profileHistory[0].source)} · ${formatDate(memory.profileHistory[0].createdAt)}`
              : '暂无'}
          />
          <InfoRow
            label="最近产出"
            value={memory?.recentArtifacts[0] ? memory.recentArtifacts[0].concept.name : '暂无'}
          />
          <InfoRow
            label="最近反馈"
            value={memory?.recentFeedback[0] ? FEEDBACK_LABELS[memory.recentFeedback[0].action] : '暂无'}
          />
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Timeline</p>
            <h2>演化时间线</h2>
          </div>
        </div>
        <div className="timeline-list">
          {timelineEntries.length > 0 ? timelineEntries.map((entry) => (
            <article key={entry.id} className="timeline-item">
              <div className="candidate-head">
                <strong>{entry.title}</strong>
                <span className={`timeline-badge timeline-badge--${entry.kind}`}>{entry.badgeLabel}</span>
              </div>
              <p className="soft-text">{entry.detail}</p>
              <p className="micro-copy">{formatDate(entry.createdAt)}</p>
            </article>
          )) : (
            <p className="soft-text">还没有足够多的历史。先发一个想法、读一页网页，时间线就会开始长出来。</p>
          )}
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Profile</p>
            <h2>当前画像与历史</h2>
          </div>
        </div>

        <div className="detail-grid">
          <InfoRow label="视觉偏好" value={memory?.profile.visualLikes.join(' / ') || '暂无'} />
          <InfoRow label="视觉排斥" value={memory?.profile.visualDislikes.join(' / ') || '暂无'} />
          <InfoRow label="语气偏好" value={memory?.profile.tonePreference || '暂无'} />
          <InfoRow label="产品偏好" value={memory?.profile.productPreferences.join(' / ') || '暂无'} />
          <InfoRow label="近期主题" value={memory?.profile.recentThemes.join(' / ') || '暂无'} />
          <InfoRow label="最后更新" value={memory ? formatDate(memory.profile.lastUpdated) : '暂无'} />
        </div>

        <div className="stack" style={{ marginTop: 10 }}>
          {(memory?.profileHistory ?? []).map((entry) => (
            <div key={entry.id} className="list-card">
              <div className="candidate-head">
                <strong>{formatProfileSource(entry.source)}</strong>
                <span className="status-pill status-pill--mocked">{formatDate(entry.createdAt)}</span>
              </div>
              <div className="token-list">
                {entry.profile.visualLikes.slice(0, 4).map((like) => <span key={like} className="token-chip">{like}</span>)}
              </div>
              <p className="micro-copy">
                语气：{entry.profile.tonePreference || '暂无'} ·
                产品偏好：{entry.profile.productPreferences.slice(0, 3).join(' / ') || '暂无'}
              </p>
            </div>
          ))}
          {(memory?.profileHistory.length ?? 0) === 0 ? <p className="soft-text">还没有画像历史。</p> : null}
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Backup</p>
            <h2>备份与回滚</h2>
          </div>
        </div>

        <div className="settings-section">
          <label>快照名称</label>
          <input
            type="text"
            className="settings-input"
            value={backupLabel}
            onChange={(e) => setBackupLabel(e.target.value)}
            placeholder="手动快照"
          />
        </div>

        <div className="inline-actions">
          <LineButton variant="primary" onClick={handleCreateBackup} disabled={Boolean(busyAction)}>
            创建快照
          </LineButton>
        </div>

        <div className="stack" style={{ marginTop: 10 }}>
          {(memory?.stateBackups ?? []).map((backup) => (
            <div key={backup.id} className="list-card">
              <div className="candidate-head">
                <strong>{backup.label}</strong>
                <span className={`timeline-badge timeline-badge--backup`}>
                  {formatDate(backup.createdAt)}
                </span>
              </div>
              <p className="soft-text">
                画像 {backup.snapshot.profileHistory.length} ·
                归档 {backup.snapshot.archiveNotes.length} ·
                创意 {backup.snapshot.ideaHistory.length} ·
                补丁 {backup.snapshot.harnessPatches.length}
              </p>
              <div className="inline-actions">
                <LineButton
                  variant={confirmRestoreId === backup.id ? 'primary' : 'ghost'}
                  onClick={() => handleRestoreBackup(backup.id)}
                  disabled={Boolean(busyAction)}
                >
                  {confirmRestoreId === backup.id ? '确认回滚' : '恢复这份快照'}
                </LineButton>
              </div>
            </div>
          ))}
          {(memory?.stateBackups.length ?? 0) === 0 ? <p className="soft-text">还没有快照。</p> : null}
        </div>

        {backupComparison ? (
          <div className="list-card" style={{ marginTop: 10 }}>
            <div className="candidate-head">
              <strong>最近两份快照差异</strong>
              <span className="status-pill status-pill--spark">compare</span>
            </div>
            <p className="soft-text">{backupComparison.summary}</p>
            <div className="detail-grid">
              <InfoRow label="较新快照" value={backupComparison.leftLabel} />
              <InfoRow label="较旧快照" value={backupComparison.rightLabel} />
            </div>
            <div className="subsection">
              <h4>差异摘要</h4>
              <ol className="bullet-list">
                {backupComparison.changes.map((change, index) => <li key={`${index}-${change}`}>{change}</li>)}
              </ol>
            </div>
          </div>
        ) : (
          <p className="soft-text" style={{ marginTop: 8 }}>至少保存两份快照后，这里会自动显示回滚差异。</p>
        )}
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Version Compare</p>
            <h2>产物与图片版本对比</h2>
          </div>
        </div>

        {effectiveArtifactHistory.length > 0 ? (
          <div className="detail-grid">
            <div className="settings-section">
              <label>产物版本 A</label>
              <select
                className="settings-select"
                value={artifactCompareLeftId}
                onChange={(e) => setArtifactCompareLeftId(e.target.value)}
              >
                {effectiveArtifactHistory.map((item) => (
                  <option key={item.id} value={item.id}>{describeArtifactVersion(item)}</option>
                ))}
              </select>
            </div>
            <div className="settings-section">
              <label>产物版本 B</label>
              <select
                className="settings-select"
                value={artifactCompareRightId}
                onChange={(e) => setArtifactCompareRightId(e.target.value)}
              >
                {effectiveArtifactHistory.map((item) => (
                  <option key={item.id} value={item.id}>{describeArtifactVersion(item)}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <p className="soft-text" style={{ marginTop: 8 }}>暂无产物历史，先发一个想法再来对比版本。</p>
        )}

        {artifactComparison ? (
          <div className="list-card" style={{ marginTop: 10 }}>
            <div className="candidate-head">
              <strong>产物差异</strong>
              <span className="status-pill status-pill--spark">artifact</span>
            </div>
            <p className="soft-text">{artifactComparison.summary}</p>
            <div className="detail-grid">
              <InfoRow label="版本 A" value={artifactComparison.leftLabel} />
              <InfoRow label="版本 B" value={artifactComparison.rightLabel} />
            </div>
            <div className="subsection">
              <h4>差异摘要</h4>
              <ol className="bullet-list">
                {artifactComparison.changes.map((change, index) => <li key={`${index}-${change}`}>{change}</li>)}
              </ol>
            </div>
            <div className="inline-actions">
              <LineButton variant="ghost" onClick={() => onCopy([artifactComparison.summary, ...artifactComparison.changes].join('\n'), '产物对比摘要已复制。')}>
                复制摘要
              </LineButton>
            </div>
          </div>
        ) : (
          <p className="soft-text" style={{ marginTop: 8 }}>至少保留两版产物后，才能对比版本变化。</p>
        )}

        {effectiveImageHistory.length > 0 ? (
          <div className="detail-grid" style={{ marginTop: 12 }}>
            <div className="settings-section">
              <label>图片版本 A</label>
              <select
                className="settings-select"
                value={imageCompareLeftId}
                onChange={(e) => setImageCompareLeftId(e.target.value)}
              >
                {effectiveImageHistory.map((item) => (
                  <option key={item.id} value={item.id}>{describeImageVersion(item)}</option>
                ))}
              </select>
            </div>
            <div className="settings-section">
              <label>图片版本 B</label>
              <select
                className="settings-select"
                value={imageCompareRightId}
                onChange={(e) => setImageCompareRightId(e.target.value)}
              >
                {effectiveImageHistory.map((item) => (
                  <option key={item.id} value={item.id}>{describeImageVersion(item)}</option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <p className="soft-text" style={{ marginTop: 8 }}>暂无图片历史，先生成一张图片再来对比版本。</p>
        )}

        {imageComparison ? (
          <div className="list-card" style={{ marginTop: 10 }}>
            <div className="candidate-head">
              <strong>图片差异</strong>
              <span className="status-pill status-pill--spark">image</span>
            </div>
            <p className="soft-text">{imageComparison.summary}</p>
            <div className="detail-grid">
              <InfoRow label="版本 A" value={imageComparison.leftLabel} />
              <InfoRow label="版本 B" value={imageComparison.rightLabel} />
            </div>
            <div className="subsection">
              <h4>差异摘要</h4>
              <ol className="bullet-list">
                {imageComparison.changes.map((change, index) => <li key={`${index}-${change}`}>{change}</li>)}
              </ol>
            </div>
            <div className="inline-actions">
              <LineButton variant="ghost" onClick={() => onCopy([imageComparison.summary, ...imageComparison.changes].join('\n'), '图片对比摘要已复制。')}>
                复制摘要
              </LineButton>
            </div>
          </div>
        ) : (
          <p className="soft-text" style={{ marginTop: 8 }}>至少保留两条图片请求后，才能对比版本变化。</p>
        )}
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Harness</p>
            <h2>补丁与反馈痕迹</h2>
          </div>
          <span className="micro-status">来自 feedback.record 的历史演化</span>
        </div>

        <div className="stack">
          {(memory?.harnessPatches ?? []).map((patch) => (
            <div key={patch.id} className="list-card">
              <div className="candidate-head">
                <strong>{patch.target}</strong>
                <span className={`status-pill status-pill--${patch.status === 'applied' ? 'approved' : patch.status}`}>
                  {patch.status}
                </span>
              </div>
              <p className="soft-text">{patch.reason}</p>
              <div className="detail-grid">
                <InfoRow label="范围" value={patch.scope} />
                <InfoRow label="风险" value={patch.riskLevel} />
                <InfoRow label="需要审批" value={patch.requireUserApproval ? '是' : '否'} />
              </div>
              <div className="subsection">
                <h4>Before / After</h4>
                <div className="stack stack--tight">
                  <pre className="prompt-block">{patch.before}</pre>
                  <pre className="prompt-block">{patch.after}</pre>
                </div>
              </div>
              <div className="inline-actions">
                <LineButton variant="ghost" onClick={() => onCopy(`${patch.before}\n\n${patch.after}`, '补丁内容已复制。')}>
                  复制补丁
                </LineButton>
              </div>
            </div>
          ))}
          {(memory?.harnessPatches.length ?? 0) === 0 ? <p className="soft-text">还没有补丁历史。</p> : null}
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Approved Memories</p>
            <h2>已批准记忆</h2>
          </div>
        </div>
        <div className="stack">
          {(memory?.approvedMemories ?? []).map((item) => (
            <div key={item.id} className="list-card">
              <div className="candidate-head">
                <strong>{item.title}</strong>
                <span className="status-pill status-pill--approved">{item.category}</span>
              </div>
              <p className="soft-text">{item.content}</p>
              <p className="micro-copy">{item.reason}</p>
              <div className="inline-actions">
                <LineButton variant="ghost" onClick={() => deleteApprovedMemory(item.id)}>删除这条记忆</LineButton>
              </div>
            </div>
          ))}
          {(memory?.approvedMemories.length ?? 0) === 0 ? <p className="soft-text">还没有长期记忆。</p> : null}
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Generated Images</p>
            <h2>图片请求记录</h2>
          </div>
        </div>
        <div className="stack">
          {effectiveImageHistory.map((item) => (
            <div key={item.id} className="list-card">
              <div className="candidate-head">
                <strong>{item.request.title || item.model || 'gpt-image-2'}</strong>
                <span className={`status-pill status-pill--${item.status}`}>{item.status}</span>
              </div>
              <p className="micro-copy">
                {item.request.sourceType} · {item.request.style} · {formatDate(item.createdAt)}
              </p>
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.prompt.slice(0, 40)} className="generated-image" />
              ) : null}
              <pre className="prompt-block">{item.prompt}</pre>
              <p className="soft-text">{item.previewText}</p>
              <div className="inline-actions">
                <LineButton variant="ghost" onClick={() => onCopy(item.prompt, '图片 Prompt 已复制。')}>复制 Prompt</LineButton>
                <LineButton variant="ghost" onClick={() => deleteImage(item.id)}>删除记录</LineButton>
              </div>
            </div>
          ))}
          {effectiveImageHistory.length === 0 ? <p className="soft-text">还没有图片生成记录。</p> : null}
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Generated Mindmaps</p>
            <h2>图谱记录</h2>
          </div>
        </div>
        <div className="stack">
          {(memory?.generatedMindmaps ?? []).map((item) => (
            <div key={item.id} className="list-card">
              <div className="candidate-head">
                <strong>{item.result.title}</strong>
                <span className="status-pill status-pill--spark">{item.sourceType}</span>
              </div>
              <div className="tree-preview">
                <AnimatedTree root={item.result.root} />
              </div>
              {item.imagePrompt ? <pre className="prompt-block">{item.imagePrompt}</pre> : null}
              <div className="inline-actions">
                {item.imagePrompt ? (
                  <LineButton variant="ghost" onClick={() => onCopy(item.imagePrompt!, '图谱 Prompt 已复制。')}>复制 Prompt</LineButton>
                ) : null}
                <LineButton variant="ghost" onClick={() => deleteMindmap(item.id)}>删除记录</LineButton>
              </div>
            </div>
          ))}
          {(memory?.generatedMindmaps.length ?? 0) === 0 ? <p className="soft-text">还没有图谱生成记录。</p> : null}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="stat-card">
      <p className="section-label">{label}</p>
      <strong>{value}</strong>
      <span className="micro-copy">{hint}</span>
    </div>
  );
}

function buildTimeline(memory: MemorySummary | null): TimelineEntry[] {
  if (!memory) return [];

  const entries: TimelineEntry[] = [];

  memory.recentIdeas.forEach((idea) => {
    entries.push({
      id: `idea-${idea.id}`,
      kind: 'idea',
      title: `想法 · ${shorten(idea.rawInput)}`,
      detail: `来源：${idea.source} · 片段 ${idea.selectedContextIds.length} · 笔记 ${idea.selectedArchiveNoteIds.length}`,
      createdAt: idea.createdAt,
      badgeLabel: 'Idea',
    });
  });

  memory.recentArtifacts.forEach((artifact) => {
    entries.push({
      id: `artifact-${artifact.id}`,
      kind: 'artifact',
      title: `产物 · ${artifact.concept.name}`,
      detail: `${artifact.intent} · ${artifact.concept.tagline}`,
      createdAt: artifact.createdAt,
      badgeLabel: 'Artifact',
    });
  });

  memory.recentFeedback.forEach((feedback) => {
    entries.push({
      id: `feedback-${feedback.id}`,
      kind: 'feedback',
      title: `反馈 · ${FEEDBACK_LABELS[feedback.action] ?? feedback.action}`,
      detail: `针对产物 ${feedback.artifactId.slice(0, 8)}`,
      createdAt: feedback.createdAt,
      badgeLabel: 'Feedback',
    });
  });

  memory.profileHistory.forEach((entry: ProfileHistoryEntry) => {
    entries.push({
      id: `profile-${entry.id}`,
      kind: 'profile',
      title: `画像 · ${formatProfileSource(entry.source)}`,
      detail: `喜欢 ${entry.profile.visualLikes.slice(0, 3).join(' / ') || '暂无'} · 语气 ${entry.profile.tonePreference || '暂无'}`,
      createdAt: entry.createdAt,
      badgeLabel: 'Profile',
    });
  });

  memory.stateBackups.forEach((backup: StateBackup) => {
    entries.push({
      id: `backup-${backup.id}`,
      kind: 'backup',
      title: `快照 · ${backup.label}`,
      detail: `创意 ${backup.snapshot.ideaHistory.length} · 归档 ${backup.snapshot.archiveNotes.length} · 补丁 ${backup.snapshot.harnessPatches.length}`,
      createdAt: backup.createdAt,
      badgeLabel: 'Backup',
    });
  });

  memory.harnessPatches.forEach((patch: HarnessPatch) => {
    entries.push({
      id: `patch-${patch.id}`,
      kind: 'patch',
      title: `补丁 · ${patch.target}`,
      detail: patch.reason,
      createdAt: patch.createdAt,
      badgeLabel: patch.status,
    });
  });

  return entries.sort((a, b) => b.createdAt - a.createdAt).slice(0, 18);
}

function describeArtifactVersion(item: ProductArtifact) {
  return `${shorten(item.concept.name || '未命名产物', 16)} · ${item.intent} · ${formatDate(item.createdAt)}`;
}

function describeImageVersion(item: GeneratedImageRecord) {
  return `${shorten(item.request.title || item.request.sourceType || '未命名图片', 16)} · ${item.request.style} · ${formatDate(item.createdAt)}`;
}

function shorten(text: string, max = 16) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function formatProfileSource(source: ProfileHistoryEntry['source']) {
  switch (source) {
    case 'init':
      return '初始画像';
    case 'idea':
      return '由想法更新';
    case 'feedback':
      return '由反馈更新';
    case 'memory-approval':
      return '由记忆批准更新';
    default:
      return '手动调整';
  }
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-block">
      <span className="memory-label">{label}</span>
      <p>{value}</p>
    </div>
  );
}
