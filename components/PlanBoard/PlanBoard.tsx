import type { PlanBoardData, PlanBoardModule } from '@/lib/agent/types';
import './PlanBoard.css';

interface PlanBoardProps {
  board: PlanBoardData;
  /** 意图标签文案（可选，展示在标题卡） */
  intentLabel?: string;
}

/**
 * 精美 HTML 计划面板 —— 把 PlanBoardData 渲染成模块化卡片网格。
 *
 * 产品重设计：替代旧 ResultCard 的文字板块堆叠。参考 images/image.png 的模块化布局：
 * 标题卡 + 定位四元组 + 功能/技术/里程碑/竞品/风险五类模块，莫兰迪蓝白色调、大量留白。
 */
export default function PlanBoard({ board, intentLabel }: PlanBoardProps) {
  return (
    <section className="plan-board">
      <header className="plan-board__hero">
        <div className="plan-board__hero-top">
          <span className="plan-board__kicker">Plan Board</span>
          {intentLabel ? <span className="plan-board__intent">{intentLabel}</span> : null}
        </div>
        <h3 className="plan-board__name">{board.name}</h3>
        <p className="plan-board__tagline">{board.tagline}</p>
      </header>

      {(board.positioning || board.targetUser || board.coreProblem || board.valueProposition) ? (
        <div className="plan-board__meta-grid">
          {board.positioning ? <MetaCard label="定位" value={board.positioning} /> : null}
          {board.targetUser ? <MetaCard label="目标用户" value={board.targetUser} /> : null}
          {board.coreProblem ? <MetaCard label="核心问题" value={board.coreProblem} /> : null}
          {board.valueProposition ? <MetaCard label="价值主张" value={board.valueProposition} /> : null}
        </div>
      ) : null}

      {board.features.length > 0 ? (
        <div className="plan-board__features">
          {board.features.map((f) => <span key={f} className="plan-board__feature-chip">{f}</span>)}
        </div>
      ) : null}

      <ModuleSection icon="⚙️" title="功能模块" modules={board.modules} variant="grid" />
      <ModuleSection icon="🧱" title="技术路线" modules={board.techStack} variant="stack" />
      <ModuleSection icon="🎯" title="里程碑" modules={board.milestones} variant="timeline" />
      <ModuleSection icon="⚔️" title="竞品对比" modules={board.competitors} variant="compare" />
      <ModuleSection icon="⚠️" title="风险与对策" modules={board.risks} variant="risk" />
    </section>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="plan-board__meta-card">
      <span className="plan-board__meta-label">{label}</span>
      <p className="plan-board__meta-value">{value}</p>
    </div>
  );
}

function ModuleSection({
  icon,
  title,
  modules,
  variant,
}: {
  icon: string;
  title: string;
  modules: PlanBoardModule[];
  variant: 'grid' | 'stack' | 'timeline' | 'compare' | 'risk';
}) {
  if (!modules || modules.length === 0) return null;
  return (
    <section className={`plan-board__section plan-board__section--${variant}`}>
      <div className="plan-board__section-head">
        <span className="plan-board__section-icon" aria-hidden="true">{icon}</span>
        <h4 className="plan-board__section-title">{title}</h4>
        <span className="plan-board__section-count">{modules.length}</span>
      </div>
      <div className={`plan-board__module-list plan-board__module-list--${variant}`}>
        {modules.map((m, i) => (
          <div key={`${m.title}-${i}`} className={`plan-board__module plan-board__module--${variant}`}>
            <div className="plan-board__module-head">
              {variant === 'timeline' ? <span className="plan-board__module-index">M{i + 1}</span> : null}
              <strong className="plan-board__module-title">{m.title}</strong>
            </div>
            {m.detail ? <p className="plan-board__module-detail">{m.detail}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
