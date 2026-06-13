import type { ButtonHTMLAttributes } from 'react';
import './LineButton.css';

interface LineButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
}

/**
 * 线条风格按钮
 * 用 2px 描边 + 圆角实现手绘线条感
 */
export default function LineButton({
  variant = 'primary',
  className = '',
  children,
  ...props
}: LineButtonProps) {
  return (
    <button className={`line-btn line-btn--${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
