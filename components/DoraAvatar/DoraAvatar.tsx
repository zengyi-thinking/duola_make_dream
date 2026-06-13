import type { DoraEmotion } from '@/lib/agent/types';
import doraDefault from '@/assets/dora/dora-avatar.svg';
import doraHappy from '@/assets/dora/dora-happy.svg';
import doraThinking from '@/assets/dora/dora-thinking.svg';
import doraSurprised from '@/assets/dora/dora-surprised.svg';
import './DoraAvatar.css';

const EMOTION_MAP: Record<DoraEmotion, string> = {
  default: doraDefault,
  happy: doraHappy,
  thinking: doraThinking,
  surprised: doraSurprised,
};

interface DoraAvatarProps {
  emotion?: DoraEmotion;
  size?: number;
  className?: string;
}

/**
 * 哆啦A梦头像组件
 * 支持四种表情切换：默认、开心、思考、惊讶
 */
export default function DoraAvatar({
  emotion = 'default',
  size = 48,
  className = '',
}: DoraAvatarProps) {
  return (
    <div
      className={`dora-avatar ${className}`}
      style={{ width: size, height: size }}
      data-emotion={emotion}
    >
      <img
        src={EMOTION_MAP[emotion]}
        alt={`哆啦A梦-${emotion}`}
        width={size}
        height={size}
      />
    </div>
  );
}
