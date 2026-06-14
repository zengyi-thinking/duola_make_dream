import { AnimatePresence, motion } from 'framer-motion';
import PocketBuddyAvatar from '@/components/PocketBuddyAvatar/PocketBuddyAvatar';
import type { PocketAvatarId } from '@/lib/brand/avatars';
import { usePocketReducedMotion } from '@/lib/ui/reduced-motion';
import { PB_EASE } from '@/lib/ui/motion-presets';
import './ProcessingStage.css';

/** 发明/喂养主链路的 5 个加工阶段（对应 ContentPipelineStageId） */
const STAGES = [
  { id: 'plan', label: '规划' },
  { id: 'research', label: '调研' },
  { id: 'reflect', label: '反思' },
  { id: 'outline', label: '编排' },
  { id: 'generate', label: '生成' },
] as const;

interface ProcessingStageProps {
  /** 是否处于加工中 */
  active: boolean;
  /** 用哪个头像做 thinking 形象 */
  avatar?: PocketAvatarId;
  /** 加工中文案，缺省「正在加工…」 */
  hint?: string;
}

/**
 * 加工动画层：PocketAgent 链路运行时的可视化。
 * busy 时居中显示 thinking 形象 + 5 阶段标签依次脉冲；非 busy 时不渲染。
 * 复用 PocketBuddyAvatar(mood=thinking) + framer-motion 脉冲；reduced-motion 时静态。
 */
export default function ProcessingStage({ active, avatar = 'yunyu-main', hint }: ProcessingStageProps) {
  const reduced = usePocketReducedMotion();
  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          className="processing-stage"
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: PB_EASE }}
        >
          <PocketBuddyAvatar avatar={avatar} mood="thinking" size={44} useChibiWhenThinking />
          <p className="processing-stage__hint">{hint ?? '正在加工你的想法…'}</p>
          <div className="processing-stage__rail">
            {STAGES.map((s, i) => (
              <motion.span
                key={s.id}
                className="processing-stage__chip"
                animate={reduced ? undefined : { opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.25, ease: 'easeInOut' }}
              >
                {s.label}
              </motion.span>
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
