import type { PlanBoardData, PlanBoardModule } from '@/lib/agent/types';
import './InfographicPanel.css';

interface InfographicPanelProps {
  board: PlanBoardData;
  /** 生成时间戳（用于页脚），由调用方传入避免组件内 new Date */
  createdAt?: number;
}

/**
 * 16:9 海报风计划信息图 —— 把 PlanBoardData 渲染成知识密集型的可视化海报。
 *
 * 产品重设计：用户要"确认计划后生成 16:9 知识密集型计划图片原地展示"。
 * 文生图对中文渲染会乱码，故采用 HTML 信息图（中文完美、可导出）。
 * 参考images/image.png：模块化网格 + 流程 + 对比，莫兰迪手绘涂鸦风、大量留白。
 * 容器固定 16:9 视觉框架，内容按海报分区密集排布。
 */
export default function InfographicPanel({ board, createdAt }: InfographicPanelProps) {
  const dateLabel = createdAt ? new Date(createdAt).toLocaleDateString('zh-CN') : '';

  return (
    <section className="infographic" aria-label={`${board.name} 计划信息图`}>
      <div className="infographic__frame">
        {/* Hero 区 */}
        <header className="infographic__hero">
          <div className="infographic__hero-bg" aria-hidden="true" />
          <span className="infographic__kicker">✦ PocketAgent · 计划信息图</span>
          <h3 className="infographic__title">{board.name}</h3>
          <p className="infographic__tagline">{board.tagline}</p>
          <div className="infographic__hero-meta">
            {board.targetUser ? <span><em>用户</em>{board.targetUser}</span> : null}
            {board.coreProblem ? <span><em>问题</em>{board.coreProblem}</span> : null}
            {board.valueProposition ? <span><em>价值</em>{board.valueProposition}</span> : null}
          </div>
        </header>

        {/* 功能流程区 */}
        {board.modules.length > 0 ? (
          <section className="infographic__flow">
            <SectionLabel icon="⚙️" text="核心功能" />
            <div className="infographic__flow-rail">
              {board.modules.map((m, i) => (
                <div key={`m-${i}`} className="infographic__flow-step">
                  <span className="infographic__flow-dot">{i + 1}</span>
                  <strong>{m.title}</strong>
                  {m.detail ? <p>{m.detail}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* 四象限区：技术/里程碑/竞品/风险 */}
        <section className="infographic__quad">
          <QuadBlock icon="🧱" title="技术路线" modules={board.techStack} tone="purple" />
          <QuadBlock icon="🎯" title="里程碑" modules={board.milestones} tone="green" />
          <QuadBlock icon="⚔️" title="竞品对比" modules={board.competitors} tone="amber" />
          <QuadBlock icon="⚠️" title="风险对策" modules={board.risks} tone="red" />
        </section>

        {/* Footer */}
        <footer className="infographic__footer">
          <span>{board.features.slice(0, 4).join(' · ')}</span>
          <span className="infographic__footer-meta">由 PocketAgent 生成{dateLabel ? ` · ${dateLabel}` : ''}</span>
        </footer>
      </div>
    </section>
  );
}

function SectionLabel({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="infographic__section-label">
      <span aria-hidden="true">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function QuadBlock({
  icon,
  title,
  modules,
  tone,
}: {
  icon: string;
  title: string;
  modules: PlanBoardModule[];
  tone: 'purple' | 'green' | 'amber' | 'red';
}) {
  return (
    <div className={`infographic__quad-block infographic__quad-block--${tone}`}>
      <div className="infographic__quad-head">
        <span aria-hidden="true">{icon}</span>
        <strong>{title}</strong>
      </div>
      {modules.length > 0 ? (
        <ul className="infographic__quad-list">
          {modules.map((m, i) => (
            <li key={`q-${title}-${i}`}>
              <span className="infographic__quad-title">{m.title}</span>
              {m.detail ? <span className="infographic__quad-detail">{m.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="infographic__quad-empty">—</p>
      )}
    </div>
  );
}
