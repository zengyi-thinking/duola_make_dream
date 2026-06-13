import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import type { MindmapRecord } from '@/lib/agent/types';
import { usePocketReducedMotion } from '@/lib/ui/reduced-motion';
import { PB_EASE } from '@/lib/ui/motion-presets';
import './AnimatedTree.css';

interface AnimatedTreeProps {
  root: MindmapRecord['result']['root'];
}

/**
 * AnimatedTree —— 可交互的思维导图树。
 *
 * 行为：
 * - 节点点击展开/收起
 * - 子节点 height: 0 ↔ auto 平滑过渡
 * - 箭头 ▶ ↔ ▼ 旋转
 * - 前 2 层默认展开
 */
export default function AnimatedTree({ root }: AnimatedTreeProps) {
  return (
    <div className="pb-animated-tree">
      <TreeNode node={root} depth={0} isRoot defaultOpen />
    </div>
  );
}

interface TreeNodeProps {
  node: MindmapRecord['result']['root'];
  depth: number;
  isRoot?: boolean;
  defaultOpen?: boolean;
}

function TreeNode({ node, depth, isRoot, defaultOpen }: TreeNodeProps) {
  const reduced = usePocketReducedMotion();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const hasChildren = !!node.children?.length;

  return (
    <div className="pb-tree-node" data-depth={depth}>
      <motion.button
        type="button"
        className={`pb-tree-node__label ${isRoot ? 'pb-tree-node__label--root' : ''}`}
        onClick={() => hasChildren && setOpen(!open)}
        whileHover={reduced || !hasChildren ? {} : { x: 2 }}
        transition={{ duration: 0.15 }}
        disabled={!hasChildren}
      >
        {hasChildren && (
          <motion.span
            className="pb-tree-node__arrow"
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.18, ease: PB_EASE }}
            aria-hidden
          >
            ▶
          </motion.span>
        )}
        <span className="pb-tree-node__text">{node.label}</span>
      </motion.button>

      <AnimatePresence initial={false}>
        {open && hasChildren && (
          <motion.div
            key="children"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.26, ease: PB_EASE }}
            style={{ overflow: 'hidden' }}
          >
            <div className="pb-tree-node__children">
              {node.children!.map((child) => (
                <TreeNode key={child.id} node={child} depth={depth + 1} defaultOpen={depth < 1} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}