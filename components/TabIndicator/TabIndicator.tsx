import { motion } from 'framer-motion';
import { PB_SPRING } from '@/lib/ui/motion-presets';
import './TabIndicator.css';

interface TabIndicatorProps {
  active: boolean;
}

/**
 * TabIndicator —— 通过 framer-motion 的 layoutId 实现"从旧 Tab 流到新 Tab"动画。
 *
 * 用法：每个 Tab 按钮里渲染，active=true 才出现；LayoutGroup 父级自动迁移。
 */
export default function TabIndicator({ active }: TabIndicatorProps) {
  if (!active) return null;

  return (
    <motion.span
      layoutId="pb-tab-indicator"
      className="pb-tab-indicator"
      transition={PB_SPRING}
    />
  );
}