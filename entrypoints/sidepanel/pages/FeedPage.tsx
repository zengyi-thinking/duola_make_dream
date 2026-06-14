import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import LineButton from '@/components/LineArt/LineButton';
import StaggerStack from '@/components/StaggerStack/StaggerStack';
import GraphCanvas from '@/components/GraphCanvas/GraphCanvas';
import ProcessingStage from '@/components/ProcessingStage/ProcessingStage';
import type {
  MemoryCandidate,
  PageAnalysisResult,
  PageContextRecord,
  PageReadResult,
} from '@/lib/agent/types';
import type { GraphView } from '@/lib/graph/types';
import {
  createArchiveSaveMessage,
  createImageGenerateMessage,
  createMemoryCandidateApproveMessage,
  createMemoryCandidateRejectMessage,
  createMindmapGenerateMessage,
  createPageReadMessage,
  createPocketAgentFeedMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import { useToast } from '../context/ToastContext';
import { useBusy } from '../context/BusyContext';
import { useMemory } from '../context/MemoryContext';
import { useNavigation } from '../context/NavigationContext';
import { useRuntimeConfig } from '../context/RuntimeConfigContext';
import { ResultCard, EmptyCard } from '../components/ResultCard';
import { ListBlock } from '../components/ListBlock';
import { InfoBlock } from '../components/InfoBlock';
import PipelineFlow from '../components/PipelineFlow';

/**
 * 喂养页（推倒重建自 ReadingTab）。
 *
 * 核心变化（对照计划第三节）：
 * - 流程：读取当前页 → pocket.agent.feed（Director 的 feedAgent）→ 知识节点图 GraphCanvas → 确认归档
 * - 不默认读取正文：仅用户点击「读取当前页」才触发 page 提取（安全约束保留）
 * - 召回 RecallPanel 移除：关联召回由 Director 内部完成并并入知识节点图
 * - 输出（知识卡/海报/图谱/路线）直接调 image/mindmap 消息，不再经 App 中转
 */
export default function FeedPage() {
  const { setStatusText, setErrorText, setNoticeText } = useToast();
  const { busyAction, setBusyAction } = useBusy();
  const { memory, setMemory } = useMemory();
  const { setPage } = useNavigation();
  const { config } = useRuntimeConfig();

  const [pageRead, setPageRead] = useState<PageReadResult | null>(null);
  const [pageContext, setPageContext] = useState<PageContextRecord | null>(null);
  const [pageAnalysis, setPageAnalysis] = useState<PageAnalysisResult | null>(null);
  const [feedGraph, setFeedGraph] = useState<GraphView | null>(null);

  const currentAnalysisCandidates = useMemo<MemoryCandidate[]>(() => {
    if (!pageAnalysis || !memory) return [];
    const candidateIds = new Set(pageAnalysis.memoryCandidates.map((c) => c.id));
    return memory.memoryCandidates.filter((c) => candidateIds.has(c.id));
  }, [memory, pageAnalysis]);

  async function handleReadCurrentPage() {
    setBusyAction('page-read');
    setErrorText(''); setNoticeText('');
    setStatusText('正在读取当前页…');
    try {
      const response = await sendRuntimeMessage(createPageReadMessage());
      if (!response.success) { setErrorText(response.error ?? '当前页读取失败。'); return; }
      setPageRead(response.payload.page);
      setPageContext(response.payload.savedContext);
      setPageAnalysis(null);
      setFeedGraph(null);
      setMemory(response.payload.memorySummary);
      setNoticeText('这一页已被读进临时口袋，可以加工成知识节点图。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '当前页读取失败。');
    } finally {
      setBusyAction('');
    }
  }

  async function handleFeed() {
    if (!pageRead || !pageContext) return;
    setBusyAction('feed');
    setErrorText(''); setNoticeText('');
    setStatusText('正在加工知识节点图…');
    try {
      const response = await sendRuntimeMessage(
        createPocketAgentFeedMessage({ page: pageRead, context: pageContext }),
      );
      if (!response.success || !response.payload.result) {
        setErrorText(response.error ?? '加工失败。');
        return;
      }
      const { analysis, feedGraph: graph } = response.payload.result;
      setPageAnalysis(analysis);
      setFeedGraph(graph);
      setMemory(response.payload.memorySummary);
      setNoticeText('知识节点图已就绪，可确认归档或调整候选记忆。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '加工失败。');
    } finally {
      setBusyAction('');
    }
  }

  async function handleArchive() {
    if (!pageAnalysis || !pageContext) return;
    setBusyAction('archive-save');
    setErrorText('');
    setStatusText('正在归档…');
    try {
      const response = await sendRuntimeMessage(
        createArchiveSaveMessage({ analysis: pageAnalysis, sourceContext: pageContext }),
      );
      if (!response.success) { setErrorText(response.error ?? '保存笔记失败。'); return; }
      setMemory(response.payload.memorySummary);
      setNoticeText('已归档为一条笔记，节点已并入记忆图。');
      setPage('memory');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '保存笔记失败。');
    } finally {
      setBusyAction('');
    }
  }

  async function handleApproveCandidate(candidateId: string) {
    setBusyAction(`candidate-approve-${candidateId}`);
    try {
      const response = await sendRuntimeMessage(createMemoryCandidateApproveMessage(candidateId));
      if (!response.success) { setErrorText(response.error ?? '记忆批准失败。'); return; }
      setMemory(response.payload.memorySummary);
      setNoticeText(`已记住：${response.payload.candidate.title}`);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '记忆批准失败。');
    } finally {
      setBusyAction('');
    }
  }

  async function handleRejectCandidate(candidateId: string) {
    setBusyAction(`candidate-reject-${candidateId}`);
    try {
      const response = await sendRuntimeMessage(createMemoryCandidateRejectMessage(candidateId));
      if (!response.success) { setErrorText(response.error ?? '记忆拒绝失败。'); return; }
      setMemory(response.payload.memorySummary);
      setNoticeText(`已忽略：${response.payload.candidate.title}`);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '记忆拒绝失败。');
    } finally {
      setBusyAction('');
    }
  }

  async function handleApproveAll() {
    if (busyAction) return;
    setBusyAction('candidate-approve-all');
    try {
      const pending = currentAnalysisCandidates.filter((c) => c.status === 'pending');
      for (const candidate of pending) {
        const response = await sendRuntimeMessage(createMemoryCandidateApproveMessage(candidate.id));
        if (!response.success) { setErrorText(response.error ?? '批量记忆出错。'); return; }
        setMemory(response.payload.memorySummary);
      }
      setNoticeText('当前这批可记住的信息都已进入长期记忆。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '批量记忆出错。');
    } finally {
      setBusyAction('');
    }
  }

  async function handleRejectAll() {
    if (busyAction) return;
    setBusyAction('candidate-reject-all');
    try {
      const pending = currentAnalysisCandidates.filter((c) => c.status === 'pending');
      for (const candidate of pending) {
        const response = await sendRuntimeMessage(createMemoryCandidateRejectMessage(candidate.id));
        if (!response.success) { setErrorText(response.error ?? '批量拒绝出错。'); return; }
        setMemory(response.payload.memorySummary);
      }
      setNoticeText('当前这批候选记忆都已被忽略。');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '批量拒绝出错。');
    } finally {
      setBusyAction('');
    }
  }

  async function handleGenerateImage(sourceType: 'paper-note' | 'article-note', style: 'knowledge-card' | 'poster') {
    if (!pageAnalysis) return;
    setBusyAction(`image-${style}`);
    setErrorText('');
    try {
      const response = await sendRuntimeMessage(
        createImageGenerateMessage({
          sourceType,
          title: pageAnalysis.noteCard.title,
          content: style === 'knowledge-card'
            ? `${pageAnalysis.pageSummary}\n${pageAnalysis.noteCard.bullets.join('\n')}`
            : pageAnalysis.pageSummary,
          style,
        }),
      );
      if (!response.success) { setErrorText(response.error ?? '图片请求失败。'); return; }
      setMemory(response.payload.memorySummary);
      setNoticeText('图片已生成。');
      setPage('observe');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '图片请求失败。');
    } finally {
      setBusyAction('');
    }
  }

  async function handleGenerateMindmap(title: string, content: string) {
    if (!pageAnalysis || !pageContext) return;
    setBusyAction('mindmap');
    setErrorText('');
    try {
      const response = await sendRuntimeMessage(
        createMindmapGenerateMessage({
          sourceId: pageContext.id ?? pageAnalysis.id,
          sourceType: pageAnalysis.pageType === 'paper' ? 'paper' : 'article',
          title,
          content,
        }),
      );
      if (!response.success) { setErrorText(response.error ?? '图谱生成失败。'); return; }
      setMemory(response.payload.memorySummary);
      setNoticeText('图谱已生成。');
      setPage('observe');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '图谱生成失败。');
    } finally {
      setBusyAction('');
    }
  }

  const feeding = busyAction === 'feed';

  return (
    <div className="tab-panel">
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Page Feeder</p>
            <h2>把这一页喂给 Agent</h2>
          </div>
          <span className="micro-status">不会默认读取正文</span>
        </div>

        <div className="button-grid">
          <LineButton variant="primary" onClick={handleReadCurrentPage} disabled={Boolean(busyAction)}>
            读取当前页
          </LineButton>
          <LineButton
            variant="secondary"
            onClick={handleFeed}
            disabled={Boolean(busyAction) || !pageRead}
          >
            加工成知识图
          </LineButton>
          <LineButton
            variant="ghost"
            onClick={handleArchive}
            disabled={Boolean(busyAction) || !pageAnalysis || !pageContext}
          >
            确认归档
          </LineButton>
        </div>

        {pageRead ? (
          <div className="read-grid">
            <InfoBlock label="页面标题" value={pageRead.pageTitle} />
            <InfoBlock label="Origin" value={pageRead.origin} />
            <InfoBlock label="Page Type" value={pageRead.pageType} />
            <div className="reading-summary">
              <span className="memory-label">Summary</span>
              <p className="reading-summary__preview">{formatPreview(pageRead.visibleTextSummary ?? '暂无', 180)}</p>
            </div>
          </div>
        ) : (
          <p className="soft-text">点击「读取当前页」后，PocketBuddy 才会提取这一页的结构化内容。</p>
        )}
      </section>

      <ProcessingStage active={feeding} avatar={config?.avatarId} hint="正在加工知识节点图…" />

      {feedGraph ? (
        <motion.section className="panel-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="panel-head">
            <div>
              <p className="section-label">Knowledge Graph</p>
              <h2>知识节点图</h2>
            </div>
            <span className="timeline-badge timeline-badge--pipeline">{feedGraph.nodes.length} 节点</span>
          </div>
          <GraphCanvas graph={feedGraph} emptyHint="知识图还没长出节点。" />
        </motion.section>
      ) : null}

      {pageAnalysis ? (
        <StaggerStack triggerKey={pageAnalysis.id} className="stack">
          <ResultCard title="阅读地图">
            <p className="result-tagline">{pageAnalysis.pageSummary}</p>
            <PipelineFlow trace={pageAnalysis.pipelineTrace} />
            <div className="detail-grid reading-map__meta">
              <InfoBlock label="标题" value={pageRead?.pageTitle ?? pageAnalysis.noteCard.title} />
              <InfoBlock label="类型" value={pageRead?.pageType ?? 'page'} />
              <InfoBlock label="来源" value={pageRead?.origin ?? '当前页面'} />
              <InfoBlock label="要点数" value={`${pageAnalysis.keyIdeas.length} / ${pageAnalysis.keyTakeaways.length} / ${pageAnalysis.productOpportunities.length}`} />
            </div>

            <div className="reading-map__columns">
              <ChipColumn title="关键点" items={pageAnalysis.keyIdeas} />
              <ChipColumn title="结论" items={pageAnalysis.keyTakeaways} />
              <ChipColumn title="机会" items={pageAnalysis.productOpportunities} />
              <ChipColumn title="对当前想法" items={pageAnalysis.usefulForCurrentIdea} />
            </div>

            {pageAnalysis.paperInsights ? (
              <details className="reading-accordion">
                <summary>论文深读</summary>
                <div className="detail-grid" style={{ marginTop: 8 }}>
                  <InfoBlock label="Problem" value={pageAnalysis.paperInsights.problem} />
                  <InfoBlock label="Method" value={pageAnalysis.paperInsights.method} />
                  <InfoBlock label="Contribution" value={pageAnalysis.paperInsights.contribution} />
                  <InfoBlock label="Conclusion" value={pageAnalysis.paperInsights.conclusion} />
                </div>
                <div className="subsection">
                  <h4>Relation To My Projects</h4>
                  <ListBlock items={pageAnalysis.paperInsights.relationToMyProjects} />
                </div>
              </details>
            ) : null}
          </ResultCard>

          <ResultCard title="记忆候选">
            <div className="inline-actions">
              <LineButton variant="secondary" onClick={handleApproveAll} disabled={currentAnalysisCandidates.length === 0 || Boolean(busyAction)}>
                全部记住
              </LineButton>
              <LineButton variant="ghost" onClick={handleRejectAll} disabled={currentAnalysisCandidates.length === 0 || Boolean(busyAction)}>
                全部不记住
              </LineButton>
            </div>
            {currentAnalysisCandidates.length ? (
              <div className="candidate-stack">
                {currentAnalysisCandidates.map((candidate) => (
                  <div key={candidate.id} className="candidate-card">
                    <div className="candidate-head">
                      <strong>{candidate.title}</strong>
                      <span className={`status-pill status-pill--${candidate.status}`}>{candidate.status}</span>
                    </div>
                    <p className="soft-text">{candidate.content}</p>
                    <p className="micro-copy">{candidate.reason}</p>
                    <div className="inline-actions">
                      <LineButton variant="secondary" onClick={() => handleApproveCandidate(candidate.id)} disabled={candidate.status !== 'pending' || Boolean(busyAction)}>
                        单条记住
                      </LineButton>
                      <LineButton variant="ghost" onClick={() => handleRejectCandidate(candidate.id)} disabled={candidate.status !== 'pending' || Boolean(busyAction)}>
                        不记住
                      </LineButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="soft-text">分析后的候选记忆会出现在这里。</p>
            )}
          </ResultCard>

          <ResultCard title="输出">
            <div className="button-grid">
              <LineButton
                variant="secondary"
                onClick={() => handleGenerateImage(pageAnalysis.pageType === 'paper' ? 'paper-note' : 'article-note', 'knowledge-card')}
                disabled={Boolean(busyAction)}
              >
                生成知识卡
              </LineButton>
              <LineButton
                variant="ghost"
                onClick={() => handleGenerateImage(pageAnalysis.pageType === 'paper' ? 'paper-note' : 'article-note', 'poster')}
                disabled={Boolean(busyAction)}
              >
                学习海报
              </LineButton>
              <LineButton
                variant="secondary"
                onClick={() => handleGenerateMindmap(
                  `${pageAnalysis.noteCard.title} 图谱`,
                  [pageAnalysis.pageSummary, ...pageAnalysis.keyIdeas, ...pageAnalysis.productOpportunities].join('；'),
                )}
                disabled={Boolean(busyAction)}
              >
                生成图谱
              </LineButton>
              <LineButton
                variant="ghost"
                onClick={() => handleGenerateMindmap(
                  `${pageAnalysis.noteCard.title} 路线图`,
                  [...pageAnalysis.keyTakeaways, ...(pageAnalysis.paperInsights?.relationToMyProjects ?? [])].join('；'),
                )}
                disabled={Boolean(busyAction)}
              >
                研究路线
              </LineButton>
            </div>
          </ResultCard>
        </StaggerStack>
      ) : (
        !feeding && !pageRead ? <EmptyCard avatar title="先读取，再喂养" body="点击「读取当前页」，PocketBuddy 会提炼摘要并加工成知识节点图。" /> : null
      )}
    </div>
  );
}

function ChipColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="reading-band">
      <div className="reading-band__head">
        <span className="memory-label">{title}</span>
        <span className="micro-status">{items.length}</span>
      </div>
      <div className="token-list reading-band__chips">
        {items.length > 0 ? items.slice(0, 5).map((item) => (
          <span key={item} className="token-chip">{item}</span>
        )) : <span className="soft-text">暂无</span>}
      </div>
    </section>
  );
}

function formatPreview(text: string, maxLength: number) {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength).trimEnd()}…`;
}
