import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { motion } from 'framer-motion';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import LineButton from '@/components/LineArt/LineButton';
import StaggerStack from '@/components/StaggerStack/StaggerStack';
import PocketBurst from '@/components/PocketBurst/PocketBurst';
import InkRipple, { type InkRippleHandle } from '@/components/InkRipple/InkRipple';
import GraphCanvas from '@/components/GraphCanvas/GraphCanvas';
import ProcessingStage from '@/components/ProcessingStage/ProcessingStage';
import PlanBoard from '@/components/PlanBoard/PlanBoard';
import type { FeedbackAction, ProductArtifact } from '@/lib/agent/types';
import type { GeneratedImageRecord } from '@/lib/image/types';
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
 * 1. 输入想法 → 加工动画（规划/调研/反思/编排 阶段状态机，事件流同步）→ 精美 HTML 计划面板（PlanBoard）
 * 2. 计划后面以图展示关联笔记 + LLM 调研（GraphCanvas SVG，节点带标签，地位相同）
 * 3. 确认后点"生成计划图"→ 调用生图模型（gpt-image-2，用 planBoard 组装信息密集 prompt）→ 原地展示图片
 */
export default function InventPage() {
  const { setStatusText, setErrorText, setNoticeText } = useToast();
  const { busyAction, setBusyAction } = useBusy();
  const { memory, setMemory } = useMemory();
  const { setArtifactHistory, setImageHistory } = useWorkspace();
  const { config } = useRuntimeConfig();

  const [ideaText, setIdeaText] = useState('');
  const [selectedContextIds, setSelectedContextIds] = useState<string[]>([]);
  const [selectedArchiveNoteIds, setSelectedArchiveNoteIds] = useState<string[]>([]);
  const [artifact, setArtifact] = useState<ProductArtifact | null>(null);
  const [planGraph, setPlanGraph] = useState<GraphView | null>(null);
  const [generatedImage, setGeneratedImage] = useState<GeneratedImageRecord | null>(null);
  const [lastFeedback, setLastFeedback] = useState('');
  const [currentStage, setCurrentStage] = useState(0);

  const [burstActive, setBurstActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const inkRef = useRef<InkRippleHandle | null>(null);
  const planBoardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ideaText || !textareaRef.current) return;
    const handle = window.setTimeout(() => {
      inkRef.current?.rippleAtCaret(textareaRef.current!);
    }, 80);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaText.length]);

  // 监听 SW 流式推送的 AgentEvent，驱动加工阶段动画与真实 agent 同步（产品重设计反馈第1点）。
  // background 在 director 每个 agent emit 时推 pocket.agent.stream，这里映射 agentId→阶段索引。
  useEffect(() => {
    const listener = (msg: { type?: string; event?: { agentId?: string; status?: string } }) => {
      if (msg?.type !== 'pocket.agent.stream' || !msg.event) return;
      const s = eventToStage(msg.event.agentId, msg.event.status);
      if (s >= 0) setCurrentStage(s);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  async function handleInvent() {
    if (!ideaText.trim()) return;
    setBusyAction('invent');
    setErrorText(''); setNoticeText(''); setLastFeedback('');
    setGeneratedImage(null);
    setCurrentStage(0);
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
      // 保留 ideaText 不清空：用户能看到刚输入的想法（产品重设计反馈第3点）
      setSelectedContextIds([]); setSelectedArchiveNoteIds([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '生成失败。';
      setErrorText(msg); setStatusText(msg);
    } finally {
      setBusyAction('');
    }
  }

  /**
   * 生成计划图：调用生图模型（gpt-image-2），用 planBoard 组装信息密集 prompt。
   * 生成后在发明页原地展示图片（不跳走）。
   */
  async function handleImage() {
    if (!planGraph) return;
    setBusyAction('image');
    setErrorText('');
    setNoticeText('');
    setGeneratedImage(null);
    setStatusText('正在调用生图模型生成计划图…（异步任务，约 30-90 秒）');
    try {
      const response = await sendRuntimeMessage(createPocketAgentImageMessage(planGraph));
      if (!response.success || !response.payload.result) {
        setErrorText(response.error ?? '图片生成失败。');
        setStatusText(response.error ?? '图片生成失败。');
        return;
      }
      const { imageRecord } = response.payload.result;
      setGeneratedImage(imageRecord);
      setMemory(response.payload.memorySummary);
      setImageHistory((cur) => [imageRecord, ...cur.filter((i) => i.id !== imageRecord.id)]);
      if (imageRecord.status === 'done') {
        setNoticeText('计划图片已生成。');
        setStatusText('计划图片已生成。');
      } else {
        setErrorText(imageRecord.previewText ?? `图片未生成（${imageRecord.status}），请检查设置中的生图模型配置。`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '图片生成失败。';
      setErrorText(msg); setStatusText(msg);
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

  /** 导出 HTML 计划面板为 PDF：截图 PlanBoard DOM → jsPDF 分页 → 下载。 */
  async function exportPlanPdf() {
    const el = planBoardRef.current;
    if (!el || !planBoard) return;
    setBusyAction('export-pdf');
    setErrorText('');
    setStatusText('正在导出 PDF…');
    try {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#f4f8ff', useCORS: true, logging: false });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`${planBoard.name || 'plan-board'}.pdf`);
      setNoticeText('计划已导出为 PDF。');
      setStatusText('计划已导出为 PDF。');
    } catch (err) {
      setErrorText('PDF 导出失败：' + (err instanceof Error ? err.message : String(err)));
      setStatusText('PDF 导出失败。');
    } finally {
      setBusyAction('');
    }
  }

  /** 下载生成的计划图片：fetch → blob → 触发浏览器下载（降级：新标签打开）。 */
  async function exportImage() {
    if (!generatedImage?.imageUrl) return;
    setBusyAction('export-image');
    setErrorText('');
    try {
      const res = await fetch(generatedImage.imageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${generatedImage.request.title || 'plan-image'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNoticeText('计划图片已下载。');
    } catch {
      window.open(generatedImage.imageUrl, '_blank');
      setNoticeText('已在新标签打开图片，可右键另存。');
    } finally {
      setBusyAction('');
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
        currentStage={currentStage}
        hint="正在加工：规划 → 调研 → 反思 → 编排"
      />

      {planBoard && artifact ? (
        <StaggerStack triggerKey={artifact.id}>
          <div ref={planBoardRef}>
            {ideaText.trim() ? (
              <p className="soft-text plan-source-idea">💡 你的想法：{ideaText.trim()}</p>
            ) : null}
            <PlanBoard board={planBoard} intentLabel={labelIntent(artifact.intent)} />
          </div>

          <section className="panel-card plan-actions">
            <div className="inline-actions">
              <LineButton variant="primary" onClick={handleImage} disabled={Boolean(busyAction) || !planGraph}>
                {busyAction === 'image' ? '生图中…' : '生成计划图'}
              </LineButton>
              <LineButton
                variant="ghost"
                onClick={() => handleCopy(artifact.imagePrompt, 'Prompt 已复制')}
              >
                复制 Prompt
              </LineButton>
              <LineButton variant="ghost" onClick={exportPlanPdf} disabled={Boolean(busyAction)}>
                {busyAction === 'export-pdf' ? '导出中…' : '导出 PDF'}
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
            节点含你的笔记（召回）与 Agent 内置调研，地位相同。点开节点查看内容，可拖拽。
          </p>
        </motion.section>
      ) : null}

      <ProcessingStage active={busyAction === 'image'} avatar={config?.avatarId} mode="image" />

      {generatedImage ? (
        <motion.section
          className="panel-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="panel-head">
            <div>
              <p className="section-label">Plan Image</p>
              <h2>计划图片</h2>
            </div>
            <span className="micro-status">{generatedImage.model ?? 'image'}</span>
          </div>
          {generatedImage.status === 'done' && generatedImage.imageUrl ? (
            <>
              <img
                className="invent-image"
                src={generatedImage.imageUrl}
                alt={generatedImage.request.title}
              />
              <div className="inline-actions" style={{ marginTop: 8 }}>
                <LineButton variant="ghost" onClick={exportImage} disabled={Boolean(busyAction)}>
                  {busyAction === 'export-image' ? '下载中…' : '下载图片'}
                </LineButton>
              </div>
            </>
          ) : (
            <p className="soft-text">{generatedImage.previewText ?? `图片状态：${generatedImage.status}`}</p>
          )}
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

/** AgentEvent → ProcessingStage 阶段索引（事件流驱动动画与真实 agent 同步）。 */
function eventToStage(agentId?: string, status?: string): number {
  if (agentId === 'structure' && status === 'done') return 4; // 审查就绪
  switch (agentId) {
    case 'plan': return 0; // 规划
    case 'research': return 1; // 调研
    case 'reflect': return 2; // 反思
    case 'structure': return 3; // 编排（running）
    default: return -1; // 未知事件，不更新
  }
}
