import type { GraphNode } from '@/lib/graph/types';
import { labelGraphNodeType } from '@/lib/graph/types';
import LineButton from '@/components/LineArt/LineButton';
import PlanBoard from '@/components/PlanBoard/PlanBoard';

interface NodeDetailDrawerProps {
  node: GraphNode | null;
  onClose: () => void;
  onDelete?: (nodeId: string) => void;
}

/**
 * 节点详情抽屉：按 node.type + payload 渲染不同精美内容（产品重设计升级）。
 * - structure + planBoard → PlanBoard 组件（idea 节点：图片+执行计划）
 * - image + imageUrl → <img> + prompt 摘要
 * - note + bullets/noteCard → 笔记卡片（summary + bullets + tags）
 * - research + items → 要点列表
 * - 通用 fallback → label/value
 */
export default function NodeDetailDrawer({ node, onClose, onDelete }: NodeDetailDrawerProps) {
  if (!node) return null;

  return (
    <aside className="panel-card node-drawer">
      <div className="panel-head">
        <div>
          <p className="section-label">{labelGraphNodeType(node.type)}</p>
          <h2>{node.title}</h2>
        </div>
        <LineButton variant="ghost" onClick={onClose}>关闭</LineButton>
      </div>

      {renderNodeContent(node)}

      {onDelete ? (
        <div className="inline-actions" style={{ marginTop: 8 }}>
          <LineButton variant="ghost" onClick={() => onDelete(node.id)}>删除节点</LineButton>
        </div>
      ) : null}
    </aside>
  );
}

/** 按 node.type + payload 派发到不同渲染器。 */
function renderNodeContent(node: GraphNode) {
  const payload = node.payload as Record<string, unknown> | undefined;
  if (!payload) return <FallbackContent node={node} />;

  // idea 成果节点：structure + payload.planBoard → PlanBoard
  if (node.type === 'structure' && isPlanBoardData(payload.planBoard)) {
    const planBoard = payload.planBoard as import('@/lib/agent/types').PlanBoardData;
    const intent = typeof payload.intent === 'string' ? payload.intent : undefined;
    return <PlanBoard board={planBoard} intentLabel={intent} />;
  }

  // image 节点
  if (node.type === 'image' && typeof payload.imageUrl === 'string') {
    return <ImageNodeContent url={payload.imageUrl} prompt={typeof payload.prompt === 'string' ? payload.prompt : ''} />;
  }

  // note 节点
  if (node.type === 'note') {
    return <NoteNodeContent payload={payload} />;
  }

  // research 通用（含 items 数组）
  if (Array.isArray(payload.items)) {
    return <ResearchNodeContent items={payload.items as string[]} payload={payload} />;
  }

  return <FallbackContent node={node} />;
}

function isPlanBoardData(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.name === 'string' && Array.isArray(o.features) && Array.isArray(o.modules);
}

function ImageNodeContent({ url, prompt }: { url: string; prompt: string }) {
  return (
    <div className="node-drawer__image">
      <img src={url} alt="" className="node-drawer__image-img" />
      {prompt ? (
        <details className="node-drawer__prompt">
          <summary>查看 Prompt</summary>
          <p className="soft-text">{prompt}</p>
        </details>
      ) : null}
    </div>
  );
}

function NoteNodeContent({ payload }: { payload: Record<string, unknown> }) {
  // 笔记卡片（从 ArchiveNote 或 PageAnalysisResult.noteCard 提取）
  const summary = (typeof payload.noteCard === 'object' && payload.noteCard && typeof (payload.noteCard as Record<string, unknown>).summary === 'string')
    ? ((payload.noteCard as Record<string, unknown>).summary as string)
    : (typeof payload.summary === 'string' ? payload.summary : '');
  const bullets = (typeof payload.noteCard === 'object' && payload.noteCard && Array.isArray((payload.noteCard as Record<string, unknown>).bullets))
    ? ((payload.noteCard as Record<string, unknown>).bullets as unknown[]).map(String)
    : (Array.isArray(payload.bullets) ? (payload.bullets as unknown[]).map(String) : []);
  const tags = Array.isArray(payload.tags) ? (payload.tags as unknown[]).map(String) : [];

  return (
    <div className="node-drawer__note">
      {summary ? <p className="node-drawer__note-summary">{summary}</p> : null}
      {bullets.length > 0 ? (
        <ul className="node-drawer__note-list">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      ) : null}
      {tags.length > 0 ? (
        <div className="node-drawer__note-tags">
          {tags.map((t) => <span key={t} className="node-drawer__tag">#{t}</span>)}
        </div>
      ) : null}
    </div>
  );
}

function ResearchNodeContent({ items, payload }: { items: string[]; payload: Record<string, unknown> }) {
  const relevance = typeof payload.relevance === 'string' ? payload.relevance : '';
  const kind = typeof payload.kind === 'string' ? payload.kind : '';
  return (
    <div className="node-drawer__research">
      {relevance ? <p className="node-drawer__note-summary">{relevance}</p> : null}
      {items.length > 0 ? (
        <ul className="node-drawer__note-list">
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      ) : null}
      {kind ? <p className="micro-copy">类型：{kind}</p> : null}
    </div>
  );
}

function FallbackContent({ node }: { node: GraphNode }) {
  const payloadLines = describePayload(node);
  return (
    <>
      {node.summary ? <p className="soft-text">{node.summary}</p> : null}
      {payloadLines.length > 0 ? (
        <div className="detail-grid">
          {payloadLines.map(({ label, value }) => (
            <div key={label} className="detail-grid__item">
              <span className="memory-label">{label}</span>
              <span className="soft-text">{value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {node.sourceId ? <p className="micro-copy">来源：{node.sourceId.slice(0, 8)}</p> : null}
    </>
  );
}

function describePayload(node: GraphNode): Array<{ label: string; value: string }> {
  const payload = node.payload;
  if (!payload || typeof payload !== 'object') return [];
  const entries = Object.entries(payload as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .slice(0, 6);
  return entries.map(([k, v]) => ({
    label: k,
    value: Array.isArray(v) ? v.join('、') : typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v).slice(0, 120),
  }));
}
