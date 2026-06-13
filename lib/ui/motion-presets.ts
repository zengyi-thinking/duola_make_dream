/**
 * PocketBuddy 动效预设 —— 统一收敛动画参数，避免各处散落不一致。
 *
 * 设计原则：
 * - 时长偏短（< 400ms），符合 "克制" 基调
 * - 缓动用 cubic-bezier(0.4, 0, 0.2, 1) (Material standard)
 * - 弹性用 spring 380/32，配合 layoutId 滑动指示条
 */

import type { Transition, Variants } from 'framer-motion';

export const PB_EASE = [0.4, 0, 0.2, 1] as const;

export const PB_TRANSITION: Transition = {
  duration: 0.32,
  ease: PB_EASE,
};

export const PB_SPRING: Transition = {
  type: 'spring',
  stiffness: 380,
  damping: 32,
};

/** 卡片入场容器：stagger 控制子项 */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.05,
    },
  },
};

/** 卡片入场子项：fade-up */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: PB_EASE },
  },
};

/** 高度自适应（用于 mindmap 展开） */
export const expandCollapse: Variants = {
  collapsed: { opacity: 0, height: 0 },
  expanded: {
    opacity: 1,
    height: 'auto',
    transition: { duration: 0.24, ease: PB_EASE },
  },
};

/** reduced-motion 降级版本（stagger = 0，时长接近 0） */
export const STAGGER_REDUCED: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0 } },
};

export const STAGGER_ITEM_REDUCED: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0 } },
};