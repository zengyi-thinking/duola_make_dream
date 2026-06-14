import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * 导航上下文：五页切换（发明/喂养/记忆/观察/设置）。
 * 取代旧 App.tsx 的 activeTab state + setActiveTab props drilling。
 */
export type AppPage = 'invent' | 'feed' | 'memory' | 'observe' | 'settings';

interface NavigationContextValue {
  page: AppPage;
  setPage: (page: AppPage) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<AppPage>('invent');
  return (
    <NavigationContext.Provider value={{ page, setPage }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation 必须在 NavigationProvider 内使用');
  return ctx;
}
