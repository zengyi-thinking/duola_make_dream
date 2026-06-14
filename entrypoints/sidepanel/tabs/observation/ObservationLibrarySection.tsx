import type { Dispatch, SetStateAction } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import MindmapPreview from '../../components/MindmapPreview';
import PipelineFlow from '../../components/PipelineFlow';
import type { MemorySummary } from '@/lib/agent/types';
import {
  createImageDeleteMessage,
  createMemoryDeleteMessage,
  createMindmapDeleteMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import { CollapsibleCard } from '../../components/CollapsibleCard';

interface ObservationLibrarySectionProps {
  memory: MemorySummary | null;
  busyAction: string;
  setBusyAction: Dispatch<SetStateAction<string>>;
  setErrorText: Dispatch<SetStateAction<string>>;
  setNoticeText: Dispatch<SetStateAction<string>>;
  refreshWorkspace: () => Promise<void>;
  onCopy: (text: string, successText: string) => void;
}

export default function ObservationLibrarySection(props: ObservationLibrarySectionProps) {
  const {
    memory,
    busyAction,
    setBusyAction,
    setErrorText,
    setNoticeText,
    refreshWorkspace,
    onCopy,
  } = props;

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
    <CollapsibleCard
      sectionLabel="Library"
      title="资源库"
      summary="补丁、记忆、图片、图谱。"
      badge={`${memory?.approvedMemories.length ?? 0} memories`}
    >
      <div className="stack">
        <PatchLibrary memory={memory} onCopy={onCopy} />
        <ApprovedMemoryLibrary memory={memory} busyAction={busyAction} onDelete={deleteApprovedMemory} />
        <ImageLibrary memory={memory} busyAction={busyAction} onCopy={onCopy} onDelete={deleteImage} />
        <MindmapLibrary memory={memory} busyAction={busyAction} onDelete={deleteMindmap} onCopy={onCopy} />
      </div>
    </CollapsibleCard>
  );
}

function PatchLibrary({
  memory,
  onCopy,
}: {
  memory: MemorySummary | null;
  onCopy: (text: string, successText: string) => void;
}) {
  return (
    <div className="list-card">
      <div className="candidate-head">
        <strong>补丁</strong>
        <span className="status-pill status-pill--spark">{memory?.harnessPatches.length ?? 0}</span>
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
            <p className="micro-copy">{shorten(patch.reason, 88)}</p>
            <div className="token-list">
              {typeof patch.score === 'number' && (
                <span className="token-chip" title={`自学习评分：${patch.score.toFixed(2)}（${patch.scoreSource ?? 'init'}）`}>
                  评分 {patch.score.toFixed(2)}
                </span>
              )}
              <span className="token-chip">{patch.scope}</span>
              <span className="token-chip">{patch.riskLevel} 风险</span>
              {patch.appliedAt && (
                <span className="token-chip">生效于 {new Date(patch.appliedAt).toLocaleDateString('zh-CN')}</span>
              )}
            </div>
            <details className="reading-accordion" style={{ marginTop: 8 }}>
              <summary>查看补丁内容</summary>
              <div className="stack stack--tight" style={{ marginTop: 8 }}>
                <pre className="prompt-block">{patch.before}</pre>
                <pre className="prompt-block">{patch.after}</pre>
              </div>
            </details>
          </div>
        ))}
        {(memory?.harnessPatches.length ?? 0) === 0 ? <p className="soft-text">还没有补丁历史。出现"不喜欢"反馈后会自动生成。</p> : null}
      </div>
    </div>
  );
}

function ApprovedMemoryLibrary({
  memory,
  busyAction,
  onDelete,
}: {
  memory: MemorySummary | null;
  busyAction: string;
  onDelete: (memoryId: string) => Promise<void>;
}) {
  return (
    <div className="list-card">
      <div className="candidate-head">
        <strong>已批准记忆</strong>
        <span className="status-pill status-pill--approved">{memory?.approvedMemories.length ?? 0}</span>
      </div>
      <div className="stack">
        {(memory?.approvedMemories ?? []).map((item) => (
          <div key={item.id} className="list-card">
            <div className="candidate-head">
              <strong>{item.title}</strong>
              <span className="status-pill status-pill--approved">{item.category}</span>
            </div>
            <p className="micro-copy">{shorten(item.reason ?? '', 96)}</p>
            <div className="token-list">
              <span className="token-chip">{shorten(item.content ?? '', 18)}</span>
              <span className="token-chip">{item.category}</span>
            </div>
            <details className="reading-accordion" style={{ marginTop: 8 }}>
              <summary>展开记忆详情</summary>
              <div className="subsection">
                <p className="micro-copy">{item.content}</p>
                <p className="micro-copy">{item.reason}</p>
              </div>
            </details>
            <div className="inline-actions">
              <LineButton variant="ghost" onClick={() => onDelete(item.id)} disabled={Boolean(busyAction)}>
                删除这条记忆
              </LineButton>
            </div>
          </div>
        ))}
        {(memory?.approvedMemories.length ?? 0) === 0 ? <p className="soft-text">还没有长期记忆。</p> : null}
      </div>
    </div>
  );
}

function ImageLibrary({
  memory,
  busyAction,
  onCopy,
  onDelete,
}: {
  memory: MemorySummary | null;
  busyAction: string;
  onCopy: (text: string, successText: string) => void;
  onDelete: (imageId: string) => Promise<void>;
}) {
  return (
    <div className="list-card">
      <div className="candidate-head">
        <strong>图片请求</strong>
        <span className="status-pill status-pill--spark">{memory?.generatedImages.length ?? 0}</span>
      </div>
      <div className="stack">
        {(memory?.generatedImages ?? []).map((item) => (
          <div key={item.id} className="list-card">
            <div className="candidate-head">
              <strong>{item.request.title || item.model || 'gpt-image-2'}</strong>
              <span className={`status-pill status-pill--${item.status}`}>{item.status}</span>
            </div>
            <div className="token-list">
              <span className="token-chip">{item.request.sourceType}</span>
              <span className="token-chip">{item.request.style}</span>
              <span className="token-chip">{formatDate(item.createdAt)}</span>
            </div>
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.prompt.slice(0, 40)} className="generated-image" />
            ) : null}
            {item.pipelineTrace ? <PipelineFlow trace={item.pipelineTrace} compact /> : null}
            <p className="micro-copy">{shorten(item.previewText ?? '', 88)}</p>
            <details className="reading-accordion" style={{ marginTop: 8 }}>
              <summary>展开生成 Prompt</summary>
              <pre className="prompt-block">{item.prompt}</pre>
            </details>
            <div className="inline-actions">
              <LineButton variant="ghost" onClick={() => onCopy(item.prompt, '图片 Prompt 已复制。')}>复制 Prompt</LineButton>
              <LineButton variant="ghost" onClick={() => onDelete(item.id)} disabled={Boolean(busyAction)}>删除记录</LineButton>
            </div>
          </div>
        ))}
        {(memory?.generatedImages.length ?? 0) === 0 ? <p className="soft-text">还没有图片生成记录。</p> : null}
      </div>
    </div>
  );
}

function MindmapLibrary({
  memory,
  busyAction,
  onDelete,
  onCopy,
}: {
  memory: MemorySummary | null;
  busyAction: string;
  onDelete: (mindmapId: string) => Promise<void>;
  onCopy: (text: string, successText: string) => void;
}) {
  return (
    <div className="list-card">
      <div className="candidate-head">
        <strong>图谱记录</strong>
        <span className="status-pill status-pill--spark">{memory?.generatedMindmaps.length ?? 0}</span>
      </div>
      <div className="stack">
        {(memory?.generatedMindmaps ?? []).map((item) => (
          <div key={item.id} className="list-card">
            <div className="candidate-head">
              <strong>{item.result.title}</strong>
              <span className="status-pill status-pill--spark">{item.sourceType}</span>
            </div>
            <div className="tree-preview">
              <MindmapPreview node={item.result.root} />
            </div>
            {item.pipelineTrace ? <PipelineFlow trace={item.pipelineTrace} compact /> : null}
            {item.imagePrompt ? (
              <details className="reading-accordion" style={{ marginTop: 8 }}>
                <summary>展开图谱 Prompt</summary>
                <pre className="prompt-block">{item.imagePrompt}</pre>
              </details>
            ) : null}
            <div className="inline-actions">
              {item.imagePrompt ? (
                <LineButton variant="ghost" onClick={() => onCopy(item.imagePrompt!, '图谱 Prompt 已复制。')}>复制 Prompt</LineButton>
              ) : null}
              <LineButton variant="ghost" onClick={() => onDelete(item.id)} disabled={Boolean(busyAction)}>删除记录</LineButton>
            </div>
          </div>
        ))}
        {(memory?.generatedMindmaps.length ?? 0) === 0 ? <p className="soft-text">还没有图谱生成记录。</p> : null}
      </div>
    </div>
  );
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function shorten(text: string, max: number) {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max)}…` : compact;
}
