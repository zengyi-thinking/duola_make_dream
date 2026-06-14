import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import LineButton from '@/components/LineArt/LineButton';
import StaggerStack from '@/components/StaggerStack/StaggerStack';
import PocketBurst from '@/components/PocketBurst/PocketBurst';
import InkRipple, { type InkRippleHandle } from '@/components/InkRipple/InkRipple';
import GraphCanvas from '@/components/GraphCanvas/GraphCanvas';
import ProcessingStage from '@/components/ProcessingStage/ProcessingStage';
import PlanBoard from '@/components/PlanBoard/PlanBoard';
import InfographicPanel from '@/components/InfographicPanel/InfographicPanel';
import type { FeedbackAction, ProductArtifact } from '@/lib/agent/types';
import type { GraphView } from '@/lib/graph/types';
import {
  createFeedbackMessage,
  createPocketAgentInventMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import { useToast } from '../context/ToastContext';
import { useBusy } from '../context/BusyContext';
import { useMemory } from '../context/MemoryContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { useRuntimeConfig } from '../context/RuntimeConfigContext';
import { EmptyCard } from '../components/ResultCard';
import { SelectionGroup, toggleSelection } from '../components/ContextSelector';

const FEEDBACK_OPTIONS: Array<{ label: string; action: FeedbackAction }> = [
  { label: '更极简', action: 'more-minimal' },
  { label: '更可爱', action: 'cuter' },
  { label: '更产品化', action: 'more-productized' },
  { label: '更有科技感', action: 'more-tech' },
  { label: '不喜欢', action: 'dislike-direction' },
];

/**
 * 发明页（产品重设计全链路版）。
 *
 * 三大功能：
 * 1. 输入想法 → 加工动画（规划/调研/反思/编排/审查 阶段状态机）→ 精美 HTML 计划面板（PlanBoard）
 * 2. 计划后面以图展示关联笔记 + LLM 调研（GraphCanvas，节点带标签，地位相同）
 * 3. 确认后点"生成计划图"→ HTML 信息图（InfographicPanel）原地展示（不跳走，不调文生图）
 */
export default function InventPage() {
  const { setStatusText, setErrorText, setNoticeText } = useToast();
  const { busyAction, setBusyAction } = useBusy();
  const { memory, setMemory } = useMemory();
  const { setArtifactHistory } = useWorkspace();
  const { config } = useRuntimeConfig();

  const [ideaText, setIdeaText] = useState('');
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [selectedArchiveNoteIds, setSelectedArchiveNoteIds] = useState<string[]>([]);
  const [artifact, setArtifact] = useState<ProductArtifact | null>(null);
  const [planGraph, setPlanGraph] = useState<GraphView | null>(null);
  const [showInfographic, setShowInfographic] = useState(false);
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
    setShowInfographic(false);
    setStatusText('正在生成计划…');
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

  /**
   * 生成计划图：不再调文生图（中文渲染会乱码），改为前端用 planBoard 渲染 HTML 信息图原地展示。
   * 短暂播放 image 模式动画后展示 InfographicPanel。
   */
  async function handleImage() {
    if (!artifact?.planBoard) return;
    setBusyAction('image');
    setErrorText('');
    setStatusText('正在生成计划图…');
    await new Promise<void>((resolve) => window.setTimeout(resolve, 1100));
    setShowInfographic(true);
    setNoticeText('计划信息图已生成。');
    setStatusText('计划信息图已生成，可继续调整或开始下一个想法。');
    setBusyAction('');
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
  const planBoard = artifact?.planBoard;

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
            placeholder="输入一个想法，比如：我想要开一家拉面店"
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
            {inventing ? '生成中…' : '生成计划'}
          </LineButton>
          <PocketBurst active={burstActive} />
        </div>
      </section>

      <ProcessingStage
        active={inventing}
        avatar={config?.avatarId}
        mode="invent"
        hint="正在加工：规划 → 调研 → 反思 → 编排 → 审查"
      />

      {planBoard && artifact ? (
        <StaggerStack triggerKey={artifact.id}>
          <PlanBoard board={planBoard} intentLabel={labelIntent(artifact.intent)} />

          <section className="panel-card plan-actions">
            <div className="inline-actions">
              <LineButton variant="primary" onClick={handleImage} disabled={Boolean(busyAction)}>
                {busyAction === 'image' ? '生成中…' : '生成计划图'}
              </LineButton>
              <LineButton
                variant="ghost"
                onClick={() => handleCopy(artifact.imagePrompt, 'Prompt 已复制')}
              >
                复制 Prompt
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
          </section>
        </StaggerStack>
      ) : (
        !inventing ? <EmptyCard avatar title="输入想法开始发明" body="输入一句话，PocketBuddy 会经规划→调研→反思→编排，给你一份信息密集的计划面板。" /> : null
      )}

      {planGraph ? (
        <motion.section
          className="panel-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="panel-head">
            <div>
              <p className="section-label">Related Graph</p>
              <h2>关联图（笔记 + 调研）</h2>
            </div>
            <span className="timeline-badge timeline-badge--pipeline">{planGraph.nodes.length} 节点</span>
          </div>
          <GraphCanvas graph={planGraph} emptyHint="关联图还没长出节点。" />
          <p className="soft-text" style={{ marginTop: 8 }}>
            节点含你的笔记（召回）与 Agent 内置调研，地位相同。点开节点查看内容。
          </p>
        </motion.section>
      ) : null}

      <ProcessingStage active={busyAction === 'image'} avatar={config?.avatarId} mode="image" />

      {showInfographic && planBoard ? (
        <motion.section
          className="panel-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="panel-head">
            <div>
              <p className="section-label">Plan Infographic</p>
              <h2>计划信息图（16:9）</h2>
            </div>
          </div>
          <InfographicPanel board={planBoard} createdAt={artifact?.createdAt} />
        </motion.section>
      ) : null}
    </div>
  );
}

function labelIntent(intent: ProductArtifact['intent']): string {
  switch (intent) {
    case 'browser-extension': return '浏览器插件';
    case 'creator-tool': return '创作工具';
    case 'learning-tool': return '学习工具';
    case 'playful-tool': return '陪伴型小工具';
    default: return '效率工具';
  }
}
