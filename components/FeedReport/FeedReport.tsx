import type { PageAnalysisResult } from '@/lib/page/types';
import './FeedReport.css';

interface FeedReportProps {
  analysis: PageAnalysisResult;
  /** 页面来源（origin），显示在报告头 */
  origin?: string;
}

/**
 * 喂养报告 —— 把 PageAnalysisResult 渲染成报告式 HTML。
 *
 * 产品重设计：替代旧"阅读地图" ResultCard 的文字板块堆叠。
 * 报告感：大标题（封面式 hero）+ 四象限卡片 + 论文深读结构化 + 标签条，
 * 标题字体美观、莫兰迪色、留白，便于归档为笔记节点后回顾。
 */
export default function FeedReport({ analysis, origin }: FeedReportProps) {
  const {
    noteCard, pageSummary, pageType,
    keyIdeas, keyTakeaways, productOpportunities, usefulForCurrentIdea,
    paperInsights,
  } = analysis;

  return (
    <section className="feed-report">
      <header className="feed-report__hero">
        <div className="feed-report__hero-top">
          <span className="feed-report__kicker">Reading Report</span>
          {pageType ? <span className="feed-report__type">{pageType}</span> : null}
        </div>
        <h3 className="feed-report__title">{noteCard.title}</h3>
        {noteCard.summary ? <p className="feed-report__lede">{noteCard.summary}</p> : null}
        {pageSummary ? <p className="feed-report__summary">{pageSummary}</p> : null}
        {origin ? <p className="feed-report__origin">来源：{origin}</p> : null}
      </header>

      <div className="feed-report__quad">
        <ReportSection icon="💡" title="关键点" items={keyIdeas} tone="blue" />
        <ReportSection icon="📌" title="核心结论" items={keyTakeaways} tone="green" />
        <ReportSection icon="🚀" title="产品机会" items={productOpportunities} tone="purple" />
        <ReportSection icon="🔗" title="对当前想法" items={usefulForCurrentIdea} tone="amber" />
      </div>

      {paperInsights ? (
        <section className="feed-report__paper">
          <div className="feed-report__section-head">
            <span className="feed-report__section-icon" aria-hidden="true">📄</span>
            <h4 className="feed-report__section-title">论文深读</h4>
          </div>
          <div className="feed-report__paper-grid">
            <PaperField label="Problem" value={paperInsights.problem} />
            <PaperField label="Method" value={paperInsights.method} />
            <PaperField label="Contribution" value={paperInsights.contribution} />
            <PaperField label="Conclusion" value={paperInsights.conclusion} />
          </div>
          {paperInsights.relationToMyProjects.length > 0 ? (
            <div className="feed-report__relation">
              <span className="feed-report__relation-label">与我项目的关联</span>
              <ul className="feed-report__relation-list">
                {paperInsights.relationToMyProjects.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {noteCard.tags.length > 0 ? (
        <div className="feed-report__tags">
          {noteCard.tags.map((t) => <span key={t} className="feed-report__tag">#{t}</span>)}
        </div>
      ) : null}
    </section>
  );
}

function ReportSection({
  icon, title, items, tone,
}: {
  icon: string;
  title: string;
  items: string[];
  tone: 'blue' | 'green' | 'purple' | 'amber';
}) {
  if (!items || items.length === 0) return null;
  return (
    <section className={`feed-report__section feed-report__section--${tone}`}>
      <div className="feed-report__section-head">
        <span className="feed-report__section-icon" aria-hidden="true">{icon}</span>
        <h4 className="feed-report__section-title">{title}</h4>
        <span className="feed-report__section-count">{items.length}</span>
      </div>
      <ul className="feed-report__list">
        {items.slice(0, 6).map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </section>
  );
}

function PaperField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="feed-report__paper-field">
      <span className="feed-report__paper-label">{label}</span>
      <p className="feed-report__paper-value">{value}</p>
    </div>
  );
}
