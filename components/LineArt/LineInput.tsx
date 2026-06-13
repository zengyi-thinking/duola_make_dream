import type { InputHTMLAttributes } from 'react';
import './LineInput.css';

interface LineInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

/**
 * 线条风格输入框
 * 简洁的底部边框样式，搭配圆角
 */
export default function LineInput({
  value,
  onChange,
  className = '',
  ...props
}: LineInputProps) {
  return (
    <input
      className={`line-input ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    />
  );
}
