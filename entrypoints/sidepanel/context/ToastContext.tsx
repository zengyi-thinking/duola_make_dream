import { createContext, useContext, useState, type ReactNode } from 'react';
import { POCKET_AGENT_VOICE } from '@/lib/agent/personality';

/**
 * Toast 上下文：统一管理 hero 状态文案、错误条、提示条。
 * 取代旧 App.tsx 的 statusText/errorText/noticeText 三个 state + 大量 setter props。
 */
interface ToastContextValue {
  statusText: string;
  errorText: string;
  noticeText: string;
  setStatusText: (t: string) => void;
  setErrorText: (t: string) => void;
  setNoticeText: (t: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [statusText, setStatusText] = useState<string>(POCKET_AGENT_VOICE.intro);
  const [errorText, setErrorText] = useState<string>('');
  const [noticeText, setNoticeText] = useState<string>('');
  return (
    <ToastContext.Provider
      value={{ statusText, errorText, noticeText, setStatusText, setErrorText, setNoticeText }}
    >
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
}
