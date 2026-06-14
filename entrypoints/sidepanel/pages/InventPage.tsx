import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import LineButton from '@/components/LineArt/LineButton';
import StaggerStack from '@/components/StaggerStack/StaggerStack';
import PocketBurst from '@/components/PocketBurst/PocketBurst';
import InkRipple, { type InkRippleHandle } from '@/components/InkRipple/InkRipple';
import GraphCanvas from '@/components/GraphCanvas/GraphCanvas';
import ProcessingStage from '@/components/ProcessingStage/ProcessingStage';
import type { FeedbackAction, ProductArtifact } from '@/lib/agent/types';
import type { GraphView } from '@/lib/graph/types';
import {
  createFeedbackMessage,
  createPocketAgentImageMessage,
  createPocketAgentInventMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import { useToast } from '../context/ToastContext';
import { useBusy } from '../context/BusyContext';
import { useMemory } from '../context/MemoryContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useNavigation } from '../context/NavigationContext';
import { useRuntimeConfig } from '../context/RuntimeConfigContext';
import { ResultCard, EmptyCard } from '../components/ResultCard';
import { InfoBlock } from '../components/InfoBlock';
import { ListBlock } from '../components/ListBlock';
import PipelineFlow from '../components/PipelineFlow';
import { SelectionGroup, toggleSelection } from '../components/ContextSelector';

const FEEDBACK_OPTIONS: Array<{ label: string; action: FeedbackAction }> = [
  { label: '更极简', action: 'more-minimal' },
  { label: '更可爱', action: 'cuter' },
  { label: '更产品化', action: 'more-productized' },
  { label: '更有科技感', action: 'more-tech' },
  { label: '不喜欢', action: 'dislike-direction' },
];

/**
 * 发明页（推倒重建自 CreativeTab）。
 *
 * 核心变化（对照计划第三节）：
 * - 调度改走 PocketAgentDirector：idea → pocket.agent.invent（plan→research→reflect→structure）→ 计划图 GraphCanvas
 * - 召回延迟到计划图后：调研召回由 Director 的 ResearchAgent 内部完成，结果并入计划图节点，前端不再立即召回
 * - 计划图确认后 → pocket.agent.image 生图 → 图片节点并入全局记忆图
 * - 状态全部走 Context，无 props drilling
 */
export default function InventPage() {
  const { setStatusText, setErrorText, setNoticeText } = useToast();
  const { busyAction, setBusyAction } = useBusy();
  const { memory, setMemory } = useMemory();
  const { setArtifactHistory, setImageHistory } = useWorkspace();
  const { setPage } = useNavigation();
  const { config } = useRuntimeConfig();

  const [ideaText, setIdeaText] = useState('');
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [selectedArchiveNoteIds, setSelectedArchiveNoteIds] = useState<string[]>([]);
  const [artifact, setArtifact] = useState<ProductArtifact | null>(null);
  const [planGraph, setPlanGraph] = useState<GraphView | null>(null);
  const [lastFeedback, setLastFeedback] = useState('');

  const [burstActive, setBurstActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const inkRef = useRef<InkRippleHandle | null>(null);

  useEffect(() => {
    if (!ideaText || !textareaRef.current) return;
    const handle = window.setTimeout(() => {
      inkRef.current?.rippleAtCaret(textareaRef.current!);
    }, 80);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaText.length]);

  async function handleInvent() {
    if (!ideaText.trim()) return;
    setBusyAction('invent');
    setErrorText(''); setNoticeText(''); setLastFeedback('');
    setStatusText('正在生成计划图…');
    setBurstActive(false);
    requestAnimationFrame(() => setBurstActive(true));
    window.setTimeout(() => setBurstActive(false), 800);
    try {
      const response = await sendRuntimeMessage(
        createPocketAgentInventMessage({
          text: ideaText,
          selectedContextIds,
          selectedArchiveNoteIds,
          source: 'popup',
        }),
      );
      if (!response.success || !response.payload.result) {
        const msg = response.error ?? '生成失败。';
        setErrorText(msg); setStatusText(msg);
        return;
      }
      const { artifact: art, planGraph: graph, assistantSummary } = response.payload.result;
      setArtifact(art);
      setPlanGraph(graph);
      setMemory(response.payload.memorySummary);
      setArtifactHistory((cur) => [art, ...cur.filter((a) => a.id !== art.id)]);
      setStatusText(assistantSummary);
      setIdeaText(''); setSelectedContextIds([]); setSelectedArchiveNoteIds([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败。';
      setErrorText(msg); setStatusText(msg);
    } finally {
      setBusyAction('');
    }
  }

  async function handleImage() {
    if (!planGraph) return;
    setBusyAction('image');
    setErrorText('');
    setStatusText('正在生成图片…');
    try {
      const response = await sendRuntimeMessage(createPocketAgentImageMessage(planGraph));
      if (!response.success || !response.payload.result) {
        setErrorText(response.error ?? '图片生成失败。');
        return;
      }
      const { imageRecord } = response.payload.result;
      setMemory(response.payload.memorySummary);
      setImageHistory((cur) => [imageRecord, ...cur.filter((i) => i.id !== imageRecord.id)]);
      setNoticeText('图片已生成，已并入记忆图。');
      setPage('memory');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '图片生成失败。');
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

  async function handleCopy(text: string, ok: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNoticeText(ok);
    } catch {
      setErrorText('复制失败。');
    }
  }

  const inventing = busyAction === 'invent';

  return (
    <div className="tab-panel">
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Idea Inventor</p>
            <h2>想法发明器</h2>
          </div>
        </div>

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

        <div className="action-row" style={{ position: 'relative' }}>
          <LineButton
            variant="primary"
            onClick={handleInvent}
            disabled={Boolean(busyAction) || !ideaText.trim()}
          >
            {inventing ? '生成中…' : '生成计划图'}
          </LineButton>
          <PocketBurst active={burstActive} />
        </div>
      </section>

      <ProcessingStage active={inventing} avatar={config?.avatarId} hint="正在加工：规划 → 调研 → 反思 → 编排" />

      {planGraph ? (
        <motion.section
          className="panel-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="panel-head">
            <div>
              <p className="section-label">Plan Graph</p>
              <h2>计划图</h2>
            </div>
            <span className="timeline-badge timeline-badge--pipeline">{planGraph.nodes.length} 节点</span>
          </div>
          <GraphCanvas graph={planGraph} emptyHint="计划图还没长出节点。" />
        </motion.section>
      ) : null}

      {artifact ? (
        <StaggerStack triggerKey={artifact.id}>
          <ResultCard title="结果板">
            <p className="result-tagline">{artifact.concept.name}</p>
            <p className="soft-text">{artifact.concept.tagline}</p>
            <p className="soft-text">{artifact.concept.positioning}</p>

            <PipelineFlow trace={artifact.pipelineTrace} />

            <div className="token-list">
              {artifact.concept.features.map((f) => <span key={f} className="token-chip">{f}</span>)}
            </div>

            <div className="detail-grid concept-board">
              <InfoBlock label="方向" value={artifact.intent} />
              <InfoBlock label="工具" value={artifact.appliedGadgets.length > 0 ? artifact.appliedGadgets.join(' / ') : '无'} />
              <InfoBlock label="下一步" value={artifact.nextTasks.slice(0, 2).join(' / ') || '暂无'} />
              <div className="concept-board__list">
                <span className="memory-label">MVP 路径</span>
                <ListBlock items={artifact.mvpPlan} ordered />
              </div>
            </div>

            <div className="inline-actions">
              <LineButton variant="ghost" onClick={() => handleCopy(artifact.imagePrompt, 'Prompt 已复制')}>复制 Prompt</LineButton>
              <LineButton variant="secondary" onClick={handleImage} disabled={Boolean(busyAction)}>
                确认并生图
              </LineButton>
            </div>

            <div className="button-grid">
              {FEEDBACK_OPTIONS.map((item) => (
                <LineButton
                  key={item.action}
                  variant="secondary"
                  onClick={() => handleFeedback(item.action)}
                  disabled={Boolean(busyAction)}
                >
                  {item.label}
                </LineButton>
              ))}
            </div>

            {lastFeedback ? <p className="soft-text">{lastFeedback}</p> : null}
          </ResultCard>
        </StaggerStack>
      ) : (
        !inventing ? <EmptyCard avatar title="输入想法开始发明" body="输入一句话，PocketBuddy 会经规划→调研→反思→编排，给你一张计划图。" /> : null
      )}
    </div>
  );
}
