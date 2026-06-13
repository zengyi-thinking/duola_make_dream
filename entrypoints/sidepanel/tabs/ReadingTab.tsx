import type { Dispatch, SetStateAction } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import type {
  MemoryCandidate,
  MemorySummary,
  PageAnalysisResult,
  PageContextRecord,
  PageReadResult,
} from '@/lib/agent/types';
import {
  createArchiveSaveMessage,
  createMemoryCandidateApproveMessage,
  createMemoryCandidateRejectMessage,
  createPageAnalyzeMessage,
  createPageReadMessage,
  sendRuntimeMessage,
} from '@/lib/messaging/bus';
import { ResultCard, EmptyCard } from '../components/ResultCard';
import { ListBlock } from '../components/ListBlock';
import { InfoBlock } from '../components/InfoBlock';
import { useMemo } from 'react';

interface ReadingTabProps {
  memory: MemorySummary | null;
  pageRead: PageReadResult | null;
  pageContext: PageContextRecord | null;
  pageAnalysis: PageAnalysisResult | null;
  busyAction: string;
  setBusyAction: Dispatch<SetStateAction<string>>;
  setMemory: Dispatch<SetStateAction<MemorySummary | null>>;
  setErrorText: Dispatch<SetStateAction<string>>;
  setNoticeText: Dispatch<SetStateAction<string>>;
  setPageRead: Dispatch<SetStateAction<PageReadResult | null>>;
  setPageContext: Dispatch<SetStateAction<PageContextRecord | null>>;
  setPageAnalysis: Dispatch<SetStateAction<PageAnalysisResult | null>>;
  setSelectedArchiveNoteId: Dispatch<SetStateAction<string>>;
  setActiveTab: (tab: string) => void;
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
}

export default function ReadingTab(props: ReadingTabProps) {
  const {
    memory, pageRead, pageContext, pageAnalysis, busyAction, setBusyAction,
    setMemory, setErrorText, setNoticeText, setPageRead, setPageContext, setPageAnalysis,
    setSelectedArchiveNoteId, setActiveTab, onGenerateImage, onGenerateMindmap,
  } = props;

  const currentAnalysisCandidates = useMemo(() => {
    if (!pageAnalysis || !memory) return [] as MemoryCandidate[];
    const candidateIds = new Set(pageAnalysis.memoryCandidates.map((c) => c.id));
    return memory.memoryCandidates.filter((c) => candidateIds.has(c.id));
  }, [memory, pageAnalysis]);

  async function handleReadCurrentPage() {
    setBusyAction('page-read');
    setErrorText('');
    setNoticeText('');

    const response = await sendRuntimeMessage(createPageReadMessage());
    setBusyAction('');

    if (!response.success) { setErrorText(response.error ?? '当前页读取失败。'); return; }

    setPageRead(response.payload.page);
    setPageContext(response.payload.savedContext);
    setPageAnalysis(null);
    setMemory(response.payload.memorySummary);
    setActiveTab('reading');
    setNoticeText('这一页已经被 PocketBuddy 读进临时口袋。');
  }

  async function handleAnalyzeCurrentPage() {
    setBusyAction('page-analyze');
    setErrorText('');
    setNoticeText('');

    const response = await sendRuntimeMessage(createPageAnalyzeMessage());
    setBusyAction('');

    if (!response.success) { setErrorText(response.error ?? '页面分析失败。'); return; }

    setPageRead(response.payload.page);
    setPageContext(response.payload.savedContext);
    setPageAnalysis(response.payload.analysis);
    setMemory(response.payload.memorySummary);
    setActiveTab('reading');
    setNoticeText('PocketBuddy 已经完成这一页的结构化分析。');
  }

  async function handleSaveAnalysisAsNote() {
    if (!pageAnalysis || !pageContext) return;

    setBusyAction('archive-save');
    setErrorText('');
    const response = await sendRuntimeMessage(createArchiveSaveMessage({ analysis: pageAnalysis, sourceContext: pageContext }));
    setBusyAction('');

    if (!response.success) { setErrorText(response.error ?? '保存笔记失败。'); return; }

    setMemory(response.payload.memorySummary);
    setSelectedArchiveNoteId(response.payload.note.id);
    setNoticeText('这次阅读结果已经保存为一条笔记。');
  }

  async function handleApproveCandidate(candidateId: string) {
    setBusyAction(`candidate-approve-${candidateId}`);
    const response = await sendRuntimeMessage(createMemoryCandidateApproveMessage(candidateId));
    setBusyAction('');
    if (!response.success) { setErrorText(response.error ?? '记忆批准失败。'); return; }
    setMemory(response.payload.memorySummary);
    setNoticeText(`已记住：${response.payload.candidate.title}`);
  }

  async function handleRejectCandidate(candidateId: string) {
    setBusyAction(`candidate-reject-${candidateId}`);
    const response = await sendRuntimeMessage(createMemoryCandidateRejectMessage(candidateId));
    setBusyAction('');
    if (!response.success) { setErrorText(response.error ?? '记忆拒绝失败。'); return; }
    setMemory(response.payload.memorySummary);
    setNoticeText(`已忽略：${response.payload.candidate.title}`);
  }

  async function handleApproveAllCandidates() {
    const pending = currentAnalysisCandidates.filter((c) => c.status === 'pending');
    for (const candidate of pending) {
      const response = await sendRuntimeMessage(createMemoryCandidateApproveMessage(candidate.id));
      if (!response.success) { setErrorText(response.error ?? '批量记忆时发生错误。'); return; }
      setMemory(response.payload.memorySummary);
    }
    setNoticeText('当前这批可记住的信息都已进入长期记忆。');
  }

  async function handleRejectAllCandidates() {
    const pending = currentAnalysisCandidates.filter((c) => c.status === 'pending');
    for (const candidate of pending) {
      const response = await sendRuntimeMessage(createMemoryCandidateRejectMessage(candidate.id));
      if (!response.success) { setErrorText(response.error ?? '批量拒绝时发生错误。'); return; }
      setMemory(response.payload.memorySummary);
    }
    setNoticeText('当前这批候选记忆都已被忽略。');
  }

  return (
    <div className="tab-panel">
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Read Current Page</p>
            <h2>让小伙伴看看这一页</h2>
          </div>
          <span className="micro-status">不会默认读取正文</span>
        </div>

        <div className="button-grid">
          <LineButton variant="primary" onClick={handleReadCurrentPage} disabled={Boolean(busyAction)}>
            读取当前页
          </LineButton>
          <LineButton variant="secondary" onClick={handleAnalyzeCurrentPage} disabled={Boolean(busyAction)}>
            分析这一页
          </LineButton>
          <LineButton variant="ghost" onClick={handleSaveAnalysisAsNote} disabled={Boolean(busyAction) || !pageAnalysis || !pageContext}>
            保存为笔记
          </LineButton>
        </div>

        {pageRead ? (
          <div className="read-grid">
            <InfoBlock label="页面标题" value={pageRead.pageTitle} />
            <InfoBlock label="Origin" value={pageRead.origin} />
            <InfoBlock label="Page Type" value={pageRead.pageType} />
            <InfoBlock label="Headings" value={(pageRead.headings ?? []).join(' / ') || '暂无'} />
            <InfoBlock label="Summary" value={pageRead.visibleTextSummary ?? '暂无'} />
          </div>
        ) : (
          <p className="soft-text">点击"读取当前页"后，PocketBuddy 才会主动提取这一页的结构化内容。</p>
        )}
      </section>

      {pageAnalysis ? (
        <div className="stack">
          <ResultCard title="Page Summary">
            <p className="soft-text strong">{pageAnalysis.pageSummary}</p>
          </ResultCard>
          <ResultCard title="Key Ideas">
            <ListBlock items={pageAnalysis.keyIdeas} />
          </ResultCard>
          <ResultCard title="Key Takeaways">
            <ListBlock items={pageAnalysis.keyTakeaways} />
          </ResultCard>
          <ResultCard title="Product Opportunities">
            <ListBlock items={pageAnalysis.productOpportunities} />
          </ResultCard>
          <ResultCard title="Useful For Current Idea">
            <ListBlock items={pageAnalysis.usefulForCurrentIdea} />
          </ResultCard>

          {pageAnalysis.paperInsights ? (
            <ResultCard title="Paper Insights">
              <div className="detail-grid">
                <InfoBlock label="Problem" value={pageAnalysis.paperInsights.problem} />
                <InfoBlock label="Method" value={pageAnalysis.paperInsights.method} />
                <InfoBlock label="Contribution" value={pageAnalysis.paperInsights.contribution} />
                <InfoBlock label="Conclusion" value={pageAnalysis.paperInsights.conclusion} />
              </div>
              <div className="subsection">
                <h4>Relation To My Projects</h4>
                <ListBlock items={pageAnalysis.paperInsights.relationToMyProjects} />
              </div>
            </ResultCard>
          ) : null}

          <ResultCard title="Memory Candidates">
            <div className="inline-actions">
              <LineButton variant="secondary" onClick={handleApproveAllCandidates} disabled={currentAnalysisCandidates.length === 0 || Boolean(busyAction)}>
                全部记住
              </LineButton>
              <LineButton variant="ghost" onClick={handleRejectAllCandidates} disabled={currentAnalysisCandidates.length === 0 || Boolean(busyAction)}>
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
                    <p className="micro-copy">为什么建议记住：{candidate.reason}</p>
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
              <p className="soft-text">分析后提炼出的可记住信息会显示在这里。</p>
            )}
          </ResultCard>

          <ResultCard title="Image Requests">
            <div className="button-grid">
              <LineButton variant="secondary" onClick={() => onGenerateImage({
                sourceType: pageAnalysis.pageType === 'paper' ? 'paper-note' : 'article-note',
                title: pageAnalysis.noteCard.title,
                content: `${pageAnalysis.pageSummary}\n${pageAnalysis.noteCard.bullets.join('\n')}`,
                style: 'knowledge-card',
              })}>
                生成知识卡片图
              </LineButton>
              <LineButton variant="ghost" onClick={() => onGenerateImage({
                sourceType: pageAnalysis.pageType === 'paper' ? 'paper-note' : 'article-note',
                title: pageAnalysis.noteCard.title,
                content: pageAnalysis.pageSummary,
                style: 'poster',
              })}>
                生成学习海报
              </LineButton>
            </div>
          </ResultCard>

          <ResultCard title="Mindmap Requests">
            <div className="button-grid">
              <LineButton variant="secondary" onClick={() => onGenerateMindmap({
                sourceId: pageContext?.id ?? pageAnalysis.id,
                sourceType: pageAnalysis.pageType === 'paper' ? 'paper' : 'article',
                title: `${pageAnalysis.noteCard.title} 图谱`,
                content: [pageAnalysis.pageSummary, ...pageAnalysis.keyIdeas, ...pageAnalysis.productOpportunities].join('；'),
              })}>
                生成脉络图谱
              </LineButton>
              <LineButton variant="ghost" onClick={() => onGenerateMindmap({
                sourceId: pageContext?.id ?? pageAnalysis.id,
                sourceType: pageAnalysis.pageType === 'paper' ? 'paper' : 'article',
                title: `${pageAnalysis.noteCard.title} 研究路线图`,
                content: [...pageAnalysis.keyTakeaways, ...(pageAnalysis.paperInsights?.relationToMyProjects ?? [])].join('；'),
              })}>
                生成研究路线图
              </LineButton>
            </div>
          </ResultCard>
        </div>
      ) : (
        <EmptyCard avatar title="先读取，再分析" body="点击「读取当前页」，小口袋云云会帮你提炼摘要、关键观点、产品机会和可记住信息。" />
      )}
    </div>
  );
}
