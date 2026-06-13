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

  return {
    id: crypto.randomUUID(),
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    result,
    imagePrompt: buildMindmapImagePrompt(input.title, input.content),
    createdAt: Date.now(),
  };
}
