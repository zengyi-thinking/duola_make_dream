import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';
import type { PocketAvatarId } from '@/lib/brand/avatars';
import type { PocketBuddyMood } from '@/lib/agent/types';
import { usePocketReducedMotion } from '@/lib/ui/reduced-motion';
import { PB_EASE } from '@/lib/ui/motion-presets';
import './ProcessingStage.css';

/** 发明链路 5 个加工阶段（含 mood 与描述）。invent 模式按时序依次激活。 */
interface InventStage {
  id: 'plan' | 'research' | 'reflect' | 'outline' | 'review';
  label: string;
  mood: PocketBuddyMood;
  desc: string;
}
const INVENT_STAGES: InventStage[] = [
  { id: 'plan', label: '规划', mood: 'thinking', desc: '锁定输入与目标' },
  { id: 'research', label: '调研', mood: 'thinking', desc: '召回记忆 + 内置调研' },
  { id: 'reflect', label: '反思', mood: 'warm', desc: '结合自学习补丁' },
  { id: 'outline', label: '编排', mood: 'thinking', desc: '生成计划面板' },
  { id: 'review', label: '审查', mood: 'spark', desc: '校对计划就绪' },
];
const STAGE_DURATION = 1600;

interface ProcessingStageProps {
  /** 是否处于加工中 */
  active: boolean;
  /** 用哪个头像做加工形象 */
  avatar?: PocketAvatarId;
  /** 自定义文案（覆盖阶段描述） */
  hint?: string;
  /** invent = 5 阶段状态机；image = 单阶段进度环（生图专属） */
  mode?: 'invent' | 'image';
}

/**
 * 加工动画层（产品重设计升级版）：
 * - invent 模式：阶段状态机按时序推进（规划→调研→反思→编排→审查），
 *   当前阶段高亮脉冲、已完成打勾、未到置灰；角色 mood 随阶段切换。
 * - image 模式：生图专属，角色 spark mood + 进度环。
 * TODO：后续接 director 真实 AgentEvent 流（port 流式），当前用时序驱动（阶段名与真实 agent 一致）。
 */
export default function ProcessingStage({ active, avatar = 'yunyu-main', hint, mode = 'invent' }: ProcessingStageProps) {
  const reduced = usePocketReducedMotion();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!active) {
      setStage(0);
      return;
    }
    if (mode === 'image') return; // image 模式不推进阶段
    const timers = INVENT_STAGES.map((_, i) =>
      window.setTimeout(() => setStage(i), i * STAGE_DURATION),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [active, mode]);

  const current = INVENT_STAGES[Math.min(stage, INVENT_STAGES.length - 1)];
  const avatarMood: PocketBuddyMood = mode === 'image' ? 'spark' : current.mood;
  const hintText =
    hint ?? (mode === 'image' ? '正在生成计划图…' : `${current.label}：${current.desc}`);

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          className={`processing-stage processing-stage--${mode}`}
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: PB_EASE }}
        >
          <div className="processing-stage__avatar-wrap">
            <motion.div
              animate={reduced ? undefined : { scale: [1, 1.06, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <PocketBuddyAvatar avatar={avatar} mood={avatarMood} size={56} useChibiWhenThinking />
            </motion.div>
            {mode === 'image' ? (
              <motion.div
                className="processing-stage__ring"
                animate={reduced ? undefined : { rotate: 360 }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
              />
            ) : null}
          </div>
          <p className="processing-stage__hint">{hintText}</p>
          {mode === 'invent' ? (
            <div className="processing-stage__rail">
              {INVENT_STAGES.map((s, i) => {
                const done = i < stage;
                const isCurrent = i === stage;
                const stepClass = [
                  'processing-stage__step',
                  done ? 'processing-stage__step--done' : '',
                  isCurrent ? 'processing-stage__step--current' : '',
                ].filter(Boolean).join(' ');
                return (
                  <div key={s.id} className={stepClass}>
                    <span className="processing-stage__step-dot">{done ? '✓' : i + 1}</span>
                    <span className="processing-stage__step-label">{s.label}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
