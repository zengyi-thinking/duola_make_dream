import type { GraphNode } from '@/lib/graph/types';
import { labelGraphNodeType } from '@/lib/graph/types';
import LineButton from '@/components/LineArt/LineButton';

interface NodeDetailDrawerProps {
  node: GraphNode | null;
  onClose: () => void;
  onDelete?: (nodeId: string) => void;
}

/** 节点详情抽屉：力导向图选中节点后，在右侧/底部展示 title/summary/payload。复用 panel-card 视觉。 */
export default function NodeDetailDrawer({ node, onClose, onDelete }: NodeDetailDrawerProps) {
  if (!node) return null;

  const payloadLines = describePayload(node);

  return (
    <aside className="panel-card node-drawer">
      <div className="panel-head">
        <div>
          <p className="section-label">{labelGraphNodeType(node.type)}</p>
          <h2>{node.title}</h2>
        </div>
        <LineButton variant="ghost" onClick={onClose}>关闭</LineButton>
      </div>

      <p className="soft-text">{node.summary}</p>

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

      {onDelete ? (
        <div className="inline-actions" style={{ marginTop: 8 }}>
          <LineButton variant="ghost" onClick={() => onDelete(node.id)}>删除节点</LineButton>
        </div>
      ) : null}
    </aside>
  );
}

/** 把 payload（unknown）展开成可读的 label/value 行，最多 6 行。 */
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
