import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { PocketBuddyMood } from '@/lib/agent/types';
import { usePocketReducedMotion } from '@/lib/ui/reduced-motion';
import './Aurora.css';

interface AuroraProps {
  mood: PocketBuddyMood;
}

/**
 * Aurora —— 跟随 PocketBuddy mood 的呼吸光晕背景。
 *
 * 行为：
 * - 固定定位在 sidepanel 容器最底层（z-index 0）
 * - mood 切换时 CSS transition 平滑过渡颜色 / 模糊 / 缩放
 * - prefers-reduced-motion 时直接用最终态，不做持续呼吸
 */
const AURORA_PRESETS: Record<PocketBuddyMood, {
  color: string;
  blur: number;
  scale: number;
  opacity: number;
  breathing: boolean;
}> = {
  idle: {
    color: 'rgba(37, 87, 218, 0.06)',
    blur: 80, scale: 1.0, opacity: 0.7, breathing: true,
  },
  warm: {
    color: 'rgba(255, 200, 130, 0.10)',
    blur: 70, scale: 1.08, opacity: 0.9, breathing: true,
  },
  thinking: {
    color: 'rgba(120, 160, 255, 0.16)',
    blur: 55, scale: 1.18, opacity: 1.0, breathing: true,
  },
  spark: {
    color: 'rgba(255, 230, 120, 0.22)',
    blur: 90, scale: 1.35, opacity: 1.0, breathing: false,
  },
};

export default function Aurora({ mood }: AuroraProps) {
  const reduced = usePocketReducedMotion();
  const preset = AURORA_PRESETS[mood];
  // spark 脉冲计数器：每次 mood 从非 spark → spark 时 +1，配合 AnimatePresence 实现一次性动画
  const [sparkKey, setSparkKey] = useState(0);
  const wasSparkRef = useRef(false);

  useEffect(() => {
    const isSpark = mood === 'spark';
    // 仅在「进入 spark」时递增 key，相同 mood 不重复触发
    if (isSpark && !wasSparkRef.current) {
      setSparkKey((k) => k + 1);
    }
    wasSparkRef.current = isSpark;
  }, [mood]);

  // 持续呼吸（mood ≠ spark）：scale 在 1.0 ↔ 1.05 间缓慢起伏
  const breatheAnimation = !reduced && preset.breathing
    ? { scale: [preset.scale, preset.scale * 1.04, preset.scale] }
    : { scale: preset.scale };

  return (
    <>
      {/* 主光晕：固定层 */}
      <motion.div
        aria-hidden
        className="pb-aurora"
        initial={false}
        animate={{
          background: `radial-gradient(circle at 50% 28%, ${preset.color} 0%, transparent 68%)`,
          filter: `blur(${preset.blur}px)`,
          opacity: preset.opacity,
        }}
        transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
      />

      {/* 呼吸层：仅在非 reduced 且非 spark 时叠加 */}
      {!reduced && preset.breathing && (
        <motion.div
          aria-hidden
          className="pb-aurora pb-aurora--breathe"
          animate={breatheAnimation}
          transition={{
            duration: mood === 'thinking' ? 2.2 : 4.5,
            ease: 'easeInOut',
            repeat: Infinity,
          }}
        />
      )}

      {/* spark 一次性扩散光环：仅 mood=spark 且非 reduced 时渲染，
          用 AnimatePresence + sparkKey 触发一次完整动画后自动卸载（避免 Date.now 当 key 的抖动） */}
      <AnimatePresence>
        {mood === 'spark' && !reduced && (
          <motion.div
            key={sparkKey}
            aria-hidden
            className="pb-aurora pb-aurora--spark"
            initial={{ scale: 0.6, opacity: 0.8 }}
            animate={{ scale: 1.6, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            onAnimationComplete={() => {
              // 动画完成后强制卸载（与 AnimatePresence 协同）
              // 当 mood 切走时，AnimatePresence 触发 exit；这里只在相同 mood 下兜底清理
              if (mood !== 'spark') setSparkKey(0);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}