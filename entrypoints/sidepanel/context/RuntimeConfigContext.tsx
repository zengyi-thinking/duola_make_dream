import { createContext, useContext, useState, type ReactNode } from 'react';
import type { RuntimeConfig } from '@/lib/agent/types';
import { getRuntimeConfig } from '@/lib/storage/local';

/**
 * 运行时配置上下文：RuntimeConfig（agentName/avatarId/tone/模型配置档等）。
 * 取代旧 App.tsx 的 runtimeConfig state + refreshConfig。
 */
interface RuntimeConfigContextValue {
  config: RuntimeConfig | null;
  setConfig: (c: RuntimeConfig | null) => void;
  refresh: () => Promise<void>;
}

const RuntimeConfigContext = createContext<RuntimeConfigContextValue | null>(null);

export function RuntimeConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);

  async function refresh() {
    setConfig(await getRuntimeConfig());
  }

  return (
    <RuntimeConfigContext.Provider value={{ config, setConfig, refresh }}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}

export function useRuntimeConfig(): RuntimeConfigContextValue {
  const ctx = useContext(RuntimeConfigContext);
  if (!ctx) throw new Error('useRuntimeConfig 必须在 RuntimeConfigProvider 内使用');
  return ctx;
}
