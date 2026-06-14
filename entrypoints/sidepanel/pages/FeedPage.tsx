import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { browser } from 'wxt/browser';
import LineButton from '@/components/LineArt/LineButton';
import StaggerStack from '@/components/StaggerStack/StaggerStack';
import GraphCanvas from '@/components/GraphCanvas/GraphCanvas';
import ProcessingStage from '@/components/ProcessingStage/ProcessingStage';
import FeedReport from '@/components/FeedReport/FeedReport';
import type {
  ContextSnippet,
  PageAnalysisResult,
  PageContextRecord,
  PageReadResult,
} from '@/lib/agent/types';
import type { GraphView } from '@/lib/graph/types';
import {
  createArchiveSaveMessage,
  createMemoryGetMessage,
  createPageReadMessage,
  createPocketAgentFeedMessage,
  createPocketSnippetsSynthesizeMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import { useToast } from '../context/ToastContext';
import { useBusy } from '../context/BusyContext';
import { useMemory } from '../context/MemoryContext';
import { useNavigation } from '../context/NavigationContext';
import { useRuntimeConfig } from '../context/RuntimeConfigContext';
import { EmptyCard } from '../components/ResultCard';

/**
 * 喂养页（产品重设计修复 + 划词归纳版）。
 *
 * 流程：读取当前页 → 加工成报告（feed 事件流驱动 3 阶段动画）→ FeedReport HTML 报告
 *      → 关联知识图 → 确认归档为笔记节点（跳记忆页看图节点）。
 * 划词功能：contextSnippets 全量展示（可删单条），≥3 时可"归纳成文档"（LLM 归纳 → ArchiveNote + 图节点）。
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
  const [snippets, setSnippets] = useState<ContextSnippet[]>([]);

  // 监听 SW 流式推送的 feed AgentEvent，驱动加工阶段动画与真实 agent 同步。
  useEffect(() => {
    const listener = (msg: { type?: string; event?: { agentId?: string; status?: string } }) => {
      if (msg?.type !== 'pocket.agent.stream' || !msg.event) return;
      if (msg.event.agentId !== 'feed') return;
      if (msg.event.status === 'running') setCurrentStage(1);
      else if (msg.event.status === 'done') setCurrentStage(2);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);

  // 拉取全部划词碎片（归档后 memorySummary 会更新，但本地 snippets 用于管理/删除）
  async function refreshSnippets() {
    try {
      const res = await sendRuntimeMessage(createMemoryGetMessage());
      if (res.success && res.payload) {
        setSnippets(res.payload.recentContextSnippets);
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void refreshSnippets();
  }, [memory?.recentContextSnippets?.length]);

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
    setCurrentStage(0);
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

  /** 把划词碎片归纳成知识笔记（LLM 归纳 → ArchiveNote + 图节点）。 */
  async function handleSynthesizeSnippets() {
    if (snippets.length < 3) return;
    setBusyAction('snippets-synthesize');
    setErrorText(''); setNoticeText('');
    setStatusText(`正在用 LLM 归纳 ${snippets.length} 条划词碎片…`);
    try {
      const response = await sendRuntimeMessage(createPocketSnippetsSynthesizeMessage());
      if (!response.success) { setErrorText(response.error ?? '归纳失败。'); return; }
      const result = response.payload as { note: { title: string; bullets?: string[] } | null; memorySummary?: { recentContextSnippets: ContextSnippet[] } };
      if (result.memorySummary && memory) {
        setMemory({ ...memory, recentContextSnippets: result.memorySummary.recentContextSnippets });
        setSnippets(result.memorySummary.recentContextSnippets);
      }
      if (result.note) {
        setNoticeText(`已归纳为笔记：${result.note.title}（${result.note.bullets?.length ?? 0} 要点），可在记忆页查看。`);
      }
      await refreshSnippets();
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '归纳失败。');
    } finally {
      setBusyAction('');
    }
  }

  /** 删除单个碎片。 */
  async function handleDeleteSnippet(snippetId: string) {
    setSnippets((cur) => cur.filter((s) => s.id !== snippetId));
    if (memory) {
      const next = { ...memory, recentContextSnippets: memory.recentContextSnippets.filter((s) => s.id !== snippetId) };
      setMemory(next);
    }
    try {
      const { deleteContextSnippet } = await import('@/lib/memory');
      await deleteContextSnippet(snippetId);
    } catch {
      /* ignore */
    }
  }

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
  const canSynthesize = snippets.length >= 3;
  const suggestSynthesize = snippets.length >= 8;

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

      {/* 划词碎片管理区 */}
      {snippets.length > 0 ? (
        <section className="panel-card">
          <div className="panel-head">
            <div>
              <p className="section-label">Snippets</p>
              <h2>知识碎片</h2>
            </div>
            <span className="timeline-badge timeline-badge--pipeline">{snippets.length} 条</span>
          </div>
          <div className="snippets-panel">
            {snippets.map((s) => (
              <div key={s.id} className="snippet-item">
                <div className="snippet-item__head">
                  <span className="snippet-item__source">{s.pageTitle} · {safeHost(s.origin)}</span>
                  <button type="button" className="snippet-item__remove" onClick={() => handleDeleteSnippet(s.id)} disabled={Boolean(busyAction)}>删除</button>
                </div>
                <p className="snippet-item__text">{s.selectedText}</p>
              </div>
            ))}
          </div>
          <div className="inline-actions" style={{ marginTop: 8 }}>
            <LineButton
              variant="primary"
              onClick={handleSynthesizeSnippets}
              disabled={!canSynthesize || Boolean(busyAction)}
            >
              {busyAction === 'snippets-synthesize' ? '归纳中…' : '归纳成文档'}
            </LineButton>
            {suggestSynthesize ? <span className="micro-status">碎片已达 {snippets.length} 条，建议归纳</span> : null}
            {!canSynthesize ? <span className="micro-status">至少 3 条碎片可归纳（当前 {snippets.length}）</span> : null}
          </div>
        </section>
      ) : null}

      {pageAnalysis ? (
        <StaggerStack triggerKey={pageAnalysis.id}>
          <FeedReport analysis={pageAnalysis} origin={pageRead?.origin} />
        </StaggerStack>
      ) : (
        !feeding && !pageRead ? <EmptyCard avatar title="先读取，再喂养" body="点击「读取当前页」，PocketBuddy 会提炼关键信息并生成阅读报告，归档后成为记忆图节点。或在任意网页划词积累，碎片足够多后归纳成文档。" /> : null
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

function safeHost(origin: string): string {
  try {
    return new URL(origin).hostname.replace(/^www\./, '');
  } catch {
    return origin;
  }
}
