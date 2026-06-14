import { AnimatePresence, motion } from 'framer-motion';
import ProcessingStage3D from '@/components/ProcessingStage3D/ProcessingStage3D';
import type { PocketAvatarId } from '@/lib/brand/avatars';
import type { PocketBuddyMood } from '@/lib/agent/types';
import { usePocketReducedMotion } from '@/lib/ui/reduced-motion';
import { PB_EASE } from '@/lib/ui/motion-presets';
import './ProcessingStage.css';

interface Stage {
  id: string;
  label: string;
  mood: PocketBuddyMood;
  desc: string;
}

const INVENT_STAGES: Stage[] = [
  { id: 'plan', label: '规划', mood: 'thinking', desc: '锁定输入与目标' },
  { id: 'research', label: '调研', mood: 'thinking', desc: '召回记忆 + 内置调研' },
  { id: 'reflect', label: '反思', mood: 'warm', desc: '结合自学习补丁' },
  { id: 'outline', label: '编排', mood: 'thinking', desc: '生成计划面板' },
  { id: 'review', label: '审查', mood: 'spark', desc: '校对计划就绪' },
];

const FEED_STAGES: Stage[] = [
  { id: 'extract', label: '提取', mood: 'thinking', desc: '读取页面正文与结构' },
  { id: 'analyze', label: '分析', mood: 'thinking', desc: 'LLM 结构化分析' },
  { id: 'ready', label: '就绪', mood: 'spark', desc: '报告生成完毕' },
];

interface ProcessingStageProps {
  active: boolean;
  avatar?: PocketAvatarId;
  hint?: string;
  mode?: 'invent' | 'image' | 'feed';
  currentStage?: number;
}

/**
 * 加工动画层（产品重设计 3D 版）：active 时渲染 ProcessingStage3D（three.js 真 3D 场景）。
 * - invent/feed：3D mascot 漂浮 + 粒子 + 阶段标签，currentStage 事件流驱动阶段切换。
 * - image：3D mascot 庆祝旋转 + 进度环。
 * 3D 场景由 ProcessingStage3D 实现；本组件负责 AnimatePresence 进出。
 */
export default function ProcessingStage({ active, avatar = 'yunyu-main', hint, mode = 'invent', currentStage }: ProcessingStageProps) {
  const reduced = usePocketReducedMotion();
  const stages = mode === 'feed' ? FEED_STAGES : INVENT_STAGES;
  const controlled = currentStage !== undefined;
  const stage = controlled ? currentStage! : 0;

  // image 模式无阶段（进度环），用 0
  const imageStages: Stage[] = mode === 'image' ? [] : stages;
  const imageStageIdx = mode === 'image' ? 0 : stage;

  return (
    <AnimatePresence>
      {active ? (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: PB_EASE }}
        >
          <ProcessingStage3D
            active={active}
            avatar={avatar}
            mode={mode}
            stages={imageStages}
            currentStage={imageStageIdx}
            reducedMotion={reduced}
          />
          {hint ? <p className="processing-stage__hint processing-stage__hint--3d">{hint}</p> : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
