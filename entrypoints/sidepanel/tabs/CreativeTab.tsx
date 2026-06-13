import { useRef, useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import StaggerStack from '@/components/StaggerStack/StaggerStack';
import PocketBurst from '@/components/PocketBurst/PocketBurst';
import InkRipple, { type InkRippleHandle } from '@/components/InkRipple/InkRipple';
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
  { label: '不喜欢', action: 'dislike-direction' },
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

  // 特效2：口袋泡泡
  const [burstActive, setBurstActive] = useState(false);

  // 特效6：墨水光标
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const inkRef = useRef<InkRippleHandle | null>(null);

  // 文字变化时触发墨水扩散（节流到 80ms）
  useEffect(() => {
    if (!ideaText || !textareaRef.current) return;
    const handle = window.setTimeout(() => {
      inkRef.current?.rippleAtCaret(textareaRef.current!);
    }, 80);
    return () => window.clearTimeout(handle);
    // 只在文字长度变化时触发（输入/粘贴/删除）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaText.length]);

  async function handleIdeaSubmit() {
    if (!ideaText.trim()) return;
    setBusyAction('creative-submit');
    setErrorText(''); setNoticeText(''); setLastFeedback('');
    setStatusText('正在生成产品雏形...');

    // 特效2：触发口袋泡泡
    setBurstActive(false);
    // 下一帧再设为 true，强制重渲染
    requestAnimationFrame(() => setBurstActive(true));
    window.setTimeout(() => setBurstActive(false), 800);

    try {
      const response = await sendRuntimeMessage(
        createIdeaSubmitMessage(ideaText, selectedContextIds, selectedArchiveNoteIds),
      );

      if (!response.success) {
        const msg = response.error ?? '生成失败。';
        setErrorText(msg); setStatusText(msg);
        return;
      }

      setArtifact(response.payload.artifact);
      setMemory(response.payload.memorySummary);
      setStatusText(response.payload.assistantSummary);
      setIdeaText(''); setSelectedContextIds([]); setSelectedArchiveNoteIds([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败。';
      setErrorText(msg);
      setStatusText(msg);
    } finally {
      setBusyAction('');
    }
  }

  async function handleFeedback(action: FeedbackAction) {
    if (!artifact) return;
    setBusyAction(`feedback-${action}`);
    try {
      const response = await sendRuntimeMessage(createFeedbackMessage(artifact.id, action));
      if (!response.success) { setErrorText(response.error ?? '反馈失败。'); return; }
      setMemory(response.payload.memorySummary);
      setLastFeedback(`已记录：${FEEDBACK_OPTIONS.find((i) => i.action === action)?.label ?? action}`);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '反馈失败。');
    } finally {
      setBusyAction('');
    }
  }

  return (
    <div className="tab-panel">
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Invention</p>
            <h2>把想法变成产品雏形</h2>
          </div>
        </div>

        {/* textarea 外层相对定位，用于承载墨水光标层 */}
        <div style={{ position: 'relative' }}>
          <textarea
            ref={textareaRef}
            className="idea-textarea"
            value={ideaText}
            onChange={(e) => setIdeaText(e.target.value)}
            placeholder="输入一个想法，比如：做一个能自动整理阅读笔记的小工具"
          />
          <InkRipple ref={inkRef} />
        </div>

        <SelectionGroup
          title="带入片段"
          emptyText="暂无"
          selectedIds={selectedContextIds}
          onToggle={(id) => toggleSelection(id, setSelectedContextIds)}
          items={(memory?.recentContextSnippets ?? []).map((s) => ({
            id: s.id, title: s.pageTitle, description: s.selectedText,
          }))}
        />

        <SelectionGroup
          title="带入笔记"
          emptyText="暂无"
          selectedIds={selectedArchiveNoteIds}
          onToggle={(id) => toggleSelection(id, setSelectedArchiveNoteIds)}
          items={(memory?.archiveNotes ?? []).slice(0, 4).map((n) => ({
            id: n.id, title: n.title, description: n.summary,
          }))}
        />

        {/* action-row 包一层 relative，让 PocketBurst 在按钮位置爆发 */}
        <div className="action-row" style={{ position: 'relative' }}>
          <LineButton
            variant="primary"
            onClick={handleIdeaSubmit}
            disabled={Boolean(busyAction) || !ideaText.trim()}
          >
            {busyAction === 'creative-submit' ? '生成中...' : '生成产品雏形'}
          </LineButton>
          <PocketBurst active={burstActive} />
        </div>
      </section>

      {/* 特效3：artifact 出现后用 StaggerStack 错落入场 */}
      {artifact ? (
        <StaggerStack triggerKey={artifact.id}>
          <ResultCard title={artifact.concept.name}>
            <p className="result-tagline">{artifact.concept.tagline}</p>
            <p className="soft-text">{artifact.concept.positioning}</p>
            <div className="token-list">
              {artifact.concept.features.map((f) => <span key={f} className="token-chip">{f}</span>)}
            </div>
            <div className="inline-actions">
              <LineButton variant="ghost" onClick={() => onCopy(artifact.imagePrompt, 'Prompt 已复制')}>复制 Prompt</LineButton>
              <LineButton variant="secondary" onClick={() => onGenerateImage({
                sourceType: 'idea', title: artifact.concept.name,
                content: `${artifact.concept.positioning}\n${artifact.imagePrompt}`, style: 'product-ui',
              })}>生成图片</LineButton>
            </div>
          </ResultCard>

          <ResultCard title="MVP">
            <ListBlock items={artifact.mvpPlan} ordered />
          </ResultCard>

          <ResultCard title="调整方向">
            <div className="button-grid">
              {FEEDBACK_OPTIONS.map((item) => (
                <LineButton key={item.action} variant="secondary" onClick={() => handleFeedback(item.action)} disabled={Boolean(busyAction)}>
                  {item.label}
                </LineButton>
              ))}
            </div>
            {lastFeedback ? <p className="soft-text" style={{ marginTop: 6 }}>{lastFeedback}</p> : null}
          </ResultCard>
        </StaggerStack>
      ) : (
        <EmptyCard avatar title="输入想法开始发明" body="小口袋云云已就位，输入一句话就能生成产品概念、图片 Prompt 和 MVP 计划。" />
      )}
    </div>
  );
}
