import type { Dispatch, SetStateAction } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import MindmapPreview from '../../components/MindmapPreview';
import type { MemorySummary } from '@/lib/agent/types';
import {
  createImageDeleteMessage,
  createMemoryDeleteMessage,
  createMindmapDeleteMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import { InfoBlock } from '../../components/InfoBlock';
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
      title="资源库与补丁"
      summary="把长期记忆、图片、图谱和补丁收在一起。"
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
              <span className={`status-pill status-pill--${patch.status === 'applied' ? 'approved' : patch.status}`}>{patch.status}</span>
            </div>
            <p className="soft-text">{patch.reason}</p>
            <div className="detail-grid">
              <InfoBlock label="范围" value={patch.scope} />
              <InfoBlock label="风险" value={patch.riskLevel} />
              <InfoBlock label="需要审批" value={patch.requireUserApproval ? '是' : '否'} />
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
            <p className="soft-text">{item.content}</p>
            <p className="micro-copy">{item.reason}</p>
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
            {item.imagePrompt ? <pre className="prompt-block">{item.imagePrompt}</pre> : null}
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
