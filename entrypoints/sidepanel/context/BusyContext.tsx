import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * 忙碌上下文：当前正在执行的动作 key（空串表示空闲）。
 * 取代旧 App.tsx 的 busyAction state；驱动 PocketBuddyAvatar 的 thinking mood 与按钮 disabled。
 */
interface BusyContextValue {
  busyAction: string;
  setBusyAction: (a: string) => void;
}

const BusyContext = createContext<BusyContextValue | null>(null);

export function BusyProvider({ children }: { children: ReactNode }) {
  const [busyAction, setBusyAction] = useState<string>('');
  return (
    <BusyContext.Provider value={{ busyAction, setBusyAction }}>
      {children}
    </BusyContext.Provider>
  );
}

export function useBusy(): BusyContextValue {
  const ctx = useContext(BusyContext);
  if (!ctx) throw new Error('useBusy 必须在 BusyProvider 内使用');
  return ctx;
}
