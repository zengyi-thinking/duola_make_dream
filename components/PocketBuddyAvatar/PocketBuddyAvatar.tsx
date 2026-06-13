import type { PocketBuddyMood } from '@/lib/agent/types';
import type { PocketAvatarId } from '@/lib/brand/avatars';
import { pocketAvatars } from '@/lib/brand/avatars';
import './PocketBuddyAvatar.css';

interface PocketBuddyAvatarProps {
  mood?: PocketBuddyMood;
  /** 使用哪个头像，默认主形象云屿 */
  avatar?: PocketAvatarId;
  /** 显示尺寸 px */
  size?: number;
  /** 思考时是否切到 chibi 加载动画 */
  useChibiWhenThinking?: boolean;
  className?: string;
}

/**
 * PocketBuddy 头像组件（PNG 版）。
 *
 * 温度感设计：
 * - 主形象显示对应头像
 * - mood 通过 CSS 动画叠加（thinking 摇摆、spark 发光、idle 呼吸）
 * - useChibiWhenThinking：思考时自动切到小口袋云云 + 弹跳加载动画
 */
export default function PocketBuddyAvatar({
  mood = 'warm',
  avatar = 'yunyu-main',
  size = 56,
  useChibiWhenThinking = false,
  className = '',
}: PocketBuddyAvatarProps) {
  // 思考时切到 chibi 做加载动画
  const effectiveAvatar = useChibiWhenThinking && mood === 'thinking' ? 'yunyun-chibi' : avatar;
  const meta = pocketAvatars[effectiveAvatar] ?? pocketAvatars['yunyu-main'];

  return (
    <div
      className={`pocket-buddy-avatar ${className}`}
      data-mood={mood}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img
        className="pocket-buddy-avatar__img"
        src={meta.path}
        alt={meta.name}
        draggable={false}
      />
      {mood === 'thinking' && (
        <span className="pocket-buddy-avatar__dots" aria-hidden="true">
          <span /><span /><span />
        </span>
      )}
    </div>
  );
}
