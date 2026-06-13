import type { Dispatch, SetStateAction } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import ToolGrid from '@/components/ToolGrid/ToolGrid';
import type { FeedbackAction, MemorySummary, ProductArtifact } from '@/lib/agent/types';
import { createFeedbackMessage, createIdeaSubmitMessage, sendRuntimeMessage } from '@/lib/messaging/bus';
import { ResultCard, EmptyCard } from '../components/ResultCard';
import { ListBlock } from '../components/ListBlock';
import { SelectionGroup, toggleSelection } from '../components/ContextSelector';

const FEEDBACK_OPTIONS: Array<{ label: string; action: FeedbackAction }> = [
  { label: '更极简', action: 'more-minimal' },
  { label: '更可爱', action: 'cuter' },
  { label: '更产品化', action: 'more-productized' },
  { label: '更有科技感', action: 'more-tech' },
  { label: '不喜欢这个方向', action: 'dislike-direction' },
];

interface CreativeTabProps {
  memory: MemorySummary | null;
  artifact: ProductArtifact | null;
  ideaText: string;
  setIdeaText: Dispatch<SetStateAction<string>>;
  selectedContextIds: string[];
  setSelectedContextIds: Dispatch<SetStateAction<string[]>>;
  selectedArchiveNoteIds: string[];
  setSelectedArchiveNoteIds: Dispatch<SetStateAction<string[]>>;
  lastFeedback: string;
  setLastFeedback: Dispatch<SetStateAction<string>>;
  busyAction: string;
  setBusyAction: Dispatch<SetStateAction<string>>;
  setMemory: Dispatch<SetStateAction<MemorySummary | null>>;
  setStatusText: Dispatch<SetStateAction<string>>;
  setErrorText: Dispatch<SetStateAction<string>>;
  setNoticeText: Dispatch<SetStateAction<string>>;
  setArtifact: Dispatch<SetStateAction<ProductArtifact | null>>;
  onGenerateImage: (input: {
    sourceType: 'idea' | 'page-summary' | 'paper-note' | 'article-note' | 'mindmap';
    title: string; content: string;
    style: 'line-art' | 'product-ui' | 'knowledge-card' | 'poster' | 'mindmap';
    relatedNoteId?: string;
  }) => void;
  onGenerateMindmap: (input: {
    sourceId: string; sourceType: 'paper' | 'article' | 'idea';
    title: string; content: string; noteId?: string;
  }) => void;
  onCopy: (text: string, successText: string) => void;
}

export default function CreativeTab(props: CreativeTabProps) {
  const {
    memory, artifact, ideaText, setIdeaText,
    selectedContextIds, setSelectedContextIds,
    selectedArchiveNoteIds, setSelectedArchiveNoteIds,
    lastFeedback, setLastFeedback, busyAction, setBusyAction,
    setMemory, setStatusText, setErrorText, setNoticeText, setArtifact,
    onGenerateImage, onGenerateMindmap, onCopy,
  } = props;

  async function handleIdeaSubmit() {
    if (!ideaText.trim()) return;

    setBusyAction('creative-submit');
    setErrorText('');
    setNoticeText('');
    setLastFeedback('');
    setStatusText('PocketAgent 正在把你的想法整理成一个可讨论的小产品草图。');

    const response = await sendRuntimeMessage(
      createIdeaSubmitMessage(ideaText, selectedContextIds, selectedArchiveNoteIds),
    );

    setBusyAction('');

    if (!response.success) {
      const message = response.error ?? '创意生成失败。';
      setErrorText(message);
      setStatusText(message);
      return;
    }

    setArtifact(response.payload.artifact);
    setMemory(response.payload.memorySummary);
    setStatusText(response.payload.assistantSummary);
    setIdeaText('');
    setSelectedContextIds([]);
    setSelectedArchiveNoteIds([]);
  }

  async function handleFeedback(action: FeedbackAction) {
    if (!artifact) return;

    setBusyAction(`feedback-${action}`);
    const response = await sendRuntimeMessage(createFeedbackMessage(artifact.id, action));
    setBusyAction('');

    if (!response.success) {
      setErrorText(response.error ?? '反馈没有记录成功。');
      return;
    }

    setMemory(response.payload.memorySummary);
    setLastFeedback(`已记录：${FEEDBACK_OPTIONS.find((item) => item.action === action)?.label ?? action}`);
  }

  return (
    <div className="tab-panel">
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Idea Pocket</p>
            <h2>把一个想法放进口袋</h2>
          </div>
          <span className="micro-status">{busyAction === 'creative-submit' ? '正在生成' : '本地 mock Agent'}</span>
        </div>

        <textarea
          className="idea-textarea"
          value={ideaText}
          onChange={(event) => setIdeaText(event.target.value)}
          placeholder="例如：做一个能把论文阅读结果自动整理成插件笔记和图谱的小工具"
        />

        <SelectionGroup
          title="带入网页片段"
          emptyText="还没有主动放入口袋的网页片段"
          selectedIds={selectedContextIds}
          onToggle={(id) => toggleSelection(id, setSelectedContextIds)}
          items={(memory?.recentContextSnippets ?? []).map((snippet) => ({
            id: snippet.id, title: snippet.pageTitle, description: snippet.selectedText,
          }))}
        />

        <SelectionGroup
          title="带入归档笔记"
          emptyText="还没有保存过的归档笔记"
          selectedIds={selectedArchiveNoteIds}
          onToggle={(id) => toggleSelection(id, setSelectedArchiveNoteIds)}
          items={(memory?.archiveNotes ?? []).slice(0, 4).map((note) => ({
            id: note.id, title: note.title, description: note.summary,
          }))}
        />

        <div className="action-row">
          <span className="helper-text">background 会统一做创意扩展、记忆融合与结果构建。</span>
          <LineButton variant="primary" onClick={handleIdeaSubmit} disabled={Boolean(busyAction) || !ideaText.trim()}>
            {busyAction === 'creative-submit' ? 'PocketAgent 思考中' : '生成产品雏形'}
          </LineButton>
        </div>
      </section>

      <section className="panel-card">
        <ToolGrid />
      </section>

      {artifact ? (
        <div className="stack">
          <ResultCard title="Product Concept">
            <h3>{artifact.concept.name}</h3>
            <p className="result-tagline">{artifact.concept.tagline}</p>
            <p className="soft-text">{artifact.concept.positioning}</p>
            <div className="token-list">
              {artifact.concept.features.map((feature) => (
                <span key={feature} className="token-chip">{feature}</span>
              ))}
            </div>
          </ResultCard>

          <ResultCard title="Image Prompt">
            <pre className="prompt-block">{artifact.imagePrompt}</pre>
            <div className="inline-actions">
              <LineButton variant="ghost" onClick={() => onCopy(artifact.imagePrompt, '图片 Prompt 已复制。')}>复制 Prompt</LineButton>
              <LineButton
                variant="secondary"
                onClick={() => onGenerateImage({
                  sourceType: 'idea', title: artifact.concept.name,
                  content: `${artifact.concept.positioning}\n${artifact.imagePrompt}`, style: 'product-ui',
                })}
              >
                生成产品概念图请求
              </LineButton>
            </div>
          </ResultCard>

          <ResultCard title="MVP Plan">
            <ListBlock items={artifact.mvpPlan} ordered />
            <div className="subsection">
              <h4>Next Tasks</h4>
              <ListBlock items={artifact.nextTasks} />
            </div>
          </ResultCard>

          <ResultCard title="Feedback">
            <div className="button-grid">
              {FEEDBACK_OPTIONS.map((item) => (
                <LineButton key={item.action} variant="secondary" onClick={() => handleFeedback(item.action)} disabled={Boolean(busyAction)}>
                  {item.label}
                </LineButton>
              ))}
            </div>
            {lastFeedback ? <p className="soft-text">{lastFeedback}</p> : null}
            <div className="inline-actions">
              <LineButton
                variant="ghost"
                onClick={() => onGenerateMindmap({
                  sourceId: artifact.id, sourceType: 'idea',
                  title: `${artifact.concept.name} 产品图谱`,
                  content: [artifact.concept.tagline, ...artifact.concept.features, ...artifact.nextTasks].join('；'),
                })}
              >
                生成产品图谱
              </LineButton>
            </div>
          </ResultCard>
        </div>
      ) : (
        <EmptyCard title="先抛一句想法" body="PocketBuddy 会返回产品概念、图片 Prompt、MVP 计划，还能把网页片段和归档笔记带进创意流。" />
      )}
    </div>
  );
}
