import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { browser } from 'wxt/browser';
import LineButton from '@/components/LineArt/LineButton';
import StaggerStack from '@/components/StaggerStack/StaggerStack';
import GraphCanvas from '@/components/GraphCanvas/GraphCanvas';
import ProcessingStage from '@/components/ProcessingStage/ProcessingStage';
import FeedReport from '@/components/FeedReport/FeedReport';
import type {
  PageAnalysisResult,
  PageContextRecord,
  PageReadResult,
} from '@/lib/agent/types';
import type { GraphView } from '@/lib/graph/types';
import {
  createArchiveSaveMessage,
  createPageReadMessage,
  createPocketAgentFeedMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import { useToast } from '../context/ToastContext';
import { useBusy } from '../context/BusyContext';
import { useMemory } from '../context/MemoryContext';
import { useNavigation } from '../context/NavigationContext';
import { useRuntimeConfig } from '../context/RuntimeConfigContext';
import { EmptyCard } from '../components/ResultCard';

/**
 * 喂养页（产品重设计修复版）。
 *
 * 流程：读取当前页 → 加工成报告（feed 事件流驱动 3 阶段动画）→ FeedReport HTML 报告
 *      → 关联知识图 → 确认归档为笔记节点（跳记忆页看图节点）。
 * 移除：记忆候选板（与确认归档重复）、输出板（与 FeedReport 重复）。
 * 保留：keep-alive 下切换不丢记录；New 按钮主动开新喂养。
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
  const [currentStage, setCurrentStage] = useState(0);

  // 监听 SW 流式推送的 feed AgentEvent，驱动加工阶段动画与真实 agent 同步（同 InventPage 模式）。
  useEffect(() => {
    const listener = (msg: { type?: string; event?: { agentId?: string; status?: string } }) => {
      if (msg?.type !== 'pocket.agent.stream' || !msg.event) return;
      if (msg.event.agentId !== 'feed') return; // 只处理 feed 链路事件
      if (msg.event.status === 'running') setCurrentStage(1); // 分析中（LLM 慢点停留）
      else if (msg.event.status === 'done') setCurrentStage(2); // 就绪
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

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
      setNoticeText('这一页已被读进口袋，点"加工成报告"生成阅读报告。');
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
    setCurrentStage(0); // 提取阶段
    setStatusText('正在分析页面…');
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
      setNoticeText('阅读报告已生成，确认无误后可归档为笔记节点。');
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
      setNoticeText('已归档为笔记节点，跳转记忆页查看图节点。');
      setPage('memory');
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '保存笔记失败。');
    } finally {
      setBusyAction('');
    }
  }

  /** 开始新喂养：清空当前记录（keep-alive 下切换不丢，New 主动开新）。 */
  function handleNew() {
    setPageRead(null);
    setPageContext(null);
    setPageAnalysis(null);
    setFeedGraph(null);
    setCurrentStage(0);
    setErrorText(''); setNoticeText(''); setStatusText('');
  }

  const feeding = busyAction === 'feed';
  const hasRecord = Boolean(pageRead || pageAnalysis);

  return (
    <div className="tab-panel">
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Page Feeder</p>
            <h2>把这一页喂给 Agent</h2>
          </div>
          {hasRecord ? (
            <LineButton variant="ghost" onClick={handleNew} disabled={Boolean(busyAction)}>New</LineButton>
          ) : (
            <span className="micro-status">不会默认读取正文</span>
          )}
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
            加工成报告
          </LineButton>
          <LineButton
            variant="ghost"
            onClick={handleArchive}
            disabled={Boolean(busyAction) || !pageAnalysis || !pageContext}
          >
            确认归档
          </LineButton>
        </div>

        {pageRead && !pageAnalysis ? (
          <div className="read-confirm">
            <strong>已读取：{pageRead.pageTitle}</strong>
            <p className="soft-text">{pageRead.origin} · {pageRead.pageType}</p>
            <p className="soft-text">点"加工成报告"，Agent 会提炼关键点/结论/机会并生成阅读报告。</p>
          </div>
        ) : null}
      </section>

      <ProcessingStage
        active={feeding}
        avatar={config?.avatarId}
        mode="feed"
        currentStage={currentStage}
      />

      {pageAnalysis ? (
        <StaggerStack triggerKey={pageAnalysis.id}>
          <FeedReport analysis={pageAnalysis} origin={pageRead?.origin} />
        </StaggerStack>
      ) : (
        !feeding && !pageRead ? <EmptyCard avatar title="先读取，再喂养" body="点击「读取当前页」，PocketBuddy 会提炼关键信息并生成阅读报告，归档后成为记忆图节点。" /> : null
      )}

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
    </div>
  );
}
