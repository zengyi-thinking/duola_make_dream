import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import StaggerStack from '@/components/StaggerStack/StaggerStack';
import GraphCanvas from '@/components/GraphCanvas/GraphCanvas';
import { createPocketExperienceListMessage, sendRuntimeMessage } from '@/lib/messaging/bus';
import type { ExperienceRecord } from '@/lib/agent/types';
import { createGraphNode, createGraphView } from '@/lib/graph/types';
import type { GraphNode, GraphNodeType } from '@/lib/graph/types';
import { useToast } from '../context/ToastContext';
import { useMemory } from '../context/MemoryContext';

type OutcomeFilter = 'all' | 'success' | 'failure';
type AgentFilter = 'all' | string;

const AGENT_LABELS: Record<string, string> = {
  plan: '规划', research: '调研', reflect: '反思', structure: '编排', image: '生图', feed: '喂养',
};

/** outcome → 节点类型映射 */
function outcomeToNodeType(outcome: ExperienceRecord['outcome']): GraphNodeType {
  return outcome === 'success' ? 'success' : 'failure';
}

/** 把经验转成回顾图（折叠次面板用） */
function buildExperienceGraph(experiences: ExperienceRecord[]): GraphNode[] {
  return experiences.slice(0, 30).map((exp) =>
    createGraphNode({
      type: outcomeToNodeType(exp.outcome),
      title: exp.summary,
      summary: exp.lesson || exp.summary,
      payload: { agentId: exp.agentId, outcome: exp.outcome },
      sourceId: exp.id,
    }),
  );
}

/**
 * 观察页（产品重设计：agent 工作过程的反思与验证，像人做事的反思日志）。
 *
 * 主体是**反思时间线**：experienceRecords 按 createdAt 倒序流式，每条 = agent 一次反思/验证。
 * 顶部统计（成功/失败/总计 + agent 分布），筛选（all/success/failure + agent），经验图下沉为折叠次面板。
 */
export default function ObservePage() {
  const { setErrorText } = useToast();
  const { memory, setMemory } = useMemory();

  const [experiences, setExperiences] = useState<ExperienceRecord[]>([]);
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all');

  useEffect(() => {
    void loadExperiences();
  }, []);

  async function loadExperiences() {
    try {
      const response = await sendRuntimeMessage(createPocketExperienceListMessage());
      if (response.success) {
        setExperiences(response.payload.experiences);
        setMemory(response.payload.memorySummary);
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '加载经验失败。');
    }
  }

  const successCount = experiences.filter((e) => e.outcome === 'success').length;
  const failureCount = experiences.filter((e) => e.outcome === 'failure').length;

  // agent 分布
  const agentStats = useMemo(() => {
    const map = new Map<string, { success: number; failure: number }>();
    for (const e of experiences) {
      const cur = map.get(e.agentId) ?? { success: 0, failure: 0 };
      cur[e.outcome] += 1;
      map.set(e.agentId, cur);
    }
    return Array.from(map.entries()).sort((a, b) => (b[1].success + b[1].failure) - (a[1].success + a[1].failure));
  }, [experiences]);

  // 筛选后时间线（倒序）
  const timeline = useMemo(() => {
    return experiences
      .filter((e) => outcomeFilter === 'all' || e.outcome === outcomeFilter)
      .filter((e) => agentFilter === 'all' || e.agentId === agentFilter)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [experiences, outcomeFilter, agentFilter]);

  const graphNodes = useMemo(() => buildExperienceGraph(experiences), [experiences]);

  return (
    <StaggerStack triggerKey="observe" className="tab-panel">
      {/* 顶部统计卡 */}
      <section className="panel-card observe-stat">
        <div className="panel-head">
          <div>
            <p className="section-label">Reflection Stats</p>
            <h2>反思与验证</h2>
          </div>
        </div>
        <div className="observe-stat__row">
          <div className="observe-stat__card observe-stat__card--success">
            <span className="observe-stat__num">{successCount}</span>
            <span className="observe-stat__label">✅ 成功经验</span>
          </div>
          <div className="observe-stat__card observe-stat__card--failure">
            <span className="observe-stat__num">{failureCount}</span>
            <span className="observe-stat__label">❌ 失败教训</span>
          </div>
          <div className="observe-stat__card observe-stat__card--total">
            <span className="observe-stat__num">{experiences.length}</span>
            <span className="observe-stat__label">总计</span>
          </div>
          <div className="observe-stat__card observe-stat__card--health">
            <SuccessRing success={successCount} total={experiences.length} />
            <span className="observe-stat__label">健康度</span>
          </div>
        </div>
        {agentStats.length > 0 ? (
          <div className="observe-stat__agents">
            {agentStats.map(([agentId, s]) => (
              <button
                key={agentId}
                type="button"
                className={`observe-stat__agent-chip${agentFilter === agentId ? ' observe-stat__agent-chip--active' : ''}`}
                onClick={() => setAgentFilter(agentFilter === agentId ? 'all' : agentId)}
              >
                <span className="observe-stat__agent-head">
                  <span className="observe-stat__agent-name">{AGENT_LABELS[agentId] ?? agentId}</span>
                  <span className="observe-stat__agent-counts">
                    <span className="observe-stat__agent-s">{s.success}</span>
                    <span className="observe-stat__agent-divider">/</span>
                    <span className="observe-stat__agent-f">{s.failure}</span>
                  </span>
                </span>
                {(s.success + s.failure) > 0 ? (
                  <span className="observe-stat__agent-bar">
                    <span className="observe-stat__agent-bar-s" style={{ flexGrow: s.success }} />
                    <span className="observe-stat__agent-bar-f" style={{ flexGrow: s.failure }} />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {/* 筛选 */}
      <div className="observe-filter">
        {(['all', 'success', 'failure'] as OutcomeFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`observe-filter__chip${outcomeFilter === f ? ' observe-filter__chip--active' : ''}`}
            onClick={() => setOutcomeFilter(f)}
          >
            {f === 'all' ? `全部 ${experiences.length}` : f === 'success' ? `成功 ${successCount}` : `失败 ${failureCount}`}
          </button>
        ))}
        {agentFilter !== 'all' ? (
          <button type="button" className="observe-filter__clear" onClick={() => setAgentFilter('all')}>
            清除 agent 筛选（{AGENT_LABELS[agentFilter] ?? agentFilter}）
          </button>
        ) : null}
      </div>

      {/* 反思时间线（主体） */}
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Reflection Timeline</p>
            <h2>工作过程反思</h2>
          </div>
          <span className="micro-status">{timeline.length} 条</span>
        </div>
        {timeline.length > 0 ? (
          <div className="observe-timeline">
            {timeline.map((exp) => (
              <motion.div
                key={exp.id}
                className={`observe-timeline__item observe-timeline__item--${exp.outcome}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <div className="observe-timeline__rail">
                  <span className={`observe-timeline__dot observe-timeline__dot--${exp.outcome}`}>
                    {exp.outcome === 'success' ? '✓' : '✕'}
                  </span>
                </div>
                <div className="observe-timeline__body">
                  <div className="observe-timeline__head">
                    <span className={`observe-timeline__badge observe-timeline__badge--${exp.outcome}`}>
                      {exp.outcome === 'success' ? '成功' : '失败'}
                    </span>
                    <span className="observe-timeline__agent">{AGENT_LABELS[exp.agentId] ?? exp.agentId}</span>
                    <span className="observe-timeline__time">{describeRelativeAge(exp.createdAt)}</span>
                  </div>
                  <p className="observe-timeline__summary">{exp.summary}</p>
                  {exp.lesson ? (
                    <p className={`observe-timeline__lesson${exp.outcome === 'failure' ? ' observe-timeline__lesson--failure' : ''}`}>
                      <span className="observe-timeline__lesson-label">{exp.outcome === 'failure' ? '改进' : '经验'}：</span>
                      {exp.lesson}
                    </p>
                  ) : null}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="soft-text">
            {experiences.length === 0
              ? '还没有反思记录。多发明/喂养几次，Agent 的成功与失败反思会在这里沉淀，像你的思考日志。'
              : '当前筛选下没有反思记录，换个筛选看看。'}
          </p>
        )}
      </section>

      {/* 经验图（折叠次面板） */}
      {graphNodes.length > 0 ? (
        <details className="panel-card observe-accordion">
          <summary className="observe-accordion__summary">
            <span>经验回顾图（力导向）</span>
            <span className="micro-status">{graphNodes.length} 节点</span>
          </summary>
          <div style={{ marginTop: 8 }}>
            <GraphCanvas
              graph={createGraphView({ scope: 'observe', title: '经验图', nodes: graphNodes, edges: [] })}
              emptyHint="暂无经验节点。"
            />
          </div>
        </details>
      ) : null}
    </StaggerStack>
  );
}

function describeRelativeAge(createdAt: number): string {
  const min = Math.floor(Math.max(0, Date.now() - createdAt) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  if (d < 28) return `${Math.floor(d / 7)} 周前`;
  return `${Math.floor(d / 30)} 个月前`;
}

/** 成功率环形进度（绿环 + 红底，纯 SVG 无依赖） */
function SuccessRing({ success, total }: { success: number; total: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const rate = total > 0 ? success / total : 0;
  return (
    <svg className="observe-health-ring" width="62" height="62" viewBox="0 0 62 62">
      <circle cx="31" cy="31" r={r} fill="none" stroke="var(--pb-tone-red-border)" strokeWidth="7" />
      <circle
        cx="31"
        cy="31"
        r={r}
        fill="none"
        stroke="var(--pb-tone-green)"
        strokeWidth="7"
        strokeDasharray={`${c * rate} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 31 31)"
      />
      <text x="31" y="35" textAnchor="middle" className="observe-health-ring__num">
        {total > 0 ? `${Math.round(rate * 100)}%` : '—'}
      </text>
    </svg>
  );
}
