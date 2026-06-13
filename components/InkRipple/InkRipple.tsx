import { AnimatePresence, motion } from 'framer-motion';
import { useState, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { usePocketReducedMotion } from '@/lib/ui/reduced-motion';
import { PB_EASE } from '@/lib/ui/motion-presets';
import './InkRipple.css';

export interface InkRippleHandle {
  /** 在当前 textarea 光标位置触发一个水波 */
  rippleAtCaret: (textarea: HTMLTextAreaElement) => void;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

interface InkRippleProps {
  /** 触发水波所在的 textarea 的 ref（用于获取 caret 位置） */
  attachRef?: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * InkRipple —— 打字时光标处"墨水扩散"特效。
 *
 * 用法：
 * 1. 给 textarea 加 ref
 * 2. 在 onChange/onKeyDown 中调用 rippleAtCaret(ref.current)
 * 3. 组件用 position: absolute 覆盖在 textarea 容器上方（pointer-events: none）
 *
 * 实现说明：
 * - 通过 mirror div 模拟 textarea 的换行/字号，测量光标像素坐标
 * - 每次 ripple 在 (x, y) 插一个 span，scale + opacity 动画后自动清理
 */
const InkRipple = forwardRef<InkRippleHandle, InkRippleProps>(function InkRipple(
  { attachRef },
  ref,
) {
  const reduced = usePocketReducedMotion();
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idRef = useRef(0);
  const mirrorRef = useRef<HTMLDivElement | null>(null);

  const cleanupRipple = useCallback((id: number) => {
    setRipples((curr) => curr.filter((r) => r.id !== id));
  }, []);

  const computeCaretPosition = useCallback((textarea: HTMLTextAreaElement) => {
    // 复制 textarea 样式到 mirror div，测量 caret 像素位置
    const mirror = mirrorRef.current;
    if (!mirror) return null;

    const styles = window.getComputedStyle(textarea);
    const properties = [
      'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
      'fontSizeAdjust', 'lineHeight', 'fontFamily',
      'textAlign', 'textTransform', 'textIndent', 'textDecoration',
      'letterSpacing', 'wordSpacing', 'whiteSpace', 'wordBreak', 'wordWrap',
    ];
    properties.forEach((prop) => {
      // @ts-expect-error - index access on style
      mirror.style[prop] = styles[prop];
    });

    const text = textarea.value.substring(0, textarea.selectionStart ?? 0); // privacy-check: allow — 仅读取光标前文本长度用于坐标测量，不外传
    mirror.textContent = text;
    const span = document.createElement('span');
    span.textContent = '​';
    mirror.appendChild(span);

    const coords = {
      x: span.offsetLeft - textarea.scrollLeft,
      y: span.offsetTop - textarea.scrollTop,
    };
    return coords;
  }, []);

  useImperativeHandle(ref, () => ({
    rippleAtCaret(textarea: HTMLTextAreaElement) {
      if (reduced) return;
      const pos = computeCaretPosition(textarea);
      if (!pos) return;

      const id = ++idRef.current;
      setRipples((curr) => [...curr, { id, x: pos.x, y: pos.y }]);

      // 800ms 后清理（与动画时长匹配）
      window.setTimeout(() => cleanupRipple(id), 800);
    },
  }), [reduced, computeCaretPosition, cleanupRipple]);

  if (reduced) {
    // reduced 模式下不渲染 mirror div 也不渲染动画
    return null;
  }

  return (
    <>
      {/* 隐藏的 mirror div，用于测量光标像素坐标 */}
      <div
        ref={mirrorRef}
        aria-hidden
        style={{
          position: 'absolute',
          visibility: 'hidden',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          top: 0,
          left: 0,
        }}
      />

      {/* 水波动画层：覆盖在 textarea 容器上，pointer-events: none */}
      <div className="pb-ink-ripple" aria-hidden>
        <AnimatePresence>
          {ripples.map((r) => (
            <motion.span
              key={r.id}
              className="pb-ink-ripple__drop"
              style={{ left: r.x, top: r.y }}
              initial={{ scale: 0, opacity: 0.8 }}
              animate={{ scale: 3.5, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: PB_EASE }}
            />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
});

export default InkRipple;