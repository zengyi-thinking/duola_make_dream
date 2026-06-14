import type {
  ContentPipelineKind,
  ContentPipelineStage,
  ContentPipelineStageId,
  ContentPipelineTrace,
} from './types';

export interface BuildPipelineTraceInput {
  kind: ContentPipelineKind;
  title: string;
  summary: string;
  stages: Array<ContentPipelineStage | null | undefined>;
  sourceId?: string;
}

export function createPipelineStage(
  id: ContentPipelineStageId,
  label: string,
  summary: string,
  detail?: string,
  status: ContentPipelineStage['status'] = 'done',
): ContentPipelineStage {
  return {
    id,
    label,
    summary,
    detail,
    status,
  };
}

export function buildPipelineTrace(input: BuildPipelineTraceInput): ContentPipelineTrace {
  return {
    id: crypto.randomUUID(),
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    stages: input.stages.filter((stage): stage is ContentPipelineStage => Boolean(stage)),
    sourceId: input.sourceId,
    createdAt: Date.now(),
  };
}

export function formatPipelineStageLabel(id: ContentPipelineStageId): string {
  switch (id) {
    case 'plan':
      return '规划';
    case 'research':
      return '调研';
    case 'reflect':
      return '反思';
    case 'outline':
      return '信息编排';
    case 'generate':
      return '生成';
  }
}

export function formatPipelineKindLabel(kind: ContentPipelineKind): string {
  switch (kind) {
    case 'idea':
      return '想法';
    case 'page':
      return '网页';
    case 'archive':
      return '归档';
    case 'image':
      return '图片';
    case 'mindmap':
      return '图谱';
  }
}
