import { useReducedMotion as useFmReducedMotion } from 'framer-motion';

/**
 * 包装 framer-motion 的 useReducedMotion，提供 PocketBuddy 专属默认值。
 *
 * 行为：
 * - 浏览器/系统级 `prefers-reduced-motion: reduce` → 返回 true
 * - SSR 环境（framer-motion 返回 null）→ 返回 false，避免 hydration 闪烁
 *
 * 用法：组件内根据返回值走「静态降级」分支，不渲染动画包装。
 */
export function usePocketReducedMotion(): boolean {
  return useFmReducedMotion() ?? false;
}