import { createContext, useContext, useState, type ReactNode } from 'react';
import type { MemorySummary } from '@/lib/agent/types';
import { createMemoryGetMessage, sendRuntimeMessage } from '@/lib/messaging/bus';

/**
 * 记忆上下文：本地 MemorySummary（counts + 各类记录列表）。
 * 取代旧 App.tsx 的 memory state + refreshMemory；任一副作用（生图/归档/反馈）后用 setMemory 更新。
 */
interface MemoryContextValue {
  memory: MemorySummary | null;
  setMemory: (m: MemorySummary | null) => void;
  /** 重新拉取 memory.get；返回原始响应，便于调用方判断 success/error */
  refresh: () => Promise<{ success: boolean; error?: string }>;
}

const MemoryContext = createContext<MemoryContextValue | null>(null);

export function MemoryProvider({ children }: { children: ReactNode }) {
  const [memory, setMemory] = useState<MemorySummary | null>(null);

  async function refresh() {
    const response = await sendRuntimeMessage(createMemoryGetMessage());
    if (response.success) setMemory(response.payload);
    return { success: response.success, error: response.error };
  }

  return (
    <MemoryContext.Provider value={{ memory, setMemory, refresh }}>
      {children}
    </MemoryContext.Provider>
  );
}

export function useMemory(): MemoryContextValue {
  const ctx = useContext(MemoryContext);
  if (!ctx) throw new Error('useMemory 必须在 MemoryProvider 内使用');
  return ctx;
}
