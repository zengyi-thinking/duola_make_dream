import type { ReactNode } from 'react';
import { NavigationProvider } from './NavigationContext';
import { ToastProvider } from './ToastContext';
import { BusyProvider } from './BusyContext';
import { MemoryProvider } from './MemoryContext';
import { RuntimeConfigProvider } from './RuntimeConfigContext';
import { WorkspaceProvider } from './WorkspaceContext';

/**
 * App 顶层 Provider 组合。嵌套顺序：Navigation（最外，页面切换不影响其它）
 * → Toast/Busy（UI 状态）→ Memory/RuntimeConfig（数据源）→ Workspace（最内）。
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <NavigationProvider>
      <ToastProvider>
        <BusyProvider>
          <MemoryProvider>
            <RuntimeConfigProvider>
              <WorkspaceProvider>{children}</WorkspaceProvider>
            </RuntimeConfigProvider>
          </MemoryProvider>
        </BusyProvider>
      </ToastProvider>
    </NavigationProvider>
  );
}
