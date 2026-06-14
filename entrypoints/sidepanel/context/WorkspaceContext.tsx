import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { ProductArtifact } from '@/lib/agent/types';
import type { GeneratedImageRecord } from '@/lib/image/types';
import { createArtifactListMessage, createImageListMessage, sendRuntimeMessage } from '@/lib/messaging/bus';

/**
 * 工作区上下文：产物历史 + 图片历史。
 * 取代旧 App.tsx 的 artifactHistory/imageHistory 两个 state + refresh。
 * 生成产物/图片后用 setArtifactHistory/setImageHistory 前置插入，避免重复拉取。
 */
interface WorkspaceContextValue {
  artifactHistory: ProductArtifact[];
  imageHistory: GeneratedImageRecord[];
  setArtifactHistory: Dispatch<SetStateAction<ProductArtifact[]>>;
  setImageHistory: Dispatch<SetStateAction<GeneratedImageRecord[]>>;
  refreshArtifacts: () => Promise<void>;
  refreshImages: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [artifactHistory, setArtifactHistory] = useState<ProductArtifact[]>([]);
  const [imageHistory, setImageHistory] = useState<GeneratedImageRecord[]>([]);

  async function refreshArtifacts() {
    const response = await sendRuntimeMessage(createArtifactListMessage());
    if (response.success) setArtifactHistory(response.payload.records);
  }

  async function refreshImages() {
    const response = await sendRuntimeMessage(createImageListMessage());
    if (response.success) setImageHistory(response.payload.records);
  }

  return (
    <WorkspaceContext.Provider
      value={{ artifactHistory, imageHistory, setArtifactHistory, setImageHistory, refreshArtifacts, refreshImages }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace 必须在 WorkspaceProvider 内使用');
  return ctx;
}
