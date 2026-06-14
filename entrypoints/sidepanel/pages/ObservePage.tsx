import { useEffect, useMemo, useState } from 'react';
import GraphCanvas from '@/components/GraphCanvas/GraphCanvas';
import StaggerStack from '@/components/StaggerStack/StaggerStack';
import { createPocketExperienceListMessage, sendRuntimeMessage } from '@/lib/messaging/bus';
import type { ExperienceRecord } from '@/lib/agent/types';
import { createGraphNode, createGraphView, labelGraphNodeType } from '@/lib/graph/types';
import type { GraphView, GraphNodeType } from '@/lib/graph/types';
import { useToast } from '../context/ToastContext';
import { useMemory } from '../context/MemoryContext';

type ExpFilter = 'all' | 'success' | 'failure';

/** outcome → 节点类型映射（显式覆盖，避免未来新增 outcome 时静默染错色） */
function outcomeToNodeType(outcome: ExperienceRecord['outcome']): GraphNodeType {
  if (outcome === 'success') return 'success';
  return 'failure';
}

/** 把经验记录转成 observe 图：每条经验一个节点（success=绿 / failure=红） */
function buildExperienceGraph(experiences: ExperienceRecord[], filter: ExpFilter): GraphView {
  const filtered = experiences.filter((e) => filter === 'all' || e.outcome === filter);
  const nodes = filtered.map((exp) =>
    createGraphNode({
      type: outcomeToNodeType(exp.outcome),
      title: exp.summary,
      summary: exp.lesson || exp.summary,
      payload: { agentId: exp.agentId, outcome: exp.outcome },
      sourceId: exp.id,
    }),
  );
  return createGraphView({ scope: 'observe', title: '经验图', nodes, edges: [] });
}

/**
 * 观察页（推倒重建自 ObservationTab）。
 *
 * 核心变化（对照计划第三节）：以「成功/失败经验图」为唯一主体。
 * 经验来自子 Agent run() 产出的 ExperienceSeed → Director 落库的 ExperienceRecord。
 * 旧的杂项仪表盘（时间线/对比/profile/library）下沉：保留折叠的「产物库」次面板，
 * 其余（快照回溯/版本对比）留待后续按需补回。
 */
export default function ObservePage() {
  const { setErrorText } = useToast();
  const { memory, setMemory } = useMemory();

  const [experiences, setExperiences] = useState<ExperienceRecord[]>([]);
  const [filter, setFilter] = useState<ExpFilter>('all');

  useEffect(() => {
    void loadExperiences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const graph = useMemo(() => buildExperienceGraph(experiences, filter), [experiences, filter]);
  const successCount = experiences.filter((e) => e.outcome === 'success').length;
  const failureCount = experiences.filter((e) => e.outcome === 'failure').length;
  const filteredExperiences = experiences.filter((e) => filter === 'all' || e.outcome === filter);

  return (
    <StaggerStack triggerKey="observe" className="tab-panel">
      <section className="panel-card">
        <div className="panel-head">
          <div>
            <p className="section-label">Experience Graph</p>
            <h2>经验图</h2>
          </div>
          <div className="filter-chips">
            {(['all', 'success', 'failure'] as ExpFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`filter-chip ${filter === f ? 'filter-chip--active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? `全部 ${experiences.length}` : f === 'success' ? `成功 ${successCount}` : `失败 ${failureCount}`}
              </button>
            ))}
          </div>
        </div>
        {graph.nodes.length > 0 ? (
          <GraphCanvas graph={graph} emptyHint="暂无经验节点。" />
        ) : (
          <p className="soft-text">还没有经验沉淀。多发明/喂养几次，成功与失败的经验会在这里长成图。点击节点看详情。</p>
        )}
      </section>

      {filteredExperiences.length > 0 ? (
        <section className="panel-card">
          <div className="panel-head">
            <div>
              <p className="section-label">Lessons</p>
              <h2>经验条目</h2>
            </div>
          </div>
          <div className="candidate-stack">
            {filteredExperiences.map((exp) => (
              <div key={exp.id} className="candidate-card">
                <div className="candidate-head">
                  <strong>{exp.summary}</strong>
                  <span
                    className="token-chip"
                    style={{ color: exp.outcome === 'success' ? '#27ae60' : '#c0392b' }}
                  >
                    {exp.outcome === 'success' ? '成功' : '失败'}
                  </span>
                </div>
                <p className="soft-text">{exp.lesson}</p>
                <p className="micro-copy">
                  {labelGraphNodeType(exp.outcome === 'success' ? 'success' : 'failure')} · {exp.agentId}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <details className="panel-card reading-accordion">
        <summary>产物库（{memory?.counts?.artifacts ?? 0} 产物 · {memory?.generatedImages.length ?? 0} 图）</summary>
        <div style={{ marginTop: 8 }}>
          {(memory?.recentArtifacts.length ?? 0) > 0 ? (
            <div className="candidate-stack">
              {memory!.recentArtifacts.slice(0, 6).map((art) => (
                <div key={art.id} className="candidate-card">
                  <strong>{art.concept.name}</strong>
                  <p className="soft-text" style={{ margin: '4px 0 0' }}>{art.concept.tagline}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="soft-text">暂无产物。去发明页生成一个想法吧。</p>
          )}
        </div>
      </details>
    </StaggerStack>
  );
}
