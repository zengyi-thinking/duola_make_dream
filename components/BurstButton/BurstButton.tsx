import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import LineButton from '@/components/LineArt/LineButton';
import PocketBurst from '@/components/PocketBurst/PocketBurst';

type BurstOnClick = (e: MouseEvent<HTMLButtonElement>) =>
  | void
  | boolean
  | Promise<void | boolean>;

interface BurstButtonProps {
  /** 点击动作：
   *  - 返回 `void` / `Promise<void>` → 总是 burst
   *  - 返回 `boolean` / `Promise<boolean>` → 仅 `true` 时 burst,`false` 静默（用于「成功才庆祝」）
   */
  onClick?: BurstOnClick;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  /** 每次点击爆发的粒子数，默认 12 */
  particleCount?: number;
  children: React.ReactNode;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

/**
 * BurstButton —— 在 LineButton 基础上叠加「点击粒子爆发」反馈。
 *
 * 行为：
 * - onClick 返回 void / Promise<void>：总是 burst（向后兼容）
 * - onClick 返回 boolean / Promise<boolean>：仅 true 时 burst（精确控制）
 * - prefers-reduced-motion 时 PocketBurst 内部已返回 null
 *
 * 用法：替换关键动作的 LineButton（确认归档 / 加工完成 / 归纳成功 等"达成感"动作）
 */
export default function BurstButton({
  onClick,
  variant = 'primary',
  disabled,
  particleCount = 12,
  children,
  className = '',
  type = 'button',
}: BurstButtonProps) {
  const [burst, setBurst] = useState(false);

  const handleClick = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      if (!onClick) return;
      let result: void | boolean;
      try {
        result = await onClick(e);
      } catch {
        // onClick 抛错一律不爆（异常路径不庆祝）
        return;
      }
      // undefined / true → 爆；false → 静默
      if (result === undefined || result === true) {
        setBurst(true);
      }
    },
    [onClick],
  );

  return (
    <span className={`pb-burst-button ${className}`} style={{ position: 'relative', display: 'inline-flex' }}>
      <LineButton
        type={type}
        variant={variant}
        disabled={disabled}
        onClick={handleClick as unknown as React.MouseEventHandler<HTMLButtonElement>}
      >
        {children}
      </LineButton>
      <PocketBurst active={burst} count={particleCount} />
      {/* burst 触发后 750ms 自动关闭（与 PocketBurst 动画时长一致） */}
      {burst ? <AutoOff onDone={() => setBurst(false)} /> : null}
    </span>
  );
}

function AutoOff({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 750);
    return () => window.clearTimeout(t);
  }, [onDone]);
  return null;
}
