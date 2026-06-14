import type { ContentPipelineTrace } from '@/lib/agent/types';

export type MindmapNode = {
  id: string;
  label: string;
  children?: MindmapNode[];
};

export type MindmapResult = {
  id: string;
  title: string;
  root: MindmapNode;
  noteId?: string;
  sourceType: 'paper' | 'article' | 'idea';
  createdAt: number;
};

export type MindmapRecord = {
  id: string;
  sourceId: string;
  sourceType: 'paper' | 'article' | 'idea';
  result: MindmapResult;
  imagePrompt?: string;
  pipelineTrace?: ContentPipelineTrace;
  createdAt: number;
};
