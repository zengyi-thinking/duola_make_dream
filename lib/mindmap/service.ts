import { buildPipelineTrace, createPipelineStage } from '@/lib/agent/pipeline';
import type { MindmapRecord, MindmapResult, MindmapNode } from './types';

type GenerateMindmapInput = {
  sourceId: string;
  sourceType: 'paper' | 'article' | 'idea';
  title: string;
  content: string;
  noteId?: string;
};

export function buildMindmapTree(title: string, content: string): MindmapNode {
  const lines = content
    .replace(/\s+/g, ' ')
    .split(/[。.!?；;\n]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);

  const branches = lines.length > 0
    ? lines.map((line) => ({
      id: crypto.randomUUID(),
      label: line.slice(0, 32),
    }))
    : [
      { id: crypto.randomUUID(), label: '核心主题' },
      { id: crypto.randomUUID(), label: '关键观点' },
      { id: crypto.randomUUID(), label: '下一步行动' },
    ];

  return {
    id: crypto.randomUUID(),
    label: title,
    children: [
      {
        id: crypto.randomUUID(),
        label: '主线',
        children: branches.slice(0, 2),
      },
      {
        id: crypto.randomUUID(),
        label: '机会',
        children: branches.slice(2, 4),
      },
      {
        id: crypto.randomUUID(),
        label: '延展',
        children: branches.slice(4, 6),
      },
    ],
  };
}

export function buildMindmapImagePrompt(title: string, content: string): string {
  return [
    'Create a blue-and-white structured knowledge map poster.',
    `Title: ${title}.`,
    `Map content: ${content}.`,
    'Visualize it as a clean node-link mindmap with product-grade clarity and soft pocket-like charm.',
  ].join(' ');
}

export function generateMindmapRecord(input: GenerateMindmapInput): MindmapRecord {
  const result: MindmapResult = {
    id: crypto.randomUUID(),
    title: input.title,
    root: buildMindmapTree(input.title, input.content),
    noteId: input.noteId,
    sourceType: input.sourceType,
    createdAt: Date.now(),
  };
  const pipelineTrace = buildPipelineTrace({
    kind: 'mindmap',
    title: input.title,
    summary: '把来源内容压成节点关系图',
    sourceId: input.noteId ?? input.sourceId,
    stages: [
      createPipelineStage('plan', '规划', '锁定图谱来源', input.sourceType),
      createPipelineStage('research', '调研', '拆分内容为节点线索', input.content.slice(0, 48) || '没有正文内容'),
      createPipelineStage('reflect', '反思', '抽取主线与延展', result.root.children?.length ? `${result.root.children.length} 个分支` : '暂无分支'),
      createPipelineStage('outline', '信息编排', '整理树状结构', result.root.label),
      createPipelineStage('generate', '生成', '输出图谱记录', input.title),
    ],
  });

  return {
    id: crypto.randomUUID(),
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    result,
    imagePrompt: buildMindmapImagePrompt(input.title, input.content),
    pipelineTrace,
    createdAt: Date.now(),
  };
}
