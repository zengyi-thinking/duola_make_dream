import { motion } from 'framer-motion';
import { Children, isValidElement } from 'react';
import type { ReactNode } from 'react';
import {
  staggerContainer,
  staggerItem,
  STAGGER_REDUCED,
  STAGGER_ITEM_REDUCED,
} from '@/lib/ui/motion-presets';
import { usePocketReducedMotion } from '@/lib/ui/reduced-motion';

interface StaggerStackProps {
  children: ReactNode;
  /** 重新触发动画的 key：数据更新时变化 */
  triggerKey?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * StaggerStack —— 子项错落 fade-up 入场。
 *
 * 替换原本的 `<div className="stack">`。
 * 通过 triggerKey 控制重放，例如 `<StaggerStack triggerKey={artifact?.id}>`。
 */
export default function StaggerStack({ children, triggerKey, className, style }: StaggerStackProps) {
  const reduced = usePocketReducedMotion();

  const container = reduced ? STAGGER_REDUCED : staggerContainer;
  const item = reduced ? STAGGER_ITEM_REDUCED : staggerItem;

  const items = Children.toArray(children).filter(isValidElement);

  return (
    <motion.div
      key={triggerKey}
      className={className}
      style={style}
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {items.map((child, i) => (
        <motion.div key={i} variants={item}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}