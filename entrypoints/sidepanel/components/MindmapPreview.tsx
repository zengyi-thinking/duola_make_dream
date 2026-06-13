import type { MindmapRecord } from '@/lib/agent/types';

export function TreePreview({ node }: { node: MindmapRecord['result']['root'] }) {
  return (
    <div className="tree-preview">
      <TreeNode node={node} depth={0} />
    </div>
  );
}

function TreeNode({ node, depth }: { node: MindmapRecord['result']['root']; depth: number }) {
  return (
    <div className="tree-node" data-depth={depth}>
      <div className="tree-node__label">{node.label}</div>
      {node.children?.length ? (
        <div className="tree-node__children">
          {node.children.map((child) => <TreeNode key={child.id} node={child} depth={depth + 1} />)}
        </div>
      ) : null}
    </div>
  );
}
