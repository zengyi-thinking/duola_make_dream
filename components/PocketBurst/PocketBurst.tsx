import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { usePocketReducedMotion } from '@/lib/ui/reduced-motion';
import './PocketBurst.css';

interface PocketBurstProps {
  /** 是否激活爆发（active=true 时粒子从中心飞出） */
  active: boolean;
  /** 粒子数量，默认 10 */
  count?: number;
}

/**
 * PocketBurst —— "放进口袋" 的视觉反馈。
 *
 * 用法：包裹在按钮外层（容器需 position: relative）。
 * - 激活时从中心向四周散出 count 个蓝点
 * - 0.65s 后自动消失
 * - prefers-reduced-motion 时直接 return null
 *
 * 每次 active 从 false → true 会触发一次爆发（用 key 强制重渲染）。
 */
export default function PocketBurst({ active, count = 10 }: PocketBurstProps) {
  const reduced = usePocketReducedMotion();

  // 每次 active 重新生成粒子轨迹，避免上次未消失时复用导致错位
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      // 均匀分布在 360°，加一点随机抖动
      const baseAngle = (i / count) * Math.PI * 2;
      const jitter = (Math.random() - 0.5) * 0.4;
      const angle = baseAngle + jitter;
      const distance = 48 + Math.random() * 32;
      return {
        id: i,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        size: 6 + Math.random() * 6,
      };
    });
  }, [active, count]);

  if (reduced) return null;

  return (
    <AnimatePresence>
      {active && (
        <div
          aria-hidden
          className="pb-pocket-burst"
          // 强制 remount，确保每次 active 都重新跑动画
          key={active ? 'on' : 'off'}
        >
          {particles.map((p) => (
            <motion.span
              key={p.id}
              className="pb-pocket-burst__particle"
              initial={{ x: 0, y: 0, scale: 0.6, opacity: 1 }}
              animate={{ x: p.x, y: p.y, scale: 0, opacity: 0 }}
              transition={{
                duration: 0.65,
                ease: [0.2, 0.8, 0.4, 1],
                delay: p.id * 0.018,
              }}
              style={{ width: p.size, height: p.size }}
            />
          ))}
          {/* 中央光圈 */}
          <motion.span
            className="pb-pocket-burst__ring"
            initial={{ scale: 0, opacity: 0.7 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          />
        </div>
      )}
    </AnimatePresence>
  );
}